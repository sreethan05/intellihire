"""
Repository layer for bulk import batches and conflicts.

All DB operations for the bulk import pipeline go through here,
keeping the ingestion logic clean and testable.
"""
import hashlib
import datetime
from typing import Dict, Any, List, Optional, Tuple
from ..db import db, get_connection
from ..logger import logger


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# ── Batch operations ─────────────────────────────────────────────


async def create_batch(
    college_id: str,
    uploaded_by: str,
    filename: str,
    file_bytes: bytes,
) -> Tuple[str, str]:
    """
    Create a bulk_import_batches row and return (batch_id, file_hash).
    Raises ValueError if a file with the same SHA-256 hash was already ingested.
    """
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    file_size = len(file_bytes)

    existing = await db.from_("bulk_import_batches").select("id, upload_status").eq(
        "file_hash_sha256", file_hash
    ).in_("upload_status", ["COMPLETED", "PARTIAL", "PROCESSING"]).maybeSingle()

    if existing and existing.data:
        raise ValueError(
            f"This file has already been ingested (batch ID: {existing.data['id']})"
        )

    res = await db.from_("bulk_import_batches").insert({
        "college_id": college_id,
        "uploaded_by": uploaded_by,
        "original_filename": filename,
        "file_hash_sha256": file_hash,
        "file_size_bytes": file_size,
        "upload_status": "PROCESSING",
        "current_stage": "uploading",
        "processing_started_at": _now_iso(),
    }).select().single()

    if res.error or not res.data:
        raise RuntimeError(
            f"Failed to create batch: {res.error.message if res.error else 'unknown'}"
        )

    return res.data["id"], file_hash


async def update_batch_stage(batch_id: str, stage: str, extra: dict = None):
    """Update the current_stage and optionally other fields on a batch."""
    data = {"current_stage": stage}
    if extra:
        data.update(extra)
    await db.from_("bulk_import_batches").update(data).eq("id", batch_id)


async def complete_batch(
    batch_id: str,
    total_created: int,
    total_updated: int,
    total_conflicts: int,
    total_rows: int,
    total_parsed: int,
    status: str = "COMPLETED",
    error_message: str = None,
):
    """Mark a batch as completed (or partial/failed)."""
    data = {
        "upload_status": status,
        "current_stage": "completed" if status != "FAILED" else "failed",
        "total_created": total_created,
        "total_updated": total_updated,
        "total_conflicts": total_conflicts,
        "total_rows_raw": total_rows,
        "total_records_parsed": total_parsed,
        "processing_completed_at": _now_iso(),
    }
    if error_message:
        data["error_message"] = error_message
    await db.from_("bulk_import_batches").update(data).eq("id", batch_id)


async def fail_batch(batch_id: str, error_message: str):
    """Mark a batch as failed."""
    await db.from_("bulk_import_batches").update({
        "upload_status": "FAILED",
        "current_stage": "failed",
        "error_message": error_message,
        "processing_completed_at": _now_iso(),
    }).eq("id", batch_id)


async def get_batch(batch_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single batch by ID."""
    res = await db.from_("bulk_import_batches").select("*").eq("id", batch_id).maybeSingle()
    return res.data if res and res.data else None


async def list_batches(college_id: str, page: int = 1, limit: int = 20) -> Dict[str, Any]:
    """Paginated list of batches for a college."""
    offset = (page - 1) * limit
    res = await db.from_("bulk_import_batches").select(
        "id, original_filename, upload_status, current_stage, total_rows_raw, "
        "total_created, total_updated, total_conflicts, processing_started_at, "
        "processing_completed_at, created_at"
    ).eq("college_id", college_id).order("created_at", False).range(offset, offset + limit - 1)

    count_res = await db.from_("bulk_import_batches").select(
        "id", count="exact", head=True
    ).eq("college_id", college_id)

    return {
        "items": res.data or [],
        "total": count_res.count or 0,
        "page": page,
        "limit": limit,
    }


# ── Conflict operations ──────────────────────────────────────────


async def stage_conflict(
    batch_id: str,
    college_id: str,
    row_number: int,
    record: Dict[str, Any],
    conflict_type: str,
    conflict_detail: str,
) -> str:
    """
    Insert a conflict row for later admin review.
    Returns the conflict ID.
    """
    res = await db.from_("bulk_import_conflicts").insert({
        "batch_id": batch_id,
        "college_id": college_id,
        "row_number": row_number,
        "roll_number": record.get("roll_number"),
        "email": record.get("email"),
        "name": record.get("name"),
        "raw_data": record,
        "conflict_type": conflict_type,
        "conflict_detail": conflict_detail,
        "resolution_status": "PENDING",
    }).select().single()

    if res.error or not res.data:
        logger.error(f"[BulkImport] Failed to stage conflict: {res.error}")
        return None
    return res.data["id"]


async def list_conflicts(
    batch_id: str,
    resolution_status: str = None,
    page: int = 1,
    limit: int = 50,
) -> Dict[str, Any]:
    """Paginated list of conflicts for a batch, optionally filtered by status."""
    offset = (page - 1) * limit
    query = db.from_("bulk_import_conflicts").select("*").eq("batch_id", batch_id)
    if resolution_status:
        query = query.eq("resolution_status", resolution_status)
    query = query.order("row_number", True).range(offset, offset + limit - 1)
    res = await query

    count_query = db.from_("bulk_import_conflicts").select("id", count="exact", head=True).eq(
        "batch_id", batch_id
    )
    if resolution_status:
        count_query = count_query.eq("resolution_status", resolution_status)
    count_res = await count_query

    return {
        "items": res.data or [],
        "total": count_res.count or 0,
        "page": page,
        "limit": limit,
    }


async def resolve_conflict(
    conflict_id: str,
    resolution: str,
    resolver_id: str,
    college_id: str,
    creator_id: str,
) -> Dict[str, Any]:
    """
    Resolve a conflict: ACCEPT (force-create the student) or REJECT (skip).
    Returns the resolution result dict.
    """
    from ..utils import hash_password

    res = await db.from_("bulk_import_conflicts").select("*").eq("id", conflict_id).maybeSingle()
    if not res or not res.data:
        raise ValueError("Conflict not found")

    conflict = res.data

    if conflict["resolution_status"] != "PENDING":
        raise ValueError(f"Conflict already resolved as {conflict['resolution_status']}")

    if conflict["college_id"] != college_id:
        raise ValueError("Conflict does not belong to your college")

    record = conflict["raw_data"]

    if resolution == "ACCEPT":
        roll = record["roll_number"]
        email = record["email"]
        name = record["name"]

        pwd_plain = roll.lower()
        pwd_hash = hash_password(pwd_plain)

        existing = await db.from_("users").select("*").eq("email", email).limit(1)
        user = existing.data[0] if existing.data else None

        if not user:
            user_res = await db.from_("users").insert({
                "name": name,
                "email": email,
                "roll_number": roll,
                "password_hash": pwd_hash,
                "role": "candidate",
                "college_id": college_id,
                "created_by": creator_id,
                "must_change_password": True,
            }).select().single()

            if user_res.error or not user_res.data:
                raise RuntimeError(f"Failed to create user: {user_res.error}")
            user = user_res.data

        profile_data = {
            "user_id": user["id"],
            "college_id": college_id,
            "roll_number": roll,
            "branch": record.get("branch", "Unknown"),
            "cgpa": record.get("cgpa", 0.0),
            "graduation_year": record.get("graduation_year", 0),
            "phone": record.get("phone"),
            "profile_complete": True,
            "documents_verified": False,
        }

        prof_res = await db.from_("candidate_profiles").insert(profile_data).select().single()
        if prof_res.error:
            raise RuntimeError(f"Failed to create profile: {prof_res.error}")

        await db.from_("users").update({
            "profile_complete": True,
            "must_change_password": True,
        }).eq("id", user["id"])

        await db.from_("bulk_import_conflicts").update({
            "resolution_status": "ACCEPTED",
            "resolved_by": resolver_id,
            "resolved_at": _now_iso(),
            "created_user_id": user["id"],
            "created_profile_id": prof_res.data["id"] if prof_res.data else None,
        }).eq("id", conflict_id)

        return {"status": "ACCEPTED", "user_id": user["id"]}

    elif resolution == "REJECT":
        await db.from_("bulk_import_conflicts").update({
            "resolution_status": "REJECTED",
            "resolved_by": resolver_id,
            "resolved_at": _now_iso(),
        }).eq("id", conflict_id)
        return {"status": "REJECTED"}

    else:
        raise ValueError("Resolution must be 'ACCEPT' or 'REJECT'")


# ── Rollback ─────────────────────────────────────────────────────


async def rollback_batch(batch_id: str, rolled_back_by: str) -> Dict[str, int]:
    """
    Reverse an entire bulk import batch:
    - Delete candidate_profiles created by this batch
    - Delete users created by this batch (that haven't logged in)
    - Mark batch as ROLLED_BACK
    - Mark all conflicts as SKIPPED

    Returns counts: {users_deleted, profiles_deleted, conflicts_skipped}
    """
    batch = await get_batch(batch_id)
    if not batch:
        raise ValueError("Batch not found")

    if batch["upload_status"] == "ROLLED_BACK":
        raise ValueError("Batch already rolled back")

    # Find all conflicts that were ACCEPTED (and have created_user_id)
    conflicts_res = await db.from_("bulk_import_conflicts").select(
        "id, created_user_id, created_profile_id"
    ).eq("batch_id", batch_id).eq("resolution_status", "ACCEPTED")
    accepted = conflicts_res.data or []

    users_deleted = 0
    profiles_deleted = 0

    for c in accepted:
        if c.get("created_profile_id"):
            await db.from_("candidate_profiles").delete().eq("id", c["created_profile_id"])
            profiles_deleted += 1
        if c.get("created_user_id"):
            user_res = await db.from_("users").select("last_login").eq("id", c["created_user_id"]).maybeSingle()
            if user_res and user_res.data and not user_res.data.get("last_login"):
                await db.from_("users").delete().eq("id", c["created_user_id"])
                users_deleted += 1

    if batch.get("processing_started_at"):
        time_filter = batch["processing_started_at"]
        prof_res = await db.from_("candidate_profiles").select("id, user_id").eq(
            "college_id", batch["college_id"]
        ).gte("created_at", time_filter)
        for p in (prof_res.data or []):
            user_res = await db.from_("users").select("id, last_login, created_by").eq("id", p["user_id"]).maybeSingle()
            if user_res and user_res.data:
                u = user_res.data
                if u.get("created_by") == batch.get("uploaded_by") and not u.get("last_login"):
                    await db.from_("candidate_profiles").delete().eq("id", p["id"])
                    profiles_deleted += 1
                    await db.from_("users").delete().eq("id", u["id"])
                    users_deleted += 1

    conflicts_to_skip = await db.from_("bulk_import_conflicts").select("id").eq(
        "batch_id", batch_id
    ).eq("resolution_status", "PENDING")
    conflicts_skipped = len(conflicts_to_skip.data or [])
    if conflicts_to_skip.data:
        for c in conflicts_to_skip.data:
            await db.from_("bulk_import_conflicts").update({
                "resolution_status": "SKIPPED",
                "resolved_by": rolled_back_by,
                "resolved_at": _now_iso(),
            }).eq("id", c["id"])

    await db.from_("bulk_import_batches").update({
        "upload_status": "ROLLED_BACK",
        "current_stage": "rolled_back",
        "processing_completed_at": _now_iso(),
    }).eq("id", batch_id)

    logger.info(
        f"[BulkImport] Rollback batch {batch_id}: "
        f"deleted {users_deleted} users, {profiles_deleted} profiles, "
        f"skipped {conflicts_skipped} conflicts"
    )

    return {
        "users_deleted": users_deleted,
        "profiles_deleted": profiles_deleted,
        "conflicts_skipped": conflicts_skipped,
    }
