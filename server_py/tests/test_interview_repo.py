import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.interview_repo import (
    get_attempts_by_candidate,
    get_questions_count,
    get_interview_by_id,
    get_job_by_id,
    get_interview_answers,
    get_pending_interviews
)

@pytest.mark.asyncio
async def test_get_attempts_by_candidate():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "att_1"}]
    
    # Chain: db.from_("attempts").select(...).eq(...).eq(...).order(...).execute()
    # Note: under the hood, the eq() is called twice, so we configure return_values accordingly.
    eq_mock = MagicMock()
    order_mock = MagicMock()
    mock_db.from_.return_value.select.return_value.eq.return_value = eq_mock
    eq_mock.eq.return_value = eq_mock
    eq_mock.order.return_value = order_mock
    order_mock.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        attempts = await get_attempts_by_candidate("candidate_123")
        assert len(attempts) == 1

@pytest.mark.asyncio
async def test_get_questions_count():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.count = 42
    mock_db.from_.return_value.select.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        count = await get_questions_count()
        assert count == 42

@pytest.mark.asyncio
async def test_get_interview_by_id():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "iv_1"}
    mock_db.from_.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        interview = await get_interview_by_id("iv_1")
        assert interview["id"] == "iv_1"

@pytest.mark.asyncio
async def test_get_job_by_id():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "job_1"}
    mock_db.from_.return_value.select.return_value.eq.return_value.maybeSingle.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        job = await get_job_by_id("job_1")
        assert job["id"] == "job_1"

@pytest.mark.asyncio
async def test_get_interview_answers():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "ans_1"}]
    mock_db.from_.return_value.select.return_value.eq.return_value.order.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        answers = await get_interview_answers("iv_1")
        assert len(answers) == 1

@pytest.mark.asyncio
async def test_get_pending_interviews():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "iv_pending"}]
    
    eq_mock = MagicMock()
    order_mock = MagicMock()
    mock_db.from_.return_value.select.return_value.eq.return_value = eq_mock
    eq_mock.eq.return_value = eq_mock
    eq_mock.order.return_value = order_mock
    order_mock.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.interview_repo.db", mock_db):
        interviews = await get_pending_interviews("candidate_123")
        assert len(interviews) == 1
