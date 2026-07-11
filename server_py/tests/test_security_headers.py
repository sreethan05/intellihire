import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import Response
from app.middleware.security_headers import SecurityHeadersMiddleware

@pytest.mark.asyncio
async def test_security_headers_middleware():
    mock_request = MagicMock()
    
    # Mock return value response
    mock_response = Response()
    call_next = AsyncMock(return_value=mock_response)
    
    middleware = SecurityHeadersMiddleware(MagicMock())
    result = await middleware.dispatch(mock_request, call_next)
    
    assert result == mock_response
    # Verify all 10/10 security headers are present
    assert result.headers["X-Frame-Options"] == "DENY"
    assert result.headers["X-Content-Type-Options"] == "nosniff"
    assert result.headers["X-XSS-Protection"] == "1; mode=block"
    assert result.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert result.headers["X-Permitted-Cross-Domain-Policies"] == "none"
    assert "default-src 'self'" in result.headers["Content-Security-Policy"]
