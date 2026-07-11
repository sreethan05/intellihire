import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.candidate_repo import (
    find_public_portfolio,
    get_candidate_answers,
    get_completed_interviews,
    get_coding_submissions,
    get_candidate_applications
)

@pytest.mark.asyncio
async def test_find_public_portfolio():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"user_id": "user_123", "name": "John"}
    
    # Chain: db.from_("candidate_profiles").select(...).eq(...).maybeSingle().execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.maybeSingle.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        profile = await find_public_portfolio("john-slug")
        assert profile["name"] == "John"

@pytest.mark.asyncio
async def test_get_candidate_answers():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "ans_1"}]
    
    # Chain: db.from_("answers").select(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        answers = await get_candidate_answers("candidate_123")
        assert len(answers) == 1

@pytest.mark.asyncio
async def test_get_completed_interviews():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"communication_score": 85.0}]
    
    # Chain: db.from_("ai_interviews").select(...).eq(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        interviews = await get_completed_interviews("candidate_123")
        assert len(interviews) == 1

@pytest.mark.asyncio
async def test_get_coding_submissions():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"score": 10.0}]
    
    # Chain: db.from_("coding_submissions").select(...).eq(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        subs = await get_coding_submissions("candidate_123")
        assert len(subs) == 1

@pytest.mark.asyncio
async def test_get_candidate_applications():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "app_1"}]
    
    # Chain: db.from_("candidate_status").select(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        apps = await get_candidate_applications("candidate_123")
        assert len(apps) == 1
