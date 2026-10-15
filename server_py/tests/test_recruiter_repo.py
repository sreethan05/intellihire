import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.repositories.recruiter_repo import (
    create_user,
    get_candidates,
    get_candidates_count,
    get_colleges,
    get_recruiter_jobs
)

@pytest.mark.asyncio
async def test_create_user():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = {"id": "user_123", "name": "John"}
    
    # Chain: db.from_("users").insert(user_data).select().single().execute()
    mock_db.from_.return_value.insert.return_value.select.return_value.single.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.recruiter_repo.db", mock_db):
        user = await create_user({"name": "John"})
        assert user["name"] == "John"

@pytest.mark.asyncio
async def test_get_candidates():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "cand_1"}]
    
    # Chain: db.from_("users").select(...).eq(...).order(...).range(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.recruiter_repo.db", mock_db):
        candidates = await get_candidates(1, 10)
        assert len(candidates) == 1

@pytest.mark.asyncio
async def test_get_candidates_count():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.count = 5
    
    # Chain: db.from_("users").select(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.recruiter_repo.db", mock_db):
        count = await get_candidates_count()
        assert count == 5

@pytest.mark.asyncio
async def test_get_colleges():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "col_1"}]
    
    # Chain: db.from_("colleges").select(...).order(...).execute()
    mock_db.from_.return_value.select.return_value.order.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.recruiter_repo.db", mock_db):
        colleges = await get_colleges()
        assert len(colleges) == 1

@pytest.mark.asyncio
async def test_get_recruiter_jobs():
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "job_1"}]
    
    # Chain: db.from_("jobs").select(...).eq(...).execute()
    mock_db.from_.return_value.select.return_value.eq.return_value.execute = AsyncMock(return_value=mock_res)
    
    with patch("app.repositories.recruiter_repo.db", mock_db):
        jobs = await get_recruiter_jobs("recruiter_123")
        assert len(jobs) == 1

@pytest.mark.asyncio
async def test_get_colleges_by_ids_empty():
    from app.repositories.recruiter_repo import get_colleges_by_ids
    colleges = await get_colleges_by_ids([])
    assert colleges == []

@pytest.mark.asyncio
async def test_get_colleges_by_ids_success():
    from app.repositories.recruiter_repo import get_colleges_by_ids
    mock_db = MagicMock()
    mock_res = MagicMock()
    mock_res.error = None
    mock_res.data = [{"id": "col_1", "name": "IIT"}]
    
    mock_db.from_.return_value.select.return_value.in_.return_value.execute = AsyncMock(return_value=mock_res)
    with patch("app.repositories.recruiter_repo.db", mock_db):
        res = await get_colleges_by_ids(["col_1"])
        assert len(res) == 1
        assert res[0]["name"] == "IIT"
