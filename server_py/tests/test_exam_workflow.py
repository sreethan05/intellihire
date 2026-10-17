import datetime
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

from app.result import (
    is_attempt_expired,
    parse_utc_timestamp,
    submit_exam,
    submit_mcq,
    SubmitExamRequest,
    SubmitMcqRequest,
    EXAM_SUBMISSION_GRACE_PERIOD_SECONDS
)
from app.exam import start_exam, assign_exam, StartExamRequest, AssignExamRequest


class MockQueryBuilder(MagicMock):
    """A mock Supabase/psycopg query builder supporting chaining and awaiting."""
    def __init__(self, data=None, error=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._data = data
        self._error = error
        self.upsert_calls = []

    def select(self, *args, **kwargs):
        return self

    def eq(self, *args, **kwargs):
        return self

    def in_(self, *args, **kwargs):
        return self

    def update(self, *args, **kwargs):
        return self

    def insert(self, *args, **kwargs):
        return self

    def upsert(self, data, *args, **kwargs):
        self.upsert_calls.append(data)
        return self

    def order(self, *args, **kwargs):
        return self

    def range(self, *args, **kwargs):
        return self

    async def single(self):
        return MagicMock(data=self._data, error=self._error)

    async def maybeSingle(self):
        return MagicMock(data=self._data, error=self._error)

    async def execute(self):
        return MagicMock(data=self._data, error=self._error)

    def __await__(self):
        async def _exec():
            return MagicMock(data=self._data, error=self._error)
        return _exec().__await__()


def test_parse_utc_timestamp():
    assert parse_utc_timestamp(None) is None
    assert parse_utc_timestamp("") is None

    dt_z = parse_utc_timestamp("2026-10-15T12:00:00Z")
    assert dt_z is not None
    assert dt_z.tzinfo == datetime.timezone.utc
    assert dt_z.hour == 12

    dt_off = parse_utc_timestamp("2026-10-15T12:00:00+00:00")
    assert dt_off is not None
    assert dt_off.tzinfo == datetime.timezone.utc

    now_naive = datetime.datetime(2026, 10, 15, 12, 0, 0)
    dt_conv = parse_utc_timestamp(now_naive)
    assert dt_conv.tzinfo == datetime.timezone.utc


def test_is_attempt_expired():
    now = datetime.datetime.now(datetime.timezone.utc)

    # Started 10 minutes ago, 30 min duration -> NOT expired
    started_recent = (now - datetime.timedelta(minutes=10)).isoformat()
    attempt = {"started_at": started_recent}
    exam = {"duration": 30}
    assert not is_attempt_expired(attempt, exam)

    # Started 31 minutes ago, 30 min duration -> within 2 min grace period -> NOT expired
    started_grace = (now - datetime.timedelta(minutes=31)).isoformat()
    attempt_grace = {"started_at": started_grace}
    assert not is_attempt_expired(attempt_grace, exam)

    # Started 35 minutes ago, 30 min duration -> past 2 min grace period -> EXPIRED
    started_late = (now - datetime.timedelta(minutes=35)).isoformat()
    attempt_late = {"started_at": started_late}
    assert is_attempt_expired(attempt_late, exam)

    # Exam available_until passed
    until_past = (now - datetime.timedelta(minutes=10)).isoformat()
    exam_until = {"duration": 60, "available_until": until_past}
    assert is_attempt_expired(attempt, exam_until)

    # Exam available_until in future
    until_future = (now + datetime.timedelta(minutes=60)).isoformat()
    exam_future = {"duration": 30, "available_until": until_future}
    assert not is_attempt_expired(attempt, exam_future)


@pytest.mark.asyncio
async def test_submit_exam_after_deadline_rejected():
    now = datetime.datetime.now(datetime.timezone.utc)
    started_long_ago = (now - datetime.timedelta(hours=2)).isoformat()

    mock_attempt = {
        "id": "attempt-123",
        "candidate_id": "user-1",
        "status": "in_progress",
        "started_at": started_long_ago,
        "exam_id": "exam-1",
        "exams": {"duration": 30, "available_until": None}
    }

    mock_db = MagicMock()
    mock_db.from_.return_value = MockQueryBuilder(data=mock_attempt)

    with patch("app.result.db", mock_db):
        req = SubmitExamRequest(attempt_id="attempt-123")
        user = {"id": "user-1", "email": "test@test.com"}
        with pytest.raises(HTTPException) as exc_info:
            await submit_exam(req, user)

        assert exc_info.value.status_code == 400
        assert "deadline has passed" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_submit_exam_duplicate_submission_prevention():
    # Attempt is already in 'grading' status
    mock_attempt = {
        "id": "attempt-123",
        "candidate_id": "user-1",
        "status": "grading",
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "exam_id": "exam-1",
        "exams": {"duration": 60, "available_until": None}
    }

    mock_db = MagicMock()
    mock_db.from_.return_value = MockQueryBuilder(data=mock_attempt)

    with patch("app.result.db", mock_db):
        req = SubmitExamRequest(attempt_id="attempt-123")
        user = {"id": "user-1", "email": "test@test.com"}
        with pytest.raises(HTTPException) as exc_info:
            await submit_exam(req, user)

        assert exc_info.value.status_code == 400
        assert "already submitted" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_submit_mcq_scoring_and_case_insensitivity():
    now = datetime.datetime.now(datetime.timezone.utc)
    mock_attempt = {
        "id": "attempt-1",
        "candidate_id": "user-1",
        "status": "in_progress",
        "started_at": now.isoformat(),
        "exam_id": "exam-1",
        "exams": {"duration": 60, "negative_marking": 0.5}
    }

    mock_question = {
        "id": "q-1",
        "correct_option": "B",
        "marks": 2
    }

    mock_exam_q = {
        "marks": 3  # Custom exam marks
    }

    mock_db = MagicMock()
    mock_ans_builder = MockQueryBuilder(data={"id": "ans-1", "is_correct": True, "marks_obtained": 3.0})

    def from_dispatch(table):
        if table == "attempts":
            return MockQueryBuilder(data=mock_attempt)
        if table == "exam_questions":
            return MockQueryBuilder(data=mock_exam_q)
        if table == "questions":
            return MockQueryBuilder(data=mock_question)
        if table == "answers":
            return mock_ans_builder
        return MockQueryBuilder()

    mock_db.from_ = from_dispatch

    with patch("app.result.db", mock_db):
        user = {"id": "user-1", "email": "test@test.com"}

        # 1. Lowercase "b" matches uppercase "B" and receives custom exam marks (3.0)
        req_correct = SubmitMcqRequest(attempt_id="attempt-1", question_id="q-1", selected_option="b")
        res = await submit_mcq(req_correct, user)

        # The response is an echo only — never an answer oracle.
        assert res["answer"] == {
            "attempt_id": "attempt-1",
            "question_id": "q-1",
            "selected_option": "b",
        }
        assert "is_correct" not in res["answer"]
        assert "marks_obtained" not in res["answer"]

        # Scoring is still persisted correctly.
        upsert_call = mock_ans_builder.upsert_calls[-1]
        assert upsert_call["is_correct"] is True
        assert upsert_call["marks_obtained"] == 3.0


@pytest.mark.asyncio
async def test_submit_mcq_negative_marking_and_unattempted():
    now = datetime.datetime.now(datetime.timezone.utc)
    mock_attempt = {
        "id": "attempt-1",
        "candidate_id": "user-1",
        "status": "in_progress",
        "started_at": now.isoformat(),
        "exam_id": "exam-1",
        "exams": {"duration": 60, "negative_marking": 0.25}
    }

    mock_question = {
        "id": "q-1",
        "correct_option": "A",
        "marks": 1
    }

    mock_db = MagicMock()
    mock_ans_builder = MockQueryBuilder(data={"id": "ans-1"})

    def from_dispatch(table):
        if table == "attempts":
            return MockQueryBuilder(data=mock_attempt)
        if table == "exam_questions":
            return MockQueryBuilder(data=None)
        if table == "questions":
            return MockQueryBuilder(data=mock_question)
        if table == "answers":
            return mock_ans_builder
        return MockQueryBuilder()

    mock_db.from_ = from_dispatch

    with patch("app.result.db", mock_db):
        user = {"id": "user-1", "email": "test@test.com"}

        # Wrong option -> -0.25 marks
        req_wrong = SubmitMcqRequest(attempt_id="attempt-1", question_id="q-1", selected_option="C")
        await submit_mcq(req_wrong, user)
        call_wrong = mock_ans_builder.upsert_calls[-1]
        assert call_wrong["is_correct"] is False
        assert call_wrong["marks_obtained"] == -0.25

        # Empty/unattempted -> 0.0 marks (no negative penalty)
        req_empty = SubmitMcqRequest(attempt_id="attempt-1", question_id="q-1", selected_option="")
        await submit_mcq(req_empty, user)
        call_empty = mock_ans_builder.upsert_calls[-1]
        assert call_empty["is_correct"] is False
        assert call_empty["marks_obtained"] == 0.0


@pytest.mark.asyncio
async def test_start_exam_timer_sync_and_expiration():
    now = datetime.datetime.now(datetime.timezone.utc)
    mock_exam = {
        "id": "exam-1",
        "created_by": "recruiter-1",
        "title": "Python Exam",
        "duration": 45,
        "available_from": None,
        "available_until": None
    }

    mock_assign = {"id": "assign-1", "candidate_id": "cand-1", "exam_id": "exam-1"}

    # Case A: Starting a fresh exam returns full remaining_seconds (45 * 60)
    mock_db = MagicMock()
    def from_dispatch_a(table):
        if table == "exam_assignments":
            return MockQueryBuilder(data=mock_assign)
        if table == "exams":
            return MockQueryBuilder(data=mock_exam)
        if table == "attempts":
            return MockQueryBuilder(data={"id": "att-new", "started_at": now.isoformat()})
        if table == "users":
            return MockQueryBuilder(data={"name": "Alice"})
        return MockQueryBuilder()

    mock_db.from_ = from_dispatch_a

    # Case A: no existing attempt
    mock_db_a = MagicMock()
    att_builder_a = MockQueryBuilder(data=None)
    # For insert:
    att_builder_a._data = None
    def from_a(table):
        if table == "exam_assignments":
            return MockQueryBuilder(data=mock_assign)
        if table == "exams":
            return MockQueryBuilder(data=mock_exam)
        if table == "attempts":
            # first call is check existing -> None, second is insert -> data
            b = MockQueryBuilder(data=None)
            b.insert = lambda *args, **kwargs: MockQueryBuilder(data={"id": "att-new", "started_at": now.isoformat()})
            return b
        if table == "users":
            return MockQueryBuilder(data={"name": "Alice"})
        return MockQueryBuilder()
    mock_db_a.from_ = from_a

    with patch("app.exam.db", mock_db_a):
        res = await start_exam(StartExamRequest(exam_id="exam-1"), {"id": "cand-1", "email": "alice@test.com"})
        assert res["attempt"]["remaining_seconds"] == 45 * 60

    # Case B: Resuming in-progress exam computes remaining_seconds correctly
    started_20m_ago = (now - datetime.timedelta(minutes=20)).isoformat()
    mock_in_progress = {
        "id": "att-existing",
        "status": "in_progress",
        "started_at": started_20m_ago,
        "score": 0
    }
    mock_db_b = MagicMock()
    def from_b(table):
        if table == "exam_assignments":
            return MockQueryBuilder(data=mock_assign)
        if table == "exams":
            return MockQueryBuilder(data=mock_exam)
        if table == "attempts":
            return MockQueryBuilder(data=mock_in_progress)
        if table == "users":
            return MockQueryBuilder(data={"name": "Alice"})
        return MockQueryBuilder()
    mock_db_b.from_ = from_b

    with patch("app.exam.db", mock_db_b):
        res = await start_exam(StartExamRequest(exam_id="exam-1"), {"id": "cand-1", "email": "alice@test.com"})
        # 45 - 20 = 25 minutes left (approx 1500 seconds)
        assert 1490 <= res["attempt"]["remaining_seconds"] <= 1500

    # Case C: Resuming attempt where duration + grace period expired raises 400
    started_50m_ago = (now - datetime.timedelta(minutes=50)).isoformat()
    mock_expired = {
        "id": "att-expired",
        "status": "in_progress",
        "started_at": started_50m_ago,
        "score": 0
    }
    mock_db_c = MagicMock()
    def from_c(table):
        if table == "exam_assignments":
            return MockQueryBuilder(data=mock_assign)
        if table == "exams":
            return MockQueryBuilder(data=mock_exam)
        if table == "attempts":
            return MockQueryBuilder(data=mock_expired)
        if table == "users":
            return MockQueryBuilder(data={"name": "Alice"})
        return MockQueryBuilder()
    mock_db_c.from_ = from_c

    with patch("app.exam.db", mock_db_c):
        with pytest.raises(HTTPException) as exc_info:
            await start_exam(StartExamRequest(exam_id="exam-1"), {"id": "cand-1", "email": "alice@test.com"})
        assert exc_info.value.status_code == 400
        assert "expired" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_assign_exam_deduplication():
    # Candidate "c1" is already assigned, "c2" is new
    mock_db = MagicMock()

    def from_dispatch(table):
        if table == "exam_assignments":
            b = MockQueryBuilder(data=[{"candidate_id": "c1"}])
            # When select is queried for inserted c2
            b.single = AsyncMock(return_value=MagicMock(data={"id": "a-2", "candidate_id": "c2"}, error=None))
            return b
        if table == "exams":
            return MockQueryBuilder(data={"title": "Midterm Exam"})
        if table == "users":
            return MockQueryBuilder(data=[{"id": "c2", "name": "Bob", "email": "bob@test.com"}])
        return MockQueryBuilder()

    mock_db.from_ = from_dispatch

    with patch("app.exam.db", mock_db):
        with patch("app.exam.send_email_async", AsyncMock()) as mock_email:
            res = await assign_exam(
                AssignExamRequest(exam_id="exam-1", candidate_ids=["c1", "c2"]),
                {"id": "recruiter-1", "role": "recruiter"}
            )
            # 1 assigned, 1 skipped
            assert "1 candidate(s) assigned" in res["message"]
            assert "1 already had this exam (skipped)" in res["message"]
            # Email sent ONLY to c2
            assert mock_email.call_count == 1
            assert mock_email.call_args[0][0] == "bob@test.com"
