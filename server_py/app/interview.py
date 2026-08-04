import datetime
import re
from urllib.parse import quote, urlencode
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from .auth_router import get_current_user, require_roles
from .db import db
from .ai import generate_json, has_ai_key
from .utils import deserialize_drive_colleges

router = APIRouter(prefix="/api/interview", tags=["interview"])

STAGES = [
    {"id": 1, "name": "Introduction", "questionCount": 2},
    {"id": 2, "name": "Speaking Skills", "questionCount": 2},
    {"id": 3, "name": "Technical", "questionCount": 3},
]

default_intro_questions = [
    "Please introduce yourself — your name, background, and what you're currently working on or studying.",
    "Tell me about your most impactful project or achievement and what role you played in it.",
]

default_speaking_questions = [
    "Describe a challenge you faced recently and walk me through how you communicated it to your team or mentor.",
    "Explain a technical concept from your domain as if you were teaching it to someone new.",
]

default_technical_questions = [
    "What data structures would you use to solve a real-time leaderboard problem, and why?",
    "Explain the difference between synchronous and asynchronous programming with a practical example.",
    "How would you design a simple URL shortener service? Walk me through the key components.",
]

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

def score_answer(answer: str) -> int:
    words = len([w for w in answer.strip().split() if w])
    has_example = bool(re.search(r"\b(project|built|implemented|improved|designed|deployed|resolved|debugged)\b", answer, re.IGNORECASE))
    has_structure = bool(re.search(r"\b(first|then|because|therefore|result|impact)\b", answer, re.IGNORECASE))
    score = 35 + min(words, 80)
    if has_example:
        score += 10
    if has_structure:
        score += 8
    return max(35, min(95, score))

def clamp_score(value: Any, fallback: int = 0) -> int:
    try:
        score = int(float(value))
        return max(0, min(100, score))
    except Exception:
        return fallback

def fallback_feedback(score: int) -> str:
    return "Clear answer with useful detail." if score >= 75 else "Add more concrete examples and outcomes."

async def get_passed_attempts(candidate_id: str, exam_id: str = None) -> List[Dict[str, Any]]:
    query = db.from_("attempts").select("*, exam:exam_id(*)").eq("candidate_id", candidate_id).eq("status", "completed").order("submitted_at", ascending=False)
    if exam_id:
        query = query.eq("exam_id", exam_id)
    res = await query
    attempts = res.data or []
    
    passed = []
    for att in attempts:
        exam = att.get("exam") or {}
        score = float(att.get("score") or 0.0)
        pass_marks = float(exam.get("pass_marks") or 0.0)
        total_marks = float(exam.get("total_marks") or 0.0)
        if exam and score >= pass_marks:
            passed.append({
                "attemptId": att["id"],
                "examId": att["exam_id"],
                "examTitle": exam.get("title") or "Qualified Exam",
                "examDescription": exam.get("description"),
                "score": score,
                "totalMarks": total_marks,
                "passMarks": pass_marks,
                "percentage": round((score / total_marks) * 100, 1) if total_marks else 0,
                "submittedAt": att.get("submitted_at")
            })
    return passed

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
    res = await db.from_("ai_interviews").select("*, users:candidate_id(id, name, email), jobs:job_id(title)").in_("status", ["scheduled", "completed"]).order("scheduled_start", ascending=True)
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
    res = await db.from_("ai_interview_answers").select("*").eq("interview_id", interviewId).order("created_at", ascending=True)
    return {"answers": res.data or []}

async def evaluate_answer(question: str, answer: str, stage: int, job: dict = None) -> dict:
    fallback = score_answer(answer)
    if not has_ai_key():
        return {
            "score": fallback,
            "feedback": fallback_feedback(fallback),
            "pronunciation_score": min(100, fallback + 5) if stage == 2 else None,
            "clarity_score": min(100, fallback - 3) if stage == 2 else None,
        }
        
    persona = ""
    custom_rubric = ""
    examples = []
    
    if job and job.get("company_description"):
        desc, ai_config = deserialize_drive_colleges(job["company_description"])
        if ai_config:
            persona = ai_config.get("persona") or ""
            custom_rubric = ai_config.get("rubric") or ""
            examples = ai_config.get("examples") or []
            
    try:
        import json
        persona_line = f"Evaluate as this interviewer persona: {persona}." if persona else ""
        rubric_line = f"Use this specific grading rubric:\n{custom_rubric}" if custom_rubric else ""
        
        if stage == 2:
            system_prompt = f"""You are evaluating a spoken voice interview answer for speaking skills, clarity, and pronunciation.
{persona_line}
Analyze for:
- Overall communication quality (0-100)
- Pronunciation quality inferred from word choice/coherence (0-100)
- Clarity and consistency of expression (0-100)
{rubric_line}
Return ONLY JSON.
Constraints:
- "feedback" MUST be exactly one concise improvement sentence (max 18 words).
"""
            user_prompt = f"Question: {question}\nAnswer: {answer}"
            result = await generate_json(user_prompt, system_prompt)
            score = clamp_score(result.get("score"), fallback)
            return {
                "score": score,
                "feedback": str(result.get("feedback") or fallback_feedback(score)).strip(),
                "pronunciation_score": clamp_score(result.get("pronunciation_score"), score),
                "clarity_score": clamp_score(result.get("clarity_score"), score),
            }
            
        examples_str = ""
        if examples:
            examples_str = "\n".join([f"Example {i+1}:\nQuestion: {ex.get('question')}\nAnswer: {ex.get('answer')}\nSuggested Score: {ex.get('score')}\nSuggested Feedback: {ex.get('feedback')}" for i, ex in enumerate(examples)])
            
        persona_line_live = f"Evaluate as this interviewer persona: {persona}." if persona else ""
        rubric_line_live = f"Use this specific grading rubric to judge and grade the answer:\n{custom_rubric}" if custom_rubric else ""
        examples_line_live = f"Use the training examples to score:\n{examples_str}" if examples_str else ""
        
        system_prompt = f"""You are scoring a live AI interview answer.
{persona_line_live}
Score 0-100 for: relevance, technical clarity, communication, specificity, and evidence.
{rubric_line_live}
{examples_line_live}
Return ONLY JSON.
Constraints:
- "feedback" MUST be exactly one concise improvement sentence (max 18 words).
"""
        user_prompt = f"Question: {question}\nAnswer: {answer}"
        result = await generate_json(user_prompt, system_prompt)
        score = clamp_score(result.get("score"), fallback)
        return {
            "score": score,
            "feedback": str(result.get("feedback") or fallback_feedback(score)).strip(),
        }
    except Exception:
        return {
            "score": fallback,
            "feedback": fallback_feedback(fallback)
        }

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
        
    now = datetime.datetime.utcnow().isoformat() + "Z"
    up_res = await db.from_("ai_interviews").update({
        "status": "processing",
        "submitted_at": now
    }).eq("id", interviewId).select().single()
    
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to submit interview")
        
    # Asynchronously grade interview evaluation in Python (Background execution)
    import asyncio
    asyncio.create_task(evaluate_interview_background(interviewId))
    
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
            conds.append(f"exam_id.in.({','.join(exam_ids)})")
        if job_ids:
            conds.append(f"job_id.in.({','.join(job_ids)})")
        query = query.or_(",".join(conds))
        
    if collegeId:
        prof_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        user_ids = [p["user_id"] for p in (prof_res.data or []) if p.get("user_id")]
        if not user_ids:
            return {"interviews": []}
        query = query.in_("candidate_id", user_ids)
        
    res = await query
    return {"interviews": res.data or []}

    return {"interview": res.data}


def generate_google_calendar_link(title: str, start_time: str, end_time: str, description: str = "") -> str:
    """Generate a Google Calendar 'Add to Calendar' link."""
    try:
        from datetime import datetime
        dt_start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        dt_end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
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
        return ""


@router.get("/{interviewId}/calendar-link")
async def get_calendar_link(interviewId: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Generate a Google Calendar link for a scheduled interview."""
    res = await db.from_("ai_interviews").select("*, jobs(title, company_name)").eq("id", interviewId).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview = res.data
    job = interview.get("jobs") or {}
    title = f"AI Interview: {job.get('title') or 'Placement Interview'} ({job.get('company_name') or 'IntelliHire'})"
    start_time = interview.get("scheduled_start") or interview.get("started_at")
    end_time = interview.get("scheduled_end")
    if not start_time:
        raise HTTPException(status_code=400, detail="Interview is not scheduled yet")
    if not end_time:
        try:
            dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            end_time = (dt + datetime.timedelta(minutes=30)).isoformat()
        except Exception:
            end_time = start_time

    link = generate_google_calendar_link(title, start_time, end_time, f"Join your AI Interview at {job.get('company_name') or 'IntelliHire'}")
    return {"url": link}

async def build_stage_questions(candidate_id: str, attempt: dict, job: dict = None) -> List[str]:
    intro = default_intro_questions
    speaking = default_speaking_questions
    tech = default_technical_questions
    
    if has_ai_key():
        try:
            profile_res = await db.from_("candidate_profiles").select("skills, domain_preference").eq("user_id", candidate_id).maybeSingle()
            profile = profile_res.data
            skills = ", ".join(profile.get("skills") or []) if profile else "Not provided"
            
            job_desc = "Not provided"
            persona = ""
            custom_instructions = ""
            if job:
                desc, ai_config = deserialize_drive_colleges(job.get("company_description") or "")
                job_desc = desc
                if ai_config:
                    persona = ai_config.get("persona") or ""
                    custom_instructions = ai_config.get("instructions") or ""
                    
            job_context = f"Job title: {job.get('title')}\nCompany: {job.get('company_name')}\nDescription: {job_desc}\nRequired skills: {', '.join(job.get('required_skills') or [])}" if job else f"Exam: {attempt['examTitle']}\nExam description: {attempt.get('examDescription') or 'Not provided'}"
            
            persona_prompt = f"The interviewer persona is: {persona}. Please match this tone/style." if persona else ""
            custom_prompt = f"Custom instructions to follow:\n{custom_instructions}" if custom_instructions else ""
            tot_marks = attempt.get("totalMarks") or attempt.get("total_marks") or 100
            
            prompt = f"""
Return only JSON.
Generate exactly 3 technical interview questions for a campus placement AI interview.
Questions must be specific to the job role and test practical knowledge.
Make them conversational — suitable for a spoken voice interview, not written answers.

{job_context}
Candidate skills: {skills}
Exam score: {attempt.get('score', 0)}/{tot_marks}

{persona_prompt}
{custom_prompt}

Schema:
{{
  "questions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}}
"""
            result = await generate_json(prompt)
            generated = [str(q).strip() for q in result.get("questions", []) if q]
            if len(generated) >= 2:
                tech = generated[:3]
        except Exception:
            pass
            
    return intro + speaking + tech

async def evaluate_interview_background(interview_id: str):
    try:
        int_res = await db.from_("ai_interviews").select("*, jobs(*)").eq("id", interview_id).single()
        if int_res.error or not int_res.data:
            return
            
        interview = int_res.data
        pass_score = clamp_score(interview.get("jobs", {}).get("interview_pass_score") if interview.get("jobs") else 60, 60)
        
        answers_res = await db.from_("ai_interview_answers").select("*").eq("interview_id", interview_id).order("created_at", ascending=True)
        answers = answers_res.data or []
        
        answers_mapped = []
        for i, a in enumerate(answers):
            stage = 1 if i < 2 else 2 if i < 4 else 3
            answers_mapped.append({
                "score": float(a.get("score") or 0.0),
                "question": str(a.get("question") or ""),
                "answer": str(a.get("answer") or ""),
                "stage": stage,
                "pronunciation_score": float(a.get("pronunciation_score")) if a.get("pronunciation_score") is not None else None,
                "clarity_score": float(a.get("clarity_score")) if a.get("clarity_score") is not None else None,
            })
            
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
    except Exception:
        pass

async def summarize_interview(answers: List[dict], pass_score: int, job: dict = None) -> dict:
    stage1 = [a for a in answers if a["stage"] == 1]
    stage2 = [a for a in answers if a["stage"] == 2]
    stage3 = [a for a in answers if a["stage"] == 3]
    
    def avg(arr):
        return round(sum(a["score"] for a in arr) / len(arr)) if arr else 0
        
    intro_score = avg(stage1)
    speaking_score = avg(stage2)
    pron_score = round(sum(a.get("pronunciation_score") or a["score"] for a in stage2) / len(stage2)) if stage2 else 0
    tech_score = avg(stage3)
    
    overall = round(sum(a["score"] for a in answers) / len(answers)) if answers else 0
    selected = overall >= pass_score
    
    fallback = {
        "score": overall,
        "intro_score": intro_score,
        "speaking_score": speaking_score,
        "pronunciation_score": pron_score,
        "technical_score": tech_score,
        "selected": selected,
        "relevance_score": max(0, min(100, overall + 3)),
        "communication_score": max(0, min(100, overall - 2)),
        "summary": f"Candidate completed {len(answers)} interview responses with an overall score of {overall}/100.",
        "feedback": "Strong interview performance. Keep answers concise and back them with measurable outcomes." if overall >= 75 else "Improve with stronger examples, clearer structure, and deeper technical explanation."
    }
    
    if not answers or not has_ai_key():
        return fallback
        
    persona = ""
    if job and job.get("company_description"):
        _, ai_config = deserialize_drive_colleges(job["company_description"])
        if ai_config:
            persona = ai_config.get("persona") or ""
            
    try:
        transcript = "\n\n".join([f"Stage {a['stage']} Q{i+1}: {a['question']}\nAnswer: {a['answer']}\nScore: {a['score']}" for i, a in enumerate(answers)])
        system_prompt = f"""You are summarizing a completed technical placement AI interview.
{f"The interview was conducted by the AI persona: {persona}." if persona else ""}
Grade overall candidate relevance (0-100) and communication (0-100) based on transcript.
Return ONLY JSON.
Constraints:
- "summary": Single summary paragraph (max 60 words).
- "feedback": Short improvement paragraph (max 40 words).
"""
        user_prompt = f"Transcript:\n{transcript}"
        result = await generate_json(user_prompt, system_prompt)
        
        return {
            **fallback,
            "relevance_score": clamp_score(result.get("relevance_score"), fallback["relevance_score"]),
            "communication_score": clamp_score(result.get("communication_score"), fallback["communication_score"]),
            "summary": str(result.get("summary") or fallback["summary"]).strip(),
            "feedback": str(result.get("feedback") or fallback["feedback"]).strip(),
        }
    except Exception:
        return fallback
