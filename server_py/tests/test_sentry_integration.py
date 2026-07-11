import pytest
from unittest.mock import patch, MagicMock
from app.sentry_integration import init_sentry

def test_init_sentry_not_configured():
    with patch("app.sentry_integration.SENTRY_DSN", None):
        assert init_sentry() is False

def test_init_sentry_configured_missing_library():
    with patch("app.sentry_integration.SENTRY_DSN", "http://public@localhost/1"):
        with patch("builtins.__import__", side_effect=ImportError):
            assert init_sentry() is False

def test_init_sentry_configured_success():
    mock_sentry = MagicMock()
    with patch("app.sentry_integration.SENTRY_DSN", "http://public@localhost/1"):
        with patch.dict("sys.modules", {"sentry_sdk": mock_sentry}):
            assert init_sentry() is True
            mock_sentry.init.assert_called_once()
            args, kwargs = mock_sentry.init.call_args
            assert kwargs["dsn"] == "http://public@localhost/1"
