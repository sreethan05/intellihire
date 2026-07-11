import math
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from .ai import generate_json, has_ai_key
from .logger import logger
from .repositories import interview_repo
from .utils import deserialize_drive_colleges

STAGES = [
    {"id": 1, "name": "Introduction", "questionCount": 2},
    {"id": 2, "name": "Speaking Skills", "questionCount": 2},
    {"id": 3, "name": "Technical", "questionCount": 3},
]

defaultIntroQuestions = [
    "Please introduce yourself — your name, background, and what you're currently working on or studying.",
    "Tell me about your most impactful project or achievement and what role you played in it.",
]

defaultSpeakingQuestions = [
    "Describe a challenge you faced recently and walk me through how you communicated it to your team or mentor.",
    "Explain a technical concept from your domain as if you were teaching it to someone new.",
]

defaultTechnicalQuestions = [
    "What data structures would you use to solve a real-time leaderboard problem, and why?",
    "Explain the difference between synchronous and asynchronous programming with a practical example.",
    "How would you design a simple URL shortener service? Walk me through the key components.",
]


async def get_passed_attempts(candidate_id: str, exam_id: Optional[str] = None) -> List[dict]:
    attempts = await interview_repo.get_attempts_by_candidate(candidate_id, exam_id)
    passed = []
    for attempt in attempts:
        exam = attempt.get("exams") or {}
        if isinstance(exam, list):
            exam = exam[0] if exam else {}
        
        score = float(attempt.get("score") or 0.0)
        pass_marks = float(exam.get("pass_marks") or 0.0)
        total_marks = float(exam.get("total_marks") or 0.0)
        
        if not exam or score < pass_marks:
            continue
            
        passed.append({
            "attemptId": attempt["id"],
            "examId": attempt.get("exam_id"),
            "examTitle": exam.get("title") or "Qualified Exam",
            "examDescription": exam.get("description") or None,
            "score": score,
            "totalMarks": total_marks,
            "passMarks": pass_marks,
            "percentage": round((score / total_marks) * 100, 1) if total_marks else 0.0,
            "submittedAt": attempt.get("submitted_at") or None,
        })
    return passed


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
        score = float(value)
        if math.isnan(score):
            return fallback
        return max(0, min(100, int(round(score))))
    except Exception:
        return fallback


def fallback_feedback(score: int) -> str:
    return "Clear answer with useful detail." if score >= 75 else "Add more concrete examples and outcomes."


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
        "submitted_at": datetime.utcnow().isoformat(),
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
    
    answers = []
    for i, a in enumerate(raw_answers or []):
        score_val = int(a.get("score") or 0)
        pron_score = int(a["pronunciation_score"]) if a.get("pronunciation_score") is not None else None
        clarity_score = int(a["clarity_score"]) if a.get("clarity_score") is not None else None
        
        stage_val = 1
        if i >= 4:
            stage_val = 3
        elif i >= 2:
            stage_val = 2
            
        answers.append({
            "score": score_val,
            "question": str(a.get("question") or ""),
            "answer": str(a.get("answer") or ""),
            "stage": stage_val,
            "pronunciation_score": pron_score,
            "clarity_score": clarity_score,
        })

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
    intro_questions = defaultIntroQuestions
    speaking_questions = defaultSpeakingQuestions
    technical_questions = defaultTechnicalQuestions

    if has_ai_key():
        try:
            profile = await interview_repo.get_candidate_profile(candidate_id)
            clean_job_desc = "Not provided"
            persona = ""
            custom_instructions = ""

            if job:
                parsed_desc = deserialize_drive_colleges(job.get("company_description") or "")
                clean_job_desc = parsed_desc["description"]
                ai_config = parsed_desc.get("aiConfig") or {}
                persona = ai_config.get("persona") or ""
                custom_instructions = ai_config.get("instructions") or ""

            job_context = (
                f"Job title: {job.get('title')}\nCompany: {job.get('company_name')}\n"
                f"Description: {clean_job_desc}\n"
                f"Required skills: {', '.join(job.get('required_skills')) if isinstance(job.get('required_skills'), list) else 'Not provided'}"
            ) if job else (
                f"Exam: {attempt['examTitle']}\nExam description: {attempt['examDescription'] or 'Not provided'}"
            )

            persona_part = f"The interviewer persona is: {persona}. Please match this tone/style.\n" if persona else ""
            custom_part = f"Custom instructions to follow:\n{custom_instructions}\n" if custom_instructions else ""

            prompt = (
                f"Return only JSON.\n"
                f"Generate exactly 3 technical interview questions for a campus placement AI interview.\n"
                f"Questions must be specific to the job role and test practical knowledge.\n"
                f"Make them conversational — suitable for a spoken voice interview, not written answers.\n\n"
                f"{job_context}\n"
                f"Candidate skills: {', '.join(profile.get('skills')) if profile and isinstance(profile.get('skills'), list) else 'Not provided'}\n"
                f"Exam score: {attempt['score']}/{attempt['totalMarks']}\n\n"
                f"{persona_part}"
                f"{custom_part}\n"
                f"Schema:\n"
                f"{{\n"
                f"  \"questions\": [\n"
                f"    \"Question 1\",\n"
                f"    \"Question 2\",\n"
                f"    \"Question 3\"\n"
                f"  ]\n"
                f"}}\n"
            )

            result = await generate_json(prompt, "You are an AI technical placement interviewer.")
            generated = [str(q).strip() for q in (result.get("questions") or []) if str(q).strip()]
            
            if len(generated) >= 2:
                technical_questions = generated[:3]
        except Exception as err:
            logger.warn(f"AI technical question generation failed, using defaults: {err}")

    return {
        "stage1": intro_questions,
        "stage2": speaking_questions,
        "stage3": technical_questions,
        "all": intro_questions + speaking_questions + technical_questions,
    }


async def evaluate_answer(question: str, answer: str, stage: int, job: Optional[dict] = None) -> dict:
    fallback_val = score_answer(answer)

    if not has_ai_key():
        return {
            "score": fallback_val,
            "feedback": fallback_feedback(fallback_val),
            "pronunciation_score": min(100, fallback_val + 5) if stage == 2 else None,
            "clarity_score": min(100, fallback_val - 3) if stage == 2 else None,
        }

    persona = ""
    custom_rubric = ""
    examples = []

    if job and job.get("company_description"):
        parsed_desc = deserialize_drive_colleges(job["company_description"])
        ai_config = parsed_desc.get("aiConfig") or {}
        persona = ai_config.get("persona") or ""
        custom_rubric = ai_config.get("rubric") or ""
        examples = ai_config.get("examples") or []

    persona_part = f"Evaluate as this interviewer persona: {persona}.\n" if persona else ""
    rubric_part = f"Use this specific grading rubric:\n{custom_rubric}\n" if custom_rubric else ""

    try:
        if stage == 2:
            system_prompt = (
                f"You are evaluating a spoken voice interview answer for speaking skills, clarity, and pronunciation.\n"
                f"{persona_part}"
                f"Analyze for:\n"
                f"- Overall communication quality (0-100)\n"
                f"- Pronunciation quality inferred from word choice/coherence (0-100)\n"
                f"- Clarity and consistency of expression (0-100)\n"
                f"{rubric_part}"
                f"Return ONLY JSON.\n"
                f"Constraints:\n"
                f"- \"feedback\" MUST be exactly one concise improvement sentence (max 18 words).\n"
                f"Schema:\n"
                f"{{\n"
                f"  \"score\": 78,\n"
                f"  \"pronunciation_score\": 75,\n"
                f"  \"clarity_score\": 80,\n"
                f"  \"feedback\": \"One concise feedback sentence.\"\n"
                f"}}"
            )
            user_prompt = f"Question: {question}\nAnswer: {answer}"
            result = await generate_json(user_prompt, system_prompt)

            score = clamp_score(result.get("score"), fallback_val)
            return {
                "score": score,
                "feedback": str(result.get("feedback") or fallback_feedback(score)).strip(),
                "pronunciation_score": clamp_score(result.get("pronunciation_score"), score),
                "clarity_score": clamp_score(result.get("clarity_score"), score),
            }

        training_examples = ""
        if examples:
            ex_str_list = []
            for idx, ex in enumerate(examples):
                ex_str_list.append(
                    f"Example {idx + 1}:\n"
                    f"Question: {ex.get('question')}\n"
                    f"Answer: {ex.get('answer')}\n"
                    f"Suggested Score: {ex.get('score')}\n"
                    f"Suggested Feedback: {ex.get('feedback')}"
                )
            joined_examples = '\n'.join(ex_str_list)
            training_examples = (
                f"\nUse the following training examples to understand how you should score and provide feedback:\n"
                f"{joined_examples}"
            )

        rubric_part_default = f"Use this specific grading rubric to judge and grade the answer:\n{custom_rubric}\n" if custom_rubric else ""

        system_prompt = (
            f"You are scoring a live AI interview answer.\n"
            f"{persona_part}"
            f"Score 0-100 for: relevance, technical clarity, communication, specificity, and evidence.\n"
            f"{rubric_part_default}"
            f"{training_examples}\n"
            f"Return ONLY JSON.\n"
            f"Constraints:\n"
            f"- \"feedback\" MUST be exactly one concise improvement sentence (max 18 words).\n"
            f"Schema:\n"
            f"{{\n"
            f"  \"score\": 82,\n"
            f"  \"feedback\": \"One concise feedback sentence.\"\n"
            f"}}"
        )
        user_prompt = f"Question: {question}\nAnswer: {answer}"
        result = await generate_json(user_prompt, system_prompt)

        score = clamp_score(result.get("score"), fallback_val)
        return {
            "score": score,
            "feedback": str(result.get("feedback") or fallback_feedback(score)).strip(),
        }
    except Exception as e:
        logger.warn(f"AI answer scoring failed, using fallback: {e}")
        return {
            "score": fallback_val,
            "feedback": fallback_feedback(fallback_val),
        }


async def summarize_interview(answers: List[dict], interview_pass_score: int, job: Optional[dict] = None) -> dict:
    stage1_answers = [a for a in answers if a["stage"] == 1]
    stage2_answers = [a for a in answers if a["stage"] == 2]
    stage3_answers = [a for a in answers if a["stage"] == 3]

    def avg(arr: List[dict]) -> int:
        if not arr:
            return 0
        return int(round(sum(a["score"] for a in arr) / len(arr)))

    intro_score = avg(stage1_answers)
    speaking_score = avg(stage2_answers)
    pronunciation_score = 0
    if stage2_answers:
        pronunciation_score = int(round(sum(a.get("pronunciation_score") or a["score"] for a in stage2_answers) / len(stage2_answers)))
    technical_score = avg(stage3_answers)

    overall_score = 0
    if answers:
        overall_score = int(round(sum(a["score"] for a in answers) / len(answers)))

    selected = overall_score >= interview_pass_score

    fallback = {
        "score": overall_score,
        "intro_score": intro_score,
        "speaking_score": speaking_score,
        "pronunciation_score": pronunciation_score,
        "technical_score": technical_score,
        "selected": selected,
        "relevance_score": max(0, min(100, overall_score + 3)),
        "communication_score": max(0, min(100, overall_score - 2)),
        "summary": f"Candidate completed {len(answers)} interview responses with an overall score of {overall_score}/100.",
        "feedback": (
            "Strong interview performance. Keep answers concise and back them with measurable outcomes."
            if overall_score >= 75 else
            "Improve with stronger examples, clearer structure, and deeper technical explanation."
        ),
    }

    if not answers or not has_ai_key():
        return fallback

    persona = ""
    if job and job.get("company_description"):
        parsed_desc = deserialize_drive_colleges(job["company_description"])
        ai_config = parsed_desc.get("aiConfig") or {}
        persona = ai_config.get("persona") or ""

    try:
        transcript_parts = []
        for i, a in enumerate(answers):
            transcript_parts.append(f"Stage {a['stage']} Q{i + 1}: {a['question']}\nAnswer: {a['answer']}\nScore: {a['score']}")
        transcript = "\n\n".join(transcript_parts)

        system_prompt = (
            f"You are summarizing a completed technical placement AI interview.\n"
            f"{f'The interview was conducted by the AI persona: {persona}.' if persona else ''}\n"
            f"Grade overall candidate relevance (0-100) and communication (0-100) based on transcript.\n"
            f"Return ONLY JSON.\n"
            f"Constraints:\n"
            f"- \"summary\": Single summary paragraph (max 60 words).\n"
            f"- \"feedback\": Short improvement paragraph (max 40 words).\n"
            f"Schema:\n"
            f"{{\n"
            f"  \"relevance_score\": 84,\n"
            f"  \"communication_score\": 79,\n"
            f"  \"summary\": \"Overall summary of the candidate performance.\",\n"
            f"  \"feedback\": \"Improvement-oriented feedback.\"\n"
            f"}}"
        )
        user_prompt = f"Transcript:\n{transcript}"

        result = await generate_json(user_prompt, system_prompt)

        return {
            **fallback,
            "relevance_score": clamp_score(result.get("relevance_score"), fallback["relevance_score"]),
            "communication_score": clamp_score(result.get("communication_score"), fallback["communication_score"]),
            "summary": str(result.get("summary") or fallback["summary"]).strip(),
            "feedback": str(result.get("feedback") or fallback["feedback"]).strip(),
        }
    except Exception as e:
        logger.warn(f"AI interview summary failed, using fallback: {e}")
        return fallback
