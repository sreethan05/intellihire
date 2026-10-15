import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.candidate_repo import (
    find_public_portfolio,
    get_candidate_answers,
    get_completed_interviews,
    get_coding_submissions,
    get_candidate_applications,
    get_user_by_id,
    get_profile_by_user_id,
    update_profile,
    update_user,
    get_exam_assignments,
    get_attempts_by_exam_ids,
    get_leaderboard_attempts,
)

@pytest.mark.asyncio
async def test_find_public_portfolio_by_slug():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"user_id": "user_123", "name": "John"}
    
    mock_db.from_.return_value.select.return_value.eq.return_value.maybeSingle.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        profile = await find_public_portfolio("john-slug")
        assert profile["name"] == "John"

@pytest.mark.asyncio
async def test_find_public_portfolio_by_uuid():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"user_id": "12345678-1234-1234-1234-123456789abc", "name": "UUID User"}
    
    mock_db.from_.return_value.select.return_value.eq.return_value.maybeSingle.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        profile = await find_public_portfolio("12345678-1234-1234-1234-123456789abc")
        assert profile["name"] == "UUID User"

@pytest.mark.asyncio
async def test_get_candidate_answers():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "ans_1"}]
    
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
    
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.candidate_repo.db", mock_db):
        apps = await get_candidate_applications("candidate_123")
        assert len(apps) == 1

@pytest.mark.asyncio
async def test_get_user_by_id():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "user_123", "email": "test@example.com"}
    mock_db.from_.return_value.select.return_value.eq.return_value.single.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        user = await get_user_by_id("user_123")
        assert user["id"] == "user_123"
        assert user["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_get_profile_by_user_id():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "prof_123", "user_id": "user_123", "skills": ["Python"]}
    mock_db.from_.return_value.select.return_value.eq.return_value.maybeSingle.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        prof = await get_profile_by_user_id("user_123")
        assert prof["skills"] == ["Python"]

@pytest.mark.asyncio
async def test_update_profile():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "prof_123", "user_id": "user_123", "skills": ["Python", "FastAPI"]}
    mock_db.from_.return_value.update.return_value.eq.return_value.select.return_value.single.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        updated = await update_profile("user_123", {"skills": ["Python", "FastAPI"]})
        assert "FastAPI" in updated["skills"]

@pytest.mark.asyncio
async def test_update_user():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "user_123", "profile_complete": True}
    mock_db.from_.return_value.update.return_value.eq.return_value.select.return_value.single.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        updated = await update_user("user_123", {"profile_complete": True})
        assert updated["profile_complete"] is True

@pytest.mark.asyncio
async def test_get_exam_assignments():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "assign_1", "exam_id": "exam_1"}]
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        assignments = await get_exam_assignments("user_123")
        assert len(assignments) == 1
        assert assignments[0]["exam_id"] == "exam_1"

@pytest.mark.asyncio
async def test_get_attempts_by_exam_ids():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "att_1", "score": 85.0}]
    mock_db.from_.return_value.select.return_value.eq.return_value.order.return_value.in_.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        attempts = await get_attempts_by_exam_ids("user_123", ["exam_1"])
        assert len(attempts) == 1
        assert attempts[0]["score"] == 85.0

@pytest.mark.asyncio
async def test_get_leaderboard_attempts():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"candidate_id": "user_123", "score": 90.0, "status": "completed"}]
    mock_db.from_.return_value.select.return_value.eq.return_value.in_.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        lead = await get_leaderboard_attempts(["exam_1"])
        assert len(lead) == 1
        assert lead[0]["candidate_id"] == "user_123"

@pytest.mark.asyncio
async def test_repo_error_raising():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = ValueError("Database connection error")
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)

    with patch("app.repositories.candidate_repo.db", mock_db):
        with pytest.raises(ValueError):
            await get_candidate_answers("candidate_123")
