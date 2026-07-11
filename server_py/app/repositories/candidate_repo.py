import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from ..db import db


async def find_public_portfolio(slug: str) -> Optional[Dict[str, Any]]:
    is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", slug, re.IGNORECASE))

    query = db.from_("candidate_profiles").select(
        "id, user_id, photo_url, branch, cgpa, graduation_year, skills, resume_url, "
        "documents_verified, public_portfolio_slug, github_url, linkedin_url, "
        "portfolio_url, bio, projects, semester_grades, user:user_id(name), college:college_id(name, code)"
    )

    if is_uuid:
        query = query.eq("user_id", slug)
    else:
        query = query.eq("public_portfolio_slug", slug)

    res = await query.maybeSingle().execute()
    if res.error:
        raise res.error
    return res.data


async def get_candidate_answers(user_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("answers").select(
        "*, question:question_id(topic), attempt:attempt_id(candidate_id)"
    ).eq("attempt.candidate_id", user_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_completed_interviews(user_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", user_id).eq("status", "completed").execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_coding_submissions(user_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("coding_submissions").select(
        "score, coding_questions(marks), attempt:attempt_id(candidate_id)"
    ).eq("attempt.candidate_id", user_id).eq("status", "tested").execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_applications(user_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("candidate_status").select(
        "id, status, updated_at, job:job_id(title, company_name)"
    ).eq("candidate_id", user_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_user_by_id(user_id: str) -> Dict[str, Any]:
    res = await db.from_("users").select(
        "id, name, email, roll_number, college_id, profile_complete, must_change_password"
    ).eq("id", user_id).single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_profile_by_user_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = await db.from_("candidate_profiles").select(
        "*, college:college_id(id, name, code)"
    ).eq("user_id", user_id).maybeSingle().execute()
    if res.error:
        raise res.error
    return res.data


async def update_profile(user_id: str, profile_data: Any) -> Dict[str, Any]:
    now_str = datetime.now(timezone.utc).isoformat()
    # In python dict update, we copy profile_data and override updated_at
    payload = {**profile_data, "updated_at": now_str}
    res = await db.from_("candidate_profiles").update(payload).eq("user_id", user_id).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def update_user(user_id: str, user_data: Any) -> Dict[str, Any]:
    res = await db.from_("users").update(user_data).eq("id", user_id).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_exam_assignments(user_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("exam_assignments").select(
        "*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, "
        "available_from, available_until, status, shuffle_questions, negative_marking, created_at)"
    ).eq("candidate_id", user_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_attempts_by_exam_ids(user_id: str, exam_ids: List[str]) -> List[Dict[str, Any]]:
    res = await db.from_("attempts").select(
        "id, exam_id, status, score, started_at, submitted_at"
    ).eq("candidate_id", user_id).order("started_at", ascending=False).in_("exam_id", exam_ids).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_leaderboard_attempts(exam_ids: List[str]) -> List[Dict[str, Any]]:
    res = await db.from_("attempts").select(
        "candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)"
    ).eq("status", "completed").in_("exam_id", exam_ids).execute()
    if res.error:
        raise res.error
    return res.data or []
