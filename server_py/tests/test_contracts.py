"""Contract tests for client-facing response shapes and access scoping.

The React client consumes these envelopes verbatim (``interviews``,
``attempts``, ``students``/``failed``, ...). These tests lock the exact
contract so a server-side field rename cannot silently break the UI —
the exact class of bug this suite was created to guard against.

They call the route coroutines directly with a mocked ``db`` builder,
following the established pattern in ``test_candidate_routers.py``.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.ai import MarksheetFile
from app.interview import (
    ScheduleInterviewRequest,
    check_eligibility,
    get_interview,
    get_pending_interviews,
    get_recruiter_pending,
    get_summaries,
    schedule_interview,
)
from app.main import app
from app.tpo import ScanMarksheetsRequest, scan_marksheets

client = TestClient(app)


class _Awaitable(MagicMock):
    def __init__(self, await_result=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._await_result = await_result

    def __await__(self):
        async def _async_func():
            return self._await_result
        return _async_func().__await__()


def _query(data=None, error=None):
    """Mock one ``db.from_(...)`` query builder chain."""
    mock = _Awaitable(MagicMock(data=data, error=error))
    for name in (
        "select", "eq", "neq", "in_", "is_", "or_", "order", "limit",
        "single", "maybeSingle", "update", "insert",
    ):
        getattr(mock, name).return_value = mock
    return mock


def _db_routing(routes):
    """Return a db mock whose ``from_(table)`` returns ``routes[table]``."""
    mock_db = MagicMock()
    mock_db.from_.side_effect = lambda table: routes.get(table, _query(data=[]))
    return mock_db


# ---------------------------------------------------------------------------
# Candidate interview contracts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_eligibility_exposes_attempts_key():
    attempt = {
        "attemptId": "a1",
        "examId": "e1",
        "examTitle": "Qualifier",
        "score": 80.0,
        "totalMarks": 100.0,
        "passMarks": 40.0,
        "percentage": 80.0,
        "submittedAt": "2026-01-01T00:00:00Z",
    }
    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[attempt])):
        result = await check_eligibility(user={"id": "c1", "role": "candidate"})
    assert result == {"eligible": True, "attempts": [attempt]}

    with patch("app.interview.get_passed_attempts", new=AsyncMock(return_value=[])):
        result = await check_eligibility(user={"id": "c1", "role": "candidate"})
    assert result["eligible"] is False
    assert isinstance(result["message"], str) and result["message"]


@pytest.mark.asyncio
async def test_pending_interviews_envelope_is_interviews():
    rows = [{"id": "i1", "status": "scheduled"}]
    mock_db = _db_routing({"ai_interviews": _query(data=rows)})
    with patch("app.interview.db", mock_db):
        result = await get_pending_interviews(user={"id": "c1", "role": "candidate"})
    assert result == {"interviews": rows}


@pytest.mark.asyncio
async def test_recruiter_pending_empty_scope_returns_empty_envelope():
    mock_db = _db_routing({"exams": _query(data=[]), "jobs": _query(data=[])})
    with patch("app.interview.db", mock_db):
        result = await get_recruiter_pending(user={"id": "r1", "role": "recruiter"})
    assert result == {"interviews": []}


@pytest.mark.asyncio
async def test_recruiter_pending_embeds_uuid_ids_as_strings():
    exam_uuid = uuid.uuid4()
    final = _query(data=[{"id": "i1"}])
    mock_db = _db_routing({
        "exams": _query(data=[{"id": exam_uuid}]),
        "jobs": _query(data=[]),
        "ai_interviews": final,
    })
    with patch("app.interview.db", mock_db):
        result = await get_recruiter_pending(user={"id": "r1", "role": "recruiter"})
    assert result == {"interviews": [{"id": "i1"}]}
    assert final.or_.called
    scope = final.or_.call_args[0][0]
    assert str(exam_uuid) in scope
    assert "UUID(" not in scope


@pytest.mark.asyncio
async def test_summaries_candidate_scope_filters_by_candidate():
    rows = [{"id": "i2"}]
    query = _query(data=rows)
    mock_db = _db_routing({"ai_interviews": query})
    with patch("app.interview.db", mock_db):
        result = await get_summaries(collegeId=None, user={"id": "c1", "role": "candidate"})
    assert result == {"interviews": rows}
    assert query.eq.called


@pytest.mark.asyncio
async def test_summaries_tpo_without_college_candidates_returns_empty():
    mock_db = _db_routing({
        "users": _query(data={"college_id": "col-1"}),
        "candidate_profiles": _query(data=[]),
    })
    with patch("app.interview.db", mock_db):
        result = await get_summaries(collegeId=None, user={"id": "t1", "role": "tpo"})
    assert result == {"interviews": []}


@pytest.mark.asyncio
async def test_get_interview_returns_envelope_and_scopes_candidates():
    interview = {"id": "i1", "candidate_id": "c1", "exam_id": "e1", "job_id": None}
    mock_db = _db_routing({"ai_interviews": _query(data=interview)})
    with patch("app.interview.db", mock_db):
        result = await get_interview("i1", user={"id": "c1", "role": "candidate"})
    assert result == {"interview": interview}

    with patch("app.interview.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_interview("i1", user={"id": "someone-else", "role": "candidate"})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_interview_404_when_missing():
    mock_db = _db_routing({"ai_interviews": _query(data=None)})
    with patch("app.interview.db", mock_db):
        with pytest.raises(HTTPException) as exc:
            await get_interview("missing", user={"id": "c1", "role": "candidate"})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_schedule_interview_contract_and_recruiter_scope():
    existing = _query(data={"id": "i1", "candidate_id": "c1", "exam_id": "e1", "job_id": None})
    exam_access = _query(data={"id": "e1"})
    updated = _query(data={"id": "i1", "status": "scheduled"})
    queue = [existing, exam_access, updated]
    mock_db = MagicMock()
    mock_db.from_.side_effect = lambda _table: queue.pop(0)

    req = ScheduleInterviewRequest(
        scheduled_start="2026-02-01T10:00:00Z",
        scheduled_end="2026-02-01T10:30:00Z",
    )
    with patch("app.interview.db", mock_db):
        result = await schedule_interview("i1", req, user={"id": "r1", "role": "recruiter"})
    assert result["interview"]["status"] == "scheduled"
    assert isinstance(result["message"], str)


# ---------------------------------------------------------------------------
# TPO marksheet scan contract
# ---------------------------------------------------------------------------

def _marksheet(name="a.png"):
    return MarksheetFile(name=name, mimeType="image/png", data="dGVzdA==")


@pytest.mark.asyncio
async def test_scan_marksheets_maps_extraction_to_student_rows():
    extracted = {
        "roll_number": "R1",
        "name": "Asha",
        "branch": "CSE",
        "cgpa": "8.5",
        "graduation_year": 2026,
        "confidence": 0.92,
        "warnings": [],
    }
    with patch("app.tpo.get_tpo_college", new=AsyncMock(return_value="col-1")), \
         patch("app.tpo.extract_marksheet_result", new=AsyncMock(return_value=extracted)):
        result = await scan_marksheets(ScanMarksheetsRequest(files=[_marksheet()]), user={"id": "t1"})

    assert result["failed"] == []
    student = result["students"][0]
    assert student["roll_number"] == "R1"
    assert student["cgpa"] == 8.5
    assert student["source_file"] == "a.png"


@pytest.mark.asyncio
async def test_scan_marksheets_records_per_file_failures_and_zero_cgpa():
    bad = _marksheet("bad.png")
    good = _marksheet("good.png")

    async def _extract(name, _mime, _data):
        if name == "bad.png":
            raise HTTPException(status_code=400, detail="Unreadable marksheet")
        return {"name": "No CGPA"}  # missing cgpa -> coerced to 0.0

    with patch("app.tpo.get_tpo_college", new=AsyncMock(return_value="col-1")), \
         patch("app.tpo.extract_marksheet_result", new=AsyncMock(side_effect=_extract)):
        result = await scan_marksheets(
            ScanMarksheetsRequest(files=[bad, good]), user={"id": "t1"}
        )

    assert result["failed"] == [{"file": "bad.png", "reason": "Unreadable marksheet"}]
    assert result["students"][0]["cgpa"] == 0.0


@pytest.mark.asyncio
async def test_scan_marksheets_rejects_empty_payload():
    with patch("app.tpo.get_tpo_college", new=AsyncMock(return_value="col-1")):
        with pytest.raises(HTTPException) as exc:
            await scan_marksheets(ScanMarksheetsRequest(files=[]), user={"id": "t1"})
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Route protection (regression guard for accidentally public endpoints)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("path", [
    "/api/interview/summaries",
    "/api/interview/pending",
    "/api/interview/eligibility",
    "/api/tpo/students",
    "/api/admin/system-health",
])
def test_protected_get_endpoints_require_auth(path):
    assert client.get(path).status_code == 401


def test_scan_marksheets_requires_auth():
    response = client.post("/api/tpo/scan-marksheets", json={"files": []})
    assert response.status_code in (401, 403)
