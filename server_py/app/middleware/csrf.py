import hmac
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in SAFE_METHODS:
            return await call_next(request)

        path = request.url.path
        # Exempt login and refresh endpoints
        if path.endswith("/auth/login") or path.endswith("/auth/refresh"):
            return await call_next(request)

        # If there is no access token cookie, no session exists to protect via CSRF
        has_session = bool(request.cookies.get("access_token"))
        if not has_session:
            return await call_next(request)

        cookie_token = request.cookies.get("csrf_token")
        header_token = request.headers.get("x-csrf-token")

        if (
            not cookie_token
            or not header_token
            or not hmac.compare_digest(cookie_token.encode("utf-8"), header_token.encode("utf-8"))
        ):
            return JSONResponse(
                status_code=403,
                content={"error": "Invalid CSRF token"}
            )

        return await call_next(request)
