"""Helper and route coverage for app/routers/candidate_profile.py.

Filesystem writes are confined to pytest's tmp_path, and the PDF validator /
parser are faked at the module boundary so only the scoring logic executes.
DB access goes through the shared `db_mocks` builder.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.routers.candidate_profile import (
    OnboardingRequest,
    UpdateProfileRequest,
    check_ats_parseability,
    delete_resume,
    detect_passive_voice,
    detect_verb_repetition,
    extract_education,
    extract_timeline,
    onboarding,
    update_profile,
    upload_resume,
)
from tests.db_mocks import db_routing, query, sequence_db

USER = {"id": "user-1"}

RICH_RESUME = """ASHA VERMA
asha@example.com | +1 555 123 4567 | github.com/asha | linkedin.com/in/asha

EXPERIENCE
Designed and developed a Python React SQL Docker platform serving 500 users with 30% faster requests.

PROJECTS
Built a Django REST API with PostgreSQL, Docker and Kubernetes for 200 users.

EDUCATION
B.Tech Computer Science 2019 - 2023 CGPA: 8.5/10

SKILLS
Python, React, SQL, Docker, AWS, Git, CI/CD
Certified AWS developer; hackathon winner with rank 2.
"""


def fake_pdf(*page_texts):
    """Stand-in for ``pdfplumber.open(...)``: a document context manager."""
    doc = MagicMock()
    doc.__enter__.return_value = doc
    doc.pages = []
    for text in page_texts:
        page = MagicMock()
        page.extract_text.return_value = text
        doc.pages.append(page)
    return doc


# ---------------------------------------------------------------------------
# pure helpers
# ---------------------------------------------------------------------------

def test_check_ats_parseability_flags_low_yield_headers_and_tabs():
    text = "no standard sections\n" + "\t" * 21 + "body"
    result = check_ats_parseability(text, {"numPages": 2})

    severities = [issue["severity"] for issue in result["issues"]]
    assert severities == ["high", "high", "low"]
    assert result["score"] == 35
    assert "extractable text per page" in result["issues"][0]["msg"]
    assert "section headers" in result["issues"][1]["msg"]
    assert "tab key" in result["issues"][2]["msg"]


def test_check_ats_parseability_flags_fragments_and_special_characters():
    text = "é" * 40 + "\na\nb\nc\nd\nexperience\n"
    result = check_ats_parseability(text)

    severities = [issue["severity"] for issue in result["issues"]]
    assert severities == ["medium", "low"]
    assert result["score"] == 80
    assert "fragmented lines" in result["issues"][0]["msg"]
    assert "special/non-standard characters" in result["issues"][1]["msg"]


def test_check_ats_parseability_empty_text_only_flags_missing_headers():
    result = check_ats_parseability("")
    assert result["score"] == 70
    assert [issue["severity"] for issue in result["issues"]] == ["high"]


def test_extract_education_parses_degrees_cgpa_and_years():
    text = (
        "B.Tech in Computer Science 2019 - 2023 CGPA: 8.5/10\n"
        "Internship at Contoso\n"
        "M.Sc Physics, GPA 9.0"
    )
    entries = extract_education(text)

    assert len(entries) == 2
    assert entries[0] == {
        "raw": "B.Tech in Computer Science 2019 - 2023 CGPA: 8.5/10",
        "degree": "B.Tech",
        "cgpa": "8.5",
        "cgpaScale": "10",
        "years": "2019 - 2023",
    }
    assert entries[1]["degree"] == "M.Sc"
    assert entries[1]["cgpa"] == "9.0"
    assert entries[1]["cgpaScale"] is None
    assert entries[1]["years"] is None


def test_extract_timeline_sorts_ranges_and_reports_gaps():
    text = "2021 - present college\n2018 - 2020 internship\n2023 - 2024 job"
    result = extract_timeline(text)

    assert [r["startYear"] for r in result["ranges"]] == [2018, 2021, 2023]
    assert result["gaps"] == [{"from": 2020, "to": 2021, "years": 1}]
    assert result["ranges"][1]["endYear"] >= 2025  # 'present' resolves to now


def test_detect_passive_voice_and_verb_repetition():
    passive = detect_passive_voice("The report was deployed by the team and the tests are fixed")
    assert passive == {"count": 2, "examples": ["was", "are"]}
    assert detect_passive_voice("The team shipped everything") == {"count": 0, "examples": []}

    # Irregular participles ("was built", "was written") are counted too.
    irregular = detect_passive_voice("The bridge was built in 1990 and the letter was written yesterday")
    assert irregular == {"count": 2, "examples": ["was", "was"]}

    overused = detect_verb_repetition(
        "built built built built managed managed designed",
        ["built", "managed", "designed"],
    )
    assert overused == [{"verb": "built", "count": 4}]


# ---------------------------------------------------------------------------
# profile endpoints (error paths not covered by test_candidate_routers.py)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_update_profile_surfaces_db_error():
    q = query(data=None, error={"message": "profile write failed"})
    with patch("app.routers.candidate_profile.db", db_routing({"candidate_profiles": q})):
        with pytest.raises(HTTPException) as exc:
            await update_profile(UpdateProfileRequest(phone="555"), user=USER)
    assert exc.value.status_code == 400
    assert exc.value.detail == "profile write failed"

    # Error dicts without a message fall back to generic copy.
    q = query(data=None, error={"code": "23505"})
    with patch("app.routers.candidate_profile.db", db_routing({"candidate_profiles": q})):
        with pytest.raises(HTTPException) as exc:
            await update_profile(UpdateProfileRequest(phone="555"), user=USER)
    assert exc.value.detail == "Failed to update profile"


@pytest.mark.asyncio
async def test_onboarding_surfaces_user_update_error():
    db = sequence_db(query(data=None, error={"message": "user update failed"}))
    req = OnboardingRequest(
        password="StrongPass123", phone="555", skills=["Python"], domain_preference="Backend",
    )
    with patch("app.routers.candidate_profile.db", db), \
         patch("app.routers.candidate_profile.hash_password", return_value="hashed"), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern") as cache:
        with pytest.raises(HTTPException) as exc:
            await onboarding(req, user=USER)
    assert exc.value.status_code == 400
    assert exc.value.detail == "user update failed"
    cache.assert_not_called()


@pytest.mark.asyncio
async def test_onboarding_surfaces_profile_update_error():
    db = sequence_db(
        query(data={"id": "user-1"}),
        query(data=None, error={"message": "onboarding write failed"}),
    )
    req = OnboardingRequest(
        password="StrongPass123", phone="555", skills=["Python"], domain_preference="Backend",
    )
    with patch("app.routers.candidate_profile.db", db), \
         patch("app.routers.candidate_profile.hash_password", return_value="hashed"), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern") as cache:
        with pytest.raises(HTTPException) as exc:
            await onboarding(req, user=USER)
    assert exc.value.detail == "onboarding write failed"
    cache.assert_not_called()


# ---------------------------------------------------------------------------
# resume upload pipeline
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_resume_full_pipeline(tmp_path):
    q_cp = query(data={"user_id": "user-1", "resume_url": "/uploads/resumes/stored.pdf"})
    db = db_routing({"candidate_profiles": q_cp})
    pdf = fake_pdf(RICH_RESUME, "Extra page: 2020 - 2021 Python projects")
    upload = MagicMock()

    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 fake resume")), \
         patch("app.routers.candidate_profile.pdfplumber.open", return_value=pdf), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern") as cache, \
         patch("app.routers.candidate_profile.db", db):
        result = await upload_resume(upload, user=USER)

    assert result["message"] == "Resume parsed successfully"
    assert result["profile"]["resume_url"] == "/uploads/resumes/stored.pdf"
    cache.assert_called_once_with("portfolio:*")

    written = list((tmp_path / "resumes").glob("*.pdf"))
    assert len(written) == 1
    assert written[0].read_bytes() == b"%PDF-1.4 fake resume"

    payload = q_cp.update.call_args[0][0]
    assert payload["resume_url"].startswith("/uploads/resumes/")
    assert "Python" in payload["skills"]
    analysis = payload["resume_ats_analysis"]
    assert 0 < analysis["atsScore"] <= 100
    assert analysis["tier"] in {"Excellent", "Good", "Fair", "Poor"}
    assert analysis["gaps"] == ["No major gaps."]  # SQL was found in the resume
    assert analysis["suggestedRoles"] == ["Backend Developer", "Software Engineer"]
    q_cp.eq.assert_called_with("user_id", "user-1")


@pytest.mark.asyncio
async def test_upload_resume_without_known_skills_falls_back(tmp_path):
    q_cp = query(data={"user_id": "user-1"})
    db = db_routing({"candidate_profiles": q_cp})
    pdf = fake_pdf("Just a plain note with an email a@b.co and no tech words.")
    upload = MagicMock()

    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 text")), \
         patch("app.routers.candidate_profile.pdfplumber.open", return_value=pdf), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern"), \
         patch("app.routers.candidate_profile.db", db):
        await upload_resume(upload, user=USER)

    payload = q_cp.update.call_args[0][0]
    assert payload["skills"] == ["Software Engineering"]
    analysis = payload["resume_ats_analysis"]
    assert analysis["tier"] == "Poor"
    assert analysis["summary"] == "Fair profile setup."
    assert analysis["gaps"] == ["Database systems & SQL experience"]


@pytest.mark.asyncio
async def test_upload_resume_rejects_unparsable_pdf(tmp_path):
    db = MagicMock()
    upload = MagicMock()
    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 corrupt")), \
         patch("app.routers.candidate_profile.pdfplumber.open",
               side_effect=RuntimeError("corrupt pdf")), \
         patch("app.routers.candidate_profile.db", db):
        with pytest.raises(HTTPException) as exc:
            await upload_resume(upload, user=USER)

    assert exc.value.status_code == 400
    assert exc.value.detail == "Failed to parse PDF: corrupt pdf"
    db.from_.assert_not_called()


@pytest.mark.asyncio
async def test_upload_resume_rejects_pdf_with_no_extractable_text(tmp_path):
    db = MagicMock()
    pdf = fake_pdf("", None)
    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 empty")), \
         patch("app.routers.candidate_profile.pdfplumber.open", return_value=pdf), \
         patch("app.routers.candidate_profile.db", db):
        with pytest.raises(HTTPException) as exc:
            await upload_resume(MagicMock(), user=USER)

    assert exc.value.status_code == 400
    assert "Could not extract text" in exc.value.detail
    db.from_.assert_not_called()


@pytest.mark.asyncio
async def test_upload_resume_surfaces_profile_update_error(tmp_path):
    q_cp = query(data=None, error={"message": "resume save failed"})
    db = db_routing({"candidate_profiles": q_cp})
    pdf = fake_pdf("Python developer. Built tools for 100 users. a@b.co")
    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.read_validated_pdf",
               new=AsyncMock(return_value=b"%PDF-1.4 text")), \
         patch("app.routers.candidate_profile.pdfplumber.open", return_value=pdf), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern") as cache, \
         patch("app.routers.candidate_profile.db", db):
        with pytest.raises(HTTPException) as exc:
            await upload_resume(MagicMock(), user=USER)

    assert exc.value.status_code == 400
    assert exc.value.detail == "resume save failed"
    cache.assert_not_called()


@pytest.mark.asyncio
async def test_delete_resume_tolerates_missing_file_on_disk(tmp_path):
    cur_q = query(data={"resume_url": "/uploads/resumes/never-written.pdf"})
    up_q = query(data={"user_id": "user-1", "resume_url": None})
    db = sequence_db(cur_q, up_q)

    with patch("app.routers.candidate_profile.storage_root", str(tmp_path)), \
         patch("app.routers.candidate_profile.Cache.invalidate_pattern") as cache, \
         patch("app.routers.candidate_profile.db", db):
        result = await delete_resume(user=USER)

    assert result == {"message": "Resume deleted successfully", "profile": up_q.data}
    assert up_q.update.call_args[0][0] == {"resume_url": None, "resume_ats_analysis": None}
    cache.assert_called_once_with("portfolio:*")
