import datetime
import json
import asyncio
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .auth_router import get_current_user, require_roles
from .db import db
from .compiler import run_with_judge0
from .plagiarism import run_plagiarism_check
from .utils import send_email_async, record_pipeline_stage
from .websocket import sio

router = APIRouter(prefix="/api/result", tags=["result"])

class SubmitMcqRequest(BaseModel):
    attempt_id: str
    question_id: str
    selected_option: str

class SubmitCodeRequest(BaseModel):
    attempt_id: str
    coding_question_id: str
    code: str
    language: str

class UpdateCodeScoreRequest(BaseModel):
    attempt_id: str
    coding_question_id: str
    score: float
    code: Optional[str] = ""
    language: Optional[str] = "python"

class SubmitExamRequest(BaseModel):
    attempt_id: str

@router.post("/submit-mcq")
async def submit_mcq(req: SubmitMcqRequest, user: Dict[str, Any] = Depends(get_current_user)):
    att_res = await db.from_("attempts").select("candidate_id, status, exams:exam_id(negative_marking)").eq("id", req.attempt_id).single()
    if att_res.error or not att_res.data:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    attempt = att_res.data
    if attempt["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if attempt["status"] == "completed":
        raise HTTPException(status_code=400, detail="Exam already submitted")
        
    q_res = await db.from_("questions").select("correct_option, marks").eq("id", req.question_id).single()
    if q_res.error or not q_res.data:
        raise HTTPException(status_code=404, detail="Question not found")
        
    question = q_res.data
    is_correct = question["correct_option"] == req.selected_option
    
    exam = attempt.get("exams") or {}
    neg_marking = max(0.0, float(exam.get("negative_marking") or 0.0))
    marks_obtained = float(question["marks"]) if is_correct else -neg_marking
    
    ins_res = await db.from_("answers").upsert({
        "attempt_id": req.attempt_id,
        "question_id": req.question_id,
        "selected_option": req.selected_option,
        "is_correct": is_correct,
        "marks_obtained": marks_obtained
    }, on_conflict="attempt_id,question_id")
    
    # Retrieve updated answer
    sel_res = await db.from_("answers").select("*").eq("attempt_id", req.attempt_id).eq("question_id", req.question_id).single()
    
    return {"message": "Answer submitted", "answer": sel_res.data}

@router.post("/submit-code")
async def submit_code(req: SubmitCodeRequest, user: Dict[str, Any] = Depends(get_current_user)):
    att_res = await db.from_("attempts").select("candidate_id, status").eq("id", req.attempt_id).single()
    if att_res.error or not att_res.data:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    attempt = att_res.data
    if attempt["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if attempt["status"] == "completed":
        raise HTTPException(status_code=400, detail="Exam already submitted")
        
    ins_res = await db.from_("coding_submissions").upsert({
        "attempt_id": req.attempt_id,
        "coding_question_id": req.coding_question_id,
        "code": req.code,
        "language": req.language,
        "score": 0.0,
        "status": "pending"
    }, on_conflict="attempt_id,coding_question_id")
    
    sel_res = await db.from_("coding_submissions").select("*").eq("attempt_id", req.attempt_id).eq("coding_question_id", req.coding_question_id).single()
    return {"message": "Code submitted", "submission": sel_res.data}

@router.post("/update-code-score")
async def update_code_score(req: UpdateCodeScoreRequest, user: Dict[str, Any] = Depends(get_current_user)):
    att_res = await db.from_("attempts").select("candidate_id, status").eq("id", req.attempt_id).single()
    if att_res.error or not att_res.data:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    attempt = att_res.data
    if attempt["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if attempt["status"] == "completed":
        raise HTTPException(status_code=400, detail="Exam already submitted")
        
    ins_res = await db.from_("coding_submissions").upsert({
        "attempt_id": req.attempt_id,
        "coding_question_id": req.coding_question_id,
        "code": req.code or "",
        "language": req.language or "python",
        "score": req.score,
        "status": "tested"
    }, on_conflict="attempt_id,coding_question_id")
    
    sel_res = await db.from_("coding_submissions").select("*").eq("attempt_id", req.attempt_id).eq("coding_question_id", req.coding_question_id).single()
    return {"message": "Code score updated", "submission": sel_res.data}

@router.post("/submit-exam")
async def submit_exam(req: SubmitExamRequest, user: Dict[str, Any] = Depends(get_current_user)):
    att_res = await db.from_("attempts").select("candidate_id, status, exam_id").eq("id", req.attempt_id).single()
    if att_res.error or not att_res.data:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    attempt = att_res.data
    if attempt["candidate_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if attempt["status"] == "completed":
        raise HTTPException(status_code=400, detail="Exam already submitted")
        
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    up_res = await db.from_("attempts").update({
        "status": "completed",
        "submitted_at": now_str
    }).eq("id", req.attempt_id).select().single()
    
    if up_res.error:
        raise HTTPException(status_code=400, detail=up_res.error.get("message") or "Failed to submit exam")
        
    # Queue background grading
    asyncio.create_task(grade_attempt_background(req.attempt_id, user, up_res.data["exam_id"], now_str))
    
    return {
        "message": "Exam submitted successfully. Grading is processing in the background.",
        "attempt": up_res.data
    }

async def grade_attempt_background(attempt_id: str, user: dict, exam_id: str, submitted_at: str):
    try:
        # Fetch submissions
        subs_res = await db.from_("coding_submissions").select("*, coding_questions(*)").eq("attempt_id", attempt_id)
        submissions = subs_res.data or []
        
        for sub in submissions:
            if sub.get("status") == "tested" and float(sub.get("score") or 0.0) > 0.0:
                continue
            if not sub.get("code") or not sub["code"].strip():
                continue
                
            q = sub.get("coding_questions") or {}
            test_cases = q.get("test_cases") or []
            if isinstance(test_cases, str):
                try:
                    test_cases = json.loads(test_cases)
                except Exception:
                    test_cases = []
                    
            if not test_cases:
                await db.from_("coding_submissions").update({"score": float(q.get("marks") or 10.0), "status": "tested"}).eq("id", sub["id"])
                continue
                
            passed = 0
            for tc in test_cases:
                try:
                    result = await run_with_judge0(sub["code"], sub["language"], tc.get("input") or "")
                    actual = result["stdout"].strip()
                    expected = (tc.get("expected_output") or "").strip()
                    if actual == expected:
                        passed += 1
                except Exception:
                    pass
                await asyncio.sleep(0.3)
                
            score_pct = passed / len(test_cases)
            final_score = round(score_pct * float(q.get("marks") or 10.0))
            await db.from_("coding_submissions").update({"score": final_score, "status": "tested"}).eq("id", sub["id"])
            
        # Tally final overall score
        ans_res = await db.from_("answers").select("marks_obtained").eq("attempt_id", attempt_id)
        sub_res = await db.from_("coding_submissions").select("score").eq("attempt_id", attempt_id)
        
        mcq_s = sum(float(a.get("marks_obtained") or 0.0) for a in (ans_res.data or []))
        cod_s = sum(float(s.get("score") or 0.0) for s in (sub_res.data or []))
        total = mcq_s + cod_s
        
        # Save finalized score
        await db.from_("attempts").update({
            "score": total,
            "status": "completed",
            "submitted_at": submitted_at
        }).eq("id", attempt_id)
        
        # Fetch details for notification
        exam_res = await db.from_("exams").select("pass_marks, title, total_marks").eq("id", exam_id).single()
        exam = exam_res.data or {}
        
        # Socket emit
        try:
            await sio.emit("admin:exam_submission", {
                "attemptId": attempt_id,
                "candidateName": user.get("name") or user.get("email"),
                "examTitle": exam.get("title") or "Exam",
                "submittedAt": submitted_at,
                "score": total
            }, room="admin")
        except Exception:
            pass
            
        # Email trigger
        if user.get("email"):
            passed_exam = total >= float(exam.get("pass_marks") or 0.0)
            body = f"Hello {user.get('name') or 'Candidate'},\n\nYour results for the exam '{exam.get('title')}' have been published.\n\nScore: {total}/{exam.get('total_marks') or 0}\nStatus: {'PASSED' if passed_exam else 'FAILED'}"
            await send_email_async(user["email"], "Exam Result Published", body)
            
        # Trigger auto-shortlist
        pass_m = float(exam.get("pass_marks") or 0.0)
        if total >= pass_m:
            assign_res = await db.from_("exam_assignments").select("job_id, assigned_by").eq("exam_id", exam_id).eq("candidate_id", user["id"]).maybeSingle()
            assignment = assign_res.data
            
            if assignment and assignment.get("job_id"):
                await db.from_("candidate_status").upsert({
                    "job_id": assignment["job_id"],
                    "candidate_id": user["id"],
                    "status": "shortlisted"
                }, on_conflict="job_id,candidate_id")
                
                await record_pipeline_stage(user["id"], assignment["job_id"], "shortlisted", "Auto-shortlisted after passing exam cutoff score", assignment.get("assigned_by"))
                
                # Check AI interview scheduling
                exist_iv = await db.from_("ai_interviews").select("id").eq("candidate_id", user["id"]).eq("exam_id", exam_id).maybeSingle()
                if not exist_iv.data:
                    await db.from_("ai_interviews").insert({
                        "candidate_id": user["id"],
                        "job_id": assignment["job_id"],
                        "exam_id": exam_id,
                        "status": "pending",
                        "started_at": None
                    })
                    
                recruiter_id = assignment.get("assigned_by")
                if recruiter_id:
                    await db.from_("notifications").insert({
                        "user_id": recruiter_id,
                        "title": "AI Interview Scheduling Required",
                        "body": f"A candidate qualified \"{exam.get('title') or 'the exam'}\". Please set the interview start and end time."
                    })
                    
        # Plagiarism check
        await run_plagiarism_check(attempt_id)
    except Exception as e:
        print("Background grading error:", str(e))

@router.get("/attempt/{attemptId}")
async def get_attempt(attemptId: str, user: Dict[str, Any] = Depends(get_current_user)):
    att_res = await db.from_("attempts").select("*, exams:exam_id(*), users:candidate_id(name, email)").eq("id", attemptId).single()
    if att_res.error or not att_res.data:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    ans_res = await db.from_("answers").select("*, questions:question_id(*)").eq("attempt_id", attemptId)
    subs_res = await db.from_("coding_submissions").select("*, coding_questions:coding_question_id(*)").eq("attempt_id", attemptId)
    
    return {
        "attempt": att_res.data,
        "answers": ans_res.data or [],
        "codingSubmissions": subs_res.data or []
    }

@router.get("/all")
async def get_all_results(
    collegeId: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    query = db.from_("attempts").select("*, users:candidate_id(name, email), exams:exam_id(title, total_marks, pass_marks)").order("started_at", ascending=False)
    if user["role"] == "recruiter":
        query = query.eq("recruiter_id", user["id"])
        
    if collegeId:
        prof_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        user_ids = [p["user_id"] for p in (prof_res.data or []) if p.get("user_id")]
        if not user_ids:
            return {"results": []}
        query = query.in_("candidate_id", user_ids)
        
    res = await query
    return {"results": res.data or []}

@router.get("/{examId}")
async def get_exam_results(
    examId: str,
    collegeId: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    query = db.from_("attempts").select("*, users:candidate_id(name, email), exams:exam_id(title, total_marks, pass_marks)").eq("exam_id", examId)
    if user["role"] == "recruiter":
        query = query.eq("recruiter_id", user["id"])
        
    if collegeId:
        prof_res = await db.from_("candidate_profiles").select("user_id").eq("college_id", collegeId)
        user_ids = [p["user_id"] for p in (prof_res.data or []) if p.get("user_id")]
        if not user_ids:
            return {"results": []}
        query = query.in_("candidate_id", user_ids)
        
    res = await query
    return {"results": res.data or []}

@router.post("/plagiarism/run/{attemptId}")
async def trigger_plagiarism(attemptId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    await run_plagiarism_check(attemptId)
    return {"message": "Plagiarism check completed successfully"}

@router.get("/plagiarism/exam/{examId}")
async def get_exam_plagiarism(examId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    att_res = await db.from_("attempts").select("id").eq("exam_id", examId)
    att_ids = [a["id"] for a in (att_res.data or [])]
    if not att_ids:
        return {"flags": []}
        
    flags_res = await db.from_("plagiarism_flags").select("*, coding_submissions(id, language, coding_questions(title)), attempts(id, users:candidate_id(name, email)), matched_attempt:matched_with_attempt_id(id, users:candidate_id(name, email))").in_("attempt_id", att_ids).order("similarity_score", ascending=False)
    return {"flags": flags_res.data or []}

@router.get("/plagiarism/attempt/{attemptId}")
async def get_attempt_plagiarism(attemptId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    flags_res = await db.from_("plagiarism_flags").select("*, coding_submissions(id, code, language, coding_questions(title)), attempts(id, users:candidate_id(name, email)), matched_attempt:matched_with_attempt_id(id, users:candidate_id(name, email))").or_(f"attempt_id.eq.{attemptId},matched_with_attempt_id.eq.{attemptId}").order("similarity_score", ascending=False)
    return {"flags": flags_res.data or []}
