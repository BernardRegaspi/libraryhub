from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.integrations.koha.exceptions import KohaError, KohaResponseError, KohaTimeoutError
from app.models.identity import AuditLog
from app.models.inventory import InventorySession
from app.services.inventory_counters import summarize_scans

_DEPARTMENT_REQUIRED = (
    409,
    "department_required",
    "Choose a department before creating a session.",
)
_LIBRARIES_UNAVAILABLE = (
    503,
    "inventory_unavailable",
    "Koha could not load libraries. Try again.",
)
_COUNT_TIMEOUT = (
    504,
    "inventory_timeout",
    "Koha took too long to count items. Try again.",
)
_COUNT_RESPONSE = (
    503,
    "inventory_count_unavailable",
    "Koha did not return an item count. The session was not created.",
)
_COUNT_UNAVAILABLE = (
    503,
    "inventory_unavailable",
    "Koha could not count items. Try again.",
)
_VALIDATION_MESSAGE = "That inventory session is not valid."


class InventoryError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: list[dict] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        super().__init__(message)


def _raise(status_code: int, code: str, message: str, *, fields: list[dict] | None = None) -> None:
    raise InventoryError(status_code, code, message, fields)


def _validation_failure(fields: list[dict]) -> None:
    _raise(422, "validation_error", _VALIDATION_MESSAGE, fields=fields)


def _has_control_char(value: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in value)


def _normalize_required_text(value: str, field: str, *, max_len: int) -> str:
    stripped = value.strip()
    if not stripped:
        _validation_failure([{"name": field, "message": "This field is required."}])
    if len(stripped) > max_len or _has_control_char(stripped):
        _validation_failure([{"name": field, "message": "This value is not valid."}])
    return stripped


def _normalize_optional_text(value: str | None, field: str, *, max_len: int) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > max_len or _has_control_char(stripped):
        _validation_failure([{"name": field, "message": "This value is not valid."}])
    return stripped


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _session_payload(row: InventorySession) -> dict[str, Any]:
    expected = row.expected_count
    return {
        "id": str(row.id),
        "reference": row.reference,
        "name": row.name,
        "status": row.status,
        "home_library_id": row.home_library_id,
        "home_library_name": row.home_library_name,
        "location": row.location,
        "expected_count": expected,
        "started_at": _iso(row.started_at),
        "cancelled_at": _iso(row.cancelled_at),
        "created_at": _iso(row.created_at),
        "counters": summarize_scans([], expected_count=expected),
    }


def _next_reference(db: Session) -> str:
    year = datetime.now(ZoneInfo("Asia/Manila")).year
    seq = db.execute(text("SELECT nextval('libraryhub.inventory_session_ref_seq')")).scalar_one()
    return f"INV-{year}-{int(seq):04d}"


def create_session(
    db: Session,
    client,
    *,
    user_id: UUID,
    department_id: UUID | None,
    name: str,
    home_library_id: str,
    location: str | None,
) -> dict[str, Any]:
    if department_id is None:
        _raise(*_DEPARTMENT_REQUIRED)

    clean_name = _normalize_required_text(name, "name", max_len=120)
    clean_location = _normalize_optional_text(location, "location", max_len=80)
    library_id = home_library_id.strip()
    if not library_id or len(library_id) > 64 or _has_control_char(library_id):
        _validation_failure([{"name": "home_library_id", "message": "This value is not valid."}])

    try:
        libraries = client.library_names()
    except KohaError as exc:
        raise InventoryError(*_LIBRARIES_UNAVAILABLE) from exc

    if library_id not in libraries:
        _validation_failure([{"name": "home_library_id", "message": "This value is not valid."}])

    library_name = libraries[library_id]

    try:
        expected_count = client.count_items(
            home_library_id=library_id,
            location=clean_location,
        )
    except KohaTimeoutError as exc:
        raise InventoryError(*_COUNT_TIMEOUT) from exc
    except KohaResponseError as exc:
        raise InventoryError(*_COUNT_RESPONSE) from exc
    except KohaError as exc:
        raise InventoryError(*_COUNT_UNAVAILABLE) from exc

    reference = _next_reference(db)
    row = InventorySession(
        reference=reference,
        name=clean_name,
        department_id=department_id,
        status="draft",
        home_library_id=library_id,
        home_library_name=library_name,
        location=clean_location,
        expected_count=expected_count,
        created_by=user_id,
    )
    db.add(row)
    db.flush()

    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.create",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={
                "reference": reference,
                "home_library_id": library_id,
                "location": clean_location,
                "expected_count": expected_count,
            },
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(row)