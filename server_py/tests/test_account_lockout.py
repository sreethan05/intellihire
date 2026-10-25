"""Account lockout tests: 5 failures lock the account for 15 minutes."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import auth_router

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_lockouts():
    auth_router._failed_logins.clear()
    # The per-IP slowapi limit (5/min) would 429 before the per-account
    # lockout under test; disable it so the lockout layer is exercised alone.
    auth_router.limiter.enabled = False
    yield
    auth_router.limiter.enabled = True
    auth_router._failed_logins.clear()


def test_lockout_after_threshold_failures():
    email = "lockme@intellihire.com"
    for _ in range(5):
        r = client.post("/api/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 401
    # 6th attempt — even with the CORRECT password — is locked out (423).
    r = client.post("/api/auth/login", json={"email": email, "password": "admin123"})
    assert r.status_code == 423
    assert r.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_lockout_is_per_account():
    other = "other-user@intellihire.com"
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "lockme2@intellihire.com", "password": "x"})
    r = client.post("/api/auth/login", json={"email": other, "password": "admin123"})
    assert r.status_code in (200, 401)  # not 423 — other accounts unaffected


def test_locked_account_reports_remaining_window():
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "win@intellihire.com", "password": "x"})
    remaining = auth_router._login_locked("win@intellihire.com")
    assert 0 < remaining <= auth_router.LOCKOUT_DURATION_SECONDS


def test_helper_unit_semantics():
    key = "unit@test.com"
    for _ in range(4):
        auth_router._record_failed_login(key)
    assert auth_router._login_locked(key) == 0  # below threshold
    auth_router._record_failed_login(key)  # 5th -> lock
    assert auth_router._login_locked(key) > 0
    auth_router._clear_failed_logins(key)
    assert auth_router._login_locked(key) == 0
