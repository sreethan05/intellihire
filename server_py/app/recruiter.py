import os
import json
import uuid
import datetime
import shutil
import psycopg2.extras
from fastapi import APIRouter, Request, Response, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from .db import db, get_connection, transaction
from .auth_router import get_current_user, require_roles
from .utils import record_pipeline_stage, send_drive_registered_email, storage_root
from .websocket import send_realtime_notification
from .ai import generate_json, has_ai_key

router = APIRouter(prefix="/api/recruiter", tags=["recruiter"])

class CreateCandidateRequest(BaseModel):
    name: str
    email: str
    password: str

class CreateJobRequest(BaseModel):
    title: str
    company_name: str
    company_description: Optional[str] = ""
    college_id: str
    college_ids: Optional[List[str]] = []
    min_cgpa: Optional[float] = 0.0
    allowed_branches: List[str]
    required_skills: Optional[List[str]] = []
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    drive_date: Optional[str] = None
    exam_id: Optional[str] = None
    interview_pass_score: Optional[int] = 60
    interview_duration: Optional[int] = 15

class AssignExamRequest(BaseModel):
    exam_id: str

class SaveAiConfigRequest(BaseModel):
    aiConfig: Dict[str, Any]

class AiShortlistRequest(BaseModel):
    criteria: str

def serialize_drive_colleges(description: str, college_ids: list, ai_config: dict = None) -> str:
    metadata = {"college_ids": college_ids, "aiConfig": ai_config}
    return f"{description}\n\n===METADATA===\n{json.dumps(metadata)}"

def deserialize_drive_colleges(description: str) -> dict:
    parts = (description or "").split("\n\n===METADATA===\n")
    if len(parts) > 1:
        try:
            metadata = json.loads(parts[1])
            return {
                "description": parts[0],
                "college_ids": metadata.get("college_ids") or [],
                "aiConfig": metadata.get("aiConfig") or {
                    "persona": "", "instructions": "", "rubric": "", "examples": [], "temperature": 0.4
                }
            }
        except Exception:
            pass
    return {
        "description": description or "",
        "college_ids": [],
        "aiConfig": {
            "persona": "", "instructions": "", "rubric": "", "examples": [], "temperature": 0.4
        }
    }

def get_drive_college_ids(drive: any) -> list:
    if drive.get("company_description"):
        parsed = deserialize_drive_colleges(drive["company_description"])
        if parsed["college_ids"]:
            return parsed["college_ids"]
    return [drive["college_id"]] if drive.get("college_id") else []

async def find_eligible_candidates(drive: any) -> list:
    branches = drive.get("allowed_branches") or []
    college_ids = get_drive_college_ids(drive)
    if not college_ids:
        return []
        
    # Get candidates joining profiles and users
    query = """
        SELECT cp.*, u.id as user_id, u.name, u.email, u.roll_number, u.profile_complete
        FROM candidate_profiles cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.college_id IN %s AND cp.cgpa >= %s
    """
    params = [tuple(college_ids), float(drive.get("min_cgpa") or 0.0)]
    
    if branches:
        query += " AND cp.branch IN %s"
        params.append(tuple(branches))
        
    query += " ORDER BY cp.cgpa DESC"
    
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]

@router.post("/create-candidate")
async def create_candidate(req: CreateCandidateRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    import bcrypt
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

@router.post("/drives")
async def create_drive(req: CreateJobRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    actual_college = req.college_id or (req.college_ids[0] if req.college_ids else None)
    if not actual_college:
        raise HTTPException(status_code=400, detail="College ID is required")
        
    college_ids = req.college_ids if req.college_ids else [actual_college]
    description = serialize_drive_colleges(req.company_description or "", college_ids)
    
    res = await db.from_("jobs").insert({
        "title": req.title,
        "company_name": req.company_name,
        "company_description": description,
        "college_id": actual_college,
        "min_cgpa": req.min_cgpa,
        "allowed_branches": [b.upper() for b in req.allowed_branches],
        "required_skills": req.required_skills or [],
        "salary_min": req.salary_min,
        "salary_max": req.salary_max,
        "drive_date": req.drive_date,
        "exam_id": req.exam_id,
        "interview_pass_score": req.interview_pass_score or 60,
        "interview_duration": req.interview_duration or 15,
        "created_by": user["id"]
    }).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
        
    drive = res.data
    eligible = await find_eligible_candidates(drive)
    
    if eligible:
        status_data = [{
            "job_id": drive["id"],
            "candidate_id": c["user_id"],
            "status": "registered"
        } for c in eligible]
        await db.from_("candidate_status").insert(status_data).onConflict("candidate_id")
        
        for c in eligible:
            await record_pipeline_stage(c["user_id"], drive["id"], "registered", "Auto-registered for drive by eligibility criteria", user["id"])
            
        if drive.get("exam_id"):
            assignments = [{
                "exam_id": drive["exam_id"],
                "candidate_id": c["user_id"],
                "assigned_by": user["id"],
                "job_id": drive["id"]
            } for c in eligible]
            await db.from_("exam_assignments").insert(assignments)
            
        for c in eligible:
            # We can run async send mail background if email was provided
            if c.get("email"):
                send_drive_registered_email(c["email"], c.get("name") or "Candidate", drive["title"], drive["company_name"], "http://localhost:3000")

    parsed = deserialize_drive_colleges(drive["company_description"])
    
    # Retrieve colleges list
    col_res = await db.from_("colleges").select("id, name, code").in_("id", college_ids)
    
    return {
        "message": "Drive created",
        "drive": {
            **drive,
            "company_description": parsed["description"],
            "college_ids": parsed["college_ids"],
            "colleges": col_res.data or []
        },
        "eligibleCount": len(eligible)
    }

@router.get("/drives")
async def get_drives(page: int = 1, limit: int = 10, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    offset = (page - 1) * limit
    res = await db.from_("jobs").select("*", count="exact").eq("created_by", user["id"]).order("created_at", False).range(offset, offset + limit - 1)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.message)
        
    drives = res.data or []
    
    # Enrich colleges
    all_colleges = set()
    for d in drives:
        parsed = deserialize_drive_colleges(d.get("company_description"))
        all_colleges.update(parsed["college_ids"])
        if d.get("college_id"):
            all_colleges.add(d["college_id"])
            
    col_map = {}
    if all_colleges:
        col_res = await db.from_("colleges").select("id, name, code").in_("id", list(all_colleges))
        for c in (col_res.data or []):
            col_map[c["id"]] = c
            
    enriched = []
    for d in drives:
        parsed = deserialize_drive_colleges(d["company_description"])
        c_ids = parsed["college_ids"] or ([d["college_id"]] if d.get("college_id") else [])
        cols = [col_map[cid] for cid in c_ids if cid in col_map]
        enriched.append({
            **d,
            "company_description": parsed["description"],
            "college_ids": c_ids,
            "colleges": cols
        })
        
    return {"drives": enriched, "total": res.count or 0, "page": page, "limit": limit}

@router.get("/drives/{drive_id}/eligible-candidates")
async def get_eligible_candidates_for_drive(drive_id: str, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    res = await db.from_("jobs").select("*").eq("id", drive_id).eq("created_by", user["id"]).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    eligible = await find_eligible_candidates(res.data)
    return {"candidates": eligible, "count": len(eligible)}

@router.post("/drives/{drive_id}/assign-exam")
async def assign_exam_to_drive(drive_id: str, req: AssignExamRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    drive_res = await db.from_("jobs").select("*").eq("id", drive_id).eq("created_by", user["id"]).single()
    if drive_res.error or not drive_res.data:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    drive = drive_res.data
    # Update drive exam
    await db.from_("jobs").update({"exam_id": req.exam_id}).eq("id", drive_id)
    
    # Assign to eligible candidates
    eligible = await find_eligible_candidates(drive)
    if eligible:
        assignments = [{
            "exam_id": req.exam_id,
            "candidate_id": c["user_id"],
            "assigned_by": user["id"],
            "job_id": drive_id
        } for c in eligible]
        await db.from_("exam_assignments").insert(assignments)
        
    return {"message": "Exam assigned successfully"}

@router.get("/drives/{drive_id}/ai-config")
async def get_ai_config(drive_id: str, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    res = await db.from_("jobs").select("company_description").eq("id", drive_id).eq("created_by", user["id"]).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    parsed = deserialize_drive_colleges(res.data["company_description"])
    return {"aiConfig": parsed["aiConfig"]}

@router.post("/drives/{drive_id}/ai-config")
async def save_ai_config(drive_id: str, req: SaveAiConfigRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    res = await db.from_("jobs").select("*").eq("id", drive_id).eq("created_by", user["id"]).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Drive not found")
        
    drive = res.data
    parsed = deserialize_drive_colleges(drive["company_description"])
    new_desc = serialize_drive_colleges(parsed["description"], parsed["college_ids"], req.aiConfig)
    
    upd_res = await db.from_("jobs").update({"company_description": new_desc}).eq("id", drive_id).select().single()
    return {"message": "AI Config saved successfully", "drive": upd_res.data}

@router.post("/drives/{drive_id}/test-evaluation")
async def test_evaluation(drive_id: str, body: Dict[str, Any], user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    question = body.get("question")
    answer = body.get("answer", "")
    aiConfig = body.get("aiConfig") or {}
    
    fallback = max(35, min(95, 35 + len(answer.strip().split())))
    
    if not has_ai_key():
        return {"score": fallback, "feedback": "API key not configured. Fallback grading is active."}
        
    persona = aiConfig.get("persona") or ""
    rubric = aiConfig.get("rubric") or ""
    examples = aiConfig.get("examples") or []
    
    rubric_part = f"Use this specific grading rubric to judge and grade the answer:\n{rubric}" if rubric else "Give one concise actionable feedback sentence."
    examples_part = f"Use the training examples to score the answer:\n{json.dumps(examples)}" if examples else ""
    persona_part = f"Evaluate as this interviewer persona: {persona}." if persona else ""

    prompt = f"""
Return only JSON.
You are scoring a test answer for a recruiter's custom AI face-to-face interview model.
{persona_part}
Score from 0 to 100 for: relevance, technical clarity, communication, specificity, and evidence.
{rubric_part}

{examples_part}

Question: {question}
Answer: {answer}

Schema:
{{
  "score": 82,
  "feedback": "One concise sentence."
}}
"""
    result = await generate_json(prompt)
    score = float(result.get("score") or fallback)
    feedback = str(result.get("feedback") or "Good effort.").strip()
    return {"score": score, "feedback": feedback}

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

@router.post("/ai/shortlist")
async def ai_shortlist(req: AiShortlistRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    # Fetch profiles, attempts, interviews
    profiles_res = await db.from_("candidate_profiles").select("*")
    users_res = await db.from_("users").select("id, name").eq("role", "candidate")
    users_map = {u["id"]: u["name"] for u in users_res.data or []}
    
    profiles = profiles_res.data or []
    candidates_summary = []
    for p in profiles:
        uid = p["user_id"]
        attempts_res = await db.from_("attempts").select("score").eq("candidate_id", uid).eq("status", "completed")
        interviews_res = await db.from_("ai_interviews").select("communication_score").eq("candidate_id", uid).eq("status", "completed")
        
        atts = attempts_res.data or []
        ints = interviews_res.data or []
        
        avg_exam = round(sum(a.get("score") or 0 for a in atts) / len(atts)) if atts else 0
        avg_comm = round(sum(i.get("communication_score") or 0 for i in ints) / len(ints)) if ints else 0
        
        candidates_summary.append({
            "id": uid,
            "name": users_map.get(uid, "Unknown"),
            "cgpa": p.get("cgpa") or 0.0,
            "skills": p.get("skills") or [],
            "avgExamScore": avg_exam,
            "avgCommScore": avg_comm,
            "branch": p.get("branch") or "Unknown"
        })
        
    if not candidates_summary:
        return {"shortlist": []}
        
    systemPrompt = "You are an AI recruiting assistant. Analyze the candidate pool and select the best matches according to the recruiter's criteria. Return a JSON object containing a 'shortlist' array."
    userPrompt = f"""
Recruiter Shortlist Criteria: "{req.criteria}"

Candidate Pool:
{json.dumps(candidates_summary, indent=2)}

Return a JSON object in this format:
{{
  "shortlist": [
    {{
      "candidate_id": "UUID",
      "name": "Candidate Name",
      "rank": 1,
      "justification": "Why selected based on the criteria"
    }}
  ]
}}
"""
    result = await generate_json(userPrompt, systemPrompt=systemPrompt)
    return {"shortlist": result.get("shortlist") or []}

@router.post("/offers/{candidate_id}/{job_id}")
async def upload_offer_letter(candidate_id: str, job_id: str, offerLetter: UploadFile = File(...), user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    if not offerLetter.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed for offer letters")
        
    unique_name = f"{int(datetime.datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:8]}.pdf"
    file_path = os.path.join(storage_root, "offers", unique_name)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(offerLetter.file, buffer)
        
    offer_url = f"/uploads/offers/{unique_name}"
    
    # Update candidate status
    await db.from_("candidate_status").update({
        "status": "offered",
        "offer_letter_url": offer_url,
        "updated_at": datetime.datetime.utcnow().isoformat()
    }).eq("candidate_id", candidate_id).eq("job_id", job_id)
    
    await record_pipeline_stage(candidate_id, job_id, "offered", "Offer Letter extended by recruiter", user["id"])
    
    await send_realtime_notification(candidate_id, {
        "title": "New Job Offer Extended! 🎉",
        "body": "You have received a new job offer with an attached letter. Go to your command center to review it.",
        "type": "offer_received",
        "metadata": {"jobId": job_id}
    })
    
    await db.from_("activity_feed").insert({
        "actor_id": user["id"],
        "actor_role": "recruiter",
        "target_user_id": candidate_id,
        "type": "offer_made",
        "title": "Job Offer Extended",
        "description": "A recruiter has extended a job offer with an attached letter.",
        "metadata": {"job_id": job_id, "offer_letter_url": offer_url}
    })
    
    return {"message": "Offer letter uploaded and candidate notified", "status": "offered"}

@router.get("/dashboard")
async def get_dashboard(collegeId: Optional[str] = None, user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    import psycopg2.extras
    
    # Use raw SQL to execute custom joins for the dashboard metrics
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
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
                    
    # Process calculations
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
        # Retrieve candidate ids from assignments to count attempts
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
        "examTrend": [], # Mock or calculate months back
        "resultSummary": result_summary
    }

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
        flags_res = await db.from_("plagiarism_flags").select("*, attempts:attempt_id(candidate_id), coding_submissions:coding_submission_id(code, language), matched:matched_with_attempt_id(candidate_id)").in_("attempt_id", attempt_ids)
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

@router.get("/predictive-shortlist")
async def get_predictive_shortlist(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    recruiter_id = user["id"]
    
    candidates_res = await db.from_("users").select("id, name, email").eq("role", "candidate")
    candidates = candidates_res.data or []
    cand_ids = [c["id"] for c in candidates]
    if not cand_ids:
        return {"candidates": []}
        
    prof_res = await db.from_("candidate_profiles").select("user_id, cgpa, branch, college_id").in_("user_id", cand_ids)
    profiles = prof_res.data or []
    
    att_res = await db.from_("attempts").select("id, candidate_id, score, status, exams:exam_id(total_marks)").eq("recruiter_id", recruiter_id).eq("status", "completed").in_("candidate_id", cand_ids)
    attempts = att_res.data or []
    attempt_ids = [a["id"] for a in attempts]
    
    coding_subs = []
    if attempt_ids:
        subs_res = await db.from_("coding_submissions").select("attempt_id, score, coding_questions:coding_question_id(marks)").in_("attempt_id", attempt_ids)
        coding_subs = subs_res.data or []
        
    ivs_res = await db.from_("ai_interviews").select("candidate_id, score, selected").in_("candidate_id", cand_ids).eq("status", "completed")
    interviews = ivs_res.data or []
    
    proc_res = await db.from_("proctoring_snapshots").select("candidate_id, event_type").in_("attempt_id", attempt_ids if attempt_ids else ["00000000-0000-0000-0000-000000000000"]).eq("event_type", "violation")
    violations = proc_res.data or []
    
    ranked_candidates = []
    for cand in candidates:
        profile = next((p for p in profiles if p["user_id"] == cand["id"]), None)
        cand_attempts = [a for a in attempts if a["candidate_id"] == cand["id"]]
        cand_att_ids = [a["id"] for a in cand_attempts]
        cand_coding = [c for c in coding_subs if c["attempt_id"] in cand_att_ids]
        cand_ivs = [i for i in interviews if i["candidate_id"] == cand["id"]]
        cand_viol_cnt = sum(1 for e in violations if e["candidate_id"] == cand["id"])
        
        exam_p = []
        for a in cand_attempts:
            exam = a.get("exams") or {}
            tot = float(exam.get("total_marks") or 100.0)
            exam_p.append((float(a.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
        exam_avg = sum(exam_p) / len(exam_p) if exam_p else 0.0
        
        coding_p = []
        for c in cand_coding:
            q = c.get("coding_questions") or {}
            tot = float(q.get("marks") or 10.0)
            coding_p.append((float(c.get("score") or 0.0) / tot) * 100.0 if tot else 0.0)
        coding_score = sum(coding_p) / len(coding_p) if coding_p else exam_avg
        
        iv_score = sum(float(i.get("score") or 0.0) for i in cand_ivs) / len(cand_ivs) if cand_ivs else 0.0
        
        cgpa = float((profile or {}).get("cgpa") or 0.0)
        cgpa_score = (cgpa / 10.0) * 100.0 if cgpa > 0.0 else 0.0
        
        proctor_score = max(0.0, 100.0 - cand_viol_cnt * 10.0)
        
        composite = round(
            (exam_avg * 0.30) + (coding_score * 0.25) + (cgpa_score * 0.15) + (iv_score * 0.20) + (proctor_score * 0.10)
        )
        
        ranked_candidates.append({
            "candidateId": cand["id"],
            "name": cand["name"],
            "email": cand["email"],
            "branch": (profile or {}).get("branch") or "",
            "cgpa": cgpa,
            "compositeScore": composite,
            "examAvg": round(exam_avg),
            "codingScore": round(coding_score),
            "interviewScore": round(iv_score),
            "proctoringCleanScore": round(proctor_score),
            "violations": cand_viol_cnt
        })
        
    ranked_candidates.sort(key=lambda x: x["compositeScore"], reverse=True)
    total = len(ranked_candidates)
    
    ranked = []
    for idx, c in enumerate(ranked_candidates):
        tier = "top" if idx < total * 0.2 else "middle" if idx < total * 0.5 else "bottom"
        ranked.append({
            **c,
            "rank": idx + 1,
            "tier": tier
        })
        
    return {"candidates": ranked, "total": total}
