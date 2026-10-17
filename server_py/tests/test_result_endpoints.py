"""Endpoint-level tests for app.result.

Covers the candidate submission lifecycle (expiry guards, atomic grading
transition, code evaluation) and the recruiter/admin review + override paths.
Route coroutines are called directly with mocked db chains.
"""
import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.result import (
    OverrideMcqRequest,
    RegradeRequest,
    SubmitCodeRequest,
    SubmitExamRequest,
    UpdateCodeScoreRequest,
    get_attempt_plagiarism,
    get_attempt_review,
    get_all_results,
    get_exam_results,
    is_attempt_expired,
    override_mcq_marks,
    parse_utc_timestamp,
    regrade_attempt,
    submit_code,
    submit_exam,
    update_code_score,
)
from tests.db_mocks import db_routing, query, sequence_db

NOW = datetime.datetime.now(datetime.timezone.utc)


def _attempt(**overrides):
    attempt = {
        "id": "attempt-1",
        "candidate_id": "user-1",
        "recruiter_id": "recruiter-1",
        "status": "in_progress",
        "started_at": NOW.isoformat(),
        "exam_id": "exam-1",
        "exams": {"duration": 60, "available_until": None, "negative_marking": 0.0},
    }
    attempt.update(overrides)
    return attempt


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_parse_utc_timestamp_variants():
    assert parse_utc_timestamp(None) is None
    assert parse_utc_timestamp("not-a-date") is None
    assert parse_utc_timestamp(12345) is None

    naive = parse_utc_timestamp("2026-01-01T10:00:00")
    assert naive.tzinfo is datetime.timezone.utc

    zulu = parse_utc_timestamp("2026-01-01T10:00:00Z")
    assert zulu == naive

    aware = parse_utc_timestamp(naive)
    assert aware == naive


def test_is_attempt_expired_grace_and_deadlines():
    now = datetime.datetime.now(datetime.timezone.utc)
    attempt = {"started_at": (now - datetime.timedelta(minutes=30)).isoformat()}

    # No duration and no available_until -> never expires.
    assert is_attempt_expired(attempt, {}) is False

    # Duration exceeded beyond grace.
    assert is_attempt_expired(attempt, {"duration": 25}) is True

    # Within grace period (duration + 120s).
    assert is_attempt_expired(attempt, {"duration": 29}) is False

    # available_until beyond the grace window forces expiry.
    assert is_attempt_expired(
        attempt, {"duration": 120, "available_until": (now - datetime.timedelta(minutes=5)).isoformat()}
    ) is True


# ---------------------------------------------------------------------------
# submit-code / update-code-score
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_submit_code_requires_in_progress_attempt():
    mock_db = db_routing({"attempts": query(data=_attempt(status="completed"))})
    with patch("app.result.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await submit_code(
                SubmitCodeRequest(attempt_id="attempt-1", coding_question_id="cq-1", code="print(1)", language="python"),
                user={"id": "user-1"},
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_submit_code_stores_pending_submission():
    mock_db = db_routing({
        "attempts": query(data=_attempt()),
        "coding_submissions": query(data={"id": "sub-1", "status": "pending"}),
    })
    with patch("app.result.db", mock_db):
        result = await submit_code(
            SubmitCodeRequest(attempt_id="attempt-1", coding_question_id="cq-1", code="print(1)", language="python"),
            user={"id": "user-1"},
        )
    assert result["message"] == "Code submitted"
    assert result["submission"]["status"] == "pending"


@pytest.mark.asyncio
async def test_update_code_score_empty_code_short_circuits():
    subm = query(data={"id": "sub-1", "score": 0, "status": "tested"})
    mock_db = sequence_db(
        query(data=_attempt()),
        query(data={"marks": 10, "test_cases": []}),  # coding question
        subm,  # upsert
        subm,  # select
    )
    with patch("app.result.db", mock_db):
        result = await update_code_score(
            UpdateCodeScoreRequest(attempt_id="attempt-1", coding_question_id="cq-1", code="   "),
            user={"id": "user-1"},
        )
    assert result["message"] == "No code to evaluate"


@pytest.mark.asyncio
async def test_update_code_score_evaluates_test_cases_via_judge0():
    test_cases = [
        {"input": "1", "expected_output": "1"},
        {"input": "2", "expected_output": "2"},
    ]

    async def fake_judge0(code, language, stdin, timeout=5):
        return {"stdout": stdin + "\n"}  # matches both expected outputs

    subm = query(data={"id": "sub-1", "score": 8, "status": "tested"})
    mock_db = sequence_db(
        query(data=_attempt()),
        query(data={"marks": 10, "test_cases": test_cases}),  # exam_coding_questions (maybeSingle)
        query(data={"marks": 10, "test_cases": test_cases}),  # coding_questions
        subm,  # upsert
        subm,  # select
    )
    with patch("app.result.db", mock_db), \
         patch("app.result.run_with_judge0", new=AsyncMock(side_effect=fake_judge0)), \
         patch("app.result.asyncio.sleep", new=AsyncMock()):
        result = await update_code_score(
            UpdateCodeScoreRequest(attempt_id="attempt-1", coding_question_id="cq-1", code="x=1"),
            user={"id": "user-1"},
        )
    assert result["passed"] == 2
    assert result["total"] == 2


# ---------------------------------------------------------------------------
# submit-exam
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_submit_exam_marks_grading_and_queues_background():
    updated = query(data=_attempt(status="grading"))
    mock_db = sequence_db(query(data=_attempt()), updated)
    background = AsyncMock()
    with patch("app.result.db", mock_db), \
         patch("app.result.grade_attempt_background", new=background):
        result = await submit_exam(SubmitExamRequest(attempt_id="attempt-1"), user={"id": "user-1", "email": "c@x.com"})
    assert "background" in result["message"]
    # Atomic transition: update filtered on status=in_progress
    assert "in_progress" in str(updated.eq.call_args_list)


@pytest.mark.asyncio
async def test_submit_exam_expired_terminates_attempt():
    expired = _attempt(started_at=(NOW - datetime.timedelta(hours=3)).isoformat())
    terminated = query(data=_attempt(status="completed"))
    mock_db = sequence_db(query(data=expired), terminated)
    with patch("app.result.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await submit_exam(SubmitExamRequest(attempt_id="attempt-1"), user={"id": "user-1"})
    assert exc.value.status_code == 400
    update_payload = terminated.update.call_args[0][0]
    assert update_payload["status"] == "completed"
    assert "deadline has passed" in exc.value.detail


@pytest.mark.asyncio
async def test_submit_exam_rejects_other_candidate():
    mock_db = db_routing({"attempts": query(data=_attempt(candidate_id="someone-else"))})
    with patch("app.result.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await submit_exam(SubmitExamRequest(attempt_id="attempt-1"), user={"id": "user-1"})
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# review / override / regrade
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_attempt_review_scopes_recruiter_and_counts_violations():
    events = [
        {"event_type": "violation", "message": "tab switch"},
        {"event_type": "snapshot", "message": None},
        {"event_type": "violation", "message": "copy"},
    ]
    mock_db = db_routing({
        "attempts": query(data=_attempt(status="completed")),
        "answers": query(data=[{"id": "a1"}]),
        "coding_submissions": query(data=[]),
        "proctoring_snapshots": query(data=events),
    })
    with patch("app.result.db", mock_db):
        result = await get_attempt_review("attempt-1", user={"id": "recruiter-1", "role": "recruiter"})
    assert result["proctoringSummary"] == {"totalEvents": 3, "totalViolations": 2}
    assert len(result["proctoringViolations"]) == 2

    # A different recruiter must not read the attempt.
    with patch("app.result.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_attempt_review("attempt-1", user={"id": "other-recruiter", "role": "recruiter"})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_override_mcq_marks_recomputes_total_score():
    mock_db = sequence_db(
        query(data=_attempt(status="completed")),        # attempts lookup
        query(data={"id": "a1", "marks_obtained": 5}),   # answers update
        query(data=[{"marks_obtained": 5}]),             # answers tally
        query(data=[{"score": 2}]),                      # coding tally
        query(data=[{"id": "attempt-1"}]),               # attempts score update
    )
    with patch("app.result.db", mock_db):
        result = await override_mcq_marks(
            OverrideMcqRequest(attempt_id="attempt-1", question_id="q1", is_correct=True, marks_obtained=5),
            user={"id": "recruiter-1", "role": "recruiter"},
        )
    assert result["newTotalScore"] == 7.0
    assert "overridden" in result["message"]


@pytest.mark.asyncio
async def test_regrade_attempt_resets_status_and_backgrounds():
    mock_db = sequence_db(
        query(data=_attempt(status="completed")),  # attempts lookup
        query(data=[{"id": "attempt-1"}]),         # status update
        query(data={"id": "user-1", "name": "Asha", "email": "a@x.com"}),  # candidate lookup
    )
    background = AsyncMock()
    with patch("app.result.db", mock_db), \
         patch("app.result.grade_attempt_background", new=background):
        result = await regrade_attempt("attempt-1", user={"id": "recruiter-1", "role": "recruiter"})
    assert "regrading" in result["message"].lower()


# ---------------------------------------------------------------------------
# result listings / plagiarism envelopes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_all_results_scopes_recruiter_query():
    attempts = query(data=[{"id": "attempt-1"}])
    mock_db = db_routing({"attempts": attempts})
    with patch("app.result.db", mock_db):
        result = await get_all_results(collegeId=None, user={"id": "recruiter-1", "role": "recruiter"})
    assert result == {"results": [{"id": "attempt-1"}]}
    assert attempts.eq.called  # recruiter_id scope applied

    # Admin is unscoped.
    attempts_admin = query(data=[])
    mock_db_admin = db_routing({"attempts": attempts_admin})
    with patch("app.result.db", mock_db_admin):
        await get_all_results(collegeId=None, user={"id": "admin-1", "role": "admin"})
    assert not attempts_admin.eq.called


@pytest.mark.asyncio
async def test_get_exam_results_with_college_filter():
    mock_db = db_routing({
        "attempts": query(data=[{"id": "attempt-1"}]),
        "candidate_profiles": query(data=[{"user_id": "u1"}, {"user_id": "u2"}]),
    })
    with patch("app.result.db", mock_db):
        result = await get_exam_results("exam-1", collegeId="col-1", user={"id": "admin-1", "role": "admin"})
    assert result == {"results": [{"id": "attempt-1"}]}


@pytest.mark.asyncio
async def test_get_exam_results_empty_college_short_circuits():
    mock_db = db_routing({"candidate_profiles": query(data=[])})
    with patch("app.result.db", mock_db):
        result = await get_exam_results("exam-1", collegeId="col-1", user={"id": "admin-1", "role": "admin"})
    assert result == {"results": []}


@pytest.mark.asyncio
async def test_get_attempt_plagiarism_envelope():
    flags = [{"id": "f1", "similarity_score": 0.9}]
    mock_db = db_routing({"plagiarism_flags": query(data=flags)})
    with patch("app.result.db", mock_db):
        result = await get_attempt_plagiarism("attempt-1", user={"id": "recruiter-1", "role": "recruiter"})
    assert result == {"flags": flags}
