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
