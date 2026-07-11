from typing import Any, Dict, List, Optional
from ..db import db


async def get_candidates(page: int, limit: int) -> List[Dict[str, Any]]:
    from_offset = (page - 1) * limit
    to_offset = from_offset + limit - 1
    res = await db.from_("users").select(
        "id, name, email, roll_number, college_id, profile_complete"
    ).eq("role", "candidate").order("created_at", ascending=False).range(from_offset, to_offset).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidates_count() -> int:
    res = await db.from_("users").select("*", count="exact", head=True).eq("role", "candidate").execute()
    if res.error:
        raise res.error
    return res.count or 0


async def get_colleges() -> List[Dict[str, Any]]:
    res = await db.from_("colleges").select("id, name, code, location, created_at").order("name").execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_recruiter_jobs(recruiter_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("jobs").select(
        "id, title, company_name, college_id, company_description, status"
    ).eq("created_by", recruiter_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_profiles() -> List[Dict[str, Any]]:
    res = await db.from_("candidate_profiles").select(
        "user_id, college_id, cgpa, branch, profile_complete, documents_verified"
    ).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_profiles_by_college(college_id: Optional[str] = None) -> List[Dict[str, Any]]:
    query = db.from_("candidate_profiles").select("id, user_id, branch, cgpa, profile_complete, documents_verified, college_id")
    if college_id:
        query = query.eq("college_id", college_id)
    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_status_by_job_ids(job_ids: List[str]) -> List[Dict[str, Any]]:
    res = await db.from_("candidate_status").select("job_id, candidate_id, status").in_("job_id", job_ids).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_attempts_by_recruiter(recruiter_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("attempts").select("id, exam_id, candidate_id, score, status, submitted_at").eq("recruiter_id", recruiter_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_ai_interviews() -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select("id, candidate_id, score, status").execute()
    if res.error:
        raise res.error
    return res.data or []


async def create_user(user_data: Any) -> Dict[str, Any]:
    res = await db.from_("users").insert(user_data).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def insert_job(job_data: Any) -> Dict[str, Any]:
    res = await db.from_("jobs").insert(job_data).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def upsert_candidate_status(status_list: List[Any]) -> None:
    res = await db.from_("candidate_status").upsert(status_list, on_conflict="job_id,candidate_id", ignore_duplicates=True).execute()
    if res.error:
        raise res.error


async def upsert_exam_assignments(assignments: List[Any]) -> List[Dict[str, Any]]:
    res = await db.from_("exam_assignments").upsert(assignments, on_conflict="exam_id,candidate_id", ignore_duplicates=True).select().execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_colleges_by_ids(college_ids: List[str]) -> List[Dict[str, Any]]:
    res = await db.from_("colleges").select("id, name, code, location").in_("id", college_ids).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_jobs_by_recruiter(recruiter_id: str, page: Optional[int] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    query = db.from_("jobs").select(
        "*, college:college_id(id, name, code), exam:exam_id(id, title)", count="exact"
    ).eq("created_by", recruiter_id).order("created_at", ascending=False)

    if page is not None and limit is not None:
        query = query.range((page - 1) * limit, page * limit - 1)

    res = await query.execute()
    if res.error:
        raise res.error
    return {"jobs": res.data or [], "total": res.count or 0}


async def get_jobs_for_dashboard(recruiter_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("jobs").select(
        "id, title, company_name, college_id, min_cgpa, allowed_branches, status, drive_date, exam_id, company_description"
    ).eq("created_by", recruiter_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_job_by_id_and_recruiter(job_id: str, recruiter_id: str) -> Dict[str, Any]:
    res = await db.from_("jobs").select("*").eq("id", job_id).eq("created_by", recruiter_id).single().execute()
    if res.error:
        raise res.error
    return res.data


async def update_job(job_id: str, update_data: Any) -> Dict[str, Any]:
    res = await db.from_("jobs").update(update_data).eq("id", job_id).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_candidates_for_eligibility(college_ids: List[str], min_cgpa: float, branches: List[str]) -> List[Dict[str, Any]]:
    query = db.from_("candidate_profiles").select(
        "*, user:user_id(id, name, email, roll_number, profile_complete)"
    ).in_("college_id", college_ids).gte("cgpa", min_cgpa)

    if branches:
        query = query.in_("branch", branches)

    res = await query.order("cgpa", ascending=False).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_users_for_dashboard(college_candidate_user_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    query = db.from_("users").select("id, name, email, created_at").eq("role", "candidate")
    if college_candidate_user_ids is not None:
        if len(college_candidate_user_ids) > 0:
            query = query.in_("id", college_candidate_user_ids)
        else:
            query = query.eq("id", "00000000-0000-0000-0000-000000000000")
            
    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_status_for_dashboard(drive_ids: List[str], college_candidate_user_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    query = db.from_("candidate_status").select("id, job_id, candidate_id, status")
    if drive_ids:
        query = query.in_("job_id", drive_ids)
    else:
        query = query.in_("job_id", ["00000000-0000-0000-0000-000000000000"])

    if college_candidate_user_ids is not None:
        if len(college_candidate_user_ids) > 0:
            query = query.in_("candidate_id", college_candidate_user_ids)
        else:
            query = query.eq("id", "00000000-0000-0000-0000-000000000000")

    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_assignments_for_dashboard(recruiter_id: str, college_candidate_user_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    query = db.from_("exam_assignments").select("exam_id, candidate_id").eq("assigned_by", recruiter_id)
    if college_candidate_user_ids is not None:
        if len(college_candidate_user_ids) > 0:
            query = query.in_("candidate_id", college_candidate_user_ids)
        else:
            query = query.eq("candidate_id", "00000000-0000-0000-0000-000000000000")

    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_attempts_for_dashboard(recruiter_id: str, college_candidate_user_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    query = db.from_("attempts").select(
        "id, exam_id, candidate_id, status, score, started_at, submitted_at, "
        "exams:exam_id(title, total_marks, pass_marks), users:candidate_id(name, email)"
    ).eq("recruiter_id", recruiter_id).order("started_at", ascending=False)

    if college_candidate_user_ids is not None:
        if len(college_candidate_user_ids) > 0:
            query = query.in_("candidate_id", college_candidate_user_ids)
        else:
            query = query.eq("id", "00000000-0000-0000-0000-000000000000")

    res = await query.execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_exams_by_recruiter(recruiter_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("exams").select(
        "id, title, total_marks, pass_marks, created_at, available_from, available_until"
    ).eq("created_by", recruiter_id).execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_user_by_id(user_id: str) -> Dict[str, Any]:
    res = await db.from_("users").select("id, name, email, roll_number").eq("id", user_id).single().execute()
    if res.error:
        raise res.error
    return res.data


async def get_candidate_profile_by_user_id(user_id: str) -> Optional[Dict[str, Any]]:
    res = await db.from_("candidate_profiles").select("*").eq("user_id", user_id).maybeSingle().execute()
    if res.error:
        raise res.error
    return res.data


async def get_attempts_by_candidate_id(candidate_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("attempts").select("score, status").eq("candidate_id", candidate_id).eq("status", "completed").execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_interviews_by_candidate_id(candidate_id: str) -> List[Dict[str, Any]]:
    res = await db.from_("ai_interviews").select("communication_score, technical_score, speaking_score").eq("candidate_id", candidate_id).eq("status", "completed").execute()
    if res.error:
        raise res.error
    return res.data or []


async def get_candidate_profiles_for_shortlist() -> List[Dict[str, Any]]:
    res = await db.from_("candidate_profiles").select("*, user:user_id(name, email, roll_number)").execute()
    if res.error:
        raise res.error
    return res.data or []


async def update_candidate_status_by_id(candidate_id: str, job_id: str, update_data: Any) -> Dict[str, Any]:
    res = await db.from_("candidate_status").update(update_data).eq("candidate_id", candidate_id).eq("job_id", job_id).select().single().execute()
    if res.error:
        raise res.error
    return res.data


async def insert_activity_log(activity: Any) -> None:
    res = await db.from_("activity_feed").insert(activity).execute()
    if res.error:
        raise res.error
