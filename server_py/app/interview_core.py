"""Single source of truth for AI-interview domain logic.

Historically ``app.interview`` (the FastAPI router) and
``app.interview_service`` (the queue-backed service) each carried private
copies of the scoring heuristics, LLM prompt construction, answer/stage
mapping and summary math. The copies drifted apart (truncating vs NaN-safe
score clamping, prompt wording differences, duplicated stage tables).

This module owns that logic exactly once. Both modules are thin adapters
that inject their own collaborators (``has_ai_key`` / ``generate_json`` /
``deserialize_drive_colleges`` and, where needed, a profile loader). Keeping
the collaborators injected — rather than imported here — preserves each
module's patchable boundary in tests while the algorithm itself is shared.
"""
import math
import re
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .logger import logger

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

# Collaborators injected by the adapter modules.
AiKeyFn = Callable[[], bool]
GenerateJsonFn = Callable[..., Awaitable[Dict[str, Any]]]
DeserializeFn = Callable[[str], Dict[str, Any]]
GetProfileFn = Callable[[str], Awaitable[Optional[Dict[str, Any]]]]

_EMPTY_AI_SETTINGS: Dict[str, Any] = {
    "description": "Not provided",
    "persona": "",
    "instructions": "",
    "rubric": "",
    "examples": [],
}


def score_answer(answer: str) -> int:
    """Heuristic word-count/keyword score used when no AI key is configured."""
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
    """Clamp an AI-supplied score to 0-100, rounding to nearest int.

    NaN and non-numeric values fall back to ``fallback``.
    """
    try:
        score = float(value)
        if math.isnan(score):
            return fallback
        return max(0, min(100, int(round(score))))
    except Exception:
        return fallback


def fallback_feedback(score: int) -> str:
    return "Clear answer with useful detail." if score >= 75 else "Add more concrete examples and outcomes."


def stage_for_index(index: int) -> int:
    """Answer positions 0-1 -> stage 1, 2-3 -> stage 2, 4+ -> stage 3."""
    return 1 if index < 2 else 2 if index < 4 else 3


def extract_exam(attempt: dict) -> dict:
    """Normalize the embedded exam shape (``exam`` or ``exams``, dict or list)."""
    exam = attempt.get("exam") or attempt.get("exams") or {}
    if isinstance(exam, list):
        exam = exam[0] if exam else {}
    return exam


def map_passed_attempts(raw_attempts: List[dict]) -> List[dict]:
    """Map raw attempt rows to the client-facing "passed attempts" contract."""
    passed = []
    for attempt in raw_attempts or []:
        exam = extract_exam(attempt)
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
            "percentage": round((score / total_marks) * 100, 1) if total_marks else 0,
            "submittedAt": attempt.get("submitted_at") or None,
        })
    return passed


def answer_view(row: dict, index: int) -> dict:
    """Normalize a stored ``ai_interview_answers`` row for summarization."""
    return {
        "score": float(row.get("score") or 0.0),
        "question": str(row.get("question") or ""),
        "answer": str(row.get("answer") or ""),
        "stage": stage_for_index(index),
        "pronunciation_score": float(row["pronunciation_score"]) if row.get("pronunciation_score") is not None else None,
        "clarity_score": float(row["clarity_score"]) if row.get("clarity_score") is not None else None,
    }


def parse_job_ai_settings(job: Optional[dict], deserialize: DeserializeFn) -> Dict[str, Any]:
    """Extract the recruiter-configured AI settings from a job's description metadata."""
    if not job or not job.get("company_description"):
        return dict(_EMPTY_AI_SETTINGS)
    parsed = deserialize(job.get("company_description") or "") or {}
    ai_config = parsed.get("aiConfig") or {}
    return {
        "description": parsed.get("description") or "",
        "persona": ai_config.get("persona") or "",
        "instructions": ai_config.get("instructions") or "",
        "rubric": ai_config.get("rubric") or "",
        "examples": ai_config.get("examples") or [],
    }


async def evaluate_answer(
    question: str,
    answer: str,
    stage: int,
    job: Optional[dict] = None,
    *,
    ai_key: AiKeyFn,
    generate_json: GenerateJsonFn,
    deserialize: DeserializeFn,
) -> dict:
    """Score one interview answer, falling back to heuristics when AI is down."""
    fallback_val = score_answer(answer)

    if not ai_key():
        return {
            "score": fallback_val,
            "feedback": fallback_feedback(fallback_val),
            "pronunciation_score": min(100, fallback_val + 5) if stage == 2 else None,
            "clarity_score": min(100, fallback_val - 3) if stage == 2 else None,
        }

    settings = parse_job_ai_settings(job, deserialize)
    persona = settings["persona"]
    custom_rubric = settings["rubric"]
    examples = settings["examples"]

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
        logger.warning(f"AI answer scoring failed, using fallback: {e}")
        return {
            "score": fallback_val,
            "feedback": fallback_feedback(fallback_val),
        }


async def build_stage_questions(
    candidate_id: str,
    attempt: dict,
    job: Optional[dict],
    *,
    ai_key: AiKeyFn,
    generate_json: GenerateJsonFn,
    deserialize: DeserializeFn,
    get_profile: GetProfileFn,
) -> dict:
    """Return the stage question sets, generating the technical stage with AI when possible."""
    intro_questions = default_intro_questions
    speaking_questions = default_speaking_questions
    technical_questions = default_technical_questions

    if ai_key():
        try:
            profile = await get_profile(candidate_id)
            settings = parse_job_ai_settings(job, deserialize)

            if job:
                required_skills = job.get("required_skills")
                job_context = (
                    f"Job title: {job.get('title')}\nCompany: {job.get('company_name')}\n"
                    f"Description: {settings['description']}\n"
                    f"Required skills: {', '.join(required_skills) if isinstance(required_skills, list) else 'Not provided'}"
                )
            else:
                job_context = f"Exam: {attempt.get('examTitle')}\nExam description: {attempt.get('examDescription') or 'Not provided'}"

            candidate_skills = (
                ', '.join(profile.get('skills')) if profile and isinstance(profile.get('skills'), list) else 'Not provided'
            )
            persona_part = f"The interviewer persona is: {settings['persona']}. Please match this tone/style.\n" if settings["persona"] else ""
            custom_part = f"Custom instructions to follow:\n{settings['instructions']}\n" if settings["instructions"] else ""
            tot_marks = attempt.get("totalMarks") or attempt.get("total_marks") or 100

            prompt = (
                f"Return only JSON.\n"
                f"Generate exactly 3 technical interview questions for a campus placement AI interview.\n"
                f"Questions must be specific to the job role and test practical knowledge.\n"
                f"Make them conversational — suitable for a spoken voice interview, not written answers.\n\n"
                f"{job_context}\n"
                f"Candidate skills: {candidate_skills}\n"
                f"Exam score: {attempt.get('score', 0)}/{tot_marks}\n\n"
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
            logger.warning(f"AI technical question generation failed, using defaults: {err}")

    return {
        "stage1": intro_questions,
        "stage2": speaking_questions,
        "stage3": technical_questions,
        "all": intro_questions + speaking_questions + technical_questions,
    }


async def summarize_interview(
    answers: List[dict],
    interview_pass_score: int,
    job: Optional[dict] = None,
    *,
    ai_key: AiKeyFn,
    generate_json: GenerateJsonFn,
    deserialize: DeserializeFn,
) -> dict:
    """Aggregate staged answers into the persisted interview summary."""
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

    if not answers or not ai_key():
        return fallback

    settings = parse_job_ai_settings(job, deserialize)
    persona = settings["persona"]

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
        logger.warning(f"AI interview summary failed, using fallback: {e}")
        return fallback
