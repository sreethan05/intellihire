import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.responses import JSONResponse
from app.middleware.csrf import CSRFMiddleware

@pytest.mark.asyncio
async def test_csrf_middleware_safe_method():
    mock_request = MagicMock()
    mock_request.method = "GET"
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    middleware = CSRFMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == "response"
    call_next.assert_called_once_with(mock_request)

@pytest.mark.asyncio
async def test_csrf_middleware_exempt_path():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url.path = "/api/auth/login"
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    middleware = CSRFMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == "response"
    call_next.assert_called_once_with(mock_request)

@pytest.mark.asyncio
async def test_csrf_middleware_no_session():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url.path = "/api/exam/create"
    mock_request.cookies = {}
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    middleware = CSRFMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == "response"
    call_next.assert_called_once_with(mock_request)

@pytest.mark.asyncio
async def test_csrf_middleware_invalid_token():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url.path = "/api/exam/create"
    # Session exists but token mismatch
    mock_request.cookies = {"access_token": "valid_session", "csrf_token": "cookie_val"}
    mock_request.headers = {"x-csrf-token": "wrong_val"}
    
    call_next = AsyncMock()
    
    middleware = CSRFMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert isinstance(result, JSONResponse)
    assert result.status_code == 403
    call_next.assert_not_called()

@pytest.mark.asyncio
async def test_csrf_middleware_valid_token():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url.path = "/api/exam/create"
    mock_request.cookies = {"access_token": "valid_session", "csrf_token": "correct_val"}
    mock_request.headers = {"x-csrf-token": "correct_val"}
    
    call_next = AsyncMock()
    call_next.return_value = "response"
    
    middleware = CSRFMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == "response"
    call_next.assert_called_once_with(mock_request)
