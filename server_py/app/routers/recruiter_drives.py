import datetime
import json
import os
import shutil
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from psycopg.rows import dict_row

from ..auth_router import get_current_user, require_roles
from ..db import db, get_connection
from ..upload_validation import read_validated_pdf
from ..utils import record_pipeline_stage, send_drive_registered_email, storage_root
from ..websocket import send_realtime_notification
from ..ai import generate_json, has_ai_key

router = APIRouter(prefix="/api/recruiter", tags=["recruiter_drives"])

class CreateJobRequest(BaseModel):
    title: str
    company_name: str
    company_description: Optional[str] = ""
    college_id: str
    college_ids: Optional[List[str]] = None
    min_cgpa: Optional[float] = 0.0
    allowed_branches: List[str]
    required_skills: Optional[List[str]] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    drive_date: Optional[str] = None
    exam_id: Optional[str] = None
    interview_pass_score: Optional[int] = 60
    interview_duration: Optional[int] = 15

class AssignExamRequest(BaseModel): exam_id: str
class SaveAiConfigRequest(BaseModel): aiConfig: Dict[str, Any]
class AiShortlistRequest(BaseModel): criteria: str

def serialize_drive_colleges(description: str, college_ids: list, ai_config: dict = None) -> str:
    return f"{description}\n\n===METADATA===\n{json.dumps({\"college_ids\": college_ids, \"aiConfig\": ai_config})}"

def deserialize_drive_colleges(description: str) -> dict:
    parts=(description or "").split("\n\n===METADATA===\n")
    if len(parts)>1:
        try:
            metadata=json.loads(parts[1]); return {"description":parts[0],"college_ids":metadata.get("college_ids") or [],"aiConfig":metadata.get("aiConfig") or {"persona":"","instructions":"","rubric":"","examples":[],"temperature":0.4}}
        except Exception: pass
    return {"description":description or "","college_ids":[],"aiConfig":{"persona":"","instructions":"","rubric":"","examples":[],"temperature":0.4}}

def get_drive_college_ids(drive: any) -> list:
    if drive.get("company_description"):
        parsed=deserialize_drive_colleges(drive["company_description"])
        if parsed["college_ids"]: return parsed["college_ids"]
    return [drive["college_id"]] if drive.get("college_id") else []

async def find_eligible_candidates(drive: any) -> list:
    branches=drive.get("allowed_branches") or []; college_ids=get_drive_college_ids(drive)
    if not college_ids: return []
    query="""SELECT cp.*, u.id as user_id, u.name, u.email, u.roll_number, u.profile_complete FROM candidate_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.college_id IN %s AND cp.cgpa >= %s"""
    params=[tuple(college_ids),float(drive.get("min_cgpa") or 0.0)]
    if branches: query += " AND cp.branch IN %s"; params.append(tuple(branches))
    query += " ORDER BY cp.cgpa DESC"
    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur: cur.execute(query,params); return [dict(r) for r in cur.fetchall()]

@router.post("/drives")
async def create_drive(req: CreateJobRequest,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    actual_college=req.college_id or ((req.college_ids or [None])[0]);
    if not actual_college: raise HTTPException(status_code=400,detail="College ID is required")
    college_ids=req.college_ids or [actual_college]
    description=serialize_drive_colleges(req.company_description or "",college_ids)
    res=await db.from_("jobs").insert({"title":req.title,"company_name":req.company_name,"company_description":description,"college_id":actual_college,"min_cgpa":req.min_cgpa,"allowed_branches":[b.upper() for b in req.allowed_branches],"required_skills":req.required_skills or [],"salary_min":req.salary_min,"salary_max":req.salary_max,"drive_date":req.drive_date,"exam_id":req.exam_id,"interview_pass_score":req.interview_pass_score or 60,"interview_duration":req.interview_duration or 15,"created_by":user["id"]}).select().single()
    if res.error: raise HTTPException(status_code=400,detail=res.error.message)
    drive=res.data; eligible=await find_eligible_candidates(drive)
    if eligible:
        await db.from_("candidate_status").insert([{"job_id":drive["id"],"candidate_id":c["user_id"],"status":"registered"} for c in eligible]).onConflict("candidate_id")
        for c in eligible: await record_pipeline_stage(c["user_id"],drive["id"],"registered","Auto-registered for drive by eligibility criteria",user["id"])
        if drive.get("exam_id"): await db.from_("exam_assignments").insert([{"exam_id":drive["exam_id"],"candidate_id":c["user_id"],"assigned_by":user["id"],"job_id":drive["id"]} for c in eligible])
        for c in eligible:
            if c.get("email"): send_drive_registered_email(c["email"],c.get("name") or "Candidate",drive["title"],drive["company_name"],"http://localhost:3000")
    parsed=deserialize_drive_colleges(drive["company_description"]); col_res=await db.from_("colleges").select("id,name,code").in_("id",college_ids)
    return {"message":"Drive created","drive":{**drive,"company_description":parsed["description"],"college_ids":parsed["college_ids"],"colleges":col_res.data or []},"eligibleCount":len(eligible)}

@router.get("/drives")
async def get_drives(page:int=1,limit:int=10,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    page=max(1,page); limit=min(max(1,limit),100); offset=(page-1)*limit
    res=await db.from_("jobs").select("*",count="exact").eq("created_by",user["id"]).order("created_at",False).range(offset,offset+limit-1)
    if res.error: raise HTTPException(status_code=400,detail=res.error.message)
    drives=res.data or []; all_colleges=set()
    for d in drives:
        parsed=deserialize_drive_colleges(d.get("company_description")); all_colleges.update(parsed["college_ids"])
        if d.get("college_id"): all_colleges.add(d["college_id"])
    col_map={}
    if all_colleges:
        col_res=await db.from_("colleges").select("id,name,code").in_("id",list(all_colleges)); col_map={c["id"]:c for c in (col_res.data or [])}
    enriched=[]
    for d in drives:
        parsed=deserialize_drive_colleges(d["company_description"]); c_ids=parsed["college_ids"] or ([d["college_id"]] if d.get("college_id") else [])
        enriched.append({**d,"company_description":parsed["description"],"college_ids":c_ids,"colleges":[col_map[cid] for cid in c_ids if cid in col_map]})
    return {"drives":enriched,"total":res.count or 0,"page":page,"limit":limit}

@router.get("/drives/{drive_id}/eligible-candidates")
async def get_eligible_candidates_for_drive(drive_id:str,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    res=await db.from_("jobs").select("*").eq("id",drive_id).eq("created_by",user["id"]).single()
    if res.error or not res.data: raise HTTPException(status_code=404,detail="Drive not found")
    eligible=await find_eligible_candidates(res.data); return {"candidates":eligible,"count":len(eligible)}

@router.post("/drives/{drive_id}/assign-exam")
async def assign_exam_to_drive(drive_id:str,req:AssignExamRequest,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    drive_res=await db.from_("jobs").select("*").eq("id",drive_id).eq("created_by",user["id"]).single()
    if drive_res.error or not drive_res.data: raise HTTPException(status_code=404,detail="Drive not found")
    drive=drive_res.data; await db.from_("jobs").update({"exam_id":req.exam_id}).eq("id",drive_id)
    eligible=await find_eligible_candidates(drive)
    if eligible: await db.from_("exam_assignments").insert([{"exam_id":req.exam_id,"candidate_id":c["user_id"],"assigned_by":user["id"],"job_id":drive_id} for c in eligible])
    return {"message":"Exam assigned successfully"}

@router.get("/drives/{drive_id}/ai-config")
async def get_ai_config(drive_id:str,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    res=await db.from_("jobs").select("company_description").eq("id",drive_id).eq("created_by",user["id"]).single()
    if res.error or not res.data: raise HTTPException(status_code=404,detail="Drive not found")
    return {"aiConfig":deserialize_drive_colleges(res.data["company_description"])["aiConfig"]}

@router.post("/drives/{drive_id}/ai-config")
async def save_ai_config(drive_id:str,req:SaveAiConfigRequest,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    res=await db.from_("jobs").select("*").eq("id",drive_id).eq("created_by",user["id"]).single()
    if res.error or not res.data: raise HTTPException(status_code=404,detail="Drive not found")
    drive=res.data; parsed=deserialize_drive_colleges(drive["company_description"]); new_desc=serialize_drive_colleges(parsed["description"],parsed["college_ids"],req.aiConfig); upd_res=await db.from_("jobs").update({"company_description":new_desc}).eq("id",drive_id).select().single()
    return {"message":"AI Config saved successfully","drive":upd_res.data}

@router.post("/drives/{drive_id}/test-evaluation")
async def test_evaluation(drive_id:str,body:Dict[str,Any],user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    question=body.get("question"); answer=str(body.get("answer") or ""); aiConfig=body.get("aiConfig") or {}
    if not question or len(str(question))>10000 or len(answer)>20000: raise HTTPException(status_code=400,detail="Invalid question or answer length")
    fallback=max(35,min(95,35+len(answer.strip().split())))
    if not has_ai_key(): return {"score":fallback,"feedback":"API key not configured. Fallback grading is active.","source":"fallback"}
    persona=str(aiConfig.get("persona") or "")[:4000]; rubric=str(aiConfig.get("rubric") or "")[:8000]; examples=aiConfig.get("examples") or []
    prompt=f"Return only JSON. You are an AI recruiting assistant evaluating an interview answer. Score 0-100 for relevance, technical clarity, communication, specificity, and evidence. Rubric: {rubric}\nExamples: {json.dumps(examples)[:10000]}\nQuestion: {str(question)[:10000]}\nAnswer: {answer}"
    result=await generate_json(prompt,systemPrompt=f"Evaluate as interviewer persona: {persona}" if persona else None)
    try: score=max(0,min(100,float(result.get("score"))))
    except (TypeError,ValueError): score=fallback
    feedback=str(result.get("feedback") or "Good effort.").strip()[:1000]
    return {"score":score,"feedback":feedback,"source":"ai"}

@router.post("/ai/shortlist")
async def ai_shortlist(req:AiShortlistRequest,user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    if not req.criteria or len(req.criteria)>5000: raise HTTPException(status_code=400,detail="Invalid criteria")
    profiles_res=await db.from_("candidate_profiles").select("*"); users_res=await db.from_("users").select("id,name").eq("role","candidate"); users_map={u["id"]:u["name"] for u in users_res.data or []}; candidates_summary=[]
    for p in profiles_res.data or []:
        uid=p["user_id"]; atts=(await db.from_("attempts").select("score").eq("candidate_id",uid).eq("status","completed")).data or []; ints=(await db.from_("ai_interviews").select("communication_score").eq("candidate_id",uid).eq("status","completed")).data or []
        candidates_summary.append({"id":uid,"name":users_map.get(uid,"Unknown"),"cgpa":p.get("cgpa") or 0.0,"skills":p.get("skills") or [],"avgExamScore":round(sum(a.get("score") or 0 for a in atts)/len(atts)) if atts else 0,"avgCommScore":round(sum(i.get("communication_score") or 0 for i in ints)/len(ints)) if ints else 0,"branch":p.get("branch") or "Unknown"})
    if not candidates_summary:return {"shortlist":[]}
    result=await generate_json(f"Recruiter Shortlist Criteria: {req.criteria}\nCandidate Pool:\n{json.dumps(candidates_summary,indent=2)}",systemPrompt="Return JSON with a shortlist array. Use only candidate IDs present in the supplied pool; do not invent candidates or attributes.")
    valid_ids={c["id"] for c in candidates_summary}; shortlist=[]
    for item in result.get("shortlist") or []:
        if isinstance(item,dict) and item.get("candidate_id") in valid_ids: shortlist.append(item)
    return {"shortlist":shortlist}

@router.post("/offers/{candidate_id}/{job_id}")
async def upload_offer_letter(candidate_id:str,job_id:str,offerLetter:UploadFile=File(...),user:Dict[str,Any]=Depends(require_roles(["recruiter"]))):
    # Verify both candidate/job relationship and recruiter ownership before writing the file.
    job_res=await db.from_("jobs").select("id").eq("id",job_id).eq("created_by",user["id"]).single()
    if job_res.error or not job_res.data: raise HTTPException(status_code=404,detail="Job not found")
    status_res=await db.from_("candidate_status").select("candidate_id,job_id").eq("candidate_id",candidate_id).eq("job_id",job_id).maybeSingle()
    if not status_res.data: raise HTTPException(status_code=404,detail="Candidate is not part of this drive")
    file_bytes=await read_validated_pdf(offerLetter); unique_name=f"{int(datetime.datetime.utcnow().timestamp())}-{uuid.uuid4().hex[:8]}.pdf"; file_path=os.path.join(storage_root,"offers",unique_name); os.makedirs(os.path.dirname(file_path),exist_ok=True)
    with open(file_path,"wb") as buffer: buffer.write(file_bytes)
    offer_url=f"/api/files/offers/{unique_name}"
    upd=await db.from_("candidate_status").update({"status":"offered","offer_letter_url":offer_url,"updated_at":datetime.datetime.utcnow().isoformat()}).eq("candidate_id",candidate_id).eq("job_id",job_id)
    if upd.error:
        try: os.remove(file_path)
        except OSError: pass
        raise HTTPException(status_code=400,detail=upd.error.message if hasattr(upd.error,"message") else "Failed to save offer")
    await record_pipeline_stage(candidate_id,job_id,"offered","Offer Letter extended by recruiter",user["id"])
    await send_realtime_notification(candidate_id,{"title":"New Job Offer Extended! 🎉","body":"You have received a new job offer with an attached letter. Go to your command center to review it.","type":"offer_received","metadata":{"jobId":job_id}})
    await db.from_("activity_feed").insert({"actor_id":user["id"],"actor_role":"recruiter","target_user_id":candidate_id,"type":"offer_made","title":"Job Offer Extended","description":"A recruiter has extended a job offer with an attached letter.","metadata":{"job_id":job_id,"offer_letter_url":offer_url}})
    return {"message":"Offer letter uploaded and candidate notified","status":"offered"}
