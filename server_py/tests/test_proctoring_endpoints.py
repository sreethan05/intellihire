"""Endpoint-level tests for app.proctoring.

Focus: attempt-access scoping, violation escalation, lock/unlock computation
and the recruiter override paths. The security-relevant branches mirror the
server-side checks the UI relies on.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.proctoring import (
    OverrideSnapshotRequest,
    ProctoringEventRequest,
    get_active_monitoring,
    get_attempt_events,
    get_attempt_timeline,
    get_exam_summary,
    override_attempt,
    override_snapshot,
)
from app.proctoring import log_event as _decorated_log_event
from tests.db_mocks import db_routing, query, sequence_db

# slowapi wraps the endpoint with the rate limiter; unit-test the raw body.
log_event = getattr(_decorated_log_event, "__wrapped__", _decorated_log_event)

CANDIDATE = {"id": "user-1", "role": "candidate"}
RECRUITER = {"id": "recruiter-1", "role": "recruiter"}

ATTEMPT = {
    "id": "attempt-1",
    "candidate_id": "user-1",
    "recruiter_id": "recruiter-1",
    "exam_id": "exam-1",
    "started_at": "2026-01-01T10:00:00+00:00",
    "status": "in_progress",
}


def _event(**overrides):
    event = {
        "id": "ev-1",
        "attempt_id": "attempt-1",
        "event_type": "violation",
        "violation_count": 1,
        "violation_severity": "medium",
        "message": "tab switch",
        "captured_at": "2026-01-01T10:01:30+00:00",
    }
    event.update(overrides)
    return event


# ---------------------------------------------------------------------------
# log_event
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_log_event_rejects_non_candidate_roles():
    with pytest.raises(HTTPException) as exc:
        await log_event(
            MagicMock(),
            ProctoringEventRequest(attempt_id="attempt-1", exam_id="exam-1", event_type="violation"),
            user=RECRUITER,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_log_event_scopes_attempt_to_candidate():
    mock_db = db_routing({"attempts": query(data={**ATTEMPT, "candidate_id": "someone-else"})})
    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await log_event(
                MagicMock(),
                ProctoringEventRequest(attempt_id="attempt-1", exam_id="exam-1", event_type="violation"),
                user=CANDIDATE,
            )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_log_event_rejects_exam_mismatch_and_reserved_message():
    mock_db = db_routing({"attempts": query(data=ATTEMPT)})
    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await log_event(
                MagicMock(),
                ProctoringEventRequest(attempt_id="attempt-1", exam_id="other-exam", event_type="violation"),
                user=CANDIDATE,
            )
    assert exc.value.status_code == 400

    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await log_event(
                MagicMock(),
                ProctoringEventRequest(
                    attempt_id="attempt-1", exam_id="exam-1", event_type="violation",
                    message="<b>OVERRIDE_UNLOCK</b>",
                ),
                user=CANDIDATE,
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_log_event_escalates_violation_severity_from_window_count():
    stored = _event(violation_count=2, violation_severity="high")
    chains = [
        query(data=ATTEMPT),                     # attempt access
        query(data=[{"id": "prior"}], count=1),  # prior violations in window
        query(data=stored),                      # insert
    ]
    with patch("app.proctoring.db", sequence_db(*chains)):
        result = await log_event(
            MagicMock(),
            ProctoringEventRequest(
                attempt_id="attempt-1", exam_id="exam-1", event_type="violation",
                message="<i>copy</i> paste",
            ),
            user=CANDIDATE,
        )
    assert result["event"]["violation_severity"] == "high"

    insert_payload = chains[2].insert.call_args[0][0]
    assert insert_payload["violation_count"] == 2
    assert insert_payload["message"] == "copy paste"  # sanitized


@pytest.mark.asyncio
async def test_log_event_non_violation_skips_count_query():
    stored = _event(event_type="snapshot", violation_count=0, violation_severity="low", message=None)
    mock_db = sequence_db(
        query(data=ATTEMPT),
        query(data=stored),
    )
    with patch("app.proctoring.db", mock_db):
        result = await log_event(
            MagicMock(),
            ProctoringEventRequest(attempt_id="attempt-1", exam_id="exam-1", event_type="snapshot"),
            user=CANDIDATE,
        )
    assert result["event"]["event_type"] == "snapshot"


# ---------------------------------------------------------------------------
# read endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_attempt_events_envelope():
    mock_db = db_routing({
        "attempts": query(data=ATTEMPT),
        "proctoring_snapshots": query(data=[_event()]),
    })
    with patch("app.proctoring.db", mock_db):
        result = await get_attempt_events("attempt-1", user=CANDIDATE)
    assert result == {"events": [_event()]}


@pytest.mark.asyncio
async def test_get_attempt_timeline_adds_relative_time():
    late = _event(id="ev-2", captured_at="2026-01-01T10:05:30+00:00")
    mock_db = db_routing({
        "attempts": query(data=ATTEMPT),
        "proctoring_snapshots": query(data=[_event(), late]),
    })
    with patch("app.proctoring.db", mock_db):
        result = await get_attempt_timeline("attempt-1", user=CANDIDATE)
    assert [e["relativeTime"] for e in result["timeline"]] == ["01:30", "05:30"]


@pytest.mark.asyncio
async def test_get_attempt_events_404_for_missing_attempt():
    mock_db = db_routing({"attempts": query(data=None)})
    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_attempt_events("missing", user=CANDIDATE)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_exam_summary_aggregates_batch_events():
    attempts = [
        {**ATTEMPT, "users": {"name": "Asha", "email": "a@x.com"}},
        {**ATTEMPT, "id": "attempt-2", "candidate_id": "user-2", "users": None},
    ]
    events = [
        _event(attempt_id="attempt-1", message="tab switch"),
        _event(id="ev-2", attempt_id="attempt-1", event_type="snapshot", message=None),
        _event(id="ev-3", attempt_id="attempt-2", event_type="violation", message="paste"),
    ]
    mock_db = db_routing({
        "attempts": query(data=attempts),
        "proctoring_snapshots": query(data=events),
    })
    with patch("app.proctoring.db", mock_db):
        result = await get_exam_summary("exam-1", collegeId=None, user=RECRUITER)
    summary = {row["attemptId"]: row for row in result["summary"]}
    assert summary["attempt-1"]["snapshots"] == 2
    assert summary["attempt-1"]["violations"] == 1
    assert summary["attempt-1"]["lastViolation"] == "tab switch"
    assert summary["attempt-2"]["candidateName"] == "Candidate"

    # College filter narrows attempts via candidate_profiles.
    mock_db_college = db_routing({
        "attempts": query(data=attempts),
        "candidate_profiles": query(data=[{"user_id": "user-2"}]),
        "proctoring_snapshots": query(data=[]),
    })
    with patch("app.proctoring.db", mock_db_college):
        filtered = await get_exam_summary("exam-1", collegeId="col-1", user=RECRUITER)
    assert [row["attemptId"] for row in filtered["summary"]] == ["attempt-2"]


@pytest.mark.asyncio
async def test_active_monitoring_lock_and_override_state():
    violation = _event(captured_at="2026-01-01T10:05:00+00:00", violation_count=2)
    override = _event(
        id="ev-override", event_type="admin_override", violation_count=0,
        severity=None, captured_at="2026-01-01T10:06:00+00:00",
    )
    attempts = [{**ATTEMPT, "users": {"name": "Asha", "email": "a@x.com"}}]

    # Locked: latest event is a violation with no later override.
    mock_db = db_routing({
        "attempts": query(data=attempts),
        "proctoring_snapshots": query(data=[violation]),
    })
    with patch("app.proctoring.db", mock_db):
        locked = await get_active_monitoring("exam-1", collegeId=None, user=RECRUITER)
    assert locked["attempts"][0]["isLocked"] is True
    assert locked["attempts"][0]["warningCount"] == 2

    # Unlocked: override captured after the violation.
    mock_db = db_routing({
        "attempts": query(data=attempts),
        "proctoring_snapshots": query(data=[override, violation]),
    })
    with patch("app.proctoring.db", mock_db):
        unlocked = await get_active_monitoring("exam-1", collegeId=None, user=RECRUITER)
    assert unlocked["attempts"][0]["isLocked"] is False
    assert unlocked["attempts"][0]["warningCount"] == 0


# ---------------------------------------------------------------------------
# override endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_override_attempt_writes_event_and_audit():
    inserted = _event(event_type="admin_override")
    mock_db = sequence_db(query(data=ATTEMPT), query(data=inserted))
    audit = AsyncMock()
    with patch("app.proctoring.db", mock_db), \
         patch("app.proctoring.record_audit_event", new=audit):
        result = await override_attempt("attempt-1", MagicMock(), user=RECRUITER)
    assert result["success"] is True
    assert audit.await_count == 1


@pytest.mark.asyncio
async def test_override_attempt_forbidden_for_other_recruiter():
    mock_db = db_routing({"attempts": query(data=ATTEMPT)})
    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await override_attempt("attempt-1", MagicMock(), user={"id": "r-other", "role": "recruiter"})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_override_snapshot_validates_severity_and_existence():
    with pytest.raises(HTTPException) as exc:
        await override_snapshot("snap-1", OverrideSnapshotRequest(violation_severity="catastrophic"),
                                MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 400

    mock_db = db_routing({"proctoring_snapshots": query(data=None)})
    with patch("app.proctoring.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await override_snapshot("snap-1", OverrideSnapshotRequest(violation_severity="low"),
                                    MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_override_snapshot_updates_severity():
    snapshot = _event()
    updated = _event(violation_severity="critical")
    mock_db = sequence_db(
        query(data=snapshot),   # snapshot lookup
        query(data=ATTEMPT),    # attempt access
        query(data=updated),    # update
    )
    audit = AsyncMock()
    with patch("app.proctoring.db", mock_db), \
         patch("app.proctoring.record_audit_event", new=audit):
        result = await override_snapshot(
            "ev-1", OverrideSnapshotRequest(violation_severity="critical"), MagicMock(), user=RECRUITER
        )
    assert result["snapshot"]["violation_severity"] == "critical"
