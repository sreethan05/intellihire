"""Coverage for ``app.audit.record_audit_event``.

The helper must (a) shape exactly the audit row the DB layer expects,
including the optional ``request_id``, and (b) never let a logging failure
escape to the caller — audit logging is best-effort and must be swallowed.
"""
import pytest
from unittest.mock import MagicMock, patch

from app.audit import record_audit_event
from tests.db_mocks import db_routing, query

DB = "app.audit.db"
LOGGER = "app.audit.logger"


class _ExplodingAwaitable:
    """Awaitable that fails once the audit insert is awaited."""

    def __await__(self):
        raise RuntimeError("insert exploded")
        yield  # pragma: no cover


@pytest.mark.asyncio
async def test_record_audit_event_inserts_shaped_row():
    chain = query(data=[])
    mock_db = db_routing({"audit_logs": chain})
    payload = {"before": {"role": "candidate"}, "after": {"role": "recruiter"}}

    with patch(DB, mock_db):
        await record_audit_event(
            actor_id="user-1",
            action="ROLE_ASSIGNED",
            resource="user",
            resource_id="user-2",
            payload=payload,
            request_id="req-9",
        )

    mock_db.from_.assert_called_once_with("audit_logs")
    chain.insert.assert_called_once()
    row = chain.insert.call_args[0][0]
    assert row == {
        "user_id": "user-1",
        "action": "ROLE_ASSIGNED",
        "resource": "user",
        "resource_id": "user-2",
        "method": "SYSTEM",
        "path": "audit-event",
        "payload": {"before": {"role": "candidate"}, "after": {"role": "recruiter"}},
        "request_id": "req-9",
    }
    assert row["payload"] is not payload  # copied into a plain dict


@pytest.mark.asyncio
async def test_record_audit_event_defaults_payload_and_nulls():
    chain = query(data=[])
    with patch(DB, db_routing({"audit_logs": chain})):
        await record_audit_event(actor_id=None, action="LOGIN", resource="session")

    row = chain.insert.call_args[0][0]
    assert row["user_id"] is None
    assert row["resource_id"] is None
    assert row["payload"] == {}
    assert "request_id" not in row
    assert row["method"] == "SYSTEM"
    assert row["path"] == "audit-event"


@pytest.mark.asyncio
@pytest.mark.parametrize("request_id", [None, "", "req-7"], ids=["none", "empty", "set"])
async def test_record_audit_event_threads_request_id_only_when_truthy(request_id):
    chain = query(data=[])
    with patch(DB, db_routing({"audit_logs": chain})):
        await record_audit_event(
            actor_id="user-1", action="LOGIN", resource="session", request_id=request_id,
        )

    row = chain.insert.call_args[0][0]
    if request_id:
        assert row["request_id"] == request_id
    else:
        assert "request_id" not in row


@pytest.mark.asyncio
async def test_record_audit_event_copies_mapping_payload():
    class _Mapping(dict):
        pass

    payload = _Mapping(source="bulk-import", rows=3)
    chain = query(data=[])
    with patch(DB, db_routing({"audit_logs": chain})):
        await record_audit_event(
            actor_id="tpo-1", action="BULK_IMPORT", resource="batch",
            resource_id="b-1", payload=payload,
        )

    row = chain.insert.call_args[0][0]
    assert row["payload"] == {"source": "bulk-import", "rows": 3}
    assert type(row["payload"]) is dict
    assert row["payload"] is not payload


@pytest.mark.asyncio
async def test_record_audit_event_swallows_db_errors_and_logs():
    mock_db = MagicMock()
    mock_db.from_.side_effect = RuntimeError("pool exhausted")

    with patch(DB, mock_db):
        with patch(LOGGER) as log:
            await record_audit_event(
                actor_id="u-1", action="DELETE", resource="user", resource_id="u-2",
            )

    log.error.assert_called_once()
    message = log.error.call_args[0][0]
    assert "action=DELETE" in message
    assert "resource=user" in message
    assert "pool exhausted" in message


@pytest.mark.asyncio
async def test_record_audit_event_swallows_await_errors_and_logs():
    mock_db = MagicMock()
    mock_db.from_.return_value.insert = MagicMock(return_value=_ExplodingAwaitable())

    with patch(DB, mock_db):
        with patch(LOGGER) as log:
            await record_audit_event(actor_id="u-1", action="EXPORT", resource="report")

    log.error.assert_called_once()
    assert "insert exploded" in log.error.call_args[0][0]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error",
    [RuntimeError("db down"), ValueError("bad value"), KeyError("missing"), OSError("io")],
    ids=["runtime", "value", "key", "os"],
)
async def test_record_audit_event_swallows_any_exception(error):
    mock_db = MagicMock()
    mock_db.from_.side_effect = error

    with patch(DB, mock_db):
        with patch(LOGGER) as log:
            # Must return normally: audit logging can never break the caller.
            assert await record_audit_event(actor_id="u-1", action="X", resource="y") is None

    log.error.assert_called_once()
    assert str(error) in log.error.call_args[0][0]
