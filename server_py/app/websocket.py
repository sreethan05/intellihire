import os
import socketio
import jwt
from .db import db
from typing import Any, Dict

from .config import APP_URL, JWT_SECRET, CORS_ALLOWED_ORIGINS

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if APP_URL and APP_URL not in allowed_origins:
    allowed_origins.append(APP_URL)

if CORS_ALLOWED_ORIGINS:
    for origin in CORS_ALLOWED_ORIGINS.split(","):
        origin = origin.strip()
        if origin and origin not in allowed_origins:
            allowed_origins.append(origin)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=allowed_origins)
socket_app = socketio.ASGIApp(sio)

from pydantic import BaseModel, Field, ValidationError

class NotificationsJoinPayload(BaseModel):
    userId: str = Field(..., min_length=1)

class ProctorJoinPayload(BaseModel):
    attemptId: str = Field(..., min_length=1)

class ProctorMonitorPayload(BaseModel):
    examId: str = Field(..., min_length=1)

class ProctorSnapshotPayload(BaseModel):
    examId: str = Field(..., min_length=1)
    attemptId: str = Field(..., min_length=1)
    snapshotData: str = Field(..., min_length=1)
    timestamp: str = Field(..., min_length=1)

class ProctorViolationPayload(BaseModel):
    examId: str = Field(..., min_length=1)
    attemptId: str = Field(..., min_length=1)
    violationCount: int = Field(..., ge=0)
    message: str = Field(..., min_length=1)
    timestamp: str = Field(..., min_length=1)

class ProctorLeavePayload(BaseModel):
    attemptId: str = Field(..., min_length=1)

def get_cookie(cookie_header: str, name: str) -> str:
    if not cookie_header:
        return ""
    cookies = cookie_header.split(";")
    for c in cookies:
        parts = c.strip().split("=")
        if len(parts) == 2 and parts[0].strip() == name:
            return parts[1].strip()
    return ""

@sio.event
async def connect(sid, environ):
    headers = environ.get("headers", {})
    # Look for cookie header (HTTP_COOKIE or HTTP_HEADERS cookie)
    cookie_header = ""
    for k, v in environ.items():
        if k.upper() == "HTTP_COOKIE":
            cookie_header = v
            break
            
    cookie_token = get_cookie(cookie_header, "access_token")
    
    # Handshake auth token support
    auth = environ.get("asgi.scope", {}).get("query_string", b"").decode("utf-8")
    auth_token = ""
    if "token=" in auth:
        for p in auth.split("&"):
            if p.startswith("token="):
                auth_token = p.split("=")[1]
                
    token = cookie_token or auth_token
    if not token:
        print(f"[WebSocket] Rejected connection {sid} - authentication required")
        return False
        
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        async with sio.session(sid) as session:
            session["user"] = decoded
        print(f"[WebSocket] Connected client {sid} as user {decoded.get('id')}")
    except Exception as exc:
        print(f"[WebSocket] Rejected connection {sid} - invalid token: {str(exc)}")
        return False
    return True

@sio.event
async def disconnect(sid):
    print(f"[WebSocket] Client disconnected: {sid}")

@sio.on("notifications:join")
async def on_notifications_join(sid, data: Any):
    try:
        validated = NotificationsJoinPayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    async with sio.session(sid) as session:
        user = session.get("user")
    if not user or user.get("id") != validated.userId:
        await sio.emit("error", {"message": "Unauthorized notifications room join"}, to=sid)
        return
    room = f"user:{validated.userId}"
    sio.enter_room(sid, room)
    print(f"[WebSocket] User {user.get('id')} joined notifications room")

@sio.on("proctor:join")
async def on_proctor_join(sid, data: Any):
    try:
        validated = ProctorJoinPayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return
        
    attempt_id = validated.attemptId
    if user.get("role") == "candidate":
        # Verify candidate is owner of the attempt
        res = await db.from_("attempts").select("candidate_id").eq("id", attempt_id).single()
        if res.error or not res.data or res.data.get("candidate_id") != user.get("id"):
            await sio.emit("error", {"message": "Unauthorized attempt room join"}, to=sid)
            return
    elif user.get("role") not in ["recruiter", "admin"]:
        await sio.emit("error", {"message": "Unauthorized attempt room join"}, to=sid)
        return
        
    room = f"attempt:{attempt_id}"
    sio.enter_room(sid, room)
    print(f"[WebSocket] Client joined proctoring room {room}")

@sio.on("proctor:monitor")
async def on_proctor_monitor(sid, data: Any):
    try:
        validated = ProctorMonitorPayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return
        
    exam_id = validated.examId
    if user.get("role") == "recruiter":
        res = await db.from_("exams").select("created_by").eq("id", exam_id).single()
        if res.error or not res.data or res.data.get("created_by") != user.get("id"):
            await sio.emit("error", {"message": "Unauthorized monitor room join"}, to=sid)
            return
    elif user.get("role") != "admin":
        await sio.emit("error", {"message": "Unauthorized monitor room join"}, to=sid)
        return
        
    room = f"monitor:{exam_id}"
    sio.enter_room(sid, room)
    print(f"[WebSocket] Client joined monitor room {room}")

@sio.on("admin:join")
async def on_admin_join(sid):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user or user.get("role") != "admin":
        await sio.emit("error", {"message": "Unauthorized admin room join"}, to=sid)
        return
    sio.enter_room(sid, "admin")
    print(f"[WebSocket] Admin client {sid} joined admin room")

@sio.on("proctor:snapshot")
async def on_proctor_snapshot(sid, data: Any):
    try:
        validated = ProctorSnapshotPayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        return
        
    # Broadcast snapshot to monitoring room
    exam_id = validated.examId
    monitor_room = f"monitor:{exam_id}"
    await sio.emit("proctor:snapshot", {
        "attemptId": validated.attemptId,
        "snapshotData": validated.snapshotData,
        "timestamp": validated.timestamp,
    }, room=monitor_room, skip_sid=sid)

@sio.on("proctor:violation")
async def on_proctor_violation(sid, data: Any):
    try:
        validated = ProctorViolationPayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        return
        
    attempt_id = validated.attemptId
    exam_id = validated.examId
    violation_count = validated.violationCount
    message = validated.message
    timestamp = validated.timestamp
    
    # Broadcast to monitoring room
    monitor_room = f"monitor:{exam_id}"
    await sio.emit("proctor:violation", {
        "attemptId": attempt_id,
        "violationCount": violation_count,
        "message": message,
        "timestamp": timestamp,
    }, room=monitor_room)
    
    # Resolve names and alert admin
    try:
        # Retrieve attempt and exam title
        att_res = await db.from_("attempts").select("candidate_id").eq("id", attempt_id).single()
        exam_res = await db.from_("exams").select("title").eq("id", exam_id).single()
        
        candidate_id = att_res.data.get("candidate_id") if att_res.data else None
        exam_title = exam_res.data.get("title") if exam_res.data else "Exam"
        
        candidate_name = "Candidate"
        if candidate_id:
            user_res = await db.from_("users").select("name").eq("id", candidate_id).single()
            if user_res.data:
                candidate_name = user_res.data.get("name", "Candidate")
                
        await sio.emit("admin:proctor_violation", {
            "attemptId": attempt_id,
            "candidateName": candidate_name,
            "examTitle": exam_title,
            "message": message,
            "violationCount": violation_count,
            "timestamp": timestamp,
        }, room="admin")
    except Exception as exc:
        print(f"[WebSocket] Admin violation alert resolve failed: {str(exc)}")

@sio.on("proctor:leave")
async def on_proctor_leave(sid, data: Any):
    try:
        validated = ProctorLeavePayload.model_validate(data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    sio.leave_room(sid, f"attempt:{validated.attemptId}")

async def send_realtime_notification(user_id: str, payload: Dict[str, Any]):
    room = f"user:{user_id}"
    await sio.emit("notification", payload, room=room)
