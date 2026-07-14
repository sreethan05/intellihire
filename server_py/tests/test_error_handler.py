import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from app.errors import AppError
from app.middleware.error_handler import add_exception_handlers

@pytest.mark.asyncio
async def test_app_error_handler():
    app = FastAPI()
    add_exception_handlers(app)
    
    # Retrieve handler
    handler = app.exception_handlers[AppError]
    
    mock_request = MagicMock()
    mock_request.state.request_id = "request_id_abc"
    
    exc = AppError(404, "NOT_FOUND", "User not found", [{"item": "user"}])
    
    with patch("app.middleware.error_handler.logger") as mock_logger:
        response = await handler(mock_request, exc)
        assert isinstance(response, JSONResponse)
        assert response.status_code == 404
        
        # Verify logging
        mock_logger.error.assert_called_once()
        assert "User not found" in mock_logger.error.call_args[0][0]

@pytest.mark.asyncio
async def test_validation_error_handler():
    app = FastAPI()
    add_exception_handlers(app)
    
    handler = app.exception_handlers[RequestValidationError]
    
    mock_request = MagicMock()
    mock_request.state.request_id = "request_id_def"
    
    exc = RequestValidationError([])
    
    with patch("app.middleware.error_handler.logger") as mock_logger:
        response = await handler(mock_request, exc)
        assert isinstance(response, JSONResponse)
        assert response.status_code == 400
        
        mock_logger.warning.assert_called_once()

@pytest.mark.asyncio
async def test_general_exception_handler():
    app = FastAPI()
    add_exception_handlers(app)
    
    handler = app.exception_handlers[Exception]
    
    mock_request = MagicMock()
    mock_request.state.request_id = "request_id_ghi"
    
    exc = Exception("Generic Database Fault")
    
    with patch("app.middleware.error_handler.logger") as mock_logger:
        response = await handler(mock_request, exc)
        assert isinstance(response, JSONResponse)
        assert response.status_code == 500
        
        mock_logger.error.assert_called_once()
        assert "Generic Database Fault" in mock_logger.error.call_args[0][0]
        
        # Sentry check
        with patch("app.middleware.error_handler.SENTRY_DSN", "http://public@localhost/1"):
            with patch("app.middleware.error_handler.logger") as mock_logger_2:
                import sys
                mock_sentry = MagicMock()
                with patch.dict("sys.modules", {"sentry_sdk": mock_sentry}):
                    await handler(mock_request, exc)
                    mock_sentry.capture_exception.assert_called_once_with(exc)
