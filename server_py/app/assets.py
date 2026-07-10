from typing import Any, Dict

from fastapi import APIRouter, Depends

from .auth_router import get_current_user
from .db import db

router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/certificates")
async def get_certificates(user: Dict[str, Any] = Depends(get_current_user)):
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
async def get_badges(user: Dict[str, Any] = Depends(get_current_user)):
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
