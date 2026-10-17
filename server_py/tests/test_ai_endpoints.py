"""Tests for app.ai — LLM routes, marksheet OCR pipeline and pure helpers.

External Groq calls are replaced with a fake httpx.AsyncClient; OCR/PDF
libraries are patched at the module boundary so no binary parsing happens.
Route handlers carry slowapi decorators, but the limiter is disabled under
pytest (see app.rate_limit), so they are called directly.
"""
import base64
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from app.ai import (
    GenerateCodingRequest,
    GenerateJsonRequest,
    GenerateMcqRequest,
    GenerateTextRequest,
    ImprovementReportRequest,
    MarksheetFile,
    ResumeParseRequest,
    ProctoringVerifyRequest,
    _ai_correct_marksheet,
    _extract_marksheet_text,
    create_improvement_report,
    extract_marksheet_result,
    generate_coding_endpoint,
    generate_json,
    generate_json_route,
    generate_mcq_endpoint,
    generate_text_route,
    get_profile_stats,
    has_ai_key,
    infer_graduation_year,
    normalize_branch,
    ocr_marksheet,
    parse_marksheet_text,
    pick_skills,
    resume_parse,
    verify_proctoring_snapshot,
)
from tests.db_mocks import db_routing, query, sequence_db

USER = {"id": "u1", "role": "candidate"}

COMPLETION = {"choices": [{"message": {"content": '{"ok": true}'}}]}


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload


class FakeAsyncClient:
    """Stands in for httpx.AsyncClient as an async context manager."""

    def __init__(self, response=None, exc=None):
        self._response = response
        self._exc = exc
        self.posts = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def post(self, url, **kwargs):
        self.posts.append((url, kwargs))
        if self._exc is not None:
            raise self._exc
        return self._response


def fake_http(response=None, exc=None):
    """Patch app.ai.httpx.AsyncClient with a fake returning `response`."""
    client = FakeAsyncClient(response=response, exc=exc)
    return client, patch("app.ai.httpx.AsyncClient", lambda *a, **k: client)


def unwrap(fn):
    """Return the raw coroutine behind a slowapi-decorated route.

    slowapi keeps the original function under __wrapped__; unit tests call it
    directly instead of going through the limiter wrapper (same approach as
    the log_event tests in test_queue_manager.py).
    """
    return getattr(fn, "__wrapped__", fn)


def completion_response(content: str, status_code: int = 200):
    return FakeResponse(status_code, {"choices": [{"message": {"content": content}}]})


# ---------------------------------------------------------------------------
# pure helpers
# ---------------------------------------------------------------------------

def test_normalize_branch_maps_known_and_falls_back():
    assert normalize_branch("computer science and engineering") == "CSE"
    assert normalize_branch("  Information   Technology ") == "IT"
    assert normalize_branch(None) == "UNKNOWN"
    assert normalize_branch(42) == "UNKNOWN"
    # Contains a mapped key as a substring but is not an exact match.
    assert normalize_branch("B.Tech Mechanical Engineering (Sandwich)") == "MECH"
    # Completely unknown branches are truncated to 10 chars.
    assert normalize_branch("Robotics and Automation") == "ROBOTICS A"


def test_infer_graduation_year_handles_ranges_semesters_and_plain_years():
    assert infer_graduation_year("Batch 2022-23") == 2023
    assert infer_graduation_year("Academic Year 2023-2024") == 2024
    # Semester prefixes add remaining years to the latest visible year.
    assert infer_graduation_year("III YEAR B.TECH, exam held 2026") == 2027
    assert infer_graduation_year("IV YEAR, examination 2026") == 2026
    assert infer_graduation_year("Admission Year 2021") == 2021
    assert infer_graduation_year("no years in this text") is None


def test_parse_marksheet_text_extracts_full_record():
    text = (
        "HALL TICKET NO: 24261A0522\n"
        "Name of the Student: Asha Verma\n"
        "Branch: Computer Science and Engineering\n"
        "CGPA: 8.72\n"
        "Batch 2022-23\n"
    )
    result = parse_marksheet_text(text, "marksheet.pdf")
    assert result["roll_number"] == "24261A0522"
    assert result["name"] == "Asha Verma"
    assert result["branch"] == "CSE"
    assert result["cgpa"] == 8.72
    assert result["graduation_year"] == 2023
    assert result["confidence"] == 1.0
    assert result["warnings"] == []
    assert result["source_file"] == "marksheet.pdf"


def test_parse_marksheet_text_reports_missing_fields():
    result = parse_marksheet_text("Totally unrelated document", "scan.png")
    assert result["roll_number"] == ""
    assert result["name"] == ""
    assert result["branch"] == ""
    assert result["cgpa"] == 0.0
    assert result["graduation_year"] == 0
    assert result["confidence"] == 0.0
    assert set(result["warnings"]) == {
        "roll_number not detected", "name not detected", "branch not detected",
        "cgpa not detected", "graduation_year not detected",
    }


def test_parse_marksheet_text_uses_name_line_heuristic():
    text = "ASHA VERMA\nHALL TICKET NO: 123456789\nBRANCH: INFORMATION TECHNOLOGY\nCGPA 7.5"
    result = parse_marksheet_text(text, "scan.png")
    assert result["name"] == "ASHA VERMA"
    assert result["branch"] == "IT"


def test_pick_skills_matches_only_known_skills():
    # "PostgreSQL" does not match the "postgres" skill (word boundary), and
    # "javascript" does not match inside "java".
    skills = pick_skills("Built APIs with Python, React and PostgreSQL. Also DSA and system design.")
    assert skills == ["python", "react", "dsa"]
    assert pick_skills("uses Postgres, Java and JavaScript daily") == ["javascript", "java", "postgres"]
    assert pick_skills("no tech words at all") == []
    assert pick_skills(None) == []


# ---------------------------------------------------------------------------
# file extraction
# ---------------------------------------------------------------------------

def test_extract_marksheet_text_reads_pdf_pages():
    page_one, page_two = MagicMock(), MagicMock()
    page_one.extract_text.return_value = "first page"
    page_two.extract_text.return_value = "second page"
    pdf = MagicMock()
    pdf.__enter__.return_value.pages = [page_one, page_two]
    with patch("app.ai.pdfplumber.open", return_value=pdf):
        text = _extract_marksheet_text(b"%PDF", "application/pdf")
    assert text == "first page\nsecond page"

    with patch("app.ai.pdfplumber.open", side_effect=RuntimeError("corrupt pdf")):
        with pytest.raises(HTTPException) as exc:
            _extract_marksheet_text(b"%PDF", "application/pdf")
    assert exc.value.status_code == 400
    assert "PDF extraction failed" in exc.value.detail


def test_extract_marksheet_text_ocrs_images():
    with patch("app.ai.Image.open", return_value=MagicMock()), \
         patch("app.ai.pytesseract.image_to_string", return_value="ocr text"):
        assert _extract_marksheet_text(b"\x89PNG", "image/png") == "ocr text"

    with patch("app.ai.Image.open", side_effect=RuntimeError("bad image")):
        with pytest.raises(HTTPException) as exc:
            _extract_marksheet_text(b"junk", "image/png")
    assert "OCR extraction failed" in exc.value.detail


@pytest.mark.asyncio
async def test_extract_marksheet_result_strips_data_url_and_returns_fields():
    parsed = {"roll_number": "24261A0522", "name": "Asha", "confidence": 0.9}
    data = "data:application/pdf;base64," + base64.b64encode(b"%PDF").decode()
    with patch("app.ai._extract_marksheet_text", return_value="raw text"), \
         patch("app.ai.parse_marksheet_text", return_value=parsed) as parse, \
         patch("app.ai._ai_correct_marksheet", new=AsyncMock()) as correct:
        result = await extract_marksheet_result("sheet.pdf", "application/pdf", data)
    assert result == parsed
    parse.assert_called_once_with("raw text", "sheet.pdf")
    correct.assert_awaited_once()


@pytest.mark.asyncio
async def test_extract_marksheet_result_rejects_bad_input_and_empty_results():
    with pytest.raises(HTTPException) as exc:
        await extract_marksheet_result("sheet.pdf", "application/pdf", "a")  # bad padding
    assert "Invalid base64 encoding" in exc.value.detail

    no_fields = {"roll_number": "", "name": "", "confidence": 0.0}
    with patch("app.ai._extract_marksheet_text", return_value="text"), \
         patch("app.ai.parse_marksheet_text", return_value=no_fields), \
         patch("app.ai._ai_correct_marksheet", new=AsyncMock()):
        with pytest.raises(HTTPException) as exc:
            await extract_marksheet_result("scan.png", "image/png",
                                           base64.b64encode(b"img").decode())
    assert exc.value.status_code == 400
    assert "Could not extract student data" in exc.value.detail


@pytest.mark.asyncio
async def test_ocr_endpoint_delegates_to_shared_extractor():
    extracted = {"roll_number": "R1", "name": "Asha"}
    payload = MarksheetFile(name="s.pdf", mimeType="application/pdf", data="ZGF0YQ==")
    with patch("app.ai.extract_marksheet_result", new=AsyncMock(return_value=extracted)) as inner:
        result = await unwrap(ocr_marksheet)(MagicMock(), payload, user=USER)
    assert result == extracted
    inner.assert_awaited_once_with("s.pdf", "application/pdf", "ZGF0YQ==")


# ---------------------------------------------------------------------------
# _ai_correct_marksheet
# ---------------------------------------------------------------------------

def low_confidence_result():
    return {
        "roll_number": "", "name": "", "branch": "", "cgpa": 0.0,
        "graduation_year": 0, "confidence": 0.2, "warnings": ["name not detected"],
        "source_file": "s.pdf",
    }


@pytest.mark.asyncio
async def test_ai_correction_skips_high_confidence_and_missing_key():
    confident = dict(low_confidence_result(), confidence=0.9)
    _, httpx_patch = fake_http()
    with httpx_patch:
        await _ai_correct_marksheet(confident, "s.pdf", "text")
    assert confident["name"] == ""  # untouched, no HTTP call made

    with patch("app.ai.GROQ_API_KEY", None):
        result = low_confidence_result()
        await _ai_correct_marksheet(result, "s.pdf", "text")
    assert result["name"] == ""


@pytest.mark.asyncio
async def test_ai_correction_applies_groq_fields():
    result = low_confidence_result()
    content = json.dumps({
        "roll_number": "24261a0522",
        "name": "Asha Verma",
        "branch": "computer science and engineering",
        "cgpa": "8.7",
        "graduation_year": "2028",
        "confidence": 0.93,
        "warnings": ["roll number verified"],
    })
    client, httpx_patch = fake_http(response=completion_response("```json\n" + content + "\n```"))
    with patch("app.ai.GROQ_API_KEY", "test-key"), httpx_patch:
        await _ai_correct_marksheet(result, "s.pdf", "raw text")

    assert result["roll_number"] == "24261A0522"
    assert result["name"] == "Asha Verma"
    assert result["branch"] == "CSE"
    assert result["cgpa"] == 8.7
    assert result["graduation_year"] == 2028
    assert result["confidence"] == 0.93
    assert result["warnings"] == ["roll number verified"]
    assert "Bearer test-key" in client.posts[0][1]["headers"]["Authorization"]


@pytest.mark.asyncio
async def test_ai_correction_survives_api_failures():
    result = low_confidence_result()
    _, httpx_patch = fake_http(exc=RuntimeError("network down"))
    with patch("app.ai.GROQ_API_KEY", "test-key"), httpx_patch:
        await _ai_correct_marksheet(result, "s.pdf", "raw text")
    assert result["name"] == ""  # logged and swallowed

    _, httpx_patch = fake_http(response=completion_response("not json at all"))
    with patch("app.ai.GROQ_API_KEY", "test-key"), httpx_patch:
        await _ai_correct_marksheet(result, "s.pdf", "raw text")
    assert result["name"] == ""


# ---------------------------------------------------------------------------
# profile stats + generation endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_profile_stats_for_every_role():
    routing = db_routing({
        "users": query(data=[], count=12),
        "exams": query(data=[], count=4),
        "jobs": query(data=[], count=3),
        "candidate_profiles": query(data=[], count=40),
        "attempts": query(data=[], count=5),
    })
    with patch("app.ai.db", routing):
        admin = await get_profile_stats({"id": "a1", "role": "admin"})
        recruiter = await get_profile_stats({"id": "r1", "role": "recruiter"})
        tpo = await get_profile_stats({"id": "t1", "role": "tpo"})
        student = await get_profile_stats({"id": "c1", "role": "candidate"})

    assert admin["stats"][0]["value"] == "12" and admin["stats"][1]["value"] == "4"
    assert recruiter["stats"][1]["value"] == "3"
    assert tpo["stats"][0]["value"] == "40"
    assert student["stats"][0]["value"] == "5"


@pytest.mark.asyncio
async def test_generate_mcq_uses_key_then_falls_back():
    request = GenerateMcqRequest(topic="Graphs", difficulty="hard", count=2)

    with patch("app.ai.GROQ_API_KEY", None):
        sample = await generate_mcq_endpoint(request, user=USER)
    assert sample["questions"][0]["correct_option"] == "A"

    generated = {"questions": [{"question_text": "Q?", "correct_option": "B"}]}
    with patch("app.ai.GROQ_API_KEY", "key"), \
         patch("app.ai.generate_json", new=AsyncMock(return_value=generated)):
        assert await generate_mcq_endpoint(request, user=USER) == generated

    with patch("app.ai.GROQ_API_KEY", "key"), \
         patch("app.ai.generate_json", new=AsyncMock(side_effect=RuntimeError("llm down"))):
        fallback = await generate_mcq_endpoint(request, user=USER)
    assert "Graphs" in fallback["questions"][0]["question_text"]


@pytest.mark.asyncio
async def test_generate_coding_uses_key_then_falls_back():
    request = GenerateCodingRequest(topic="Arrays", difficulty="medium", count=1)

    with patch("app.ai.GROQ_API_KEY", None):
        sample = await generate_coding_endpoint(request, user=USER)
    assert "Arrays" in sample["questions"][0]["title"]

    generated = {"questions": [{"title": "Two Sum"}]}
    with patch("app.ai.GROQ_API_KEY", "key"), \
         patch("app.ai.generate_json", new=AsyncMock(return_value=generated)):
        assert await generate_coding_endpoint(request, user=USER) == generated

    with patch("app.ai.GROQ_API_KEY", "key"), \
         patch("app.ai.generate_json", new=AsyncMock(side_effect=RuntimeError("llm down"))):
        fallback = await generate_coding_endpoint(request, user=USER)
    assert fallback["questions"][0]["marks"] == 10


@pytest.mark.asyncio
async def test_resume_parse_scores_against_job_skills():
    with patch("app.ai.GROQ_API_KEY", None):
        result = await unwrap(resume_parse)(
            MagicMock(),
            ResumeParseRequest(resume_text="Python and React projects", job_skills=["python", "java"]),
            user=USER,
        )
    assert result["matchedSkills"] == ["python"]
    assert result["skillMatchScore"] == 50
    assert "python" in result["summary"]

    scored = await unwrap(resume_parse)(
        MagicMock(), ResumeParseRequest(resume_text="Python React SQL Docker"), user=USER
    )
    assert scored["skillMatchScore"] == 48  # 4 skills * 12

    empty = await unwrap(resume_parse)(MagicMock(), ResumeParseRequest(resume_text="farmer, cook"), user=USER)
    assert empty["skills"] == []
    assert empty["skillMatchScore"] == 0
    assert "no common technical skills" in empty["summary"]


# ---------------------------------------------------------------------------
# improvement report
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_improvement_report_requires_ownership():
    chains = [query(data={"id": "a1", "candidate_id": "someone-else"})]
    with patch("app.ai.db", sequence_db(*chains)):
        with pytest.raises(HTTPException) as exc:
            await create_improvement_report(ImprovementReportRequest(attempt_id="a1"), user=USER)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_improvement_report_returns_existing_or_creates_one():
    attempt = {"id": "a1", "candidate_id": "u1", "score": 70, "exam": {"title": "Midterm"}}
    existing = {"id": "rep1", "content": "cached"}
    with patch("app.ai.db", sequence_db(query(data=attempt), query(data=existing))):
        result = await create_improvement_report(ImprovementReportRequest(attempt_id="a1"), user=USER)
    assert result == existing

    created = {"id": "rep2", "content": "Completed Midterm with a score of 70%."}
    chains = [query(data=attempt), query(data=None), query(data=created)]
    with patch("app.ai.db", sequence_db(*chains)):
        result = await create_improvement_report(ImprovementReportRequest(attempt_id="a1"), user=USER)
    assert result == created
    payload = chains[2].insert.call_args[0][0]
    assert payload["report_type"] == "improvement"
    assert "Midterm" in payload["content"]

    # Missing attempt falls back to generic copy.
    chains = [query(data=None), query(data=None), query(data=None)]
    with patch("app.ai.db", sequence_db(*chains)):
        result = await create_improvement_report(ImprovementReportRequest(attempt_id="ghost"), user=USER)
    assert result["attempt_id"] == "ghost"
    assert "Assessment" in result["content"]


# ---------------------------------------------------------------------------
# proctoring snapshot verification
# ---------------------------------------------------------------------------

def _body(response):
    raw = response.body
    return json.loads(raw.decode() if isinstance(raw, bytes) else raw)


@pytest.mark.asyncio
async def test_proctoring_verify_falls_back_without_key():
    with patch("app.ai.GROQ_API_KEY", None):
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="abc"), user=USER
        )
    assert _body(response)["single_person"] is True


@pytest.mark.asyncio
async def test_proctoring_verify_returns_cleaned_model_json():
    payload = json.dumps({
        "single_person": True, "multiple_people": False,
        "looking_away": False, "phone_detected": True, "summary": "Phone visible.",
    })
    client, httpx_patch = fake_http(response=completion_response("```json\n" + payload + "\n```"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="abc"), user=USER
        )
    assert _body(response)["phone_detected"] is True
    # Raw base64 (no data: prefix) is wrapped into a data URL for the model.
    sent = client.posts[0][1]["json"]["messages"][0]["content"][1]["image_url"]["url"]
    assert sent.startswith("data:image/jpeg;base64,")


@pytest.mark.asyncio
async def test_proctoring_verify_extracts_json_from_prose_and_fallbacks():
    prose = 'Verdict: {"single_person": false, "multiple_people": true, "looking_away": false, "phone_detected": false, "summary": "Two people."} end'
    _, httpx_patch = fake_http(response=completion_response(prose))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="data:image/png;base64,x"), user=USER
        )
    assert _body(response)["multiple_people"] is True

    _, httpx_patch = fake_http(response=completion_response("no json here"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="x"), user=USER
        )
    assert _body(response)["summary"].startswith("Proctoring snapshot audited")

    _, httpx_patch = fake_http(response=FakeResponse(status_code=502, payload={}))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="x"), user=USER
        )
    assert _body(response)["single_person"] is True

    _, httpx_patch = fake_http(exc=RuntimeError("vision down"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(verify_proctoring_snapshot)(
            MagicMock(), ProctoringVerifyRequest(base64DataUrl="x"), user=USER
        )
    assert _body(response)["single_person"] is True


# ---------------------------------------------------------------------------
# text / json gateways + has_ai_key
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generate_text_route_requires_key_and_reports_failures():
    with patch("app.ai.GROQ_API_KEY", None):
        with pytest.raises(HTTPException) as exc:
            await unwrap(generate_text_route)(MagicMock(), GenerateTextRequest(prompt="hi"), user=USER)
    assert exc.value.detail == "GROQ_API_KEY is not configured"

    _, httpx_patch = fake_http(response=completion_response("hello world"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        assert await unwrap(generate_text_route)(
            MagicMock(), GenerateTextRequest(prompt="hi", systemPrompt="be nice"), user=USER
        ) == {"text": "hello world"}

    # Non-200 responses are wrapped by the route's own except: handler.
    _, httpx_patch = fake_http(response=FakeResponse(status_code=500, payload={}))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        with pytest.raises(HTTPException) as exc:
            await unwrap(generate_text_route)(MagicMock(), GenerateTextRequest(prompt="hi"), user=USER)
    assert "Groq API failed" in exc.value.detail

    _, httpx_patch = fake_http(exc=RuntimeError("boom"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        with pytest.raises(HTTPException) as exc:
            await unwrap(generate_text_route)(MagicMock(), GenerateTextRequest(prompt="hi"), user=USER)
    assert "AI generation failed" in exc.value.detail


@pytest.mark.asyncio
async def test_generate_json_route_and_helper_parse_fenced_output():
    with patch("app.ai.GROQ_API_KEY", None):
        with pytest.raises(HTTPException):
            await unwrap(generate_json_route)(MagicMock(), GenerateJsonRequest(prompt="hi"), user=USER)

    _, httpx_patch = fake_http(response=completion_response('{"a": 1}'))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        response = await unwrap(generate_json_route)(MagicMock(), GenerateJsonRequest(prompt="hi"), user=USER)
    assert json.loads(response.body) == {"a": 1}

    _, httpx_patch = fake_http(response=completion_response("```json\n{\"b\": 2}\n```"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        assert await generate_json("prompt") == {"b": 2}

    _, httpx_patch = fake_http(response=completion_response('Sure: {"c": 3} done'))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        assert await generate_json("prompt") == {"c": 3}

    with patch("app.ai.GROQ_API_KEY", None):
        with pytest.raises(ValueError, match="GROQ_API_KEY"):
            await generate_json("prompt")

    _, httpx_patch = fake_http(response=FakeResponse(status_code=429, text="rate limited"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        with pytest.raises(ValueError, match="Groq API failed"):
            await generate_json("prompt")

    _, httpx_patch = fake_http(response=completion_response("no json content"))
    with patch("app.ai.GROQ_API_KEY", "key"), httpx_patch:
        with pytest.raises(json.JSONDecodeError):
            await generate_json("prompt")


def test_has_ai_key_reflects_configuration():
    with patch("app.ai.GROQ_API_KEY", "some-key"):
        assert has_ai_key() is True
    with patch("app.ai.GROQ_API_KEY", None):
        assert has_ai_key() is False
