import hashlib
import hmac
import mimetypes
import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .auth_router import get_current_user, require_roles
from .config import JWT_SECRET
from .db import db
from .date_utils import utc_now
from .tpo import get_tpo_college
from .utils import storage_root

router = APIRouter(prefix="/api/assets", tags=["assets"])

# Private uploads (candidate resumes, recruiter offer letters) used to be
# served by a blanket StaticFiles mount at /uploads. They are now only
# reachable through the authenticated endpoints below.

# Signed download URLs are valid for 5 minutes. Signing uses HMAC-SHA256 over
# "<relative path>:<expiry>" keyed with JWT_SECRET. itsdangerous is NOT used
# because it is not in the pinned requirements lock and no new dependency may
# be added — the stdlib hmac/hashlib modules provide the same guarantee.
SIGNED_URL_TTL_SECONDS = 300

PRIVATE_SUBDIRS = ("resumes", "offers")


class SignAssetRequest(BaseModel):
    # The stored asset URL exactly as persisted in the DB,
    # e.g. "/uploads/resumes/1700000000-ab12cd34.pdf".
    path: str


def _sign_asset_path(rel_path: str, exp: int) -> str:
    message = f"{rel_path}:{exp}".encode("utf-8")
    return hmac.new(JWT_SECRET.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _normalize_asset_path(raw: str) -> str:
    """Turn a raw path param into a safe storage-relative path.

    Rejects traversal (".."), null bytes, absolute paths and anything outside
    the known private subdirectories. The result contains only forward
    slashes, so joining it with the storage root stays safe on Windows too.
    """
    rel = (raw or "").replace("\\", "/").strip("/")
    if not rel or "\x00" in rel:
        raise HTTPException(status_code=400, detail="Invalid asset path")
    parts = [p for p in rel.split("/") if p and p != "."]
    if not parts or any(p == ".." for p in parts):
        raise HTTPException(status_code=400, detail="Invalid asset path")
    clean = "/".join(parts)
    if not any(clean == d or clean.startswith(d + "/") for d in PRIVATE_SUBDIRS):
        raise HTTPException(status_code=404, detail="Asset not found")
    return clean


def _resolve_within_storage(rel_path: str) -> str:
    """Resolve a normalized relative path inside the uploads root (no escape)."""
    root = os.path.realpath(storage_root)
    full = os.path.realpath(os.path.join(root, rel_path))
    if full != root and not full.startswith(root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid asset path")
    return full


def _asset_response(rel_path: str) -> FileResponse:
    full = _resolve_within_storage(rel_path)
    if not os.path.isfile(full):
        raise HTTPException(status_code=404, detail="File not found")
    content_type = mimetypes.guess_type(full)[0] or "application/octet-stream"
    # The UI's "View" links open PDFs in a new tab, so PDFs stay inline to
    # preserve that preview behaviour; anything else forces a download.
    disposition = "inline" if content_type == "application/pdf" else "attachment"
    filename = os.path.basename(full)
    return FileResponse(
        full,
        media_type=content_type,
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


async def get_current_user_optional(request: Request) -> Optional[Dict[str, Any]]:
    """Like get_current_user but returns None instead of raising 401.

    The download endpoint accepts either a session cookie or a valid signed
    URL, so absence of a session must not abort the request yet.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def _candidate_resume_row(stored_url: str):
    res = await db.from_("candidate_profiles").select("user_id, college_id").eq("resume_url", stored_url).maybeSingle()
    return res.data


async def _offer_status_row(stored_url: str):
    res = await db.from_("candidate_status").select("candidate_id, job_id").eq("offer_letter_url", stored_url).maybeSingle()
    return res.data


async def _recruiter_can_access_resume(rel_path: str, user: Dict[str, Any]) -> bool:
    """Return whether a recruiter is scoped to the candidate owning a resume."""
    profile = await _candidate_resume_row(f"/uploads/{rel_path}")
    if not profile or not profile.get("user_id"):
        return False

    candidate_id = profile["user_id"]
    jobs_res = await db.from_("jobs").select("id").eq("created_by", user["id"])
    job_ids = [job["id"] for job in (jobs_res.data or []) if job.get("id")]

    if job_ids:
        status_res = await db.from_("candidate_status").select("id").eq("candidate_id", candidate_id).in_("job_id", job_ids).limit(1)
        if status_res.data:
            return True

    attempt_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id).eq("recruiter_id", user["id"]).limit(1)
    return bool(attempt_res.data)


async def _authorize_asset(rel_path: str, user: Dict[str, Any]) -> None:
    """Enforce the same access rules the existing reader endpoints use.

    - resumes: the owning candidate (candidate_profiles.resume_url, gated by
      user_id as in routers/candidate_profile.py); recruiters/admins per
      GET /recruiter/candidates/{id}/resume-analysis; TPOs only for students
      of their own college (tpo.get_readiness_heatmap's college_id scoping).
    - offers: the candidate who received the offer (candidate_status row) and
      the recruiter who created the drive (jobs.created_by, as enforced by
      POST /recruiter/offers/{candidate_id}/{job_id}); admins.
    No existing TPO endpoint reads offer letters, so TPOs are denied there.
    """
    role = user.get("role")
    stored_url = f"/uploads/{rel_path}"

    if role == "candidate":
        if rel_path.startswith("resumes/"):
            profile = await _candidate_resume_row(stored_url)
            if profile and profile.get("user_id") == user["id"]:
                return
            raise HTTPException(status_code=403, detail="Forbidden")
        if rel_path.startswith("offers/"):
            status = await _offer_status_row(stored_url)
            if status and status.get("candidate_id") == user["id"]:
                return
            raise HTTPException(status_code=403, detail="Forbidden")
        raise HTTPException(status_code=404, detail="Asset not found")

    if role in ("recruiter", "admin"):
        if rel_path.startswith("resumes/"):
            if role == "admin" or await _recruiter_can_access_resume(rel_path, user):
                return
            raise HTTPException(status_code=403, detail="Forbidden")
        if rel_path.startswith("offers/"):
            if role == "admin":
                return
            status = await _offer_status_row(stored_url)
            job_id = (status or {}).get("job_id")
            if job_id:
                job_res = await db.from_("jobs").select("created_by").eq("id", job_id).maybeSingle()
                if job_res.data and job_res.data.get("created_by") == user["id"]:
                    return
            raise HTTPException(status_code=403, detail="Forbidden")
        raise HTTPException(status_code=404, detail="Asset not found")

    if role == "tpo":
        if rel_path.startswith("resumes/"):
            # Raises 400 for a TPO not linked to a college, matching tpo.py.
            college_id = await get_tpo_college(user["id"])
            profile = await _candidate_resume_row(stored_url)
            if profile and profile.get("college_id") == college_id:
                return
            raise HTTPException(status_code=403, detail="Forbidden")
        raise HTTPException(status_code=403, detail="Forbidden")

    raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/certificates")
async def get_certificates(user: Dict[str, Any] = Depends(require_roles(["candidate"]))):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select(
        "id, exam_id, score, submitted_at, exams:exam_id(id, title, total_marks, pass_marks)"
    ).eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    attempts = att_res.data or []

    for attempt in attempts:
        exam = attempt.get("exams") or {}
        if float(attempt.get("score") or 0.0) >= float(exam.get("pass_marks") or 0.0):
            await db.from_("certificates").upsert(
                {
                    "candidate_id": candidate_id,
                    "exam_id": attempt["exam_id"],
                    "certificate_url": f"/certificate/{candidate_id}/{attempt['exam_id']}",
                },
                on_conflict="candidate_id,exam_id",
            )

    certs_res = await db.from_("certificates").select(
        "*, exam:exam_id(title, total_marks)"
    ).eq("candidate_id", candidate_id).order("issued_at", ascending=False)
    return {"certificates": certs_res.data or []}


@router.get("/badges")
async def get_badges(user: Dict[str, Any] = Depends(require_roles(["candidate"]))):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select(
        "score, exams:exam_id(total_marks)"
    ).eq("candidate_id", candidate_id).eq("status", "completed")
    completed = att_res.data or []

    best_pct = 0.0
    for attempt in completed:
        exam = attempt.get("exams") or {}
        total_marks = float(exam.get("total_marks") or 100.0)
        pct = (float(attempt.get("score") or 0.0) / total_marks) * 100.0 if total_marks else 0.0
        best_pct = max(best_pct, pct)

    earned = []
    if len(completed) >= 1:
        earned.append({"name": "Assessment Starter", "description": "Completed the first assessment."})
    if len(completed) >= 3:
        earned.append({"name": "Consistent Performer", "description": "Completed three assessments."})
    if best_pct >= 80.0:
        earned.append({"name": "Top Scorer", "description": "Scored 80% or above in an assessment."})

    for badge in earned:
        exist_res = await db.from_("badges").select("id").eq("candidate_id", candidate_id).eq("name", badge["name"]).maybeSingle()
        if not exist_res.data:
            await db.from_("badges").insert({"candidate_id": candidate_id, **badge})

    badges_res = await db.from_("badges").select("*").eq("candidate_id", candidate_id).order("awarded_at", ascending=False)
    return {"badges": badges_res.data or []}


@router.get("/files/{asset_path:path}")
async def download_asset(
    asset_path: str,
    request: Request,
    exp: Optional[int] = None,
    sig: str = "",
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
) -> FileResponse:
    """Authenticated download for private uploaded files.

    Supersedes the removed public /uploads static mount. Access is granted via
    either a valid session (cookie/bearer JWT) checked against the DB rows
    that own the file, or a short-lived signed URL (exp + sig query params)
    minted by POST /api/assets/sign.
    """
    rel_path = _normalize_asset_path(asset_path)

    if exp is not None or sig:
        now = int(time.time())
        if exp is None or not sig or exp < now or not hmac.compare_digest(sig, _sign_asset_path(rel_path, exp)):
            raise HTTPException(status_code=401, detail="Invalid or expired asset signature")
        return _asset_response(rel_path)

    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    await _authorize_asset(rel_path, user)
    return _asset_response(rel_path)


@router.post("/sign")
async def sign_asset(req: SignAssetRequest, user: Dict[str, Any] = Depends(get_current_user)):
    """Mint a short-lived signed download URL for an asset the caller may access.

    Signed-token query param approach (exp + HMAC in the URL itself, verified
    by GET /api/assets/files/{path}) rather than opaque one-time URLs, so the
    resulting link works with plain <a href> navigations and curl alike. The
    React client's normal download links carry the session cookie and do not
    need this endpoint; it exists for non-cookie clients.
    """
    raw = (req.path or "").strip()
    prefix = "/uploads/"
    rel_path = _normalize_asset_path(raw[len(prefix):] if raw.startswith(prefix) else raw)
    await _authorize_asset(rel_path, user)
    exp = int(utc_now().timestamp()) + SIGNED_URL_TTL_SECONDS
    sig = _sign_asset_path(rel_path, exp)
    return {
        "url": f"/api/assets/files/{rel_path}?exp={exp}&sig={sig}",
        "expiresIn": SIGNED_URL_TTL_SECONDS,
    }
