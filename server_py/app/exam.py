import datetime
import csv
import io
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from .auth_router import get_current_user, require_roles
from .db import db
from .utils import send_email_async, redis_client
from .websocket import sio

router = APIRouter(prefix="/api/exam", tags=["exam"])

class CreateExamRequest(BaseModel):
    title: str
    description: str = ""
    duration: int
    total_marks: int
    pass_marks: int = 0
    available_from: str = None
    available_until: str = None
    status: str = "draft"
    shuffle_questions: bool = False
    negative_marking: float = 0.0

class LinkMcqRequest(BaseModel):
    exam_id: str
    question_ids: List[str]

class LinkCodingRequest(BaseModel):
    exam_id: str
    coding_question_ids: List[str]

class ImportMcqRequest(BaseModel):
    questions: List[Dict[str, Any]]

class ImportCodingRequest(BaseModel):
    questions: List[Dict[str, Any]]

class AddMcqQuestion(BaseModel):
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    marks: int = 1

class AddMcqsRequest(BaseModel):
    questions: List[AddMcqQuestion]

class AddCodingQuestion(BaseModel):
    title: str
    description: str
    difficulty: str = "medium"
    starter_code: str = ""
    test_cases: List[Dict[str, Any]] = []
    marks: int = 10

class AddCodingRequest(BaseModel):
    question: AddCodingQuestion

class AddQuestionsRequest(BaseModel):
    exam_id: str
    questions: List[AddMcqQuestion]

class AddCodingQuestionsRequest(BaseModel):
    exam_id: str
    coding_questions: List[AddCodingQuestion]

class AssignExamRequest(BaseModel):
    exam_id: str
    candidate_ids: List[str]

class StartExamRequest(BaseModel):
    exam_id: str

def get_exam_validation_error(title: str, duration: int, total_marks: int, pass_marks: int) -> str:
    if not title or not title.strip():
        return "Title is required"
    if duration <= 0:
        return "Duration must be positive"
    if total_marks <= 0:
        return "Total marks must be positive"
    if pass_marks < 0 or pass_marks > total_marks:
        return "Pass marks must be between 0 and total marks"
    return ""

def invalidate_pattern(pattern: str):
    if redis_client:
        try:
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
        except Exception:
            pass

@router.post("/create")
async def create_exam(req: CreateExamRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    val_err = get_exam_validation_error(req.title, req.duration, req.total_marks, req.pass_marks)
    if val_err:
        raise HTTPException(status_code=400, detail=val_err)
        
    payload = {
        "title": req.title.strip(),
        "description": req.description,
        "duration": req.duration,
        "total_marks": req.total_marks,
        "pass_marks": req.pass_marks,
        "status": req.status,
        "shuffle_questions": req.shuffle_questions,
        "negative_marking": max(0.0, req.negative_marking),
        "created_by": user["id"]
    }
    if req.available_from:
        payload["available_from"] = req.available_from
    if req.available_until:
        payload["available_until"] = req.available_until
        
    res = await db.from_("exams").insert(payload).select().single()
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Failed to create exam")
        
    invalidate_pattern("cache:api:*list*")
    invalidate_pattern("cache:api:*exams*")
    return {"message": "Exam created", "exam": res.data}

@router.get("/bank/mcq")
async def get_bank_mcq(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    res = await db.from_("questions").select("*").or_(f"created_by.eq.{user['id']},created_by.is.null").order("created_at", ascending=False)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Query failed")
    return {"questions": res.data or []}

@router.get("/bank/coding")
async def get_bank_coding(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    res = await db.from_("coding_questions").select("*").or_(f"created_by.eq.{user['id']},created_by.is.null").order("created_at", ascending=False)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Query failed")
    return {"coding_questions": res.data or []}

@router.post("/bank/link-mcq")
async def link_bank_mcq(req: LinkMcqRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    rows = [{"exam_id": req.exam_id, "question_id": qid, "marks": 1} for qid in req.question_ids]
    # upsert with simple insert/replace logic or custom query:
    for row in rows:
        await db.from_("exam_questions").upsert(row, on_conflict="exam_id,question_id")
    return {"message": "Questions linked to exam"}

@router.post("/bank/link-coding")
async def link_bank_coding(req: LinkCodingRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    rows = [{"exam_id": req.exam_id, "coding_question_id": qid, "marks": 10} for qid in req.coding_question_ids]
    for row in rows:
        await db.from_("exam_coding_questions").upsert(row, on_conflict="exam_id,coding_question_id")
    return {"message": "Coding questions linked to exam"}

@router.post("/bank/add-mcqs")
async def add_bank_mcqs(req: AddMcqsRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    inserted = []
    for q in req.questions:
        payload = {
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_option": q.correct_option,
            "marks": q.marks,
            "created_by": user["id"]
        }
        res = await db.from_("questions").insert(payload).select().single()
        if not res.error and res.data:
            inserted.append(res.data)
    return {"message": f"{len(inserted)} question(s) saved to bank", "questions": inserted}

@router.post("/bank/add-coding")
async def add_bank_coding(req: AddCodingRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    q = req.question
    payload = {
        "title": q.title,
        "description": q.description,
        "difficulty": q.difficulty,
        "starter_code": q.starter_code,
        "test_cases": q.test_cases,
        "marks": q.marks,
        "created_by": user["id"]
    }
    res = await db.from_("coding_questions").insert(payload).select().single()
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Failed to save coding question")
    return {"message": "Coding question saved to bank", "question": res.data}

@router.post("/add-questions")
async def add_questions(req: AddQuestionsRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    inserted = []
    for q in req.questions:
        q_res = await db.from_("questions").insert({
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_option": q.correct_option,
            "marks": q.marks,
            "created_by": user["id"]
        }).select().single()
        if q_res.error or not q_res.data:
            continue
        link_res = await db.from_("exam_questions").insert({
            "exam_id": req.exam_id,
            "question_id": q_res.data["id"],
            "marks": q.marks
        }).select().single()
        if not link_res.error:
            inserted.append(link_res.data)
    return {"message": "Questions added", "questions": inserted}

@router.post("/add-coding-questions")
async def add_coding_questions(req: AddCodingQuestionsRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    inserted = []
    for q in req.coding_questions:
        q_res = await db.from_("coding_questions").insert({
            "title": q.title,
            "description": q.description,
            "difficulty": q.difficulty,
            "starter_code": q.starter_code,
            "test_cases": q.test_cases,
            "marks": q.marks,
            "created_by": user["id"]
        }).select().single()
        if q_res.error or not q_res.data:
            continue
        link_res = await db.from_("exam_coding_questions").insert({
            "exam_id": req.exam_id,
            "coding_question_id": q_res.data["id"],
            "marks": q.marks
        }).select().single()
        if not link_res.error:
            inserted.append(link_res.data)
    return {"message": "Coding questions added", "questions": inserted}

@router.post("/assign")
async def assign_exam(req: AssignExamRequest, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    assignments = [{"exam_id": req.exam_id, "candidate_id": cid, "assigned_by": user["id"]} for cid in req.candidate_ids]
    
    # Upsert logic in Python
    upserted = []
    for assign in assignments:
        res = await db.from_("exam_assignments").upsert(assign, on_conflict="exam_id,candidate_id")
        if not res.error:
            # Upsert on Postgres does not always return data if ignored, select it instead
            sel = await db.from_("exam_assignments").select("*").eq("exam_id", req.exam_id).eq("candidate_id", assign["candidate_id"]).single()
            if sel.data:
                upserted.append(sel.data)
                
    new_count = len(upserted)
    skipped = len(assignments) - new_count
    message = f"{new_count} candidate(s) assigned. {skipped} already had this exam (skipped)." if skipped > 0 else "Exam assigned successfully."
    
    # Send email notifications to newly assigned candidates (fire-and-forget background task)
    if new_count > 0:
        exam_res = await db.from_("exams").select("title").eq("id", req.exam_id).single()
        exam_title = exam_res.data.get("title") if exam_res.data else "Untitled Exam"
        
        cids = [a["candidate_id"] for a in upserted]
        users_res = await db.from_("users").select("id, name, email").in_("id", cids)
        for u in (users_res.data or []):
            if u.get("email"):
                app_url = "http://localhost:3000"
                body = f"Hello {u.get('name') or 'Candidate'},\n\nYou have been assigned a new exam: {exam_title}.\n\nGo to: {app_url}/candidate/my-exams to start."
                await send_email_async(u["email"], "New Exam Assigned", body)
                
    return {"message": message, "assignments": upserted}

@router.get("/list")
async def list_exams(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1),
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    role = user["role"]
    uid = user["id"]
    
    query = db.from_("exams").select("*", count="exact")
    if role == "recruiter":
        query = query.eq("created_by", uid)
        
    start_range = (page - 1) * limit
    end_range = page * limit - 1
    res = await query.order("created_at", ascending=False).range(start_range, end_range)
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Query failed")
        
    return {"exams": res.data or [], "total": res.count or 0, "page": page, "limit": limit}

@router.post("/start")
async def start_exam(req: StartExamRequest, user: Dict[str, Any] = Depends(get_current_user)):
    uid = user["id"]
    email = user["email"]
    
    assign_res = await db.from_("exam_assignments").select("*").eq("exam_id", req.exam_id).eq("candidate_id", uid).single()
    if assign_res.error or not assign_res.data:
        raise HTTPException(status_code=403, detail="Exam not assigned to you")
        
    exam_res = await db.from_("exams").select("created_by, title, available_from, available_until").eq("id", req.exam_id).single()
    if exam_res.error or not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    exam = exam_res.data
    now = datetime.datetime.utcnow()
    
    if exam.get("available_from"):
        try:
            from_dt = datetime.datetime.fromisoformat(exam["available_from"].replace("Z", "+00:00")).replace(tzinfo=None)
            if from_dt > now:
                raise HTTPException(status_code=403, detail=f"Exam opens at {from_dt.isoformat()}")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
                
    if exam.get("available_until"):
        try:
            until_dt = datetime.datetime.fromisoformat(exam["available_until"].replace("Z", "+00:00")).replace(tzinfo=None)
            if until_dt < now:
                raise HTTPException(status_code=403, detail="Exam attempt window has closed")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
                
    existing_res = await db.from_("attempts").select("*").eq("exam_id", req.exam_id).eq("candidate_id", uid).eq("status", "in_progress").maybeSingle()
    if existing_res.data:
        return {"attempt": existing_res.data}
        
    completed_res = await db.from_("attempts").select("*").eq("exam_id", req.exam_id).eq("candidate_id", uid).eq("status", "completed").maybeSingle()
    if completed_res.data:
        raise HTTPException(status_code=400, detail="Exam already completed")
        
    user_res = await db.from_("users").select("name").eq("id", uid).single()
    candidate_name = user_res.data.get("name") if user_res.data else email
    
    ins_res = await db.from_("attempts").insert({
        "exam_id": req.exam_id,
        "candidate_id": uid,
        "recruiter_id": exam["created_by"],
        "status": "in_progress",
        "score": 0,
        "started_at": now.isoformat() + "Z"
    }).select().single()
    
    if ins_res.error:
        raise HTTPException(status_code=400, detail=ins_res.error.get("message") or "Failed to start exam")
        
    # Emit start socket event to admin room
    try:
        await sio.emit("admin:exam_start", {
            "attemptId": ins_res.data["id"],
            "candidateName": candidate_name,
            "examTitle": exam.get("title") or "Exam",
            "startedAt": ins_res.data["started_at"]
        }, room="admin")
    except Exception:
        pass
        
    return {"attempt": ins_res.data}

@router.get("/{examId}")
async def get_exam_details(examId: str, user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    res = await db.from_("exams").select("*").eq("id", examId).single()
    if res.error or not res.data:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    mcq_res = await db.from_("exam_questions").select("*, questions:question_id(*)").eq("exam_id", examId)
    coding_res = await db.from_("exam_coding_questions").select("*, coding_questions:coding_question_id(*)").eq("exam_id", examId)
    
    return {
        "exam": res.data,
        "mcqQuestions": mcq_res.data or [],
        "codingQuestions": coding_res.data or []
    }


@router.post("/bank/import-mcq-csv")
async def import_mcq_csv(
    req: ImportMcqRequest,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    """Bulk import MCQ questions from CSV-parsed JSON."""
    inserted = []
    errors = []
    for i, q in enumerate(req.questions):
        try:
            payload = {
                "question_text": q.get("question_text") or q.get("question") or "",
                "option_a": q.get("option_a") or q.get("a") or "",
                "option_b": q.get("option_b") or q.get("b") or "",
                "option_c": q.get("option_c") or q.get("c") or "",
                "option_d": q.get("option_d") or q.get("d") or "",
                "correct_option": (q.get("correct_option") or q.get("answer") or "A").upper(),
                "marks": int(q.get("marks") or 1),
                "topic": q.get("topic") or "general",
                "difficulty": q.get("difficulty") or "medium",
                "created_by": user["id"],
            }
            if not payload["question_text"] or not payload["option_a"]:
                errors.append({"row": i, "error": "Missing required fields"})
                continue
            res = await db.from_("questions").insert(payload).select().single()
            if not res.error and res.data:
                inserted.append(res.data)
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
    return {"message": f"{len(inserted)} questions imported", "inserted": len(inserted), "errors": errors}


@router.post("/bank/import-coding-csv")
async def import_coding_csv(
    req: ImportCodingRequest,
    user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))
):
    """Bulk import coding questions from CSV-parsed JSON."""
    inserted = []
    errors = []
    for i, q in enumerate(req.questions):
        try:
            test_cases_raw = q.get("test_cases") or "[]"
            if isinstance(test_cases_raw, str):
                import json
                test_cases = json.loads(test_cases_raw)
            else:
                test_cases = test_cases_raw
            payload = {
                "title": q.get("title") or "",
                "description": q.get("description") or "",
                "difficulty": q.get("difficulty") or "medium",
                "starter_code": q.get("starter_code") or "",
                "test_cases": test_cases,
                "marks": int(q.get("marks") or 10),
                "created_by": user["id"],
            }
            if not payload["title"] or not payload["description"]:
                errors.append({"row": i, "error": "Missing title or description"})
                continue
            res = await db.from_("coding_questions").insert(payload).select().single()
            if not res.error and res.data:
                inserted.append(res.data)
        except Exception as e:
            errors.append({"row": i, "error": str(e)})
    return {"message": f"{len(inserted)} coding questions imported", "inserted": len(inserted), "errors": errors}


@router.get("/bank/export-mcq")
async def export_mcq_csv(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    """Export all MCQ questions as CSV."""
    res = await db.from_("questions").select("question_text, option_a, option_b, option_c, option_d, correct_option, marks, topic, difficulty").or_(f"created_by.eq.{user['id']},created_by.is.null").order("created_at", ascending=False)
    questions = res.data or []
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["question_text", "option_a", "option_b", "option_c", "option_d", "correct_option", "marks", "topic", "difficulty"])
    for q in questions:
        writer.writerow([q.get("question_text"), q.get("option_a"), q.get("option_b"), q.get("option_c"), q.get("option_d"), q.get("correct_option"), q.get("marks"), q.get("topic"), q.get("difficulty")])
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=mcq_questions.csv"})


@router.get("/bank/export-coding")
async def export_coding_csv(user: Dict[str, Any] = Depends(require_roles(["recruiter", "admin"]))):
    """Export all coding questions as CSV."""
    res = await db.from_("coding_questions").select("title, description, difficulty, starter_code, test_cases, marks").or_(f"created_by.eq.{user['id']},created_by.is.null").order("created_at", ascending=False)
    questions = res.data or []
    import json
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["title", "description", "difficulty", "starter_code", "test_cases", "marks"])
    for q in questions:
        tc = q.get("test_cases")
        tc_str = json.dumps(tc) if isinstance(tc, (list, dict)) else (tc or "[]")
        writer.writerow([q.get("title"), q.get("description"), q.get("difficulty"), q.get("starter_code") or "", tc_str, q.get("marks")])
    from fastapi.responses import StreamingResponse
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=coding_questions.csv"})
