import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.candidate_service import Cache, build_public_portfolio
from app.errors import NotFoundError

def test_cache_get_set():
    mock_redis = MagicMock()
    mock_redis.get.return_value = '"cached_val"'
    
    with patch("app.candidate_service.redis_client", mock_redis):
        assert Cache.get("key") == "cached_val"
        
        Cache.set("key", "val", 100)
        mock_redis.setex.assert_called_once_with("key", 100, '"val"')

@pytest.mark.asyncio
async def test_build_public_portfolio_not_found():
    mock_repo = MagicMock()
    mock_repo.find_public_portfolio = AsyncMock(return_value=None)
    
    with patch("app.candidate_service.candidate_repo", mock_repo):
        with pytest.raises(NotFoundError):
            await build_public_portfolio("non-existent-slug")

@pytest.mark.asyncio
async def test_build_public_portfolio_success():
    mock_repo = MagicMock()
    mock_repo.find_public_portfolio = AsyncMock(return_value={"user_id": "user_123", "name": "Test User"})
    mock_repo.get_candidate_answers = AsyncMock(return_value=[])
    mock_repo.get_completed_interviews = AsyncMock(return_value=[])
    mock_repo.get_coding_submissions = AsyncMock(return_value=[])
    mock_repo.get_candidate_applications = AsyncMock(return_value=[])
    
    with patch("app.candidate_service.candidate_repo", mock_repo):
        result = await build_public_portfolio("valid-slug")
        assert result["profile"]["name"] == "Test User"
        assert "radarData" in result
        assert "strengths" in result
        assert "weaknesses" in result
