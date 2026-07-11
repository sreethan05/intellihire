from typing import Any, Dict, List, Optional
from ..db import db


async def get_attempts_by_candidate(candidate_id: str, exam_id: Optional[str] = None) -> List[Dict[str, Any]]:
    query = db.from_("attempts").select(
        "id, exam_id, score, submitted_at, exams:exam_id(id, title, description, total_marks, pass_marks)"
    ).eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)

    if exam_id:
        query = query.eq("exam_id", exam_id)

    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_questions_count() -> int:
    res = await db.from_("questions").select("*", count="exact", head=True).execute()
    if res.error:
        raise res.error
    return res.count or 0


async def get_interview_by_id(interview_id: str) -> Dict[str, Any]:
    res = await db.from_("ai_interviews").select("*, jobs(*)").eq("id", interview_id).single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_job_by_id(job_id: str) -> Optional[Dict[str, Any]]:
    res = await db.from_("jobs").select(
        "id, title, company_name, company_description, required_skills, interview_pass_score"
    ).eq("id", job_id).maybeSingle().execute()
    if res.error:
        raise res.error
    return res.data


async def get_interview_answers(interview_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interview_answers").select("*").eq("interview_id", interview_id).order("created_at", ascending=True).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_pending_interviews(candidate_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select(
        "*, jobs(title, company_name)"
    ).eq("candidate_id", candidate_id).eq("status", "scheduled").order("scheduled_start", ascending=True).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_recruiter_pending_interviews(_recruiter_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select(
        "*, users:candidate_id(id, name, email), jobs:job_id(title)"
    ).in_("status", ["scheduled", "completed"]).order("scheduled_start", ascending=True).execute()
    if res.error:
        raise res.error
    return res.data or []


async def insert_interview(interview: Any) -> Dict[str, Any]:
    res = await db.from_("ai_interviews").insert(interview).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def update_interview(interview_id: str, update_data: Any) -> Dict[str, Any]:
    res = await db.from_("ai_interviews").update(update_data).eq("id", interview_id).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def insert_interview_answer(answer: Any) -> Dict[str, Any]:
    res = await db.from_("ai_interview_answers").insert(answer).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_interviews_by_candidate(candidate_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select(
        "*, jobs(title, company_name)"
    ).eq("candidate_id", candidate_id).order("submitted_at", ascending=False).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_completed_interviews_by_recruiter_jobs(job_ids: List[str]) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select(
        "*, users:candidate_id(id, name, email, roll_number), jobs:job_id(title, company_name)"
    ).eq("status", "completed").in_("job_id", job_ids).order("submitted_at", ascending=False).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_profile(user_id: str) -> Optional[Dict[str, Any]]:
    res = await db.from_("candidate_profiles").select("skills, domain_preference").eq("user_id", user_id).maybeSingle().execute()
    if res.error:
        raise res.error
    return res.data


async def get_interview_summaries(role: str, user_id: str, college_id: Optional[str] = None) -> List[Dict[str, Any]]:
    query = db.from_("ai_interviews").select(
        "*, candidate:candidate_id(id, name, email), job:job_id(title, company_name), exam:exam_id(title)"
    ).order("started_at", ascending=False)

    if role == "recruiter":
        # 1. Fetch exam IDs created by this recruiter
        exams_res = await db.from_("exams").select("id").eq("created_by", user_id).execute()
        exam_ids = [e["id"] for e in (exams_res.data or [])]

        # 2. Fetch job IDs created by this recruiter
        jobs_res = await db.from_("jobs").select("id").eq("created_by", user_id).execute()
        job_ids = [j["id"] for j in (jobs_res.data or [])]

        if not exam_ids and not job_ids:
            return []

        conditions = []
        if exam_ids:
            conditions.append(f"exam_id.in.({','.join(exam_ids)})")
        if job_ids:
            conditions.append(f"job_id.in.({','.join(job_ids)})")

        query = query.or_(",".join(conditions))

    if college_id:
        profiles_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", college_id).execute()
        user_ids = [p["user_id"] for p in (profiles_res.data or [])]
        if not user_ids:
            return []
        query = query.in_("candidate_id", user_ids)

    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []
