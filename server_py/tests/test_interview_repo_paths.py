"""Extended path coverage for ``app.repositories.interview_repo``.

``tests/test_interview_repo.py`` already covers the basic success paths of the
six read helpers; this file extends that suite with the paths it does not
touch: the optional exam filter, error propagation, empty results, and every
function from ``get_recruiter_pending_interviews`` through
``get_interview_summaries`` (including the recruiter/college branching).
Assertions target the calls the module makes on the ``db`` builder (table,
select clause, filters, order) rather than builder internals.
"""
import pytest
from unittest.mock import call, patch

from app.repositories.interview_repo import (
    get_attempts_by_candidate,
    get_questions_count,
    get_interview_by_id,
    get_job_by_id,
    get_interview_answers,
    get_pending_interviews,
    get_recruiter_pending_interviews,
    insert_interview,
    update_interview,
    insert_interview_answer,
    get_interviews_by_candidate,
    get_completed_interviews_by_recruiter_jobs,
    get_candidate_profile,
    get_interview_summaries,
)
from tests.db_mocks import db_routing, query, sequence_db

DB = "app.repositories.interview_repo.db"


# ---------------------------------------------------------------------------
# Read helpers already exercised lightly by the existing suite
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_attempts_by_candidate_applies_optional_exam_filter():
    chain = query(data=[{"id": "att-1", "exam_id": "exam-9"}])
    with patch(DB, db_routing({"attempts": chain})):
        attempts = await get_attempts_by_candidate("cand-1", "exam-9")

    assert attempts == [{"id": "att-1", "exam_id": "exam-9"}]
    assert chain.eq.call_args_list == [
        call("candidate_id", "cand-1"),
        call("status", "completed"),
        call("exam_id", "exam-9"),
    ]
    chain.order.assert_called_once_with("submitted_at", ascending=False)
    chain.execute.assert_called_once()


@pytest.mark.asyncio
async def test_get_attempts_by_candidate_propagates_errors_and_handles_empty():
    failing = query(data=None, error=RuntimeError("attempts down"))
    with patch(DB, db_routing({"attempts": failing})):
        with pytest.raises(RuntimeError, match="attempts down"):
            await get_attempts_by_candidate("cand-1")

    empty = query(data=None)
    with patch(DB, db_routing({"attempts": empty})):
        assert await get_attempts_by_candidate("cand-1") == []


@pytest.mark.asyncio
async def test_get_questions_count_error_and_zero_fallback():
    failing = query(data=None, error=RuntimeError("count down"))
    with patch(DB, db_routing({"questions": failing})):
        with pytest.raises(RuntimeError, match="count down"):
            await get_questions_count()

    chain = query(data=None, count=None)
    with patch(DB, db_routing({"questions": chain})):
        assert await get_questions_count() == 0
    chain.select.assert_called_once_with("*", count="exact", head=True)


@pytest.mark.asyncio
async def test_read_helpers_propagate_query_errors():
    with patch(DB, db_routing({"ai_interviews": query(error=RuntimeError("interview down"))})):
        with pytest.raises(RuntimeError, match="interview down"):
            await get_interview_by_id("iv-1")

    with patch(DB, db_routing({"jobs": query(error=RuntimeError("job down"))})):
        with pytest.raises(RuntimeError, match="job down"):
            await get_job_by_id("job-1")

    with patch(DB, db_routing({"ai_interview_answers": query(error=RuntimeError("answers down"))})):
        with pytest.raises(RuntimeError, match="answers down"):
            await get_interview_answers("iv-1")

    with patch(DB, db_routing({"ai_interviews": query(error=RuntimeError("pending down"))})):
        with pytest.raises(RuntimeError, match="pending down"):
            await get_pending_interviews("cand-1")


@pytest.mark.asyncio
async def test_read_helpers_return_rows_none_or_empty_on_success():
    interview_chain = query(data={"id": "iv-1"})
    with patch(DB, db_routing({"ai_interviews": interview_chain})):
        assert await get_interview_by_id("iv-1") == {"id": "iv-1"}
    interview_chain.select.assert_called_once_with("*, jobs(*)")
    assert interview_chain.single.called

    job_chain = query(data={"id": "job-1"})
    with patch(DB, db_routing({"jobs": job_chain})):
        assert await get_job_by_id("job-1") == {"id": "job-1"}
    job_chain.select.assert_called_once_with(
        "id, title, company_name, company_description, required_skills, interview_pass_score"
    )
    assert job_chain.maybeSingle.called

    answers_chain = query(data=[{"id": "ans-1"}])
    with patch(DB, db_routing({"ai_interview_answers": answers_chain})):
        assert await get_interview_answers("iv-1") == [{"id": "ans-1"}]
    answers_chain.order.assert_called_once_with("created_at", ascending=True)

    pending_chain = query(data=[{"id": "iv-2"}])
    with patch(DB, db_routing({"ai_interviews": pending_chain})):
        assert await get_pending_interviews("cand-1") == [{"id": "iv-2"}]
    pending_chain.order.assert_called_once_with("scheduled_start", ascending=True)


# ---------------------------------------------------------------------------
# get_recruiter_pending_interviews / insert / update helpers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_recruiter_pending_interviews_filters_and_propagates_errors():
    chain = query(data=[{"id": "iv-1"}])
    with patch(DB, db_routing({"ai_interviews": chain})):
        rows = await get_recruiter_pending_interviews("rec-1")

    assert rows == [{"id": "iv-1"}]
    chain.select.assert_called_once_with("*, users:candidate_id(id, name, email), jobs:job_id(title)")
    chain.in_.assert_called_once_with("status", ["scheduled", "completed"])
    chain.order.assert_called_once_with("scheduled_start", ascending=True)

    empty = query(data=None)
    with patch(DB, db_routing({"ai_interviews": empty})):
        assert await get_recruiter_pending_interviews("rec-1") == []

    failing = query(data=None, error=RuntimeError("pending db down"))
    with patch(DB, db_routing({"ai_interviews": failing})):
        with pytest.raises(RuntimeError, match="pending db down"):
            await get_recruiter_pending_interviews("rec-1")


@pytest.mark.asyncio
async def test_insert_interview_returns_row_and_raises_errors():
    interview = {"candidate_id": "cand-1", "job_id": "job-1", "status": "scheduled"}
    chain = query(data={"id": "iv-1"})
    with patch(DB, db_routing({"ai_interviews": chain})):
        assert await insert_interview(interview) == {"id": "iv-1"}
    chain.insert.assert_called_once_with(interview)
    assert chain.single.called
    assert chain.execute.called

    failing = query(data=None, error=RuntimeError("insert failed"))
    with patch(DB, db_routing({"ai_interviews": failing})):
        with pytest.raises(RuntimeError, match="insert failed"):
            await insert_interview(interview)


@pytest.mark.asyncio
async def test_update_interview_returns_row_and_raises_errors():
    update_data = {"status": "completed"}
    chain = query(data={"id": "iv-1", "status": "completed"})
    with patch(DB, db_routing({"ai_interviews": chain})):
        assert await update_interview("iv-1", update_data) == {"id": "iv-1", "status": "completed"}
    chain.update.assert_called_once_with(update_data)
    chain.eq.assert_called_once_with("id", "iv-1")
    assert chain.single.called

    failing = query(data=None, error=RuntimeError("update failed"))
    with patch(DB, db_routing({"ai_interviews": failing})):
        with pytest.raises(RuntimeError, match="update failed"):
            await update_interview("iv-1", update_data)


@pytest.mark.asyncio
async def test_insert_interview_answer_returns_row_and_raises_errors():
    answer = {"interview_id": "iv-1", "question_index": 0, "answer_text": "hello"}
    chain = query(data={"id": "ans-1"})
    with patch(DB, db_routing({"ai_interview_answers": chain})):
        assert await insert_interview_answer(answer) == {"id": "ans-1"}
    chain.insert.assert_called_once_with(answer)
    assert chain.single.called

    failing = query(data=None, error=RuntimeError("answer insert failed"))
    with patch(DB, db_routing({"ai_interview_answers": failing})):
        with pytest.raises(RuntimeError, match="answer insert failed"):
            await insert_interview_answer(answer)


# ---------------------------------------------------------------------------
# Listing helpers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_interviews_by_candidate_orders_and_handles_empty():
    chain = query(data=[{"id": "iv-1"}])
    with patch(DB, db_routing({"ai_interviews": chain})):
        rows = await get_interviews_by_candidate("cand-1")

    assert rows == [{"id": "iv-1"}]
    chain.eq.assert_called_once_with("candidate_id", "cand-1")
    chain.order.assert_called_once_with("submitted_at", ascending=False)

    empty = query(data=None)
    with patch(DB, db_routing({"ai_interviews": empty})):
        assert await get_interviews_by_candidate("cand-1") == []

    failing = query(data=None, error=RuntimeError("candidate list down"))
    with patch(DB, db_routing({"ai_interviews": failing})):
        with pytest.raises(RuntimeError, match="candidate list down"):
            await get_interviews_by_candidate("cand-1")


@pytest.mark.asyncio
async def test_completed_interviews_for_recruiter_jobs_filters_job_ids():
    chain = query(data=[{"id": "iv-1"}])
    with patch(DB, db_routing({"ai_interviews": chain})):
        rows = await get_completed_interviews_by_recruiter_jobs(["job-1", "job-2"])

    assert rows == [{"id": "iv-1"}]
    assert chain.eq.call_args_list == [call("status", "completed")]
    chain.in_.assert_called_once_with("job_id", ["job-1", "job-2"])
    chain.order.assert_called_once_with("submitted_at", ascending=False)

    empty = query(data=None)
    with patch(DB, db_routing({"ai_interviews": empty})):
        assert await get_completed_interviews_by_recruiter_jobs([]) == []

    failing = query(data=None, error=RuntimeError("completed list down"))
    with patch(DB, db_routing({"ai_interviews": failing})):
        with pytest.raises(RuntimeError, match="completed list down"):
            await get_completed_interviews_by_recruiter_jobs(["job-1"])


@pytest.mark.asyncio
async def test_candidate_profile_returns_row_none_or_raises():
    chain = query(data={"skills": ["Python"], "domain_preference": "AI"})
    with patch(DB, db_routing({"candidate_profiles": chain})):
        profile = await get_candidate_profile("u-1")

    assert profile == {"skills": ["Python"], "domain_preference": "AI"}
    chain.select.assert_called_once_with("skills, domain_preference")
    chain.eq.assert_called_once_with("user_id", "u-1")
    chain.maybeSingle.assert_called_once()

    empty = query(data=None)
    with patch(DB, db_routing({"candidate_profiles": empty})):
        assert await get_candidate_profile("u-1") is None

    failing = query(data=None, error=RuntimeError("profile down"))
    with patch(DB, db_routing({"candidate_profiles": failing})):
        with pytest.raises(RuntimeError, match="profile down"):
            await get_candidate_profile("u-1")


# ---------------------------------------------------------------------------
# get_interview_summaries branching
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_interview_summaries_candidate_path_orders_and_returns_rows():
    chain = query(data=[{"id": "iv-1"}])
    with patch(DB, db_routing({"ai_interviews": chain})):
        rows = await get_interview_summaries("candidate", "cand-1")

    assert rows == [{"id": "iv-1"}]
    chain.select.assert_called_once_with(
        "*, candidate:candidate_id(id, name, email), job:job_id(title, company_name), exam:exam_id(title)"
    )
    chain.order.assert_called_once_with("started_at", ascending=False)
    chain.or_.assert_not_called()
    chain.in_.assert_not_called()


@pytest.mark.asyncio
async def test_interview_summaries_recruiter_without_owned_exams_or_jobs():
    iv, exams, jobs = query(data=[{"id": "iv-1"}]), query(data=[]), query(data=[])
    mock_db = sequence_db(iv, exams, jobs)

    with patch(DB, mock_db):
        rows = await get_interview_summaries("recruiter", "rec-1")

    assert rows == []
    assert [c.args[0] for c in mock_db.from_.call_args_list] == ["ai_interviews", "exams", "jobs"]
    exams.eq.assert_called_once_with("created_by", "rec-1")
    jobs.eq.assert_called_once_with("created_by", "rec-1")
    iv.execute.assert_not_called()  # short-circuit before the summary query runs


@pytest.mark.asyncio
async def test_interview_summaries_recruiter_or_filters_owned_scopes():
    iv = query(data=[{"id": "iv-1"}])
    exams = query(data=[{"id": "e-1"}])
    jobs = query(data=[{"id": "j-1"}])
    mock_db = sequence_db(iv, exams, jobs)

    with patch(DB, mock_db):
        rows = await get_interview_summaries("recruiter", "rec-1")

    assert rows == [{"id": "iv-1"}]
    iv.or_.assert_called_once_with("exam_id.in.(e-1),job_id.in.(j-1)")
    iv.execute.assert_called_once()


@pytest.mark.asyncio
async def test_interview_summaries_college_filter_and_empty_college():
    iv = query(data=[{"id": "iv-2"}])
    profiles = query(data=[{"user_id": "u-1"}, {"user_id": "u-2"}])
    with patch(DB, sequence_db(iv, profiles)):
        rows = await get_interview_summaries("candidate", "cand-1", "col-1")

    assert rows == [{"id": "iv-2"}]
    profiles.eq.assert_called_once_with("college_id", "col-1")
    iv.in_.assert_called_once_with("candidate_id", ["u-1", "u-2"])

    iv = query(data=[{"id": "iv-2"}])
    profiles = query(data=[])
    with patch(DB, sequence_db(iv, profiles)):
        assert await get_interview_summaries("candidate", "cand-1", "col-1") == []
    iv.execute.assert_not_called()


@pytest.mark.asyncio
async def test_interview_summaries_propagates_final_query_error():
    chain = query(data=None, error=RuntimeError("summary failed"))
    with patch(DB, db_routing({"ai_interviews": chain})):
        with pytest.raises(RuntimeError, match="summary failed"):
            await get_interview_summaries("admin", "u-1")
