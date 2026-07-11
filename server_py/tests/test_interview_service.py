import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.interview_service import score_answer, clamp_score, fallback_feedback, check_eligibility, get_passed_attempts

def test_score_answer():
    # Test grading score based on length and keywords
    short_ans = "This is a very short answer."
    assert score_answer(short_ans) < 60
    
    long_ans = "I built and implemented a software project where I resolved key issues first, then I deployed it. This was a very successful project because it resolved all requirements."
    assert score_answer(long_ans) > 70

def test_clamp_score():
    assert clamp_score(85) == 85
    assert clamp_score(150) == 100
    assert clamp_score(-10) == 0
    assert clamp_score("invalid") == 0
    assert clamp_score(85.6) == 86

def test_fallback_feedback():
    assert "Clear" in fallback_feedback(80)
    assert "examples" in fallback_feedback(60)

@pytest.mark.asyncio
async def test_get_passed_attempts():
    mock_repo = MagicMock()
    mock_repo.get_attempts_by_candidate = AsyncMock(return_value=[
        {
            "id": "attempt_1",
            "exam_id": "exam_1",
            "score": 80,
            "submitted_at": "2026-07-11T12:00:00Z",
            "exams": {
                "id": "exam_1",
                "title": "React Basics",
                "pass_marks": 40,
                "total_marks": 100
            }
        }
    ])
    
    with patch("app.interview_service.interview_repo", mock_repo):
        passed = await get_passed_attempts("candidate_123")
        assert len(passed) == 1
        assert passed[0]["examTitle"] == "React Basics"
        assert passed[0]["percentage"] == 80.0

@pytest.mark.asyncio
async def test_check_eligibility_not_eligible():
    mock_repo = MagicMock()
    mock_repo.get_attempts_by_candidate = AsyncMock(return_value=[])
    
    with patch("app.interview_service.interview_repo", mock_repo):
        result = await check_eligibility("candidate_123")
        assert result["eligible"] is False
        assert "message" in result
