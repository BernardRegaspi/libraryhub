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
# Catalog HTTP tests mock Koha but still need a base URL for OAuth paths.
os.environ.setdefault("KOHA_BASE_URL", "http://koha.test")
os.environ.setdefault("KOHA_CLIENT_ID", "test-client-id")
os.environ.setdefault("KOHA_CLIENT_SECRET", "test-client-secret")

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
def auth_client(db):
    from app.database.session import get_db_session

    app = create_app()

    def override_get_db():
        yield db

    app.dependency_overrides[get_db_session] = override_get_db
    return TestClient(app)


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