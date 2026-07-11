import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import Request
from app.middleware.logger_middleware import LoggerMiddleware

@pytest.mark.asyncio
async def test_logger_middleware_dispatch_no_session():
    mock_request = MagicMock()
    mock_request.method = "GET"
    mock_request.url = "http://localhost/api/exam"
    mock_request.cookies = {}
    mock_request.state = MagicMock()
    del mock_request.state.user  # ensure user does not exist
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    
    call_next = AsyncMock()
    call_next.return_value = mock_response
    
    middleware = LoggerMiddleware(MagicMock())
    
    with patch("app.middleware.logger_middleware.log_request") as mock_log:
        response = await middleware.dispatch(mock_request, call_next)
        
        assert response == mock_response
        call_next.assert_called_once_with(mock_request)
        mock_log.assert_called_once()
        args, kwargs = mock_log.call_args
        assert kwargs["method"] == "GET"
        assert kwargs["url"] == "http://localhost/api/exam"
        assert kwargs["status_code"] == 200
        assert kwargs["user_id"] is None

@pytest.mark.asyncio
async def test_logger_middleware_dispatch_with_user_state():
    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url = "http://localhost/api/exam"
    mock_request.state.user = {"id": "user_123"}
    
    mock_response = MagicMock()
    mock_response.status_code = 201
    
    call_next = AsyncMock()
    call_next.return_value = mock_response
    
    middleware = LoggerMiddleware(MagicMock())
    
    with patch("app.middleware.logger_middleware.log_request") as mock_log:
        response = await middleware.dispatch(mock_request, call_next)
        
        assert response == mock_response
        mock_log.assert_called_once()
        args, kwargs = mock_log.call_args
        assert kwargs["user_id"] == "user_123"

@pytest.mark.asyncio
async def test_logger_middleware_dispatch_with_token_cookie():
    mock_request = MagicMock()
    mock_request.method = "GET"
    mock_request.url = "http://localhost/api/exam"
    mock_request.cookies = {"access_token": "valid_token"}
    mock_request.state = MagicMock()
    del mock_request.state.user
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    
    call_next = AsyncMock()
    call_next.return_value = mock_response
    
    middleware = LoggerMiddleware(MagicMock())
    
    with patch("app.middleware.logger_middleware.log_request") as mock_log:
        with patch("app.auth_router.verify_token") as mock_verify:
            mock_verify.return_value = {"id": "user_456"}
            
            response = await middleware.dispatch(mock_request, call_next)
            
            assert response == mock_response
            mock_log.assert_called_once()
            args, kwargs = mock_log.call_args
            assert kwargs["user_id"] == "user_456"
