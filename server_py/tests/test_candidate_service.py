import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.candidate_service import (
    Cache,
    build_public_portfolio,
    get_profile,
    update_profile,
    complete_onboarding,
    get_dashboard_data,
)
from app.errors import NotFoundError, ValidationError

def test_cache_get_set():
    mock_redis = MagicMock()
    mock_redis.get.return_value = '"cached_val"'
    
    with patch("app.candidate_service.redis_client", mock_redis):
        assert Cache.get("key") == "cached_val"
        
        Cache.set("key", "val", 100)
        mock_redis.set.assert_called_once_with("key", '"val"', ex=100)

def test_cache_invalidate_pattern():
    mock_redis = MagicMock()
    mock_redis.keys.return_value = ["portfolio:slug1", "portfolio:slug2"]
    
    with patch("app.candidate_service.redis_client", mock_redis):
        Cache.invalidate_pattern("portfolio:*")
        mock_redis.keys.assert_called_once_with("portfolio:*")
        mock_redis.delete.assert_called_once_with("portfolio:slug1", "portfolio:slug2")

@pytest.mark.asyncio
async def test_build_public_portfolio_not_found():
    mock_repo = MagicMock()
    mock_repo.find_public_portfolio = AsyncMock(return_value=None)
    
    with patch("app.candidate_service.Cache.get", return_value=None):
        with patch("app.candidate_service.candidate_repo", mock_repo):
            with pytest.raises(NotFoundError):
                await build_public_portfolio("non-existent-slug")

@pytest.mark.asyncio
async def test_build_public_portfolio_cached():
    cached_data = {"profile": {"name": "Cached User"}}
    with patch("app.candidate_service.Cache.get", return_value=cached_data):
        result = await build_public_portfolio("cached-slug")
        assert result == cached_data

@pytest.mark.asyncio
async def test_build_public_portfolio_success():
    mock_repo = MagicMock()
    mock_repo.find_public_portfolio = AsyncMock(return_value={"user_id": "user_123", "name": "Test User"})
    mock_repo.get_candidate_answers = AsyncMock(return_value=[
        {"is_correct": True, "question": {"topic": "DSA"}}
    ])
    mock_repo.get_completed_interviews = AsyncMock(return_value=[
        {"communication_score": 85.0}
    ])
    mock_repo.get_coding_submissions = AsyncMock(return_value=[
        {"score": 9.0, "coding_questions": {"marks": 10}}
    ])
    mock_repo.get_candidate_applications = AsyncMock(return_value=[
        {"id": "app_1", "status": "offered"}
    ])
    
    with patch("app.candidate_service.Cache.get", return_value=None):
        with patch("app.candidate_service.Cache.set") as mock_cache_set:
            with patch("app.candidate_service.candidate_repo", mock_repo):
                result = await build_public_portfolio("valid-slug")
                assert result["profile"]["name"] == "Test User"
                assert "radarData" in result
                assert "strengths" in result
                assert "weaknesses" in result
                assert len(result["applications"]) == 1
                mock_cache_set.assert_called_once()

@pytest.mark.asyncio
async def test_get_profile():
    mock_repo = MagicMock()
    mock_repo.get_user_by_id = AsyncMock(return_value={"id": "user_123", "email": "test@example.com"})
    mock_repo.get_profile_by_user_id = AsyncMock(return_value={"id": "prof_123", "phone": "1234567890"})

    with patch("app.candidate_service.candidate_repo", mock_repo):
        result = await get_profile("user_123")
        assert result["user"]["email"] == "test@example.com"
        assert result["profile"]["phone"] == "1234567890"

@pytest.mark.asyncio
async def test_update_profile():
    mock_repo = MagicMock()
    mock_repo.update_profile = AsyncMock(return_value={"user_id": "user_123", "phone": "9876543210"})

    with patch("app.candidate_service.candidate_repo", mock_repo):
        with patch("app.candidate_service.Cache.invalidate_pattern") as mock_inv:
            result = await update_profile("user_123", {"phone": "9876543210", "skills": ["Python"]})
            assert result["phone"] == "9876543210"
            mock_inv.assert_called_once_with("portfolio:*")

@pytest.mark.asyncio
async def test_complete_onboarding_missing_fields():
    # Missing skills
    with pytest.raises(ValidationError):
        await complete_onboarding("user_123", {"password": "Password123!", "phone": "123", "domain_preference": "Backend"})

    # Empty skills list
    with pytest.raises(ValidationError):
        await complete_onboarding("user_123", {"password": "Password123!", "phone": "123", "skills": [], "domain_preference": "Backend"})

    # Missing domain preference
    with pytest.raises(ValidationError):
        await complete_onboarding("user_123", {"password": "Password123!", "phone": "123", "skills": ["Python"]})

@pytest.mark.asyncio
async def test_complete_onboarding_invalid_password():
    with pytest.raises(ValidationError):
        await complete_onboarding("user_123", {
            "password": "123",  # Too short
            "phone": "1234567890",
            "skills": ["Python"],
            "domain_preference": "Backend"
        })

@pytest.mark.asyncio
async def test_complete_onboarding_success():
    mock_repo = MagicMock()
    mock_repo.update_user = AsyncMock(return_value={"id": "user_123", "profile_complete": True})
    mock_repo.update_profile = AsyncMock(return_value={"user_id": "user_123", "profile_complete": True})

    body = {
        "password": "StrongPassword123!",
        "phone": "9876543210",
        "skills": ["Python", "FastAPI"],
        "domain_preference": "Backend Engineering",
        "resume_url": "/uploads/resumes/my-resume.pdf"
    }

    with patch("app.candidate_service.candidate_repo", mock_repo):
        with patch("app.candidate_service.Cache.invalidate_pattern") as mock_inv:
            profile = await complete_onboarding("user_123", body)
            assert profile["profile_complete"] is True
            mock_repo.update_user.assert_called_once()
            mock_repo.update_profile.assert_called_once()
            mock_inv.assert_called_once_with("portfolio:*")

@pytest.mark.asyncio
async def test_get_dashboard_data_empty():
    mock_repo = MagicMock()
    mock_repo.get_exam_assignments = AsyncMock(return_value=[])
    mock_repo.get_attempts_by_exam_ids = AsyncMock(return_value=[])
    mock_repo.get_leaderboard_attempts = AsyncMock(return_value=[])

    with patch("app.candidate_service.candidate_repo", mock_repo):
        data = await get_dashboard_data("user_123")
        assert data["stats"]["assigned"] == 0
        assert data["stats"]["completed"] == 0
        assert data["stats"]["averageScore"] == 0.0
        assert data["performance"] == []
        assert data["upcomingExams"] == []
        assert data["notifications"] == []

@pytest.mark.asyncio
async def test_get_dashboard_data_with_attempts():
    mock_repo = MagicMock()
    mock_repo.get_exam_assignments = AsyncMock(return_value=[
        {
            "id": "assign_1",
            "exam_id": "exam_1",
            "exam": {
                "id": "exam_1",
                "title": "Python & Algorithms",
                "total_marks": 100.0,
                "pass_marks": 50.0,
                "duration": 60,
                "available_from": "2026-10-20T10:00:00Z"
            }
        },
        {
            "id": "assign_2",
            "exam_id": "exam_2",
            "exam": {
                "id": "exam_2",
                "title": "System Design",
                "total_marks": 100.0,
                "pass_marks": 40.0,
                "duration": 45,
                "available_from": "2026-10-25T10:00:00Z"
            }
        }
    ])
    mock_repo.get_attempts_by_exam_ids = AsyncMock(return_value=[
        {
            "id": "att_1",
            "exam_id": "exam_1",
            "status": "completed",
            "score": 85.0,
            "started_at": "2026-10-14T10:00:00Z",
            "submitted_at": "2026-10-14T11:00:00Z"
        }
    ])
    mock_repo.get_leaderboard_attempts = AsyncMock(return_value=[
        {
            "candidate_id": "user_123",
            "score": 85.0,
            "users": {"id": "user_123", "name": "Alice", "email": "alice@example.com"},
            "exams": {"total_marks": 100.0}
        },
        {
            "candidate_id": "user_456",
            "score": 95.0,
            "users": {"id": "user_456", "name": "Bob", "email": "bob@example.com"},
            "exams": {"total_marks": 100.0}
        }
    ])

    with patch("app.candidate_service.candidate_repo", mock_repo):
        data = await get_dashboard_data("user_123")
        assert data["stats"]["assigned"] == 2
        assert data["stats"]["completed"] == 1
        assert data["stats"]["pending"] == 1
        assert data["stats"]["passCount"] == 1
        assert data["stats"]["averageScore"] == 85.0
        assert data["stats"]["bestScore"] == 85.0
        assert data["stats"]["rank"] == 2  # Bob (95%) is #1, Alice (85%) is #2
        assert len(data["performance"]) == 1
        assert data["performance"][0]["status"] == "pass"
        assert len(data["upcomingExams"]) == 1
        assert data["upcomingExams"][0]["examId"] == "exam_2"
        assert len(data["notifications"]) >= 1
