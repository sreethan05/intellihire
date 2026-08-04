import os
import datetime
import bcrypt
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .db import db, get_connection, transaction
from .auth_router import get_current_user, require_roles
from .utils import hash_password, check_password

router = APIRouter(prefix="/api/tpo", tags=["tpo"])

class StudentRow(BaseModel):
    roll_number: str
    name: str
    email: str
    branch: str
    cgpa: float
    graduation_year: int

class UploadStudentsRequest(BaseModel):
    rows: List[StudentRow]

class StudentVerificationRequest(BaseModel):
    documents_verified: bool

class VerifyStudentBatchRequest(BaseModel):
    studentIds: List[str]
    documents_verified: bool

async def get_tpo_college(user_id: str) -> str:
    res = await db.from_("users").select("college_id").eq("id", user_id).single()
    if res.error or not res.data or not res.data.get("college_id"):
        raise HTTPException(status_code=400, detail="TPO is not linked to a college")
    return res.data["college_id"]

async def provision_candidate_accounts(rows: List[StudentRow], college_id: str, creator_id: str):
    created = []
    failed = []
    
    for row in rows:
        email = row.email.strip().lower()
        roll = row.roll_number.strip().upper()
        
        try:
            # Check existing candidate
            res = await db.from_("users").select("*").eq("email", email).limit(1)
            user = res.data[0] if res.data else None
            
            if not user:
                res = await db.from_("users").select("*").eq("roll_number", roll).limit(1)
                user = res.data[0] if res.data else None
                
            if user:
                if user.get("role") != "candidate":
                    failed.append({"row": row.dict(), "reason": f"Email/Roll matches an existing non-candidate user ({user.get('role')})"})
                    continue
                # If they are linked to a different college, fail it
                if user.get("college_id") and user["college_id"] != college_id:
                    failed.append({"row": row.dict(), "reason": "Candidate already registered under a different college"})
                    continue
            
            # Create user if not exists
            if not user:
                # Default password format matches JS: roll number in lowercase
                pwd_plain = roll.lower()
                pwd_hash = hash_password(pwd_plain)
                
                user_res = await db.from_("users").insert({
                    "name": row.name.strip(),
                    "email": email,
                    "roll_number": roll,
                    "password_hash": pwd_hash,
                    "role": "candidate",
                    "college_id": college_id,
                    "created_by": creator_id
                }).select().single()
                
                if user_res.error or not user_res.data:
                    failed.append({"row": row.dict(), "reason": user_res.error.message if user_res.error else "Failed to create user"})
                    continue
                user = user_res.data
                
            # Create or update candidate profile
            prof_res = await db.from_("candidate_profiles").select("*").eq("user_id", user["id"]).maybeSingle()
            profile = prof_res.data
            
            profile_data = {
                "user_id": user["id"],
                "college_id": college_id,
                "branch": row.branch.strip().upper(),
                "cgpa": row.cgpa,
                "graduation_year": row.graduation_year,
                "profile_complete": True,
                "documents_verified": False
            }
            
            if profile:
                # Update profile
                upd_res = await db.from_("candidate_profiles").update(profile_data).eq("id", profile["id"]).select().single()
                if upd_res.error:
                    failed.append({"row": row.dict(), "reason": f"Profile update failed: {upd_res.error.message}"})
                    continue
            else:
                # Insert profile
                ins_res = await db.from_("candidate_profiles").insert(profile_data).select().single()
                if ins_res.error:
                    failed.append({"row": row.dict(), "reason": f"Profile creation failed: {ins_res.error.message}"})
                    continue
                    
            # Mark user profile complete
            await db.from_("users").update({"profile_complete": True}).eq("id", user["id"])
            created.append(user)
            
        except Exception as exc:
            failed.append({"row": row.dict(), "reason": f"Unexpected error: {str(exc)}"})
            
    return created, failed

@router.get("/dashboard")
async def get_dashboard(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    
    # 1. Fetch drives
    drives_res = await db.from_("jobs").select("id, title, company_name, drive_date, status").eq("college_id", college_id).order("created_at", False)
    drives = drives_res.data or []
    drive_ids = [d["id"] for d in drives]
    
    # 2. Profiles and Attempts
    profiles_res = await db.from_("candidate_profiles").select("id, user_id, branch, cgpa, profile_complete, documents_verified").eq("college_id", college_id)
    students = profiles_res.data or []
    student_ids = {s["user_id"] for s in students}
    
    # Attempts
    from psycopg.rows import dict_row
    attempts = []
    if student_ids:
        # Use psycopg2 to run dynamic list in attempts
        query = """
            SELECT a.id, a.candidate_id, a.status, a.score, e.total_marks
            FROM attempts a
            LEFT JOIN exams e ON e.id = a.exam_id
            WHERE a.status = 'completed' AND a.candidate_id IN %s
        """
        with get_connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(query, [tuple(student_ids)])
                attempts = [dict(r) for r in cur.fetchall()]
                
    # Candidate placements
    placed_count = 0
    if drive_ids:
        placed_res = await db.from_("candidate_status").select("id").in_("job_id", drive_ids).eq("status", "offered")
        placed_count = len(placed_res.data) if placed_res.data else 0
        
    branch_map = {}
    for student in students:
        b = student.get("branch") or "Unknown"
        if b not in branch_map:
            branch_map[b] = {"branch": b, "count": 0, "verified": 0, "complete": 0, "averageCgpa": 0.0, "placed": 0}
        branch_map[b]["count"] += 1
        branch_map[b]["verified"] += 1 if student.get("documents_verified") else 0
        branch_map[b]["complete"] += 1 if student.get("profile_complete") else 0
        branch_map[b]["averageCgpa"] += float(student.get("cgpa") or 0.0)
        
    cgpa_bands = [
        {"label": "9.0+", "min": 9.0, "max": 10.1},
        {"label": "8.0-8.9", "min": 8.0, "max": 9.0},
        {"label": "7.0-7.9", "min": 7.0, "max": 8.0},
        {"label": "Below 7", "min": 0.0, "max": 7.0}
    ]
    bands_res = []
    for band in cgpa_bands:
        count = sum(1 for s in students if float(s.get("cgpa") or 0.0) >= band["min"] and float(s.get("cgpa") or 0.0) < band["max"])
        bands_res.append({"label": band["label"], "students": count})
        
    total_marks_sum = 0
    score_sum = 0
    for a in attempts:
        total_marks = a.get("total_marks") or 100
        score = a.get("score") or 0
        score_sum += (score / total_marks) * 100
        
    avg_attempt_pct = round(score_sum / len(attempts), 1) if attempts else 0.0
    
    # Enrich branch breakdown average CGPA
    branch_breakdown = []
    for b_info in branch_map.values():
        b_info["averageCgpa"] = round(b_info["averageCgpa"] / b_info["count"], 2) if b_info["count"] else 0.0
        branch_breakdown.append(b_info)
        
    # Get college name/details
    college_res = await db.from_("colleges").select("id, name, code").eq("id", college_id).single()
    
    total_students = len(students)
    avg_cgpa = round(sum(float(s.get("cgpa") or 0.0) for s in students) / total_students, 2) if total_students else 0.0
    
    return {
        "college": college_res.data,
        "stats": {
            "students": total_students,
            "profileComplete": sum(1 for s in students if s.get("profile_complete")),
            "pendingVerification": sum(1 for s in students if not s.get("documents_verified")),
            "activeDrives": sum(1 for d in drives if d.get("status") == "active"),
            "placed": placed_count,
            "placementRate": round((placed_count / total_students) * 100, 1) if total_students else 0.0,
            "averageCgpa": avg_cgpa,
            "averageAttemptPercentage": avg_attempt_pct
        },
        "branchBreakdown": branch_breakdown,
        "cgpaBands": bands_res,
        "recentDrives": drives
    }

@router.post("/upload-students")
async def upload_students(req: UploadStudentsRequest, user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    created, failed = await provision_candidate_accounts(req.rows, college_id, user["id"])
    return {
        "message": f"{len(created)} student account(s) processed",
        "created": created,
        "failed": failed
    }

@router.get("/students")
async def get_students(page: int = 1, limit: int = 10, user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    offset = (page - 1) * limit
    
    # Use raw SQL join to fetch candidate profiles along with users
    query = """
        SELECT cp.*, u.id as user_id, u.name, u.email, u.roll_number, u.profile_complete, u.created_at as user_created_at
        FROM candidate_profiles cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.college_id = %s
        ORDER BY cp.created_at DESC
        LIMIT %s OFFSET %s
    """
    count_query = "SELECT COUNT(*) FROM candidate_profiles WHERE college_id = %s"
    
    from psycopg.rows import dict_row
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, [college_id, limit, offset])
            rows = cur.fetchall()
            
            cur.execute(count_query, [college_id])
            total = cur.fetchone()["count"]
            
            enriched = []
            for r in rows:
                enriched.append({
                    **dict(r),
                    "user": {
                        "id": r["user_id"],
                        "name": r["name"],
                        "email": r["email"],
                        "roll_number": r["roll_number"],
                        "profile_complete": r["profile_complete"],
                        "created_at": r["user_created_at"].isoformat() if r["user_created_at"] else None
                    }
                })
                
            return {"students": enriched, "total": total, "page": page, "limit": limit}

@router.patch("/students/{profile_id}/verification")
async def verify_student(profile_id: str, req: StudentVerificationRequest, user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    
    res = await db.from_("candidate_profiles").update({
        "documents_verified": req.documents_verified,
        "placement_ready": req.documents_verified
    }).eq("id", profile_id).eq("college_id", college_id).select().single()
    
    if res.error or not res.data:
        raise HTTPException(status_code=400, detail=res.error.message if res.error else "Profile not found")
        
    return {"student": res.data}

@router.get("/dashboard/summary")
async def get_dashboard_summary(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    
    # 1. Total count candidates
    cand_count = await db.from_("users").select("*", count="exact", head=True).eq("college_id", college_id).eq("role", "candidate")
    total_registered = cand_count.count or 0
    
    # 2. Total eligible vs pending verification
    el_count = await db.from_("candidate_profiles").select("*", count="exact", head=True).eq("college_id", college_id).eq("documents_verified", True)
    total_eligible = el_count.count or 0
    
    pend_count = await db.from_("candidate_profiles").select("*", count="exact", head=True).eq("college_id", college_id).eq("documents_verified", False)
    pending_verification = pend_count.count or 0
    
    # 3. Active Drives
    drives_res = await db.from_("jobs").select("id, title, status, drive_date").eq("college_id", college_id)
    drives = drives_res.data or []
    active_drives_count = sum(1 for j in drives if j.get("status") == "active")
    
    # 4. Placed Res (offered status)
    drive_ids = [d["id"] for d in drives]
    total_placed = 0
    if drive_ids:
        # Check offeree count
        placed_res = await db.from_("candidate_status").select("id").in_("job_id", drive_ids).eq("status", "offered")
        total_placed = len(placed_res.data) if placed_res.data else 0
        
    placement_rate = round((total_placed / total_registered) * 100) if total_registered > 0 else 0
    
    action_items = []
    if pending_verification > 0:
        action_items.append({
            "id": "tpo_docs_verify",
            "title": "Pending Document Verification",
            "description": f"{pending_verification} students are waiting for profile marksheet approvals.",
            "priority": "urgent",
            "action_url": "/tpo/students?tab=pending"
        })
        
    for drive in drives:
        if drive.get("status") == "active" and drive.get("drive_date"):
            # Check if deadline is close (< 2 days)
            try:
                dt = datetime.datetime.fromisoformat(drive["drive_date"].replace("Z", "+00:00"))
                diff = dt - datetime.datetime.now(datetime.timezone.utc)
                if diff.total_seconds() > 0 and diff.total_seconds() < 2 * 24 * 60 * 60:
                    action_items.append({
                        "id": f"tpo_job_{drive['id']}",
                        "title": f"Drive: '{drive['title']}' closing soon",
                        "description": "The application deadline is in less than 2 days.",
                        "priority": "high",
                        "action_url": "/tpo/drives"
                    })
            except Exception:
                pass
                
    return {
        "summary": {
            "totalRegistered": total_registered,
            "totalEligible": total_eligible,
            "totalPlaced": total_placed,
            "activeDrives": active_drives_count,
            "pendingVerification": pending_verification,
            "placementRate": placement_rate,
            "actionItems": action_items
        }
    }

@router.post("/verify/batch")
async def verify_batch(req: VerifyStudentBatchRequest, user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    
    updated = []
    for pid in req.studentIds:
        res = await db.from_("candidate_profiles").update({
            "documents_verified": req.documents_verified,
            "placement_ready": req.documents_verified
        }).eq("id", pid).eq("college_id", college_id).select().single()
        
        if res.data:
            updated.append(res.data)
            
    return {
        "message": f"Batch updated {len(updated)} profile(s).",
        "updated": updated
    }

@router.get("/placement-stats")
async def get_placement_stats(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    if not college_id:
        raise HTTPException(status_code=400, detail="TPO is not linked to a college")
        
    prof_res = await db.from_("candidate_profiles").select("id, user_id, branch, cgpa, graduation_year").eq("college_id", college_id)
    students = prof_res.data or []
    cand_ids = [s["user_id"] for s in students if s.get("user_id")]
    
    statuses = []
    if cand_ids:
        status_res = await db.from_("candidate_status").select("candidate_id, status, job_id, jobs:job_id(company_name, salary_min, salary_max)").in_("candidate_id", cand_ids)
        statuses = status_res.data or []
        
    branch_map = {}
    year_map = {}
    company_map = {}
    
    for s in students:
        student_statuses = [st for st in statuses if st["candidate_id"] == s["user_id"]]
        is_placed = any(st["status"] == "offered" for st in student_statuses)
        placed_job = next((st for st in student_statuses if st["status"] == "offered"), None)
        
        branch = s.get("branch") or "Unknown"
        if branch not in branch_map:
            branch_map[branch] = {
                "branch": branch,
                "totalStudents": 0,
                "placed": 0,
                "totalSalary": 0.0,
                "salaryCount": 0,
                "totalCgpa": 0.0
            }
        b = branch_map[branch]
        b["totalStudents"] += 1
        b["totalCgpa"] += float(s.get("cgpa") or 0.0)
        if is_placed:
            b["placed"] += 1
            job = placed_job.get("jobs") if placed_job else {}
            if isinstance(job, list) and job:
                job = job[0]
            if job and job.get("salary_min") and job.get("salary_max"):
                avg_sal = (float(job["salary_min"]) + float(job["salary_max"])) / 2
                b["totalSalary"] += avg_sal
                b["salaryCount"] += 1
                
        grad_year = s.get("graduation_year") or 0
        if grad_year not in year_map:
            year_map[grad_year] = {
                "year": grad_year,
                "totalStudents": 0,
                "placed": 0
            }
        y = year_map[grad_year]
        y["totalStudents"] += 1
        if is_placed:
            y["placed"] += 1
            
    for status in statuses:
        if status["status"] == "offered":
            job = status.get("jobs")
            if isinstance(job, list) and job:
                job = job[0]
            if not job:
                continue
            company = job.get("company_name") or "Unknown"
            if company not in company_map:
                company_map[company] = {
                    "company": company,
                    "offers": 0,
                    "totalSalary": 0.0,
                    "salaryCount": 0
                }
            c = company_map[company]
            c["offers"] += 1
            if job.get("salary_min") and job.get("salary_max"):
                avg_sal = (float(job["salary_min"]) + float(job["salary_max"])) / 2
                c["totalSalary"] += avg_sal
                c["salaryCount"] += 1
                
    by_branch = []
    for b in branch_map.values():
        by_branch.append({
            "branch": b["branch"],
            "totalStudents": b["totalStudents"],
            "placed": b["placed"],
            "placementRate": round((b["placed"] / b["totalStudents"]) * 100) if b["totalStudents"] else 0,
            "avgSalary": round(b["totalSalary"] / b["salaryCount"], 1) if b["salaryCount"] else 0.0,
            "avgCgpa": round(b["totalCgpa"] / b["totalStudents"], 1) if b["totalStudents"] else 0.0
        })
        
    by_year = []
    for y in year_map.values():
        by_year.append({
            "year": y["year"],
            "totalStudents": y["totalStudents"],
            "placed": y["placed"],
            "placementRate": round((y["placed"] / y["totalStudents"]) * 100) if y["totalStudents"] else 0
        })
        
    top_companies = []
    for c in company_map.values():
        top_companies.append({
            "company": c["company"],
            "offers": c["offers"],
            "avgSalary": round(c["totalSalary"] / c["salaryCount"], 1) if c["salaryCount"] else 0.0
        })
    top_companies.sort(key=lambda x: x["offers"], reverse=True)
    
    return {"byBranch": by_branch, "byYear": by_year, "topCompanies": top_companies}

@router.get("/readiness-heatmap")
async def get_readiness_heatmap(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    import math
    college_id = await get_tpo_college(user["id"])
    if not college_id:
        raise HTTPException(status_code=400, detail="TPO is not linked to a college")
        
    prof_res = await db.from_("candidate_profiles").select("id, user_id, roll_number, branch, cgpa, resume_ats_analysis, resume_url, user:user_id(name)").eq("college_id", college_id)
    students = prof_res.data or []
    cand_ids = [s["user_id"] for s in students if s.get("user_id")]
    
    attempts = []
    all_attempts = []
    if cand_ids:
        att_res = await db.from_("attempts").select("id, candidate_id, score, status, exam_id, exams:exam_id(total_marks)").in_("candidate_id", cand_ids).eq("status", "completed")
        attempts = att_res.data or []
        
        all_att_res = await db.from_("attempts").select("id, candidate_id, exam_id").in_("candidate_id", cand_ids)
        all_attempts = all_att_res.data or []
        
    att_ids = [a["id"] for a in all_attempts]
    att_to_cand = {a["id"]: a["candidate_id"] for a in all_attempts}
    
    coding_subs = []
    if att_ids:
        subs_res = await db.from_("coding_submissions").select("attempt_id, score, coding_questions:coding_question_id(marks)").in_("attempt_id", att_ids)
        coding_subs = subs_res.data or []
        
    interviews = []
    if cand_ids:
        ivs_res = await db.from_("ai_interviews").select("candidate_id, score, status").in_("candidate_id", cand_ids).eq("status", "completed")
        interviews = ivs_res.data or []
        
    exams_res = await db.from_("exams").select("id")
    total_exams = len(exams_res.data) if exams_res.data else 0
    
    student_scores = []
    for s in students:
        candidate_id = s["user_id"]
        student_attempts = [a for a in attempts if a["candidate_id"] == candidate_id]
        student_coding = [c for c in coding_subs if att_to_cand.get(c["attempt_id"]) == candidate_id]
        student_interviews = [i for i in interviews if i["candidate_id"] == candidate_id]
        
        exam_percentages = []
        for a in student_attempts:
            exam = a.get("exams") or {}
            tot = float(exam.get("total_marks") or 100.0)
            exam_percentages.append((float(a.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
        exam_avg = sum(exam_percentages) / len(exam_percentages) if exam_percentages else 0.0
        
        coding_percentages = []
        for c in student_coding:
            q = c.get("coding_questions") or {}
            tot = float(q.get("marks") or 10.0)
            coding_percentages.append((float(c.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
        coding_score = sum(coding_percentages) / len(coding_percentages) if coding_percentages else exam_avg
        
        iv_scores = [float(i.get("score") or 0.0) for i in student_interviews]
        interview_score = sum(iv_scores) / len(iv_scores) if iv_scores else 0.0
        
        consistency = 100.0
        if len(exam_percentages) > 1:
            mean = exam_avg
            variance = sum((p - mean) ** 2 for p in exam_percentages) / len(exam_percentages)
            std_dev = math.sqrt(variance)
            consistency = max(0.0, 100.0 - std_dev)
        elif not exam_percentages:
            consistency = 0.0
            
        uniq_exams = len({a["exam_id"] for a in student_attempts if a.get("exam_id")})
        breadth = (uniq_exams / total_exams) * 100.0 if total_exams else uniq_exams * 10.0
        breadth = min(100.0, breadth)
        
        readiness = round((exam_avg * 0.40) + (coding_score * 0.25) + (interview_score * 0.20) + (consistency * 0.10) + (breadth * 0.05))
        zone = "ready" if readiness >= 75 else "approaching" if readiness >= 50 else "needs_work"
        
        cand_user = s.get("user") or {}
        name = cand_user.get("name") or "Unknown"
        
        student_scores.append({
            "candidateId": candidate_id,
            "name": name,
            "roll_number": s.get("roll_number") or "",
            "branch": s.get("branch") or "",
            "cgpa": float(s.get("cgpa") or 0.0),
            "readinessScore": readiness,
            "zone": zone,
            "resume_ats_analysis": s.get("resume_ats_analysis"),
            "resume_url": s.get("resume_url")
        })
        
    zone_counts = {
        "ready": sum(1 for s in student_scores if s["zone"] == "ready"),
        "approaching": sum(1 for s in student_scores if s["zone"] == "approaching"),
        "needs_work": sum(1 for s in student_scores if s["zone"] == "needs_work")
    }
    
    return {"students": student_scores, "zoneCounts": zone_counts}

@router.get("/company-performance")
async def get_company_performance(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    if not college_id:
        raise HTTPException(status_code=400, detail="TPO is not linked to a college")
        
    jobs_res = await db.from_("jobs").select("id, company_name").eq("college_id", college_id)
    jobs = jobs_res.data or []
    job_ids = [j["id"] for j in jobs]
    
    statuses = []
    if job_ids:
        status_res = await db.from_("candidate_status").select("job_id, status").in_("job_id", job_ids)
        statuses = status_res.data or []
        
    company_map = {}
    for job in jobs:
        company = job.get("company_name") or "Unknown"
        if company not in company_map:
            company_map[company] = {
                "company": company,
                "drives": 0,
                "registered": 0,
                "examTaken": 0,
                "passed": 0,
                "shortlisted": 0,
                "offered": 0
            }
        company_map[company]["drives"] += 1
        
    for status in statuses:
        job = next((j for j in jobs if j["id"] == status["job_id"]), None)
        if not job:
            continue
        company = job.get("company_name") or "Unknown"
        c = company_map.get(company)
        if not c:
            continue
            
        s = status["status"]
        if s == "registered":
            c["registered"] += 1
        if s in ["exam_taken", "passed", "shortlisted", "on_hold", "offered"]:
            c["examTaken"] += 1
        if s in ["passed", "shortlisted", "on_hold", "offered"]:
            c["passed"] += 1
        if s in ["shortlisted", "on_hold", "offered"]:
            c["shortlisted"] += 1
        if s == "offered":
            c["offered"] += 1
            
    companies = []
    for c in company_map.values():
        companies.append({
            "company": c["company"],
            "drives": c["drives"],
            "registered": c["registered"],
            "examTaken": c["examTaken"],
            "passed": c["passed"],
            "shortlisted": c["shortlisted"],
            "offered": c["offered"],
            "conversionRate": round((c["offered"] / c["registered"]) * 100) if c["registered"] else 0
        })
        
    return {"companies": companies}

@router.get("/upload-tracking")
async def get_upload_tracking(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    college_id = await get_tpo_college(user["id"])
    if not college_id:
        raise HTTPException(status_code=400, detail="TPO is not linked to a college")
        
    uploads_res = await db.from_("tpo_uploads").select("id, file_name, rows_total, rows_created, rows_failed, status, created_at").eq("tpo_id", user["id"]).eq("college_id", college_id).order("created_at", ascending=False)
    uploads = uploads_res.data or []
    
    formatted = []
    for u in uploads:
        tot = u.get("rows_total") or 0
        created = u.get("rows_created") or 0
        formatted.append({
            "id": u["id"],
            "fileName": u.get("file_name") or "",
            "rowsTotal": tot,
            "rowsCreated": created,
            "rowsFailed": u.get("rows_failed") or 0,
            "successRate": round((created / tot) * 100) if tot else 0,
            "createdAt": u["created_at"]
        })
        
    now = datetime.date.today()
    months = []
    for i in range(5, -1, -1):
        # Subtract months
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        d = datetime.date(year, month, 1)
        months.append({
            "key": f"{d.year}-{str(d.month).padStart(2, '0')}" if hasattr(str(d.month), "padStart") else f"{d.year}-{str(d.month).zfill(2)}",
            "label": d.strftime("%b")
        })
        
    trend = []
    for m in months:
        m_uploads = [u for u in uploads if u.get("created_at") and u["created_at"].startswith(m["key"])]
        tot_rows = sum(u.get("rows_total") or 0 for u in m_uploads)
        created_rows = sum(u.get("rows_created") or 0 for u in m_uploads)
        trend.append({
            "month": m["label"],
            "uploads": len(m_uploads),
            "successRate": round((created_rows / tot_rows) * 100) if tot_rows else 0
        })
        
    return {"uploads": formatted, "trend": trend}


@router.get("/placement-dashboard")
async def get_placement_dashboard(user: Dict[str, Any] = Depends(require_roles(["tpo"]))):
    """Company-wise placement dashboard: offers by company, average package,
    branch-wise placement, and year-over-year trends.
    """
    college_id = await get_tpo_college(user["id"])

    from psycopg.rows import dict_row

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Company-wise placement counts
            cur.execute("""
                SELECT j.company_name, j.title as job_title,
                       COUNT(cs.id) as total_candidates,
                       COUNT(CASE WHEN cs.status = 'offered' THEN 1 END) as offered,
                       COUNT(CASE WHEN cs.offer_accepted_at IS NOT NULL THEN 1 END) as accepted,
                       AVG(j.salary_min) FILTER (WHERE j.salary_min IS NOT NULL) as avg_package
                FROM candidate_status cs
                JOIN jobs j ON j.id = cs.job_id
                WHERE j.college_id = %s
                GROUP BY j.company_name, j.title
                ORDER BY offered DESC
            """, [college_id])
            companies = [dict(r) for r in cur.fetchall()]

            # Branch-wise placement
            cur.execute("""
                SELECT cp.branch,
                       COUNT(DISTINCT cs.candidate_id) as total_candidates,
                       COUNT(CASE WHEN cs.status = 'offered' THEN 1 END) as offered
                FROM candidate_status cs
                JOIN jobs j ON j.id = cs.job_id
                JOIN candidate_profiles cp ON cp.user_id = cs.candidate_id
                WHERE j.college_id = %s
                GROUP BY cp.branch
                ORDER BY offered DESC
            """, [college_id])
            branches = [dict(r) for r in cur.fetchall()]

            # Overall stats
            cur.execute("""
                SELECT COUNT(DISTINCT cs.candidate_id) as total_placed,
                       COUNT(DISTINCT j.id) as total_companies,
                       AVG(j.salary_min) FILTER (WHERE j.salary_min IS NOT NULL) as avg_package,
                       MAX(j.salary_max) as max_package
                FROM candidate_status cs
                JOIN jobs j ON j.id = cs.job_id
                WHERE j.college_id = %s AND cs.status = 'offered'
            """, [college_id])
            overall = cur.fetchone() or {}

            # Year-wise trends
            cur.execute("""
                SELECT EXTRACT(YEAR FROM cs.offer_accepted_at) as year,
                       COUNT(*) as offers
                FROM candidate_status cs
                JOIN jobs j ON j.id = cs.job_id
                WHERE j.college_id = %s AND cs.offer_accepted_at IS NOT NULL
                GROUP BY year
                ORDER BY year DESC
            """, [college_id])
            trends = [dict(r) for r in cur.fetchall()]

            return {
                "overall": {
                    "totalPlaced": overall.get("total_placed", 0),
                    "totalCompanies": overall.get("total_companies", 0),
                    "avgPackage": round(float(overall.get("avg_package") or 0), 2),
                    "maxPackage": round(float(overall.get("max_package") or 0), 2),
                },
                "companies": companies,
                "branches": branches,
                "yearlyTrends": trends,
            }

