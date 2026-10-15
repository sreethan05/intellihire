import hashlib
import random
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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
    
    # Server-side shuffling: questions are shuffled on the server using a
    # per-candidate seed so the order is deterministic per candidate (resilient to reload)
    # but unique across candidates to prevent screen-peeking / collusion.
    should_shuffle = bool(exam_res.data.get("shuffle_questions"))
    if should_shuffle:
        seed_hex = hashlib.sha256(f"{examId}_{candidate_id}".encode("utf-8")).hexdigest()[:8]
        seed = int(seed_hex, 16)
        rng = random.Random(seed)

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
        raw_cq = dict(q.get("coding_questions") or {})
        raw_cq.pop("hidden_cases", None)  # Prevent leakage of hidden test cases
        coding_mapped.append({
            "id": q["id"],
            "coding_question_id": q["coding_question_id"],
            "marks": q.get("marks"),
            "question": raw_cq
        })

    # Shuffle on server side if enabled
    if should_shuffle:
        rng.shuffle(mcq_mapped)
        rng.shuffle(coding_mapped)

    return {
        "exam": exam_res.data,
        "mcqQuestions": mcq_mapped,
        "codingQuestions": coding_mapped
    }


class JoinWaitlistRequest(BaseModel):
    exam_id: str

@router.post("/waitlist/join")
async def join_waitlist(req: JoinWaitlistRequest, user: Dict[str, Any] = Depends(get_current_user)):
    """Join the waitlist for a full exam."""
    exam_res = await db.from_("exams").select("seat_capacity, status").eq("id", req.exam_id).single()
    if exam_res.error or not exam_res.data:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Check if already assigned
    assign_res = await db.from_("exam_assignments").select("id").eq("exam_id", req.exam_id).eq("candidate_id", user["id"]).maybeSingle()
    if assign_res.data:
        raise HTTPException(status_code=400, detail="You are already assigned to this exam")

    # Check if already on waitlist
    existing_res = await db.from_("exam_waitlist").select("id, status").eq("exam_id", req.exam_id).eq("candidate_id", user["id"]).maybeSingle()
    if existing_res.data and existing_res.data.get("status") == "waiting":
        raise HTTPException(status_code=400, detail="You are already on the waitlist")

    # Get next position
    pos_res = await db.from_("exam_waitlist").select("position").eq("exam_id", req.exam_id).eq("status", "waiting").order("position", ascending=False).limit(1)
    next_pos = 1
    if pos_res.data:
        next_pos = pos_res.data[0]["position"] + 1

    if existing_res.data:
        # Re-activate previously cancelled or expired waitlist entry to respect UNIQUE(exam_id, candidate_id)
        res = await db.from_("exam_waitlist").update({
            "position": next_pos,
            "status": "waiting",
            "promoted_at": None,
            "expires_at": None,
        }).eq("id", existing_res.data["id"]).select().single()
    else:
        res = await db.from_("exam_waitlist").insert({
            "exam_id": req.exam_id,
            "candidate_id": user["id"],
            "position": next_pos,
            "status": "waiting",
        }).select().single()

    if res.error:
        raise HTTPException(status_code=400, detail=res.error.get("message") or "Failed to join waitlist")

    return {"message": "Added to waitlist", "position": next_pos, "waitlistEntry": res.data}

@router.get("/waitlist/{examId}/status")
async def get_waitlist_status(examId: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Check the candidate's waitlist position for an exam."""
    res = await db.from_("exam_waitlist").select("position, status, promoted_at, expires_at").eq("exam_id", examId).eq("candidate_id", user["id"]).maybeSingle()

    if not res.data:
        return {"onWaitlist": False}

    entry = res.data
    if entry.get("status") == "waiting":
        ahead_res = await db.from_("exam_waitlist").select("id").eq("exam_id", examId).eq("status", "waiting").lt("position", entry["position"])
        ahead_count = len(ahead_res.data or [])
    else:
        ahead_count = 0

    return {
        "onWaitlist": True,
        "position": entry.get("position"),
        "status": entry.get("status"),
        "promotedAt": entry.get("promoted_at"),
        "expiresAt": entry.get("expires_at"),
        "candidatesAhead": ahead_count,
    }

@router.post("/waitlist/{examId}/cancel")
async def cancel_waitlist(examId: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Cancel waitlist entry and reposition remaining candidates."""
    existing_res = await db.from_("exam_waitlist").select("id").eq("exam_id", examId).eq("candidate_id", user["id"]).eq("status", "waiting").maybeSingle()
    if not existing_res.data:
        raise HTTPException(status_code=400, detail="Candidate is not currently on the waitlist for this exam")

    res = await db.from_("exam_waitlist").delete().eq("exam_id", examId).eq("candidate_id", user["id"]).eq("status", "waiting")
    if res.error:
        raise HTTPException(status_code=400, detail="Failed to cancel waitlist entry")

    # Reposition remaining waitlisted candidates
    remaining_res = await db.from_("exam_waitlist").select("id, position").eq("exam_id", examId).eq("status", "waiting").order("position", ascending=True)
    for i, entry in enumerate(remaining_res.data or [], 1):
        if entry["position"] != i:
            await db.from_("exam_waitlist").update({"position": i}).eq("id", entry["id"])

    return {"message": "Waitlist entry cancelled"}
