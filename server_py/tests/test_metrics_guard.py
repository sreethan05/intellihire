"""Tests for the optional METRICS_TOKEN gate on /metrics.

The endpoint is public when METRICS_TOKEN is unset (dev/local default) and
requires ``Authorization: Bearer <token>`` as soon as it is configured —
otherwise anyone could scrape route labels and traffic patterns in
production.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.middleware import metrics_guard

client = TestClient(app)


def test_metrics_stays_open_when_token_not_configured(monkeypatch):
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "text/plain" in res.headers.get("content-type", "")


def test_metrics_requires_bearer_token_when_configured(monkeypatch):
    monkeypatch.setenv("METRICS_TOKEN", "s3cret-token")

    assert client.get("/metrics").status_code == 401
    assert client.get("/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/metrics", headers={"Authorization": "s3cret-token"}).status_code == 401

    ok = client.get("/metrics", headers={"Authorization": "Bearer s3cret-token"})
    assert ok.status_code == 200
    assert "text/plain" in ok.headers.get("content-type", "")


def test_metrics_are_closed_in_production_without_token(monkeypatch):
    monkeypatch.delenv("METRICS_TOKEN", raising=False)
    monkeypatch.setattr(metrics_guard, "NODE_ENV", "production")

    response = client.get("/metrics")

    assert response.status_code == 503
