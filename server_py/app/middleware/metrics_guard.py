"""Bearer-token gate for the Prometheus ``/metrics`` endpoint.

``/metrics`` exposes operational data (request counts, latencies, route
labels) and is mounted by ``prometheus-fastapi-instrumentator`` in main.py.
It stays open when ``METRICS_TOKEN`` is unset only outside production so local
tooling and development environments keep working. Production defaults to
deny: operators must configure a token and every scrape must carry
``Authorization: Bearer <token>``.
"""
import hmac
import os

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from ..config import NODE_ENV


class MetricsGuardMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/metrics":
            token = os.environ.get("METRICS_TOKEN")
            if NODE_ENV == "production" and not token:
                return JSONResponse({"detail": "Metrics are not configured"}, status_code=503)
            if token:
                supplied = request.headers.get("authorization", "")
                if not hmac.compare_digest(supplied, f"Bearer {token}"):
                    return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)
