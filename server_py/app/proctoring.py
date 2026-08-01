import datetime
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .auth_router import get_current_user, require_roles
from .audit import record_audit_event
from .db import db
from .rate_limit import limiter

router = APIRouter(prefix="/api/proctoring", tags=["proctoring"])


class ProctoringEventRequest(BaseModel):
    attempt_id: str = Field(min_length=1, max_length=128)
    exam_id: str = Field(min_length=1, max_length=128)
    event_type: Literal["camera_check", "snapshot", "violation", "submission"]
    message: Optional[str] = Field(default=None, max_length=2_000)
    snapshot_data: Optional[str] = Field(default=None, max_length=1_500_000)
    typing_speed_wpm: Optional[int] = Field(default=0, ge=0, le=500)


class OverrideSnapshotRequest(BaseModel):
    violation_severity: str


def _severity_for_event(event_type: str, violation_count: int, explicit: Optional[str] = None) -> str:
    if explicit in {"low", "medium", "high", "critical"}:
        return explicit
    if event_type != "violation":
        return "low"
    if violation_count >= 3:
        return "critical"
    if violation_count == 2:
        return "high"
    return "medium"


def _relative_time(started_at: Optional[str], captured_at: Optional[str]) -> str:
    if not started_at or not captured_at:
        return "00:00"
    try:
        start = datetime.datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
        captured = datetime.datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
        seconds = max(0, int((captured - start).total_seconds()))
        return f"{seconds // 60:02d}:{seconds % 60:02d}"
    except Exception:
        return "00:00"


def _latest_event(events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    return events[0] if events else None


async def _assert_attempt_access(attempt_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    attempt_res = await db.from_("attempts").select(
        "*, users:candidate_id(name, email), exams:exam_id(title)"
    ).eq("id", attempt_id).maybeSingle()
    attempt = attempt_res.data
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    role = user.get("role")
    if role == "candidate" and attempt.get("candidate_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if role == "recruiter" and attempt.get("recruiter_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if role not in {"candidate", "recruiter", "admin"}:
        raise HTTPException(status_code=403, detail="Forbidden")
    return attempt


@router.post("/events")
@limiter.limit("120/minute")
async def log_event(
    request: Request,
    req: ProctoringEventRequest,
    user: Dict[str, Any] = Depends(get_current_user),
):
    if user.get("role") != "candidate":
        raise HTTPException(status_code=403, detail="Only candidates can submit proctoring events")
    attempt = await _assert_attempt_access(req.attempt_id, user)
    if attempt.get("exam_id") != req.exam_id:
        raise HTTPException(status_code=400, detail="Attempt does not belong to this exam")

    if req.message == "OVERRIDE_UNLOCK":
        raise HTTPException(status_code=400, detail="Reserved proctoring event message")

    prior_violations = await db.from_("proctoring_snapshots").select("id", count="exact", head=True).eq(
        "attempt_id", req.attempt_id
    ).eq("event_type", "violation")
    violation_count = (prior_violations.count or 0) + 1 if req.event_type == "violation" else 0
    severity = _severity_for_event(req.event_type, violation_count)
    payload = {
        "attempt_id": req.attempt_id,
        "exam_id": req.exam_id,
        "candidate_id": attempt["candidate_id"],
        "event_type": req.event_type,
        "violation_count": violation_count,
        "violation_severity": severity,
        "message": req.message,
        "snapshot_data": req.snapshot_data,
        "typing_speed_wpm": int(req.typing_speed_wpm or 0),
    }

    res = await db.from_("proctoring_snapshots").insert(payload).select().single()
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"event": res.data}


@router.get("/attempt/{attemptId}")
async def get_attempt_events(attemptId: str, user: Dict[str, Any] = Depends(get_current_user)):
    await _assert_attempt_access(attemptId, user)
    events_res = await db.from_("proctoring_snapshots").select("*").eq("attempt_id", attemptId).order("captured_at", ascending=False)
    return {"events": events_res.data or []}


@router.get("/attempts/{attemptId}/timeline")
async def get_attempt_timeline(attemptId: str, user: Dict[str, Any] = Depends(get_current_user)):
    attempt = await _assert_attempt_access(attemptId, user)
    events_res = await db.from_("proctoring_snapshots").select("*").eq("attempt_id", attemptId).order("captured_at", ascending=True)
    timeline = []
    for event in events_res.data or []:
        timeline.append({
            **event,
            "relativeTime": _relative_time(attempt.get("started_at"), event.get("captured_at")),
        })
    return {"timeline": timeline}


@router.get("/exam/{examId}/summary")
async def get_exam_summary(
    examId: str,
    collegeId: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"])),
):
    query = db.from_("attempts").select(
        "*, users:candidate_id(name, email), exams:exam_id(title)"
    ).eq("exam_id", examId)
    if user["role"] == "recruiter":
        query = query.eq("recruiter_id", user["id"])
    attempts = query.order("started_at", ascending=False)
    attempts_res = await attempts
    attempt_rows = attempts_res.data or []

    if collegeId:
        profiles_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        allowed = {row["user_id"] for row in profiles_res.data or []}
        attempt_rows = [attempt for attempt in attempt_rows if attempt.get("candidate_id") in allowed]

    summary = []
    for attempt in attempt_rows:
        events_res = await db.from_("proctoring_snapshots").select("*").eq("attempt_id", attempt["id"]).order("captured_at", ascending=False)
        events = events_res.data or []
        violations = [event for event in events if event.get("event_type") == "violation"]
        latest_violation = violations[0] if violations else None
        candidate = attempt.get("users") or {}
        summary.append({
            "attemptId": attempt["id"],
            "candidateId": attempt.get("candidate_id"),
            "candidateName": candidate.get("name") or "Candidate",
            "candidateEmail": candidate.get("email") or "",
            "status": attempt.get("status"),
            "snapshots": len(events),
            "violations": len(violations),
            "lastViolation": latest_violation.get("message") if latest_violation else None,
            "lastViolationAt": latest_violation.get("captured_at") if latest_violation else None,
        })
    return {"summary": summary}


@router.get("/exam/{examId}/active-monitoring")
async def get_active_monitoring(
    examId: str,
    collegeId: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"])),
):
    query = db.from_("attempts").select(
        "*, users:candidate_id(name, email)"
    ).eq("exam_id", examId).eq("status", "in_progress")
    if user["role"] == "recruiter":
        query = query.eq("recruiter_id", user["id"])
    attempts_res = await query.order("started_at", ascending=False)
    attempt_rows = attempts_res.data or []

    if collegeId:
        profiles_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        allowed = {row["user_id"] for row in profiles_res.data or []}
        attempt_rows = [attempt for attempt in attempt_rows if attempt.get("candidate_id") in allowed]

    active = []
    for attempt in attempt_rows:
        events_res = await db.from_("proctoring_snapshots").select("*").eq("attempt_id", attempt["id"]).order("captured_at", ascending=False)
        events = events_res.data or []
        latest = _latest_event(events)
        latest_override = next((event for event in events if event.get("event_type") == "admin_override"), None)
        violations = [event for event in events if event.get("event_type") == "violation"]
        latest_violation = violations[0] if violations else None
        is_unlocked = latest_override and latest_violation and latest_override.get("captured_at") >= latest_violation.get("captured_at")
        warning_count = 0 if is_unlocked else max([int(event.get("violation_count") or 1) for event in violations], default=0)
        candidate = attempt.get("users") or {}
        active.append({
            "attemptId": attempt["id"],
            "candidateId": attempt.get("candidate_id"),
            "candidateName": candidate.get("name") or "Candidate",
            "candidateEmail": candidate.get("email") or "",
            "startedAt": attempt.get("started_at"),
            "warningCount": warning_count,
            "isLocked": bool(latest and latest.get("event_type") == "violation" and not is_unlocked),
            "lastEvent": latest.get("message") if latest else None,
        })
    return {"attempts": active}


@router.post("/attempt/{attemptId}/override")
async def override_attempt(attemptId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    attempt = await _assert_attempt_access(attemptId, user)
    payload = {
        "attempt_id": attemptId,
        "exam_id": attempt["exam_id"],
        "candidate_id": attempt["candidate_id"],
        "event_type": "admin_override",
        "violation_count": 0,
        "violation_severity": "low",
        "message": "Attempt unlocked by an authorized reviewer",
    }
    res = await db.from_("proctoring_snapshots").insert(payload).select().single()
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    await record_audit_event(actor_id=user["id"], action="PROCTORING_ATTEMPT_OVERRIDE", resource="attempt", resource_id=attemptId, payload={"candidate_id": attempt["candidate_id"]})
    return {"success": True, "event": res.data}


@router.post("/snapshots/{snapshotId}/override")
async def override_snapshot(
    snapshotId: str,
    req: OverrideSnapshotRequest,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"])),
):
    if req.violation_severity not in {"low", "medium", "high", "critical"}:
        raise HTTPException(status_code=400, detail="Invalid severity")

    snapshot_res = await db.from_("proctoring_snapshots").select("*").eq("id", snapshotId).maybeSingle()
    snapshot = snapshot_res.data
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    await _assert_attempt_access(snapshot["attempt_id"], user)

    update_res = await db.from_("proctoring_snapshots").update({
        "violation_severity": req.violation_severity,
    }).eq("id", snapshotId).select().single()
    if update_res.error:
        raise HTTPException(status_code=400, detail=update_res.error.message)
    await record_audit_event(actor_id=user["id"], action="PROCTORING_SNAPSHOT_OVERRIDE", resource="proctoring_snapshot", resource_id=snapshotId, payload={"violation_severity": req.violation_severity})
    return {"snapshot": update_res.data}
