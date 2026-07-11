import asyncio
import json
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from ..db import db
from ..logger import logger

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuditLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        if method not in MUTATING_METHODS:
            return await call_next(request)

        # Read the request body and restore it for path operations
        body = await request.body()
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request._receive = receive

        response = await call_next(request)

        # Try to resolve user ID from the access token cookie
        user_id = None
        token = request.cookies.get("access_token")
        if token:
            try:
                from ..auth_router import verify_token
                decoded = verify_token(token)
                user_id = decoded.get("id")
            except Exception:
                pass

        path = str(request.url)
        ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
        path_no_query = request.url.path
        action = f"{method} {path_no_query}"
        
        parts = path_no_query.split("/")
        # e.g., /api/auth/login -> parts = ['', 'api', 'auth', 'login'] -> parts[2] is 'auth'
        resource = "unknown"
        if len(parts) > 2:
            resource = parts[2]

        payload = None
        if body and "application/json" in request.headers.get("content-type", ""):
            try:
                payload = json.loads(body)
                if isinstance(payload, dict):
                    payload = dict(payload)
                    payload.pop("password", None)
                    payload.pop("password_hash", None)
                    payload.pop("token", None)
            except Exception:
                pass

        async def write_log():
            try:
                await db.from_("audit_logs").insert({
                    "user_id": user_id,
                    "action": action,
                    "resource": resource,
                    "method": method,
                    "path": path,
                    "ip_address": ip,
                    "user_agent": user_agent,
                    "payload": payload,
                })
            except Exception as err:
                logger.error(f"Failed to write audit log: {err}, userId={user_id}, action={action}")

        # Non-blocking async insert
        asyncio.create_task(write_log())

        return response
