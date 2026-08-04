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
