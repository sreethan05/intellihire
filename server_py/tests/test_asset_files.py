"""Authenticated download tests for app.assets (private uploaded files).

Candidate resumes and recruiter offer letters used to be served by a blanket
StaticFiles mount at ``/uploads`` with no auth. They are now only reachable
through ``GET /api/assets/files/{path}``, which accepts either a session
(cookie/bearer JWT) checked against the owning DB rows or a short-lived HMAC
signed URL minted by ``POST /api/assets/sign``.

Route coroutines are called directly against a mocked db builder (the pattern
in tests/db_mocks.py); TestClient covers the raw unauthenticated 401 and the
end-to-end signed-URL download.
"""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.assets import (
    SIGNED_URL_TTL_SECONDS,
    SignAssetRequest,
    _normalize_asset_path,
    _sign_asset_path,
    download_asset,
    sign_asset,
)
from app.auth_router import generate_token
from app.main import app
from tests.db_mocks import db_routing, query, sequence_db

client = TestClient(app)

RESUME_NAME = "1700000000-ab12cd34.pdf"
RESUME_PATH = f"resumes/{RESUME_NAME}"
OFFER_NAME = "1800000000-ef56cd78.pdf"
OFFER_PATH = f"offers/{OFFER_NAME}"
PDF_BYTES = b"%PDF-1.4 fake document"

CANDIDATE = {"id": "cand-1", "role": "candidate"}
OTHER_CANDIDATE = {"id": "cand-2", "role": "candidate"}
RECRUITER = {"id": "rec-1", "role": "recruiter"}
OTHER_RECRUITER = {"id": "rec-2", "role": "recruiter"}
ADMIN = {"id": "admin-1", "role": "admin"}
TPO = {"id": "tpo-1", "role": "tpo"}


@pytest.fixture()
def storage(tmp_path):
    """A real storage root on disk with one resume and one offer letter."""
    (tmp_path / "resumes").mkdir()
    (tmp_path / "offers").mkdir()
    (tmp_path / "resumes" / RESUME_NAME).write_bytes(PDF_BYTES)
    (tmp_path / "offers" / OFFER_NAME).write_bytes(PDF_BYTES)
    with patch("app.assets.storage_root", str(tmp_path)):
        yield tmp_path


# ---------------------------------------------------------------------------
# Path normalization (traversal / unknown subdirs)
# ---------------------------------------------------------------------------

def test_normalize_rejects_traversal_and_unknown_subdirs():
    with pytest.raises(HTTPException) as exc:
        _normalize_asset_path("../grading_queue.json")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        _normalize_asset_path("resumes/../../secrets.txt")
    assert exc.value.status_code == 400

    # Windows-style separators are normalized before the check.
    with pytest.raises(HTTPException) as exc:
        _normalize_asset_path("resumes\\..\\..\\secrets.txt")
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        _normalize_asset_path("")
    assert exc.value.status_code == 400

    # The grading queue and any other non-private location never resolves.
    with pytest.raises(HTTPException) as exc:
        _normalize_asset_path("grading_queue.json")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_download_rejects_traversal_even_for_allowed_roles(storage):
    for user, path in [
        (RECRUITER, "resumes/../../grading_queue.json"),
        (CANDIDATE, "../offers/x.pdf"),
        (ADMIN, "resumes/..\\..\\escape.pdf"),
    ]:
        with pytest.raises(HTTPException) as exc:
            await download_asset(path, MagicMock(), user=user)
        assert exc.value.status_code == 400

    # Over HTTP, percent-encoded dots are decoded before the route runs, so
    # the same traversal is stopped there too (normalization precedes auth).
    resp = client.get("/api/assets/files/resumes/%2e%2e/escape.pdf")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Session-based authorization matrix
# ---------------------------------------------------------------------------

def _resume_owned_by(user_id):
    return [query(data={"user_id": user_id, "college_id": "col-1"})]


@pytest.mark.asyncio
async def test_unauthenticated_download_is_rejected():
    resp = client.get(f"/api/assets/files/{RESUME_PATH}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_owning_candidate_downloads_own_resume(storage):
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))):
        resp = await download_asset(RESUME_PATH, MagicMock(), user=CANDIDATE)
    assert resp.status_code == 200
    assert resp.media_type == "application/pdf"
    # The UI's "View" links open PDFs in a new tab, so PDFs stay inline.
    assert "inline" in resp.headers["content-disposition"]
    assert RESUME_NAME in resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_non_owner_candidate_is_forbidden(storage):
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))):
        with pytest.raises(HTTPException) as exc:
            await download_asset(RESUME_PATH, MagicMock(), user=OTHER_CANDIDATE)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_candidate_cannot_read_someone_else_offer(storage):
    status = [query(data={"candidate_id": "cand-1", "job_id": "j1"})]
    with patch("app.assets.db", sequence_db(*status)):
        with pytest.raises(HTTPException) as exc:
            await download_asset(OFFER_PATH, MagicMock(), user=OTHER_CANDIDATE)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_and_admin_download_resume(storage):
    # Mirrors GET /recruiter/candidates/{id}/resume-analysis access: the
    # recruiter chain is profile lookup → jobs(created_by) → candidate_status.
    with patch("app.assets.db", sequence_db(
        query(data={"user_id": "cand-1", "college_id": "col-1"}),
        query(data=[{"id": "j1"}]),
        query(data=[{"id": "st-1"}]),
    )):
        resp = await download_asset(RESUME_PATH, MagicMock(), user=RECRUITER)
    assert resp.status_code == 200

    # Admins bypass ownership checks entirely (no db calls).
    with patch("app.assets.db", sequence_db()):
        resp = await download_asset(RESUME_PATH, MagicMock(), user=ADMIN)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_recruiter_cannot_download_unrelated_resume(storage):
    with patch("app.assets.db", sequence_db(
        query(data={"user_id": "cand-2", "college_id": "col-9"}),
        query(data=[{"id": "j1"}]),
        query(data=[]),
        query(data=[]),
    )):
        with pytest.raises(HTTPException) as exc:
            await download_asset(RESUME_PATH, MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_tpo_downloads_resume_of_own_college_students(storage):
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))), \
         patch("app.assets.get_tpo_college", new=AsyncMock(return_value="col-1")):
        resp = await download_asset(RESUME_PATH, MagicMock(), user=TPO)
    assert resp.status_code == 200

    # A student from another college stays off limits.
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))), \
         patch("app.assets.get_tpo_college", new=AsyncMock(return_value="col-9")):
        with pytest.raises(HTTPException) as exc:
            await download_asset(RESUME_PATH, MagicMock(), user=TPO)
    assert exc.value.status_code == 403

    # Unlinked TPO matches the existing 400 "not linked to a college" pattern.
    with patch("app.assets.get_tpo_college",
               new=AsyncMock(side_effect=HTTPException(status_code=400, detail="TPO is not linked to a college"))):
        with pytest.raises(HTTPException) as exc:
            await download_asset(RESUME_PATH, MagicMock(), user=TPO)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_offer_letter_access_matrix(storage):
    # The candidate who received the offer.
    with patch("app.assets.db", sequence_db(query(data={"candidate_id": "cand-1", "job_id": "j1"}))):
        resp = await download_asset(OFFER_PATH, MagicMock(), user=CANDIDATE)
    assert resp.status_code == 200

    # The recruiter who created the drive.
    with patch("app.assets.db", sequence_db(
        query(data={"candidate_id": "cand-1", "job_id": "j1"}),
        query(data={"created_by": "rec-1"}),
    )):
        resp = await download_asset(OFFER_PATH, MagicMock(), user=RECRUITER)
    assert resp.status_code == 200

    # A different recruiter cannot read another drive's offer.
    with patch("app.assets.db", sequence_db(
        query(data={"candidate_id": "cand-1", "job_id": "j1"}),
        query(data={"created_by": "rec-1"}),
    )):
        with pytest.raises(HTTPException) as exc:
            await download_asset(OFFER_PATH, MagicMock(), user=OTHER_RECRUITER)
    assert exc.value.status_code == 403

    # Admins can, TPOs cannot (no existing TPO endpoint reads offers).
    with patch("app.assets.db", sequence_db()):
        assert (await download_asset(OFFER_PATH, MagicMock(), user=ADMIN)).status_code == 200
        with pytest.raises(HTTPException) as exc:
            await download_asset(OFFER_PATH, MagicMock(), user=TPO)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_authorized_download_of_missing_file_is_404(storage):
    (storage / "resumes" / RESUME_NAME).unlink()
    # Authorization (the full recruiter chain) runs before the existence check.
    with patch("app.assets.db", sequence_db(
        query(data={"user_id": "cand-1", "college_id": "col-1"}),
        query(data=[{"id": "j1"}]),
        query(data=[{"id": "st-1"}]),
    )):
        with pytest.raises(HTTPException) as exc:
            await download_asset(RESUME_PATH, MagicMock(), user=RECRUITER)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# Signed URLs (POST /api/assets/sign + exp/sig query params)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sign_endpoint_mints_short_lived_url_for_owner(storage):
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))):
        result = await sign_asset(SignAssetRequest(path=f"/uploads/{RESUME_PATH}"), user=CANDIDATE)
    assert result["expiresIn"] == SIGNED_URL_TTL_SECONDS == 300
    url = result["url"]
    assert url.startswith(f"/api/assets/files/{RESUME_PATH}?exp=")
    exp = int(url.split("exp=")[1].split("&")[0])
    assert abs(exp - (int(time.time()) + 300)) < 5


@pytest.mark.asyncio
async def test_sign_endpoint_enforces_authorization(storage):
    with patch("app.assets.db", sequence_db(*_resume_owned_by("cand-1"))):
        with pytest.raises(HTTPException) as exc:
            await sign_asset(SignAssetRequest(path=f"/uploads/{RESUME_PATH}"), user=OTHER_CANDIDATE)
    assert exc.value.status_code == 403


def test_sign_endpoint_requires_authentication():
    resp = client.post("/api/assets/sign", json={"path": f"/uploads/{RESUME_PATH}"})
    assert resp.status_code == 401


def test_signed_url_downloads_without_session(storage):
    exp = int(time.time()) + 60
    sig = _sign_asset_path(RESUME_PATH, exp)
    resp = client.get(f"/api/assets/files/{RESUME_PATH}?exp={exp}&sig={sig}")
    assert resp.status_code == 200
    assert resp.content == PDF_BYTES
    assert resp.headers["content-type"] == "application/pdf"


def test_expired_signed_url_is_rejected(storage):
    exp = int(time.time()) - 1
    sig = _sign_asset_path(RESUME_PATH, exp)
    resp = client.get(f"/api/assets/files/{RESUME_PATH}?exp={exp}&sig={sig}")
    assert resp.status_code == 401


def test_tampered_signed_url_is_rejected(storage):
    exp = int(time.time()) + 60
    sig = _sign_asset_path(RESUME_PATH, exp)
    resp = client.get(f"/api/assets/files/{RESUME_PATH}?exp={exp}&sig={'0' * len(sig)}")
    assert resp.status_code == 401

    # A signature minted for a different file must not validate for this one.
    other_sig = _sign_asset_path(OFFER_PATH, exp)
    resp = client.get(f"/api/assets/files/{RESUME_PATH}?exp={exp}&sig={other_sig}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_signed_url_cannot_escalate_to_traversal(storage):
    # Sign for a legit file, then try to reuse the query params on a
    # traversal path — normalization happens before signature verification.
    exp = int(time.time()) + 60
    sig = _sign_asset_path(RESUME_PATH, exp)
    with pytest.raises(HTTPException) as exc:
        await download_asset("resumes/../../grading_queue.json", MagicMock(), exp=exp, sig=sig, user=None)
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# End-to-end cookie session download
# ---------------------------------------------------------------------------

def test_session_cookie_download_end_to_end(storage):
    token = generate_token({"id": "cand-1", "role": "candidate", "email": "c@x.com"})
    client.cookies.set("access_token", token)
    try:
        user_rows = db_routing({
            "users": query(data={"id": "cand-1", "email": "c@x.com", "role": "candidate"}),
            "candidate_profiles": query(data={"user_id": "cand-1", "college_id": "col-1"}),
        })
        with patch("app.auth_router.db", user_rows), \
             patch("app.assets.db", user_rows):
            resp = client.get(f"/api/assets/files/{RESUME_PATH}")
        assert resp.status_code == 200
        assert resp.content == PDF_BYTES
    finally:
        client.cookies.clear()
