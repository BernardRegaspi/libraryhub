from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.koha.availability import item_status
from app.integrations.koha.exceptions import KohaError, KohaResponseError, KohaTimeoutError
from app.integrations.koha.query import escape_like
from app.models.identity import AuditLog
from app.models.inventory import InventoryScan, InventorySession
from app.schemas.inventory import ScanListParams, SessionListParams
from app.services.inventory_classify import classify_primary, display_label, duplicate_message
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
_SESSION_NOT_STARTED = (409, "session_not_started", "Start the session before scanning.")
_SESSION_NOT_SCANNING = (
    409,
    "session_not_scanning",
    "Only a scanning session can be finished.",
)
_SESSION_NOT_IN_REVIEW = (
    409,
    "session_not_in_review",
    "Only a session in review can return to scanning.",
)
_SESSION_CANCELLED_SCAN = (409, "session_cancelled", "This session is cancelled.")
_SCAN_TIMEOUT = (
    504,
    "inventory_timeout",
    "Koha took too long to look up this barcode. The scan was not saved.",
)
_SCAN_UNAVAILABLE = (
    503,
    "inventory_unavailable",
    "Koha could not look up this barcode. The scan was not saved.",
)
_SCAN_AMBIGUOUS = (
    503,
    "inventory_ambiguous",
    "Koha returned an item record this scan cannot use. The scan was not saved.",
)
_STATUSES = frozenset({"draft", "in_progress", "cancelled", "in_review"})
_SCAN_OUTCOMES = frozenset(
    {
        "verified",
        "misplaced",
        "unexpected",
        "not_found",
        "withdrawn",
        "damaged",
        "other_exception",
        "duplicate",
    }
)
_SCAN_SORTS = frozenset({"scanned_at"})
_SORTS = frozenset({"created_at", "reference", "name", "status"})
_SORT_COLUMNS = {
    "created_at": InventorySession.created_at,
    "reference": InventorySession.reference,
    "name": InventorySession.name,
    "status": InventorySession.status,
}
_SCAN_SORT_COLUMNS = {
    "scanned_at": InventoryScan.scanned_at,
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


def _session_payload(db: Session, row: InventorySession) -> dict[str, Any]:
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
        "counters": _session_counters(db, row),
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
    return _session_payload(db, row)


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
        "items": [_session_payload(db, row) for row in rows],
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
    return _session_payload(db, row)


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
    return _session_payload(db, row)


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
    return _session_payload(db, row)


def finish_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status != "in_progress":
        _raise(*_SESSION_NOT_SCANNING)
    row.status = "in_review"
    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.finish",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(db, row)


def resume_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status != "in_review":
        _raise(*_SESSION_NOT_IN_REVIEW)
    row.status = "in_progress"
    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.resume",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(db, row)


def _normalize_barcode(barcode: str) -> str:
    return _normalize_required_text(barcode, "barcode", max_len=32)


def _biblio_field(biblio: dict, key: str) -> str | None:
    if key not in biblio:
        return None
    value = biblio.get(key)
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _optional_item_text(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _snapshot_from_item(client, item: dict) -> dict[str, Any]:
    biblio = item.get("biblio")
    title = author = None
    if isinstance(biblio, dict):
        title = _biblio_field(biblio, "title")
        author = _biblio_field(biblio, "author")

    try:
        library_names = client.library_names()
    except KohaError:
        library_names = {}

    try:
        type_labels = client.item_type_labels()
    except KohaError:
        type_labels = {}

    home_id = item.get("home_library_id")
    holding_id = item.get("holding_library_id")
    home_key = str(home_id) if home_id is not None else ""
    holding_key = str(holding_id) if holding_id is not None else ""

    type_id = item.get("item_type_id")
    type_id_str = str(type_id) if type_id is not None else None
    type_label = type_labels.get(type_id_str) if type_id_str is not None else None

    status, status_label = item_status(item)
    biblio_id = item.get("biblio_id")
    koha_biblio_id = biblio_id if isinstance(biblio_id, int) else None

    return {
        "title": title,
        "author": author,
        "call_number": _optional_item_text(item.get("callnumber")),
        "item_type_id": type_id_str,
        "item_type_label": type_label,
        "home_library_id": _optional_item_text(home_id),
        "holding_library_id": _optional_item_text(holding_id),
        "home_library_name": library_names.get(home_key) if home_key else None,
        "holding_library_name": library_names.get(holding_key) if holding_key else None,
        "location": _optional_item_text(item.get("location")),
        "koha_status": status,
        "koha_status_label": status_label,
        "koha_item_id": item.get("item_id") if isinstance(item.get("item_id"), int) else None,
        "koha_biblio_id": koha_biblio_id,
    }


def _scan_payload(row: InventoryScan) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "client_scan_id": str(row.client_scan_id),
        "barcode": row.barcode,
        "outcome": row.outcome,
        "outcome_label": display_label(row.outcome, row.koha_status_label),
        "message": row.message,
        "is_primary": row.is_primary,
        "title": row.title,
        "author": row.author,
        "call_number": row.call_number,
        "item_type_id": row.item_type_id,
        "item_type_label": row.item_type_label,
        "home_library_id": row.home_library_id,
        "home_library_name": row.home_library_name,
        "holding_library_id": row.holding_library_id,
        "holding_library_name": row.holding_library_name,
        "location": row.location,
        "koha_status": row.koha_status,
        "koha_status_label": row.koha_status_label,
        "scanned_at": _iso(row.scanned_at),
    }


def _session_counters(db: Session, session: InventorySession) -> dict[str, int]:
    outcomes = [
        outcome
        for (outcome,) in db.query(InventoryScan.outcome).filter_by(session_id=session.id).all()
    ]
    return summarize_scans(outcomes, expected_count=session.expected_count)


def _insert_duplicate_scan(
    db: Session,
    *,
    session_id: UUID,
    user_id: UUID,
    client_scan_id: UUID,
    barcode: str,
    primary: InventoryScan,
) -> InventoryScan:
    row = InventoryScan(
        session_id=session_id,
        client_scan_id=client_scan_id,
        barcode=barcode,
        koha_item_id=primary.koha_item_id,
        koha_biblio_id=primary.koha_biblio_id,
        outcome="duplicate",
        is_primary=False,
        primary_scan_id=primary.id,
        message=duplicate_message(primary.outcome, primary.koha_status_label),
        title=primary.title,
        author=primary.author,
        call_number=primary.call_number,
        item_type_id=primary.item_type_id,
        item_type_label=primary.item_type_label,
        home_library_id=primary.home_library_id,
        home_library_name=primary.home_library_name,
        holding_library_id=primary.holding_library_id,
        holding_library_name=primary.holding_library_name,
        location=primary.location,
        koha_status=primary.koha_status,
        koha_status_label=primary.koha_status_label,
        scanned_by=user_id,
    )
    db.add(row)
    db.flush()
    return row


def _audit_scan(
    db: Session,
    *,
    user_id: UUID,
    session: InventorySession,
    scan_id: UUID,
    barcode: str,
    outcome: str,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.scan",
            module="inventory",
            entity_type="inventory_scan",
            entity_id=str(scan_id),
            details={
                "reference": session.reference,
                "barcode": barcode,
                "outcome": outcome,
            },
        )
    )


def _validate_scan_list_params(params: ScanListParams) -> None:
    for ch in params.q:
        if ord(ch) < 32 or ord(ch) == 127:
            _raise(*_INVALID_SEARCH)
    q = params.q.strip()
    params.q = q
    if q and not (1 <= len(q) <= 32):
        _raise(*_INVALID_SEARCH)
    if not (1 <= params.page <= 10000):
        _raise(*_INVALID_SEARCH)
    if not (1 <= params.per_page <= 50):
        _raise(*_INVALID_SEARCH)
    if params.sort not in _SCAN_SORTS:
        _raise(*_INVALID_SEARCH)
    if params.direction not in ("asc", "desc"):
        _raise(*_INVALID_SEARCH)
    outcome = params.outcome
    if outcome is not None and outcome != "" and outcome not in _SCAN_OUTCOMES:
        _raise(*_INVALID_SEARCH)
    if outcome == "":
        params.outcome = None


def _primary_for_item(db: Session, *, session_id: UUID, item_id: int) -> InventoryScan | None:
    return (
        db.query(InventoryScan)
        .filter_by(session_id=session_id, koha_item_id=item_id, is_primary=True)
        .one_or_none()
    )


def _insert_primary_from_item(
    db: Session,
    *,
    session_id: UUID,
    user_id: UUID,
    client_scan_id: UUID,
    barcode: str,
    outcome: str,
    message: str,
    snapshot: dict[str, Any],
) -> InventoryScan:
    item_id = snapshot["koha_item_id"]
    assert isinstance(item_id, int)
    row = InventoryScan(
        session_id=session_id,
        client_scan_id=client_scan_id,
        barcode=barcode,
        koha_item_id=item_id,
        koha_biblio_id=snapshot["koha_biblio_id"],
        outcome=outcome,
        is_primary=True,
        primary_scan_id=None,
        message=message,
        title=snapshot["title"],
        author=snapshot["author"],
        call_number=snapshot["call_number"],
        item_type_id=snapshot["item_type_id"],
        item_type_label=snapshot["item_type_label"],
        home_library_id=snapshot["home_library_id"],
        home_library_name=snapshot["home_library_name"],
        holding_library_id=snapshot["holding_library_id"],
        holding_library_name=snapshot["holding_library_name"],
        location=snapshot["location"],
        koha_status=snapshot["koha_status"],
        koha_status_label=snapshot["koha_status_label"],
        scanned_by=user_id,
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
        return row
    except IntegrityError:
        winner = _primary_for_item(db, session_id=session_id, item_id=item_id)
        if winner is None:
            winner = (
                db.query(InventoryScan)
                .filter_by(session_id=session_id, barcode=barcode, is_primary=True)
                .one()
            )
        return _insert_duplicate_scan(
            db,
            session_id=session_id,
            user_id=user_id,
            client_scan_id=client_scan_id,
            barcode=barcode,
            primary=winner,
        )


def record_scan(
    db: Session,
    client,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
    client_scan_id: UUID,
    barcode: str,
) -> dict[str, Any]:
    clean_barcode = _normalize_barcode(barcode)
    session = _fetch_session(db, department_id=department_id, session_id=session_id)

    existing = (
        db.query(InventoryScan)
        .filter_by(session_id=session_id, client_scan_id=client_scan_id)
        .one_or_none()
    )
    if existing is not None:
        return {
            "scan": _scan_payload(existing),
            "counters": _session_counters(db, session),
        }

    if session.status == "draft":
        _raise(*_SESSION_NOT_STARTED)
    if session.status == "cancelled":
        _raise(*_SESSION_CANCELLED_SCAN)

    primary_barcode = (
        db.query(InventoryScan)
        .filter_by(session_id=session_id, barcode=clean_barcode, is_primary=True)
        .one_or_none()
    )
    if primary_barcode is not None:
        row = _insert_duplicate_scan(
            db,
            session_id=session_id,
            user_id=user_id,
            client_scan_id=client_scan_id,
            barcode=clean_barcode,
            primary=primary_barcode,
        )
        _audit_scan(
            db,
            user_id=user_id,
            session=session,
            scan_id=row.id,
            barcode=clean_barcode,
            outcome=row.outcome,
        )
        db.commit()
        db.refresh(row)
        return {"scan": _scan_payload(row), "counters": _session_counters(db, session)}

    try:
        items = client.find_items_by_barcode(clean_barcode)
    except KohaTimeoutError as exc:
        raise InventoryError(*_SCAN_TIMEOUT) from exc
    except KohaError as exc:
        raise InventoryError(*_SCAN_UNAVAILABLE) from exc

    if len(items) == 0:
        outcome, message = classify_primary(
            None,
            session_library_id=session.home_library_id,
            session_library_name=session.home_library_name,
            session_location=session.location,
        )
        row = InventoryScan(
            session_id=session_id,
            client_scan_id=client_scan_id,
            barcode=clean_barcode,
            koha_item_id=None,
            koha_biblio_id=None,
            outcome=outcome,
            is_primary=True,
            primary_scan_id=None,
            message=message,
            title=None,
            author=None,
            call_number=None,
            item_type_id=None,
            item_type_label=None,
            home_library_id=None,
            home_library_name=None,
            holding_library_id=None,
            holding_library_name=None,
            location=None,
            koha_status=None,
            koha_status_label=None,
            scanned_by=user_id,
        )
        try:
            with db.begin_nested():
                db.add(row)
                db.flush()
        except IntegrityError:
            winner = (
                db.query(InventoryScan)
                .filter_by(session_id=session_id, barcode=clean_barcode, is_primary=True)
                .one()
            )
            row = _insert_duplicate_scan(
                db,
                session_id=session_id,
                user_id=user_id,
                client_scan_id=client_scan_id,
                barcode=clean_barcode,
                primary=winner,
            )
    elif len(items) > 1:
        _raise(*_SCAN_AMBIGUOUS)
    else:
        item = items[0]
        item_id = item.get("item_id")
        if not isinstance(item_id, int):
            _raise(*_SCAN_AMBIGUOUS)

        existing_item = _primary_for_item(db, session_id=session_id, item_id=item_id)
        if existing_item is not None:
            row = _insert_duplicate_scan(
                db,
                session_id=session_id,
                user_id=user_id,
                client_scan_id=client_scan_id,
                barcode=clean_barcode,
                primary=existing_item,
            )
        else:
            outcome, message = classify_primary(
                item,
                session_library_id=session.home_library_id,
                session_library_name=session.home_library_name,
                session_location=session.location,
            )
            snapshot = _snapshot_from_item(client, item)
            row = _insert_primary_from_item(
                db,
                session_id=session_id,
                user_id=user_id,
                client_scan_id=client_scan_id,
                barcode=clean_barcode,
                outcome=outcome,
                message=message,
                snapshot=snapshot,
            )

    _audit_scan(
        db,
        user_id=user_id,
        session=session,
        scan_id=row.id,
        barcode=clean_barcode,
        outcome=row.outcome,
    )
    db.commit()
    db.refresh(row)
    return {"scan": _scan_payload(row), "counters": _session_counters(db, session)}


def list_scans(
    db: Session,
    *,
    department_id: UUID | None,
    session_id: UUID,
    params: ScanListParams,
) -> dict[str, Any]:
    _validate_scan_list_params(params)
    session = _fetch_session(db, department_id=department_id, session_id=session_id)

    query = db.query(InventoryScan).filter(InventoryScan.session_id == session.id)
    if params.outcome:
        query = query.filter(InventoryScan.outcome == params.outcome)
    if params.q:
        pattern = f"%{escape_like(params.q)}%"
        query = query.filter(InventoryScan.barcode.like(pattern, escape="\\"))

    sort_col = _SCAN_SORT_COLUMNS[params.sort]
    if params.direction == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total = query.count()
    offset = (params.page - 1) * params.per_page
    rows = query.offset(offset).limit(params.per_page).all()
    has_next = params.page * params.per_page < total

    return {
        "items": [_scan_payload(row) for row in rows],
        "page": params.page,
        "per_page": params.per_page,
        "total": total,
        "has_next": has_next,
    }