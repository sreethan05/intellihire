"""Tests for the AI interview flow: app.interview router and app.interview_service.

Two live modules implement the interview domain:

- ``app.interview`` — FastAPI router (mounted in main.py) with its own copies
  of scoring/summary helpers and a fire-and-forget background grader.
- ``app.interview_service`` — repository-based service used by the queue
  worker (``queue_manager.gradingQueue``) and other internal callers.

Both are exercised here. AI calls are patched at the module boundary
(``has_ai_key`` / ``generate_json``); DB access uses the shared mock harness.
"""
import asyncio

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app import interview as iv
from app import interview_service as svc
from tests.db_mocks import db_routing, query, sequence_db

CANDIDATE = {"id": "c1", "role": "candidate"}
RECRUITER = {"id": "r1", "role": "recruiter"}
ADMIN = {"id": "a1", "role": "admin"}

PASSED_ATTEMPT = {
    "attemptId": "at1", "examId": "e1", "examTitle": "Qualifier",
    "examDescription": "D", "score": 80.0, "totalMarks": 100.0,
    "passMarks": 60.0, "percentage": 80.0, "submittedAt": "t",
}


def fake_ai_config(**overrides):
    config = {"persona": "", "instructions": "", "rubric": "", "examples": [], "temperature": 0.4}
    config.update(overrides)
    return {"description": "clean description", "college_ids": [], "aiConfig": config}


# ---------------------------------------------------------------------------
# pure helpers (router copy)
# ---------------------------------------------------------------------------

def test_router_score_and_clamp_helpers():
    assert iv.score_answer("short") == 36  # 35 + 1 word
    detailed = iv.score_answer(
        "First I designed the pipeline, then I implemented it because it improved results"
    )
    assert detailed == 35 + 13 + 10 + 8
    assert iv.score_answer("word " * 200) == 95  # capped

    assert iv.clamp_score("77.6", 0) == 77  # float -> int truncation
    assert iv.clamp_score(-5, 3) == 0
    assert iv.clamp_score(150, 0) == 100
    assert iv.clamp_score("not-a-number", 42) == 42
    assert iv.clamp_score(None, 7) == 7

    assert iv.fallback_feedback(80).startswith("Clear answer")
    assert iv.fallback_feedback(50).startswith("Add more")


@pytest.mark.asyncio
async def test_spawn_background_tracks_and_discards_tasks():
    iv._background_tasks.clear()
    iv._spawn_background(asyncio.sleep(0))
    assert len(iv._background_tasks) == 1
    for _ in range(50):  # allow the done-callback to run
        if not iv._background_tasks:
            break
        await asyncio.sleep(0.01)
    assert len(iv._background_tasks) == 0


@pytest.mark.asyncio
async def test_interview_access_rules():
    interview = {"candidate_id": "c1", "exam_id": "e1", "job_id": "j1"}

    await iv._assert_interview_access(interview, ADMIN)  # never raises
    await iv._assert_interview_access(interview, CANDIDATE)

    with pytest.raises(HTTPException) as exc:
        await iv._assert_interview_access(interview, {"id": "c2", "role": "candidate"})
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException):
        await iv._assert_interview_access(interview, {"id": "t1", "role": "tpo"})

    # Recruiter allowed through the exam they created...
    with patch("app.interview.db", db_routing({"exams": query(data={"id": "e1"})})):
        await iv._assert_interview_access(interview, RECRUITER)

    # ...or through the job they created.
    routing = db_routing({"exams": query(data=None), "jobs": query(data={"id": "j1"})})
    with patch("app.interview.db", routing):
        await iv._assert_interview_access(interview, RECRUITER)

    routing = db_routing({"exams": query(data=None), "jobs": query(data=None)})
    with patch("app.interview.db", routing):
        with pytest.raises(HTTPException) as exc:
            await iv._assert_interview_access(interview, RECRUITER)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_router_get_passed_attempts_filters_by_pass_marks():
    attempts = [
        {"id": "a1", "exam_id": "e1", "score": 80, "submitted_at": "t",
         "exam": {"title": "T", "description": "D", "pass_marks": 60, "total_marks": 100}},
        {"id": "a2", "exam_id": "e2", "score": 10, "exam": {"pass_marks": 60, "total_marks": 100}},
        {"id": "a3", "exam_id": "e3", "score": 90, "exam": None},
    ]
    chain = query(data=attempts)
    with patch("app.interview.db", db_routing({"attempts": chain})):
        passed = await iv.get_passed_attempts("c1")
        await iv.get_passed_attempts("c1", "e1")

    assert [p["attemptId"] for p in passed] == ["a1"]
    assert passed[0]["percentage"] == 80.0
    assert passed[0]["examTitle"] == "T"
    chain.eq.assert_any_call("exam_id", "e1")


# ---------------------------------------------------------------------------
# read-only router endpoints
# ---------------------------------------------------------------------------

def test_router_stages_and_calendar_link_helpers():
    assert [s["id"] for s in iv.get_stages()["stages"]] == [1, 2, 3]

    link = iv.generate_google_calendar_link(
        "AI Interview: Backend (Acme)", "2030-05-01T10:00:00+05:30", "2030-05-01T11:00:00+05:30", "Notes"
    )
    assert link.startswith("https://calendar.google.com/calendar/render?")
    assert "20300501T043000Z" in link  # 10:00 IST -> 04:30 UTC
    assert "AI+Interview" in link

    assert iv.generate_google_calendar_link("t", "", "2030-05-01T11:00:00Z") == ""
    assert iv.generate_google_calendar_link("t", "garbage", "also garbage") == ""


@pytest.mark.asyncio
async def test_router_eligibility_pending_and_mine():
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[])):
        assert await iv.check_eligibility(CANDIDATE) == {
            "eligible": False,
            "message": "No qualifying exam result was found for this candidate account.",
        }
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[PASSED_ATTEMPT])):
        eligible = await iv.check_eligibility(CANDIDATE)
    assert eligible["eligible"] is True and eligible["attempts"] == [PASSED_ATTEMPT]

    routing = db_routing({"ai_interviews": query(data=[{"id": "i1"}])})
    with patch("app.interview.db", routing):
        assert await iv.get_pending_interviews(CANDIDATE) == {"interviews": [{"id": "i1"}]}
        assert await iv.get_mine(CANDIDATE) == {"interviews": [{"id": "i1"}]}

    with patch("app.interview.db", db_routing({"ai_interviews": query(data=None)})):
        assert await iv.get_pending_interviews(CANDIDATE) == {"interviews": []}
        assert await iv.get_mine(CANDIDATE) == {"interviews": []}


@pytest.mark.asyncio
async def test_router_recruiter_pending_scopes_to_owned_exams_and_jobs():
    interviews = query(data=[{"id": "i1"}])
    routing = db_routing({
        "ai_interviews": interviews,
        "exams": query(data=[{"id": "e1"}]),
        "jobs": query(data=[{"id": "j1"}]),
    })
    with patch("app.interview.db", routing):
        result = await iv.get_recruiter_pending(RECRUITER)
    assert result == {"interviews": [{"id": "i1"}]}
    assert interviews.or_.call_args[0][0] == "exam_id.in.(e1),job_id.in.(j1)"

    routing = db_routing({
        "ai_interviews": query(data=[]),
        "exams": query(data=[]),
        "jobs": query(data=[]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_recruiter_pending(RECRUITER) == {"interviews": []}


@pytest.mark.asyncio
async def test_router_get_interview_and_answers_with_access_checks():
    interview = {"id": "i1", "candidate_id": "c1", "exam_id": "e1", "job_id": None, "jobs": None}

    with patch("app.interview.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await iv.get_interview("ghost", ADMIN)
    assert exc.value.status_code == 404

    routing = db_routing({
        "ai_interviews": query(data=interview),
        "ai_interview_answers": query(data=[{"id": "ans1"}]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_interview("i1", ADMIN) == {"interview": interview}
        assert await iv.get_interview_answers("i1", ADMIN) == {"answers": [{"id": "ans1"}]}


@pytest.mark.asyncio
async def test_router_calendar_link_endpoint():
    interview = {
        "id": "i1", "candidate_id": "c1", "exam_id": None, "job_id": None,
        "scheduled_start": "2030-05-01T10:00:00+05:30", "scheduled_end": None,
        "jobs": {"title": "Backend", "company_name": "Acme"},
    }
    with patch("app.interview.db", sequence_db(query(data=interview))):
        result = await iv.get_calendar_link("i1", ADMIN)
    assert result["url"].startswith("https://calendar.google.com")
    assert "20300501T043000Z" in result["url"]

    unscheduled = dict(interview, scheduled_start=None)
    with patch("app.interview.db", sequence_db(query(data=unscheduled))):
        with pytest.raises(HTTPException) as exc:
            await iv.get_calendar_link("i1", ADMIN)
    assert exc.value.status_code == 400

    with patch("app.interview.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await iv.get_calendar_link("ghost", ADMIN)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_router_summaries_per_role():
    summaries = query(data=[{"id": "i1"}])

    # Recruiter with no owned exams/jobs -> empty.
    routing = db_routing({
        "ai_interviews": query(data=[]),
        "exams": query(data=[]),
        "jobs": query(data=[]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_summaries(user=RECRUITER) == {"interviews": []}

    # Recruiter with owned resources -> or_ filter applied.
    routing = db_routing({
        "ai_interviews": summaries,
        "exams": query(data=[{"id": "e1"}]),
        "jobs": query(data=[{"id": "j1"}]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_summaries(user=RECRUITER) == {"interviews": [{"id": "i1"}]}
    assert summaries.or_.call_args[0][0] == "exam_id.in.(e1),job_id.in.(j1)"

    # Candidate -> own interviews.
    candidate_chain = query(data=[{"id": "mine"}])
    with patch("app.interview.db", db_routing({"ai_interviews": candidate_chain})):
        assert await iv.get_summaries(user=CANDIDATE) == {"interviews": [{"id": "mine"}]}
    candidate_chain.eq.assert_any_call("candidate_id", "c1")

    # TPO without a college -> empty.
    routing = db_routing({
        "ai_interviews": query(data=[]),
        "users": query(data={"college_id": None}),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_summaries(user={"id": "t1", "role": "tpo"}) == {"interviews": []}

    # TPO with a college but no profiles -> empty.
    routing = db_routing({
        "ai_interviews": query(data=[]),
        "users": query(data={"college_id": "col1"}),
        "candidate_profiles": query(data=[]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_summaries(user={"id": "t1", "role": "tpo"}) == {"interviews": []}

    # TPO with profiles -> candidate_id.in_ filter.
    tpo_chain = query(data=[{"id": "i2"}])
    routing = db_routing({
        "ai_interviews": tpo_chain,
        "users": query(data={"college_id": "col1"}),
        "candidate_profiles": query(data=[{"user_id": "c1"}, {"user_id": None}]),
    })
    with patch("app.interview.db", routing):
        assert await iv.get_summaries(user={"id": "t1", "role": "tpo"}) == {"interviews": [{"id": "i2"}]}
    tpo_chain.in_.assert_any_call("candidate_id", ["c1"])

    # Explicit collegeId filter (recruiter dashboard use). Admin role skips
    # the recruiter ownership lookups so only the profiles query runs.
    explicit_chain = query(data=[])
    routing = db_routing({
        "ai_interviews": explicit_chain,
        "candidate_profiles": query(data=[{"user_id": "c9"}]),
    })
    with patch("app.interview.db", routing):
        await iv.get_summaries(collegeId="col9", user=ADMIN)
    explicit_chain.in_.assert_any_call("candidate_id", ["c9"])


# ---------------------------------------------------------------------------
# write-path router endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_router_start_interview_paths():
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[])):
        with pytest.raises(HTTPException) as exc:
            await iv.start_interview(iv.StartInterviewRequest(), user=CANDIDATE)
    assert exc.value.status_code == 400

    inserted = {"id": "i1", "status": "started"}
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[PASSED_ATTEMPT])), \
         patch("app.interview.has_ai_key", return_value=False), \
         patch("app.interview.db", sequence_db(query(data=inserted))):
        result = await iv.start_interview(iv.StartInterviewRequest(), user=CANDIDATE)
    assert result == {"message": "Interview started", "interview": inserted}

    # With a job: job lookup precedes the insert.
    job = {"id": "j1", "title": "Backend"}
    chains = [query(data=job), query(data=inserted)]
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[PASSED_ATTEMPT])), \
         patch("app.interview.has_ai_key", return_value=False), \
         patch("app.interview.db", sequence_db(*chains)):
        await iv.start_interview(iv.StartInterviewRequest(job_id="j1"), user=CANDIDATE)

    # Insert failure surfaces as 400.
    failing = query(data=None, error={"message": "insert exploded"})
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[PASSED_ATTEMPT])), \
         patch("app.interview.has_ai_key", return_value=False), \
         patch("app.interview.db", sequence_db(failing)):
        with pytest.raises(HTTPException) as exc:
            await iv.start_interview(iv.StartInterviewRequest(), user=CANDIDATE)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_router_schedule_interview_paths():
    existing = {"id": "i1", "candidate_id": "c1", "exam_id": None, "job_id": None}
    scheduled = dict(existing, status="scheduled")

    with patch("app.interview.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await iv.schedule_interview(
                "ghost", iv.ScheduleInterviewRequest(scheduled_start="s", scheduled_end="e"), user=ADMIN
            )
    assert exc.value.status_code == 404

    update_chain = query(data=scheduled)
    with patch("app.interview.db", sequence_db(query(data=existing), update_chain)):
        result = await iv.schedule_interview(
            "i1", iv.ScheduleInterviewRequest(scheduled_start="s", scheduled_end="e"), user=ADMIN
        )
    assert result["message"] == "Interview scheduled successfully"
    assert update_chain.update.call_args[0][0]["status"] == "scheduled"

    with patch("app.interview.db", sequence_db(
        query(data=existing), query(data=None, error={"message": "nope"})
    )):
        with pytest.raises(HTTPException) as exc:
            await iv.schedule_interview(
                "i1", iv.ScheduleInterviewRequest(scheduled_start="s", scheduled_end="e"), user=ADMIN
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_router_save_answer_paths():
    answer_req = iv.InterviewAnswerRequest(question="Q", answer="A", stage=1)

    with patch("app.interview.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await iv.save_answer("ghost", answer_req, CANDIDATE)
    assert exc.value.status_code == 404

    other = {"id": "i1", "candidate_id": "someone-else", "status": "started", "jobs": None}
    with patch("app.interview.db", sequence_db(query(data=other))):
        with pytest.raises(HTTPException) as exc:
            await iv.save_answer("i1", answer_req, CANDIDATE)
    assert exc.value.status_code == 403

    completed = dict(other, candidate_id="c1", status="completed")
    with patch("app.interview.db", sequence_db(query(data=completed))):
        with pytest.raises(HTTPException) as exc:
            await iv.save_answer("i1", answer_req, CANDIDATE)
    assert exc.value.status_code == 400

    # started -> status flips to in_progress, evaluation falls back to heuristics.
    started = dict(other, candidate_id="c1", status="started")
    update_chain, insert_chain = query(data={}), query(data={"id": "ans1"})
    eval_mock = AsyncMock(return_value={"score": 77, "feedback": "fb"})
    with patch("app.interview.db", sequence_db(query(data=started), update_chain, insert_chain)), \
         patch("app.interview.evaluate_answer", eval_mock):
        result = await iv.save_answer("i1", answer_req, CANDIDATE)
    assert result["message"] == "Answer saved"
    assert update_chain.update.call_args[0][0] == {"status": "in_progress"}
    payload = insert_chain.insert.call_args[0][0]
    assert payload["score"] == 77 and payload["pronunciation_score"] is None

    # in_progress -> no status update; only the insert occurs.
    in_progress = dict(started, status="in_progress")
    insert_chain = query(data={"id": "ans2"})
    with patch("app.interview.db", sequence_db(query(data=in_progress), insert_chain)), \
         patch("app.interview.evaluate_answer", eval_mock):
        await iv.save_answer("i1", answer_req, CANDIDATE)

    # Insert error surfaces.
    in_progress = dict(started, status="in_progress")
    with patch("app.interview.db", sequence_db(
        query(data=in_progress), query(data=None, error={"message": "bad"})
    )), patch("app.interview.evaluate_answer", eval_mock):
        with pytest.raises(HTTPException) as exc:
            await iv.save_answer("i1", answer_req, CANDIDATE)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_router_submit_interview_paths():
    with patch("app.interview.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await iv.submit_interview("ghost", CANDIDATE)
    assert exc.value.status_code == 404

    other = {"id": "i1", "candidate_id": "someone-else"}
    with patch("app.interview.db", sequence_db(query(data=other))):
        with pytest.raises(HTTPException) as exc:
            await iv.submit_interview("i1", CANDIDATE)
    assert exc.value.status_code == 403

    own = {"id": "i1", "candidate_id": "c1"}
    with patch("app.interview.db", sequence_db(query(data=own), query(data=None, error={"message": "x"}))):
        with pytest.raises(HTTPException) as exc:
            await iv.submit_interview("i1", CANDIDATE)
    assert exc.value.status_code == 400

    updated = {"id": "i1", "status": "processing"}
    spawn = MagicMock()
    background = MagicMock()
    with patch("app.interview.db", sequence_db(query(data=own), query(data=updated))), \
         patch("app.interview.evaluate_interview_background", background), \
         patch("app.interview._spawn_background", spawn):
        result = await iv.submit_interview("i1", CANDIDATE)
    assert result["message"] == "Interview submitted for evaluation"
    spawn.assert_called_once_with(background.return_value)


# ---------------------------------------------------------------------------
# router AI helpers
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_router_evaluate_answer_heuristics_and_ai_paths():
    with patch("app.interview.has_ai_key", return_value=False):
        stage2 = await iv.evaluate_answer("Q", "I built a project first then improved it", 2)
        stage1 = await iv.evaluate_answer("Q", "A short answer", 1)
    assert stage2["pronunciation_score"] == min(100, stage2["score"] + 5)
    assert stage2["clarity_score"] == min(100, stage2["score"] - 3)
    assert stage1["pronunciation_score"] is None and stage1["clarity_score"] is None

    ai_result = {"score": 88, "feedback": "great", "pronunciation_score": 90, "clarity_score": 85}
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.generate_json", new=AsyncMock(return_value=ai_result)) as gen:
        result = await iv.evaluate_answer("Q", "A", 2)
    assert result == {"score": 88, "feedback": "great", "pronunciation_score": 90, "clarity_score": 85}
    assert "spoken voice interview" in gen.call_args[0][1]

    job = {"company_description": "Drive description"}
    config = fake_ai_config(persona="Strict", rubric="score strictly", examples=[
        {"question": "Qx", "answer": "Ax", "score": 80, "feedback": "Fx"}
    ])
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.deserialize_drive_colleges", return_value=config), \
         patch("app.interview.generate_json", new=AsyncMock(return_value={"score": 80, "feedback": "ok"})) as gen:
        result = await iv.evaluate_answer("Q", "A", 3, job)
    assert result == {"score": 80, "feedback": "ok"}
    prompt = gen.call_args[0][1]
    assert "Strict" in prompt and "score strictly" in prompt and "Example 1" in prompt

    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.generate_json", new=AsyncMock(side_effect=RuntimeError("llm down"))):
        fallback = await iv.evaluate_answer("Q", "A", 3)
    assert fallback["score"] == iv.score_answer("A")
    assert fallback["feedback"] == iv.fallback_feedback(fallback["score"])


@pytest.mark.asyncio
async def test_router_build_stage_questions_defaults_and_ai():
    attempt = {"examTitle": "Qualifier", "examDescription": "D", "score": 80, "totalMarks": 100}

    with patch("app.interview.has_ai_key", return_value=False):
        questions = await iv.build_stage_questions("c1", attempt)
    assert questions == (iv.default_intro_questions + iv.default_speaking_questions + iv.default_technical_questions)

    job = {"title": "Backend", "company_name": "Acme", "company_description": "x", "required_skills": ["python"]}
    config = fake_ai_config(persona="Warm", instructions="Be kind")
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.deserialize_drive_colleges", return_value=config), \
         patch("app.interview.db", db_routing({"candidate_profiles": query(data={"skills": ["python", "sql"]})})), \
         patch("app.interview.generate_json", new=AsyncMock(
             return_value={"questions": ["Q1", "Q2", "Q3"]}
         )) as gen:
        questions = await iv.build_stage_questions("c1", attempt, job)
    assert questions[4:] == ["Q1", "Q2", "Q3"]
    prompt = gen.call_args[0][0]
    assert "Backend" in prompt and "Warm" in prompt and "Be kind" in prompt

    # Fewer than two generated questions -> defaults kept.
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.db", db_routing({"candidate_profiles": query(data=None)})), \
         patch("app.interview.generate_json", new=AsyncMock(return_value={"questions": ["only-one"]})):
        questions = await iv.build_stage_questions("c1", attempt)
    assert questions[4:] == iv.default_technical_questions

    # Generation failure -> defaults kept.
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.db", db_routing({"candidate_profiles": query(data=None)})), \
         patch("app.interview.generate_json", new=AsyncMock(side_effect=RuntimeError("boom"))):
        questions = await iv.build_stage_questions("c1", attempt)
    assert questions[4:] == iv.default_technical_questions


@pytest.mark.asyncio
async def test_router_summarize_interview_scores_and_ai():
    answers = [
        {"score": 80, "question": "q", "answer": "a", "stage": 1},
        {"score": 90, "question": "q", "answer": "a", "stage": 1},
        {"score": 70, "question": "q", "answer": "a", "stage": 2, "pronunciation_score": 75},
        {"score": 60, "question": "q", "answer": "a", "stage": 2, "pronunciation_score": None},
        {"score": 100, "question": "q", "answer": "a", "stage": 3},
        {"score": 50, "question": "q", "answer": "a", "stage": 3},
    ]
    with patch("app.interview.has_ai_key", return_value=False), \
         patch("app.interview.logger") as logger:
        result = await iv.summarize_interview(answers, 60)
    assert result["score"] == 75
    assert result["intro_score"] == 85
    assert result["speaking_score"] == 65
    assert result["pronunciation_score"] == 68
    assert result["technical_score"] == 75
    assert result["selected"] is True
    assert result["feedback"].startswith("Strong interview")
    logger.error.assert_not_called()

    with patch("app.interview.has_ai_key", return_value=False):
        empty = await iv.summarize_interview([], 60)
    assert empty["score"] == 0 and empty["selected"] is False
    assert empty["feedback"].startswith("Improve")

    with patch("app.interview.has_ai_key", return_value=False):
        weak = await iv.summarize_interview([answers[0]], 90)
    assert weak["selected"] is False

    ai_result = {"relevance_score": 90, "communication_score": 85, "summary": "S", "feedback": "F"}
    job = {"company_description": "x"}
    config = fake_ai_config(persona="Formal")
    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.deserialize_drive_colleges", return_value=config), \
         patch("app.interview.generate_json", new=AsyncMock(return_value=ai_result)) as gen:
        merged = await iv.summarize_interview(answers, 60, job)
    assert merged["relevance_score"] == 90
    assert merged["summary"] == "S"
    assert "Formal" in gen.call_args[0][1]

    with patch("app.interview.has_ai_key", return_value=True), \
         patch("app.interview.generate_json", new=AsyncMock(side_effect=RuntimeError("nope"))):
        failed = await iv.summarize_interview(answers, 60)
    assert failed["summary"].startswith("Candidate completed 6")


@pytest.mark.asyncio
async def test_router_background_evaluation_success_failure_and_missing():
    interview = {"id": "i1", "jobs": {"interview_pass_score": 70}}
    answers = [{"score": 80, "question": "q", "answer": "a", "pronunciation_score": None} for _ in range(5)]
    summary = {
        "score": 82, "intro_score": 80, "speaking_score": 81, "pronunciation_score": 78,
        "technical_score": 85, "selected": True, "relevance_score": 85,
        "communication_score": 80, "summary": "s", "feedback": "f",
    }
    update_chain = query(data=None)
    summarize = AsyncMock(return_value=summary)
    with patch("app.interview.db", sequence_db(query(data=interview), query(data=answers), update_chain)), \
         patch("app.interview.summarize_interview", summarize), \
         patch("app.interview.has_ai_key", return_value=False):
        await iv.evaluate_interview_background("i1")
    summarize.assert_awaited_once()
    assert summarize.call_args[0][1] == 70  # pass score from job
    assert update_chain.update.call_args[0][0]["status"] == "completed"
    assert update_chain.update.call_args[0][0]["score"] == 82

    # Missing interview -> silent return.
    with patch("app.interview.db", sequence_db(query(data=None))):
        assert await iv.evaluate_interview_background("ghost") is None

    # Summarize failure -> interview marked failed.
    failed_chain = query(data=None)
    with patch("app.interview.db", sequence_db(query(data=interview), query(data=answers), failed_chain)), \
         patch("app.interview.summarize_interview", new=AsyncMock(side_effect=RuntimeError("bad"))):
        await iv.evaluate_interview_background("i1")
    assert failed_chain.update.call_args[0][0]["status"] == "failed"

    # Marking failed also explodes -> swallowed.
    broken = query(data=None)
    broken.eq.side_effect = RuntimeError("db gone")
    with patch("app.interview.db", sequence_db(query(data=interview), query(data=answers), broken)), \
         patch("app.interview.summarize_interview", new=AsyncMock(side_effect=RuntimeError("bad"))):
        await iv.evaluate_interview_background("i1")  # must not raise


# ---------------------------------------------------------------------------
# interview_service: repository-backed service (queue worker path)
# ---------------------------------------------------------------------------

REPO_FUNCS = (
    "get_attempts_by_candidate", "get_pending_interviews", "get_recruiter_pending_interviews",
    "get_job_by_id", "insert_interview", "update_interview", "get_interview_by_id",
    "get_interview_answers", "insert_interview_answer", "get_interview_summaries",
    "get_interviews_by_candidate", "get_candidate_profile",
)


def repo_mock():
    repo = MagicMock()
    for name in REPO_FUNCS:
        setattr(repo, name, AsyncMock())
    return repo


def test_service_score_and_clamp_helpers():
    assert svc.score_answer("short") == 36
    assert svc.fallback_feedback(80).startswith("Clear answer")
    assert svc.clamp_score(float("nan"), 5) == 5  # nan -> fallback
    assert svc.clamp_score("88.4", 0) == 88
    assert svc.clamp_score(100.6, 0) == 100
    assert svc.clamp_score("junk", 3) == 3


@pytest.mark.asyncio
async def test_service_get_passed_attempts_handles_exam_shapes():
    repo = repo_mock()
    repo.get_attempts_by_candidate.return_value = [
        {"id": "a1", "exam_id": "e1", "score": 80, "submitted_at": "t",
         "exams": {"title": "T", "description": "D", "pass_marks": 60, "total_marks": 100}},
        {"id": "a2", "exam_id": "e2", "score": 70,
         "exams": [{"title": "List Exam", "pass_marks": 60, "total_marks": 70}]},
        {"id": "a3", "exam_id": "e3", "score": 10, "exams": {"pass_marks": 60, "total_marks": 100}},
        {"id": "a4", "exam_id": "e4", "score": 90, "exams": None},
    ]
    with patch("app.interview_service.interview_repo", repo):
        passed = await svc.get_passed_attempts("c1")

    assert [p["attemptId"] for p in passed] == ["a1", "a2"]
    assert passed[0]["percentage"] == 80.0
    assert passed[1]["examTitle"] == "List Exam"
    assert passed[1]["percentage"] == 100.0
    repo.get_attempts_by_candidate.assert_awaited_once_with("c1", None)


@pytest.mark.asyncio
async def test_service_check_eligibility_and_pending_lists():
    repo = repo_mock()
    repo.get_attempts_by_candidate.return_value = []
    repo.get_pending_interviews.return_value = [{"id": "i1"}]
    repo.get_recruiter_pending_interviews.return_value = [{"id": "i2"}]
    with patch("app.interview_service.interview_repo", repo):
        assert (await svc.check_eligibility("c1"))["eligible"] is False
        assert await svc.get_pending_interviews_list("c1") == [{"id": "i1"}]
        assert await svc.get_recruiter_pending("r1") == [{"id": "i2"}]

    repo.get_attempts_by_candidate.return_value = [
        {"id": "a1", "exam_id": "e1", "score": 80,
         "exams": {"title": "T", "pass_marks": 60, "total_marks": 100}},
    ]
    with patch("app.interview_service.interview_repo", repo):
        assert (await svc.check_eligibility("c1"))["eligible"] is True


@pytest.mark.asyncio
async def test_service_start_interview_requires_eligibility_and_inserts():
    repo = repo_mock()
    repo.get_attempts_by_candidate.return_value = []
    with patch("app.interview_service.interview_repo", repo):
        with pytest.raises(ValueError, match="qualifying exam"):
            await svc.start_interview("c1")

    repo.get_attempts_by_candidate.return_value = [
        {"id": "a1", "exam_id": "e1", "score": 80,
         "exams": {"title": "T", "pass_marks": 60, "total_marks": 100}},
    ]
    repo.insert_interview.return_value = {"id": "i1"}
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=False):
        result = await svc.start_interview("c1")
    assert result == {"id": "i1"}
    payload = repo.insert_interview.call_args[0][0]
    assert payload["exam_id"] == "e1" and payload["status"] == "started"
    assert len(payload["questions"]) == 7
    repo.get_job_by_id.assert_not_awaited()

    # With a job: the job row is loaded and passed to question generation.
    repo.get_job_by_id.return_value = {"id": "j1", "title": "Backend"}
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=False):
        await svc.start_interview("c1", job_id="j1")
    repo.get_job_by_id.assert_awaited_once_with("j1")


@pytest.mark.asyncio
async def test_service_schedule_and_answers_passthroughs():
    repo = repo_mock()
    repo.update_interview.return_value = {"id": "i1", "status": "scheduled"}
    repo.get_interview_answers.return_value = [{"id": "ans1"}]
    with patch("app.interview_service.interview_repo", repo):
        assert await svc.schedule_interview("i1", "s", "e") == {"id": "i1", "status": "scheduled"}
        assert await svc.get_interview_answers_list("i1") == [{"id": "ans1"}]
    assert repo.update_interview.call_args[0][1]["status"] == "scheduled"


@pytest.mark.asyncio
async def test_service_feed_answer_paths():
    repo = repo_mock()
    with patch("app.interview_service.interview_repo", repo):
        repo.get_interview_by_id.return_value = None
        with pytest.raises(ValueError, match="Forbidden"):
            await svc.feed_answer("i1", "c1", "Q", "A", 1)

        repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "other", "status": "started"}
        with pytest.raises(ValueError, match="Forbidden"):
            await svc.feed_answer("i1", "c1", "Q", "A", 1)

        repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "c1", "status": "completed"}
        with pytest.raises(ValueError, match="not active"):
            await svc.feed_answer("i1", "c1", "Q", "A", 1)

        # started -> flips to in_progress and stores the evaluated answer.
        repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "c1", "status": "started", "jobs": None}
        repo.insert_interview_answer.return_value = {"id": "ans1"}
        evaluated = {"score": 80, "feedback": "f", "pronunciation_score": 85, "clarity_score": 77}
        with patch("app.interview_service.evaluate_answer", new=AsyncMock(return_value=evaluated)):
            await svc.feed_answer("i1", "c1", "Q", "A", 2)
        repo.update_interview.assert_awaited_once_with("i1", {"status": "in_progress"})
        payload = repo.insert_interview_answer.call_args[0][0]
        assert payload["score"] == 80 and payload["pronunciation_score"] == 85

        # in_progress -> no status update.
        repo.reset_mock()
        for name in REPO_FUNCS:
            setattr(repo, name, AsyncMock())
        repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "c1", "status": "in_progress", "jobs": None}
        with patch("app.interview_service.evaluate_answer", new=AsyncMock(return_value=evaluated)):
            await svc.feed_answer("i1", "c1", "Q", "A", 1)
        repo.update_interview.assert_not_awaited()


@pytest.mark.asyncio
async def test_service_submit_enqueues_grading():
    repo = repo_mock()
    repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "other"}
    with patch("app.interview_service.interview_repo", repo):
        with pytest.raises(ValueError, match="Forbidden"):
            await svc.submit_interview("i1", "c1")

    repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "c1"}
    repo.update_interview.return_value = {"id": "i1", "status": "processing"}
    queue = MagicMock()
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.queue_manager.gradingQueue", queue):
        result = await svc.submit_interview("i1", "c1")
    assert result["interview"]["status"] == "processing"
    queue.push_interview_evaluation.assert_called_once_with("i1")


@pytest.mark.asyncio
async def test_service_evaluate_interview_maps_stages_and_persists():
    repo = repo_mock()
    repo.get_interview_by_id.return_value = None
    with patch("app.interview_service.interview_repo", repo):
        with pytest.raises(ValueError, match="not found"):
            await svc.evaluate_interview("i1")

    repo.get_interview_by_id.return_value = {"id": "i1", "jobs": {"interview_pass_score": "75"}}
    repo.get_interview_answers.return_value = [
        {"score": 70, "question": "q1", "answer": "a1", "pronunciation_score": None, "clarity_score": None},
        {"score": "75", "question": "q2", "answer": "a2", "pronunciation_score": 80, "clarity_score": 81},
        {"score": 80, "question": None, "answer": None, "pronunciation_score": None, "clarity_score": None},
        {"score": 85, "question": "q4", "answer": "a4", "pronunciation_score": None, "clarity_score": None},
        {"score": 90, "question": "q5", "answer": "a5", "pronunciation_score": None, "clarity_score": None},
        {"score": 95, "question": "q6", "answer": "a6", "pronunciation_score": "99", "clarity_score": None},
    ]
    summary = {
        "score": 82, "intro_score": 72, "speaking_score": 77, "pronunciation_score": 79,
        "technical_score": 91, "selected": True, "relevance_score": 85,
        "communication_score": 80, "summary": "s", "feedback": "f",
    }
    repo.update_interview.return_value = {"id": "i1", "status": "completed"}
    summarize = AsyncMock(return_value=summary)
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.summarize_interview", summarize):
        result = await svc.evaluate_interview("i1")

    assert result["status"] == "completed"
    answers_arg = summarize.call_args[0][0]
    assert [a["stage"] for a in answers_arg] == [1, 1, 2, 2, 3, 3]
    assert answers_arg[2]["question"] == ""
    assert answers_arg[5]["pronunciation_score"] == 99
    assert summarize.call_args[0][1] == 75
    assert repo.update_interview.call_args[0][1]["score"] == 82

    # Missing jobs -> default pass score of 60.
    repo.get_interview_by_id.return_value = {"id": "i1", "jobs": None}
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.summarize_interview", summarize):
        await svc.evaluate_interview("i1")
    assert summarize.call_args[0][1] == 60


@pytest.mark.asyncio
async def test_service_details_and_listing():
    repo = repo_mock()
    repo.get_interview_by_id.return_value = None
    with patch("app.interview_service.interview_repo", repo):
        with pytest.raises(ValueError, match="not found"):
            await svc.get_interview_details("i1", "c1", "candidate")

        repo.get_interview_by_id.return_value = {"id": "i1", "candidate_id": "other"}
        with pytest.raises(ValueError, match="Forbidden"):
            await svc.get_interview_details("i1", "c1", "candidate")

        own = {"id": "i1", "candidate_id": "c1"}
        repo.get_interview_by_id.return_value = own
        assert await svc.get_interview_details("i1", "c1", "candidate") == {"interview": own}
        assert await svc.get_interview_details("i1", "r1", "recruiter") == {"interview": own}

        repo.get_interviews_by_candidate.return_value = [{"id": "i1"}]
        repo.get_interview_summaries.return_value = [{"id": "i2"}]
        assert await svc.get_candidate_interviews("c1") == {"interviews": [{"id": "i1"}]}
        assert await svc.get_recruiter_interviews("recruiter", "r1") == {"interviews": [{"id": "i2"}]}


@pytest.mark.asyncio
async def test_service_build_stage_questions_ai_and_defaults():
    attempt = {"examTitle": "Qualifier", "examDescription": "D", "score": 80, "totalMarks": 100}

    repo = repo_mock()
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=False):
        baseline = await svc.build_stage_questions("c1", attempt, None)
    assert baseline["stage3"] == svc.defaultTechnicalQuestions
    assert baseline["all"] == svc.defaultIntroQuestions + svc.defaultSpeakingQuestions + svc.defaultTechnicalQuestions

    job = {"title": "Backend", "company_name": "Acme", "company_description": "x", "required_skills": ["python"]}
    config = {"description": "clean desc", "aiConfig": {"persona": "Warm", "instructions": "Be kind"}}
    repo.get_candidate_profile.return_value = {"skills": ["python", "sql"]}
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.deserialize_drive_colleges", return_value=config), \
         patch("app.interview_service.generate_json", new=AsyncMock(
             return_value={"questions": ["Q1", "Q2", "Q3"]}
         )) as gen:
        ai = await svc.build_stage_questions("c1", attempt, job)
    assert ai["stage3"] == ["Q1", "Q2", "Q3"]
    prompt = gen.call_args[0][0]
    assert "Backend" in prompt and "Warm" in prompt and "Be kind" in prompt and "python, sql" in prompt

    # No job -> exam context.
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(
             return_value={"questions": ["Q1", "Q2"]}
         )) as gen:
        await svc.build_stage_questions("c1", attempt, None)
    assert "Exam: Qualifier" in gen.call_args[0][0]

    # Too few generated questions / generation error -> defaults.
    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(return_value={"questions": ["one"]})):
        assert (await svc.build_stage_questions("c1", attempt, None))["stage3"] == svc.defaultTechnicalQuestions

    with patch("app.interview_service.interview_repo", repo), \
         patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(side_effect=RuntimeError("boom"))):
        assert (await svc.build_stage_questions("c1", attempt, None))["stage3"] == svc.defaultTechnicalQuestions


@pytest.mark.asyncio
async def test_service_evaluate_answer_heuristics_and_ai():
    with patch("app.interview_service.has_ai_key", return_value=False):
        stage2 = await svc.evaluate_answer("Q", "I built a project first then improved it", 2)
        stage1 = await svc.evaluate_answer("Q", "short", 1)
    assert stage2["pronunciation_score"] == min(100, stage2["score"] + 5)
    assert stage2["clarity_score"] == min(100, stage2["score"] - 3)
    assert stage1["pronunciation_score"] is None

    with patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(return_value={
             "score": "88.6", "feedback": "  concise feedback  ",
             "pronunciation_score": 91, "clarity_score": "junk",
         })) as gen:
        result = await svc.evaluate_answer("Q", "A", 2)
    assert result == {"score": 89, "feedback": "concise feedback", "pronunciation_score": 91, "clarity_score": 89}
    assert "spoken voice interview" in gen.call_args[0][1]

    job = {"company_description": "x"}
    config = {"description": "d", "aiConfig": {"persona": "Sharp", "rubric": "be strict", "examples": [
        {"question": "Qx", "answer": "Ax", "score": 80, "feedback": "Fx"}
    ]}}
    with patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.deserialize_drive_colleges", return_value=config), \
         patch("app.interview_service.generate_json", new=AsyncMock(
             return_value={"score": 85, "feedback": "good"}
         )) as gen:
        result = await svc.evaluate_answer("Q", "A", 3, job)
    assert result == {"score": 85, "feedback": "good"}
    prompt = gen.call_args[0][1]
    assert "Sharp" in prompt and "be strict" in prompt and "Example 1" in prompt

    with patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(side_effect=RuntimeError("down"))):
        fallback = await svc.evaluate_answer("Q", "A", 3)
    assert fallback["score"] == svc.score_answer("A")
    assert "pronunciation_score" not in fallback


@pytest.mark.asyncio
async def test_service_summarize_interview_fallbacks_and_ai():
    answers = [
        {"score": 90, "question": "q", "answer": "a", "stage": 1, "pronunciation_score": None},
        {"score": 80, "question": "q", "answer": "a", "stage": 2, "pronunciation_score": 85},
        {"score": 60, "question": "q", "answer": "a", "stage": 3, "pronunciation_score": None},
    ]
    with patch("app.interview_service.has_ai_key", return_value=False):
        result = await svc.summarize_interview(answers, 70)
    assert result["score"] == 77
    assert result["intro_score"] == 90
    assert result["speaking_score"] == 80
    assert result["pronunciation_score"] == 85
    assert result["technical_score"] == 60
    assert result["selected"] is True

    with patch("app.interview_service.has_ai_key", return_value=False):
        empty = await svc.summarize_interview([], 60)
    assert empty["score"] == 0 and empty["selected"] is False

    ai_result = {"relevance_score": "88.2", "communication_score": 84, "summary": " S ", "feedback": "F"}
    job = {"company_description": "x"}
    config = {"description": "d", "aiConfig": {"persona": "Calm"}}
    with patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.deserialize_drive_colleges", return_value=config), \
         patch("app.interview_service.generate_json", new=AsyncMock(return_value=ai_result)) as gen:
        merged = await svc.summarize_interview(answers, 70, job)
    assert merged["relevance_score"] == 88
    assert merged["communication_score"] == 84
    assert merged["summary"] == "S"
    assert "Calm" in gen.call_args[0][1]

    with patch("app.interview_service.has_ai_key", return_value=True), \
         patch("app.interview_service.generate_json", new=AsyncMock(side_effect=RuntimeError("no"))):
        failed = await svc.summarize_interview(answers, 70)
    assert failed["summary"] == "Candidate completed 3 interview responses with an overall score of 77/100."
