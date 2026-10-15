import pytest
import jwt
from unittest.mock import AsyncMock, patch, MagicMock
from pydantic import ValidationError

from app.config import JWT_SECRET
from app.websocket import (
    NotificationsJoinPayload,
    ProctorJoinPayload,
    ProctorMonitorPayload,
    ProctorSnapshotPayload,
    ProctorViolationPayload,
    ProctorLeavePayload,
    RecruiterActionPayload,
    get_cookie,
    validate_payload,
    sanitize_message,
    get_session_user,
    connect,
    disconnect,
    on_ping,
    on_notifications_join,
    on_notifications_leave,
    on_proctor_join,
    on_proctor_leave,
    on_proctor_monitor,
    on_proctor_unmonitor,
    on_admin_join,
    on_admin_leave,
    on_proctor_snapshot,
    on_recruiter_action,
    sio,
)


def test_notifications_join_payload():
    payload = NotificationsJoinPayload(userId="user-123")
    assert payload.userId == "user-123"

    with pytest.raises(ValidationError):
        NotificationsJoinPayload(userId="")


def test_proctor_join_payload():
    payload = ProctorJoinPayload(attemptId="attempt-123", role="candidate")
    assert payload.attemptId == "attempt-123"
    assert payload.role == "candidate"

    with pytest.raises(ValidationError):
        ProctorJoinPayload(attemptId="")


def test_proctor_monitor_payload():
    payload = ProctorMonitorPayload(examId="exam-123")
    assert payload.examId == "exam-123"

    with pytest.raises(ValidationError):
        ProctorMonitorPayload(examId="")


def test_proctor_snapshot_payload():
    payload = ProctorSnapshotPayload(
        examId="exam-123",
        attemptId="attempt-123",
        snapshotData="data...",
        timestamp="2026-07-11T12:00:00",
    )
    assert payload.examId == "exam-123"

    with pytest.raises(ValidationError):
        ProctorSnapshotPayload(examId="exam-123")


def test_proctor_snapshot_payload_size_limit():
    # Exceeding 1.5MB should fail validation
    with pytest.raises(ValidationError):
        ProctorSnapshotPayload(
            examId="exam-123",
            attemptId="attempt-123",
            snapshotData="x" * 1_500_001,
            timestamp="2026-07-11T12:00:00",
        )


def test_proctor_violation_payload():
    payload = ProctorViolationPayload(
        examId="exam-123",
        attemptId="attempt-123",
        violationCount=3,
        message="tab switch",
        timestamp="2026-07-11T12:00:00",
    )
    assert payload.violationCount == 3

    with pytest.raises(ValidationError):
        ProctorViolationPayload(
            examId="exam-123",
            attemptId="attempt-123",
            violationCount=-1,
            message="tab switch",
            timestamp="2026-07-11T12:00:00",
        )


def test_proctor_leave_payload():
    payload = ProctorLeavePayload(attemptId="attempt-123")
    assert payload.attemptId == "attempt-123"

    with pytest.raises(ValidationError):
        ProctorLeavePayload(attemptId="")


def test_recruiter_action_payload():
    # Valid actions
    for action in ["warn", "pause", "resume", "disqualify"]:
        p = RecruiterActionPayload(attemptId="att-1", action=action, message="Note")
        assert p.action == action

    # Invalid action
    with pytest.raises(ValidationError):
        RecruiterActionPayload(attemptId="att-1", action="kick", message="Invalid")


def test_get_cookie_parsing():
    assert get_cookie("", "access_token") == ""
    assert get_cookie("theme=dark; session=xyz", "access_token") == ""

    # Normal cookie
    assert get_cookie("access_token=token123", "access_token") == "token123"

    # Multiple cookies
    header = "session_id=abc; access_token=tok_456; theme=dark"
    assert get_cookie(header, "access_token") == "tok_456"

    # Base64 with '=' padding preserves full value
    header_with_padding = "access_token=eyJhbGciOiJIUzI1NiJ9==; other=1"
    assert get_cookie(header_with_padding, "access_token") == "eyJhbGciOiJIUzI1NiJ9=="


def test_validate_payload():
    # From dict
    res = validate_payload(ProctorLeavePayload, {"attemptId": "att-456"})
    assert res.attemptId == "att-456"

    # From JSON string
    res2 = validate_payload(ProctorLeavePayload, '{"attemptId": "att-789"}')
    assert res2.attemptId == "att-789"

    # Invalid data raises ValidationError
    with pytest.raises(ValidationError):
        validate_payload(ProctorLeavePayload, {"attemptId": ""})


def test_sanitize_message():
    assert sanitize_message("") == ""
    assert sanitize_message(None) == ""
    assert sanitize_message("Normal warning") == "Normal warning"
    assert sanitize_message("<script>alert('xss')</script>Warning") == "alert('xss')Warning"
    long_msg = "a" * 600
    assert len(sanitize_message(long_msg)) == 500


@pytest.mark.asyncio
async def test_get_session_user_handles_keyerror():
    # Calling get_session_user with nonexistent sid simulates rapid disconnect
    user = await get_session_user("nonexistent_rapid_disconnect_sid")
    assert user is None


@pytest.mark.asyncio
async def test_connect_rejection_no_token():
    environ = {"HTTP_HOST": "localhost"}
    accepted = await connect("sid-test-1", environ)
    assert accepted is False


@pytest.mark.asyncio
async def test_connect_rejection_invalid_token():
    environ = {"HTTP_COOKIE": "access_token=invalid_garbage_token"}
    accepted = await connect("sid-test-2", environ)
    assert accepted is False


@pytest.mark.asyncio
async def test_connect_acceptance_cookie(monkeypatch):
    token = jwt.encode({"id": "candidate-1", "role": "candidate"}, JWT_SECRET, algorithm="HS256")
    environ = {"HTTP_COOKIE": f"access_token={token}"}

    mock_session_dict = {}

    class MockSessionContext:
        async def __aenter__(self):
            return mock_session_dict
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: MockSessionContext())

    accepted = await connect("sid-test-3", environ)
    assert accepted is True
    assert mock_session_dict["user"]["id"] == "candidate-1"


@pytest.mark.asyncio
async def test_connect_acceptance_auth_dict(monkeypatch):
    token = jwt.encode({"id": "recruiter-1", "role": "recruiter"}, JWT_SECRET, algorithm="HS256")
    environ = {}
    auth = {"token": token}

    mock_session_dict = {}

    class MockSessionContext:
        async def __aenter__(self):
            return mock_session_dict
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: MockSessionContext())

    accepted = await connect("sid-test-4", environ, auth=auth)
    assert accepted is True
    assert mock_session_dict["user"]["role"] == "recruiter"


@pytest.mark.asyncio
async def test_connect_acceptance_auth_header(monkeypatch):
    token = jwt.encode({"id": "admin-1", "role": "admin"}, JWT_SECRET, algorithm="HS256")
    environ = {"HTTP_AUTHORIZATION": f"Bearer {token}"}

    mock_session_dict = {}

    class MockSessionContext:
        async def __aenter__(self):
            return mock_session_dict
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: MockSessionContext())

    accepted = await connect("sid-test-5", environ)
    assert accepted is True
    assert mock_session_dict["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_disconnect_safe_logging():
    # Should complete without throwing any exception
    await disconnect("sid-any-client")


@pytest.mark.asyncio
async def test_ping_pong_heartbeat(monkeypatch):
    mock_emit = AsyncMock()
    monkeypatch.setattr(sio, "emit", mock_emit)

    await on_ping("sid-test-ping", {"clientTime": 12345})
    mock_emit.assert_awaited_once_with("pong", {"clientTime": 12345}, to="sid-test-ping")


@pytest.mark.asyncio
async def test_notifications_room_lifecycle(monkeypatch):
    mock_emit = AsyncMock()
    mock_enter = AsyncMock()
    mock_leave = AsyncMock()
    monkeypatch.setattr(sio, "emit", mock_emit)
    monkeypatch.setattr(sio, "enter_room", mock_enter)
    monkeypatch.setattr(sio, "leave_room", mock_leave)

    session_store = {"user": {"id": "user-999", "role": "candidate"}}

    class MockSessionContext:
        async def __aenter__(self):
            return session_store
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: MockSessionContext())

    # Unauthorized join attempt (mismatched user id)
    await on_notifications_join("sid-1", {"userId": "wrong-user"})
    mock_emit.assert_awaited_with("error", {"message": "Unauthorized notifications room join"}, to="sid-1")

    # Authorized join
    await on_notifications_join("sid-1", {"userId": "user-999"})
    mock_enter.assert_awaited_with("sid-1", "user:user-999")

    # Leave notifications room
    await on_notifications_leave("sid-1", {"userId": "user-999"})
    mock_leave.assert_awaited_with("sid-1", "user:user-999")


@pytest.mark.asyncio
async def test_proctor_leave_room_awaited(monkeypatch):
    mock_leave = AsyncMock()
    monkeypatch.setattr(sio, "leave_room", mock_leave)

    session_store = {"user": {"id": "cand-1", "role": "candidate"}, "attempt_id": "attempt-101"}

    class MockSessionContext:
        async def __aenter__(self):
            return session_store
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: MockSessionContext())

    await on_proctor_leave("sid-leave-test", {"attemptId": "attempt-101"})
    mock_leave.assert_awaited_once_with("sid-leave-test", "attempt:attempt-101")
    assert "attempt_id" not in session_store


@pytest.mark.asyncio
async def test_admin_join_and_leave(monkeypatch):
    mock_enter = AsyncMock()
    mock_leave = AsyncMock()
    mock_emit = AsyncMock()
    monkeypatch.setattr(sio, "enter_room", mock_enter)
    monkeypatch.setattr(sio, "leave_room", mock_leave)
    monkeypatch.setattr(sio, "emit", mock_emit)

    # Candidate trying to join admin room
    session_cand = {"user": {"id": "c1", "role": "candidate"}}

    class CandSession:
        async def __aenter__(self):
            return session_cand
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: CandSession())
    await on_admin_join("sid-cand")
    mock_emit.assert_awaited_with("error", {"message": "Unauthorized admin room join"}, to="sid-cand")

    # Admin joins
    session_admin = {"user": {"id": "a1", "role": "admin"}}

    class AdminSession:
        async def __aenter__(self):
            return session_admin
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(sio, "session", lambda sid: AdminSession())
    await on_admin_join("sid-admin")
    mock_enter.assert_awaited_with("sid-admin", "admin")

    # Admin leaves
    await on_admin_leave("sid-admin")
    mock_leave.assert_awaited_with("sid-admin", "admin")


@pytest.mark.asyncio
async def test_proctor_unmonitor(monkeypatch):
    mock_leave = AsyncMock()
    monkeypatch.setattr(sio, "leave_room", mock_leave)

    await on_proctor_unmonitor("sid-recruiter", {"examId": "exam-999"})
    mock_leave.assert_awaited_once_with("sid-recruiter", "monitor:exam-999")
