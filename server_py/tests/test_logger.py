import pytest
from unittest.mock import patch, MagicMock
from app.logger import log_request, logger

def test_log_request_200():
    with patch.object(logger, "info") as mock_info:
        log_request("GET", "/api/exam", 200, 15.5, "user_123")
        mock_info.assert_called_once()
        log_msg = mock_info.call_args[0][0]
        assert "method=GET" in log_msg
        assert "url=/api/exam" in log_msg
        assert "status_code=200" in log_msg
        assert "duration_ms=15.50ms" in log_msg
        assert "user_id=user_123" in log_msg

def test_log_request_400():
    with patch.object(logger, "warning") as mock_warning:
        log_request("POST", "/api/auth/login", 400, 10.0)
        mock_warning.assert_called_once()
        log_msg = mock_warning.call_args[0][0]
        assert "status_code=400" in log_msg
        assert "user_id=" not in log_msg

def test_log_request_500():
    with patch.object(logger, "error") as mock_error:
        log_request("DELETE", "/api/exam/1", 500, 150.25)
        mock_error.assert_called_once()
        log_msg = mock_error.call_args[0][0]
        assert "status_code=500" in log_msg
