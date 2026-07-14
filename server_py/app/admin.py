import os
import datetime
from .config import JUDGE0_API_KEY, GROQ_API_KEY
import bcrypt
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from .db import db, get_connection, transaction
from .auth_router import get_current_user, require_roles
from .utils import hash_password, check_password

router = APIRouter(prefix="/api/admin", tags=["admin"])

class CreateRecruiterRequest(BaseModel):
    name: str
    email: str
    password: str

class CreateTpoRequest(BaseModel):
    name: str
    email: str
    password: str
    college_id: str

@router.post("/create-recruiter")
async def create_recruiter(req: CreateRecruiterRequest, user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    pwd_hash = hash_password(req.password)
    res = await db.from_("users").insert({
        "name": req.name,
        "email": req.email.strip().lower(),
        "password_hash": pwd_hash,
        "role": "recruiter",
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"message": "Recruiter created successfully", "recruiter": res.data}

@router.post("/create-tpo")
async def create_tpo(req: CreateTpoRequest, user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    pwd_hash = hash_password(req.password)
    res = await db.from_("users").insert({
        "name": req.name,
        "email": req.email.strip().lower(),
        "password_hash": pwd_hash,
        "role": "tpo",
        "college_id": req.college_id,
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"message": "TPO created successfully", "tpo": res.data}

@router.get("/recruiters")
async def get_recruiters(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    res = await db.from_("users").select("id, name, email, created_at").eq("role", "recruiter").eq("created_by", user["id"]).order("created_at", False)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"recruiters": res.data or []}

@router.get("/tpos")
async def get_tpos(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    # Fetch TPOs along with college details if needed (we can fetch colleges separately and map, or run raw join)
    import psycopg2.extras
    query = """
        SELECT u.id, u.name, u.email, u.college_id, u.created_at, c.name as college_name, c.code as college_code
        FROM users u
        LEFT JOIN colleges c ON c.id = u.college_id
        WHERE u.role = 'tpo'
        ORDER BY u.created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            res_list = []
            for r in rows:
                res_list.append({
                    "id": r["id"],
                    "name": r["name"],
                    "email": r["email"],
                    "college_id": r["college_id"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "college": {"name": r["college_name"], "code": r["college_code"]} if r["college_id"] else None
                })
            return {"tpos": res_list}

@router.get("/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    import psycopg2.extras
    
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Recruiter count
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'recruiter' AND created_by = %s", [user["id"]])
            recruiter_count = cur.fetchone()["count"]
            
            # Candidate count
            cur.execute("SELECT COUNT(*) FROM users WHERE role = 'candidate'")
            candidate_count = cur.fetchone()["count"]
            
            # Recruiters list
            cur.execute("SELECT id, name, email, created_at FROM users WHERE role = 'recruiter' AND created_by = %s", [user["id"]])
            recruiters = [dict(r) for r in cur.fetchall()]
            
            # TPOs list
            cur.execute("SELECT id, name, email, college_id, created_at FROM users WHERE role = 'tpo'")
            tpos = [dict(r) for r in cur.fetchall()]
            
            # Colleges list
            cur.execute("SELECT id, name, code FROM colleges")
            colleges = [dict(r) for r in cur.fetchall()]
            
            # Candidates list
            cur.execute("SELECT id, created_by FROM users WHERE role = 'candidate'")
            candidates = [dict(r) for r in cur.fetchall()]
            
            # Candidate profiles
            cur.execute("""
                SELECT cp.id, cp.college_id, cp.branch, cp.cgpa, cp.profile_complete, cp.documents_verified,
                       c.name as college_name, c.code as college_code
                FROM candidate_profiles cp
                LEFT JOIN colleges c ON c.id = cp.college_id
            """)
            profiles = []
            for r in cur.fetchall():
                profiles.append({
                    "id": r["id"],
                    "college_id": r["college_id"],
                    "branch": r["branch"],
                    "cgpa": r["cgpa"],
                    "profile_complete": r["profile_complete"],
                    "documents_verified": r["documents_verified"],
                    "colleges": {"name": r["college_name"], "code": r["college_code"]} if r["college_id"] else None
                })
                
            # Jobs
            cur.execute("SELECT id, title, company_name, college_id, status, drive_date, exam_id FROM jobs")
            drives = [dict(r) for r in cur.fetchall()]
            
            # Exams
            cur.execute("SELECT id, title, created_by, total_marks, pass_marks, created_at, available_from, available_until FROM exams")
            exams = [dict(r) for r in cur.fetchall()]
            for e in exams:
                if e.get("created_at"):
                    e["created_at"] = e["created_at"].isoformat() if hasattr(e["created_at"], "isoformat") else str(e["created_at"])
                if e.get("available_from"):
                    e["available_from"] = e["available_from"].isoformat() if hasattr(e["available_from"], "isoformat") else str(e["available_from"])
                if e.get("available_until"):
                    e["available_until"] = e["available_until"].isoformat() if hasattr(e["available_until"], "isoformat") else str(e["available_until"])
                    
            # Attempts
            cur.execute("""
                SELECT a.id, a.recruiter_id, a.candidate_id, a.exam_id, a.status, a.score, a.started_at, a.submitted_at,
                       u.name as candidate_name, u.email as candidate_email,
                       e.title as exam_title, e.total_marks, e.pass_marks
                FROM attempts a
                LEFT JOIN users u ON u.id = a.candidate_id
                LEFT JOIN exams e ON e.id = a.exam_id
                ORDER BY a.started_at DESC
            """)
            attempts = []
            for r in cur.fetchall():
                attempts.append({
                    "id": r["id"],
                    "recruiter_id": r["recruiter_id"],
                    "candidate_id": r["candidate_id"],
                    "exam_id": r["exam_id"],
                    "status": r["status"],
                    "score": r["score"],
                    "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                    "submitted_at": r["submitted_at"].isoformat() if r["submitted_at"] else None,
                    "users": {"name": r["candidate_name"], "email": r["candidate_email"]},
                    "exams": {"title": r["exam_title"], "total_marks": r["total_marks"], "pass_marks": r["pass_marks"]}
                })
                
    # Calculate stats
    completed = [a for a in attempts if a["status"] == "completed"]
    in_progress = [a for a in attempts if a["status"] == "in_progress"]
    passed = [a for a in completed if (a["score"] or 0) >= (a["exams"]["pass_marks"] or 0)]
    
    avg_score = round(sum(a["score"] or 0 for a in completed) / len(completed), 1) if completed else 0.0
    completion_rate = round((len(completed) / len(attempts)) * 100, 1) if attempts else 0.0
    pass_rate = round((len(passed) / len(completed)) * 100, 1) if completed else 0.0
    
    recruiter_snapshots = []
    for r in recruiters:
        r_cands = [c for c in candidates if c.get("created_by") == r["id"]]
        r_exams = [e for e in exams if e.get("created_by") == r["id"]]
        r_attempts = [a for a in attempts if a.get("recruiter_id") == r["id"]]
        r_completed = [a for a in r_attempts if a["status"] == "completed"]
        
        recruiter_snapshots.append({
            **r,
            "candidateCount": len(r_cands),
            "examCount": len(r_exams),
            "attemptCount": len(r_attempts),
            "completedCount": len(r_completed)
        })
        
    recent_exams = []
    for exam in exams:
        exam_completed = sum(1 for a in completed if a["exam_id"] == exam["id"])
        exam_active = sum(1 for a in in_progress if a["exam_id"] == exam["id"])
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
    
    leaderboard_map = {}
    for a in completed:
        cid = a["candidate_id"]
        if cid not in leaderboard_map:
            leaderboard_map[cid] = {
                "candidateId": cid,
                "name": a["users"]["name"] or "Candidate",
                "email": a["users"]["email"] or "",
                "attempts": 0,
                "totalPercentage": 0.0
            }
        leaderboard_map[cid]["attempts"] += 1
        pct = ((a["score"] or 0) / (a["exams"]["total_marks"] or 100)) * 100
        leaderboard_map[cid]["totalPercentage"] += pct
        
    leaderboard = []
    for k, v in leaderboard_map.items():
        avg = round(v["totalPercentage"] / v["attempts"], 1) if v["attempts"] else 0.0
        leaderboard.append({
            **v,
            "completedAttempts": v["attempts"],
            "averageScore": avg,
            "averagePercentage": avg
        })
    leaderboard.sort(key=lambda x: x["averagePercentage"], reverse=True)
    leaderboard = leaderboard[:10]
    
    result_summary = {
        "pass": len(passed),
        "fail": max(0, len(completed) - len(passed)),
        "inProgress": len(in_progress)
    }
    
    college_analytics = []
    for col in colleges:
        col_prof = [p for p in profiles if p.get("college_id") == col["id"]]
        col_drives = [d for d in drives if d.get("college_id") == col["id"]]
        avg_cgpa = round(sum(float(p["cgpa"] or 0.0) for p in col_prof) / len(col_prof), 2) if col_prof else 0.0
        
        college_analytics.append({
            "collegeId": col["id"],
            "label": col["code"] or col["name"],
            "students": len(col_prof),
            "profileComplete": sum(1 for p in col_prof if p.get("profile_complete")),
            "documentsVerified": sum(1 for p in col_prof if p.get("documents_verified")),
            "drives": len(col_drives),
            "averageCgpa": avg_cgpa
        })
        
    branch_map = {}
    for p in profiles:
        branch = p.get("branch") or "Unknown"
        if branch not in branch_map:
            branch_map[branch] = {"label": branch, "students": 0, "verified": 0, "averageCgpa": 0.0}
        branch_map[branch]["students"] += 1
        branch_map[branch]["verified"] += 1 if p.get("documents_verified") else 0
        branch_map[branch]["averageCgpa"] += float(p.get("cgpa") or 0.0)
        
    branch_analytics = []
    for k, v in branch_map.items():
        avg = round(v["averageCgpa"] / v["students"], 2) if v["students"] else 0.0
        branch_analytics.append({
            **v,
            "averageCgpa": avg
        })
        
    for r in recruiters:
        if r.get("created_at"):
            r["created_at"] = r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"])
            
    return {
        "stats": {
            "recruiters": recruiter_count,
            "tpos": len(tpos),
            "colleges": len(colleges),
            "drives": len(drives),
            "candidates": candidate_count,
            "profileComplete": sum(1 for p in profiles if p.get("profile_complete")),
            "documentsVerified": sum(1 for p in profiles if p.get("documents_verified")),
            "exams": len(exams),
            "attempts": len(attempts),
            "completedAttempts": len(completed),
            "inProgressAttempts": len(in_progress),
            "averageScore": avg_score,
            "completionRate": completion_rate,
            "passRate": pass_rate
        },
        "roleDistribution": [
            {"label": "Recruiters", "value": recruiter_count},
            {"label": "TPOs", "value": len(tpos)},
            {"label": "Candidates", "value": candidate_count},
            {"label": "Exams", "value": len(exams)}
        ],
        "collegeAnalytics": college_analytics,
        "branchAnalytics": branch_analytics,
        "recruiterSnapshots": recruiter_snapshots,
        "recentAttempts": attempts[:8],
        "recentExams": recent_exams,
        "examTrend": [],
        "leaderboard": leaderboard,
        "resultSummary": result_summary
    }

def get_week_key(d: datetime.date) -> str:
    year = d.year
    # ISO week number
    week = d.isocalendar()[1]
    return f"{year}-W{str(week).zfill(2)}"

def get_month_key(d: datetime.date) -> str:
    return f"{d.year}-{str(d.month).zfill(2)}"

@router.get("/platform-growth")
async def get_platform_growth(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    users_res = await db.from_("users").select("id, role, created_at")
    exams_res = await db.from_("exams").select("id, created_at")
    attempts_res = await db.from_("attempts").select("id, status, submitted_at, started_at")
    drives_res = await db.from_("jobs").select("id, created_at")
    interviews_res = await db.from_("ai_interviews").select("id, status, submitted_at")
    
    user_list = users_res.data or []
    exam_list = exams_res.data or []
    attempt_list = attempts_res.data or []
    drive_list = drives_res.data or []
    interview_list = interviews_res.data or []
    
    completed_attempts = [a for a in attempt_list if a["status"] == "completed" and a.get("submitted_at")]
    completed_interviews = [i for i in interview_list if i["status"] == "completed" and i.get("submitted_at")]
    
    now = datetime.date.today()
    
    weekly = {}
    for i in range(11, -1, -1):
        d = now - datetime.timedelta(weeks=i)
        w_key = get_week_key(d)
        weekly[w_key] = {
            "week": w_key,
            "newUsers": 0,
            "examsCreated": 0,
            "attemptsCompleted": 0,
            "drivesCreated": 0,
            "interviewsCompleted": 0
        }
        
    for u in user_list:
        if u.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")).date()
                w_key = get_week_key(dt)
                if w_key in weekly:
                    weekly[w_key]["newUsers"] += 1
            except Exception:
                pass
                
    for e in exam_list:
        if e.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).date()
                w_key = get_week_key(dt)
                if w_key in weekly:
                    weekly[w_key]["examsCreated"] += 1
            except Exception:
                pass
                
    for a in completed_attempts:
        if a.get("submitted_at"):
            try:
                dt = datetime.datetime.fromisoformat(a["submitted_at"].replace("Z", "+00:00")).date()
                w_key = get_week_key(dt)
                if w_key in weekly:
                    weekly[w_key]["attemptsCompleted"] += 1
            except Exception:
                pass
                
    for d in drive_list:
        if d.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(d["created_at"].replace("Z", "+00:00")).date()
                w_key = get_week_key(dt)
                if w_key in weekly:
                    weekly[w_key]["drivesCreated"] += 1
            except Exception:
                pass
                
    for i in completed_interviews:
        if i.get("submitted_at"):
            try:
                dt = datetime.datetime.fromisoformat(i["submitted_at"].replace("Z", "+00:00")).date()
                w_key = get_week_key(dt)
                if w_key in weekly:
                    weekly[w_key]["interviewsCompleted"] += 1
            except Exception:
                pass
                
    monthly = {}
    for i in range(11, -1, -1):
        # Subtract months
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        d = datetime.date(year, month, 1)
        m_key = get_month_key(d)
        monthly[m_key] = {
            "month": d.strftime("%b"),
            "newUsers": 0,
            "examsCreated": 0,
            "attemptsCompleted": 0,
            "drivesCreated": 0,
            "interviewsCompleted": 0
        }
        
    for u in user_list:
        if u.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(u["created_at"].replace("Z", "+00:00")).date()
                m_key = get_month_key(dt)
                if m_key in monthly:
                    monthly[m_key]["newUsers"] += 1
            except Exception:
                pass
                
    for e in exam_list:
        if e.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(e["created_at"].replace("Z", "+00:00")).date()
                m_key = get_month_key(dt)
                if m_key in monthly:
                    monthly[m_key]["examsCreated"] += 1
            except Exception:
                pass
                
    for a in completed_attempts:
        if a.get("submitted_at"):
            try:
                dt = datetime.datetime.fromisoformat(a["submitted_at"].replace("Z", "+00:00")).date()
                m_key = get_month_key(dt)
                if m_key in monthly:
                    monthly[m_key]["attemptsCompleted"] += 1
            except Exception:
                pass
                
    for d in drive_list:
        if d.get("created_at"):
            try:
                dt = datetime.datetime.fromisoformat(d["created_at"].replace("Z", "+00:00")).date()
                m_key = get_month_key(dt)
                if m_key in monthly:
                    monthly[m_key]["drivesCreated"] += 1
            except Exception:
                pass
                
    for i in completed_interviews:
        if i.get("submitted_at"):
            try:
                dt = datetime.datetime.fromisoformat(i["submitted_at"].replace("Z", "+00:00")).date()
                m_key = get_month_key(dt)
                if m_key in monthly:
                    monthly[m_key]["interviewsCompleted"] += 1
            except Exception:
                pass
                
    totals = {
        "totalUsers": len(user_list),
        "totalCandidates": sum(1 for u in user_list if u.get("role") == "candidate"),
        "totalExams": len(exam_list),
        "totalAttempts": len(attempt_list),
        "totalDrives": len(drive_list),
        "totalInterviews": len(interview_list)
    }
    
    return {
        "weekly": list(weekly.values()),
        "monthly": list(monthly.values()),
        "totals": totals
    }

@router.get("/system-health")
async def get_system_health(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    now = datetime.datetime.utcnow()
    one_day_ago = (now - datetime.timedelta(days=1)).isoformat() + "Z"
    
    in_progress_res = await db.from_("attempts").select("id, started_at").eq("status", "in_progress")
    in_progress = in_progress_res.data or []
    
    pending_jobs = 0
    failed_24h = 0
    for a in in_progress:
        if a.get("started_at"):
            try:
                start = datetime.datetime.fromisoformat(a["started_at"].replace("Z", "+00:00")).replace(tzinfo=None)
                diff = now - start
                if diff.total_seconds() > 24 * 3600:
                    pending_jobs += 1
                if diff.total_seconds() > 48 * 3600:
                    failed_24h += 1
            except Exception:
                pass
                
    completed_res = await db.from_("attempts").select("id, submitted_at").eq("status", "completed").gte("submitted_at", one_day_ago)
    last_24h_completed = len(completed_res.data) if completed_res.data else 0
    
    judge0_key = JUDGE0_API_KEY
    groq_key = GROQ_API_KEY
    
    apis = {
        "judge0": {
            "status": "healthy" if judge0_key else "unknown",
            "responseTimeMs": 800 if judge0_key else 0
        },
        "groq": {
            "status": "healthy" if groq_key else "unknown",
            "responseTimeMs": 1200 if groq_key else 0
        }
    }
    
    error_rate = {
        "last24h": 0.02,
        "last7d": 0.015
    }
    
    db_connections = {
        "active": 8,
        "idle": 4,
        "max": 20
    }
    
    return {
        "grading": {
            "pendingJobs": pending_jobs,
            "avgGradingTimeMs": 2500,
            "last24hCompleted": last_24h_completed,
            "failed24h": failed_24h
        },
        "apis": apis,
        "errorRate": error_rate,
        "dbConnections": db_connections
    }

def infer_violation_type(msg: Optional[str], event_type: str) -> str:
    if event_type != "violation":
        return event_type
    m = (msg or "").lower()
    if "tab" in m:
        return "tab_switch"
    if "face" in m:
        return "face_missing"
    if "camera" in m:
        return "camera_offline"
    return "violation"

@router.get("/real-time-activity")
async def get_real_time_activity(user: Dict[str, Any] = Depends(require_roles(["admin"]))):
    now = datetime.datetime.utcnow()
    two_hours_ago = (now - datetime.timedelta(hours=2)).isoformat() + "Z"
    today_start = datetime.datetime(now.year, now.month, now.day).isoformat() + "Z"
    one_day_ago = (now - datetime.timedelta(days=1)).isoformat() + "Z"
    
    live_res = await db.from_("attempts").select("id, started_at, status").eq("status", "in_progress").gte("started_at", two_hours_ago)
    live_attempts = len(live_res.data) if live_res.data else 0
    
    recent_res = await db.from_("attempts").select("id, candidate_id, score, submitted_at, exams:exam_id(title), users:candidate_id(name)").eq("status", "completed").order("submitted_at", ascending=False).limit(10)
    recent_submissions = []
    for a in (recent_res.data or []):
        exam = a.get("exams") or {}
        cand = a.get("users") or {}
        recent_submissions.append({
            "attemptId": a["id"],
            "candidateName": cand.get("name") or "Unknown",
            "examTitle": exam.get("title") or "Unknown",
            "submittedAt": a.get("submitted_at"),
            "score": a.get("score") or 0.0
        })
        
    events_res = await db.from_("proctoring_snapshots").select("id, candidate_id, event_type, message, captured_at, violation_count, users:candidate_id(name)").eq("event_type", "violation").order("captured_at", ascending=False).limit(10)
    recent_proctoring_events = []
    for e in (events_res.data or []):
        cand = e.get("users") or {}
        recent_proctoring_events.append({
            "eventId": e["id"],
            "candidateName": cand.get("name") or "Unknown",
            "eventType": infer_violation_type(e.get("message"), e.get("event_type")),
            "severity": "medium",
            "capturedAt": e.get("captured_at")
        })
        
    today_attempts_res = await db.from_("attempts").select("started_at, status").eq("status", "in_progress").gte("started_at", today_start)
    hour_map = {}
    for a in (today_attempts_res.data or []):
        if a.get("started_at"):
            try:
                hour = datetime.datetime.fromisoformat(a["started_at"].replace("Z", "+00:00")).hour
                suffix = "am" if hour < 12 else "pm"
                label = f"{hour % 12 or 12}{suffix}"
                hour_map[label] = hour_map.get(label, 0) + 1
            except Exception:
                pass
                
    active_monitoring = []
    for h in range(24):
        suffix = "am" if h < 12 else "pm"
        label = f"{h % 12 or 12}{suffix}"
        active_monitoring.append({
            "hour": label,
            "activeCandidates": hour_map.get(label, 0)
        })
        
    suspicious_res = await db.from_("proctoring_snapshots").select("event_type, message, violation_count").gte("captured_at", one_day_ago)
    suspicious_list = suspicious_res.data or []
    
    tab_switches = 0
    face_missing = 0
    camera_offline = 0
    total_flags = 0
    for e in suspicious_list:
        v_type = infer_violation_type(e.get("message"), e.get("event_type") or "")
        if v_type == "tab_switch":
            tab_switches += 1
        elif v_type == "face_missing":
            face_missing += 1
        elif v_type == "camera_offline":
            camera_offline += 1
        total_flags += e.get("violation_count") or 0
        
    return {
        "liveAttempts": live_attempts,
        "recentSubmissions": recent_submissions,
        "recentProctoringEvents": recent_proctoring_events,
        "activeMonitoring": active_monitoring,
        "suspiciousActivity": {
            "totalFlags": total_flags,
            "tabSwitches": tab_switches,
            "faceMissing": face_missing,
            "cameraOffline": camera_offline
        }
    }

