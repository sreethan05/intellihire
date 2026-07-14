import asyncio
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from .utils import redis_client, hash_password
from .logger import logger
from .repositories import candidate_repo
from .insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights,
)
from .date_utils import format_date, months_back
from .validation import get_password_validation_error
from .errors import NotFoundError, ValidationError


class Cache:
    @staticmethod
    def get(key: str) -> Optional[Any]:
        if redis_client:
            try:
                data = redis_client.get(key)
                if data:
                    return json.loads(data)
            except Exception:
                pass
        return None

    @staticmethod
    def set(key: str, val: Any, expire_seconds: int = 300) -> None:
        if redis_client:
            try:
                redis_client.set(key, json.dumps(val), ex=expire_seconds)
            except Exception:
                pass

    @staticmethod
    def invalidate_pattern(pattern: str) -> None:
        if redis_client:
            try:
                keys = redis_client.keys(pattern)
                if keys:
                    redis_client.delete(*keys)
            except Exception:
                pass


async def build_public_portfolio(slug: str) -> dict:
    cache_key = f"portfolio:{slug}"
    cached = Cache.get(cache_key)
    if cached:
        return cached

    profile = await candidate_repo.find_public_portfolio(slug)
    if not profile:
        raise NotFoundError("Portfolio not found")

    user_id = profile["user_id"]

    # Parallel retrieval
    mcq_answers, interviews, coding_subs, applications = await asyncio.gather(
        candidate_repo.get_candidate_answers(user_id),
        candidate_repo.get_completed_interviews(user_id),
        candidate_repo.get_coding_submissions(user_id),
        candidate_repo.get_candidate_applications(user_id),
    )

    topic_scores = create_topic_scores()

    if interviews:
        for iv in interviews:
            feed_communication_score(topic_scores, iv.get("communication_score") or 0.0)

    if mcq_answers:
        for ans in mcq_answers:
            is_correct = ans.get("is_correct") or False
            question = ans.get("question") or {}
            feed_mcq_answer(topic_scores, is_correct, question.get("topic"))

    if coding_subs:
        for sub in coding_subs:
            question = sub.get("coding_questions") or {}
            max_marks = question.get("marks") or 10
            feed_coding_submission(topic_scores, sub.get("score") or 0.0, max_marks)

    insights = generate_insights(topic_scores, "Profile")

    result = {
        "profile": profile,
        "applications": applications or [],
        "radarData": insights["radarData"],
        "strengths": insights["strengths"],
        "weaknesses": insights["weaknesses"],
    }

    Cache.set(cache_key, result, 300)
    return result


async def get_profile(user_id: str) -> dict:
    user, profile = await asyncio.gather(
        candidate_repo.get_user_by_id(user_id),
        candidate_repo.get_profile_by_user_id(user_id),
    )
    return {"user": user, "profile": profile}


async def update_profile(user_id: str, body: dict) -> dict:
    phone = body.get("phone")
    skills = body.get("skills")
    domain_preference = body.get("domain_preference")
    github_url = body.get("github_url")
    linkedin_url = body.get("linkedin_url")
    portfolio_url = body.get("portfolio_url")
    bio = body.get("bio")
    photo_url = body.get("photo_url")
    projects = body.get("projects")
    semester_grades = body.get("semester_grades")

    profile_data = {
        "phone": phone or None,
        "skills": skills if isinstance(skills, list) else [],
        "domain_preference": domain_preference or None,
        "github_url": github_url or None,
        "linkedin_url": linkedin_url or None,
        "portfolio_url": portfolio_url or None,
        "bio": bio or None,
        "photo_url": photo_url or None,
        "projects": projects if isinstance(projects, list) else [],
        "semester_grades": semester_grades if isinstance(semester_grades, list) else [],
    }

    updated = await candidate_repo.update_profile(user_id, profile_data)
    if updated:
        Cache.invalidate_pattern("portfolio:*")
    return updated


async def complete_onboarding(user_id: str, body: dict) -> dict:
    password = body.get("password")
    phone = body.get("phone")
    skills = body.get("skills")
    domain_preference = body.get("domain_preference")
    marksheet_url = body.get("marksheet_url")
    resume_url = body.get("resume_url")

    if not password or not phone or not isinstance(skills, list) or len(skills) == 0 or not domain_preference:
        raise ValidationError("Password, phone, skills, and domain preference are required")

    password_error = get_password_validation_error(password)
    if password_error:
        raise ValidationError(password_error)

    password_hash = hash_password(password)

    _, profile = await asyncio.gather(
        candidate_repo.update_user(user_id, {
            "password_hash": password_hash,
            "must_change_password": False,
            "profile_complete": True,
        }),
        candidate_repo.update_profile(user_id, {
            "phone": phone,
            "skills": skills,
            "domain_preference": domain_preference,
            "marksheet_url": marksheet_url or None,
            "resume_url": resume_url or None,
            "profile_complete": True,
        }),
    )

    if profile:
        Cache.invalidate_pattern("portfolio:*")

    return profile


async def get_dashboard_data(candidate_id: str) -> dict:
    assignments = await candidate_repo.get_exam_assignments(candidate_id)
    exam_ids = [a["exam_id"] for a in assignments] if assignments else []

    attempts = await candidate_repo.get_attempts_by_exam_ids(candidate_id, exam_ids) if exam_ids else []

    enriched = []
    for assignment in (assignments or []):
        exam_id = assignment["exam_id"]
        enriched.append({
            **assignment,
            "attempts": [att for att in attempts if att.get("exam_id") == exam_id],
        })

    latest_attempts = []
    for item in enriched:
        if item.get("attempts"):
            latest_attempts.append(item["attempts"][0])

    completed_attempts = [item for item in enriched if item.get("attempts") and item["attempts"][0].get("status") == "completed"]
    in_progress_attempts = [item for item in enriched if item.get("attempts") and item["attempts"][0].get("status") == "in_progress"]
    pending_assignments = [item for item in enriched if not item.get("attempts")]

    performance = []
    for assignment in completed_attempts:
        latest_attempt = assignment["attempts"][0]
        score = latest_attempt.get("score") or 0.0
        exam_info = assignment.get("exam") or {}
        total_marks = exam_info.get("total_marks") or 100.0
        pass_marks = exam_info.get("pass_marks") or 40.0

        percentage = round((score / total_marks) * 100, 1) if total_marks else 0.0
        status = "pass" if score >= pass_marks else "fail"

        performance.append({
            "examId": assignment["exam_id"],
            "title": exam_info.get("title") or "Exam",
            "score": score,
            "totalMarks": total_marks,
            "passMarks": pass_marks,
            "percentage": percentage,
            "submittedAt": latest_attempt.get("submitted_at"),
            "status": status,
        })

    average_score = 0.0
    if performance:
        average_score = round(sum(p["score"] for p in performance) / len(performance), 1)

    best_score = 0.0
    if performance:
        best_score = max(p["score"] for p in performance)

    pass_count = len([p for p in performance if p["status"] == "pass"])

    completion_rate = 0.0
    if enriched:
        completion_rate = round((len(completed_attempts) / len(enriched)) * 100, 1)

    average_percentage = 0.0
    if performance:
        average_percentage = round(sum(p["percentage"] for p in performance) / len(performance), 1)

    bands_config = [
        {"label": "90-100", "min": 90, "max": 101},
        {"label": "75-89", "min": 75, "max": 90},
        {"label": "60-74", "min": 60, "max": 75},
        {"label": "Below 60", "min": 0, "max": 60},
    ]
    
    score_bands = []
    for band in bands_config:
        count = len([p for p in performance if band["min"] <= p["percentage"] < band["max"]])
        score_bands.append({
            "label": band["label"],
            "exams": count,
        })

    sorted_performance = list(performance)
    sorted_performance.sort(key=lambda x: x["percentage"], reverse=True)
    exam_insights = [{
        "label": p["title"],
        "score": p["percentage"],
        "status": p["status"],
    } for p in sorted_performance]

    now_ms = datetime.utcnow().timestamp() * 1000
    upcoming_exams_list = []
    for assignment in pending_assignments:
        exam_info = assignment.get("exam") or {}
        available_from = exam_info.get("available_from") or assignment.get("assigned_at")
        
        opens_at_ms = 0
        if available_from:
            try:
                opens_at_ms = datetime.fromisoformat(str(available_from).replace("Z", "+00:00")).timestamp() * 1000
            except Exception:
                pass
                
        days_left = max(0, int(round((opens_at_ms - now_ms) / 86400000.0)))
        meta = f"{days_left if days_left > 0 else 1} Day{'s' if days_left != 1 else ''} Left" if opens_at_ms > now_ms else "Open Now"
        tone = "violet" if opens_at_ms > now_ms else "green"

        upcoming_exams_list.append({
            "id": assignment.get("id"),
            "examId": assignment["exam_id"],
            "title": exam_info.get("title") or "Exam",
            "subtitle": f"{format_date(available_from)} - {exam_info.get('duration')} min",
            "meta": meta,
            "tone": tone,
            "date": available_from,
        })
        
    upcoming_exams_list.sort(key=lambda x: x["date"] or "")
    upcoming_exams = upcoming_exams_list[:5]

    sorted_results = list(performance)
    sorted_results.sort(key=lambda x: x["submittedAt"] or "", reverse=True)
    recent_results = []
    for r in sorted_results[:5]:
        recent_results.append({
            "id": r["examId"],
            "examId": r["examId"],
            "title": r["title"],
            "subtitle": format_date(r["submittedAt"]),
            "meta": f"{r['percentage']}%",
            "tone": "green" if r["status"] == "pass" else "rose",
            "score": r["score"],
            "percentage": r["percentage"],
            "status": r["status"],
            "date": r["submittedAt"],
        })

    trend_months = months_back(6)
    performance_trend = []
    for month in trend_months:
        month_items = [p for p in performance if p.get("submittedAt") and p["submittedAt"].startswith(month["key"])]
        score_val = 0.0
        if month_items:
            score_val = round(sum(p["percentage"] for p in month_items) / len(month_items), 1)
        performance_trend.append({
            "month": month["label"],
            "score": score_val,
        })

    notifications = []
    for r in recent_results[:3]:
        notifications.append({
            "id": f"result-{r['examId']}",
            "title": f"Your result for {r['title']} has been published.",
            "subtitle": r["subtitle"],
            "tone": r["tone"],
            "date": r["date"],
        })
    for ue in upcoming_exams[:3]:
        notifications.append({
            "id": f"exam-{ue['examId']}",
            "title": f"New exam scheduled: {ue['title']}.",
            "subtitle": ue["subtitle"],
            "tone": "blue",
            "date": ue["date"],
        })
    notifications.sort(key=lambda x: x["date"] or "", reverse=True)
    notifications = notifications[:4]

    leaderboard_attempts = await candidate_repo.get_leaderboard_attempts(exam_ids) if exam_ids else []

    leaderboard_map = {}
    for attempt in (leaderboard_attempts or []):
        cand = attempt.get("users") or {}
        if isinstance(cand, list):
            cand = cand[0] if cand else {}
            
        exam = attempt.get("exams") or {}
        if isinstance(exam, list):
            exam = exam[0] if exam else {}
            
        cid = attempt.get("candidate_id")
        if cid not in leaderboard_map:
            leaderboard_map[cid] = {
                "candidateId": cid,
                "name": cand.get("name") or "Candidate",
                "email": cand.get("email") or "",
                "attempts": 0,
                "totalPercentage": 0.0,
            }
        
        total_marks = float(exam.get("total_marks") or 0.0)
        score_val = float(attempt.get("score") or 0.0)
        pct = (score_val / total_marks) * 100.0 if total_marks > 0 else 0.0
        
        leaderboard_map[cid]["attempts"] += 1
        leaderboard_map[cid]["totalPercentage"] += pct

    leaderboard = []
    for cid, item in leaderboard_map.items():
        avg_pct = round(item["totalPercentage"] / max(1, item["attempts"]), 1)
        leaderboard.append({
            "candidateId": cid,
            "name": item["name"],
            "email": item["email"],
            "attempts": item["attempts"],
            "completedAttempts": item["attempts"],
            "averageScore": avg_pct,
            "averagePercentage": avg_pct,
        })
        
    leaderboard.sort(key=lambda x: x["averagePercentage"], reverse=True)

    candidate_rank_idx = -1
    for idx, item in enumerate(leaderboard):
        if item["candidateId"] == candidate_id:
            candidate_rank_idx = idx
            break
            
    rank = candidate_rank_idx + 1 if candidate_rank_idx >= 0 else (len(leaderboard) or 0)

    return {
        "assignments": enriched,
        "stats": {
            "assigned": len(enriched),
            "completed": len(completed_attempts),
            "inProgress": len(in_progress_attempts),
            "pending": len(pending_assignments),
            "averageScore": average_score,
            "bestScore": best_score,
            "passCount": pass_count,
            "completionRate": completion_rate,
            "averagePercentage": average_percentage,
            "rank": rank,
            "totalRanked": len(leaderboard),
        },
        "performance": performance,
        "latestAttempts": latest_attempts,
        "upcomingExams": upcoming_exams,
        "recentResults": recent_results,
        "performanceTrend": performance_trend,
        "scoreBands": score_bands,
        "examInsights": exam_insights,
        "notifications": notifications,
        "leaderboard": leaderboard[:10],
    }
