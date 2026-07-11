import pytest
from pydantic import ValidationError
from app.websocket import (
    NotificationsJoinPayload,
    ProctorJoinPayload,
    ProctorMonitorPayload,
    ProctorSnapshotPayload,
    ProctorViolationPayload,
    ProctorLeavePayload
)

def test_notifications_join_payload():
    # Valid
    payload = NotificationsJoinPayload(userId="user-123")
    assert payload.userId == "user-123"

    # Invalid (missing or empty)
    with pytest.raises(ValidationError):
        NotificationsJoinPayload(userId="")

def test_proctor_join_payload():
    # Valid
    payload = ProctorJoinPayload(attemptId="attempt-123")
    assert payload.attemptId == "attempt-123"

    with pytest.raises(ValidationError):
        ProctorJoinPayload(attemptId="")

def test_proctor_monitor_payload():
    # Valid
    payload = ProctorMonitorPayload(examId="exam-123")
    assert payload.examId == "exam-123"

    with pytest.raises(ValidationError):
        ProctorMonitorPayload(examId="")

def test_proctor_snapshot_payload():
    # Valid
    payload = ProctorSnapshotPayload(
        examId="exam-123",
        attemptId="attempt-123",
        snapshotData="data...",
        timestamp="2026-07-11T12:00:00"
    )
    assert payload.examId == "exam-123"

    # Missing fields
    with pytest.raises(ValidationError):
        ProctorSnapshotPayload(examId="exam-123")

def test_proctor_violation_payload():
    # Valid
    payload = ProctorViolationPayload(
        examId="exam-123",
        attemptId="attempt-123",
        violationCount=3,
        message="tab switch",
        timestamp="2026-07-11T12:00:00"
    )
    assert payload.violationCount == 3

    # Negative violationCount
    with pytest.raises(ValidationError):
        ProctorViolationPayload(
            examId="exam-123",
            attemptId="attempt-123",
            violationCount=-1,
            message="tab switch",
            timestamp="2026-07-11T12:00:00"
        )
