import datetime
import math
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException

from ..auth_router import get_current_user
from ..db import db
from ..insights import (
    create_topic_scores,
    feed_mcq_answer,
    feed_coding_submission,
    feed_communication_score,
    generate_insights
)

router = APIRouter(prefix="/api/candidate", tags=["candidate_analytics"])

@router.get("/performance-radar")
async def get_performance_radar(user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    
    ans_res = await db.from_("answers").select("*, question:question_id(topic), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", uid)
    mcq_answers = ans_res.data or []
    
    topic_scores = create_topic_scores()
    
    ivs_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", uid).eq("status", "completed")
    for iv in (ivs_res.data or []):
        feed_communication_score(topic_scores, iv.get("communication_score") or 0)
        
    for ans in mcq_answers:
        q = ans.get("question") or {}
        feed_mcq_answer(topic_scores, bool(ans.get("is_correct")), q.get("topic"))
        
    coding_res = await db.from_("coding_submissions").select("score, coding_questions(marks), attempt:attempt_id(candidate_id)").eq("attempt.candidate_id", uid).eq("status", "tested")
    for sub in (coding_res.data or []):
        q = sub.get("coding_questions") or {}
        feed_coding_submission(topic_scores, float(sub.get("score") or 0.0), float(q.get("marks") or 10.0))
        
    insights = generate_insights(topic_scores, "Profile")
    
    prof_res = await db.from_("candidate_profiles").select("college_id, cgpa").eq("user_id", uid).maybeSingle()
    peer_percentile = 0
    if prof_res.data:
        peers_res = await db.from_("candidate_profiles").select("cgpa").eq("college_id", prof_res.data["college_id"])
        peers = peers_res.data or []
        if peers:
            lower = sum(1 for p in peers if float(p.get("cgpa") or 0.0) <= float(prof_res.data.get("cgpa") or 0.0))
            peer_percentile = round((lower / len(peers)) * 100)
            
    attempts_res = await db.from_("attempts").select("*, exam:exam_id(title)").eq("candidate_id", uid).eq("status", "completed").order("submitted_at", ascending=True)
    trend = [{"name": (a.get("exam") or {}).get("title") or "Exam", "score": a.get("score") or 0} for a in (attempts_res.data or [])]
    
    return {
        "radarData": insights["radarData"],
        "peerPercentile": peer_percentile,
        "trendData": trend,
        "strengths": insights["strengths"],
        "weaknesses": insights["weaknesses"]
    }

@router.get("/topic-mastery")
async def get_topic_mastery(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"topics": [], "strongest": None, "weakest": None, "peerAverage": []}
        
    ans_res = await db.from_("answers").select("id, question_id, is_correct, marks_obtained").in_("attempt_id", attempt_ids)
    answers = ans_res.data or []
    
    q_ids = [a["question_id"] for a in answers if a.get("question_id")]
    questions = []
    if q_ids:
        q_res = await db.from_("questions").select("id, topic_tags, question_text").in_("id", q_ids)
        questions = q_res.data or []
        
    topic_map = {}
    for a in answers:
        q = next((q for q in questions if q["id"] == a["question_id"]), None)
        tags = q.get("topic_tags") if q and q.get("topic_tags") else []
        if not isinstance(tags, list):
            tags = []
        if not tags:
            tags = ["General"]
        for tag in tags:
            if tag not in topic_map:
                topic_map[tag] = {"total": 0, "correct": 0, "marks": 0.0}
            topic_map[tag]["total"] += 1
            if a.get("is_correct"):
                topic_map[tag]["correct"] += 1
            topic_map[tag]["marks"] += float(a.get("marks_obtained") or 0.0)
            
    topics = []
    for topic, stats in topic_map.items():
        topics.append({
            "topic": topic,
            "accuracy": round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0,
            "total": stats["total"],
            "correct": stats["correct"],
            "avgMarks": round(stats["marks"] / stats["total"], 1) if stats["total"] else 0.0
        })
    topics.sort(key=lambda x: x["accuracy"], reverse=True)
    
    # Peer average
    peer_avg = []
    if q_ids:
        all_ans_res = await db.from_("answers").select("is_correct, question_id, attempts:attempt_id(status)").in_("question_id", q_ids)
        all_answers = all_ans_res.data or []
        
        peer_map = {}
        for a in all_answers:
            att = a.get("attempts") or {}
            if att.get("status") != "completed":
                continue
            q = next((q for q in questions if q["id"] == a["question_id"]), None)
            tags = q.get("topic_tags") if q and q.get("topic_tags") else ["General"]
            if not isinstance(tags, list):
                tags = ["General"]
            for tag in tags:
                if tag not in peer_map:
                    peer_map[tag] = {"total": 0, "correct": 0}
                peer_map[tag]["total"] += 1
                if a.get("is_correct"):
                    peer_map[tag]["correct"] += 1
                    
        for topic, stats in peer_map.items():
            peer_avg.append({
                "topic": topic,
                "accuracy": round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0
            })
            
    return {
        "topics": topics,
        "strongest": topics[0]["topic"] if topics else None,
        "weakest": topics[-1]["topic"] if topics else None,
        "peerAverage": peer_avg
    }

@router.get("/coding-analytics")
async def get_coding_analytics(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"languages": [], "difficulty": [], "problemTypes": []}
        
    subs_res = await db.from_("coding_submissions").select("*, coding_questions:coding_question_id(difficulty, topic_tags, marks)").in_("attempt_id", attempt_ids)
    submissions = subs_res.data or []
    
    lang_map = {}
    diff_map = {}
    type_map = {}
    
    for s in submissions:
        lang = s.get("language") or "unknown"
        if lang not in lang_map:
            lang_map[lang] = {"submissions": 0, "success": 0, "totalScore": 0.0, "count": 0}
        lang_map[lang]["submissions"] += 1
        if float(s.get("score") or 0.0) > 0.0:
            lang_map[lang]["success"] += 1
        lang_map[lang]["totalScore"] += float(s.get("score") or 0.0)
        lang_map[lang]["count"] += 1
        
        q = s.get("coding_questions") or {}
        diff = q.get("difficulty") or "unknown"
        if diff not in diff_map:
            diff_map[diff] = {"total": 0, "success": 0, "totalScore": 0.0}
        diff_map[diff]["total"] += 1
        if float(s.get("score") or 0.0) > 0.0:
            diff_map[diff]["success"] += 1
        diff_map[diff]["totalScore"] += float(s.get("score") or 0.0)
        
        tags = q.get("topic_tags") if q.get("topic_tags") else ["General"]
        if not isinstance(tags, list):
            tags = ["General"]
        for tag in tags:
            if tag not in type_map:
                type_map[tag] = {"total": 0, "success": 0}
            type_map[tag]["total"] += 1
            if float(s.get("score") or 0.0) > 0.0:
                type_map[tag]["success"] += 1
                
    languages = []
    for lang, stats in lang_map.items():
        languages.append({
            "language": lang,
            "submissions": stats["submissions"],
            "successRate": round((stats["success"] / stats["count"]) * 100) if stats["count"] else 0,
            "avgScore": round(stats["totalScore"] / stats["count"], 1) if stats["count"] else 0.0
        })
        
    difficulty = []
    for level, stats in diff_map.items():
        difficulty.append({
            "level": level,
            "total": stats["total"],
            "successRate": round((stats["success"] / stats["total"]) * 100) if stats["total"] else 0,
            "avgScore": round(stats["totalScore"] / stats["total"], 1) if stats["total"] else 0.0
        })
        
    problem_types = []
    for t, stats in type_map.items():
        problem_types.append({
            "type": t,
            "total": stats["total"],
            "successRate": round((stats["success"] / stats["total"]) * 100) if stats["total"] else 0
        })
        
    return {"languages": languages, "difficulty": difficulty, "problemTypes": problem_types}

@router.get("/interview-analytics")
async def get_interview_analytics(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    res = await db.from_("ai_interviews").select("*, job:job_id(title, company_name), exam:exam_id(title)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    interviews = res.data or []
    
    breakdown = []
    for i in interviews:
        job = i.get("job") or {}
        exam = i.get("exam") or {}
        breakdown.append({
            "id": i["id"],
            "jobTitle": job.get("title") or exam.get("title") or "Interview",
            "companyName": job.get("company_name") or "",
            "submittedAt": i.get("submitted_at"),
            "overallScore": i.get("score") or 0,
            "dimensions": {
                "relevance": i.get("relevance_score") or 0,
                "communication": i.get("communication_score") or 0,
                "intro": i.get("intro_score") or 0,
                "speaking": i.get("speaking_score") or 0,
                "pronunciation": i.get("pronunciation_score") or 0,
                "technical": i.get("technical_score") or 0
            },
            "selected": bool(i.get("selected")),
            "summary": i.get("summary") or "",
            "feedback": i.get("feedback") or ""
        })
        
    averages = {
        "relevance": round(sum(b["dimensions"]["relevance"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "communication": round(sum(b["dimensions"]["communication"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "intro": round(sum(b["dimensions"]["intro"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "speaking": round(sum(b["dimensions"]["speaking"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "pronunciation": round(sum(b["dimensions"]["pronunciation"] for b in breakdown) / len(breakdown)) if breakdown else 0,
        "technical": round(sum(b["dimensions"]["technical"] for b in breakdown) / len(breakdown)) if breakdown else 0
    }
    
    return {"interviews": breakdown, "averages": averages, "count": len(breakdown)}

@router.get("/streak")
async def get_streak(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("started_at, submitted_at").eq("candidate_id", candidate_id).eq("status", "completed")
    subs_res = await db.from_("coding_submissions").select("created_at, attempts:attempt_id(candidate_id)").eq("attempts.candidate_id", candidate_id)
    
    dates = set()
    for a in (att_res.data or []):
        if a.get("started_at"):
            dates.add(a["started_at"][:10])
        if a.get("submitted_at"):
            dates.add(a["submitted_at"][:10])
    for c in (subs_res.data or []):
        if c.get("created_at"):
            dates.add(c["created_at"][:10])
            
    sorted_dates = sorted(list(dates))
    current_streak = 0
    longest_streak = 0
    temp_streak = 0
    prev_date = None
    
    for d_str in sorted_dates:
        d = datetime.date.fromisoformat(d_str)
        if prev_date:
            diff = (d - prev_date).days
            if diff == 1:
                temp_streak += 1
            else:
                temp_streak = 1
        else:
            temp_streak = 1
        prev_date = d
        longest_streak = max(longest_streak, temp_streak)
        
    today = datetime.date.today()
    today_str = today.isoformat()
    yesterday_str = (today - datetime.timedelta(days=1)).isoformat()
    
    if today_str in dates:
        current_streak = 1
        chk = today - datetime.timedelta(days=1)
        while chk.isoformat() in dates:
            current_streak += 1
            chk -= datetime.timedelta(days=1)
    elif yesterday_str in dates:
        current_streak = 1
        chk = today - datetime.timedelta(days=2)
        while chk.isoformat() in dates:
            current_streak += 1
            chk -= datetime.timedelta(days=1)
            
    heatmap = []
    day_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    for i in range(83, -1, -1):
        d = today - datetime.timedelta(days=i)
        d_str = d.isoformat()
        week = (83 - i) // 7
        day = (d.weekday() + 1) % 7 # Python weekday is 0=Mon, convert to 0=Sun
        heatmap.append({
            "date": d_str,
            "count": 1 if d_str in dates else 0,
            "week": week,
            "day": day
        })
        
    return {
        "currentStreak": current_streak,
        "longestStreak": longest_streak,
        "heatmap": heatmap,
        "dayNames": day_names
    }

@router.get("/readiness-score")
async def get_readiness_score(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("id, exam_id, score, status, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    attempts = att_res.data or []
    attempt_ids = [a["id"] for a in attempts]
    
    coding_subs = []
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("score, coding_questions:coding_question_id(marks)").in_("attempt_id", attempt_ids)
        coding_subs = subs_res.data or []
        
    ivs_res = await db.from_("ai_interviews").select("score").eq("candidate_id", candidate_id).eq("status", "completed")
    interviews = ivs_res.data or []
    
    all_exams_res = await db.from_("exams").select("id")
    total_exams = len(all_exams_res.data) if all_exams_res.data else 0
    
    exam_percentages = []
    for a in attempts:
        exam = a.get("exams") or {}
        tot = float(exam.get("total_marks") or 100.0)
        exam_percentages.append((float(a.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
    exam_avg = sum(exam_percentages) / len(exam_percentages) if exam_percentages else 0.0
    
    coding_percentages = []
    for c in coding_subs:
        q = c.get("coding_questions") or {}
        tot = float(q.get("marks") or 10.0)
        coding_percentages.append((float(c.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
    coding_score = sum(coding_percentages) / len(coding_percentages) if coding_percentages else exam_avg
    
    iv_scores = [float(i.get("score") or 0.0) for i in interviews]
    interview_score = sum(iv_scores) / len(iv_scores) if iv_scores else 0.0
    
    consistency = 100.0
    if len(exam_percentages) > 1:
        mean = exam_avg
        variance = sum((p - mean) ** 2 for p in exam_percentages) / len(exam_percentages)
        std_dev = math.sqrt(variance)
        consistency = max(0.0, 100.0 - std_dev)
    elif not exam_percentages:
        consistency = 0.0
        
    uniq_exams = len({a["exam_id"] for a in attempts if a.get("exam_id")})
    breadth = (uniq_exams / total_exams) * 100.0 if total_exams else uniq_exams * 10.0
    breadth = min(100.0, breadth)
    
    readiness = round((exam_avg * 0.40) + (coding_score * 0.25) + (interview_score * 0.20) + (consistency * 0.10) + (breadth * 0.05))
    zone = "ready" if readiness >= 75 else "approaching" if readiness >= 50 else "needs_work"
    
    return {
        "readinessScore": readiness,
        "zone": zone,
        "components": {
            "exam": round(exam_avg),
            "coding": round(coding_score),
            "interview": round(interview_score),
            "consistency": round(consistency),
            "breadth": round(breadth)
        }
    }

@router.get("/proctoring-summary")
async def get_proctoring_summary(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id").eq("candidate_id", candidate_id)
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    if not attempt_ids:
        return {"totalViolations": 0, "byType": [], "recentExams": []}
        
    events_res = await db.from_("proctoring_snapshots").select("event_type, message, violation_count, captured_at, exams:exam_id(title)").in_("attempt_id", attempt_ids).eq("event_type", "violation").order("captured_at", ascending=False)
    violations = events_res.data or []
    
    type_map = {}
    for v in violations:
        msg = (v.get("message") or "").lower()
        v_type = "other"
        if "tab" in msg:
            v_type = "tab_switch"
        elif "face" in msg:
            v_type = "face_missing"
        elif "camera" in msg:
            v_type = "camera_offline"
        elif "phone" in msg:
            v_type = "phone_detected"
        elif "looking" in msg:
            v_type = "looking_away"
        type_map[v_type] = type_map.get(v_type, 0) + 1
        
    by_type = [{"type": k, "count": v} for k, v in type_map.items()]
    recent_exams = []
    for v in violations[:5]:
        exam = v.get("exams") or {}
        recent_exams.append({
            "examTitle": exam.get("title") or "Unknown",
            "message": v.get("message") or "",
            "capturedAt": v.get("captured_at"),
            "violationCount": v.get("violation_count") or 1
        })
        
    return {"totalViolations": len(violations), "byType": by_type, "recentExams": recent_exams}

@router.get("/peer-comparison")
async def get_peer_comparison(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    
    att_res = await db.from_("attempts").select("id, exam_id, score, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    my_attempts = att_res.data or []
    my_ids = [a["id"] for a in my_attempts]
    
    my_answers = []
    if my_ids:
        my_ans_res = await db.from_("answers").select("question_id, is_correct").in_("attempt_id", my_ids)
        my_answers = my_ans_res.data or []
        
    all_ans_res = await db.from_("answers").select("question_id, is_correct, attempt_id, attempts:attempt_id(candidate_id, status)").eq("attempts.status", "completed")
    all_answers = all_ans_res.data or []
    
    q_ids = list({a["question_id"] for a in all_answers if a.get("question_id")})
    questions = []
    if q_ids:
        q_res = await db.from_("questions").select("id, topic_tags").in_("id", q_ids)
        questions = q_res.data or []
        
    topic_accs = {}
    for a in all_answers:
        q = next((q for q in questions if q["id"] == a["question_id"]), None)
        tags = q.get("topic_tags") if q and q.get("topic_tags") else ["General"]
        if not isinstance(tags, list):
            tags = ["General"]
        for tag in tags:
            if tag not in topic_accs:
                topic_accs[tag] = {"myCorrect": 0, "myTotal": 0, "peerCorrect": 0, "peerTotal": 0}
            topic_accs[tag]["peerTotal"] += 1
            if a.get("is_correct"):
                topic_accs[tag]["peerCorrect"] += 1
                
            att = a.get("attempts") or {}
            if att.get("candidate_id") == candidate_id:
                topic_accs[tag]["myTotal"] += 1
                if a.get("is_correct"):
                    topic_accs[tag]["myCorrect"] += 1
                    
    comparisons = []
    for topic, stats in topic_accs.items():
        my_acc = (stats["myCorrect"] / stats["myTotal"]) * 100.0 if stats["myTotal"] else 0.0
        peer_acc = (stats["peerCorrect"] / stats["peerTotal"]) * 100.0 if stats["peerTotal"] else 0.0
        pct = (my_acc / peer_acc) * 100.0 if peer_acc > 0 else 0.0
        comparisons.append({
            "topic": topic,
            "myAccuracy": round(my_acc),
            "peerAccuracy": round(peer_acc),
            "percentile": min(100, round(pct))
        })
        
    my_tot_correct = sum(1 for a in my_answers if a.get("is_correct"))
    my_tot = len(my_answers)
    my_overall_acc = (my_tot_correct / my_tot) * 100.0 if my_tot else 0.0
    
    peer_answers = [a for a in all_answers if a.get("attempts", {}).get("candidate_id") != candidate_id]
    peer_tot_correct = sum(1 for a in peer_answers if a.get("is_correct"))
    peer_tot = len(peer_answers)
    peer_overall_acc = (peer_tot_correct / peer_tot) * 100.0 if peer_tot else 0.0
    
    overall_percentile = (my_overall_acc / peer_overall_acc) * 100.0 if peer_overall_acc > 0 else 0.0
    
    return {
        "comparisons": comparisons,
        "overall": {
            "myAccuracy": round(my_overall_acc),
            "peerAccuracy": round(peer_overall_acc),
            "percentile": min(100, round(overall_percentile))
        }
    }

@router.get("/certificates")
async def get_certificates(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("id, exam_id, score, submitted_at, exams:exam_id(id, title, total_marks, pass_marks)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    attempts = att_res.data or []
    
    passed = []
    for att in attempts:
        exam = att.get("exams") or {}
        if float(att.get("score") or 0.0) >= float(exam.get("pass_marks") or 0.0):
            passed.append(att)
            
    for att in passed:
        await db.from_("certificates").upsert({
            "candidate_id": candidate_id,
            "exam_id": att["exam_id"],
            "certificate_url": f"/certificate/{candidate_id}/{att['exam_id']}"
        }, on_conflict="candidate_id,exam_id")
        
    certs_res = await db.from_("certificates").select("*, exam:exam_id(title, total_marks)").eq("candidate_id", candidate_id).order("issued_at", ascending=False)
    return {"certificates": certs_res.data or []}

@router.get("/badges")
async def get_badges(user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    att_res = await db.from_("attempts").select("score, exams:exam_id(total_marks)").eq("candidate_id", candidate_id).eq("status", "completed")
    completed = att_res.data or []
    
    best_pct = 0.0
    for att in completed:
        exam = att.get("exams") or {}
        tot = float(exam.get("total_marks") or 100.0)
        pct = (float(att.get("score") or 0.0) / tot) * 100.0 if tot else 0.0
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
            await db.from_("badges").insert({
                "candidate_id": candidate_id,
                "name": badge["name"],
                "description": badge["description"]
            })
            
    badges_res = await db.from_("badges").select("*").eq("candidate_id", candidate_id).order("awarded_at", ascending=False)
    return {"badges": badges_res.data or []}
