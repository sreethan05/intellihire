"""Endpoint tests for app.routers.admin_analytics.

The dashboard endpoint uses raw psycopg via ``get_connection``; the
``fake_connection`` harness replays one result set per ``execute()``. The
growth/activity endpoints use the db builder and are exercised with the shared
db mocks. Failure-surfacing tests assert the ``degraded`` response field and
the stable log event names emitted instead of silent swallowing.
"""
import datetime
import logging

import pytest
from unittest.mock import MagicMock, patch

from app.db import QueryError
from app.routers.admin_analytics import (
    get_dashboard,
    get_platform_growth,
    get_real_time_activity,
    get_system_health,
    get_system_readiness,
    get_month_key,
    get_week_key,
    infer_violation_type,
)
from tests.db_mocks import db_routing, fake_connection, query, sequence_db

ADMIN = {"id": "admin-1", "role": "admin"}
NOW = datetime.datetime.now(datetime.timezone.utc)

ANALYTICS_LOGGER = "app.routers.admin_analytics"


def _log_messages(caplog, logger_name=ANALYTICS_LOGGER):
    return [r.getMessage() for r in caplog.records if r.name == logger_name]


def _dashboard_fixtures():
    created = datetime.datetime(2026, 1, 1, 10, 0, tzinfo=datetime.timezone.utc)
    return [
        [{"count": 1}],   # recruiter count
        [{"count": 3}],   # candidate count
        [{"id": "r1", "name": "Rec", "email": "r@x.com", "created_at": created}],  # recruiters
        [{"id": "t1", "name": "TPO", "email": "t@x.com", "college_id": "col-1", "created_at": created}],  # tpos
        [{"id": "col-1", "name": "College", "code": "C1"}],  # colleges
        [{"id": "c1", "created_by": "r1"}, {"id": "c2", "created_by": "r1"}, {"id": "c3", "created_by": None}],  # candidates
        [{"id": "p1", "college_id": "col-1", "branch": "CSE", "cgpa": 8.0,
          "profile_complete": True, "documents_verified": True,
          "college_name": "College", "college_code": "C1"}],  # profiles
        [{"id": "d1", "title": "SDE Day", "company_name": "Acme", "college_id": "col-1",
          "status": "active", "drive_date": None, "exam_id": None}],  # jobs
        [{"id": "e1", "title": "Qualifier", "created_by": "r1", "total_marks": 100,
          "pass_marks": 40, "created_at": created, "available_from": None,
          "available_until": None}],  # exams
        [{"id": "a1", "recruiter_id": "r1", "candidate_id": "c1", "exam_id": "e1",
          "status": "completed", "score": 80, "started_at": created, "submitted_at": created,
          "candidate_name": "Asha", "candidate_email": "a@x.com",
          "exam_title": "Qualifier", "total_marks": 100, "pass_marks": 40}],  # attempts
    ]


@pytest.mark.asyncio
async def test_admin_dashboard_aggregates_stats_and_leaderboard():
    with patch("app.routers.admin_analytics.get_connection",
               new=lambda: fake_connection(_dashboard_fixtures())):
        result = await get_dashboard(user=ADMIN)

    stats = result["stats"]
    assert stats["recruiters"] == 1
    assert stats["candidates"] == 3
    assert stats["colleges"] == 1
    assert stats["drives"] == 1
    assert stats["attempts"] == 1
    assert stats["completedAttempts"] == 1
    assert stats["averageScore"] == 80.0
    assert stats["completionRate"] == 100.0
    assert stats["passRate"] == 100.0

    assert result["resultSummary"] == {"pass": 1, "fail": 0, "inProgress": 0}
    assert result["recruiterSnapshots"][0]["candidateCount"] == 2
    assert result["recentExams"][0]["status"] == "Completed"
    assert result["leaderboard"][0]["averagePercentage"] == 80.0
    assert result["collegeAnalytics"][0]["students"] == 1
    assert result["branchAnalytics"][0]["label"] == "CSE"
    assert result["recentAttempts"][0]["users"]["name"] == "Asha"


@pytest.mark.asyncio
async def test_admin_dashboard_handles_empty_platform():
    fixtures = [[{"count": 0}], [{"count": 0}]] + [[], [], [], [], [], [], [], []]
    with patch("app.routers.admin_analytics.get_connection",
               new=lambda: fake_connection(fixtures)):
        result = await get_dashboard(user=ADMIN)
    assert result["stats"]["averageScore"] == 0.0
    assert result["stats"]["completionRate"] == 0.0
    assert result["leaderboard"] == []
    assert result["recentExams"] == []
    assert result["resultSummary"] == {"pass": 0, "fail": 0, "inProgress": 0}


def test_week_and_month_keys():
    assert get_week_key(datetime.date(2026, 1, 5)) == "2026-W02"
    assert get_month_key(datetime.date(2026, 1, 5)) == "2026-01"


def test_infer_violation_type_classification():
    assert infer_violation_type(None, "snapshot") == "snapshot"
    assert infer_violation_type("Tab switch detected", "violation") == "tab_switch"
    assert infer_violation_type("Face not detected", "violation") == "face_missing"
    assert infer_violation_type("Camera blocked", "violation") == "camera_offline"
    assert infer_violation_type("something", "violation") == "violation"


@pytest.mark.asyncio
async def test_platform_growth_buckets_by_week_and_month():
    recent = (NOW - datetime.timedelta(days=5)).isoformat()
    ancient = "2020-01-01T00:00:00Z"
    mock_db = db_routing({
        "users": query(data=[
            {"id": "u1", "role": "candidate", "created_at": recent},
            {"id": "u2", "role": "recruiter", "created_at": "not-a-date"},
        ]),
        "exams": query(data=[{"id": "e1", "created_at": recent}, {"id": "e2", "created_at": ancient}]),
        "attempts": query(data=[
            {"id": "a1", "status": "completed", "submitted_at": recent, "started_at": recent},
            {"id": "a2", "status": "in_progress", "submitted_at": None, "started_at": recent},
        ]),
        "jobs": query(data=[{"id": "d1", "created_at": recent}]),
        "ai_interviews": query(data=[
            {"id": "i1", "status": "completed", "submitted_at": recent},
            {"id": "i2", "status": "scheduled", "submitted_at": None},
        ]),
    })
    with patch("app.routers.admin_analytics.db", mock_db):
        result = await get_platform_growth(user=ADMIN)

    assert result["totals"] == {
        "totalUsers": 2, "totalCandidates": 1, "totalExams": 2,
        "totalAttempts": 2, "totalDrives": 1, "totalInterviews": 2,
    }
    assert len(result["weekly"]) == 12
    assert len(result["monthly"]) == 12
    # Only the single valid recent timestamp lands in the current bucket.
    assert sum(w["newUsers"] for w in result["weekly"]) == 1
    assert sum(w["attemptsCompleted"] for w in result["weekly"]) == 1
    assert sum(m["interviewsCompleted"] for m in result["monthly"]) == 1
    # Ancient exam is outside the 12-week window.
    assert sum(w["examsCreated"] for w in result["weekly"]) == 1
    assert sum(m["examsCreated"] for m in result["monthly"]) == 1
    # The unparsable "not-a-date" user row is surfaced, not silently dropped.
    assert result["degraded"] == ["users"]


@pytest.mark.asyncio
async def test_platform_growth_surfaces_degraded_sources(caplog):
    """A failed query response and an unparsable timestamp are reported via
    the ``degraded`` field plus stable log events; other sources stay intact."""
    mock_db = db_routing({
        "users": query(data=None, error=QueryError("permission denied")),
        "exams": query(data=[{"id": "e1", "created_at": "garbage"}]),
        "attempts": query(data=[]),
        "jobs": query(data=[]),
        "ai_interviews": query(data=[]),
    })
    with patch("app.routers.admin_analytics.db", mock_db), \
         caplog.at_level(logging.WARNING, logger=ANALYTICS_LOGGER):
        result = await get_platform_growth(user=ADMIN)

    assert result["totals"]["totalUsers"] == 0  # degraded, not fabricated
    assert result["totals"]["totalAttempts"] == 0
    assert result["degraded"] == ["exams", "users"]
    assert len(result["weekly"]) == 12  # bucket skeleton is still returned
    messages = _log_messages(caplog)
    assert any("platform_growth.source_failed section=users" in m for m in messages)
    assert any(
        "platform_growth.bucket_parse_failed source=exams entity_id=e1" in m
        for m in messages
    )


@pytest.mark.asyncio
async def test_system_health_counts_stuck_attempts():
    stuck = {
        "id": "a1",
        "status": "in_progress",
        "started_at": (NOW - datetime.timedelta(hours=25)).isoformat(),
    }
    very_stuck = {
        "id": "a2",
        "status": "in_progress",
        "started_at": (NOW - datetime.timedelta(hours=50)).isoformat(),
    }
    healthy = {
        "id": "a3",
        "status": "in_progress",
        "started_at": (NOW - datetime.timedelta(hours=1)).isoformat(),
    }
    mock_db = sequence_db(
        query(data=[stuck, very_stuck, healthy]),
        query(data=[{"id": "a4"}]),
    )
    with patch("app.routers.admin_analytics.db", mock_db):
        result = await get_system_health(user=ADMIN)
    assert result["grading"]["pendingJobs"] == 2
    assert result["grading"]["failed24h"] == 1
    assert result["grading"]["last24hCompleted"] == 1
    assert set(result["apis"]) == {"judge0", "groq"}


@pytest.mark.asyncio
async def test_system_health_logs_unparsable_started_at(caplog):
    """An unparsable started_at keeps the attempt uncounted but is logged with
    the attempt id instead of being silently dropped."""
    broken = {
        "id": "a9",
        "status": "in_progress",
        "started_at": "not-a-date",
    }
    mock_db = sequence_db(
        query(data=[broken]),
        query(data=[]),
    )
    with patch("app.routers.admin_analytics.db", mock_db), \
         caplog.at_level(logging.WARNING, logger=ANALYTICS_LOGGER):
        result = await get_system_health(user=ADMIN)

    assert result["grading"]["pendingJobs"] == 0
    messages = _log_messages(caplog)
    assert any(
        "system_health.started_at_parse_failed attempt_id=a9" in m for m in messages
    )


@pytest.mark.asyncio
async def test_real_time_activity_envelope():
    mock_db = sequence_db(
        query(data=[{"id": "a1"}, {"id": "a2"}]),   # live attempts
        query(data=[{                                # recent completed attempts
            "id": "a3", "candidate_id": "c1", "score": 90, "submitted_at": NOW.isoformat(),
            "exams": {"title": "Qualifier"}, "users": {"name": "Asha"},
        }]),
        query(data=[{                                # recent proctoring events
            "id": "ev1", "candidate_id": "c1", "event_type": "violation",
            "message": "Tab switch", "captured_at": NOW.isoformat(),
            "violation_count": 2, "users": {"name": "Asha"},
        }]),
        query(data=[{"started_at": NOW.isoformat(), "status": "in_progress"}]),  # today's attempts
        query(data=[                                # suspicious 24h
            {"event_type": "violation", "message": "Face not detected", "violation_count": 3},
            {"event_type": "snapshot", "message": None, "violation_count": 1},
            {"event_type": "violation", "message": "Camera blocked", "violation_count": 0},
            {"event_type": "violation", "message": "unknown text", "violation_count": 2},
        ]),
    )
    with patch("app.routers.admin_analytics.db", mock_db):
        result = await get_real_time_activity(user=ADMIN)

    assert result["liveAttempts"] == 2
    assert result["recentSubmissions"][0]["candidateName"] == "Asha"
    assert result["recentProctoringEvents"][0]["eventType"] == "tab_switch"
    assert len(result["activeMonitoring"]) == 24
    hour = NOW.hour
    label = f"{hour % 12 or 12}{'am' if hour < 12 else 'pm'}"
    current = next(row for row in result["activeMonitoring"] if row["hour"] == label)
    assert current["activeCandidates"] == 1
    assert result["suspiciousActivity"] == {
        "totalFlags": 6, "tabSwitches": 0, "faceMissing": 1, "cameraOffline": 1,
    }


@pytest.mark.asyncio
async def test_system_readiness_reports_dependencies():
    redis_stub = MagicMock()
    redis_stub.ping.return_value = True
    with patch("app.routers.admin_analytics.get_connection",
               new=lambda: fake_connection([[{"count": 2}], [{"count": 150}], [{"count": 3}]])), \
         patch("app.utils.redis_client", redis_stub), \
         patch("app.config.JUDGE0_API_URL", ""), \
         patch("app.config.SMTP_HOST", "smtp.example.com"), \
         patch("app.config.GROQ_API_KEY", "test-key"):
        result = await get_system_readiness(user=ADMIN)

    assert result["checks"]["postgres"] == {"status": "healthy"}
    assert result["checks"]["redis"] == {"status": "healthy"}
    assert result["checks"]["active_exams"] == {"status": "healthy", "count": 2}
    assert result["checks"]["total_candidates"] == {"status": "healthy", "count": 150}
    assert result["checks"]["grading_queue"] == {"status": "healthy", "count": 3}
    assert result["checks"]["judge0"]["status"] == "not_configured"
    assert result["checks"]["smtp"] == {"status": "configured", "host": "smtp.example.com"}
    assert result["checks"]["groq"] == {"status": "configured"}
    assert result["overall"] == "degraded"
    # Happy path: no synthetic failure entry is injected.
    assert "platform_counts" not in result["checks"]


@pytest.mark.asyncio
async def test_system_readiness_surfaces_count_failure(caplog):
    """When the platform-count queries fail, readiness must report the failed
    check and log it instead of pretending the counts are fine."""
    from contextlib import contextmanager

    @contextmanager
    def failing_connection():
        raise RuntimeError("pool exhausted")
        yield  # pragma: no cover

    redis_stub = MagicMock()
    redis_stub.ping.return_value = True
    with patch("app.routers.admin_analytics.get_connection", new=failing_connection), \
         patch("app.utils.redis_client", redis_stub), \
         patch("app.config.JUDGE0_API_URL", ""), \
         patch("app.config.SMTP_HOST", ""), \
         patch("app.config.GROQ_API_KEY", ""), \
         caplog.at_level(logging.ERROR, logger=ANALYTICS_LOGGER):
        result = await get_system_readiness(user=ADMIN)

    assert result["checks"]["postgres"]["status"] == "unhealthy"
    assert result["checks"]["platform_counts"] == {"status": "degraded", "error": "pool exhausted"}
    assert result["overall"] == "degraded"
    assert any("system_readiness.counts_failed" in m for m in _log_messages(caplog))
