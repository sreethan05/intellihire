from typing import Any, Dict, List, Optional

from .ai import generate_json, has_ai_key
from .repositories import interview_repo
from .utils import deserialize_drive_colleges
from .date_utils import now_iso
from . import interview_core
from .interview_core import clamp_score, fallback_feedback, score_answer

# Backwards-compatible aliases — this module historically defined these names.
STAGES = interview_core.STAGES
defaultIntroQuestions = interview_core.default_intro_questions
defaultSpeakingQuestions = interview_core.default_speaking_questions
defaultTechnicalQuestions = interview_core.default_technical_questions


async def get_passed_attempts(candidate_id: str, exam_id: Optional[str] = None) -> List[dict]:
    attempts = await interview_repo.get_attempts_by_candidate(candidate_id, exam_id)
    return interview_core.map_passed_attempts(attempts)


async def check_eligibility(candidate_id: str) -> dict:
    passed = await get_passed_attempts(candidate_id)
    if not passed:
        return {"eligible": False, "message": "No qualifying exam result was found for this candidate account."}
    return {"eligible": True, "attempts": passed}


async def get_pending_interviews_list(candidate_id: str) -> List[dict]:
    return await interview_repo.get_pending_interviews(candidate_id)


async def get_recruiter_pending(recruiter_id: str) -> List[dict]:
    return await interview_repo.get_recruiter_pending_interviews(recruiter_id)


async def start_interview(candidate_id: str, job_id: Optional[str] = None, exam_id: Optional[str] = None) -> dict:
    eligible_attempts = await get_passed_attempts(candidate_id, exam_id)
    if not eligible_attempts:
        raise ValueError("You must pass the qualifying exam first.")

    attempt = eligible_attempts[0]
    job = await interview_repo.get_job_by_id(job_id) if job_id else None
    questions_data = await build_stage_questions(candidate_id, attempt, job)

    return await interview_repo.insert_interview({
        "candidate_id": candidate_id,
        "exam_id": attempt["examId"],
        "job_id": job_id or None,
        "status": "started",
        "questions": questions_data["all"],
    })


async def schedule_interview(interview_id: str, scheduled_start: str, scheduled_end: str) -> dict:
    return await interview_repo.update_interview(interview_id, {
        "scheduled_start": scheduled_start,
        "scheduled_end": scheduled_end,
        "status": "scheduled",
    })


async def get_interview_answers_list(interview_id: str) -> List[dict]:
    return await interview_repo.get_interview_answers(interview_id)


async def feed_answer(interview_id: str, candidate_id: str, question: str, answer: str, stage: int) -> dict:
    interview = await interview_repo.get_interview_by_id(interview_id)
    if not interview or interview.get("candidate_id") != candidate_id:
        raise ValueError("Forbidden")

    status = interview.get("status")
    if status not in ("started", "in_progress"):
        raise ValueError("Interview is not active")

    if status == "started":
        await interview_repo.update_interview(interview_id, {"status": "in_progress"})

    eval_result = await evaluate_answer(question, answer, stage, interview.get("jobs"))

    return await interview_repo.insert_interview_answer({
        "interview_id": interview_id,
        "question": question,
        "answer": answer,
        "score": eval_result["score"],
        "pronunciation_score": eval_result.get("pronunciation_score"),
        "clarity_score": eval_result.get("clarity_score"),
        "feedback": eval_result["feedback"],
    })


async def submit_interview(interview_id: str, candidate_id: str) -> dict:
    interview = await interview_repo.get_interview_by_id(interview_id)
    if not interview or interview.get("candidate_id") != candidate_id:
        raise ValueError("Forbidden")

    updated = await interview_repo.update_interview(interview_id, {
        "status": "processing",
        "submitted_at": now_iso(),
    })

    # Push to background grading queue
    from .queue_manager import gradingQueue
    gradingQueue.push_interview_evaluation(interview_id)

    return {"interview": updated}


async def evaluate_interview(interview_id: str) -> dict:
    interview = await interview_repo.get_interview_by_id(interview_id)
    if not interview:
        raise ValueError(f"Interview {interview_id} not found")

    interview_pass_score = 60
    job = interview.get("jobs") or {}
    if job.get("interview_pass_score") is not None:
        interview_pass_score = int(job["interview_pass_score"])

    raw_answers = await interview_repo.get_interview_answers(interview_id)

    answers = [interview_core.answer_view(a, i) for i, a in enumerate(raw_answers or [])]

    result = await summarize_interview(answers, interview_pass_score, job)

    return await interview_repo.update_interview(interview_id, {
        "status": "completed",
        "score": result["score"],
        "intro_score": result["intro_score"],
        "speaking_score": result["speaking_score"],
        "pronunciation_score": result["pronunciation_score"],
        "technical_score": result["technical_score"],
        "selected": result["selected"],
        "relevance_score": result["relevance_score"],
        "communication_score": result["communication_score"],
        "summary": result["summary"],
        "feedback": result["feedback"],
    })


async def get_interview_details(interview_id: str, user_id: str, role: str) -> dict:
    interview = await interview_repo.get_interview_by_id(interview_id)
    if not interview:
        raise ValueError("Interview not found")
    if role == "candidate" and interview.get("candidate_id") != user_id:
        raise ValueError("Forbidden")
    return {"interview": interview}


async def get_candidate_interviews(candidate_id: str) -> dict:
    interviews = await interview_repo.get_interviews_by_candidate(candidate_id)
    return {"interviews": interviews}


async def get_recruiter_interviews(role: str, user_id: str, college_id: Optional[str] = None) -> dict:
    interviews = await interview_repo.get_interview_summaries(role, user_id, college_id)
    return {"interviews": interviews}


async def build_stage_questions(candidate_id: str, attempt: dict, job: Optional[dict]) -> dict:
    """Adapter: inject this module's collaborators into the shared core."""
    return await interview_core.build_stage_questions(
        candidate_id, attempt, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
        get_profile=interview_repo.get_candidate_profile,
    )


async def evaluate_answer(question: str, answer: str, stage: int, job: Optional[dict] = None) -> dict:
    """Adapter: inject this module's collaborators into the shared core."""
    return await interview_core.evaluate_answer(
        question, answer, stage, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
    )


async def summarize_interview(answers: List[dict], interview_pass_score: int, job: Optional[dict] = None) -> dict:
    """Adapter: inject this module's collaborators into the shared core."""
    return await interview_core.summarize_interview(
        answers, interview_pass_score, job,
        ai_key=has_ai_key,
        generate_json=generate_json,
        deserialize=deserialize_drive_colleges,
    )
