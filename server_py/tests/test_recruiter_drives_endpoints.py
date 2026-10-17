"""Endpoint tests for app.routers.recruiter_drives.

The drive lifecycle spans the db builder (jobs / candidate_status / colleges),
raw SQL eligibility queries (``find_eligible_candidates``), background exports
(pipeline stage records, emails, websocket notifications) and PDF uploads.
Each is exercised through the shared harnesses with the side-effectful helpers
patched out.
"""
import datetime
import os

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.routers.recruiter_drives import (
    AiShortlistRequest,
    AssignExamRequest,
    CreateJobRequest,
    SaveAiConfigRequest,
    ai_shortlist,
    assign_exam_to_drive,
    create_drive,
    deserialize_drive_colleges,
    find_eligible_candidates,
    get_ai_config,
    get_drive_college_ids,
    get_drives,
    get_eligible_candidates_for_drive,
    get_eligible_count,
    get_predictive_shortlist,
    save_ai_config,
    serialize_drive_colleges,
    test_evaluation as evaluate_test_answer,
    upload_offer_letter,
)
from tests.db_mocks import FakeConn, db_routing, fake_connection, query, sequence_db

RECRUITER = {"id": "rec-1", "role": "recruiter"}

DRIVE_ROW = {
    "id": "d1",
    "title": "SDE Day",
    "company_name": "Acme",
    "company_description": serialize_drive_colleges(
        "Build things", ["col-1"], {"persona": "strict", "rubric": "", "examples": [], "temperature": 0.4}
    ),
    "college_id": "col-1",
    "min_cgpa": 7.0,
    "allowed_branches": ["CSE"],
    "exam_id": "e1",
    "created_by": "rec-1",
}


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------

def test_drive_college_metadata_roundtrip():
    encoded = serialize_drive_colleges("Nice role", ["c1", "c2"], {"persona": "friendly"})
    parsed = deserialize_drive_colleges(encoded)
    assert parsed["description"] == "Nice role"
    assert parsed["college_ids"] == ["c1", "c2"]
    assert parsed["aiConfig"]["persona"] == "friendly"

    # Malformed metadata falls back to defaults instead of raising.
    broken = deserialize_drive_colleges("desc\n\n===METADATA===\n{not-json")
    assert broken["college_ids"] == []
    assert broken["aiConfig"]["temperature"] == 0.4
    assert deserialize_drive_colleges(None)["description"] == ""


def test_get_drive_college_ids_prefers_metadata_then_legacy_column():
    assert get_drive_college_ids(DRIVE_ROW) == ["col-1"]
    legacy = {"company_description": "plain", "college_id": "col-9"}
    assert get_drive_college_ids(legacy) == ["col-9"]
    assert get_drive_college_ids({}) == []


# ---------------------------------------------------------------------------
# find_eligible_candidates
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_find_eligible_candidates_applies_branch_and_cgpa_filters():
    rows = [{"user_id": "u1", "name": "Asha", "cgpa": 8.5}]
    drive = dict(DRIVE_ROW, allowed_branches=["CSE", "ECE"], min_cgpa=7.5)
    conn = FakeConn([rows])
    with patch("app.routers.recruiter_drives.get_connection", new=lambda: conn):
        eligible = await find_eligible_candidates(drive)
    assert eligible == rows

    sql, params = conn.cursor().executed[0]
    assert "AND cp.branch IN %s" in sql
    assert params == [("col-1",), 7.5, ("CSE", "ECE")]

    # No colleges resolves to no candidates without touching the database.
    with patch("app.routers.recruiter_drives.get_connection", side_effect=AssertionError("must not query")):
        assert await find_eligible_candidates({"allowed_branches": []}) == []


# ---------------------------------------------------------------------------
# create / list drives
# ---------------------------------------------------------------------------

def _job_request(**overrides):
    payload = {
        "title": "SDE Day",
        "company_name": "Acme",
        "college_id": "col-1",
        "allowed_branches": ["cse"],
        "min_cgpa": 7.0,
    }
    payload.update(overrides)
    return CreateJobRequest(**payload)


@pytest.mark.asyncio
async def test_create_drive_rejects_invalid_payload():
    with pytest.raises(HTTPException) as exc:
        await create_drive(_job_request(title="   "), user=RECRUITER)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_create_drive_blocks_exam_not_owned_by_recruiter():
    mock_db = sequence_db(query(data={"id": "e1", "created_by": "someone-else"}))
    with patch("app.routers.recruiter_drives.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await create_drive(_job_request(exam_id="e1"), user=RECRUITER)
    assert exc.value.status_code == 403

    mock_db = sequence_db(query(data=None))
    with patch("app.routers.recruiter_drives.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await create_drive(_job_request(exam_id="e1"), user=RECRUITER)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_create_drive_registers_eligible_candidates():
    eligible = [
        {"user_id": "u1", "name": "Asha", "email": "asha@x.com", "cgpa": 8.5},
        {"user_id": "u2", "name": "Ben", "email": "", "cgpa": 7.9},
    ]
    chains = [
        query(data={"id": "e1", "created_by": "rec-1"}),  # exam ownership check
        query(data=DRIVE_ROW),                            # job insert
        query(data=[{"id": "cs-1"}]),                     # candidate_status upsert
        query(data=[{"id": "ea-1"}]),                     # exam_assignments upsert
        query(data=[{"id": "col-1", "name": "College", "code": "C1"}]),  # colleges
    ]
    stage = AsyncMock()
    email = MagicMock()
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)), \
         patch("app.routers.recruiter_drives.get_connection",
               new=lambda: fake_connection([eligible])), \
         patch("app.routers.recruiter_drives.record_pipeline_stage", stage), \
         patch("app.routers.recruiter_drives.send_drive_registered_email", email):
        result = await create_drive(_job_request(exam_id="e1"), user=RECRUITER)

    assert result["message"] == "Drive created"
    assert result["eligibleCount"] == 2
    assert result["drive"]["company_description"] == "Build things"
    assert result["drive"]["colleges"][0]["code"] == "C1"

    inserted = chains[1].insert.call_args[0][0]
    assert inserted["allowed_branches"] == ["CSE"]  # normalized to upper case
    assert inserted["interview_pass_score"] == 60   # defaults applied
    assert inserted["created_by"] == "rec-1"

    registrations = chains[2].upsert.call_args[0][0]
    assert [r["candidate_id"] for r in registrations] == ["u1", "u2"]
    assert all(r["status"] == "registered" for r in registrations)

    assignments = chains[3].upsert.call_args[0][0]
    assert all(a["exam_id"] == "e1" for a in assignments)
    assert stage.await_count == 2
    email.assert_called_once()  # candidate without an email is skipped


@pytest.mark.asyncio
async def test_get_drives_enriches_colleges_and_reports_errors():
    drives = [
        dict(DRIVE_ROW, company_description=serialize_drive_colleges("desc", ["col-1"], None)),
        dict(DRIVE_ROW, id="d2", company_description="legacy", college_id="col-2"),
    ]
    chains = [
        query(data=drives, count=2),
        query(data=[{"id": "col-1", "name": "A", "code": "A1"},
                    {"id": "col-2", "name": "B", "code": "B1"}]),
    ]
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)):
        result = await get_drives(page=2, limit=5, user=RECRUITER)

    assert result["total"] == 2
    assert result["page"] == 2 and result["limit"] == 5
    assert result["drives"][0]["college_ids"] == ["col-1"]
    assert result["drives"][0]["company_description"] == "desc"
    # Legacy row falls back to the college_id column.
    assert result["drives"][1]["college_ids"] == ["col-2"]

    with patch("app.routers.recruiter_drives.db",
               sequence_db(query(data=None, error=MagicMock(message="db down")))):
        with pytest.raises(HTTPException) as exc:
            await get_drives(user=RECRUITER)
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# eligibility endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_eligible_candidates_for_drive_404s_when_missing():
    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await get_eligible_candidates_for_drive("d1", user=RECRUITER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_eligible_count_breaks_down_branches():
    candidates = [
        {"branch": "CSE", "cgpa": 8.5},
        {"branch": "CSE", "cgpa": 7.5},
        {"branch": "ECE", "cgpa": 9.0},
    ]
    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=DRIVE_ROW))), \
         patch("app.routers.recruiter_drives.get_connection",
               new=lambda: fake_connection([candidates])):
        result = await get_eligible_count("d1", user=RECRUITER)

    # admin passes the ownership check without created_by matching
    assert result["totalEligible"] == 3
    cse = result["branchBreakdown"][0]
    assert cse == {"branch": "CSE", "count": 2, "avgCgpa": 8.0, "minCgpa": 7.5, "maxCgpa": 8.5}

    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=dict(DRIVE_ROW, created_by="other")))):
        with pytest.raises(HTTPException) as exc:
            await get_eligible_count("d1", user=RECRUITER)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# assign exam / ai config
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assign_exam_scopes_access_and_upserts_assignments():
    eligible = [{"user_id": "u1", "name": "Asha", "email": "a@x.com", "cgpa": 8.0}]
    chains = [
        query(data=DRIVE_ROW),                            # drive lookup
        query(data={"id": "e2", "created_by": "rec-1"}),  # exam lookup
        query(data=[{"id": "d1"}]),                       # update job
        query(data=[{"id": "ea-1"}]),                     # exam_assignments upsert
    ]
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)), \
         patch("app.routers.recruiter_drives.get_connection",
               new=lambda: fake_connection([eligible])):
        result = await assign_exam_to_drive("d1", AssignExamRequest(exam_id="e2"), user=RECRUITER)
    assert result["message"] == "Exam assigned successfully"
    assert chains[2].update.call_args[0][0] == {"exam_id": "e2"}
    assignment = chains[3].upsert.call_args[0][0][0]
    assert assignment == {"exam_id": "e2", "candidate_id": "u1",
                          "assigned_by": "rec-1", "job_id": "d1"}

    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=None))):
        with pytest.raises(HTTPException) as exc:
            await assign_exam_to_drive("missing", AssignExamRequest(exam_id="e2"), user=RECRUITER)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_ai_config_get_and_save():
    with patch("app.routers.recruiter_drives.db",
               sequence_db(query(data={"company_description": DRIVE_ROW["company_description"]}))):
        result = await get_ai_config("d1", user=RECRUITER)
    assert result["aiConfig"]["persona"] == "strict"

    save_chain = query(data={"id": "d1"})
    chains = [query(data=DRIVE_ROW), save_chain]
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)):
        result = await save_ai_config(
            "d1", SaveAiConfigRequest(aiConfig={"persona": "friendly"}), user=RECRUITER
        )
    assert result["message"] == "AI Config saved successfully"
    saved_blob = save_chain.update.call_args[0][0]["company_description"]
    assert "friendly" in saved_blob
    assert deserialize_drive_colleges(saved_blob)["college_ids"] == ["col-1"]


# ---------------------------------------------------------------------------
# AI evaluation / shortlisting
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_test_evaluation_uses_fallback_without_ai_key():
    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=dict(DRIVE_ROW)))), \
         patch("app.routers.recruiter_drives.has_ai_key", return_value=False):
        result = await evaluate_test_answer(
            "d1", {"question": "Q?", "answer": "one two three four five"}, user=RECRUITER
        )
    assert result == {"score": 40.0, "feedback": "API key not configured. Fallback grading is active."}


@pytest.mark.asyncio
async def test_test_evaluation_scores_via_llm_when_configured():
    generator = AsyncMock(return_value={"score": 88, "feedback": "Strong answer"})
    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=dict(DRIVE_ROW)))), \
         patch("app.routers.recruiter_drives.has_ai_key", return_value=True), \
         patch("app.routers.recruiter_drives.generate_json", generator):
        result = await evaluate_test_answer(
            "d1",
            {"question": "Q?", "answer": "A", "aiConfig": {"persona": "VP", "rubric": "be strict"}},
            user=RECRUITER,
        )
    assert result == {"score": 88.0, "feedback": "Strong answer"}
    prompt = generator.call_args[0][0]
    assert "VP" in prompt and "be strict" in prompt

    with patch("app.routers.recruiter_drives.db",
               sequence_db(query(data=dict(DRIVE_ROW, created_by="other")))):
        with pytest.raises(HTTPException) as exc:
            await evaluate_test_answer("d1", {"question": "Q?"}, user=RECRUITER)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_ai_shortlist_empty_criteria_and_empty_pool():
    with pytest.raises(HTTPException) as exc:
        await ai_shortlist(AiShortlistRequest(criteria="   "), user=RECRUITER)
    assert exc.value.status_code == 400

    mock_db = sequence_db(query(data=[]), query(data=[]))
    with patch("app.routers.recruiter_drives.db", mock_db):
        result = await ai_shortlist(AiShortlistRequest(criteria="top coders"), user=RECRUITER)
    assert result == {"shortlist": []}


@pytest.mark.asyncio
async def test_ai_shortlist_summarizes_candidates_for_llm():
    profiles = [{"user_id": "u1", "cgpa": 8.0, "skills": ["python"], "branch": "CSE"}]
    chains = [
        query(data=profiles),
        query(data=[{"id": "u1", "name": "Asha"}]),
        query(data=[{"score": 80}, {"score": 60}]),
        query(data=[{"communication_score": 70}]),
    ]
    generator = AsyncMock(return_value={"shortlist": [{"candidate_id": "u1", "rank": 1}]})
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)), \
         patch("app.routers.recruiter_drives.generate_json", generator):
        result = await ai_shortlist(AiShortlistRequest(criteria="strong python"), user=RECRUITER)

    assert result["shortlist"] == [{"candidate_id": "u1", "rank": 1}]
    payload = generator.call_args[0][0]
    assert '"avgExamScore": 70' in payload
    assert '"avgCommScore": 70' in payload
    assert generator.call_args[1]["systemPrompt"].startswith("You are an AI recruiting assistant")


@pytest.mark.asyncio
async def test_predictive_shortlist_ranks_by_composite_score():
    candidates = [{"id": "u1", "name": "Asha", "email": "a@x.com"},
                  {"id": "u2", "name": "Ben", "email": "b@x.com"}]
    chains = [
        query(data=candidates),
        query(data=[{"user_id": "u1", "cgpa": 8.0, "branch": "CSE", "college_id": "col-1"}]),
        query(data=[{"id": "a1", "candidate_id": "u1", "score": 80, "status": "completed",
                     "exams": {"total_marks": 100}}]),
        query(data=[{"attempt_id": "a1", "score": 8, "coding_questions": {"marks": 10}}]),
        query(data=[{"id": "j1"}]),
        query(data=[{"candidate_id": "u1", "score": 90, "selected": True}]),
        query(data=[{"candidate_id": "u1", "event_type": "violation"}]),
    ]
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)):
        result = await get_predictive_shortlist(user=RECRUITER)

    assert result["total"] == 2
    top, bottom = result["candidates"]
    assert top["candidateId"] == "u1"
    assert top["rank"] == 1 and top["tier"] == "top"
    assert top["compositeScore"] == 83  # .30*80 + .25*80 + .15*80 + .20*90 + .10*90
    assert top["violations"] == 1
    assert bottom["tier"] == "bottom" and bottom["compositeScore"] == 10

    with patch("app.routers.recruiter_drives.db", sequence_db(query(data=[]))):
        assert await get_predictive_shortlist(user=RECRUITER) == {"candidates": []}


# ---------------------------------------------------------------------------
# offer letters
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_offer_letter_stores_pdf_and_notifies(tmp_path):
    chains = [
        query(data={"id": "j1", "created_by": "rec-1", "title": "SDE", "company_name": "Acme"}),
        query(data={"id": "u1", "role": "candidate"}),
        query(data=[{"id": "cs-1"}]),  # candidate_status update
        query(data=[{"id": "af-1"}]),  # activity_feed insert
    ]
    notify = AsyncMock()
    stage = AsyncMock()
    with patch("app.routers.recruiter_drives.db", sequence_db(*chains)), \
         patch("app.routers.recruiter_drives.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 fake")), \
         patch("app.routers.recruiter_drives.storage_root", str(tmp_path)), \
         patch("app.routers.recruiter_drives.send_realtime_notification", notify), \
         patch("app.routers.recruiter_drives.record_pipeline_stage", stage):
        result = await upload_offer_letter("u1", "j1", offerLetter=MagicMock(), user=RECRUITER)

    assert result["status"] == "offered"
    offer_dir = tmp_path / "offers"
    pdfs = os.listdir(offer_dir)
    assert len(pdfs) == 1 and pdfs[0].endswith(".pdf")

    status_payload = chains[2].update.call_args[0][0]
    assert status_payload["status"] == "offered"
    assert status_payload["offer_letter_url"] == f"/uploads/offers/{pdfs[0]}"
    stage.assert_awaited_once()
    notify.assert_awaited_once()

    foreign = sequence_db(query(data={"id": "j1", "created_by": "someone-else"}))
    with patch("app.routers.recruiter_drives.db", foreign):
        with pytest.raises(HTTPException) as exc:
            await upload_offer_letter("u1", "j1", offerLetter=MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 403

    not_a_candidate = [
        query(data={"id": "j1", "created_by": "rec-1", "title": "SDE", "company_name": "Acme"}),
        query(data={"id": "u1", "role": "recruiter"}),
    ]
    with patch("app.routers.recruiter_drives.db", sequence_db(*not_a_candidate)):
        with pytest.raises(HTTPException) as exc:
            await upload_offer_letter("u1", "j1", offerLetter=MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 404
