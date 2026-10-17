"""Endpoint tests for app.tpo.

The TPO surface mixes db-builder queries with raw SQL (dashboard attempts and
the paginated student list); both harness styles from ``tests.db_mocks`` are
used. ``provision_candidate_accounts`` is the account-creation core and is
covered branch by branch.
"""
import datetime

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.ai import MarksheetFile
from app.tpo import (
    ScanMarksheetsRequest,
    StudentRow,
    StudentVerificationRequest,
    UploadStudentsRequest,
    VerifyStudentBatchRequest,
    get_company_performance,
    get_dashboard,
    get_dashboard_summary,
    get_placement_stats,
    get_readiness_heatmap,
    get_students,
    get_tpo_college,
    get_upload_tracking,
    provision_candidate_accounts,
    scan_marksheets,
    upload_students,
    verify_batch,
    verify_student,
)
from tests.db_mocks import db_routing, fake_connection, query, sequence_db

TPO = {"id": "tpo-1", "role": "tpo"}
NOW = datetime.datetime.now(datetime.timezone.utc)

ROW = StudentRow(
    roll_number="21cs0101", name="Asha", email="ASHA@X.com",
    branch="cse", cgpa=8.4, graduation_year=2026,
)


# ---------------------------------------------------------------------------
# get_tpo_college
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_tpo_college_requires_linked_college():
    mock_db = db_routing({"users": query(data={"college_id": None})})
    with patch("app.tpo.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_tpo_college("tpo-1")
    assert exc.value.status_code == 400

    mock_db = db_routing({"users": query(data={"college_id": "col-1"})})
    with patch("app.tpo.db", mock_db):
        assert await get_tpo_college("tpo-1") == "col-1"


# ---------------------------------------------------------------------------
# provision_candidate_accounts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_provision_candidate_creates_user_and_profile():
    insert_user = query(data={"id": "u-new", "role": "candidate", "college_id": "col-1"})
    update_user = query(data=[{"id": "u-new"}])
    chains = [
        query(data=[]),           # email lookup
        query(data=[]),           # roll lookup
        insert_user,              # user insert
        query(data=None),         # profile maybeSingle
        query(data={"id": "p1"}), # profile insert
        update_user,              # user profile_complete update
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        created, failed = await provision_candidate_accounts([ROW], "col-1", "tpo-1")

    assert failed == []
    assert created[0]["id"] == "u-new"
    user_insert = insert_user.insert.call_args[0][0]
    assert user_insert["email"] == "asha@x.com"       # normalized lowercase
    assert user_insert["roll_number"] == "21CS0101"   # normalized uppercase
    assert user_insert["role"] == "candidate"
    profile_insert = chains[4].insert.call_args[0][0]
    assert profile_insert["branch"] == "CSE"
    assert profile_insert["profile_complete"] is True
    assert update_user.update.called


@pytest.mark.asyncio
async def test_provision_candidate_updates_existing_profile():
    update_profile = query(data={"id": "p1"})
    chains = [
        query(data=[{"id": "u1", "role": "candidate", "college_id": "col-1"}]),  # email lookup
        query(data={"id": "p1"}),  # profile maybeSingle
        update_profile,            # profile update
        query(data=[{"id": "u1"}]),  # users update
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        created, failed = await provision_candidate_accounts([ROW], "col-1", "tpo-1")
    assert failed == []
    assert update_profile.update.called


@pytest.mark.asyncio
async def test_provision_candidate_rejects_conflicts_and_errors():
    # Email belongs to a recruiter -> failed row, no writes.
    with patch("app.tpo.db", sequence_db(query(data=[{"id": "u1", "role": "recruiter"}]))):
        created, failed = await provision_candidate_accounts([ROW], "col-1", "tpo-1")
    assert created == []
    assert "non-candidate" in failed[0]["reason"]

    # Candidate already registered under another college.
    with patch("app.tpo.db", sequence_db(
        query(data=[{"id": "u1", "role": "candidate", "college_id": "other-college"}])
    )):
        created, failed = await provision_candidate_accounts([ROW], "col-1", "tpo-1")
    assert created == []
    assert "different college" in failed[0]["reason"]

    # User insert fails -> reported, not raised.
    broken = query(data=None)
    broken.error = MagicMock(message="duplicate key")
    with patch("app.tpo.db", sequence_db(query(data=[]), query(data=[]), broken)):
        created, failed = await provision_candidate_accounts([ROW], "col-1", "tpo-1")
    assert created == []
    assert failed[0]["reason"] == "duplicate key"


@pytest.mark.asyncio
async def test_upload_students_envelope():
    chains = [
        query(data={"college_id": "col-1"}),
        query(data=[]), query(data=[]),
        query(data={"id": "u1", "role": "candidate"}),
        query(data=None),
        query(data={"id": "p1"}),
        query(data=[{"id": "u1"}]),
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        result = await upload_students(UploadStudentsRequest(rows=[ROW]), user=TPO)
    assert result["created"][0]["id"] == "u1"
    assert result["failed"] == []
    assert "1 student account(s)" in result["message"]


# ---------------------------------------------------------------------------
# dashboard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tpo_dashboard_aggregates_branch_and_band_stats():
    students = [
        {"id": "p1", "user_id": "u1", "branch": "CSE", "cgpa": 9.2,
         "profile_complete": True, "documents_verified": False},
        {"id": "p2", "user_id": "u2", "branch": "CSE", "cgpa": 7.8,
         "profile_complete": True, "documents_verified": True},
        {"id": "p3", "user_id": "u3", "branch": "ECE", "cgpa": 6.5,
         "profile_complete": False, "documents_verified": False},
    ]
    drives = [
        {"id": "d1", "title": "SDE", "company_name": "Acme", "drive_date": None, "status": "active"},
        {"id": "d2", "title": "QA", "company_name": "Beta", "drive_date": None, "status": "closed"},
    ]
    chains = [
        query(data={"college_id": "col-1"}),   # get_tpo_college
        query(data=drives),                    # jobs
        query(data=students),                  # profiles
        query(data=[{"id": "cs-1"}]),          # candidate_status offered
        query(data={"id": "col-1", "name": "College", "code": "C1"}),  # colleges
    ]
    attempts = [
        {"id": "a1", "candidate_id": "u1", "status": "completed", "score": 80, "total_marks": 100},
        {"id": "a2", "candidate_id": "u2", "status": "completed", "score": 50, "total_marks": 100},
    ]
    with patch("app.tpo.db", sequence_db(*chains)), \
         patch("app.tpo.get_connection", new=lambda: fake_connection([attempts])):
        result = await get_dashboard(user=TPO)

    stats = result["stats"]
    assert stats["students"] == 3
    assert stats["profileComplete"] == 2
    assert stats["pendingVerification"] == 2
    assert stats["activeDrives"] == 1
    assert stats["placed"] == 1
    assert stats["placementRate"] == 33.3
    assert stats["averageCgpa"] == 7.83
    assert stats["averageAttemptPercentage"] == 65.0
    cse = next(b for b in result["branchBreakdown"] if b["branch"] == "CSE")
    assert cse["count"] == 2 and cse["averageCgpa"] == 8.5
    bands = {b["label"]: b["students"] for b in result["cgpaBands"]}
    assert bands == {"9.0+": 1, "8.0-8.9": 0, "7.0-7.9": 1, "Below 7": 1}
    assert result["college"]["code"] == "C1"


@pytest.mark.asyncio
async def test_get_students_paginates_and_enriches():
    profile_row = {
        "id": "p1", "user_id": "u1", "name": "Asha", "email": "a@x.com",
        "roll_number": "21CS0101", "profile_complete": True,
        "user_created_at": datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc),
    }
    chains = [
        query(data={"college_id": "col-1"}),
    ]
    with patch("app.tpo.db", sequence_db(*chains)), \
         patch("app.tpo.get_connection",
               new=lambda: fake_connection([[profile_row], [{"count": 1}]])):
        result = await get_students(page=2, limit=5, user=TPO)
    assert result["total"] == 1
    assert result["page"] == 2
    assert result["students"][0]["user"]["name"] == "Asha"
    assert result["students"][0]["user"]["created_at"].startswith("2026-01-01")


@pytest.mark.asyncio
async def test_verify_student_and_batch():
    chains = [
        query(data={"college_id": "col-1"}),
        query(data={"id": "p1", "documents_verified": True}),
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        result = await verify_student("p1", StudentVerificationRequest(documents_verified=True), user=TPO)
    assert result["student"]["documents_verified"] is True

    # Update returns no row -> 400.
    with patch("app.tpo.db", sequence_db(query(data={"college_id": "col-1"}), query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await verify_student("missing", StudentVerificationRequest(documents_verified=True), user=TPO)
    assert exc.value.status_code == 400

    # Batch: one updated, one not found.
    chains = [
        query(data={"college_id": "col-1"}),
        query(data={"id": "p1"}),
        query(data=None),
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        result = await verify_batch(
            VerifyStudentBatchRequest(studentIds=["p1", "p2"], documents_verified=True), user=TPO
        )
    assert result["updated"] == [{"id": "p1"}]
    assert "1 profile(s)" in result["message"]


@pytest.mark.asyncio
async def test_dashboard_summary_counts_and_action_items():
    drive_date = (NOW + datetime.timedelta(hours=30)).isoformat()
    chains = [
        query(data={"college_id": "col-1"}),                       # get_tpo_college
        query(data=None, count=10),                                # registered count
        query(data=None, count=7),                                 # eligible count
        query(data=None, count=3),                                 # pending count
        query(data=[{"id": "d1", "title": "SDE", "status": "active", "drive_date": drive_date}]),
        query(data=[{"id": "cs-1"}, {"id": "cs-2"}]),              # offered count
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        result = await get_dashboard_summary(user=TPO)

    summary = result["summary"]
    assert summary["totalRegistered"] == 10
    assert summary["totalEligible"] == 7
    assert summary["pendingVerification"] == 3
    assert summary["totalPlaced"] == 2
    assert summary["placementRate"] == 20
    action_ids = {i["id"] for i in summary["actionItems"]}
    assert action_ids == {"tpo_docs_verify", "tpo_job_d1"}


# ---------------------------------------------------------------------------
# analytics
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_placement_stats_aggregates_branches_years_companies():
    students = [
        {"id": "p1", "user_id": "u1", "branch": "CSE", "cgpa": 8.5, "graduation_year": 2026},
        {"id": "p2", "user_id": "u2", "branch": "CSE", "cgpa": 7.0, "graduation_year": 2026},
        {"id": "p3", "user_id": "u3", "branch": "ECE", "cgpa": 9.0, "graduation_year": 2027},
    ]
    statuses = [
        {"candidate_id": "u1", "status": "offered", "job_id": "j1",
         "jobs": {"company_name": "Acme", "salary_min": 10, "salary_max": 20}},
        {"candidate_id": "u2", "status": "registered", "job_id": "j1", "jobs": None},
        {"candidate_id": "u3", "status": "offered", "job_id": "j2",
         "jobs": {"company_name": "Beta", "salary_min": 8, "salary_max": 12}},
    ]
    mock_db = db_routing({
        "users": query(data={"college_id": "col-1"}),
        "candidate_profiles": query(data=students),
        "candidate_status": query(data=statuses),
    })
    with patch("app.tpo.db", mock_db):
        result = await get_placement_stats(user=TPO)

    cse = next(b for b in result["byBranch"] if b["branch"] == "CSE")
    assert cse["totalStudents"] == 2
    assert cse["placed"] == 1
    assert cse["placementRate"] == 50
    assert cse["avgSalary"] == 15.0
    assert cse["avgCgpa"] == 7.8
    years = {y["year"]: y for y in result["byYear"]}
    assert years[2026]["placementRate"] == 50
    assert years[2027]["placed"] == 1
    companies = {c["company"]: c for c in result["topCompanies"]}
    assert companies["Acme"]["offers"] == 1
    assert companies["Beta"]["avgSalary"] == 10.0


@pytest.mark.asyncio
async def test_readiness_heatmap_scores_and_zones():
    students = [{"id": "p1", "user_id": "u1", "roll_number": "R1", "branch": "CSE",
                 "cgpa": 8.0, "resume_ats_analysis": {"score": 70}, "resume_url": None,
                 "user": {"name": "Asha"}}]
    chains = [
        query(data={"college_id": "col-1"}),  # get_tpo_college
        query(data=students),                 # profiles
        query(data=[                          # completed attempts
            {"id": "a1", "candidate_id": "u1", "score": 90, "status": "completed",
             "exam_id": "e1", "exams": {"total_marks": 100}},
            {"id": "a2", "candidate_id": "u1", "score": 70, "status": "completed",
             "exam_id": "e2", "exams": {"total_marks": 100}},
        ]),
        query(data=[{"id": "a1", "candidate_id": "u1", "exam_id": "e1"},
                    {"id": "a2", "candidate_id": "u1", "exam_id": "e2"}]),  # all attempts
        query(data=[{"attempt_id": "a1", "score": 8, "coding_questions": {"marks": 10}}]),  # coding
        query(data=[{"candidate_id": "u1", "score": 80, "status": "completed"}]),  # interviews
        query(data=[{"id": "e1"}, {"id": "e2"}, {"id": "e3"}]),  # all exams
    ]
    with patch("app.tpo.db", sequence_db(*chains)):
        result = await get_readiness_heatmap(user=TPO)

    student = result["students"][0]
    assert student["name"] == "Asha"
    # exam 80, coding 80, interview 80, consistency 90, breadth 2/3.
    assert student["readinessScore"] == 80
    assert student["zone"] == "ready"
    assert result["zoneCounts"] == {"ready": 1, "approaching": 0, "needs_work": 0}


@pytest.mark.asyncio
async def test_company_performance_funnel_counts():
    jobs = [
        {"id": "j1", "company_name": "Acme"},
        {"id": "j2", "company_name": "Acme"},
        {"id": "j3", "company_name": "Beta"},
    ]
    statuses = [
        {"job_id": "j1", "status": "registered"},
        {"job_id": "j1", "status": "exam_taken"},
        {"job_id": "j2", "status": "offered"},
        {"job_id": "j3", "status": "shortlisted"},
        {"job_id": "unknown", "status": "offered"},  # orphan status is skipped
    ]
    mock_db = db_routing({
        "users": query(data={"college_id": "col-1"}),
        "jobs": query(data=jobs),
        "candidate_status": query(data=statuses),
    })
    with patch("app.tpo.db", mock_db):
        result = await get_company_performance(user=TPO)

    companies = {c["company"]: c for c in result["companies"]}
    acme = companies["Acme"]
    assert acme["drives"] == 2
    assert acme["registered"] == 1
    # "offered" also counts as having taken/passed/shortlisted the exam.
    assert acme["examTaken"] == 2
    assert acme["passed"] == 1
    assert acme["shortlisted"] == 1
    assert acme["offered"] == 1
    assert acme["conversionRate"] == 100
    assert companies["Beta"]["shortlisted"] == 1


@pytest.mark.asyncio
async def test_upload_tracking_formats_rows():
    uploads = [
        {"id": "up1", "file_name": "students.xlsx", "rows_total": 10, "rows_created": 8,
         "rows_failed": 2, "status": "partial", "created_at": "2026-01-01T00:00:00Z"},
        {"id": "up2", "file_name": "empty.xlsx", "rows_total": 0, "rows_created": 0,
         "rows_failed": 0, "status": "failed", "created_at": "2026-01-02T00:00:00Z"},
    ]
    mock_db = db_routing({
        "users": query(data={"college_id": "col-1"}),
        "tpo_uploads": query(data=uploads),
    })
    with patch("app.tpo.db", mock_db):
        result = await get_upload_tracking(user=TPO)

    assert result["uploads"][0]["successRate"] == 80
    assert result["uploads"][1]["successRate"] == 0
    assert len(result["trend"]) == 6
    assert all(entry["uploads"] == 0 for entry in result["trend"])


# ---------------------------------------------------------------------------
# marksheet OCR
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_scan_marksheets_mixed_results():
    files = [
        MarksheetFile(name="ok.png", mimeType="image/png", data="AAAA"),
        MarksheetFile(name="bad.png", mimeType="image/png", data="BBBB"),
        MarksheetFile(name="boom.png", mimeType="image/png", data="CCCC"),
    ]

    async def fake_extract(name, mime, data):
        if name == "ok.png":
            return {"roll_number": "21CS0101", "name": "Asha", "branch": "CSE",
                    "cgpa": "not-a-number", "graduation_year": 2026,
                    "confidence": 0.9, "warnings": []}
        if name == "bad.png":
            raise HTTPException(status_code=422, detail="Unreadable marksheet")
        raise RuntimeError("ocr exploded")

    with patch("app.tpo.db", sequence_db(query(data={"college_id": "col-1"}))), \
         patch("app.tpo.extract_marksheet_result", new=AsyncMock(side_effect=fake_extract)):
        result = await scan_marksheets(ScanMarksheetsRequest(files=files), user=TPO)

    assert len(result["students"]) == 1
    student = result["students"][0]
    assert student["cgpa"] == 0.0  # unparsable cgpa falls back to 0.0
    assert student["source_file"] == "ok.png"
    reasons = [f["reason"] for f in result["failed"]]
    assert reasons == ["Unreadable marksheet", "Scan failed: ocr exploded"]


@pytest.mark.asyncio
async def test_scan_marksheets_requires_files_and_college():
    with patch("app.tpo.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await scan_marksheets(ScanMarksheetsRequest(files=[]), user=TPO)
    assert exc.value.status_code == 400

    with patch("app.tpo.db", sequence_db(query(data={"college_id": "col-1"}))):
        with pytest.raises(HTTPException) as exc:
            await scan_marksheets(ScanMarksheetsRequest(files=[]), user=TPO)
    assert exc.value.status_code == 400
