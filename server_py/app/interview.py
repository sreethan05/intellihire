import asyncio
import datetime
from urllib.parse import quote, urlencode
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from .auth_router import get_current_user, require_roles
from .db import db
from .ai import generate_json, has_ai_key
from .date_utils import parse_datetime, now_iso
from .logger import logger
from .utils import deserialize_drive_colleges
from . import interview_core
from .interview_core import (
    STAGES,
    clamp_score,
    default_intro_questions,
    default_speaking_questions,
    default_technical_questions,
    fallback_feedback,
    score_answer,
)

router = APIRouter(prefix="/api/interview", tags=["interview"])

# Strong references to fire-and-forget background tasks so they are not
# garbage-collected mid-flight and can be awaited on shutdown if needed.
_background_tasks: set = set()


def _spawn_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

class ScheduleInterviewRequest(BaseModel):
    scheduled_start: str
    scheduled_end: str

class InterviewAnswerRequest(BaseModel):
    question: str
    answer: str
    stage: int = 1

class StartInterviewRequest(BaseModel):
    job_id: Optional[str] = None
    exam_id: Optional[str] = None

# NOTE: question banks, scoring heuristics and stage tables live in
# app.interview_core (shared with app.interview_service) and are imported
# above; this module no longer defines its own copies.

async def _assert_interview_access(interview: Dict[str, Any], user: Dict[str, Any]) -> None:
    """Raises 403 unless the user may view/manage this interview.

    - admins: always allowed
    - candidates: only their own interview
    - recruiters: only interviews tied to an exam/job they created
    """
    role = user.get("role")
    if role == "admin":
        return
    if role == "candidate":
        if interview.get("candidate_id") == user["id"]:
            return
        raise HTTPException(status_code=403, detail="Forbidden")
    if role == "recruiter":
        exam_id = interview.get("exam_id")
        job_id = interview.get("job_id")
        if exam_id:
            res = await db.from_("exams").select("id").eq("id", exam_id).eq("created_by", user["id"]).maybeSingle()
            if res.data:
                return
        if job_id:
            res = await db.from_("jobs").select("id").eq("id", job_id).eq("created_by", user["id"]).maybeSingle()
            if res.data:
                return
        raise HTTPException(status_code=403, detail="Forbidden")
    raise HTTPException(status_code=403, detail="Forbidden")

async def get_passed_attempts(candidate_id: str, exam_id: str = None) -> List[Dict[str, Any]]:
    query = db.from_("attempts").select("*, exam:exam_id(*)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    if exam_id:
        query = query.eq("exam_id", exam_id)
    res = await query
    return interview_core.map_passed_attempts(res.data or [])

@router.get("/questions")
def get_stages():
    return {"stages": STAGES}

@router.get("/eligibility")
async def check_eligibility(user: Dict[str, Any] = Depends(get_current_user)):
    passed = await get_passed_attempts(user["id"])
    if not passed:
        return {"eligible": False, "message": "No qualifying exam result was found for this candidate account."}
    return {"eligible": True, "attempts": passed}

@router.get("/pending")
async def get_pending_interviews(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("ai_interviews").select("*, jobs(title, company_name)").eq("candidate_id", user["id"]).eq("status", "scheduled").order("scheduled_start", ascending=True)
    return {"interviews": res.data or []}

@router.get("/recruiter/pending")
async def get_recruiter_pending(user: Dict[str, Any] = Depends(require_roles(["recruiter"]))):
    query = db.from_("ai_interviews").select("*, users:candidate_id(id, name, email), jobs:job_id(title), exam:exam_id(title)").in_("status", ["scheduled", "completed"]).order("scheduled_start", ascending=True)

    exams_res = await db.from_("exams").select("id").eq("created_by", user["id"])
    jobs_res = await db.from_("jobs").select("id").eq("created_by", user["id"])
    exam_ids = [e["id"] for e in (exams_res.data or [])]
    job_ids = [j["id"] for j in (jobs_res.data or [])]
    if not exam_ids and not job_ids:
        return {"interviews": []}

    conds = []
    if exam_ids:
        conds.append(f"exam_id.in.({','.join(str(x) for x in exam_ids)})")
    if job_ids:
        conds.append(f"job_id.in.({','.join(str(x) for x in job_ids)})")
    query = query.or_(",".join(conds))

    res = await query
    return {"interviews": res.data or []}

@router.post("/start")
async def start_interview(req: StartInterviewRequest, user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    eligible = await get_passed_attempts(candidate_id, req.exam_id)
    if not eligible:
        raise HTTPException(status_code=400, detail="You must pass the qualifying exam first.")
        
    attempt = eligible[0]
    job = None
    if req.job_id:
        job_res = await db.from_("jobs").select("*").eq("id", req.job_id).maybeSingle()
        job = job_res.data
        
    questions = await build_stage_questions(candidate_id, attempt, job)
    
    ins_res = await db.from_("ai_interviews").insert({
        "candidate_id": candidate_id,
        "exam_id": attempt["examId"],
        "job_id": req.job_id or None,
        "status": "started",
        "questions": questions
    }).select().single()
    
    if ins_res.error:
        raise HTTPException(status_code=400, detail=ins_res.error.get("message") or "Failed to start interview")
        
    return {"message": "Interview started", "interview": ins_res.data}

@router.post("/{interviewId}/schedule")
async def schedule_interview(
    interviewId: str,
    req: ScheduleInterviewRequest,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    existing = await db.from_("ai_interviews").select("id, candidate_id, exam_id, job_id").eq("id", interviewId).maybeSingle()
    if existing.error or not existing.data:
        raise HTTPException(status_code=404, detail="Interview not found")
    await _assert_interview_access(existing.data, user)

    res = await db.from_("ai_interviews").update({
        "scheduled_start": req.scheduled_start,
        "scheduled_end": req.scheduled_end,
        "status": "scheduled"
    }).eq("id", interviewId).select().single()
    
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Failed to schedule interview")
    return {"message": "Interview scheduled successfully", "interview": res.data}

@router.get("/{interviewId}/answers")
async def get_interview_answers(interviewId: str, user: Dict[str, Any] = Depends(get_current_user)):
    int_res = await db.from_("ai_interviews").select("id, candidate_id, exam_id, job_id").eq("id", interviewId).maybeSingle()
    if int_res.error or not int_res.data:
        raise HTTPException(status_code=404, detail="Interview not found")
    await _assert_interview_access(int_res.data, user)
    res = await db.from_("ai_interview_answers").select("*").eq("interview_id", interviewId).order("created_at", ascending=True)
    return {"answers": res.data or []}

async def evaluate_answer(question: str, answer: str, stage: int, job: dict = None) -> dict:
    """Adapter: inject this module's collaborators into the shared core."""
    return await interview_core.evaluate_answer(
        question, answer, stage, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
    )

@router.post("/{interviewId}/answer")
async def save_answer(interviewId: str, req: InterviewAnswerRequest, user: Dict[str, Any] = Depends(get_current_user)):
    int_res = await db.from_("ai_interviews").select("*, jobs(*)").eq("id", interviewId).single()
    if int_res.error or not int_res.data:
        raise HTTPException(status_code=404, detail="Interview not found")
        
    interview = int_res.data
    if interview["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    if interview["status"] not in ["started", "in_progress"]:
        raise HTTPException(status_code=400, detail="Interview is not active")
        
    if interview["status"] == "started":
        await db.from_("ai_interviews").update({"status": "in_progress"}).eq("id", interviewId)
        
    eval_res = await evaluate_answer(req.question, req.answer, req.stage, interview.get("jobs"))
    
    ins_res = await db.from_("ai_interview_answers").insert({
        "interview_id": interviewId,
        "question": req.question,
        "answer": req.answer,
        "score": eval_res["score"],
        "pronunciation_score": eval_res.get("pronunciation_score"),
        "clarity_score": eval_res.get("clarity_score"),
        "feedback": eval_res["feedback"]
    }).select().single()
    
    if ins_res.error:
        raise HTTPException(status_code=400, detail=ins_res.error.get("message") or "Failed to save answer")
    return {"message": "Answer saved", "answer": ins_res.data}

@router.post("/{interviewId}/submit")
async def submit_interview(interviewId: str, user: Dict[str, Any] = Depends(get_current_user)):
    int_res = await db.from_("ai_interviews").select("*").eq("id", interviewId).single()
    if int_res.error or not int_res.data:
        raise HTTPException(status_code=404, detail="Interview not found")
        
    interview = int_res.data
    if interview["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    now = now_iso()
    up_res = await db.from_("ai_interviews").update({
        "status": "processing",
        "submitted_at": now
    }).eq("id", interviewId).select().single()
    
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to submit interview")
        
    # Asynchronously grade interview evaluation in Python (Background execution)
    _spawn_background(evaluate_interview_background(interviewId))
    
    return {"message": "Interview submitted for evaluation", "interview": up_res.data}

@router.get("/mine")
async def get_mine(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("ai_interviews").select("*, jobs(title, company_name)").eq("candidate_id", user["id"]).order("submitted_at", ascending=False)
    return {"interviews": res.data or []}

@router.get("/summaries")
async def get_summaries(
    collegeId: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    # Retrieve summaries
    uid = user["id"]
    role = user["role"]
    
    query = db.from_("ai_interviews").select("*, candidate:candidate_id(id, name, email), job:job_id(title, company_name), exam:exam_id(title)").order("started_at", ascending=False)
    if role == "recruiter":
        exams_res = await db.from_("exams").select("id").eq("created_by", uid)
        jobs_res = await db.from_("jobs").select("id").eq("created_by", uid)
        
        exam_ids = [e["id"] for e in (exams_res.data or [])]
        job_ids = [j["id"] for j in (jobs_res.data or [])]
        
        if not exam_ids and not job_ids:
            return {"interviews": []}
            
        conds = []
        if exam_ids:
            conds.append(f"exam_id.in.({','.join(str(x) for x in exam_ids)})")
        if job_ids:
            conds.append(f"job_id.in.({','.join(str(x) for x in job_ids)})")
        query = query.or_(",".join(conds))
    elif role == "candidate":
        query = query.eq("candidate_id", uid)
    elif role == "tpo":
        tpo_res = await db.from_("users").select("college_id").eq("id", uid).maybeSingle()
        tpo_college = (tpo_res.data or {}).get("college_id")
        if not tpo_college:
            return {"interviews": []}
        collegeId = tpo_college

    if collegeId:
        prof_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        user_ids = [p["user_id"] for p in (prof_res.data or []) if p.get("user_id")]
        if not user_ids:
            return {"interviews": []}
        query = query.in_("candidate_id", user_ids)
        
    res = await query
    return {"interviews": res.data or []}


def generate_google_calendar_link(title: str, start_time: str, end_time: str, description: str = "") -> str:
    """Generate a Google Calendar 'Add to Calendar' link."""
    try:
        dt_start = parse_datetime(start_time)
        dt_end = parse_datetime(end_time)
        if not dt_start or not dt_end:
            return ""
        dt_start = dt_start.astimezone(datetime.timezone.utc)
        dt_end = dt_end.astimezone(datetime.timezone.utc)
        dates = f"{dt_start.strftime('%Y%m%dT%H%M%SZ')}/{dt_end.strftime('%Y%m%dT%H%M%SZ')}"
        params = {
            "action": "TEMPLATE",
            "text": title,
            "dates": dates,
            "details": description,
            "ctz": "Asia/Kolkata",
        }
        return f"https://calendar.google.com/calendar/render?{urlencode(params)}"
    except Exception:
        logger.warning(
            "interview.calendar_link_build_failed title=%r",
            title, exc_info=True,
        )
        return ""


@router.get("/{interviewId}/calendar-link")
async def get_calendar_link(interviewId: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Generate a Google Calendar link for a scheduled interview."""
    res = await db.from_("ai_interviews").select("*, jobs(title, company_name)").eq("id", interviewId).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview = res.data
    await _assert_interview_access(interview, user)
    job = interview.get("jobs") or {}
    title = f"AI Interview: {job.get('title') or 'Placement Interview'} ({job.get('company_name') or 'IntelliHire'})"
    start_time = interview.get("scheduled_start") or interview.get("started_at")
    end_time = interview.get("scheduled_end")
    if not start_time:
        raise HTTPException(status_code=400, detail="Interview is not scheduled yet")
    if not end_time:
        dt = parse_datetime(start_time)
        end_time = (dt + datetime.timedelta(minutes=30)).isoformat() if dt else start_time

    link = generate_google_calendar_link(title, start_time, end_time, f"Join your AI Interview at {job.get('company_name') or 'IntelliHire'}")
    return {"url": link}


@router.get("/{interviewId}")
async def get_interview(interviewId: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch a single interview (with job details) for the owner/recruiter."""
    res = await db.from_("ai_interviews").select("*, jobs(title, company_name)").eq("id", interviewId).maybeSingle()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Interview not found")
    await _assert_interview_access(res.data, user)
    return {"interview": res.data}

async def _fetch_candidate_profile(candidate_id: str):
    res = await db.from_("candidate_profiles").select("skills, domain_preference").eq("user_id", candidate_id).maybeSingle()
    return res.data

async def build_stage_questions(candidate_id: str, attempt: dict, job: dict = None) -> List[str]:
    """Adapter: shared core returns staged sets; this router returns the flat list."""
    staged = await interview_core.build_stage_questions(
        candidate_id, attempt, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
        get_profile=_fetch_candidate_profile,
    )
    return staged["all"]

async def evaluate_interview_background(interview_id: str):
    try:
        int_res = await db.from_("ai_interviews").select("*, jobs(*)").eq("id", interview_id).single()
        if int_res.error or not int_res.data:
            return
            
        interview = int_res.data
        pass_score = clamp_score(interview.get("jobs", {}).get("interview_pass_score") if interview.get("jobs") else 60, 60)
        
        answers_res = await db.from_("ai_interview_answers").select("*").eq("interview_id", interview_id).order("created_at", ascending=True)
        answers = answers_res.data or []
        
        answers_mapped = [interview_core.answer_view(a, i) for i, a in enumerate(answers)]
            
        # Summarize
        summary_res = await summarize_interview(answers_mapped, pass_score, interview.get("jobs"))
        
        await db.from_("ai_interviews").update({
            "status": "completed",
            "score": summary_res["score"],
            "intro_score": summary_res["intro_score"],
            "speaking_score": summary_res["speaking_score"],
            "pronunciation_score": summary_res["pronunciation_score"],
            "technical_score": summary_res["technical_score"],
            "selected": summary_res["selected"],
            "relevance_score": summary_res["relevance_score"],
            "communication_score": summary_res["communication_score"],
            "summary": summary_res["summary"],
            "feedback": summary_res["feedback"]
        }).eq("id", interview_id)
    except Exception as exc:
        logger.error(f"[Interview] Background evaluation failed for {interview_id}: {exc}")
        try:
            await db.from_("ai_interviews").update({
                "status": "failed",
                "feedback": "Automated evaluation failed. Please contact your recruiter.",
            }).eq("id", interview_id)
        except Exception as fallback_exc:
            logger.error(f"[Interview] Failed to mark interview {interview_id} as failed: {fallback_exc}")

async def summarize_interview(answers: List[dict], pass_score: int, job: dict = None) -> dict:
    """Adapter: inject this module's collaborators into the shared core."""
    return await interview_core.summarize_interview(
        answers, pass_score, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
    )
