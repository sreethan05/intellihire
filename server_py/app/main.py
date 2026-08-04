import hmac
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, Header, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import PORT, APP_URL, NODE_ENV, INTERNAL_API_SECRET, GROQ_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS, JUDGE0_API_URL, SENTRY_DSN, CORS_ALLOWED_ORIGINS
from .rate_limit import limiter
from .compiler import router as compiler_router
from .ai import router as ai_router
from .auth_router import router as auth_router, get_current_user, require_roles
from .tpo import router as tpo_router
from .docs import router as docs_router
from .hub import router as hub_router
from .exam import router as exam_router
from .interview import router as interview_router
from .result import router as result_router
from .assets import router as assets_router
from .proctoring import router as proctoring_router

# Modularized sub-routers
from .routers.candidate_profile import router as candidate_profile_router
from .routers.candidate_exams import router as candidate_exams_router
from .routers.candidate_analytics import router as candidate_analytics_router
from .routers.candidate_dashboard import router as candidate_dashboard_router

from .routers.recruiter_candidates import router as recruiter_candidates_router
from .routers.recruiter_drives import router as recruiter_drives_router
from .routers.recruiter_dashboard import router as recruiter_dashboard_router

from .routers.admin_users import router as admin_users_router
from .routers.admin_analytics import router as admin_analytics_router
from .websocket import socket_app
from .utils import storage_root
from .migration_runner import run_migrations
from .ml_ranker import ranker

class RankCandidateRequest(BaseModel):
    mcq_score_pct: Optional[float] = 50.0
    coding_score_pct: Optional[float] = 50.0
    time_taken_ratio: Optional[float] = 0.8
    proctor_trust_score: Optional[float] = 100.0
    code_efficiency_score: Optional[float] = 70.0

IS_PRODUCTION = NODE_ENV == "production"

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup migrations runner
    try:
        run_migrations()
    except Exception as e:
        if IS_PRODUCTION:
            raise e
        else:
            from .logger import logger
            logger.warning(f"Database migration skipped/failed during startup: {e}")
    yield

app = FastAPI(
    title="IntelliHire Python Gateway & Backend",
    version="1.0.0",
    description="Full Python Backend for IntelliHire Assessment Platform",
    lifespan=lifespan,
    # FastAPI serves /docs, /redoc, and /openapi.json publicly by default.
    # In production, disable the built-in ones entirely — access goes through
    # the admin-gated docs_router below instead (see the /docs mount note).
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)

from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)

app.state.limiter = limiter

app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Setup CORS middleware — explicit allowlist, never a wildcard, since the app
# uses credentialed (cookie-based) requests. A wildcard origin combined with
# allow_credentials=True lets any website make authenticated requests on a
# logged-in visitor's behalf.
from .config import get_allowed_origins
allowed_origins = get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .middleware.logger_middleware import LoggerMiddleware
from .middleware.csrf import CSRFMiddleware
from .middleware.audit_logger import AuditLoggerMiddleware
from .middleware.error_handler import add_exception_handlers
from .middleware.security_headers import SecurityHeadersMiddleware
from .middleware.request_id import RequestIdMiddleware

app.add_middleware(RequestIdMiddleware)
app.add_middleware(LoggerMiddleware)
app.add_middleware(CSRFMiddleware)
app.add_middleware(AuditLoggerMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

add_exception_handlers(app)

# Include all Routers
app.include_router(compiler_router)
app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(recruiter_candidates_router)
app.include_router(recruiter_drives_router)
app.include_router(recruiter_dashboard_router)
app.include_router(tpo_router)
app.include_router(admin_users_router)
app.include_router(admin_analytics_router)

# The auto-generated OpenAPI schema is itself a full map of every endpoint,
# parameter, and request/response shape in the API. Fully public docs are an
# information-disclosure risk (CWE-200), so this route is admin-only in
# production and open in dev for convenience.
if IS_PRODUCTION:
    app.include_router(
        docs_router,
        dependencies=[Depends(require_roles(["admin"]))],
    )
else:
    app.include_router(docs_router)

app.include_router(hub_router)
app.include_router(exam_router)
app.include_router(candidate_profile_router)
app.include_router(candidate_exams_router)
app.include_router(candidate_analytics_router)
app.include_router(candidate_dashboard_router)
app.include_router(interview_router)
app.include_router(result_router)
app.include_router(assets_router)
app.include_router(proctoring_router)

# Mount Socket.IO app
app.mount("/socket.io", socket_app)

# Ensure storage root exists and mount it
os.makedirs(storage_root, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=storage_root), name="uploads")

from pydantic import BaseModel
from .websocket import send_realtime_notification
from .db import db


class NotifyRequest(BaseModel):
    userId: str
    payload: dict


def _verify_internal_secret(x_internal_secret: str = Header(default="")):
    """
    /internal/notify is meant to be called by trusted server-side code only
    (e.g. a background worker), never by an end user's browser. Previously it
    had no authentication at all, so anyone could POST an arbitrary userId +
    payload and push a fake realtime notification to any user.

    This checks a shared secret passed via the X-Internal-Secret header.
    Set INTERNAL_API_SECRET in the environment and have any legitimate
    internal caller send that same value in this header. If the secret isn't
    configured at all, the endpoint refuses every request rather than
    silently falling back to "no auth".
    """
    if not INTERNAL_API_SECRET:
        raise HTTPException(status_code=503, detail="Internal API secret is not configured")
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, INTERNAL_API_SECRET):
        raise HTTPException(status_code=401, detail="Invalid internal API secret")
    return True


@app.post("/internal/notify")
@limiter.limit("60/minute")
async def internal_notify(request: Request, req: NotifyRequest, _: bool = Depends(_verify_internal_secret)):
    await send_realtime_notification(req.userId, req.payload)
    return {"status": "success"}


@app.post("/api/ml/rank-candidate")
@limiter.limit("60/minute")
async def rank_candidate_endpoint(request: Request, body: RankCandidateRequest, _: Dict[str, Any] = Depends(get_current_user)):
    prediction = ranker.predict(body.model_dump())
    prediction["experimental"] = True
    return prediction


async def get_bank_stats():
    mcq_res = await db.from_("questions").select("id", count="exact", head=True)
    mcq_count = mcq_res.count or 0

    coding_res = await db.from_("coding_questions").select("id", count="exact", head=True)
    coding_count = coding_res.count or 0

    topics_res = await db.from_("questions").select("topic")
    topics = list({t["topic"] for t in (topics_res.data or []) if t.get("topic")})

    diff_res = await db.from_("questions").select("difficulty")
    diff_count = {}
    for d in (diff_res.data or []):
        diff = d.get("difficulty")
        if diff:
            diff_count[diff] = diff_count.get(diff, 0) + 1

    return {
        "totalMcq": mcq_count,
        "totalCoding": coding_count,
        "topics": topics,
        "difficulties": diff_count,
        "healthy": mcq_count >= 50 and coding_count >= 10
    }


@app.get("/api/health")
@app.get("/api/v1/health")
async def health_check():
    import datetime
    postgres_healthy = True
    try:
        await db.from_("users").select("id", count="exact", head=True)
    except Exception:
        postgres_healthy = False

    groq_configured = bool(GROQ_API_KEY)
    smtp_configured = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

    pipeline_status = {"healthy": False, "totalMcq": 0, "totalCoding": 0}
    try:
        pipeline_status = await get_bank_stats()
    except Exception:
        pass

    all_healthy = postgres_healthy
    degraded_services = []
    if not groq_configured:
        degraded_services.append("groq")
    if not smtp_configured:
        degraded_services.append("email")
    if pipeline_status.get("healthy") is False:
        degraded_services.append("pipeline")

    if not all_healthy:
        status = "unhealthy"
    elif degraded_services:
        status = "degraded"
    else:
        status = "healthy"

    return {
        "status": status,
        "degraded_services": degraded_services,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z",
        "environment": NODE_ENV,
        "services": {
            "postgres": postgres_healthy,
            "groq": groq_configured,
            "judge0": {
                "endpoint": JUDGE0_API_URL,
                "isPrivate": bool(JUDGE0_API_URL and "ce.judge0.com" not in JUDGE0_API_URL)
            },
            "email": smtp_configured,
            "sentry": bool(SENTRY_DSN),
            "pipeline": pipeline_status
        }
    }

# Detect frontend static build output directory (root dist or legacy server/dist)
dist_dir_primary = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
dist_dir_legacy = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "server", "dist"))
dist_dir = dist_dir_primary if os.path.exists(dist_dir_primary) else dist_dir_legacy

@app.get("/")
async def root():
    dist_index = os.path.join(dist_dir, "index.html")
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return {"message": "IntelliHire Python Backend is running successfully."}

dist_assets_dir = os.path.join(dist_dir, "assets")
if os.path.isdir(dist_assets_dir):
    app.mount("/assets", StaticFiles(directory=dist_assets_dir), name="frontend-assets")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    # Exclude API and Socket.IO endpoints from catch-all fallback to avoid masking 404s
    if full_path.startswith("api") or full_path.startswith("socket.io"):
        raise HTTPException(status_code=404, detail="API route not found")

    index_path = os.path.join(dist_dir, "index.html")
    requested_path = os.path.abspath(os.path.join(dist_dir, full_path))
    if os.path.exists(requested_path) and requested_path.startswith(dist_dir) and os.path.isfile(requested_path):
        return FileResponse(requested_path)
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "IntelliHire Python Backend is running successfully."}
