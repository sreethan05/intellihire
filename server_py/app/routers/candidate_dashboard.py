import datetime
import re
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..rate_limit import limiter

from ..auth_router import get_current_user
from ..db import db
from ..utils import record_pipeline_stage
from ..insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights
)

router = APIRouter(prefix="/api/candidate", tags=["candidate_dashboard"])

class RespondOfferRequest(BaseModel):
    response: str  # accept, decline, negotiate
    notes: Optional[str] = None

@router.get("/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    
    assign_res = await db.from_("exam_assignments").select("*, exam:exam_id(id, title, description, duration, total_marks, pass_marks, available_from, available_until, status, shuffle_questions, negative_marking, created_at)").eq("candidate_id", uid)
    assignments = assign_res.data or []
    exam_ids = [a["exam_id"] for a in assignments if a.get("exam_id")]
    
    attempts = []
    if exam_ids:
        att_res = await db.from_("attempts").select("id, exam_id, status, score, started_at, submitted_at").eq("candidate_id", uid).in_("exam_id", exam_ids).order("started_at", ascending=False)
        attempts = att_res.data or []
        
    enriched = []
    for assign in assignments:
        assign_attempts = [att for att in attempts if att["exam_id"] == assign["exam_id"]]
        enriched.append({
            **assign,
            "attempts": assign_attempts
        })
        
    latest_attempts = [e["attempts"][0] for e in enriched if e.get("attempts")]
    
    completed_attempts = [e for e in enriched if e.get("attempts") and e["attempts"][0]["status"] == "completed"]
    in_progress_attempts = [e for e in enriched if e.get("attempts") and e["attempts"][0]["status"] == "in_progress"]
    pending_assignments = [e for e in enriched if not e.get("attempts")]
    
    performance = []
    for assign in completed_attempts:
        lat = assign["attempts"][0]
        score = float(lat.get("score") or 0.0)
        tot = float(assign["exam"]["total_marks"] or 100.0)
        pass_m = float(assign["exam"]["pass_marks"] or 0.0)
        pct = round((score / tot) * 100, 1) if tot else 0.0
        
        performance.append({
            "examId": assign["exam_id"],
            "title": assign["exam"]["title"],
            "score": score,
            "totalMarks": tot,
            "passMarks": pass_m,
            "percentage": pct,
            "submittedAt": lat.get("submitted_at"),
            "status": "pass" if score >= pass_m else "fail"
        })
        
    avg_score = round(sum(p["score"] for p in performance) / len(performance), 1) if performance else 0.0
    best_score = max(p["score"] for p in performance) if performance else 0.0
    pass_cnt = sum(1 for p in performance if p["status"] == "pass")
    compl_rate = round((len(completed_attempts) / len(enriched)) * 100, 1) if enriched else 0.0
    avg_pct = round(sum(p["percentage"] for p in performance) / len(performance), 1) if performance else 0.0
    
    bands = [
        {"label": "90-100", "min": 90, "max": 101},
        {"label": "75-89", "min": 75, "max": 90},
        {"label": "60-74", "min": 60, "max": 75},
        {"label": "Below 60", "min": 0, "max": 60}
    ]
    score_bands = []
    for b in bands:
        cnt = sum(1 for p in performance if b["min"] <= p["percentage"] < b["max"])
        score_bands.append({"label": b["label"], "exams": cnt})
        
    exam_insights = [{"label": p["title"], "score": p["percentage"], "status": p["status"]} for p in sorted(performance, key=lambda x: x["percentage"], reverse=True)]
    
    now_ms = datetime.datetime.utcnow().timestamp() * 1000
    upcoming_exams = []
    for assign in pending_assignments:
        avail = assign["exam"].get("available_from") or assign.get("assigned_at")
        opens_at = datetime.datetime.fromisoformat(avail.replace("Z", "+00:00")).timestamp() * 1000 if avail else now_ms
        days_left = max(0, int((opens_at - now_ms) / 86400000))
        meta = f"{days_left or 1} Day{'s' if days_left != 1 else ''} Left" if opens_at > now_ms else "Open Now"
        
        upcoming_exams.append({
            "id": assign["id"],
            "examId": assign["exam_id"],
            "title": assign["exam"]["title"],
            "subtitle": f"{avail[:10]} - {assign['exam'].get('duration')} min",
            "meta": meta,
            "tone": "violet" if opens_at > now_ms else "green",
            "date": avail
        })
    upcoming_exams.sort(key=lambda x: x["date"] or "")
    upcoming_exams = upcoming_exams[:5]
    
    recent_results = []
    for p in sorted(performance, key=lambda x: x["submittedAt"] or "", reverse=True)[:5]:
        recent_results.append({
            "id": p["examId"],
            "examId": p["examId"],
            "title": p["title"],
            "subtitle": p["submittedAt"][:10] if p["submittedAt"] else "",
            "meta": f"{p['percentage']}%",
            "tone": "green" if p["status"] == "pass" else "rose",
            "score": p["score"],
            "percentage": p["percentage"],
            "status": p["status"],
            "date": p["submittedAt"]
        })
        
    notifications = []
    for r in recent_results[:3]:
        notifications.append({
            "id": f"result-{r['examId']}",
            "title": f"Your result for {r['title']} has been published.",
            "subtitle": r["subtitle"],
            "tone": r["tone"],
            "date": r["date"]
        })
    for u in upcoming_exams[:3]:
        notifications.append({
            "id": f"exam-{u['examId']}",
            "title": f"New exam scheduled: {u['title']}.",
            "subtitle": u["subtitle"],
            "tone": "blue",
            "date": u["date"]
        })
    notifications.sort(key=lambda x: x["date"] or "", reverse=True)
    notifications = notifications[:4]
    
    leaderboard = []
    if exam_ids:
        lead_res = await db.from_("attempts").select("candidate_id, score, status, submitted_at, users:candidate_id(id, name, email), exams:exam_id(total_marks)").eq("status", "completed").in_("exam_id", exam_ids)
        leaderboard_attempts = lead_res.data or []
        
        lead_map = {}
        for att in leaderboard_attempts:
            cand = att.get("users") or {}
            exam = att.get("exams") or {}
            cid = att.get("candidate_id")
            if cid:
                if cid not in lead_map:
                    lead_map[cid] = {"candidateId": cid, "name": cand.get("name") or "Candidate", "email": cand.get("email") or "", "attempts": 0, "totalPercentage": 0.0}
                tot = float(exam.get("total_marks") or 100.0)
                lead_map[cid]["attempts"] += 1
                lead_map[cid]["totalPercentage"] += (float(att.get("score") or 0.0) / tot) * 100 if tot else 0.0
                
        for k, item in lead_map.items():
            avg_p = round(item["totalPercentage"] / max(1, item["attempts"]), 1)
            leaderboard.append({
                "candidateId": item["candidateId"],
                "name": item["name"],
                "email": item["email"],
                "attempts": item["attempts"],
                "completedAttempts": item["attempts"],
                "averageScore": avg_p,
                "averagePercentage": avg_p
            })
        leaderboard.sort(key=lambda x: x["averagePercentage"], reverse=True)
        
    cand_rank = 0
    for idx, item in enumerate(leaderboard):
        if item["candidateId"] == uid:
            cand_rank = idx + 1
            break
    if cand_rank == 0 and leaderboard:
        cand_rank = len(leaderboard)
        
    return {
        "assignments": enriched,
        "stats": {
            "assigned": len(enriched),
            "completed": len(completed_attempts),
            "inProgress": len(in_progress_attempts),
            "pending": len(pending_assignments),
            "averageScore": avg_score,
            "bestScore": best_score,
            "passCount": pass_cnt,
            "completionRate": compl_rate,
            "averagePercentage": avg_pct,
            "rank": cand_rank,
            "totalRanked": len(leaderboard)
        },
        "performance": performance,
        "latestAttempts": latest_attempts,
        "upcomingExams": upcoming_exams,
        "recentResults": recent_results,
        "performanceTrend": [],  # Optional fallback
        "scoreBands": score_bands,
        "examInsights": exam_insights,
        "notifications": notifications,
        "leaderboard": leaderboard[:10]
    }

@router.post("/offers/{jobId}/respond")
async def respond_offer(jobId: str, req: RespondOfferRequest, user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    resp = req.response
    notes = req.notes or ""
    
    up_fields = {"recruiter_notes": notes}
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    
    if resp == "accept":
        up_fields["offer_accepted_at"] = now_str
    elif resp == "decline":
        up_fields["offer_declined_at"] = now_str
    else:
        up_fields["status"] = "on_hold"
        
    up_res = await db.from_("candidate_status").update(up_fields).eq("candidate_id", uid).eq("job_id", jobId).select().single()
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to update offer response")
        
    stage = "offered" if resp == "accept" else "rejected" if resp == "decline" else "on_hold"
    notes_txt = "Offer accepted by candidate" if resp == "accept" else "Offer declined by candidate" if resp == "decline" else "Negotiation requested by candidate"
    
    await record_pipeline_stage(uid, jobId, stage, notes_txt, uid)
    
    await db.from_("activity_feed").insert({
        "actor_id": uid,
        "actor_role": "candidate",
        "target_user_id": uid,
        "type": f"offer_{resp}",
        "title": f"Offer {'Accepted' if resp == 'accept' else 'Declined' if resp == 'decline' else 'Negotiation Initiated'}",
        "description": f"Candidate responded with {resp.upper()} to the job offer."
    })
    
    return {"message": f"Successfully responded to the offer with: {resp}", "status": up_res.data}

@router.get("/activity")
async def get_activity(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("activity_feed").select("*, actor:actor_id(name)").eq("target_user_id", user["id"]).order("created_at", ascending=False).limit(20)
    feed = []
    for a in (res.data or []):
        feed.append({
            "id": a["id"],
            "type": a["type"],
            "title": a["title"],
            "description": a["description"],
            "actorName": (a.get("actor") or {}).get("name"),
            "actorRole": a["actor_role"],
            "metadata": a.get("metadata"),
            "createdAt": a["created_at"]
        })
    return {"feed": feed}

@router.get("/offers")
async def get_offers(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("candidate_status").select("*, job:job_id(title, company_name, salary_min, salary_max)").eq("candidate_id", user["id"]).eq("status", "offered").is_("offer_accepted_at", None).is_("offer_declined_at", None).order("updated_at", ascending=False)
    return {"offers": res.data or []}

@router.get("/job-pipeline")
async def get_job_pipeline(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    res = await db.from_("candidate_status").select("*, job:job_id(title, company_name, drive_date)").eq("candidate_id", candidate_id).order("updated_at", ascending=False)
    statuses = res.data or []
    
    pipeline = []
    for s in statuses:
        job = s.get("job") or {}
        pipeline.append({
            "jobId": s.get("job_id"),
            "jobTitle": job.get("title") or "Unknown",
            "companyName": job.get("company_name") or "Unknown",
            "status": s.get("status"),
            "updatedAt": s.get("updated_at"),
            "recruiterNotes": s.get("recruiter_notes") or ""
        })
        
    stages = ["registered", "exam_taken", "passed", "shortlisted", "on_hold", "offered", "rejected"]
    return {"pipeline": pipeline, "stages": stages}

@router.get("/portfolio/{slug}")
@limiter.limit("30/minute")
async def get_portfolio(slug: str, request: Request):
    is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", slug, re.IGNORECASE))
    
    query = db.from_("candidate_profiles").select("id, user_id, photo_url, branch, cgpa, graduation_year, skills, resume_url, documents_verified, public_portfolio_slug, github_url, linkedin_url, portfolio_url, bio, projects, semester_grades, user:user_id(name), college:college_id(name, code)")
    if is_uuid:
        query = query.eq("user_id", slug)
    else:
        query = query.eq("public_portfolio_slug", slug)
        
    profile_res = await query.maybeSingle()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    profile = profile_res.data
    user_id = profile["user_id"]
    
    # Compile portfolio radar data
    ans_res = await db.from_("answers").select("*, question:question_id(topic), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", user_id)
    mcq_answers = ans_res.data or []
    
    ivs_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", user_id).eq("status", "completed")
    interviews = ivs_res.data or []
    
    coding_res = await db.from_("coding_submissions").select("score, coding_questions(marks), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", user_id).eq("status", "tested")
    coding_subs = coding_res.data or []
    
    topic_scores = create_topic_scores()
    for iv in interviews:
        feed_communication_score(topic_scores, iv.get("communication_score") or 0)
    for ans in mcq_answers:
        q = ans.get("question") or {}
        feed_mcq_answer(topic_scores, bool(ans.get("is_correct")), q.get("topic"))
    for sub in coding_subs:
        q = sub.get("coding_questions") or {}
        max_m = float(q.get("marks") or 10.0)
        feed_coding_submission(topic_scores, float(sub.get("score") or 0.0), max_m)
        
    insights = generate_insights(topic_scores, "Profile")
    
    apps_res = await db.from_("candidate_status").select("id, status, updated_at, job:job_id(title, company_name)").eq("candidate_id", user_id)
    applications = apps_res.data or []
    
    return {
        "profile": profile,
        "applications": applications,
        "radarData": insights["radarData"],
        "strengths": insights["strengths"],
        "weaknesses": insights["weaknesses"]
    }


class SavePracticeRequest(BaseModel):
    problem_title: str
    language: str
    code: str
    passed: bool
    execution_time_ms: Optional[int] = None

@router.post("/practice/save")
async def save_practice_attempt(
    req: SavePracticeRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Save a practice sandbox attempt for tracking candidate progress."""
    res = await db.from_("action_items").insert({
        "user_id": user["id"],
        "role": "candidate",
        "type": "practice_attempt",
        "title": req.problem_title,
        "description": f"Language: {req.language} | Passed: {req.passed} | Time: {req.execution_time_ms or 0}ms",
        "priority": "normal" if req.passed else "high",
        "entity_type": "practice",
        "metadata": {
            "language": req.language,
            "passed": req.passed,
            "execution_time_ms": req.execution_time_ms,
            "code_length": len(req.code),
        }
    }).select().single()
    return {"message": "Practice attempt saved", "item": res.data}

@router.get("/practice/history")
async def get_practice_history(
    user: Dict[str, Any] = Depends(get_current_user)
):
    """Fetch practice sandbox history for the candidate."""
    res = await db.from_("action_items").select("*").eq("user_id", user["id"]).eq("type", "practice_attempt").order("created_at", ascending=False)
    items = res.data or []
    total = len(items)
    passed = sum(1 for i in items if "Passed: True" in (i.get("description") or ""))
    languages = {}
    for item in items:
        meta = item.get("metadata") or {}
        lang = meta.get("language", "unknown")
        if lang not in languages:
            languages[lang] = {"total": 0, "passed": 0}
        languages[lang]["total"] += 1
        if meta.get("passed"):
            languages[lang]["passed"] += 1
    return {
        "totalAttempts": total,
        "totalPassed": passed,
        "successRate": round((passed / total) * 100) if total > 0 else 0,
        "languages": languages,
        "history": items[:20],
    }


# ============================================================
# Badge / Gamification System
# ============================================================

BADGE_DEFINITIONS = [
    {"name": "First Exam Passed", "description": "Successfully passed your first exam", "icon": "🎯",
     "condition": lambda stats: stats["exams_passed"] >= 1},
    {"name": "Top 10% Score", "description": "Achieved a top 10% score on any exam", "icon": "🏆",
     "condition": lambda stats: stats["top_10_percent"]},
    {"name": "Perfect Coding Round", "description": "Passed all test cases on a coding question", "icon": "💻",
     "condition": lambda stats: stats["perfect_coding"]},
    {"name": "5 Exams Completed", "description": "Completed 5 exams total", "icon": "📚",
     "condition": lambda stats: stats["exams_completed"] >= 5},
    {"name": "Proctoring Pro", "description": "Completed an exam with zero violations", "icon": "🛡️",
     "condition": lambda stats: stats["clean_exam"]},
    {"name": "Interview Star", "description": "Scored 80+ on an AI interview", "icon": "⭐",
     "condition": lambda stats: stats["best_interview"] >= 80},
    {"name": "Streak Master", "description": "Maintained a 7-day practice streak", "icon": "🔥",
     "condition": lambda stats: stats["max_streak"] >= 7},
    {"name": "Speed Coder", "description": "Solved a coding problem in under 5 minutes", "icon": "⚡",
     "condition": lambda stats: stats["fastest_solve"]},
]


async def compute_candidate_stats(user_id: str) -> dict:
    """Compute candidate statistics for badge evaluation."""
    att_res = await db.from_("attempts").select("score, status, exams:exam_id(total_marks, pass_marks)").eq("candidate_id", user_id)
    attempts = att_res.data or []
    exams_completed = len(attempts)
    exams_passed = sum(1 for a in attempts if float(a.get("score") or 0) >= float((a.get("exams") or {}).get("pass_marks") or 0))

    # Top 10% check
    top_10_percent = False
    if attempts:
        for a in attempts:
            exam_id = a.get("exam_id")
            if not exam_id:
                continue
            all_res = await db.from_("attempts").select("score").eq("exam_id", str(exam_id)).order("score", ascending=False)
            all_scores = [float(r.get("score") or 0) for r in (all_res.data or [])]
            if all_scores and a.get("score"):
                rank = sum(1 for s in all_scores if s > float(a["score"]))
                percentile = (1 - rank / len(all_scores)) * 100 if all_scores else 0
                if percentile >= 90:
                    top_10_percent = True
                    break

    # Perfect coding submission
    perfect_coding = False
    for a in attempts:
        cs_res = await db.from_("coding_submissions").select("score, status, coding_questions:coding_question_id(marks)").eq("attempt_id", a["id"])
        for sub in (cs_res.data or []):
            q = sub.get("coding_questions") or {}
            max_marks = float(q.get("marks") or 10)
            if float(sub.get("score") or 0) >= max_marks:
                perfect_coding = True

    # Clean exam (zero violations)
    clean_exam = False
    proc_res = await db.from_("proctoring_snapshots").select("attempt_id, event_type").eq("candidate_id", user_id).eq("event_type", "violation")
    violation_attempts = set(p.get("attempt_id") for p in (proc_res.data or []))
    for a in attempts:
        if a["id"] not in violation_attempts and a.get("status") == "completed":
            clean_exam = True
            break

    # Interview score
    iv_res = await db.from_("ai_interviews").select("score").eq("candidate_id", user_id).eq("status", "completed")
    interviews = iv_res.data or []
    best_interview = max(float(i.get("score") or 0) for i in interviews) if interviews else 0

    # Practice streak
    streak_res = await db.from_("action_items").select("created_at").eq("user_id", user_id).eq("type", "practice_attempt").order("created_at", ascending=False)
    practice_items = streak_res.data or []
    max_streak = 0
    if practice_items:
        from datetime import datetime
        dates = set()
        for item in practice_items:
            dt_str = item.get("created_at")
            if dt_str:
                try:
                    dt = datetime.fromisoformat(str(dt_str).replace("Z", "+00:00"))
                    dates.add(dt.date())
                except Exception:
                    pass
        sorted_dates = sorted(dates, reverse=True)
        current_streak = 1
        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i - 1] - sorted_dates[i]).days == 1:
                current_streak += 1
            else:
                max_streak = max(max_streak, current_streak)
                current_streak = 1
        max_streak = max(max_streak, current_streak)

    return {
        "exams_completed": exams_completed, "exams_passed": exams_passed,
        "top_10_percent": top_10_percent, "perfect_coding": perfect_coding,
        "clean_exam": clean_exam, "best_interview": best_interview,
        "max_streak": max_streak, "fastest_solve": False,
    }


@router.get("/badges")
async def get_candidate_badges(user: Dict[str, Any] = Depends(get_current_user)):
    """Get all badges for the current candidate — both earned and locked."""
    existing_res = await db.from_("badges").select("*").eq("candidate_id", user["id"])
    existing = {b["name"]: b for b in (existing_res.data or [])}

    stats = await compute_candidate_stats(user["id"])

    newly_awarded = []
    for badge_def in BADGE_DEFINITIONS:
        if badge_def["name"] not in existing and badge_def["condition"](stats):
            award_res = await db.from_("badges").insert({
                "candidate_id": user["id"],
                "name": badge_def["name"],
                "description": badge_def["description"],
            }).select().single()
            if award_res.data:
                existing[badge_def["name"]] = award_res.data
                newly_awarded.append(badge_def["name"])

    all_badges = []
    for badge_def in BADGE_DEFINITIONS:
        earned = existing.get(badge_def["name"])
        all_badges.append({
            "name": badge_def["name"],
            "description": badge_def["description"],
            "icon": badge_def["icon"],
            "earned": earned is not None,
            "awardedAt": earned.get("awarded_at") if earned else None,
        })

    return {
        "badges": all_badges,
        "totalEarned": sum(1 for b in all_badges if b["earned"]),
        "totalAvailable": len(all_badges),
        "newlyAwarded": newly_awarded,
        "stats": stats,
    }
