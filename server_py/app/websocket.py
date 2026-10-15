import os
import re
import datetime
from typing import Any, Dict, Optional
import socketio
import jwt
from pydantic import BaseModel, Field, ValidationError

from .db import db
from .config import JWT_SECRET, get_allowed_origins
from .logger import logger

allowed_origins = get_allowed_origins()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=allowed_origins,
    cors_credentials=True,
    ping_interval=20,
    ping_timeout=15,
    max_http_buffer_size=5 * 1024 * 1024,  # 5MB buffer for proctor webcam frames
)
socket_app = socketio.ASGIApp(sio)

_MSG_TAG_RE = re.compile(r"<[^>]+>")


def sanitize_message(msg: Optional[str]) -> str:
    """Strips HTML tags and clamps length to prevent XSS in broadcasts and logs."""
    if not msg:
        return ""
    return _MSG_TAG_RE.sub("", msg)[:500]


class NotificationsJoinPayload(BaseModel):
    userId: str = Field(..., min_length=1, max_length=128)


class ProctorJoinPayload(BaseModel):
    attemptId: str = Field(..., min_length=1, max_length=128)
    role: Optional[str] = Field(default=None, max_length=50)


class ProctorMonitorPayload(BaseModel):
    examId: str = Field(..., min_length=1, max_length=128)


class ProctorSnapshotPayload(BaseModel):
    examId: str = Field(..., min_length=1, max_length=128)
    attemptId: str = Field(..., min_length=1, max_length=128)
    snapshotData: str = Field(..., min_length=1, max_length=1_500_000)
    timestamp: str = Field(..., min_length=1, max_length=100)


class ProctorViolationPayload(BaseModel):
    examId: str = Field(..., min_length=1, max_length=128)
    attemptId: str = Field(..., min_length=1, max_length=128)
    violationCount: int = Field(..., ge=0, le=10000)
    message: str = Field(..., min_length=1, max_length=500)
    timestamp: str = Field(..., min_length=1, max_length=100)


class ProctorLeavePayload(BaseModel):
    attemptId: str = Field(..., min_length=1, max_length=128)


class RecruiterActionPayload(BaseModel):
    attemptId: str = Field(..., min_length=1, max_length=128)
    action: str = Field(..., pattern="^(warn|pause|resume|disqualify)$")
    message: str = Field("", max_length=500)


def get_cookie(cookie_header: str, name: str) -> str:
    """Safely extracts a cookie value by name, preserving '=' padding in base64 tokens."""
    if not cookie_header:
        return ""
    cookies = cookie_header.split(";")
    for c in cookies:
        parts = c.strip().split("=", 1)
        if len(parts) == 2 and parts[0].strip() == name:
            return parts[1].strip()
    return ""


def validate_payload(model_cls, data: Any):
    """Validates raw dict or JSON string payload into the target Pydantic model."""
    if isinstance(data, str):
        try:
            return model_cls.model_validate_json(data)
        except Exception:
            pass
    return model_cls.model_validate(data)


async def get_session_user(sid: str) -> Optional[Dict[str, Any]]:
    """Safely retrieves the authenticated user dictionary from the socket session.
    Catches KeyError and disconnect race conditions when clients drop rapidly.
    """
    try:
        async with sio.session(sid) as session:
            return session.get("user")
    except KeyError:
        return None
    except Exception as exc:
        logger.warning(f"[WebSocket] Failed to retrieve session for {sid}: {exc}")
        return None


@sio.event
async def connect(sid, environ, auth=None):
    cookie_header = ""
    for k, v in environ.items():
        if k.upper() == "HTTP_COOKIE":
            cookie_header = v
            break

    cookie_token = get_cookie(cookie_header, "access_token")

    # Socket.IO client handshake auth dict support
    auth_token = None
    if isinstance(auth, dict):
        auth_token = auth.get("token") or auth.get("access_token")

    # HTTP Authorization Bearer support
    header_token = None
    auth_header = environ.get("HTTP_AUTHORIZATION") or ""
    if auth_header.startswith("Bearer "):
        header_token = auth_header[7:].strip()

    # Query-string token fallback is intentionally excluded for security (prevents URL logging)
    token = cookie_token or auth_token or header_token
    if not token:
        logger.warning(f"[WebSocket] Rejected connection {sid} - authentication required")
        return False

    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        async with sio.session(sid) as session:
            session["user"] = decoded
        logger.info(f"[WebSocket] Connected client {sid} as user {decoded.get('id')}")
    except Exception as exc:
        logger.warning(f"[WebSocket] Rejected connection {sid} - invalid token: {str(exc)}")
        return False
    return True


@sio.event
async def disconnect(sid):
    try:
        user = await get_session_user(sid)
        user_id = user.get("id") if user else "anonymous"
        logger.info(f"[WebSocket] Client disconnected: {sid} (user: {user_id})")
    except Exception:
        logger.info(f"[WebSocket] Client disconnected: {sid}")


@sio.on("ping")
async def on_ping(sid, data: Any = None):
    """Application-level heartbeat to measure round-trip latency and confirm liveness."""
    try:
        await sio.emit("pong", data or {}, to=sid)
    except Exception:
        pass


@sio.on("notifications:join")
async def on_notifications_join(sid, data: Any):
    try:
        validated = validate_payload(NotificationsJoinPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user or user.get("id") != validated.userId:
        await sio.emit("error", {"message": "Unauthorized notifications room join"}, to=sid)
        return
    room = f"user:{validated.userId}"
    await sio.enter_room(sid, room)
    logger.info(f"[WebSocket] User {user.get('id')} joined notifications room")


@sio.on("notifications:leave")
async def on_notifications_leave(sid, data: Any):
    try:
        validated = validate_payload(NotificationsJoinPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    try:
        await sio.leave_room(sid, f"user:{validated.userId}")
        logger.info(f"[WebSocket] Client {sid} left notifications room user:{validated.userId}")
    except Exception as exc:
        logger.warning(f"[WebSocket] Error during notifications:leave for {sid}: {exc}")


@sio.on("proctor:join")
async def on_proctor_join(sid, data: Any):
    try:
        validated = validate_payload(ProctorJoinPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return

    attempt_id = validated.attemptId
    role = user.get("role")
    if role == "candidate":
        try:
            # Verify candidate is owner of the attempt
            res = await db.from_("attempts").select("candidate_id").eq("id", attempt_id).single()
            if res.error or not res.data or res.data.get("candidate_id") != user.get("id"):
                await sio.emit("error", {"message": "Unauthorized attempt room join"}, to=sid)
                return
        except Exception as exc:
            logger.error(f"[WebSocket] DB error checking attempt ownership for {sid}: {exc}")
            await sio.emit("error", {"message": "Database error validating attempt"}, to=sid)
            return

        # Cache attempt_id in session for O(1) authorization during high-frequency snapshot streams
        try:
            async with sio.session(sid) as session:
                session["attempt_id"] = attempt_id
        except KeyError:
            return
    elif role not in ["recruiter", "admin"]:
        await sio.emit("error", {"message": "Unauthorized attempt room join"}, to=sid)
        return

    room = f"attempt:{attempt_id}"
    await sio.enter_room(sid, room)
    logger.info(f"[WebSocket] Client {sid} joined proctoring room {room}")


@sio.on("proctor:leave")
async def on_proctor_leave(sid, data: Any):
    try:
        validated = validate_payload(ProctorLeavePayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    try:
        # Await the coroutine to cleanly leave the room
        await sio.leave_room(sid, f"attempt:{validated.attemptId}")
        async with sio.session(sid) as session:
            if session.get("attempt_id") == validated.attemptId:
                session.pop("attempt_id", None)
        logger.info(f"[WebSocket] Client {sid} left proctoring room attempt:{validated.attemptId}")
    except KeyError:
        pass
    except Exception as exc:
        logger.warning(f"[WebSocket] Error during proctor:leave for {sid}: {exc}")


@sio.on("proctor:monitor")
async def on_proctor_monitor(sid, data: Any):
    try:
        validated = validate_payload(ProctorMonitorPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user:
        await sio.emit("error", {"message": "Authentication required"}, to=sid)
        return

    exam_id = validated.examId
    if user.get("role") == "recruiter":
        try:
            res = await db.from_("exams").select("created_by").eq("id", exam_id).single()
            if res.error or not res.data or res.data.get("created_by") != user.get("id"):
                await sio.emit("error", {"message": "Unauthorized monitor room join"}, to=sid)
                return
        except Exception as exc:
            logger.error(f"[WebSocket] DB error checking exam ownership for {sid}: {exc}")
            await sio.emit("error", {"message": "Database error validating exam"}, to=sid)
            return
    elif user.get("role") != "admin":
        await sio.emit("error", {"message": "Unauthorized monitor room join"}, to=sid)
        return

    room = f"monitor:{exam_id}"
    await sio.enter_room(sid, room)
    logger.info(f"[WebSocket] Client {sid} joined monitor room {room}")


@sio.on("proctor:unmonitor")
async def on_proctor_unmonitor(sid, data: Any):
    try:
        validated = validate_payload(ProctorMonitorPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    try:
        await sio.leave_room(sid, f"monitor:{validated.examId}")
        logger.info(f"[WebSocket] Client {sid} left monitor room monitor:{validated.examId}")
    except Exception as exc:
        logger.warning(f"[WebSocket] Error during proctor:unmonitor for {sid}: {exc}")


@sio.on("admin:join")
async def on_admin_join(sid):
    user = await get_session_user(sid)
    if not user or user.get("role") != "admin":
        await sio.emit("error", {"message": "Unauthorized admin room join"}, to=sid)
        return
    await sio.enter_room(sid, "admin")
    logger.info(f"[WebSocket] Admin client {sid} joined admin room")


@sio.on("admin:leave")
async def on_admin_leave(sid):
    try:
        await sio.leave_room(sid, "admin")
        logger.info(f"[WebSocket] Admin client {sid} left admin room")
    except Exception as exc:
        logger.warning(f"[WebSocket] Error during admin:leave for {sid}: {exc}")


@sio.on("proctor:snapshot")
async def on_proctor_snapshot(sid, data: Any):
    try:
        validated = validate_payload(ProctorSnapshotPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user:
        return

    # Candidates are restricted to emitting snapshots for their own attempt only
    if user.get("role") == "candidate":
        try:
            async with sio.session(sid) as session:
                cached_attempt = session.get("attempt_id")
        except KeyError:
            return

        if cached_attempt != validated.attemptId:
            try:
                res = await db.from_("attempts").select("candidate_id").eq("id", validated.attemptId).single()
                if res.error or not res.data or res.data.get("candidate_id") != user.get("id"):
                    await sio.emit("error", {"message": "Unauthorized attempt snapshot emission"}, to=sid)
                    return
                async with sio.session(sid) as session:
                    session["attempt_id"] = validated.attemptId
            except Exception as exc:
                logger.error(f"[WebSocket] DB error checking snapshot attempt for {sid}: {exc}")
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
        validated = validate_payload(ProctorViolationPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user:
        return

    attempt_id = validated.attemptId
    exam_id = validated.examId
    violation_count = validated.violationCount
    message = sanitize_message(validated.message)
    timestamp = validated.timestamp

    # Candidates can only report violations for their own attempt
    if user.get("role") == "candidate":
        try:
            async with sio.session(sid) as session:
                cached_attempt = session.get("attempt_id")
        except KeyError:
            return

        if cached_attempt != attempt_id:
            try:
                res = await db.from_("attempts").select("candidate_id").eq("id", attempt_id).single()
                if res.error or not res.data or res.data.get("candidate_id") != user.get("id"):
                    await sio.emit("error", {"message": "Unauthorized attempt violation emission"}, to=sid)
                    return
                async with sio.session(sid) as session:
                    session["attempt_id"] = attempt_id
            except Exception as exc:
                logger.error(f"[WebSocket] DB error checking violation attempt for {sid}: {exc}")
                return

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
        logger.error(f"[WebSocket] Admin violation alert resolve failed: {str(exc)}")


@sio.on("proctor:recruiter-action")
async def on_recruiter_action(sid, data: Any):
    """Recruiter sends a real-time action (warn/pause/resume/disqualify)
    to a candidate's exam session."""
    try:
        validated = validate_payload(RecruiterActionPayload, data)
    except ValidationError as e:
        await sio.emit("error", {"message": f"Invalid payload: {str(e)}"}, to=sid)
        return

    user = await get_session_user(sid)
    if not user or user.get("role") not in ["recruiter", "admin"]:
        await sio.emit("error", {"message": "Unauthorized: recruiter/admin only"}, to=sid)
        return

    attempt_id = validated.attemptId
    try:
        res = await db.from_("attempts").select("recruiter_id, exam_id, candidate_id").eq("id", attempt_id).single()
    except Exception as exc:
        logger.error(f"[WebSocket] DB error checking attempt for {sid}: {exc}")
        await sio.emit("error", {"message": "Database error validating attempt"}, to=sid)
        return
    if res.error or not res.data:
        await sio.emit("error", {"message": "Attempt not found"}, to=sid)
        return
    attempt_row = res.data
    if user.get("role") == "recruiter" and attempt_row.get("recruiter_id") != user.get("id"):
        await sio.emit("error", {"message": "Unauthorized: not your attempt"}, to=sid)
        return

    clean_message = sanitize_message(validated.message)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    room = f"attempt:{attempt_id}"
    await sio.emit("proctor:recruiter-action", {
        "action": validated.action,
        "message": clean_message,
        "recruiterName": user.get("name") or "Recruiter",
        "timestamp": now_iso,
    }, room=room)

    try:
        await db.from_("proctoring_snapshots").insert({
            "attempt_id": attempt_id,
            "exam_id": attempt_row.get("exam_id"),
            "candidate_id": attempt_row.get("candidate_id"),
            "event_type": "violation",
            "violation_severity": "high" if validated.action == "disqualify" else "medium",
            "message": f"Recruiter action: {validated.action} - {clean_message}",
        })
    except Exception as exc:
        logger.warning(f"[WebSocket] Failed to log recruiter action to DB: {exc}")

    logger.info(f"[WebSocket] Recruiter action '{validated.action}' sent to attempt {attempt_id}")


async def send_realtime_notification(user_id: str, payload: Dict[str, Any]):
    room = f"user:{user_id}"
    await sio.emit("notification", payload, room=room)
