import os
import socketio
import jwt
from .db import db
from typing import Any, Dict

JWT_SECRET = os.getenv("JWT_SECRET")

from .config import APP_URL

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
if APP_URL and APP_URL not in allowed_origins:
    allowed_origins.append(APP_URL)

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=allowed_origins)
socket_app = socketio.ASGIApp(sio)

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
async def on_notifications_join(sid, data: Dict[str, Any]):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user or user.get("id") != data.get("userId"):
        await sio.emit("error", {"message": "Unauthorized notifications room join"}, to=sid)
        return
    room = f"user:{data.get('userId')}"
    sio.enter_room(sid, room)
    print(f"[WebSocket] User {user.get('id')} joined notifications room")

@sio.on("proctor:join")
async def on_proctor_join(sid, data: Dict[str, Any]):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return
        
    attempt_id = data.get("attemptId")
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
async def on_proctor_monitor(sid, data: Dict[str, Any]):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return
        
    exam_id = data.get("examId")
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
async def on_proctor_snapshot(sid, data: Dict[str, Any]):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        return
        
    # Broadcast snapshot to monitoring room
    exam_id = data.get("examId")
    monitor_room = f"monitor:{exam_id}"
    await sio.emit("proctor:snapshot", {
        "attemptId": data.get("attemptId"),
        "snapshotData": data.get("snapshotData"),
        "timestamp": data.get("timestamp"),
    }, room=monitor_room, skip_sid=sid)

@sio.on("proctor:violation")
async def on_proctor_violation(sid, data: Dict[str, Any]):
    async with sio.session(sid) as session:
        user = session.get("user")
    if not user:
        return
        
    attempt_id = data.get("attemptId")
    exam_id = data.get("examId")
    violation_count = data.get("violationCount")
    message = data.get("message")
    timestamp = data.get("timestamp")
    
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
async def on_proctor_leave(sid, data: Dict[str, Any]):
    sio.leave_room(sid, f"attempt:{data.get('attemptId')}")

async def send_realtime_notification(user_id: str, payload: Dict[str, Any]):
    room = f"user:{user_id}"
    await sio.emit("notification", payload, room=room)
