import os


def test_health_liveness(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_readiness(client):
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert "database" in body
    if os.environ.get("CI"):
        assert body["status"] == "ok"
        assert body["database"] == "connected"
    else:
        assert body["status"] == "degraded"
        assert body["database"] == "unavailable"