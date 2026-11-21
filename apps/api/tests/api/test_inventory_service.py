import re
from uuid import UUID

import pytest
from test_auth import add_user

from app.integrations.koha.exceptions import KohaResponseError, KohaTimeoutError
from app.models.identity import AuditLog, UserRoleAssignment
from app.models.inventory import InventorySession
from app.services.inventory import InventoryError, create_session

PASSWORD = "local-secret"


class _FakeKoha:
    def __init__(
        self,
        *,
        library_names: dict[str, str] | None = None,
        expected_count: int = 4,
        count_error: Exception | None = None,
        library_names_error: Exception | None = None,
    ) -> None:
        self._library_names = library_names if library_names is not None else {"CPL": "College Library"}
        self._expected_count = expected_count
        self._count_error = count_error
        self._library_names_error = library_names_error

    def library_names(self) -> dict[str, str]:
        if self._library_names_error is not None:
            raise self._library_names_error
        return self._library_names

    def count_items(self, *, home_library_id: str, location: str | None) -> int:
        if self._count_error is not None:
            raise self._count_error
        return self._expected_count


def _user_and_department(db):
    user = add_user(
        db,
        username="inv-librarian",
        email="inv-librarian@usant.edu.ph",
        display_name="Inv Librarian",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department_id = db.query(UserRoleAssignment).filter_by(user_id=user.id).one().department_id
    return user, department_id


def test_create_session_saves_draft_and_returns_counters(db):
    user, department_id = _user_and_department(db)
    client = _FakeKoha()

    result = create_session(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        name="  Shelf check  ",
        home_library_id="CPL",
        location="   ",
    )

    assert set(result) == {
        "id",
        "reference",
        "name",
        "status",
        "home_library_id",
        "home_library_name",
        "location",
        "expected_count",
        "started_at",
        "cancelled_at",
        "created_at",
        "counters",
    }
    assert result["name"] == "Shelf check"
    assert result["status"] == "draft"
    assert result["home_library_id"] == "CPL"
    assert result["home_library_name"] == "College Library"
    assert result["location"] is None
    assert result["expected_count"] == 4
    assert result["started_at"] is None
    assert result["cancelled_at"] is None
    assert re.fullmatch(r"INV-20[0-9]{2}-\d+", result["reference"])
    assert isinstance(result["created_at"], str)
    assert result["counters"]["expected_count"] == 4
    assert result["counters"]["remaining"] == 4

    row = db.query(InventorySession).filter_by(id=UUID(result["id"])).one()
    assert row.status == "draft"
    assert row.expected_count == 4
    assert row.location is None
    assert re.fullmatch(r"INV-20[0-9]{2}-\d+", row.reference)

    audit = db.query(AuditLog).filter_by(action="inventory.session.create").one()
    assert audit.user_id == user.id
    assert audit.module == "inventory"
    assert audit.entity_type == "inventory_session"
    assert audit.entity_id == result["id"]
    assert audit.details == {
        "reference": result["reference"],
        "home_library_id": "CPL",
        "location": None,
        "expected_count": 4,
    }


def test_create_session_count_timeout_leaves_no_row(db):
    user, department_id = _user_and_department(db)
    before = db.query(InventorySession).count()
    client = _FakeKoha(count_error=KohaTimeoutError())

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Timeout shelf",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "inventory_timeout"
    assert db.query(InventorySession).count() == before


def test_create_session_count_response_error_leaves_no_row(db):
    user, department_id = _user_and_department(db)
    before = db.query(InventorySession).count()
    client = _FakeKoha(count_error=KohaResponseError())

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Bad count shelf",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "inventory_count_unavailable"
    assert db.query(InventorySession).count() == before


def test_create_session_requires_department(db):
    user, _ = _user_and_department(db)
    client = _FakeKoha()

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=None,
            name="No department",
            home_library_id="CPL",
            location=None,
        )

    assert exc.value.code == "department_required"
    assert exc.value.message == "Choose a department before creating a session."
    assert db.query(InventorySession).count() == 0
    assert db.query(AuditLog).filter_by(action="inventory.session.create").count() == 0


def test_create_session_unknown_library_writes_no_row(db):
    user, department_id = _user_and_department(db)
    client = _FakeKoha()

    with pytest.raises(InventoryError) as exc:
        create_session(
            db,
            client,
            user_id=user.id,
            department_id=department_id,
            name="Bad library",
            home_library_id="UNKNOWN",
            location=None,
        )

    assert exc.value.code == "validation_error"
    assert db.query(InventorySession).count() == 0