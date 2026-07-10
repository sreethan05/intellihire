import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Request
from .auth_router import get_current_user
from .db import db
from .insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights
)

router = APIRouter(prefix="/api/hub", tags=["hub"])

@router.get("/overview")
async def get_overview(user: Dict[str, Any] = Depends(get_current_user)):
    user_id = user["id"]
    role = user["role"]
    
    if role == "candidate":
        payload = await get_candidate_hub_data(user_id)
        return payload
    elif role == "tpo":
        payload = await get_tpo_hub_data(user_id)
        return payload
    elif role == "recruiter":
        payload = await get_recruiter_hub_data(user_id)
        return payload
    elif role == "admin":
        payload = await get_admin_hub_data(user_id)
        return payload
    else:
        raise HTTPException(status_code=400, detail="Invalid user role")

async def get_candidate_hub_data(user_id: str) -> Dict[str, Any]:
    # 1. Fetch Candidate Profile
    profile_res = await db.from_("candidate_profiles").select("*, college:college_id(name, code)").eq("user_id", user_id).maybeSingle()
    profile = profile_res.data
    
    # 2. Fetch stats
    attempts_res = await db.from_("attempts").select("score, status").eq("candidate_id", user_id).eq("status", "completed")
    attempts = attempts_res.data or []
    
    completed_exams_count = len(attempts)
    avg_exam_score = round(sum(a.get("score") or 0 for a in attempts) / len(attempts)) if attempts else 0
    
    rank = 0
    total_ranked = 0
    if profile and profile.get("college_id"):
        peers_res = await db.from_("candidate_profiles").select("cgpa").eq("college_id", profile["college_id"])
        peers = peers_res.data or []
        if peers:
            total_ranked = len(peers)
            try:
                profile_cgpa = float(profile.get("cgpa") or 0.0)
                rank = sum(1 for p in peers if float(p.get("cgpa") or 0.0) > profile_cgpa) + 1
            except Exception:
                rank = 1
                
    # 3. Action Items
    action_items = []
    if not profile or not profile.get("profile_complete"):
        action_items.append({
            "id": "profile_incomplete",
            "priority": "urgent",
            "title": "Complete Onboarding Setup",
            "description": "Fill in registration details to unlock campus placements.",
            "action_url": "/candidate/onboarding"
        })
    else:
        if not profile.get("resume_url"):
            action_items.append({
                "id": "resume_missing",
                "priority": "high",
                "title": "Upload Verified Resume",
                "description": "Standard 1-page PDF resume is required for drive eligibility.",
                "action_url": "/candidate/profile"
            })
        if not profile.get("marksheet_url"):
            action_items.append({
                "id": "marksheet_missing",
                "priority": "high",
                "title": "Submit Grade Sheet Marksheet",
                "description": "Attach semester marksheets to auto-verify credentials.",
                "action_url": "/candidate/profile"
            })
            
    assign_res = await db.from_("exam_assignments").select("*, exam:exam_id(title, available_until)").eq("candidate_id", user_id)
    assignments = assign_res.data or []
    
    completed_exam_ids = {a["exam_id"] for a in attempts if "exam_id" in a}
    now = datetime.datetime.utcnow()
    for assign in assignments:
        exam = assign.get("exam") or {}
        exam_id = assign.get("exam_id")
        if exam_id and exam_id not in completed_exam_ids:
            hours_left = 0
            until_str = exam.get("available_until")
            if until_str:
                try:
                    until_dt = datetime.datetime.fromisoformat(until_str.replace("Z", "+00:00")).replace(tzinfo=None)
                    diff = until_dt - now
                    hours_left = max(0, int(diff.total_seconds() / 3600))
                except Exception:
                    pass
            action_items.append({
                "id": f"exam_{exam_id}",
                "priority": "urgent" if hours_left <= 6 else "normal",
                "title": f"Exam Deadline: {exam.get('title', 'Assessment')}",
                "description": f"Closes in {hours_left} hours." if hours_left > 0 else "Deadline expired.",
                "action_url": "/candidate/exams"
            })
            
    ivs_res = await db.from_("ai_interviews").select("*, job:job_id(title, company_name)").eq("candidate_id", user_id).eq("status", "scheduled")
    ivs = ivs_res.data or []
    for iv in ivs:
        job = iv.get("job") or {}
        action_items.append({
            "id": f"iv_{iv['id']}",
            "priority": "urgent",
            "title": "AI Face-to-Face Interview Scheduled",
            "description": f"Active shortlist for SDE role at {job.get('company_name', 'Company')}.",
            "action_url": "/candidate/interview"
        })
        
    # 4. Activity feed
    feed_res = await db.from_("activity_feed").select("*").eq("target_user_id", user_id).order("created_at", ascending=False).limit(5)
    feed = feed_res.data or []
    recent_activity = [{"title": f["title"], "description": f["description"], "date": f["created_at"]} for f in feed]
    if not recent_activity:
        recent_activity.append({
            "title": "Placement Passport Activated",
            "description": "Welcome to IntelliHire. Your verifiable campus passport is live.",
            "date": now.isoformat() + "Z"
        })
        
    # 5. Upcoming Schedule
    upcoming_schedule = []
    for assign in assignments:
        exam = assign.get("exam") or {}
        until_str = exam.get("available_until")
        if until_str:
            try:
                until_dt = datetime.datetime.fromisoformat(until_str.replace("Z", "+00:00")).replace(tzinfo=None)
                if until_dt > now:
                    upcoming_schedule.append({
                        "title": f"Exam: {exam.get('title')}",
                        "date": until_str,
                        "type": "exam"
                    })
            except Exception:
                pass
    for iv in ivs:
        start_str = iv.get("scheduled_start_at")
        job = iv.get("job") or {}
        if start_str:
            try:
                start_dt = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=None)
                if start_dt > now:
                    upcoming_schedule.append({
                        "title": f"AI Interview: {job.get('title', 'Shortlist Interview')}",
                        "date": start_str,
                        "type": "interview"
                    })
            except Exception:
                pass
                
    # 6. Insights radar data compile
    attempt_ids = [att["id"] for att in attempts if att.get("id")]
    mcq_answers = []
    if attempt_ids:
        ans_res = await db.from_("answers").select("*, question:question_id(topic)").in_("attempt_id", attempt_ids)
        mcq_answers = ans_res.data or []
        
    topic_scores = create_topic_scores()
    
    completed_ivs_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", user_id).eq("status", "completed")
    completed_ivs = completed_ivs_res.data or []
    for iv in completed_ivs:
        feed_communication_score(topic_scores, float(iv.get("communication_score") or 0.0))
        
    for ans in mcq_answers:
        q = ans.get("question") or {}
        feed_mcq_answer(topic_scores, bool(ans.get("is_correct")), q.get("topic"))
        
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("score, coding_questions(marks)").in_("attempt_id", attempt_ids).eq("status", "tested")
        subs = subs_res.data or []
        for sub in subs:
            q = sub.get("coding_questions") or {}
            max_m = float(q.get("marks") or 10.0)
            feed_coding_submission(topic_scores, float(sub.get("score") or 0.0), max_m)
            
    insights_data = generate_insights(topic_scores, "Profile")
    
    my_completed_attempts_res = await db.from_("attempts").select("*, exam:exam_id(title)").eq("candidate_id", user_id).eq("status", "completed").order("submitted_at", ascending=True)
    my_completed_attempts = my_completed_attempts_res.data or []
    trend_data = [{"name": (att.get("exam") or {}).get("title") or f"Exam {idx+1}", "score": att.get("score") or 0} for idx, att in enumerate(my_completed_attempts)]
    
    peer_percentile = 0
    if profile and profile.get("college_id"):
        peers_res = await db.from_("candidate_profiles").select("cgpa").eq("college_id", profile["college_id"])
        peers = peers_res.data or []
        if peers:
            try:
                profile_cgpa = float(profile.get("cgpa") or 0.0)
                lower_count = sum(1 for p in peers if float(p.get("cgpa") or 0.0) <= profile_cgpa)
                peer_percentile = round((lower_count / len(peers)) * 100)
            except Exception:
                pass
                
    trackers_res = await db.from_("candidate_status").select("*, job:job_id(*)").eq("candidate_id", user_id)
    trackers_data = trackers_res.data or []
    trackers = []
    for app in trackers_data:
        job = app.get("job") or {}
        trackers.append({
            "jobId": job.get("id"),
            "jobTitle": job.get("title"),
            "companyName": job.get("company_name"),
            "currentStage": app.get("status")
        })
        
    quick_links = [
        {"label": "Take Exam", "path": "/candidate/my-exams", "color": "blue"},
        {"label": "Certificates & Badges", "path": "/candidate/certificates", "color": "green"},
        {"label": "Practice Sandbox", "path": "/candidate/sandbox", "color": "violet"},
        {"label": "AI Interview Room", "path": "/candidate/interview", "color": "indigo"}
    ]
    
    return {
        "role": "candidate",
        "stats": {
            "completedExams": completed_exams_count,
            "upcomingExams": len(assignments) - completed_exams_count,
            "averageScore": f"{avg_exam_score}%",
            "rank": f"{rank} / {total_ranked}"
        },
        "actionItems": action_items,
        "recentActivity": recent_activity,
        "upcomingSchedule": upcoming_schedule,
        "insights": {
            "radarData": insights_data["radarData"],
            "trendData": trend_data,
            "peerPercentile": peer_percentile,
            "trackers": trackers,
            "strengths": insights_data["strengths"],
            "weaknesses": insights_data["weaknesses"]
        },
        "quickLinks": quick_links
    }

async def get_tpo_hub_data(tpo_user_id: str) -> Dict[str, Any]:
    tpo_res = await db.from_("users").select("college_id").eq("id", tpo_user_id).single()
    college_id = tpo_res.data.get("college_id") if tpo_res.data else None
    
    # Run exact counts in Python using direct queries (select with limit 0 or head check is not strictly required, standard select counts is clean)
    students_res = await db.from_("users").select("id").eq("college_id", college_id).eq("role", "candidate")
    total_students = len(students_res.data) if students_res.data else 0
    
    profiles_res = await db.from_("candidate_profiles").select("user_id, cgpa, roll_number, profile_complete, documents_verified").eq("college_id", college_id)
    profiles = profiles_res.data or []
    
    complete_profiles = sum(1 for p in profiles if p.get("profile_complete"))
    pending_verification = sum(1 for p in profiles if not p.get("documents_verified"))
    
    jobs_res = await db.from_("jobs").select("id, title, status, drive_date, company_name").eq("college_id", college_id)
    jobs = jobs_res.data or []
    active_drives_count = sum(1 for j in jobs if j.get("status") == "active")
    
    student_user_ids = [p["user_id"] for p in profiles if p.get("user_id")]
    
    placed_count = 0
    if student_user_ids:
        placed_res = await db.from_("candidate_status").select("id").in_("candidate_id", student_user_ids).in_("status", ["offered", "placed"])
        placed_count = len(placed_res.data) if placed_res.data else 0
        
    placement_rate = round((placed_count / total_students) * 100) if total_students else 0
    
    cgpas = [float(p["cgpa"]) for p in profiles if p.get("cgpa") is not None]
    avg_cgpa = round(sum(cgpas) / len(cgpas), 2) if cgpas else 0.0
    
    action_items = []
    if pending_verification > 0:
        action_items.append({
            "id": "tpo_docs_verify",
            "priority": "urgent",
            "title": "Pending Marksheet Verifications",
            "description": f"{pending_verification} candidates waiting for verification approvals.",
            "action_url": "/tpo/students?tab=pending"
        })
        
    now = datetime.datetime.utcnow()
    for job in jobs:
        if job.get("status") == "active" and job.get("drive_date"):
            try:
                drive_dt = datetime.datetime.fromisoformat(job["drive_date"].replace("Z", "+00:00")).replace(tzinfo=None)
                diff = drive_dt - now
                if 0 < diff.total_seconds() < 3 * 24 * 60 * 60:
                    action_items.append({
                        "id": f"tpo_job_{job['id']}",
                        "priority": "high",
                        "title": f"Drive Expiration: {job.get('company_name')}",
                        "description": f"Drive '{job.get('title')}' closes in less than 3 days.",
                        "action_url": "/tpo/students"
                    })
            except Exception:
                pass
                
    feed_res = await db.from_("activity_feed").select("*, actor:actor_id(name)").eq("actor_role", "candidate").order("created_at", ascending=False).limit(5)
    feed = feed_res.data or []
    recent_activity = []
    for f in feed:
        actor = f.get("actor") or {}
        actor_name = actor.get("name") or "Candidate"
        recent_activity.append({
            "title": f.get("title"),
            "description": f"{actor_name} {f.get('description') or ''}",
            "date": f.get("created_at")
        })
    if not recent_activity:
        recent_activity.append({
            "title": "College Placement Portal Online",
            "description": "TPO cockpit successfully registered and linked to college database.",
            "date": now.isoformat() + "Z"
        })
        
    upcoming_schedule = []
    for j in jobs:
        if j.get("status") == "active" and j.get("drive_date"):
            try:
                drive_dt = datetime.datetime.fromisoformat(j["drive_date"].replace("Z", "+00:00")).replace(tzinfo=None)
                if drive_dt > now:
                    upcoming_schedule.append({
                        "title": f"Drive: {j.get('company_name')} - {j.get('title')}",
                        "date": j["drive_date"],
                        "type": "drive"
                    })
            except Exception:
                pass
                
    eligible_count = sum(1 for p in profiles if float(p.get("cgpa") or 0.0) >= 7.0)
    
    exam_attempts = []
    if student_user_ids:
        attempts_res = await db.from_("attempts").select("candidate_id, score, candidate:candidate_id(name)").in_("candidate_id", student_user_ids).eq("status", "completed")
        exam_attempts = attempts_res.data or []
        
    score_map = {}
    for att in exam_attempts:
        cid = att.get("candidate_id")
        candidate = att.get("candidate") or {}
        name = candidate.get("name") or "Unknown"
        if cid:
            if cid not in score_map:
                score_map[cid] = {"name": name, "total": 0.0, "count": 0.0}
            score_map[cid]["total"] += float(att.get("score") or 0.0)
            score_map[cid]["count"] += 1.0
            
    top_performers = []
    for cid, e in score_map.items():
        avg_score = round(e["total"] / e["count"])
        top_performers.append({"name": e["name"], "score": f"{avg_score}%"})
    top_performers.sort(key=lambda x: int(x["score"].replace("%", "")), reverse=True)
    top_performers = top_performers[:5]
    
    at_risk_students = []
    for p in profiles:
        try:
            cgpa_val = float(p.get("cgpa") or 0.0)
            if cgpa_val < 7.0:
                at_risk_students.append({
                    "name": p.get("roll_number") or "Student",
                    "reason": f"Low CGPA: {cgpa_val}"
                })
        except Exception:
            pass
    at_risk_students = at_risk_students[:5]
    
    quick_links = [
        {"label": "Verify Documents", "path": "/tpo/students", "color": "blue"},
        {"label": "Upload Students", "path": "/tpo/students", "color": "violet"},
        {"label": "View Reports", "path": "/tpo/reports", "color": "green"},
        {"label": "Scan Marksheets", "path": "/tpo/students", "color": "indigo"}
    ]
    
    return {
        "role": "tpo",
        "stats": {
            "totalRegistered": total_students,
            "completeProfiles": complete_profiles,
            "activeDrives": active_drives_count,
            "placed": placed_count,
            "placementRate": f"{placement_rate}%",
            "averageCgpa": avg_cgpa
        },
        "actionItems": action_items,
        "recentActivity": recent_activity,
        "upcomingSchedule": upcoming_schedule,
        "insights": {
            "funnel": [
                {"label": "Registered", "count": total_students},
                {"label": "Eligible", "count": eligible_count},
                {"label": "Offers", "count": placed_count}
            ],
            "topPerformers": top_performers,
            "atRiskStudents": at_risk_students
        },
        "quickLinks": quick_links
    }

async def get_recruiter_hub_data(recruiter_id: str) -> Dict[str, Any]:
    drives_res = await db.from_("jobs").select("id, title, status").eq("created_by", recruiter_id)
    drives = drives_res.data or []
    active_drives_count = sum(1 for d in drives if d.get("status") == "active")
    
    candidates_res = await db.from_("users").select("id").eq("role", "candidate")
    total_candidates = len(candidates_res.data) if candidates_res.data else 0
    
    attempts_res = await db.from_("attempts").select("id, status").eq("recruiter_id", recruiter_id)
    attempts = attempts_res.data or []
    completed_attempts = sum(1 for a in attempts if a.get("status") == "completed")
    
    offers_res = await db.from_("candidate_status").select("id").eq("status", "offered")
    offers_count = len(offers_res.data) if offers_res.data else 0
    
    action_items = []
    # Proctoring anomalous review items
    violations_res = await db.from_("proctoring_snapshots").select("*, candidate:candidate_id(name)").eq("event_type", "violation").in_("violation_severity", ["high", "critical"])
    violations = violations_res.data or []
    if violations:
        action_items.append({
            "id": "proctoring_review_action",
            "priority": "urgent",
            "title": "Security Violations Flagged",
            "description": f"{len(violations)} high-severity proctor anomalies pending review.",
            "action_url": "/recruiter/proctoring"
        })
        
    passers_res = await db.from_("candidate_status").select("*, candidate:candidate_id(name)").eq("status", "passed")
    passers = passers_res.data or []
    if passers:
        action_items.append({
            "id": "passers_interview_pending",
            "priority": "high",
            "title": "Passers Pending Interview",
            "description": f"{len(passers)} candidates passed exams but lack voice schedule details.",
            "action_url": "/recruiter/interview-scheduling"
        })
        
    feed_res = await db.from_("activity_feed").select("*").eq("actor_role", "candidate").order("created_at", ascending=False).limit(5)
    feed = feed_res.data or []
    recent_activity = [{"title": f["title"], "description": f["description"], "date": f["created_at"]} for f in feed]
    if not recent_activity:
        recent_activity.append({
            "title": "Recruiting War Room Ready",
            "description": "Recruiter campaign portal initialized. Proctoring feeds active.",
            "date": datetime.datetime.utcnow().isoformat() + "Z"
        })
        
    upcoming_schedule = []
    scheduled_ivs_res = await db.from_("ai_interviews").select("*, candidate:candidate_id(name), job:job_id(title)").eq("scheduled_by", recruiter_id).eq("status", "scheduled").limit(5)
    scheduled_ivs = scheduled_ivs_res.data or []
    for iv in scheduled_ivs:
        candidate = iv.get("candidate") or {}
        job = iv.get("job") or {}
        upcoming_schedule.append({
            "title": f"Interview: {candidate.get('name') or 'Candidate'} - {job.get('title')}",
            "date": iv.get("scheduled_start_at"),
            "type": "interview"
        })
        
    spotlight_attempts_res = await db.from_("attempts").select("candidate_id, score, candidate:candidate_id(name)").eq("status", "completed")
    spotlight_attempts = spotlight_attempts_res.data or []
    spotlight_map = {}
    for att in spotlight_attempts:
        cid = att.get("candidate_id")
        candidate = att.get("candidate") or {}
        name = candidate.get("name") or "Unknown"
        if cid:
            if cid not in spotlight_map:
                spotlight_map[cid] = {"name": name, "total": 0.0, "count": 0.0}
            spotlight_map[cid]["total"] += float(att.get("score") or 0.0)
            spotlight_map[cid]["count"] += 1.0
            
    candidate_spotlight = []
    for cid, e in spotlight_map.items():
        avg_score = round(e["total"] / e["count"])
        candidate_spotlight.append({"name": e["name"], "score": f"{avg_score}% Match"})
    candidate_spotlight.sort(key=lambda x: int(x["score"].replace("% Match", "")), reverse=True)
    candidate_spotlight = candidate_spotlight[:3]
    
    quick_links = [
        {"label": "Create Drive", "path": "/recruiter/create-drive", "color": "blue"},
        {"label": "Create Exam", "path": "/recruiter/create-exam", "color": "violet"},
        {"label": "AI Studio", "path": "/recruiter/ai-studio", "color": "indigo"},
        {"label": "Proctoring", "path": "/recruiter/proctoring", "color": "green"}
    ]
    
    return {
        "role": "recruiter",
        "stats": {
            "activeDrives": active_drives_count,
            "totalCandidates": total_candidates,
            "completedAttempts": completed_attempts,
            "offersExtended": offers_count
        },
        "actionItems": action_items,
        "recentActivity": recent_activity,
        "upcomingSchedule": upcoming_schedule,
        "insights": {
            "candidateSpotlight": candidate_spotlight,
            "skillGap": None
        },
        "quickLinks": quick_links
    }

async def get_admin_hub_data(admin_id: str) -> Dict[str, Any]:
    users_res = await db.from_("users").select("id")
    total_users = len(users_res.data) if users_res.data else 0
    
    exams_res = await db.from_("exams").select("id")
    exams_count = len(exams_res.data) if exams_res.data else 0
    
    active_res = await db.from_("attempts").select("id").eq("status", "in_progress")
    active_sessions = len(active_res.data) if active_res.data else 0
    
    action_items = [
        {
            "id": "admin_moderation",
            "priority": "normal",
            "title": "System Moderation Logs",
            "description": "System health check and server process limits operating within normal bounds.",
            "action_url": "/admin/overview"
        }
    ]
    
    feed_res = await db.from_("activity_feed").select("*").order("created_at", ascending=False).limit(5)
    feed = feed_res.data or []
    recent_activity = [{"title": f["title"], "description": f["description"], "date": f["created_at"]} for f in feed]
    if not recent_activity:
        recent_activity.append({
            "title": "Platform Administration Panel Active",
            "description": "Platform orchestration database services reporting healthy.",
            "date": datetime.datetime.utcnow().isoformat() + "Z"
        })
        
    quick_links = [
        {"label": "Manage User Roles", "path": "/admin/manage", "color": "blue"},
        {"label": "Recruiter Analytics", "path": "/admin/recruiter-analytics", "color": "violet"},
        {"label": "Exam Activity Logs", "path": "/admin/exam-activity", "color": "green"}
    ]
    
    return {
        "role": "admin",
        "stats": {
            "totalUsers": total_users,
            "totalExams": exams_count,
            "activeSessions": active_sessions,
            "systemHealth": "Healthy"
        },
        "actionItems": action_items,
        "recentActivity": recent_activity,
        "upcomingSchedule": [],
        "insights": {
            "growth": None
        },
        "quickLinks": quick_links
    }
