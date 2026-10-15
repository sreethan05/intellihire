import pytest
from pydantic import ValidationError

from app.proctoring import ProctoringEventRequest


def test_proctoring_event_rejects_privileged_event_types():
    with pytest.raises(ValidationError):
        ProctoringEventRequest(
            attempt_id="attempt-1",
            exam_id="exam-1",
            event_type="admin_override",
        )


def test_proctoring_event_limits_snapshot_size():
    with pytest.raises(ValidationError):
        ProctoringEventRequest(
            attempt_id="attempt-1",
            exam_id="exam-1",
            event_type="snapshot",
            snapshot_data="x" * 1_500_001,
        )


def test_proctoring_event_typing_speed_bounds():
    with pytest.raises(ValidationError):
        ProctoringEventRequest(
            attempt_id="attempt-1",
            exam_id="exam-1",
            event_type="violation",
            typing_speed_wpm=600,
        )


def test_sanitize_message():
    from app.proctoring import _sanitize_message
    assert _sanitize_message("<script>alert('xss')</script>Hello") == "alert('xss')Hello"
    assert _sanitize_message("<b>OVERRIDE_UNLOCK</b>") == "OVERRIDE_UNLOCK"
    assert _sanitize_message(None) is None


def test_severity_for_event():
    from app.proctoring import _severity_for_event
    assert _severity_for_event("snapshot", 0) == "low"
    assert _severity_for_event("camera_check", 0) == "low"
    assert _severity_for_event("violation", 1) == "medium"
    assert _severity_for_event("violation", 2) == "high"
    assert _severity_for_event("violation", 3) == "critical"
    assert _severity_for_event("violation", 5) == "critical"
    assert _severity_for_event("violation", 1, explicit="critical") == "critical"


def test_relative_time():
    from app.proctoring import _relative_time
    start = "2026-10-15T10:00:00Z"
    captured = "2026-10-15T10:05:30Z"
    assert _relative_time(start, captured) == "05:30"
    assert _relative_time(None, captured) == "00:00"
    assert _relative_time("invalid", "invalid") == "00:00"
