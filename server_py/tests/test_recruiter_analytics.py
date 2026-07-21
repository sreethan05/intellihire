import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from app.routers.recruiter_candidates import get_candidate_analytics
from app.routers.recruiter_dashboard import get_exam_topic_performance

class AwaitableMock(MagicMock):
    def __init__(self, await_result=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._await_result = await_result

    def __await__(self):
        async def _async_func():
            return self._await_result
        return _async_func().__await__()

def make_mock_db():
    mock_db = MagicMock()
    
    def mock_from(table_name):
        if table_name == "users":
            res_data = {"id": "cand_123", "name": "John", "email": "john@example.com"}
        elif table_name == "candidate_profiles":
            res_data = {"id": "profile_123", "user_id": "cand_123"}
        else:
            res_data = []
            
        mock_query = AwaitableMock(await_result=MagicMock(data=res_data, error=None))
        mock_query.select.return_value = mock_query
        mock_query.eq.return_value = mock_query
        mock_query.in_.return_value = mock_query
        mock_query.order.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.single.return_value = mock_query
        mock_query.maybeSingle.return_value = mock_query
        return mock_query
        
    mock_db.from_.side_effect = mock_from
    return mock_db

@pytest.mark.asyncio
async def test_get_candidate_analytics_not_found():
    mock_db = MagicMock()
    mock_query = AwaitableMock(await_result=MagicMock(data=None, error=None))
    mock_query.select.return_value = mock_query
    mock_query.eq.return_value = mock_query
    mock_query.single.return_value = mock_query
    mock_db.from_.return_value = mock_query
    
    with patch("app.routers.recruiter_candidates.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_candidate_analytics("cand_123", {"id": "rec_123"})
        assert exc.value.status_code == 404

@pytest.mark.asyncio
async def test_get_candidate_analytics_success():
    mock_db = make_mock_db()
    with patch("app.routers.recruiter_candidates.db", mock_db):
        result = await get_candidate_analytics("cand_123", {"id": "rec_123"})
        assert "candidate" in result
        assert "examStats" in result
        assert "attempts" in result

@pytest.mark.asyncio
async def test_get_exam_topic_performance_success():
    mock_db = make_mock_db()
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_exam_topic_performance("exam_123", {"id": "rec_123"})
        assert "topics" in result
        assert len(result["topics"]) == 0
