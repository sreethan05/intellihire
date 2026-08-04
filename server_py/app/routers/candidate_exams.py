from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException

from ..auth_router import get_current_user
from ..db import db

router = APIRouter(prefix="/api/candidate", tags=["candidate_exams"])

@router.get("/exams")
async def get_exams(user: Dict[str, Any] = Depends(get_current_user)):
    res = await db.from_("exam_assignments").select("*, exam:exam_id(*)").eq("candidate_id", user["id"])
    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Query failed")
    return {"exams": res.data or []}

@router.get("/exam/{examId}")
async def get_exam(examId: str, user: Dict[str, Any] = Depends(get_current_user)):
    candidate_id = user["id"]
    assign_res = await db.from_("exam_assignments").select("*").eq("exam_id", examId).eq("candidate_id", candidate_id).single()
    if assign_res.error or not assign_res.data:
        raise HTTPException(status_code=403, detail="Exam not assigned")
        
    exam_res = await db.from_("exams").select("*").eq("id", examId).single()
    if exam_res.error or not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    # Exclude correct_option from MCQ questions to prevent answer key leakage
    mcq_res = await db.from_("exam_questions").select("*, questions:question_id(id, question_text, option_a, option_b, option_c, option_d, marks, topic, difficulty, subtopic, concept_tags, bloom_level, estimated_time_sec)").eq("exam_id", examId)
    coding_res = await db.from_("exam_coding_questions").select("*, coding_questions:coding_question_id(*)").eq("exam_id", examId)
    
    mcq_mapped = []
    for q in (mcq_res.data or []):
        mcq_mapped.append({
            "id": q["id"],
            "question_id": q["question_id"],
            "marks": q.get("marks"),
            "question": q.get("questions")
        })
        
    coding_mapped = []
    for q in (coding_res.data or []):
        coding_mapped.append({
            "id": q["id"],
            "coding_question_id": q["coding_question_id"],
            "marks": q.get("marks"),
            "question": q.get("coding_questions")
        })
        
    return {
        "exam": exam_res.data,
        "mcqQuestions": mcq_mapped,
        "codingQuestions": coding_mapped
    }
