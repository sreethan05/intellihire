import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from ..logger import log_request


class LoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        duration_ms = (time.time() - start) * 1000

        user_id = None
        if hasattr(request.state, "user") and request.state.user:
            user_id = request.state.user.get("id")
        else:
            token = request.cookies.get("access_token")
            if token:
                try:
                    from ..auth_router import verify_token
                    decoded = verify_token(token)
                    user_id = decoded.get("id")
                except Exception:
                    pass

        log_request(
            method=request.method,
            url=str(request.url),
            status_code=response.status_code,
            duration_ms=duration_ms,
            user_id=user_id,
            request_id=getattr(request.state, "request_id", None),
        )

        return response
