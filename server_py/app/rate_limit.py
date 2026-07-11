"""
Rate limiting setup, shared across the app.

Usage in a route file:
    from .rate_limit import limiter

    @router.post("/run")
    @limiter.limit("10/minute")
    async def run_code(request: Request, req: RunCodeRequest, user=Depends(get_current_user)):
        ...

NOTE: slowapi requires the route function to accept a `Request` parameter
named exactly `request` — FastAPI already injects it, just make sure it's
present in the signature of every rate-limited route.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

# Keyed by client IP. If the app sits behind a proxy/load balancer, make sure
# ProxyHeadersMiddleware (or equivalent) is configured so get_remote_address
# sees the real client IP rather than the proxy's.
limiter = Limiter(key_func=get_remote_address)
