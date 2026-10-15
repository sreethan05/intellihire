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

@pytest.mark.asyncio
async def test_create_drive_invalid_date():
    from app.recruiter_service import create_drive
    invalid_drive = {
        "title": "Software Engineer",
        "company_name": "Acme Corp",
        "college_id": "col_1",
        "allowed_branches": ["CSE"],
        "drive_date": "not-a-valid-date"
    }
    with pytest.raises(ValueError) as exc:
        await create_drive(invalid_drive, "recruiter_1")
    assert "Invalid drive date" in str(exc.value)

@pytest.mark.asyncio
async def test_create_drive_invalid_salary():
    from app.recruiter_service import create_drive
    invalid_drive = {
        "title": "Software Engineer",
        "company_name": "Acme Corp",
        "college_id": "col_1",
        "allowed_branches": ["CSE"],
        "salary_min": 500000,
        "salary_max": 300000
    }
    with pytest.raises(ValueError) as exc:
        await create_drive(invalid_drive, "recruiter_1")
    assert "Minimum salary cannot exceed maximum salary" in str(exc.value)

@pytest.mark.asyncio
async def test_create_drive_zero_applicants():
    from app.recruiter_service import create_drive
    drive_data = {
        "title": "Software Engineer",
        "company_name": "Acme Corp",
        "college_id": "col_1",
        "allowed_branches": ["CSE"],
        "min_cgpa": 9.5,
        "drive_date": "2026-11-20"
    }
    mock_repo = MagicMock()
    mock_repo.insert_job = AsyncMock(return_value={
        "id": "job_123",
        "title": "Software Engineer",
        "company_name": "Acme Corp",
        "company_description": "{}",
        "college_id": "col_1"
    })
    mock_repo.get_candidates_for_eligibility = AsyncMock(return_value=[])
    mock_repo.get_colleges_by_ids = AsyncMock(return_value=[{"id": "col_1", "name": "Test College"}])

    with patch("app.recruiter_service.recruiter_repo", mock_repo):
        res = await create_drive(drive_data, "recruiter_1")
        assert res["eligibleCount"] == 0
        assert res["drive"]["id"] == "job_123"

@pytest.mark.asyncio
async def test_upload_offer_letter_unauthorized():
    from app.recruiter_service import upload_offer_letter
    mock_repo = MagicMock()
    mock_repo.get_job_by_id_and_recruiter = AsyncMock(return_value=None)

    with patch("app.recruiter_service.recruiter_repo", mock_repo):
        with pytest.raises(ValueError) as exc:
            await upload_offer_letter("cand_1", "job_diff_recruiter", "offer.pdf", "recruiter_1")
        assert "unauthorized" in str(exc.value).lower()
