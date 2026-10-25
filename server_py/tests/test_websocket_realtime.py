"""Event-handler coverage for app/websocket.py.

The handlers are plain coroutines registered through the module-level ``sio``
server. Tests invoke them directly with fake session context managers and
AsyncMock socket methods, following the approach in
tests/test_websocket_validation.py. No real socket or DB connection is used.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

import app.websocket as ws
from app.websocket import (
    ProctorLeavePayload,
    disconnect,
    get_session_user,
    on_admin_leave,
    on_notifications_join,
    on_notifications_leave,
    on_ping,
    on_proctor_join,
    on_proctor_leave,
    on_proctor_monitor,
    on_proctor_snapshot,
    on_proctor_unmonitor,
    on_proctor_violation,
    on_recruiter_action,
    send_realtime_notification,
    validate_payload,
)
from tests.db_mocks import db_routing, query, sequence_db

CANDIDATE = {"id": "cand-1", "name": "Asha", "role": "candidate"}
RECRUITER = {"id": "rec-1", "name": "Rex", "role": "recruiter"}
ADMIN = {"id": "admin-1", "name": "Ada", "role": "admin"}

SNAPSHOT = {
    "examId": "exam-1",
    "attemptId": "attempt-1",
    "snapshotData": "frame-bytes",
    "timestamp": "2026-01-01T10:00:00Z",
}

VIOLATION = {
    "examId": "exam-1",
    "attemptId": "attempt-1",
    "violationCount": 2,
    "message": "<b>copy</b> paste",
    "timestamp": "2026-01-01T10:00:00Z",
}

ATTEMPT_ROW = {
    "recruiter_id": RECRUITER["id"],
    "exam_id": "exam-1",
    "candidate_id": CANDIDATE["id"],
}


def session_factory(store=None, error=None):
    """Build a replacement for ``sio.session`` yielding a mutable dict."""
    store = {} if store is None else store

    class _Session:
        async def __aenter__(self):
            if error is not None:
                raise error
            return store

        async def __aexit__(self, *exc_info):
            return False

    return lambda sid: _Session()


def raising_db(exc=None):
    """A db mock whose awaitable ``single()`` raises, for error paths."""
    exc = exc or RuntimeError("db down")
    q = MagicMock()
    q.select.return_value = q
    q.eq.return_value = q
    q.single = AsyncMock(side_effect=exc)
    mock_db = MagicMock()
    mock_db.from_.return_value = q
    return mock_db


def last_error(emit):
    """Return the message of the most recent ``error`` emit."""
    args, _ = emit.await_args
    assert args[0] == "error", f"expected error emit, got {args[0]!r}"
    return args[1]["message"]


# ---------------------------------------------------------------------------
# payload validation + session retrieval
# ---------------------------------------------------------------------------

def test_validate_payload_invalid_json_string_falls_back():
    # Invalid JSON skips the fast path and re-raises from dict validation.
    with pytest.raises(ValidationError):
        validate_payload(ProctorLeavePayload, "not-json")


@pytest.mark.asyncio
async def test_get_session_user_returns_none_on_unexpected_error(monkeypatch):
    def broken_session(sid):
        raise RuntimeError("session store down")

    monkeypatch.setattr(ws.sio, "session", broken_session)
    assert await get_session_user("sid-broken") is None


@pytest.mark.asyncio
async def test_disconnect_swallows_session_lookup_errors():
    with patch("app.websocket.get_session_user", new=AsyncMock(side_effect=RuntimeError("gone"))):
        await disconnect("sid-1")  # must not raise


@pytest.mark.asyncio
async def test_on_ping_swallows_emit_failures():
    with patch.object(ws.sio, "emit", AsyncMock(side_effect=RuntimeError("socket dead"))):
        await on_ping("sid-1", {"clientTime": 1})  # must not raise


# ---------------------------------------------------------------------------
# notifications rooms
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_notifications_join_and_leave_reject_invalid_payloads():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_notifications_join("sid-1", {"userId": ""})
        assert "Invalid payload" in last_error(emit)

        await on_notifications_leave("sid-2", {"userId": ""})
        assert "Invalid payload" in last_error(emit)


@pytest.mark.asyncio
async def test_notifications_leave_swallows_room_errors():
    with patch.object(ws.sio, "leave_room", AsyncMock(side_effect=RuntimeError("nope"))):
        await on_notifications_leave("sid-3", {"userId": "u-1"})  # must not raise


# ---------------------------------------------------------------------------
# proctor:join / proctor:leave
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_proctor_join_rejects_invalid_payload_and_anonymous():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_join("sid-1", {"attemptId": ""})
        assert "Invalid payload" in last_error(emit)

    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=None)):
        await on_proctor_join("sid-2", {"attemptId": "attempt-1"})
        assert last_error(emit) == "Authentication required"


@pytest.mark.asyncio
async def test_proctor_join_candidate_verifies_ownership_and_caches_attempt():
    store = {}
    emit = AsyncMock()
    enter = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": CANDIDATE["id"]})})
    with patch.object(ws.sio, "session", session_factory(store)), \
         patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_join("sid-c", {"attemptId": "attempt-1"})

    enter.assert_awaited_once_with("sid-c", "attempt:attempt-1")
    assert store["attempt_id"] == "attempt-1"
    emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_proctor_join_candidate_rejected_when_not_owner():
    emit = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": "someone-else"})})
    with patch.object(ws.sio, "session", session_factory({})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_join("sid-c", {"attemptId": "attempt-1"})

    assert last_error(emit) == "Unauthorized attempt room join"


@pytest.mark.asyncio
async def test_proctor_join_candidate_db_failure_reports_database_error():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", raising_db()):
        await on_proctor_join("sid-c", {"attemptId": "attempt-1"})

    assert last_error(emit) == "Database error validating attempt"


@pytest.mark.asyncio
async def test_proctor_join_candidate_session_keyerror_aborts_silently():
    emit = AsyncMock()
    enter = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": CANDIDATE["id"]})})
    with patch.object(ws.sio, "session", session_factory(error=KeyError("gone"))), \
         patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_join("sid-c", {"attemptId": "attempt-1"})

    enter.assert_not_awaited()
    emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_proctor_join_unknown_role_rejected_and_staff_scoped():
    emit = AsyncMock()
    enter = AsyncMock()
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value={"id": "tpo-1", "role": "tpo"})):
        await on_proctor_join("sid-tpo", {"attemptId": "attempt-1"})
    assert last_error(emit) == "Unauthorized attempt room join"
    enter.assert_not_awaited()

    # A recruiter who owns the attempt may join.
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.db", db_routing({"attempts": query(data={"recruiter_id": RECRUITER["id"]})})), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_join("sid-r", {"attemptId": "attempt-1"})
    enter.assert_awaited_once_with("sid-r", "attempt:attempt-1")

    # A recruiter who does not own the attempt is rejected.
    enter.reset_mock()
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.db", db_routing({"attempts": query(data={"recruiter_id": "other"})})), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_join("sid-r2", {"attemptId": "attempt-1"})
    assert last_error(emit) == "Unauthorized attempt room join"
    enter.assert_not_awaited()

    # A DB failure while checking ownership fails closed.
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.db", raising_db()), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_join("sid-r3", {"attemptId": "attempt-1"})
    assert last_error(emit) == "Database error validating attempt"
    enter.assert_not_awaited()

    # Admins can join any attempt room (no ownership query).
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value={"id": "admin-1", "role": "admin"})):
        await on_proctor_join("sid-a", {"attemptId": "attempt-1"})
    enter.assert_awaited_once_with("sid-a", "attempt:attempt-1")


@pytest.mark.asyncio
async def test_proctor_leave_invalid_payload_and_error_swallowing():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_leave("sid-1", {"attemptId": ""})
        assert "Invalid payload" in last_error(emit)

    # KeyError from a race-y session store is swallowed.
    with patch.object(ws.sio, "leave_room", AsyncMock()), \
         patch.object(ws.sio, "session", session_factory(error=KeyError("gone"))):
        await on_proctor_leave("sid-2", {"attemptId": "attempt-1"})

    # Any other leave-room failure is logged and swallowed too.
    with patch.object(ws.sio, "leave_room", AsyncMock(side_effect=RuntimeError("boom"))):
        await on_proctor_leave("sid-3", {"attemptId": "attempt-1"})


# ---------------------------------------------------------------------------
# proctor:monitor / proctor:unmonitor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_proctor_monitor_payload_and_auth_guards():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_monitor("sid-1", {"examId": ""})
        assert "Invalid payload" in last_error(emit)

    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=None)):
        await on_proctor_monitor("sid-2", {"examId": "exam-1"})
        assert last_error(emit) == "Authentication required"

    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value={"id": "tpo-1", "role": "tpo"})):
        await on_proctor_monitor("sid-3", {"examId": "exam-1"})
        assert last_error(emit) == "Unauthorized monitor room join"


@pytest.mark.asyncio
async def test_proctor_monitor_recruiter_ownership_and_db_errors():
    emit = AsyncMock()
    enter = AsyncMock()
    db = db_routing({"exams": query(data={"created_by": RECRUITER["id"]})})
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_proctor_monitor("sid-r", {"examId": "exam-1"})
    enter.assert_awaited_once_with("sid-r", "monitor:exam-1")
    emit.assert_not_awaited()

    db = db_routing({"exams": query(data={"created_by": "other"})})
    with patch.object(ws.sio, "emit", emit), \
         patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_proctor_monitor("sid-r2", {"examId": "exam-1"})
    assert last_error(emit) == "Unauthorized monitor room join"

    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", raising_db()):
        await on_proctor_monitor("sid-r3", {"examId": "exam-1"})
    assert last_error(emit) == "Database error validating exam"


@pytest.mark.asyncio
async def test_proctor_monitor_admin_enters_without_ownership_check():
    enter = AsyncMock()
    with patch.object(ws.sio, "enter_room", enter), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=ADMIN)):
        await on_proctor_monitor("sid-a", {"examId": "exam-9"})
    enter.assert_awaited_once_with("sid-a", "monitor:exam-9")


@pytest.mark.asyncio
async def test_proctor_unmonitor_invalid_payload_and_error_swallowing():
    emit = AsyncMock()
    leave = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_unmonitor("sid-1", {"examId": ""})
        assert "Invalid payload" in last_error(emit)

    with patch.object(ws.sio, "leave_room", leave):
        await on_proctor_unmonitor("sid-2", {"examId": "exam-9"})
    leave.assert_awaited_once_with("sid-2", "monitor:exam-9")

    with patch.object(ws.sio, "leave_room", AsyncMock(side_effect=RuntimeError("boom"))):
        await on_proctor_unmonitor("sid-3", {"examId": "exam-9"})  # must not raise


@pytest.mark.asyncio
async def test_admin_leave_swallows_leave_room_errors():
    with patch.object(ws.sio, "leave_room", AsyncMock(side_effect=RuntimeError("boom"))):
        await on_admin_leave("sid-a")  # must not raise


# ---------------------------------------------------------------------------
# proctor:snapshot
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_snapshot_rejects_invalid_payload_and_ignores_anonymous():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_snapshot("sid-1", {"examId": "exam-1"})
        assert "Invalid payload" in last_error(emit)
        emit.reset_mock()

        with patch("app.websocket.get_session_user", new=AsyncMock(return_value=None)):
            await on_proctor_snapshot("sid-2", SNAPSHOT)
        emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_snapshot_candidate_cached_attempt_broadcasts_without_db():
    emit = AsyncMock()
    db = MagicMock()
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "attempt-1"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_snapshot("sid-c", SNAPSHOT)

    args, kwargs = emit.await_args
    assert args[0] == "proctor:snapshot"
    assert args[1] == {
        "attemptId": "attempt-1",
        "snapshotData": "frame-bytes",
        "timestamp": "2026-01-01T10:00:00Z",
    }
    assert kwargs == {"room": "monitor:exam-1", "skip_sid": "sid-c"}
    db.from_.assert_not_called()


@pytest.mark.asyncio
async def test_snapshot_candidate_stale_cache_revalidates_ownership():
    store = {"attempt_id": "stale-attempt"}
    emit = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": CANDIDATE["id"]})})
    with patch.object(ws.sio, "session", session_factory(store)), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_snapshot("sid-c", SNAPSHOT)

    assert store["attempt_id"] == "attempt-1"
    assert emit.await_args.args[0] == "proctor:snapshot"


@pytest.mark.asyncio
async def test_snapshot_candidate_denied_and_db_error_paths():
    emit = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": "someone-else"})})
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "stale"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_snapshot("sid-c", SNAPSHOT)
    assert last_error(emit) == "Unauthorized attempt snapshot emission"

    emit.reset_mock()
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "stale"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", raising_db()):
        await on_proctor_snapshot("sid-c", SNAPSHOT)
    emit.assert_not_awaited()

    emit.reset_mock()
    with patch.object(ws.sio, "session", session_factory(error=KeyError("gone"))), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)):
        await on_proctor_snapshot("sid-c", SNAPSHOT)
    emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_snapshot_recruiter_requires_exam_ownership():
    emit = AsyncMock()
    owner_db = db_routing({"exams": query(data={"created_by": RECRUITER["id"]})})
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.db", owner_db), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_snapshot("sid-r", SNAPSHOT)

    assert emit.await_args.args[0] == "proctor:snapshot"
    assert emit.await_args.kwargs["skip_sid"] == "sid-r"

    # A recruiter who does not own the exam cannot broadcast into its monitor room.
    emit.reset_mock()
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.db", db_routing({"exams": query(data={"created_by": "other"})})), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_snapshot("sid-r", SNAPSHOT)
    assert last_error(emit) == "Unauthorized snapshot emission"

    # A DB failure while checking ownership fails closed (no broadcast, no error leak).
    emit.reset_mock()
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.db", raising_db()), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)):
        await on_proctor_snapshot("sid-r", SNAPSHOT)
    emit.assert_not_awaited()


# ---------------------------------------------------------------------------
# proctor:violation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_violation_invalid_payload_and_anonymous_ignored():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_proctor_violation("sid-1", {**VIOLATION, "violationCount": -1})
        assert "Invalid payload" in last_error(emit)
        emit.reset_mock()

        with patch("app.websocket.get_session_user", new=AsyncMock(return_value=None)):
            await on_proctor_violation("sid-2", VIOLATION)
        emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_violation_cached_attempt_broadcasts_and_alerts_admin():
    emit = AsyncMock()
    db = db_routing({
        "attempts": query(data={"candidate_id": CANDIDATE["id"]}),
        "exams": query(data={"title": "Midterm"}),
        "users": query(data={"name": "Asha"}),
    })
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "attempt-1"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_violation("sid-c", VIOLATION)

    broadcast, alert = emit.await_args_list
    assert broadcast.args[0] == "proctor:violation"
    assert broadcast.kwargs == {"room": "monitor:exam-1"}
    assert broadcast.args[1]["message"] == "copy paste"  # sanitized
    assert broadcast.args[1]["violationCount"] == 2

    assert alert.args[0] == "admin:proctor_violation"
    assert alert.kwargs == {"room": "admin"}
    assert alert.args[1]["candidateName"] == "Asha"
    assert alert.args[1]["examTitle"] == "Midterm"
    assert alert.args[1]["message"] == "copy paste"


@pytest.mark.asyncio
async def test_violation_stale_cache_revalidates_ownership():
    store = {"attempt_id": "stale"}
    emit = AsyncMock()
    db = db_routing({
        "attempts": query(data={"candidate_id": CANDIDATE["id"]}),
        "exams": query(data={"title": "Midterm"}),
        "users": query(data={"name": "Asha"}),
    })
    with patch.object(ws.sio, "session", session_factory(store)), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_violation("sid-c", VIOLATION)

    assert store["attempt_id"] == "attempt-1"
    assert emit.await_args_list[0].args[0] == "proctor:violation"


@pytest.mark.asyncio
async def test_violation_candidate_denied_and_error_paths():
    emit = AsyncMock()
    db = db_routing({"attempts": query(data={"candidate_id": "someone-else"})})
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "stale"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_violation("sid-c", VIOLATION)
    assert last_error(emit) == "Unauthorized attempt violation emission"
    assert emit.await_count == 1

    emit.reset_mock()
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "stale"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", raising_db()):
        await on_proctor_violation("sid-c", VIOLATION)
    emit.assert_not_awaited()

    emit.reset_mock()
    with patch.object(ws.sio, "session", session_factory(error=KeyError("gone"))), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)):
        await on_proctor_violation("sid-c", VIOLATION)
    emit.assert_not_awaited()


@pytest.mark.asyncio
async def test_violation_admin_alert_failure_still_broadcasts():
    emit = AsyncMock()
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "attempt-1"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", raising_db()):
        await on_proctor_violation("sid-c", VIOLATION)

    assert emit.await_count == 1
    assert emit.await_args.args[0] == "proctor:violation"


@pytest.mark.asyncio
async def test_violation_admin_alert_name_fallbacks():
    emit = AsyncMock()
    db = db_routing({
        "attempts": query(data=None),
        "exams": query(data=None),
        "users": query(data=None),
    })
    with patch.object(ws.sio, "session", session_factory({"attempt_id": "attempt-1"})), \
         patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)), \
         patch("app.websocket.db", db):
        await on_proctor_violation("sid-c", VIOLATION)

    alert = emit.await_args_list[1]
    assert alert.args[1]["candidateName"] == "Candidate"
    assert alert.args[1]["examTitle"] == "Exam"


@pytest.mark.asyncio
async def test_violation_recruiter_requires_exam_ownership():
    emit = AsyncMock()
    db = db_routing({
        "attempts": query(data={"candidate_id": CANDIDATE["id"]}),
        "exams": query(data={"created_by": RECRUITER["id"], "title": "Midterm"}),
        "users": query(data={"name": "Asha"}),
    })
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_proctor_violation("sid-r", VIOLATION)

    assert [c.args[0] for c in emit.await_args_list] == [
        "proctor:violation", "admin:proctor_violation",
    ]

    # A recruiter who does not own the exam cannot broadcast or alert admins.
    emit.reset_mock()
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db_routing({"exams": query(data={"created_by": "other"})})):
        await on_proctor_violation("sid-r", VIOLATION)
    assert last_error(emit) == "Unauthorized violation emission"
    assert emit.await_count == 1


# ---------------------------------------------------------------------------
# proctor:recruiter-action
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recruiter_action_invalid_payload_and_role_guard():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await on_recruiter_action("sid-1", {"attemptId": "attempt-1", "action": "kick"})
        assert "Invalid payload" in last_error(emit)

    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=CANDIDATE)):
        await on_recruiter_action("sid-2", {"attemptId": "attempt-1", "action": "warn"})
        assert last_error(emit) == "Unauthorized: recruiter/admin only"


@pytest.mark.asyncio
async def test_recruiter_action_lookup_failures():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", raising_db()):
        await on_recruiter_action("sid-1", {"attemptId": "attempt-1", "action": "warn"})
    assert last_error(emit) == "Database error validating attempt"

    db = db_routing({"attempts": query(data=None)})
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_recruiter_action("sid-2", {"attemptId": "ghost", "action": "warn"})
    assert last_error(emit) == "Attempt not found"

    db = db_routing({"attempts": query(data={**ATTEMPT_ROW, "recruiter_id": "other"})})
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_recruiter_action("sid-3", {"attemptId": "attempt-1", "action": "warn"})
    assert last_error(emit) == "Unauthorized: not your attempt"


@pytest.mark.asyncio
async def test_recruiter_action_emits_and_audits_snapshot():
    emit = AsyncMock()
    attempt_q, insert_q = query(data=ATTEMPT_ROW), query(data=[])
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", sequence_db(attempt_q, insert_q)):
        await on_recruiter_action(
            "sid-r",
            {"attemptId": "attempt-1", "action": "warn", "message": "<i>focus</i> please"},
        )

    args, kwargs = emit.await_args
    assert args[0] == "proctor:recruiter-action"
    assert kwargs == {"room": "attempt:attempt-1"}
    assert args[1]["action"] == "warn"
    assert args[1]["message"] == "focus please"
    assert args[1]["recruiterName"] == "Rex"

    payload = insert_q.insert.call_args[0][0]
    assert payload["attempt_id"] == "attempt-1"
    assert payload["exam_id"] == "exam-1"
    assert payload["candidate_id"] == CANDIDATE["id"]
    assert payload["event_type"] == "violation"
    assert payload["violation_severity"] == "medium"
    assert payload["message"] == "Recruiter action: warn - focus please"


@pytest.mark.asyncio
async def test_recruiter_action_admin_disqualify_uses_high_severity():
    emit = AsyncMock()
    attempt_q, insert_q = query(data={**ATTEMPT_ROW, "recruiter_id": "other"}), query(data=[])
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=ADMIN)), \
         patch("app.websocket.db", sequence_db(attempt_q, insert_q)):
        await on_recruiter_action("sid-a", {"attemptId": "attempt-1", "action": "disqualify"})

    assert emit.await_args.args[1]["recruiterName"] == "Ada"
    assert insert_q.insert.call_args[0][0]["violation_severity"] == "high"


@pytest.mark.asyncio
async def test_recruiter_action_survives_audit_insert_failure():
    emit = AsyncMock()
    bad_insert = MagicMock()  # insert(...) returns a non-awaitable
    db = MagicMock()
    db.from_.side_effect = lambda table: query(data=ATTEMPT_ROW) if table == "attempts" else bad_insert
    with patch.object(ws.sio, "emit", emit), \
         patch("app.websocket.get_session_user", new=AsyncMock(return_value=RECRUITER)), \
         patch("app.websocket.db", db):
        await on_recruiter_action("sid-r", {"attemptId": "attempt-1", "action": "pause"})

    assert emit.await_args.args[0] == "proctor:recruiter-action"


# ---------------------------------------------------------------------------
# realtime notification helper
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_realtime_notification_targets_user_room():
    emit = AsyncMock()
    with patch.object(ws.sio, "emit", emit):
        await send_realtime_notification("user-9", {"type": "exam_assigned"})
    emit.assert_awaited_once_with("notification", {"type": "exam_assigned"}, room="user:user-9")
