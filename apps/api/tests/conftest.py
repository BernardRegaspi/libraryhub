import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings

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


@pytest.fixture
def db():
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"options": "-c search_path=libraryhub,public"},
    )
    try:
        with engine.connect() as probe:
            probe.execute(text("SELECT 1"))
    except SQLAlchemyError:
        pytest.skip("PostgreSQL is not reachable")
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()