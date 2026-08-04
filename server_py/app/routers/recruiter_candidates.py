import bcrypt
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth_router import get_current_user, require_roles
from ..db import db, get_connection, transaction
from .recruiter_drives import deserialize_drive_colleges

class CreateCandidateRequest(BaseModel):
    name: str
    email: str
    password: str

router = APIRouter(prefix="/api/recruiter", tags=["recruiter_candidates"])

@router.post("/create-candidate")
async def create_candidate(req: CreateCandidateRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    pwd_hash = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    
    res = await db.from_("users").insert({
        "name": req.name,
        "email": req.email,
        "password_hash": pwd_hash,
        "role": "candidate",
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"message": "Candidate created", "candidate": res.data}

@router.get("/candidates")
async def get_candidates(page: int = 1, limit: int = 10, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    offset = (page - 1) * limit
    res = await db.from_("users").select("id, name, email, roll_number, college_id, profile_complete", count="exact").eq("role", "candidate").order("created_at", False).range(offset, offset + limit - 1)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"candidates": res.data or [], "total": res.count or 0, "page": page, "limit": limit}

@router.get("/colleges")
async def get_colleges(user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    res = await db.from_("colleges").select("id, name, code, location, created_at").order("name")
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
    return {"colleges": res.data or []}

@router.get("/colleges-summary")
async def get_colleges_summary(user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    # Fetch all colleges, jobs by recruiter, candidates, attempts, and interviews
    colleges_res = await db.from_("colleges").select("id, name, code, location").order("name")
    jobs_res = await db.from_("jobs").select("id, title, company_name, college_id, company_description").eq("created_by", user["id"])
    profiles_res = await db.from_("candidate_profiles").select("user_id, college_id, cgpa, branch, profile_complete, documents_verified")
    
    colleges = colleges_res.data or []
    jobs = jobs_res.data or []
    profiles = profiles_res.data or []
    
    job_ids = [j["id"] for j in jobs]
    pipeline = []
    if job_ids:
        pipe_res = await db.from_("candidate_status").select("job_id, candidate_id, status").in_("job_id", job_ids)
        pipeline = pipe_res.data or []
        
    attempts_res = await db.from_("attempts").select("id, exam_id, candidate_id, score, status").eq("recruiter_id", user["id"])
    attempts = attempts_res.data or []
    
    interviews_res = await db.from_("ai_interviews").select("id, candidate_id, score, status")
    interviews = interviews_res.data or []
    
    summary = []
    for col in colleges:
        col_id = col["id"]
        college_jobs = [
            j for j in jobs
            if j.get("college_id") == col_id or col_id in deserialize_drive_colleges(j.get("company_description"))["college_ids"]
        ]
        
        col_profiles = [p for p in profiles if p.get("college_id") == col_id]
        cand_ids = {p["user_id"] for p in col_profiles}
        
        col_pipeline = [p for p in pipeline if p["candidate_id"] in cand_ids]
        col_attempts = [a for a in attempts if a["candidate_id"] in cand_ids]
        completed = [a for a in col_attempts if a["status"] == "completed"]
        passed = [a for a in completed if (a.get("score") or 0) >= 40]
        col_interviews = [i for i in interviews if i["candidate_id"] in cand_ids]
        
        avg_score = 0.0
        if completed:
            avg_score = round(sum(a.get("score") or 0 for a in completed) / len(completed), 1)
            
        summary.append({
            "id": col_id,
            "name": col["name"],
            "code": col["code"],
            "location": col["location"],
            "drivesCount": len(college_jobs),
            "candidatesCount": len(col_profiles),
            "registeredCount": len(col_pipeline),
            "attemptsCount": len(col_attempts),
            "completedAttemptsCount": len(completed),
            "passCount": len(passed),
            "offersCount": sum(1 for p in col_pipeline if p["status"] == "offered"),
            "aiInterviewsCount": len(col_interviews),
            "averageScore": avg_score
        })
        
    return {"colleges": summary}

@router.get("/candidates/compare")
async def compare_candidates(candidateIds: str, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    ids = [i.strip() for i in candidateIds.split(",") if i.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="At least one candidate ID is required")
        
    # Query users, profiles, attempts, and interviews
    users_res = await db.from_("users").select("id, name, email, roll_number").in_("id", ids)
    profiles_res = await db.from_("candidate_profiles").select("*").in_("user_id", ids)
    attempts_res = await db.from_("attempts").select("exam_id, score, status, candidate_id").in_("candidate_id", ids).eq("status", "completed")
    interviews_res = await db.from_("ai_interviews").select("score, technical_score, communication_score, candidate_id").in_("candidate_id", ids).eq("status", "completed")
    
    users = users_res.data or []
    profiles = profiles_res.data or []
    attempts = attempts_res.data or []
    interviews = interviews_res.data or []
    
    res = []
    for u in users:
        p = next((x for x in profiles if x["user_id"] == u["id"]), {})
        c_att = [a for a in attempts if a["candidate_id"] == u["id"]]
        c_int = [i for i in interviews if i["candidate_id"] == u["id"]]
        
        avg_exam = round(sum(a.get("score") or 0 for a in c_att) / len(c_att)) if c_att else 0
        avg_comm = round(sum(i.get("communication_score") or 0 for i in c_int) / len(c_int)) if c_int else 0
        avg_tech = round(sum(i.get("technical_score") or 0 for i in c_int) / len(c_int)) if c_int else 0
        
        res.append({
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "roll_number": u["roll_number"],
            "cgpa": p.get("cgpa") or 0.0,
            "branch": p.get("branch") or "Unknown",
            "skills": p.get("skills") or [],
            "avgExamScore": avg_exam,
            "avgCommScore": avg_comm,
            "avgTechScore": avg_tech
        })
        
    return res

@router.get("/candidates/{candidateId}/analytics")
async def get_candidate_analytics(candidateId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    user_res = await db.from_("users").select("id, name, email, roll_number, created_at").eq("id", candidateId).single()
    if user_res.error or not user_res.data:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    profile_res = await db.from_("candidate_profiles").select("*, college:college_id(name, code)").eq("user_id", candidateId).maybeSingle()
    
    attempts_res = await db.from_("attempts").select("*, exams:exam_id(title, total_marks, pass_marks)").eq("candidate_id", candidateId).eq("recruiter_id", recruiter_id).order("started_at", ascending=False)
    attempts = attempts_res.data or []
    
    attempt_ids = [a["id"] for a in attempts]
    
    coding_subs = []
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("*, coding_questions:coding_question_id(title, difficulty)").in_("attempt_id", attempt_ids)
        coding_subs = subs_res.data or []
        
    proc_res = await db.from_("proctoring_snapshots").select("*").eq("candidate_id", candidateId).order("captured_at", ascending=False).limit(20)
    
    ivs_res = await db.from_("ai_interviews").select("*, job:job_id(title, company_name)").eq("candidate_id", candidateId).eq("status", "completed").order("submitted_at", ascending=False)
    
    pipe_res = await db.from_("candidate_status").select("*, job:job_id(title, company_name)").eq("candidate_id", candidateId)
    
    completed = [a for a in attempts if a["status"] == "completed"]
    avg_s = round(sum(a.get("score") or 0 for a in completed) / len(completed), 1) if completed else 0.0
    
    pass_cnt = 0
    for a in completed:
        exam = a.get("exams") or {}
        if float(a.get("score") or 0.0) >= float(exam.get("pass_marks") or 0.0):
            pass_cnt += 1
            
    return {
        "candidate": {**user_res.data, "profile": profile_res.data},
        "examStats": {
            "totalAttempts": len(attempts),
            "completed": len(completed),
            "averageScore": avg_s,
            "passRate": round((pass_cnt / len(completed)) * 100) if completed else 0
        },
        "attempts": [{
            "id": a["id"],
            "examTitle": (a.get("exams") or {}).get("title"),
            "score": a.get("score"),
            "status": a.get("status"),
            "startedAt": a.get("started_at"),
            "submittedAt": a.get("submitted_at")
        } for a in attempts],
        "codingSubmissions": [{
            "id": s["id"],
            "title": (s.get("coding_questions") or {}).get("title"),
            "difficulty": (s.get("coding_questions") or {}).get("difficulty"),
            "language": s.get("language"),
            "score": s.get("score")
        } for s in coding_subs],
        "proctoringEvents": [{
            "id": e["id"],
            "eventType": e.get("event_type"),
            "message": e.get("message"),
            "violationCount": e.get("violation_count"),
            "capturedAt": e.get("captured_at")
        } for e in (proc_res.data or [])],
        "interviews": [{
            "id": i["id"],
            "jobTitle": (i.get("job") or {}).get("title"),
            "companyName": (i.get("job") or {}).get("company_name"),
            "score": i.get("score"),
            "selected": i.get("selected"),
            "submittedAt": i.get("submitted_at")
        } for i in (ivs_res.data or [])],
        "pipeline": [{
            "jobId": p["job_id"],
            "jobTitle": (p.get("job") or {}).get("title"),
            "companyName": (p.get("job") or {}).get("company_name"),
            "status": p["status"],
            "updatedAt": p.get("updated_at")
        } for p in (pipe_res.data or [])]
    }


@router.get("/candidates/{candidateId}/resume-analysis")
async def get_resume_analysis(
    candidateId: str,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    """Fetch parsed resume skills and ATS analysis for a candidate."""
    profile_res = await db.from_("candidate_profiles").select("resume_url, resume_ats_analysis, skills, github_url, linkedin_url, bio, projects, cgpa, branch, graduation_year, roll_number").eq("user_id", candidateId).maybeSingle()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Candidate profile not found")

    profile = profile_res.data
    ats = profile.get("resume_ats_analysis")
    skills = profile.get("skills") or []

    attempts_res = await db.from_("attempts").select("score, status, exams:exam_id(title, total_marks)").eq("candidate_id", candidateId).order("started_at", ascending=False)
    attempts = attempts_res.data or []

    exam_summary = []
    for a in attempts:
        exam = a.get("exams") or {}
        exam_summary.append({
            "title": exam.get("title") or "Unknown",
            "score": a.get("score") or 0,
            "total": exam.get("total_marks") or 100,
            "status": a.get("status"),
        })

    return {
        "candidateId": candidateId,
        "resumeUrl": profile.get("resume_url"),
        "atsAnalysis": ats,
        "skills": skills,
        "profile": {
            "branch": profile.get("branch"),
            "cgpa": profile.get("cgpa"),
            "graduationYear": profile.get("graduation_year"),
            "rollNumber": profile.get("roll_number"),
            "githubUrl": profile.get("github_url"),
            "linkedinUrl": profile.get("linkedin_url"),
            "bio": profile.get("bio"),
            "projects": profile.get("projects") or [],
        },
        "examHistory": exam_summary,
    }


@router.get("/candidates/compare")
async def compare_candidates(
    candidateIds: str = "",
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    """Compare multiple candidates side-by-side: scores, skills, interviews, proctoring."""
    ids = [cid.strip() for cid in candidateIds.split(",") if cid.strip()]
    if not ids or len(ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 candidate IDs")

    if len(ids) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 candidates can be compared")

    results = []
    for cid in ids:
        prof_res = await db.from_("candidate_profiles").select("branch, cgpa, graduation_year, skills, resume_url, documents_verified, placement_ready").eq("user_id", cid).maybeSingle()
        profile = prof_res.data or {}

        user_res = await db.from_("users").select("name, email, roll_number").eq("id", cid).single()
        u = user_res.data or {}

        att_res = await db.from_("attempts").select("score, status, exams:exam_id(title, total_marks, pass_marks)").eq("candidate_id", cid).order("started_at", ascending=False)
        attempts = att_res.data or []
        avg_score = sum(float(a.get("score") or 0) for a in attempts) / len(attempts) if attempts else 0
        exams_passed = sum(1 for a in attempts if float(a.get("score") or 0) >= float((a.get("exams") or {}).get("pass_marks") or 0))

        iv_res = await db.from_("ai_interviews").select("score, status, communication_score, technical_score").eq("candidate_id", cid).eq("status", "completed")
        interviews = iv_res.data or []
        avg_iv = sum(float(i.get("score") or 0) for i in interviews) / len(interviews) if interviews else 0

        proc_res = await db.from_("proctoring_snapshots").select("id").eq("candidate_id", cid).eq("event_type", "violation")
        violation_count = len(proc_res.data or [])

        pipe_res = await db.from_("candidate_status").select("status, jobs:job_id(title, company_name)").eq("candidate_id", cid)
        pipeline = pipe_res.data or []

        results.append({
            "candidateId": cid,
            "name": u.get("name"),
            "email": u.get("email"),
            "rollNumber": u.get("roll_number"),
            "branch": profile.get("branch"),
            "cgpa": profile.get("cgpa"),
            "graduationYear": profile.get("graduation_year"),
            "skills": profile.get("skills") or [],
            "documentsVerified": profile.get("documents_verified"),
            "placementReady": profile.get("placement_ready"),
            "examCount": len(attempts),
            "avgExamScore": round(avg_score, 2),
            "examsPassed": exams_passed,
            "interviewCount": len(interviews),
            "avgInterviewScore": round(avg_iv, 2),
            "proctoringViolations": violation_count,
            "pipeline": [{"title": (p.get("jobs") or {}).get("title"), "company": (p.get("jobs") or {}).get("company_name"), "status": p.get("status")} for p in pipeline],
        })

    return {"comparison": results}
