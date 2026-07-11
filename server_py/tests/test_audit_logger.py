import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import Request
from app.middleware.audit_logger import AuditLoggerMiddleware

class AwaitableMock(MagicMock):
    def __init__(self, await_result=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._await_result = await_result

    def __await__(self):
        async def _async_func():
            return self._await_result
        return _async_func().__await__()

@pytest.mark.asyncio
async def test_audit_logger_middleware_get():
    # GET requests should bypass audit logging
    mock_request = MagicMock()
    mock_request.method = "GET"
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    middleware = AuditLoggerMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == "response"
    call_next.assert_called_once_with(mock_request)

@pytest.mark.asyncio
async def test_audit_logger_middleware_post():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.headers = {"content-type": "application/json", "user-agent": "test-agent"}
    mock_request.url.path = "/api/auth/login"
    mock_request.url.__str__.return_value = "http://localhost/api/auth/login"
    mock_request.client.host = "127.0.0.1"
    mock_request.cookies = {"access_token": "valid_token"}
    
    # Mock body reading
    mock_body = AsyncMock()
    mock_body.return_value = b'{"username": "test", "password": "abc"}'
    mock_request.body = mock_body
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    # Mock query builder with AwaitableMock support
    mock_db = MagicMock()
    mock_query = AwaitableMock(await_result=MagicMock())
    mock_query.insert.return_value = mock_query
    mock_db.from_.return_value = mock_query
    
    with patch("app.middleware.audit_logger.db", mock_db):
        with patch("app.auth_router.verify_token") as mock_verify:
            mock_verify.return_value = {"id": "user_id_123"}
            
            middleware = AuditLoggerMiddleware(MagicMock())
            result = await middleware.dispatch(mock_request, call_next)
            
            assert result == "response"
            
            # Wait for background task task
            import asyncio
            await asyncio.sleep(0.1)
            
            mock_db.from_.assert_called_with("audit_logs")
            mock_query.insert.assert_called()
            args, kwargs = mock_query.insert.call_args
            payload = args[0]["payload"]
            assert payload["username"] == "test"
            assert "password" not in payload
