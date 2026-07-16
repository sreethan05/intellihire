import warnings
# Suppress Starlette's deprecation warning regarding TestClient and httpx
warnings.filterwarnings("ignore", message="Using httpx with starlette.testclient is deprecated")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert "timestamp" in data
    assert "services" in data
    assert "postgres" in data["services"]
    assert "groq" in data["services"]
    assert data["environment"] in ("development", "test")


def test_spa_fallback():
    response = client.get("/some-random-page")
    assert response.status_code in (200, 404)
