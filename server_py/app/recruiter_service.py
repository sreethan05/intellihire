import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional
import httpx

from .config import APP_URL
from .ai import generate_json
from .logger import logger
from .repositories import recruiter_repo
from .utils import (
    deserialize_drive_colleges,
    record_pipeline_stage,
    serialize_drive_colleges,
    send_drive_registered_email,
)
from .validation import get_password_validation_error
from .date_utils import format_date, months_back


def get_drive_college_ids(drive: dict) -> List[str]:
    if drive.get("company_description"):
        parsed = deserialize_drive_colleges(drive["company_description"])
        if parsed.get("college_ids"):
            return parsed["college_ids"]
    return [drive["college_id"]] if drive.get("college_id") else []



async def create_candidate(candidate_data: dict, recruiter_id: str) -> dict:
    name = candidate_data.get("name")
    email = candidate_data.get("email")
    password = candidate_data.get("password")

    password_error = get_password_validation_error(password)
    if password_error:
        raise ValueError(password_error)

    from .utils import hash_password
    password_hash = hash_password(password)

    return await recruiter_repo.create_user({
        "name": name,
        "email": email,
        "password_hash": password_hash,
        "role": "candidate",
        "created_by": recruiter_id,
    })


async def get_candidates_list(page: int, limit: int) -> dict:
    data = await recruiter_repo.get_candidates(page, limit)
    count = await recruiter_repo.get_candidates_count()
    return {"candidates": data or [], "total": count}


async def get_colleges_list() -> dict:
    data = await recruiter_repo.get_colleges()
    return {"colleges": data or []}


async def get_colleges_summary(recruiter_id: str) -> dict:
    colleges = await recruiter_repo.get_colleges()
    jobs = await recruiter_repo.get_recruiter_jobs(recruiter_id)
    profiles = await recruiter_repo.get_candidate_profiles()

    job_ids = [j["id"] for j in jobs]
    pipeline_list = await recruiter_repo.get_candidate_status_by_job_ids(job_ids) if job_ids else []

    attempt_list = await recruiter_repo.get_attempts_by_recruiter(recruiter_id)
    interview_list = await recruiter_repo.get_ai_interviews()

    summary = []
    for college in (colleges or []):
        college_id = college["id"]
        
        # Filter jobs for this college
        college_jobs = []
        for j in jobs:
            if j.get("college_id") == college_id:
                college_jobs.append(j)
            else:
                parsed = deserialize_drive_colleges(j.get("company_description") or "")
                if college_id in parsed.get("college_ids", []):
                    college_jobs.append(j)
                    
        college_profiles = [p for p in profiles if p.get("college_id") == college_id]
        college_candidate_ids = [p["user_id"] for p in college_profiles]
        college_candidate_ids_set = set(college_candidate_ids)

        college_pipeline = [p for p in pipeline_list if p.get("candidate_id") in college_candidate_ids_set]
        college_attempts = [a for a in attempt_list if a.get("candidate_id") in college_candidate_ids_set]
        completed_attempts = [a for a in college_attempts if a.get("status") == "completed"]
        college_interviews = [i for i in interview_list if i.get("candidate_id") in college_candidate_ids_set]

        drives_count = len(college_jobs)
        candidates_count = len(college_profiles)
        registered_count = len(college_pipeline)
        attempts_count = len(college_attempts)
        completed_attempts_count = len(completed_attempts)
        pass_count = len([a for a in completed_attempts if (a.get("score") or 0.0) >= 40])
        offers_count = len([p for p in college_pipeline if p.get("status") == "offered"])
        ai_interviews_count = len(college_interviews)

        average_score = 0.0
        if completed_attempts_count > 0:
            average_score = round(sum(a.get("score") or 0.0 for a in completed_attempts) / completed_attempts_count, 1)

        summary.append({
            "id": college_id,
            "name": college.get("name"),
            "code": college.get("code"),
            "location": college.get("location"),
            "drivesCount": drives_count,
            "candidatesCount": candidates_count,
            "registeredCount": registered_count,
            "attemptsCount": attempts_count,
            "completedAttemptsCount": completed_attempts_count,
            "passCount": pass_count,
            "offersCount": offers_count,
            "aiInterviewsCount": ai_interviews_count,
            "averageScore": average_score,
        })

    return {"colleges": summary}


async def create_drive(drive_data: dict, recruiter_id: str) -> dict:
    title = drive_data.get("title")
    company_name = drive_data.get("company_name")
    company_description = drive_data.get("company_description")
    college_id = drive_data.get("college_id")
    college_ids = drive_data.get("college_ids")
    min_cgpa = drive_data.get("min_cgpa")
    allowed_branches = drive_data.get("allowed_branches")
    required_skills = drive_data.get("required_skills")
    salary_min = drive_data.get("salary_min")
    salary_max = drive_data.get("salary_max")
    drive_date = drive_data.get("drive_date")
    exam_id = drive_data.get("exam_id")
    interview_pass_score = drive_data.get("interview_pass_score")
    interview_duration = drive_data.get("interview_duration")

    actual_college_id = college_id or (college_ids[0] if isinstance(college_ids, list) and college_ids else None) or None
    final_college_ids = college_ids if isinstance(college_ids, list) and college_ids else ([actual_college_id] if actual_college_id else [])

    if not title or not company_name or not actual_college_id or not isinstance(allowed_branches, list) or len(allowed_branches) == 0:
        raise ValueError("Title, company, college, and branches are required")

    final_description = serialize_drive_colleges(company_description or "", final_college_ids)

    drive = await recruiter_repo.insert_job({
        "title": title,
        "company_name": company_name,
        "company_description": final_description,
        "college_id": actual_college_id,
        "min_cgpa": float(min_cgpa or 0.0),
        "allowed_branches": [branch.upper() for branch in allowed_branches],
        "required_skills": required_skills if isinstance(required_skills, list) else [],
        "salary_min": salary_min or None,
        "salary_max": salary_max or None,
        "drive_date": drive_date or None,
        "exam_id": exam_id or None,
        "interview_pass_score": int(interview_pass_score) if interview_pass_score is not None else 60,
        "interview_duration": int(interview_duration) if interview_duration is not None else 15,
        "created_by": recruiter_id,
    })

    eligible = await find_eligible_candidates(drive)
    if eligible:
        # Upsert candidate status
        await recruiter_repo.upsert_candidate_status([
            {
                "job_id": drive["id"],
                "candidate_id": candidate["user_id"],
                "status": "registered"
            } for candidate in eligible
        ])

        # Record stage transition logs
        for candidate in eligible:
            await record_pipeline_stage(
                candidate["user_id"],
                drive["id"],
                "registered",
                "Auto-registered for drive by eligibility criteria",
                recruiter_id
            )

        # Upsert exam assignments if exam_id is set
        if drive.get("exam_id"):
            await recruiter_repo.upsert_exam_assignments([
                {
                    "exam_id": drive["exam_id"],
                    "candidate_id": candidate["user_id"],
                    "assigned_by": recruiter_id,
                    "job_id": drive["id"]
                } for candidate in eligible
            ])

        # Send emails (fire-and-forget in background thread)
        for candidate in eligible:
            user = candidate.get("user") or {}
            if user.get("email"):
                async def notify_candidate():
                    try:
                        await asyncio.to_thread(
                            send_drive_registered_email,
                            user["email"],
                            user.get("name") or "Candidate",
                            title,
                            company_name,
                            APP_URL
                        )
                    except Exception as email_err:
                        logger.error(f"Failed to send drive registration email to user {user.get('id')}: {email_err}")
                asyncio.create_task(notify_candidate())

    parsed_desc = deserialize_drive_colleges(drive["company_description"])
    colleges_list = []
    if final_college_ids:
        colleges_list = await recruiter_repo.get_colleges_by_ids(final_college_ids)

    return {
        "drive": {
            **drive,
            "company_description": parsed_desc["description"],
            "college_ids": parsed_desc["college_ids"],
            "colleges": colleges_list
        },
        "eligibleCount": len(eligible)
    }


async def get_drives_list(recruiter_id: str, page: Optional[int] = None, limit: Optional[int] = None) -> dict:
    res = await recruiter_repo.get_jobs_by_recruiter(recruiter_id, page, limit)
    drives = res.get("jobs") or []
    total = res.get("total") or 0

    all_college_ids_set = set()
    for drive in drives:
        ids = get_drive_college_ids(drive)
        for cid in ids:
            all_college_ids_set.add(cid)
        if drive.get("college_id"):
            all_college_ids_set.add(drive["college_id"])

    all_college_ids = list(all_college_ids_set)
    colleges_map = {}
    if all_college_ids:
        colleges_list = await recruiter_repo.get_colleges_by_ids(all_college_ids)
        for c in colleges_list:
            colleges_map[c["id"]] = c

    enriched_drives = []
    for drive in drives:
        college_ids = get_drive_college_ids(drive)
        colleges = [colleges_map[cid] for cid in college_ids if cid in colleges_map]
        parsed_desc = deserialize_drive_colleges(drive.get("company_description") or "")
        
        fallback_colleges = colleges
        if not fallback_colleges and drive.get("college"):
            # The select contains college:college_id(...)
            fallback_colleges = [drive["college"]]

        enriched_drives.append({
            **drive,
            "company_description": parsed_desc["description"],
            "college_ids": college_ids,
            "colleges": fallback_colleges,
        })

    return {"drives": enriched_drives, "total": total}


async def get_eligible_candidates(drive_id: str, recruiter_id: str) -> dict:
    drive = await recruiter_repo.get_job_by_id_and_recruiter(drive_id, recruiter_id)
    if not drive:
        raise ValueError("Drive not found")
    eligible = await find_eligible_candidates(drive)
    return {"candidates": eligible, "count": len(eligible)}


async def assign_exam(drive_id: str, exam_id: str, recruiter_id: str) -> dict:
    drive = await recruiter_repo.get_job_by_id_and_recruiter(drive_id, recruiter_id)
    if not drive:
        raise ValueError("Drive not found")

    eligible = await find_eligible_candidates(drive)
    await recruiter_repo.update_job(drive["id"], {"exam_id": exam_id})

    data = await recruiter_repo.upsert_exam_assignments([
        {
            "exam_id": exam_id,
            "candidate_id": candidate["user_id"],
            "assigned_by": recruiter_id,
            "job_id": drive["id"]
        } for candidate in eligible
    ])

    return {"message": f"{len(data)} eligible candidate(s) assigned", "assignments": data}


async def get_dashboard_data(recruiter_id: str, college_id: Optional[str] = None) -> dict:
    drives = await recruiter_repo.get_jobs_for_dashboard(recruiter_id)

    drive_list = drives or []
    if college_id:
        filtered_drives = []
        for d in drive_list:
            if d.get("college_id") == college_id:
                filtered_drives.append(d)
            else:
                parsed = deserialize_drive_colleges(d.get("company_description") or "")
                if college_id in parsed.get("college_ids", []):
                    filtered_drives.append(d)
        drive_list = filtered_drives
        
    drive_ids = [d["id"] for d in drive_list]

    profiles = await recruiter_repo.get_candidate_profiles_by_college(college_id)
    college_candidate_user_ids = [p["user_id"] for p in profiles]

    candidates = await recruiter_repo.get_users_for_dashboard(college_candidate_user_ids if college_id else None)
    candidate_list = candidates or []

    pipeline_data = await recruiter_repo.get_candidate_status_for_dashboard(drive_ids, college_candidate_user_ids if college_id else None)
    assignments = await recruiter_repo.get_assignments_for_dashboard(recruiter_id, college_candidate_user_ids if college_id else None)
    attempts = await recruiter_repo.get_attempts_for_dashboard(recruiter_id, college_candidate_user_ids if college_id else None)
    exams = await recruiter_repo.get_exams_by_recruiter(recruiter_id)

    pipeline_list = [{**item, "jobs": True} for item in (pipeline_data or [])]
    exam_list = exams or []
    assignment_list = assignments or []
    attempt_list = attempts or []
    
    completed_attempts = [a for a in attempt_list if a.get("status") == "completed"]
    in_progress_attempts = [a for a in attempt_list if a.get("status") == "in_progress"]
    
    passed_attempts = []
    for attempt in completed_attempts:
        exam = attempt.get("exams") or {}
        if isinstance(exam, list):
            exam = exam[0] if exam else {}
        pass_marks = exam.get("pass_marks") or 0
        if (attempt.get("score") or 0.0) >= pass_marks:
            passed_attempts.append(attempt)

    completion_rate = 0.0
    if assignment_list:
        completion_rate = round((len(completed_attempts) / len(assignment_list)) * 100, 1)

    average_score = 0.0
    if completed_attempts:
        average_score = round(sum(a.get("score") or 0.0 for a in completed_attempts) / len(completed_attempts), 1)

    pass_rate = 0.0
    if completed_attempts:
        pass_rate = round((len(passed_attempts) / len(completed_attempts)) * 100, 1)

    exam_performance = []
    for exam in exam_list:
        exam_id = exam["id"]
        exam_assignments = [a for a in assignment_list if a.get("exam_id") == exam_id]
        exam_attempts = [a for a in attempt_list if a.get("exam_id") == exam_id]
        exam_completed = [a for a in exam_attempts if a.get("status") == "completed"]
        exam_passed = [a for a in exam_completed if (a.get("score") or 0.0) >= exam.get("pass_marks", 0)]

        exam_avg_score = 0.0
        if exam_completed:
            exam_avg_score = round(sum(a.get("score") or 0.0 for a in exam_completed) / len(exam_completed), 1)

        exam_pass_rate = 0.0
        if exam_completed:
            exam_pass_rate = round((len(exam_passed) / len(exam_completed)) * 100, 1)

        exam_performance.append({
            "examId": exam_id,
            "title": exam.get("title"),
            "assignedCount": len(exam_assignments),
            "attemptCount": len(exam_attempts),
            "completedCount": len(exam_completed),
            "averageScore": exam_avg_score,
            "passRate": exam_pass_rate,
        })

    candidate_performance = []
    for candidate in candidate_list:
        cid = candidate["id"]
        candidate_attempts = [a for a in attempt_list if a.get("candidate_id") == cid]
        candidate_completed = [a for a in candidate_attempts if a.get("status") == "completed"]

        candidate_avg_score = 0.0
        if candidate_completed:
            candidate_avg_score = round(sum(a.get("score") or 0.0 for a in candidate_completed) / len(candidate_completed), 1)

        candidate_performance.append({
            "candidateId": cid,
            "name": candidate.get("name"),
            "email": candidate.get("email"),
            "attempts": len(candidate_attempts),
            "completedAttempts": len(candidate_completed),
            "averageScore": candidate_avg_score,
        })

    candidate_performance.sort(key=lambda x: x["averageScore"], reverse=True)
    candidate_performance = candidate_performance[:6]

    trend_months = months_back(6)
    exam_trend = []
    for m in trend_months:
        created_count = 0
        for exam in exam_list:
            created_at = exam.get("created_at") or ""
            if created_at.startswith(m["key"]):
                created_count += 1
                
        conducted_count = 0
        for attempt in completed_attempts:
            submitted_at = attempt.get("submitted_at") or ""
            if submitted_at.startswith(m["key"]):
                conducted_count += 1
                
        exam_trend.append({
            "month": m["label"],
            "created": created_count,
            "conducted": conducted_count,
        })

    sorted_exams = list(exam_list)
    sorted_exams.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    recent_exams_raw = sorted_exams[:6]
    
    recent_exams = []
    for exam in recent_exams_raw:
        exam_id = exam["id"]
        exam_completed_count = len([a for a in completed_attempts if a.get("exam_id") == exam_id])
        exam_active_count = len([a for a in in_progress_attempts if a.get("exam_id") == exam_id])
        status = "Completed" if exam_completed_count > 0 else ("Live" if exam_active_count > 0 else "Upcoming")
        
        tone = "green" if status == "Completed" else ("amber" if status == "Live" else "blue")
        date_val = exam.get("available_from") or exam.get("created_at")
        
        recent_exams.append({
            "id": exam_id,
            "examId": exam_id,
            "title": exam.get("title"),
            "subtitle": format_date(date_val),
            "meta": status,
            "status": status,
            "tone": tone,
            "date": date_val,
        })

    result_summary = {
        "pass": len(passed_attempts),
        "fail": max(0, len(completed_attempts) - len(passed_attempts)),
        "inProgress": len(in_progress_attempts),
    }

    drive_analytics = []
    for drive in drive_list:
        drive_id = drive["id"]
        drive_pipeline = [p for p in pipeline_list if p.get("job_id") == drive_id]
        drive_assignments = [a for a in assignment_list if next((exam for exam in exam_list if exam["id"] == a.get("exam_id")), {}).get("id") == drive.get("exam_id")]
        drive_attempts = [a for a in attempt_list if any(assign.get("candidate_id") == a.get("candidate_id") for assign in drive_assignments)]
        drive_completed = [a for a in drive_attempts if a.get("status") == "completed"]

        drive_analytics.append({
            "driveId": drive_id,
            "label": drive.get("title"),
            "company": drive.get("company_name"),
            "registered": len(drive_pipeline),
            "assigned": len(drive_assignments),
            "attempted": len(drive_attempts),
            "completed": len(drive_completed),
            "offered": len([p for p in drive_pipeline if p.get("status") == "offered"]),
        })

    funnel = [
        {"label": "Registered", "value": len(pipeline_list)},
        {"label": "Assigned", "value": len(assignment_list)},
        {"label": "Exam Taken", "value": len(completed_attempts)},
        {"label": "Passed", "value": len(passed_attempts)},
        {"label": "Shortlisted", "value": len([p for p in pipeline_list if p.get("status") == "shortlisted"])},
        {"label": "Offered", "value": len([p for p in pipeline_list if p.get("status") == "offered"])},
    ]

    branch_analytics_map = {}
    for profile in profiles:
        branch_name = profile.get("branch") or "Unknown"
        if branch_name not in branch_analytics_map:
            branch_analytics_map[branch_name] = {
                "label": branch_name,
                "candidates": 0,
                "averageCgpa": 0.0,
                "verified": 0
            }
        
        branch_analytics_map[branch_name]["candidates"] += 1
        branch_analytics_map[branch_name]["averageCgpa"] += float(profile.get("cgpa") or 0.0)
        branch_analytics_map[branch_name]["verified"] += 1 if profile.get("documents_verified") else 0

    branch_analytics = []
    for branch_name, item in branch_analytics_map.items():
        avg_cgpa = 0.0
        if item["candidates"] > 0:
            avg_cgpa = round(item["averageCgpa"] / item["candidates"], 2)
            
        branch_analytics.append({
            "label": item["label"],
            "candidates": item["candidates"],
            "averageCgpa": avg_cgpa,
            "verified": item["verified"]
        })

    return {
        "stats": {
            "candidates": len(candidate_list),
            "drives": len(drive_list),
            "registered": len(pipeline_list),
            "offers": len([p for p in pipeline_list if p.get("status") == "offered"]),
            "exams": len(exam_list),
            "assignments": len(assignment_list),
            "attempts": len(attempt_list),
            "completedAttempts": len(completed_attempts),
            "inProgressAttempts": len(in_progress_attempts),
            "averageScore": average_score,
            "completionRate": completion_rate,
            "passRate": pass_rate,
        },
        "examPerformance": exam_performance,
        "candidatePerformance": candidate_performance,
        "driveAnalytics": drive_analytics,
        "branchAnalytics": branch_analytics,
        "funnel": funnel,
        "recentAttempts": attempt_list[:12],
        "recentExams": recent_exams,
        "examTrend": exam_trend,
        "resultSummary": result_summary,
    }


async def get_ai_config(drive_id: str, recruiter_id: str) -> dict:
    drive = await recruiter_repo.get_job_by_id_and_recruiter(drive_id, recruiter_id)
    if not drive:
        raise ValueError("Drive not found")
    parsed = deserialize_drive_colleges(drive.get("company_description") or "")
    return {"aiConfig": parsed.get("aiConfig") or {}}


async def save_ai_config(drive_id: str, ai_config: any, recruiter_id: str) -> dict:
    drive = await recruiter_repo.get_job_by_id_and_recruiter(drive_id, recruiter_id)
    if not drive:
        raise ValueError("Drive not found")

    college_ids = get_drive_college_ids(drive)
    parsed = deserialize_drive_colleges(drive.get("company_description") or "")
    updated_description = serialize_drive_colleges(parsed.get("description") or "", college_ids, ai_config)

    updated_drive = await recruiter_repo.update_job(drive["id"], {"company_description": updated_description})
    return {"drive": updated_drive}


async def get_compare_candidates(candidate_ids: List[str]) -> dict:
    results = []
    for cid in candidate_ids:
        user = await recruiter_repo.get_user_by_id(cid)
        profile = await recruiter_repo.get_candidate_profile_by_user_id(cid)
        attempts = await recruiter_repo.get_attempts_by_candidate_id(cid)
        interviews = await recruiter_repo.get_interviews_by_candidate_id(cid)

        avg_exam_score = 0
        if attempts:
            avg_exam_score = round(sum(a.get("score") or 0.0 for a in attempts) / len(attempts))

        avg_comm_score = 0
        avg_tech_score = 0
        if interviews:
            avg_comm_score = round(sum(i.get("communication_score") or 0.0 for i in interviews) / len(interviews))
            avg_tech_score = round(sum(i.get("technical_score") or 0.0 for i in interviews) / len(interviews))

        results.append({
            "candidateId": cid,
            "name": user.get("name") if user else "Candidate",
            "rollNumber": user.get("roll_number") if user else "",
            "branch": profile.get("branch") if profile else "Unknown",
            "cgpa": profile.get("cgpa") if profile else 0.0,
            "skills": profile.get("skills") if profile and profile.get("skills") else [],
            "avgExamScore": avg_exam_score,
            "avgCommScore": avg_comm_score,
            "avgTechScore": avg_tech_score,
            "proctorFlags": 0
        })

    return {"comparison": results}


async def generate_ai_shortlist(criteria: str) -> dict:
    profiles = await recruiter_repo.get_candidate_profiles_for_shortlist()
    if not profiles:
        return {"shortlist": []}

    candidates_summary = []
    for p in profiles:
        user_id = p.get("user_id")
        attempts = await recruiter_repo.get_attempts_by_candidate_id(user_id)
        interviews = await recruiter_repo.get_interviews_by_candidate_id(user_id)

        avg_exam_score = 0
        if attempts:
            avg_exam_score = round(sum(a.get("score") or 0.0 for a in attempts) / len(attempts))

        avg_comm_score = 0
        if interviews:
            avg_comm_score = round(sum(i.get("communication_score") or 0.0 for i in interviews) / len(interviews))

        user_info = p.get("user") or {}
        candidates_summary.append({
            "id": user_id,
            "name": user_info.get("name") or "Unknown",
            "cgpa": p.get("cgpa"),
            "skills": p.get("skills") or [],
            "avgExamScore": avg_exam_score,
            "avgCommScore": avg_comm_score,
            "branch": p.get("branch")
        })

    system_prompt = (
        "You are an AI recruiting assistant. Analyze the candidate pool and select the best matches "
        "according to the recruiter's criteria. Return a JSON object containing a 'shortlist' array."
    )
    user_prompt = (
        f"Recruiter Shortlist Criteria: \"{criteria}\"\n\n"
        f"Candidate Pool:\n{json_serialize(candidates_summary)}\n\n"
        f"Return a JSON object in this format:\n"
        f"{{\n"
        f"  \"shortlist\": [\n"
        f"    {{\n"
        f"      \"candidate_id\": \"UUID\",\n"
        f"      \"name\": \"Candidate Name\",\n"
        f"      \"rank\": 1,\n"
        f"      \"justification\": \"Why selected based on the criteria\"\n"
        f"    }}\n"
        f"  ]\n"
        f"}}\n"
    )

    try:
        result = await generate_json(user_prompt, system_prompt)
        return {"shortlist": result.get("shortlist") or []}
    except Exception as e:
        logger.error(f"Shortlist generation AI call failed: {e}")
        return {"shortlist": []}


def json_serialize(obj: Any) -> str:
    import json
    return json.dumps(obj, indent=2)


async def upload_offer_letter(candidate_id: str, job_id: str, filename: str, recruiter_id: str) -> dict:
    offer_letter_url = f"/uploads/offers/{filename}"

    status = await recruiter_repo.update_candidate_status_by_id(candidate_id, job_id, {
        "status": "offered",
        "offer_letter_url": offer_letter_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    await record_pipeline_stage(
        candidate_id,
        job_id,
        "offered",
        "Offer Letter extended by recruiter",
        recruiter_id
    )

    # Call internal notification service using httpx
    async def send_notify():
        try:
            async with httpx.AsyncClient() as client:
                await client.post("http://127.0.0.1:5000/internal/notify", json={
                    "userId": candidate_id,
                    "payload": {
                        "title": "New Job Offer Extended! 🎉",
                        "body": "You have received a new job offer with an attached letter. Go to your command center to review it.",
                        "type": "offer_received",
                        "metadata": {"jobId": job_id}
                    }
                })
        except Exception as notify_err:
            logger.error(f"Failed to send realtime notification via Python gateway: {notify_err}")

    asyncio.create_task(send_notify())

    await recruiter_repo.insert_activity_log({
        "actor_id": recruiter_id,
        "actor_role": "recruiter",
        "target_user_id": candidate_id,
        "type": "offer_made",
        "title": "Job Offer Extended",
        "description": "A recruiter has extended a job offer with an attached letter.",
        "metadata": {"job_id": job_id, "offer_letter_url": offer_letter_url},
    })

    return {"status": status}


async def find_eligible_candidates(drive: dict) -> List[dict]:
    branches = drive.get("allowed_branches") or []
    college_ids = get_drive_college_ids(drive)
    if not college_ids:
        return []

    return await recruiter_repo.get_candidates_for_eligibility(
        college_ids,
        float(drive.get("min_cgpa") or 0.0),
        [b.upper() for b in branches]
    )
