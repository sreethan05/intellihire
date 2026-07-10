import os
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import PORT
from .compiler import router as compiler_router
from .ai import router as ai_router
from .auth_router import router as auth_router
from .recruiter import router as recruiter_router
from .tpo import router as tpo_router
from .admin import router as admin_router
from .docs import router as docs_router
from .hub import router as hub_router
from .exam import router as exam_router
from .candidate import router as candidate_router
from .interview import router as interview_router
from .result import router as result_router
from .assets import router as assets_router
from .proctoring import router as proctoring_router
from .websocket import socket_app
from .utils import storage_root

app = FastAPI(
    title="IntelliHire Python Gateway & Backend",
    version="1.0.0",
    description="Full Python Backend for IntelliHire Assessment Platform"
)

# Setup CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust if needed, or keep open for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all Routers
app.include_router(compiler_router)
app.include_router(ai_router)
app.include_router(auth_router)
app.include_router(recruiter_router)
app.include_router(tpo_router)
app.include_router(admin_router)
app.include_router(docs_router)
app.include_router(hub_router)
app.include_router(exam_router)
app.include_router(candidate_router)
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

@app.post("/internal/notify")
async def internal_notify(req: NotifyRequest):
    await send_realtime_notification(req.userId, req.payload)
    return {"status": "success"}

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
        
    groq_configured = bool(os.getenv("GROQ_API_KEY"))
    smtp_configured = bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))
    
    pipeline_status = {"healthy": False, "totalMcq": 0, "totalCoding": 0}
    try:
        pipeline_status = await get_bank_stats()
    except Exception:
        pass
        
    all_healthy = postgres_healthy or groq_configured
    
    return {
        "status": "healthy" if all_healthy else "degraded",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "environment": os.getenv("NODE_ENV", "development"),
        "services": {
            "postgres": postgres_healthy,
            "groq": groq_configured,
            "judge0": {
                "endpoint": os.getenv("JUDGE0_API_URL", "https://ce.judge0.com"),
                "isPrivate": bool(os.getenv("JUDGE0_API_URL") and "ce.judge0.com" not in os.getenv("JUDGE0_API_URL"))
            },
            "email": smtp_configured,
            "sentry": bool(os.getenv("SENTRY_DSN")),
            "pipeline": pipeline_status
        }
    }

@app.get("/")
async def root():
    dist_index = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "server", "dist", "index.html"))
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    return {"message": "IntelliHire Python Backend is running successfully."}


dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "server", "dist"))
dist_assets_dir = os.path.join(dist_dir, "assets")
if os.path.isdir(dist_assets_dir):
    app.mount("/assets", StaticFiles(directory=dist_assets_dir), name="frontend-assets")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_path = os.path.join(dist_dir, "index.html")
    requested_path = os.path.abspath(os.path.join(dist_dir, full_path))
    if os.path.exists(requested_path) and requested_path.startswith(dist_dir) and os.path.isfile(requested_path):
        return FileResponse(requested_path)
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "IntelliHire Python Backend is running successfully."}
