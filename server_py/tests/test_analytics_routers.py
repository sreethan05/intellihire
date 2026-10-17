"""Endpoint tests for the candidate analytics and recruiter dashboard routers.

These are read-mostly aggregation endpoints; the tests pin their JSON
envelopes and exercise the empty-data fallbacks, topic classification and
score aggregation branches that the client charts consume.
"""
import datetime
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.routers.candidate_analytics import (
    get_certificates,
    get_coding_analytics,
    get_interview_analytics,
    get_peer_comparison,
    get_performance_radar,
    get_proctoring_summary,
    get_readiness_score,
    get_streak,
    get_topic_mastery,
)
from app.routers.recruiter_dashboard import (
    get_dashboard,
    get_exam_topic_performance,
    get_hiring_metrics,
    get_interview_funnel,
    get_plagiarism_analytics,
    get_proctoring_analytics,
    get_recruiter_coding_languages,
    get_time_to_complete,
)
from tests.db_mocks import db_routing, fake_connection, query, sequence_db

CANDIDATE = {"id": "user-1", "role": "candidate"}
RECRUITER = {"id": "recruiter-1", "role": "recruiter"}

TODAY = datetime.date.today()


# ---------------------------------------------------------------------------
# Candidate analytics
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_performance_radar_aggregates_topics_and_peer_percentile():
    answers = [
        {"is_correct": True, "question": {"topic": "dbms"}},
        {"is_correct": False, "question": {"topic": "os"}},
    ]
    mock_db = sequence_db(
        query(data=answers),                                  # answers
        query(data=[{"communication_score": 8}]),             # ai_interviews
        query(data=[{"score": 8, "coding_questions": {"marks": 10}}]),  # coding submissions
        query(data={"college_id": "col-1", "cgpa": 8.0}),     # candidate profile
        query(data=[{"cgpa": 7.0}, {"cgpa": 9.0}]),           # peers
        query(data=[{"score": 70, "exam": {"title": "Qualifier"}}]),  # attempts
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_performance_radar(user=CANDIDATE)

    assert result["peerPercentile"] == 50
    assert result["trendData"] == [{"name": "Qualifier", "score": 70}]
    assert set(result) == {"radarData", "peerPercentile", "trendData", "strengths", "weaknesses"}


@pytest.mark.asyncio
async def test_topic_mastery_empty_attempts_returns_fallback():
    mock_db = db_routing({"attempts": query(data=[])})
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_topic_mastery(user=CANDIDATE)
    assert result == {"topics": [], "strongest": None, "weakest": None, "peerAverage": []}


@pytest.mark.asyncio
async def test_topic_mastery_ranks_topics_and_peer_average():
    answers = [
        {"question_id": "q1", "is_correct": True, "marks_obtained": 2},
        {"question_id": "q2", "is_correct": False, "marks_obtained": 0},
    ]
    questions = [
        {"id": "q1", "topic_tags": ["arrays"]},
        {"id": "q2", "topic_tags": "not-a-list"},
    ]
    peer_answers = [
        {"question_id": "q1", "is_correct": True, "attempts": {"status": "completed"}},
        {"question_id": "q1", "is_correct": False, "attempts": {"status": "in_progress"}},
    ]
    mock_db = sequence_db(
        query(data=[{"id": "attempt-1"}]),
        query(data=answers),
        query(data=questions),
        query(data=peer_answers),
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_topic_mastery(user=CANDIDATE)
    assert result["strongest"] == "arrays"
    assert result["weakest"] == "General"
    # Only completed peer attempts count.
    assert result["peerAverage"] == [{"topic": "arrays", "accuracy": 100}]


@pytest.mark.asyncio
async def test_coding_analytics_empty_and_full():
    mock_db = db_routing({"attempts": query(data=[])})
    with patch("app.routers.candidate_analytics.db", mock_db):
        empty = await get_coding_analytics(user=CANDIDATE)
    assert empty == {"languages": [], "difficulty": [], "problemTypes": []}

    submissions = [
        {"language": "python", "score": 10, "coding_questions": {"difficulty": "easy", "topic_tags": ["arrays"]}},
        {"language": "python", "score": 0, "coding_questions": {"difficulty": "hard", "topic_tags": None}},
    ]
    mock_db = sequence_db(
        query(data=[{"id": "attempt-1"}]),
        query(data=submissions),
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_coding_analytics(user=CANDIDATE)
    langs = {row["language"]: row for row in result["languages"]}
    assert langs["python"]["successRate"] == 50
    assert {row["level"] for row in result["difficulty"]} == {"easy", "hard"}
    assert {row["type"] for row in result["problemTypes"]} == {"arrays", "General"}


@pytest.mark.asyncio
async def test_interview_analytics_averages_and_empty():
    interviews = [{
        "id": "iv-1",
        "job": {"title": "SDE", "company_name": "Acme"},
        "exam": None,
        "submitted_at": "2026-01-01T00:00:00Z",
        "score": 80, "relevance_score": 90, "communication_score": 70,
        "intro_score": 60, "speaking_score": 50, "pronunciation_score": 40,
        "technical_score": 30, "selected": True, "summary": "ok", "feedback": "good",
    }]
    mock_db = db_routing({"ai_interviews": query(data=interviews)})
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_interview_analytics(user=CANDIDATE)
    assert result["count"] == 1
    assert result["interviews"][0]["jobTitle"] == "SDE"
    assert result["averages"]["relevance"] == 90

    mock_db = db_routing({"ai_interviews": query(data=[])})
    with patch("app.routers.candidate_analytics.db", mock_db):
        empty = await get_interview_analytics(user=CANDIDATE)
    assert empty["count"] == 0
    assert set(empty["averages"].values()) == {0}


@pytest.mark.asyncio
async def test_streak_computes_current_and_longest():
    today = TODAY.isoformat()
    yesterday = (TODAY - datetime.timedelta(days=1)).isoformat()
    attempts = [{"started_at": f"{today}T09:00:00Z", "submitted_at": f"{yesterday}T09:00:00Z"}]
    subs = [{"created_at": f"{yesterday}T10:00:00Z"}]
    mock_db = db_routing({
        "attempts": query(data=attempts),
        "coding_submissions": query(data=subs),
    })
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_streak(user=CANDIDATE)
    assert result["currentStreak"] == 2
    assert result["longestStreak"] == 2
    assert len(result["heatmap"]) == 84
    assert result["heatmap"][-1]["count"] == 1


@pytest.mark.asyncio
async def test_readiness_score_zones_and_components():
    attempts = [
        {"id": "a1", "exam_id": "e1", "score": 90, "exams": {"total_marks": 100}},
        {"id": "a2", "exam_id": "e2", "score": 70, "exams": {"total_marks": 100}},
    ]
    mock_db = sequence_db(
        query(data=attempts),
        query(data=[{"score": 5, "coding_questions": {"marks": 10}}]),
        query(data=[{"score": 80}]),
        query(data=[{"id": "e1"}, {"id": "e2"}, {"id": "e3"}]),
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_readiness_score(user=CANDIDATE)
    # exam 80 avg, coding 50, interview 80, consistency 90 (std=10), breadth 2/3.
    assert result["zone"] == "approaching"
    assert result["readinessScore"] == 73
    assert result["components"]["exam"] == 80
    assert result["components"]["coding"] == 50
    assert 0 <= result["readinessScore"] <= 100


@pytest.mark.asyncio
async def test_proctoring_summary_classifies_violation_messages():
    mock_db = db_routing({"attempts": query(data=[])})
    with patch("app.routers.candidate_analytics.db", mock_db):
        empty = await get_proctoring_summary(user=CANDIDATE)
    assert empty == {"totalViolations": 0, "byType": [], "recentExams": []}

    violations = [
        {"message": "Tab switch detected", "violation_count": 2, "captured_at": "t1", "exams": {"title": "E1"}},
        {"message": "Face missing", "captured_at": "t2", "exams": None},
        {"message": "Camera offline", "captured_at": "t3", "exams": {}},
        {"message": "Phone detected", "captured_at": "t4", "exams": {}},
        {"message": "Looking away", "captured_at": "t5", "exams": {}},
        {"message": "something else", "captured_at": "t6", "exams": {}},
    ]
    mock_db = sequence_db(
        query(data=[{"id": "attempt-1"}]),
        query(data=violations),
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_proctoring_summary(user=CANDIDATE)
    by_type = {row["type"]: row["count"] for row in result["byType"]}
    assert by_type == {
        "tab_switch": 1, "face_missing": 1, "camera_offline": 1,
        "phone_detected": 1, "looking_away": 1, "other": 1,
    }
    assert result["totalViolations"] == 6
    assert len(result["recentExams"]) == 5
    assert result["recentExams"][0]["examTitle"] == "E1"


@pytest.mark.asyncio
async def test_peer_comparison_aggregates_topics_and_overall():
    all_answers = [
        {"question_id": "q1", "is_correct": True, "attempts": {"candidate_id": "user-1", "status": "completed"}},
        {"question_id": "q1", "is_correct": False, "attempts": {"candidate_id": "peer-1", "status": "completed"}},
    ]
    mock_db = sequence_db(
        query(data=[{"id": "a1", "exam_id": "e1", "score": 50, "exams": {"total_marks": 100}}]),
        query(data=[{"question_id": "q1", "is_correct": True}]),
        query(data=all_answers),
        query(data=[{"id": "q1", "topic_tags": ["arrays"]}]),
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_peer_comparison(user=CANDIDATE)
    assert result["comparisons"][0]["topic"] == "arrays"
    assert result["comparisons"][0]["myAccuracy"] == 100
    assert result["overall"]["myAccuracy"] == 100
    # Topic percentile is relative to all answers (mine + one wrong peer):
    # 100 / 50 * 100 = 200 -> clamped to 100.
    assert result["comparisons"][0]["percentile"] == 100
    # Overall percentile excludes my own answers: peers answered 0% correct.
    assert result["overall"]["percentile"] == 0


@pytest.mark.asyncio
async def test_certificates_issues_missing_and_lists():
    attempts = [
        {"exam_id": "e1", "score": 80, "exams": {"pass_marks": 40, "title": "A", "total_marks": 100}},
        {"exam_id": "e2", "score": 10, "exams": {"pass_marks": 40}},
    ]
    cert_upsert = query(data=[{"id": "cert-1"}])
    cert_list = query(data=[{"id": "cert-1", "exam": {"title": "A"}}])
    mock_db = sequence_db(
        query(data=attempts),
        cert_upsert,  # upsert for passed attempt
        cert_list,    # final list
    )
    with patch("app.routers.candidate_analytics.db", mock_db):
        result = await get_certificates(user=CANDIDATE)
    assert result["certificates"] == [{"id": "cert-1", "exam": {"title": "A"}}]
    assert cert_upsert.upsert.called


# ---------------------------------------------------------------------------
# Recruiter dashboard
# ---------------------------------------------------------------------------

def _dashboard_fixtures():
    created = datetime.datetime(2026, 1, 1, 10, 0, tzinfo=datetime.timezone.utc)
    drives = [{"id": "drive-1", "title": "SDE Day", "company_name": "Acme",
               "college_id": "col-1", "company_description": "desc"}]
    profiles = [{"user_id": "user-1", "branch": "CSE", "cgpa": 8.0,
                 "college_id": "col-1", "documents_verified": True}]
    users = [{"id": "user-1", "name": "Asha", "email": "a@x.com"}]
    pipeline = [{"id": "p1", "job_id": "drive-1", "candidate_id": "user-1", "status": "offered"}]
    assignments = [{"exam_id": "e1", "candidate_id": "user-1"}]
    attempts = [{
        "id": "a1", "exam_id": "e1", "candidate_id": "user-1", "status": "completed",
        "score": 80, "started_at": created, "submitted_at": created,
        "title": "Exam 1", "total_marks": 100, "pass_marks": 40,
        "name": "Asha", "email": "a@x.com",
    }]
    exams = [{"id": "e1", "title": "Exam 1", "total_marks": 100, "pass_marks": 40,
              "created_at": created, "available_from": created, "available_until": None}]
    return [drives, profiles, users, pipeline, assignments, attempts, exams]


@pytest.mark.asyncio
async def test_recruiter_dashboard_aggregates_all_sections():
    with patch("app.routers.recruiter_dashboard.get_connection",
               new=lambda: fake_connection(_dashboard_fixtures())):
        result = await get_dashboard(collegeId=None, user=RECRUITER)

    assert result["stats"]["completedAttempts"] == 1
    assert result["stats"]["passRate"] == 100.0
    assert result["resultSummary"] == {"pass": 1, "fail": 0, "inProgress": 0}
    assert result["examPerformance"][0]["passRate"] == 100.0
    assert result["candidatePerformance"][0]["name"] == "Asha"
    assert result["branchAnalytics"][0]["averageCgpa"] == 8.0
    assert result["funnel"][-1] == {"label": "Offered", "value": 1}
    assert result["recentExams"][0]["status"] == "Completed"
    assert result["driveAnalytics"][0]["offered"] == 1


@pytest.mark.asyncio
async def test_recruiter_dashboard_with_college_filter_skips_unknown_candidates():
    # When no candidate profiles match the college, the SQL cursor sees:
    # drives, profiles (empty), pipeline (AND FALSE), exams — user/assignment/
    # attempt queries are skipped entirely.
    fixtures = _dashboard_fixtures()
    drives, exams_fixture = fixtures[0], fixtures[6]
    fixtures = [drives, [], [], exams_fixture]
    with patch("app.routers.recruiter_dashboard.get_connection",
               new=lambda: fake_connection(fixtures)):
        result = await get_dashboard(collegeId="col-1", user=RECRUITER)
    # No profiles -> candidate-derived queries short-circuit.
    assert result["stats"]["candidates"] == 0
    assert result["stats"]["attempts"] == 0
    assert result["stats"]["drives"] == 1


@pytest.mark.asyncio
async def test_exam_topic_performance_scoping_and_topics():
    mock_db = sequence_db(
        query(data={"id": "e1", "created_by": "recruiter-1"}),
        query(data=[{"question_id": "q1", "questions": {"topic_tags": ["arrays"], "question_text": "?"}}]),
        query(data=[{"id": "a1"}]),
        query(data=[{"question_id": "q1", "is_correct": True, "marks_obtained": 2}]),
    )
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_exam_topic_performance("e1", user=RECRUITER)
    assert result["topics"][0]["topic"] == "arrays"
    assert result["totalCandidates"] == 1

    # Wrong recruiter -> 403
    mock_db = db_routing({"exams": query(data={"id": "e1", "created_by": "someone-else"})})
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_exam_topic_performance("e1", user=RECRUITER)
    assert exc.value.status_code == 403

    # Missing exam -> 404
    mock_db = db_routing({"exams": query(data=None)})
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_exam_topic_performance("missing", user=RECRUITER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_recruiter_proctoring_analytics_groups_by_type_and_candidate():
    violations = [
        {"message": "tab switch", "candidate_id": "user-1", "users": {"name": "Asha"}},
        {"message": "tab switch again", "candidate_id": "user-1", "users": {"name": "Asha"}},
        {"message": "phone", "candidate_id": None, "users": None},
    ]
    mock_db = sequence_db(query(data=[{"id": "a1"}]), query(data=violations))
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_proctoring_analytics(user=RECRUITER)
    assert result["totalViolations"] == 3
    assert result["byType"] == [
        {"type": "tab_switch", "count": 2},
        {"type": "phone_detected", "count": 1},
    ]
    assert result["byCandidate"] == [{"candidateId": "user-1", "name": "Asha", "violations": 2}]


@pytest.mark.asyncio
async def test_recruiter_plagiarism_analytics_sorted_flags():
    flags = [
        {"id": "f1", "attempt_id": "a1", "similarity_score": 0.4, "status": "open",
         "attempts": {"candidate_id": "u1"}, "matched": {"candidate_id": "u2"}},
        {"id": "f2", "attempt_id": "a2", "similarity_score": 0.9, "status": "open",
         "attempts": {"candidate_id": "u3"}, "matched": {"candidate_id": "u4"}},
    ]
    mock_db = sequence_db(query(data=[{"id": "a1", "exam_id": "e1"}]), query(data=flags))
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_plagiarism_analytics(user=RECRUITER)
    assert result["totalFlags"] == 2
    assert result["avgSimilarity"] == 0.7
    assert result["highFlags"][0]["id"] == "f2"  # highest similarity first


@pytest.mark.asyncio
async def test_interview_funnel_empty_and_scored():
    mock_db = sequence_db(query(data=[]), query(data=[]))
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        empty = await get_interview_funnel(user=RECRUITER)
    assert empty == {"funnel": [], "scoreDistribution": [], "avgScores": {}}

    interviews = [
        {"status": "scheduled", "score": None, "selected": False},
        {"status": "completed", "score": 30, "selected": True},
        {"status": "completed", "score": 65, "selected": False},
        {"status": "completed", "score": 95, "selected": True},
    ]
    mock_db = sequence_db(
        query(data=[{"id": "job-1"}]),
        query(data=[{"id": "exam-1"}]),
        query(data=interviews),
    )
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_interview_funnel(user=RECRUITER)
    funnel = {row["stage"]: row["count"] for row in result["funnel"]}
    assert funnel == {"Scheduled": 1, "Started": 0, "Completed": 3, "Selected": 2}
    bands = {row["band"]: row["count"] for row in result["scoreDistribution"]}
    assert bands == {"0-40": 1, "40-60": 0, "60-80": 1, "80-100": 1}
    assert result["avgScores"]["overall"] == round((30 + 65 + 95) / 3)


@pytest.mark.asyncio
async def test_time_to_complete_parses_durations():
    attempts = [
        {"id": "a1", "score": 50, "started_at": "2026-01-01T10:00:00Z",
         "submitted_at": "2026-01-01T10:30:00Z", "exams": {"title": "E1", "duration": 60, "total_marks": 100}},
        {"id": "a2", "score": 40, "started_at": "bad-date",
         "submitted_at": "2026-01-01T10:10:00Z", "exams": {"title": "E2", "duration": 30, "total_marks": 50}},
    ]
    mock_db = db_routing({"attempts": query(data=attempts)})
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_time_to_complete(user=RECRUITER)
    assert result["count"] == 2
    assert result["data"][0]["durationSec"] == 1800
    assert result["data"][0]["percentageUsed"] == 50
    # Invalid timestamp -> duration 0, not a crash.
    assert result["data"][1]["durationSec"] == 0


@pytest.mark.asyncio
async def test_recruiter_coding_languages_aggregates():
    subs = [
        {"language": "python", "score": 10},
        {"language": "python", "score": 0},
        {"language": None, "score": 5},
    ]
    mock_db = sequence_db(query(data=[{"id": "a1"}]), query(data=subs))
    with patch("app.routers.recruiter_dashboard.db", mock_db):
        result = await get_recruiter_coding_languages(user=RECRUITER)
    langs = {row["language"]: row for row in result["languages"]}
    assert langs["python"]["successRate"] == 50
    assert langs["unknown"]["count"] == 1
    assert result["totalSubmissions"] == 3


@pytest.mark.asyncio
async def test_hiring_metrics_without_drives_returns_zeroed_envelope():
    with patch("app.routers.recruiter_dashboard.get_connection",
               new=lambda: fake_connection([[]])):
        result = await get_hiring_metrics(collegeId=None, user=RECRUITER)
    assert result["totalDrives"] == 0
    assert result["pipelineConversion"]["offered"] == 0


@pytest.mark.asyncio
async def test_hiring_metrics_full_pipeline():
    drives = [
        {"id": "d1", "title": "SDE", "company_name": "Acme",
         "created_at": datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)},
    ]
    pipeline_counts = [
        {"status": "registered", "count": 10},
        {"status": "offered", "count": 4},
        {"status": "shortlisted", "count": 6},
        {"status": "passed", "count": 7},
        {"status": "exam_taken", "count": 9},
        {"status": "rejected", "count": 1},
    ]
    offer_row = [{"total": 4, "accepted": 3, "declined": 1}]
    avg_row = [{"avg_days": 12.34}]
    per_drive = [{"status": "offered", "count": 4}, {"status": "shortlisted", "count": 6}]
    with patch("app.routers.recruiter_dashboard.get_connection",
               new=lambda: fake_connection([drives, pipeline_counts, offer_row, avg_row, per_drive])):
        result = await get_hiring_metrics(collegeId=None, user=RECRUITER)
    assert result["totalDrives"] == 1
    assert result["offerAcceptanceRate"] == 75.0
    assert result["avgTimeToHireDays"] == 12.3
    assert result["driveBreakdown"][0]["driveId"] == "d1"
    assert result["driveBreakdown"][0]["registered"] == 10
