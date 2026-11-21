from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.integrations.koha.exceptions import KohaError, KohaResponseError, KohaTimeoutError
from app.integrations.koha.query import escape_like
from app.models.identity import AuditLog
from app.models.inventory import InventorySession
from app.schemas.inventory import SessionListParams
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
_LIST_DEPARTMENT_REQUIRED = (409, "department_required", "Choose a department.")
_NOT_FOUND = (404, "not_found", "That inventory session was not found.")
_INVALID_SEARCH = (422, "invalid_search", "That search is not valid.")
_SESSION_NOT_DRAFT = (409, "session_not_draft", "Only a draft session can be started.")
_SESSION_CANCELLED = (409, "session_cancelled", "This session is already cancelled.")
_STATUSES = frozenset({"draft", "in_progress", "cancelled"})
_SORTS = frozenset({"created_at", "reference", "name", "status"})
_SORT_COLUMNS = {
    "created_at": InventorySession.created_at,
    "reference": InventorySession.reference,
    "name": InventorySession.name,
    "status": InventorySession.status,
}


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


def _validate_list_params(params: SessionListParams) -> None:
    for ch in params.q:
        if ord(ch) < 32 or ord(ch) == 127:
            _raise(*_INVALID_SEARCH)
    q = params.q.strip()
    params.q = q
    if q and not (1 <= len(q) <= 80):
        _raise(*_INVALID_SEARCH)
    if not (1 <= params.page <= 10000):
        _raise(*_INVALID_SEARCH)
    if not (1 <= params.per_page <= 50):
        _raise(*_INVALID_SEARCH)
    if params.sort not in _SORTS:
        _raise(*_INVALID_SEARCH)
    if params.direction not in ("asc", "desc"):
        _raise(*_INVALID_SEARCH)
    status = params.status
    if status is not None and status != "" and status not in _STATUSES:
        _raise(*_INVALID_SEARCH)
    if status == "":
        params.status = None


def _fetch_session(
    db: Session,
    *,
    department_id: UUID | None,
    session_id: UUID,
) -> InventorySession:
    row = db.query(InventorySession).filter_by(id=session_id).one_or_none()
    if row is None or department_id is None or row.department_id != department_id:
        _raise(*_NOT_FOUND)
    return row


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


def list_sessions(
    db: Session,
    *,
    department_id: UUID | None,
    params: SessionListParams,
) -> dict[str, Any]:
    if department_id is None:
        _raise(*_LIST_DEPARTMENT_REQUIRED)
    _validate_list_params(params)

    query = db.query(InventorySession).filter(InventorySession.department_id == department_id)
    if params.status:
        query = query.filter(InventorySession.status == params.status)
    if params.q:
        pattern = f"%{escape_like(params.q)}%"
        query = query.filter(
            or_(
                InventorySession.reference.ilike(pattern, escape="\\"),
                InventorySession.name.ilike(pattern, escape="\\"),
            )
        )

    sort_col = _SORT_COLUMNS[params.sort]
    if params.direction == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total = query.count()
    offset = (params.page - 1) * params.per_page
    rows = query.offset(offset).limit(params.per_page).all()
    has_next = params.page * params.per_page < total

    return {
        "items": [_session_payload(row) for row in rows],
        "page": params.page,
        "per_page": params.per_page,
        "total": total,
        "has_next": has_next,
    }


def get_session(
    db: Session,
    *,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    return _session_payload(row)


def start_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status != "draft":
        _raise(*_SESSION_NOT_DRAFT)

    now = datetime.now(UTC)
    row.status = "in_progress"
    row.started_at = now
    row.started_by = user_id

    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.start",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(row)


def cancel_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status == "cancelled":
        _raise(*_SESSION_CANCELLED)

    now = datetime.now(UTC)
    row.status = "cancelled"
    row.cancelled_at = now
    row.cancelled_by = user_id

    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.cancel",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(row)