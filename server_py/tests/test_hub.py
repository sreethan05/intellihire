"""Endpoint tests for app.hub.

Each role gets a tailored aggregation payload. These tests drive the
role dispatch plus the rich data paths (deadlines, rankings, spotlights) and
the empty-data fallbacks the dashboard renders. They also cover the
failure-surfacing contract: a failing sub-source must not silently look like
empty data — the payload carries a ``degraded`` section list and the failure
is logged with a stable event name.
"""
import datetime
import logging

import pytest
from fastapi import HTTPException

from app.db import QueryError
from app.hub import (
    get_admin_hub_data,
    get_candidate_hub_data,
    get_overview,
    get_recruiter_hub_data,
    get_tpo_hub_data,
)
from tests.db_mocks import db_routing, query, sequence_db

from unittest.mock import MagicMock, patch

NOW = datetime.datetime.now(datetime.timezone.utc)


def _future(hours=3):
    return (NOW + datetime.timedelta(hours=hours)).isoformat()


def _warning_messages(caplog, logger_name="app.hub"):
    return [r.getMessage() for r in caplog.records if r.name == logger_name]


# ---------------------------------------------------------------------------
# Role dispatch
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_overview_rejects_unknown_role():
    with pytest.raises(HTTPException) as exc:
        await get_overview(user={"id": "u1", "role": "alien"})
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Candidate hub
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_candidate_hub_rich_payload():
    profile = {
        "college_id": "col-1", "cgpa": 8.0, "profile_complete": True,
        "resume_url": "r.pdf", "marksheet_url": "m.pdf", "user_id": "user-1",
    }
    attempts = [
        {"id": "att-1", "exam_id": "e1", "score": 80, "status": "completed"},
        {"id": "att-2", "exam_id": "e2", "score": 60, "status": "completed"},
    ]
    mock_db = sequence_db(
        query(data=profile),                                  # 1 profile
        query(data=attempts),                                 # 2 attempts (stats)
        query(data=[{"cgpa": 7.0}, {"cgpa": 9.0}]),           # 3 peers (rank)
        query(data=[{"exam_id": "e3", "exam": {"title": "New Exam", "available_until": _future(2)}}]),  # 4 assignments
        query(data=[{                                          # 5 scheduled interviews
            "id": "iv-1", "job": {"title": "SDE", "company_name": "Acme"},
            "scheduled_start": _future(24),
        }]),
        query(data=[]),                                        # 6 activity feed (empty -> fallback)
        query(data=[{"is_correct": True, "question": {"topic": "dbms"}}]),  # 7 answers
        query(data=[{"communication_score": 8}]),              # 8 completed interviews
        query(data=[{"score": 5, "coding_questions": {"marks": 10}}]),  # 9 coding subs
        query(data=[{"score": 80, "exam": {"title": "Qualifier"}}]),    # 10 trend attempts
        query(data=[{"cgpa": 7.0}, {"cgpa": 9.0}]),            # 11 peers (percentile)
        query(data=[{"status": "shortlisted", "job": {"id": "j1", "title": "SDE", "company_name": "Acme"}}]),  # 12 trackers
    )
    with patch("app.hub.db", mock_db):
        result = await get_candidate_hub_data("user-1")

    assert result["role"] == "candidate"
    assert result["stats"]["completedExams"] == 2
    assert result["stats"]["averageScore"] == "70%"
    assert result["stats"]["rank"] == "2 / 2"
    exam_items = [i for i in result["actionItems"] if i["id"] == "exam_e3"]
    assert exam_items and exam_items[0]["priority"] == "urgent"
    assert result["recentActivity"][0]["title"] == "Placement Passport Activated"
    types = {s["type"] for s in result["upcomingSchedule"]}
    assert types == {"exam", "interview"}
    assert result["insights"]["trendData"] == [{"name": "Qualifier", "score": 80}]
    assert result["insights"]["trackers"][0]["currentStage"] == "shortlisted"
    assert result["insights"]["peerPercentile"] == 50
    # Happy path: every sub-source healthy -> no degraded sections.
    assert result["degraded"] == []


@pytest.mark.asyncio
async def test_candidate_hub_incomplete_profile_short_circuits():
    mock_db = sequence_db(
        query(data=None),   # no profile
        query(data=[]),     # attempts
        query(data=[]),     # assignments
        query(data=[]),     # scheduled interviews
        query(data=[]),     # activity feed
        query(data=[]),     # completed interviews
        query(data=[]),     # attempts trend
        query(data=[]),     # candidate_status
    )
    with patch("app.hub.db", mock_db):
        result = await get_candidate_hub_data("user-1")
    assert result["actionItems"][0]["id"] == "profile_incomplete"
    assert result["insights"]["peerPercentile"] == 0
    assert result["stats"]["completedExams"] == 0
    assert result["degraded"] == []


@pytest.mark.asyncio
async def test_candidate_hub_surfaces_degraded_source(caplog):
    """A sub-source returning an error must not pass as empty data: the
    endpoint still returns the payload with the failed section listed."""
    profile = {"profile_complete": True, "resume_url": "r.pdf", "marksheet_url": "m.pdf"}
    mock_db = sequence_db(
        query(data=profile),                                        # 1 profile (no college -> no peers)
        query(data=[{"id": "att-1", "exam_id": "e1", "score": 90, "status": "completed"}]),  # 2 attempts
        query(data=None, error=QueryError("relation does not exist")),  # 3 assignments FAILS
        query(data=[]),                                             # 4 scheduled interviews
        query(data=[]),                                             # 5 activity feed
        query(data=[]),                                             # 6 answers
        query(data=[]),                                             # 7 completed interviews
        query(data=[]),                                             # 8 coding submissions
        query(data=[{"score": 90, "exam": {"title": "Qualifier"}}]),  # 9 trend attempts
        query(data=[]),                                             # 10 trackers
    )
    with patch("app.hub.db", mock_db), caplog.at_level(logging.WARNING, logger="app.hub"):
        result = await get_candidate_hub_data("user-1")

    assert result["role"] == "candidate"
    assert result["stats"]["completedExams"] == 1
    assert result["insights"]["trendData"] == [{"name": "Qualifier", "score": 90}]
    assert result["degraded"] == ["assignments"]
    messages = _warning_messages(caplog)
    assert any(
        "hub_overview.source_failed section=assignments user_id=user-1" in m
        for m in messages
    )


@pytest.mark.asyncio
async def test_candidate_hub_surfaces_raising_source(caplog):
    """A sub-source that raises (instead of returning an error response) is
    caught and surfaced the same way, instead of a 500 or silent omission."""
    profile = {"profile_complete": True, "resume_url": "r.pdf", "marksheet_url": "m.pdf"}
    mock_db = MagicMock()
    mock_db.from_.side_effect = [
        query(data=profile),            # 1 profile
        RuntimeError("db unavailable"),  # 2 attempts RAISES
        query(data=[]),                 # 3 assignments
        query(data=[]),                 # 4 scheduled interviews
        query(data=[]),                 # 5 activity feed
        query(data=[]),                 # 6 completed interviews
        query(data=[]),                 # 7 trend attempts
        query(data=[]),                 # 8 trackers
    ]
    with patch("app.hub.db", mock_db), caplog.at_level(logging.WARNING, logger="app.hub"):
        result = await get_candidate_hub_data("user-1")

    assert result["role"] == "candidate"
    assert result["stats"]["completedExams"] == 0
    assert result["degraded"] == ["attempts"]
    assert any(
        "hub_overview.source_failed section=attempts user_id=user-1" in m
        for m in _warning_messages(caplog)
    )


@pytest.mark.asyncio
async def test_hub_deadline_parse_failure_is_logged(caplog):
    """An unparsable deadline keeps the existing fallback rendering but is
    logged with the stable event name and the offending exam id."""
    profile = {"profile_complete": True, "resume_url": "r.pdf", "marksheet_url": "m.pdf"}
    mock_db = sequence_db(
        query(data=profile),                        # 1 profile (no college -> no peers)
        query(data=[]),                             # 2 attempts
        query(data=[{"exam_id": "e9", "exam": {"title": "Broken", "available_until": "not-a-date"}}]),  # 3 assignments
        query(data=[]),                             # 4 scheduled interviews
        query(data=[]),                             # 5 activity feed
        query(data=[]),                             # 6 completed interviews
        query(data=[]),                             # 7 trend attempts
        query(data=[]),                             # 8 trackers
    )
    with patch("app.hub.db", mock_db), caplog.at_level(logging.WARNING, logger="app.hub"):
        result = await get_candidate_hub_data("user-1")

    item = next(i for i in result["actionItems"] if i["id"] == "exam_e9")
    assert item["description"] == "Deadline expired."  # success-path behavior unchanged
    assert result["degraded"] == []  # a bad row is not a failed source
    assert any(
        "hub_overview.deadline_parse_failed candidate_id=user-1 exam_id=e9" in m
        for m in _warning_messages(caplog)
    )


# ---------------------------------------------------------------------------
# TPO hub
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tpo_hub_aggregates_placement_stats():
    profiles = [
        {"user_id": "s1", "cgpa": 8.5, "roll_number": "R1", "profile_complete": True, "documents_verified": False},
        {"user_id": "s2", "cgpa": 6.0, "roll_number": "R2", "profile_complete": True, "documents_verified": True},
    ]
    jobs = [{
        "id": "job-1", "title": "SDE", "status": "active", "company_name": "Acme",
        "drive_date": _future(48),
    }]
    exam_attempts = [
        {"candidate_id": "s1", "score": 90, "candidate": {"name": "Asha"}},
        {"candidate_id": "s1", "score": 70, "candidate": {"name": "Asha"}},
    ]
    mock_db = sequence_db(
        query(data={"college_id": "col-1"}),  # tpo user
        query(data=[{"id": "s1"}, {"id": "s2"}]),  # students count
        query(data=profiles),                      # profiles
        query(data=jobs),                          # jobs
        query(data=[{"id": "cs-1"}]),              # placed count
        query(data=[]),                            # activity feed -> fallback
        query(data=exam_attempts),                 # exam attempts
    )
    with patch("app.hub.db", mock_db):
        result = await get_tpo_hub_data("tpo-1")

    assert result["stats"]["totalRegistered"] == 2
    assert result["stats"]["placementRate"] == "50%"
    assert result["stats"]["averageCgpa"] == 7.25
    assert result["actionItems"][0]["id"] == "tpo_docs_verify"
    assert result["recentActivity"][0]["title"] == "College Placement Portal Online"
    assert result["insights"]["topPerformers"][0] == {"name": "Asha", "score": "80%"}
    assert result["insights"]["atRiskStudents"] == [{"name": "R2", "reason": "Low CGPA: 6.0"}]
    assert result["insights"]["funnel"][1] == {"label": "Eligible", "count": 1}
    assert result["degraded"] == []


@pytest.mark.asyncio
async def test_tpo_hub_surfaces_degraded_jobs_source(caplog):
    """A failing jobs query must not silently zero out drive counts."""
    profiles = [
        {"user_id": "s1", "cgpa": 8.0, "roll_number": "R1", "profile_complete": True, "documents_verified": True},
    ]
    mock_db = sequence_db(
        query(data={"college_id": "col-1"}),                             # tpo user
        query(data=[{"id": "s1"}]),                                      # students count
        query(data=profiles),                                            # profiles
        query(data=None, error=QueryError("jobs unavailable")),          # jobs FAILS
        query(data=[{"id": "cs-1"}]),                                    # placed count
        query(data=[]),                                                  # activity feed
        query(data=[]),                                                  # exam attempts
    )
    with patch("app.hub.db", mock_db), caplog.at_level(logging.WARNING, logger="app.hub"):
        result = await get_tpo_hub_data("tpo-1")

    assert result["role"] == "tpo"
    assert result["stats"]["totalRegistered"] == 1
    assert result["stats"]["placed"] == 1
    assert result["insights"]["funnel"][2] == {"label": "Offers", "count": 1}
    assert result["degraded"] == ["jobs"]
    assert any(
        "hub_overview.source_failed section=jobs user_id=tpo-1" in m
        for m in _warning_messages(caplog)
    )


# ---------------------------------------------------------------------------
# Recruiter hub
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recruiter_hub_action_items_and_spotlight():
    mock_db = sequence_db(
        query(data=[{"id": "d1", "title": "SDE Day", "status": "active"}]),  # drives
        query(data=[{"id": "c1"}, {"id": "c2"}]),                            # candidates
        query(data=[{"id": "a1", "status": "completed"}, {"id": "a2", "status": "grading"}]),  # attempts
        query(data=[{"id": "o1"}]),                                          # offers
        query(data=[{"id": "v1"}]),                                          # violations
        query(data=[{"id": "p1"}]),                                          # passers
        query(data=[]),                                                      # feed -> fallback
        query(data=[{                                                        # scheduled interviews
            "id": "iv-1", "candidate": {"name": "Asha"}, "job": {"title": "SDE"},
            "scheduled_start": _future(24),
        }]),
        query(data=[                                                         # spotlight attempts
            {"candidate_id": "c1", "score": 90, "candidate": {"name": "Asha"}},
            {"candidate_id": "c1", "score": 70, "candidate": {"name": "Asha"}},
            {"candidate_id": "c2", "score": 40, "candidate": {"name": "Ben"}},
        ]),
    )
    with patch("app.hub.db", mock_db):
        result = await get_recruiter_hub_data("recruiter-1")

    assert result["stats"] == {
        "activeDrives": 1, "totalCandidates": 2, "completedAttempts": 1, "offersExtended": 1,
    }
    action_ids = {i["id"] for i in result["actionItems"]}
    assert action_ids == {"proctoring_review_action", "passers_interview_pending"}
    assert result["recentActivity"][0]["title"] == "Recruiting War Room Ready"
    assert result["upcomingSchedule"][0]["title"] == "Interview: Asha - SDE"
    assert result["insights"]["candidateSpotlight"] == [
        {"name": "Asha", "score": "80% Match"},
        {"name": "Ben", "score": "40% Match"},
    ]
    assert result["degraded"] == []


# ---------------------------------------------------------------------------
# Admin hub
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_hub_counts_and_fallback_feed():
    mock_db = db_routing({
        "users": query(data=[{"id": "u1"}, {"id": "u2"}]),
        "exams": query(data=[{"id": "e1"}]),
        "attempts": query(data=[{"id": "a1"}]),
        "activity_feed": query(data=[]),
    })
    with patch("app.hub.db", mock_db):
        result = await get_admin_hub_data("admin-1")
    assert result["stats"]["totalUsers"] == 2
    assert result["stats"]["totalExams"] == 1
    assert result["stats"]["activeSessions"] == 1
    assert result["recentActivity"][0]["title"] == "Platform Administration Panel Active"
    assert result["degraded"] == []


@pytest.mark.asyncio
async def test_admin_hub_surfaces_degraded_users_source(caplog):
    mock_db = db_routing({
        "users": query(data=None, error=QueryError("users unavailable")),
        "exams": query(data=[{"id": "e1"}]),
        "attempts": query(data=[]),
        "activity_feed": query(data=[]),
    })
    with patch("app.hub.db", mock_db), caplog.at_level(logging.WARNING, logger="app.hub"):
        result = await get_admin_hub_data("admin-1")
    assert result["stats"]["totalUsers"] == 0  # degraded, not fabricated
    assert result["stats"]["totalExams"] == 1
    assert result["degraded"] == ["users"]
    assert any(
        "hub_overview.source_failed section=users user_id=admin-1" in m
        for m in _warning_messages(caplog)
    )


@pytest.mark.asyncio
async def test_overview_dispatches_by_role():
    mock_db = db_routing({
        "users": query(data={"college_id": "col-1"}),
        "candidate_profiles": query(data=[]),
        "jobs": query(data=[]),
        "activity_feed": query(data=[]),
    })
    with patch("app.hub.db", mock_db):
        result = await get_overview(user={"id": "tpo-1", "role": "tpo"})
    assert result["role"] == "tpo"
