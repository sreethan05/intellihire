import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException

from ..auth_router import get_current_user, require_roles
from ..db import db, get_connection
from .recruiter_drives import deserialize_drive_colleges

router = APIRouter(prefix="/api/recruiter", tags=["recruiter_dashboard"])

@router.get("/dashboard")
async def get_dashboard(collegeId: Optional[str] = None, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    from psycopg.rows import dict_row
    
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # 1. Fetch drives
            cur.execute('SELECT * FROM jobs WHERE created_by = %s', [user["id"]])
            drives = [dict(r) for r in cur.fetchall()]
            
            if collegeId:
                drives = [
                    d for d in drives
                    if d.get("college_id") == collegeId or collegeId in deserialize_drive_colleges(d.get("company_description"))["college_ids"]
                ]
            drive_ids = [d["id"] for d in drives]
            
            # 2. Profiles
            profiles_query = 'SELECT * FROM candidate_profiles'
            params = []
            if collegeId:
                profiles_query += ' WHERE college_id = %s'
                params.append(collegeId)
            cur.execute(profiles_query, params)
            profiles = [dict(r) for r in cur.fetchall()]
            college_cand_ids = [p["user_id"] for p in profiles]
            
            # 3. Candidates
            cand_list = []
            if collegeId and not college_cand_ids:
                pass
            else:
                users_query = 'SELECT id, name, email FROM users WHERE role = \'candidate\''
                users_params = []
                if collegeId:
                    users_query += ' AND id IN %s'
                    users_params.append(tuple(college_cand_ids))
                cur.execute(users_query, users_params)
                cand_list = [dict(r) for r in cur.fetchall()]
                
            # 4. Pipeline Status
            pipeline_list = []
            if drive_ids:
                pipe_query = 'SELECT id, job_id, candidate_id, status FROM candidate_status WHERE job_id IN %s'
                pipe_params = [tuple(drive_ids)]
                if collegeId and college_cand_ids:
                    pipe_query += ' AND candidate_id IN %s'
                    pipe_params.append(tuple(college_cand_ids))
                elif collegeId:
                    pipe_query += ' AND FALSE'
                cur.execute(pipe_query, pipe_params)
                pipeline_list = [dict(r) for r in cur.fetchall()]
                
            # 5. Assignments
            assign_list = []
            if collegeId and not college_cand_ids:
                pass
            else:
                assign_query = 'SELECT exam_id, candidate_id FROM exam_assignments WHERE assigned_by = %s'
                assign_params = [user["id"]]
                if collegeId:
                    assign_query += ' AND candidate_id IN %s'
                    assign_params.append(tuple(college_cand_ids))
                cur.execute(assign_query, assign_params)
                assign_list = [dict(r) for r in cur.fetchall()]
                
            # 6. Attempts
            attempt_list = []
            if collegeId and not college_cand_ids:
                pass
            else:
                att_query = """
                    SELECT a.id, a.exam_id, a.candidate_id, a.status, a.score, a.started_at, a.submitted_at,
                           e.title, e.total_marks, e.pass_marks, u.name, u.email
                     FROM attempts a
                     LEFT JOIN exams e ON e.id = a.exam_id
                     LEFT JOIN users u ON u.id = a.candidate_id
                     WHERE a.recruiter_id = %s
                """
                att_params = [user["id"]]
                if collegeId:
                    att_query += ' AND a.candidate_id IN %s'
                    att_params.append(tuple(college_cand_ids))
                att_query += ' ORDER BY a.started_at DESC'
                cur.execute(att_query, att_params)
                
                rows = cur.fetchall()
                for row in rows:
                    attempt_list.append({
                        "id": row["id"],
                        "exam_id": row["exam_id"],
                        "candidate_id": row["candidate_id"],
                        "status": row["status"],
                        "score": row["score"],
                        "started_at": row["started_at"].isoformat() if row["started_at"] else None,
                        "submitted_at": row["submitted_at"].isoformat() if row["submitted_at"] else None,
                        "exams": {"title": row["title"], "total_marks": row["total_marks"], "pass_marks": row["pass_marks"]},
                        "users": {"name": row["name"], "email": row["email"]}
                    })
                    
            # 7. Exams list
            cur.execute('SELECT id, title, total_marks, pass_marks, created_at, available_from, available_until FROM exams WHERE created_by = %s', [user["id"]])
            exams = [dict(r) for r in cur.fetchall()]
            for e in exams:
                if e.get("created_at"):
                    e["created_at"] = e["created_at"].isoformat() if hasattr(e["created_at"], "isoformat") else str(e["created_at"])
                if e.get("available_from"):
                    e["available_from"] = e["available_from"].isoformat() if hasattr(e["available_from"], "isoformat") else str(e["available_from"])
                if e.get("available_until"):
                    e["available_until"] = e["available_until"].isoformat() if hasattr(e["available_until"], "isoformat") else str(e["available_until"])
                    
    completed_att = [a for a in attempt_list if a["status"] == "completed"]
    in_progress_att = [a for a in attempt_list if a["status"] == "in_progress"]
    passed_att = [
        a for a in completed_att
        if (a["score"] or 0) >= (a["exams"]["pass_marks"] or 0)
    ]
    
    completion_rate = round((len(completed_att) / len(assign_list)) * 100, 1) if assign_list else 0.0
    avg_score = round(sum(a["score"] or 0 for a in completed_att) / len(completed_att), 1) if completed_att else 0.0
    pass_rate = round((len(passed_att) / len(completed_att)) * 100, 1) if completed_att else 0.0
    
    exam_perf = []
    for exam in exams:
        exam_assign = [a for a in assign_list if a["exam_id"] == exam["id"]]
        exam_att = [a for a in attempt_list if a["exam_id"] == exam["id"]]
        exam_completed = [a for a in exam_att if a["status"] == "completed"]
        exam_passed = [a for a in exam_completed if (a["score"] or 0) >= (exam["pass_marks"] or 0)]
        
        exam_avg = round(sum(a["score"] or 0 for a in exam_completed) / len(exam_completed), 1) if exam_completed else 0.0
        exam_pass_rate = round((len(exam_passed) / len(exam_completed)) * 100, 1) if exam_completed else 0.0
        
        exam_perf.append({
            "examId": exam["id"],
            "title": exam["title"],
            "assignedCount": len(exam_assign),
            "attemptCount": len(exam_att),
            "completedCount": len(exam_completed),
            "averageScore": exam_avg,
            "passRate": exam_pass_rate
        })
        
    cand_perf = []
    for c in cand_list:
        c_att = [a for a in attempt_list if a["candidate_id"] == c["id"]]
        c_completed = [a for a in c_att if a["status"] == "completed"]
        c_avg = round(sum(a["score"] or 0 for a in c_completed) / len(c_completed), 1) if c_completed else 0.0
        
        cand_perf.append({
            "candidateId": c["id"],
            "name": c["name"],
            "email": c["email"],
            "attempts": len(c_att),
            "completedAttempts": len(c_completed),
            "averageScore": c_avg
        })
    cand_perf.sort(key=lambda x: x["averageScore"], reverse=True)
    cand_perf = cand_perf[:6]
    
    recent_exams = []
    for exam in exams:
        exam_completed = sum(1 for a in completed_att if a["exam_id"] == exam["id"])
        exam_active = sum(1 for a in in_progress_att if a["exam_id"] == exam["id"])
        status = "Completed" if exam_completed > 0 else ("Live" if exam_active > 0 else "Upcoming")
        
        recent_exams.append({
            "id": exam["id"],
            "examId": exam["id"],
            "title": exam["title"],
            "subtitle": exam.get("available_from") or exam.get("created_at"),
            "meta": status,
            "status": status,
            "tone": "green" if status == "Completed" else ("amber" if status == "Live" else "blue"),
            "date": exam.get("available_from") or exam.get("created_at")
        })
    recent_exams.sort(key=lambda x: x["date"] or "", reverse=True)
    recent_exams = recent_exams[:6]
    
    result_summary = {
        "pass": len(passed_att),
        "fail": max(0, len(completed_att) - len(passed_att)),
        "inProgress": len(in_progress_att)
    }
    
    drive_analytics = []
    for drive in drives:
        drive_pipe = [p for p in pipeline_list if p["job_id"] == drive["id"]]
        drive_assign = [a for a in assign_list if drive.get("exam_id") and a["exam_id"] == drive["exam_id"]]
        assigned_cands = {a["candidate_id"] for a in drive_assign}
        drive_att = [a for a in attempt_list if a["candidate_id"] in assigned_cands]
        drive_comp = [a for a in drive_att if a["status"] == "completed"]
        
        drive_analytics.append({
            "driveId": drive["id"],
            "label": drive["title"],
            "company": drive["company_name"],
            "registered": len(drive_pipe),
            "assigned": len(drive_assign),
            "attempted": len(drive_att),
            "completed": len(drive_comp),
            "offered": sum(1 for p in drive_pipe if p["status"] == "offered")
        })
        
    funnel = [
        {"label": "Registered", "value": len(pipeline_list)},
        {"label": "Assigned", "value": len(assign_list)},
        {"label": "Exam Taken", "value": len(completed_att)},
        {"label": "Passed", "value": len(passed_att)},
        {"label": "Shortlisted", "value": sum(1 for p in pipeline_list if p["status"] == "shortlisted")},
        {"label": "Offered", "value": sum(1 for p in pipeline_list if p["status"] == "offered")}
    ]
    
    branch_map = {}
    for p in profiles:
        branch = p.get("branch") or "Unknown"
        if branch not in branch_map:
            branch_map[branch] = {"label": branch, "candidates": 0, "averageCgpa": 0.0, "verified": 0}
        branch_map[branch]["candidates"] += 1
        branch_map[branch]["averageCgpa"] += float(p.get("cgpa") or 0.0)
        branch_map[branch]["verified"] += 1 if p.get("documents_verified") else 0
        
    branch_analytics = []
    for k, v in branch_map.items():
        avg = round(v["averageCgpa"] / v["candidates"], 2) if v["candidates"] else 0.0
        branch_analytics.append({
            **v,
            "averageCgpa": avg
        })
        
    return {
        "stats": {
            "candidates": len(cand_list),
            "drives": len(drives),
            "registered": len(pipeline_list),
            "offers": sum(1 for p in pipeline_list if p["status"] == "offered"),
            "exams": len(exams),
            "assignments": len(assign_list),
            "attempts": len(attempt_list),
            "completedAttempts": len(completed_att),
            "inProgressAttempts": len(in_progress_att),
            "averageScore": avg_score,
            "completionRate": completion_rate,
            "passRate": pass_rate
        },
        "examPerformance": exam_perf,
        "candidatePerformance": cand_perf,
        "driveAnalytics": drive_analytics,
        "branchAnalytics": branch_analytics,
        "funnel": funnel,
        "recentAttempts": attempt_list[:12],
        "recentExams": recent_exams,
        "examTrend": [],
        "resultSummary": result_summary
    }

@router.get("/exams/{examId}/topic-performance")
async def get_exam_topic_performance(examId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    eq_res = await db.from_("exam_questions").select("question_id, questions:question_id(topic_tags, question_text)").eq("exam_id", examId)
    exam_questions = eq_res.data or []
    
    att_res = await db.from_("attempts").select("id").eq("exam_id", examId).eq("recruiter_id", recruiter_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    
    answers = []
    if attempt_ids:
        ans_res = await db.from_("answers").select("question_id, is_correct, marks_obtained").in_("attempt_id", attempt_ids)
        answers = ans_res.data or []
        
    topic_map = {}
    for a in answers:
        eq = next((q for q in exam_questions if q["question_id"] == a["question_id"]), None)
        q_data = eq.get("questions") if eq else {}
        if isinstance(q_data, list) and q_data:
            q_data = q_data[0]
        tags = q_data.get("topic_tags") if q_data and q_data.get("topic_tags") else ["General"]
        if not isinstance(tags, list):
            tags = ["General"]
        for tag in tags:
            if tag not in topic_map:
                topic_map[tag] = {"total": 0, "correct": 0, "totalMarks": 0, "obtainedMarks": 0.0}
            topic_map[tag]["total"] += 1
            if a.get("is_correct"):
                topic_map[tag]["correct"] += 1
            topic_map[tag]["totalMarks"] += 1
            topic_map[tag]["obtainedMarks"] += float(a.get("marks_obtained") or 0.0)
            
    topics = []
    for topic, stats in topic_map.items():
        topics.append({
            "topic": topic,
            "accuracy": round((stats["correct"] / stats["total"]) * 100) if stats["total"] else 0,
            "total": stats["total"],
            "correct": stats["correct"],
            "avgMarks": round(stats["obtainedMarks"] / stats["total"], 1) if stats["total"] else 0.0
        })
    topics.sort(key=lambda x: x["accuracy"])
    
    return {"topics": topics, "weakest": topics[:3], "totalCandidates": len(attempt_ids)}

@router.get("/proctoring-analytics")
async def get_proctoring_analytics(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    att_res = await db.from_("attempts").select("id").eq("recruiter_id", recruiter_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    
    violations = []
    if attempt_ids:
        events_res = await db.from_("proctoring_snapshots").select("event_type, message, violation_count, candidate_id, users:candidate_id(name)").in_("attempt_id", attempt_ids).eq("event_type", "violation")
        violations = events_res.data or []
        
    type_map = {}
    candidate_map = {}
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
        
        cid = v.get("candidate_id")
        if cid:
            cand = v.get("users") or {}
            name = cand.get("name") or "Unknown"
            if cid not in candidate_map:
                candidate_map[cid] = {"name": name, "count": 0}
            candidate_map[cid]["count"] += 1
            
    by_type = [{"type": k, "count": v} for k, v in type_map.items()]
    by_cand = []
    for cid, stats in candidate_map.items():
        by_cand.append({"candidateId": cid, "name": stats["name"], "violations": stats["count"]})
    by_cand.sort(key=lambda x: x["violations"], reverse=True)
    
    return {"totalViolations": len(violations), "byType": by_type, "byCandidate": by_cand[:10]}

@router.get("/plagiarism-analytics")
async def get_plagiarism_analytics(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    att_res = await db.from_("attempts").select("id, exam_id").eq("recruiter_id", recruiter_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    
    flags = []
    if attempt_ids:
        flags_res = await db.from_("plagiarism_flags").select("*, attempts:attempt_id(candidate_id), matched:matched_with_attempt_id(candidate_id)").in_("attempt_id", attempt_ids)
        flags = flags_res.data or []
        
    total_flags = len(flags)
    avg_sim = round(sum(float(f.get("similarity_score") or 0.0) for f in flags) / len(flags), 1) if flags else 0.0
    
    high_flags = []
    for f in sorted(flags, key=lambda x: float(x.get("similarity_score") or 0.0), reverse=True)[:10]:
        cand = f.get("attempts") or {}
        matched = f.get("matched") or {}
        high_flags.append({
            "id": f["id"],
            "attemptId": f["attempt_id"],
            "candidateId": cand.get("candidate_id"),
            "similarityScore": f.get("similarity_score") or 0.0,
            "matchedWith": matched.get("candidate_id"),
            "status": f.get("status")
        })
        
    return {"totalFlags": total_flags, "avgSimilarity": avg_sim, "highFlags": high_flags}

@router.get("/interview-funnel")
async def get_interview_funnel(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    jobs_res = await db.from_("jobs").select("id").eq("created_by", recruiter_id)
    job_ids = [j["id"] for j in (jobs_res.data or [])]
    
    exams_res = await db.from_("exams").select("id").eq("created_by", recruiter_id)
    exam_ids = [e["id"] for e in (exams_res.data or [])]
    
    if not job_ids and not exam_ids:
        return {"funnel": [], "scoreDistribution": [], "avgScores": {}}
        
    conds = []
    if job_ids:
        conds.append(f"job_id.in.({','.join(job_ids)})")
    if exam_ids:
        conds.append(f"exam_id.in.({','.join(exam_ids)})")
        
    res = await db.from_("ai_interviews").select("status, score, selected").or_(",".join(conds))
    list_ivs = res.data or []
    
    scheduled = sum(1 for i in list_ivs if i.get("status") in ["scheduled", "pending"])
    started = sum(1 for i in list_ivs if i.get("status") == "in_progress")
    completed = sum(1 for i in list_ivs if i.get("status") == "completed")
    selected = sum(1 for i in list_ivs if i.get("selected"))
    
    funnel = [
        {"stage": "Scheduled", "count": scheduled},
        {"stage": "Started", "count": started},
        {"stage": "Completed", "count": completed},
        {"stage": "Selected", "count": selected}
    ]
    
    completed_ivs = [i for i in list_ivs if i.get("status") == "completed"]
    score_dist = [
        {"band": "0-40", "count": sum(1 for i in completed_ivs if float(i.get("score") or 0.0) < 40)},
        {"band": "40-60", "count": sum(1 for i in completed_ivs if 40 <= float(i.get("score") or 0.0) < 60)},
        {"band": "60-80", "count": sum(1 for i in completed_ivs if 60 <= float(i.get("score") or 0.0) < 80)},
        {"band": "80-100", "count": sum(1 for i in completed_ivs if float(i.get("score") or 0.0) >= 80)}
    ]
    
    avg_s = round(sum(float(i.get("score") or 0.0) for i in completed_ivs) / len(completed_ivs)) if completed_ivs else 0
    
    return {"funnel": funnel, "scoreDistribution": score_dist, "avgScores": {"overall": avg_s}, "total": len(list_ivs)}

@router.get("/time-to-complete")
async def get_time_to_complete(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    attempts_res = await db.from_("attempts").select("*, exams:exam_id(title, duration, total_marks)").eq("recruiter_id", recruiter_id).eq("status", "completed").is_not("submitted_at", None)
    attempts = attempts_res.data or []
    
    data = []
    for a in attempts:
        exam = a.get("exams") or {}
        try:
            started = datetime.datetime.fromisoformat(a["started_at"].replace("Z", "+00:00")).timestamp()
            submitted = datetime.datetime.fromisoformat(a["submitted_at"].replace("Z", "+00:00")).timestamp()
            dur = max(0.0, submitted - started)
        except Exception:
            dur = 0.0
        allotted = float(exam.get("duration") or 0.0) * 60.0
        pct = round((dur / allotted) * 100) if allotted else 0
        data.append({
            "attemptId": a["id"],
            "examTitle": exam.get("title") or "Unknown",
            "durationSec": round(dur),
            "allottedSec": allotted,
            "percentageUsed": pct,
            "score": a.get("score") or 0.0,
            "totalMarks": exam.get("total_marks") or 0.0
        })
        
    avg_time = round(sum(d["durationSec"] for d in data) / len(data)) if data else 0
    avg_pct = round(sum(d["percentageUsed"] for d in data) / len(data)) if data else 0
    
    return {"data": data, "avgTime": avg_time, "avgPercentageUsed": avg_pct, "count": len(data)}

@router.get("/coding-languages")
async def get_recruiter_coding_languages(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    att_res = await db.from_("attempts").select("id").eq("recruiter_id", recruiter_id).eq("status", "completed")
    attempt_ids = [a["id"] for a in (att_res.data or [])]
    
    subs = []
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("language, score").in_("attempt_id", attempt_ids)
        subs = subs_res.data or []
        
    lang_map = {}
    for s in subs:
        lang = s.get("language") or "unknown"
        if lang not in lang_map:
            lang_map[lang] = {"count": 0, "success": 0, "totalScore": 0.0}
        lang_map[lang]["count"] += 1
        if float(s.get("score") or 0.0) > 0.0:
            lang_map[lang]["success"] += 1
        lang_map[lang]["totalScore"] += float(s.get("score") or 0.0)
        
    languages = []
    for lang, stats in lang_map.items():
        languages.append({
            "language": lang,
            "count": stats["count"],
            "successRate": round((stats["success"] / stats["count"]) * 100) if stats["count"] else 0,
            "avgScore": round(stats["totalScore"] / stats["count"], 1) if stats["count"] else 0.0
        })
        
    return {"languages": languages, "totalSubmissions": len(subs)}
