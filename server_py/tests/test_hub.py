"""Endpoint tests for app.hub.

Each role gets a tailored aggregation payload. These tests drive the
role dispatch plus the rich data paths (deadlines, rankings, spotlights) and
the empty-data fallbacks the dashboard renders.
"""
import datetime

import pytest
from fastapi import HTTPException

from app.hub import (
    get_admin_hub_data,
    get_candidate_hub_data,
    get_overview,
    get_recruiter_hub_data,
    get_tpo_hub_data,
)
from tests.db_mocks import db_routing, query, sequence_db

from unittest.mock import patch

NOW = datetime.datetime.now(datetime.timezone.utc)


def _future(hours=3):
    return (NOW + datetime.timedelta(hours=hours)).isoformat()


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
