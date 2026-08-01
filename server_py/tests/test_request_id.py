from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request
from starlette.responses import Response

from app.middleware.request_id import RequestIdMiddleware


@pytest.mark.asyncio
async def test_request_id_is_preserved_and_returned():
    middleware = RequestIdMiddleware(app=AsyncMock())
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": [(b"x-request-id", b"trace-123")]})
    response = await middleware.dispatch(request, AsyncMock(return_value=Response()))

    assert request.state.request_id == "trace-123"
    assert response.headers["X-Request-ID"] == "trace-123"
