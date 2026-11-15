import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://libraryhub:libraryhub_dev@localhost:5432/libraryhub",
)

from app.main import create_app


@pytest.fixture(autouse=True)
def _fast_readiness_check(monkeypatch: pytest.MonkeyPatch) -> None:
    """Avoid long DB connection timeouts when PostgreSQL is not running locally."""
    if os.environ.get("CI"):
        return
    monkeypatch.setattr(
        "app.api.routes.health.check_database_connectivity",
        lambda: False,
    )


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())