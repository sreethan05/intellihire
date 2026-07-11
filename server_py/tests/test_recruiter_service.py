import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.recruiter_service import get_drive_college_ids, create_candidate, get_candidates_list, get_colleges_list

def test_get_drive_college_ids():
    # Drive with company_description containing serialized college_ids in correct metadata format
    drive_serialized = {
        "company_description": 'Some description\n\n===METADATA===\n{"college_ids": ["col_1", "col_2"]}',
        "college_id": "col_fallback"
    }
    assert get_drive_college_ids(drive_serialized) == ["col_1", "col_2"]

    # Drive with empty company_description
    drive_no_desc = {
        "company_description": "",
        "college_id": "col_fallback"
    }
    assert get_drive_college_ids(drive_no_desc) == ["col_fallback"]

@pytest.mark.asyncio
async def test_create_candidate_invalid_password():
    with pytest.raises(ValueError):
        await create_candidate({"name": "Test User", "email": "test@example.com", "password": "123"}, "recruiter_id")

@pytest.mark.asyncio
async def test_create_candidate_success():
    mock_repo = MagicMock()
    mock_repo.create_user = AsyncMock(return_value={"id": "cand_123", "name": "Test User"})
    
    with patch("app.recruiter_service.recruiter_repo", mock_repo):
        # Patch hash_password in app.utils instead of app.recruiter_service
        with patch("app.utils.hash_password", return_value="hashed_password"):
            result = await create_candidate({"name": "Test User", "email": "test@example.com", "password": "SecurePassword123!"}, "recruiter_id")
            assert result["id"] == "cand_123"
            mock_repo.create_user.assert_called_once()

@pytest.mark.asyncio
async def test_get_candidates_list():
    mock_repo = MagicMock()
    mock_repo.get_candidates = AsyncMock(return_value=[{"id": "cand_1"}])
    mock_repo.get_candidates_count = AsyncMock(return_value=1)
    
    with patch("app.recruiter_service.recruiter_repo", mock_repo):
        result = await get_candidates_list(1, 10)
        assert result["total"] == 1
        assert len(result["candidates"]) == 1

@pytest.mark.asyncio
async def test_get_colleges_list():
    mock_repo = MagicMock()
    mock_repo.get_colleges = AsyncMock(return_value=[{"id": "col_1"}])
    
    with patch("app.recruiter_service.recruiter_repo", mock_repo):
        result = await get_colleges_list()
        assert len(result["colleges"]) == 1
