from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.dependencies.session import require_inventory_permission
from app.core.config import get_settings
from app.database.session import get_db_session
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import KohaError
from app.integrations.koha.inventory import (
    capabilities_payload,
    get_inventory_capabilities,
)
from app.models.identity import (
    AppUser,
    LibraryDepartment,
    Permission,
    RolePermission,
    UserRoleAssignment,
)
from app.models.inventory import InventoryAdjustment, InventorySession
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.schemas.inventory import (
    AdjustmentCreateIn,
    AdjustmentRejectIn,
    AdjustmentUpdateIn,
    DamageIn,
    ScanIn,
    SessionCreateIn,
    SessionUpdateIn,
    ShelfSearchIn,
    ShelfSearchReverseIn,
)
from app.services.auth import AuthError, assert_csrf
from app.services.inventory_adjustments import (
    decide_adjustment,
    draft_adjustment,
    submit_adjustment,
    update_draft_adjustment,
)
from app.services.inventory_audit import list_session_audit, write_inventory_audit
from app.services.inventory_errors import InventoryError, department_required
from app.services.inventory_exports import export_rows, render_export
from app.services.inventory_scans import set_damage, submit_scan
from app.services.inventory_sessions import (
    cancel_session,
    complete_session,
    create_session,
    list_session_items,
    list_sessions,
    reopen_session,
    session_summary,
    start_session,
    update_draft,
)
from app.services.inventory_shelf import mark_not_found, reverse_not_found

router = APIRouter(prefix="/inventory", tags=["inventory"])

_NOT_FOUND = HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "That resource was not found."},
)

_SESSION_STATUSES = frozenset({"all", "active", "planned", "review", "closed"})
_ITEM_CONDITIONS = frozenset(
    {"all", "unverified", "found", "not_found", "misplaced", "unexpected", "damaged", "withdrawn"},
)
_ITEM_SORTS = frozenset({"title", "author", "barcode", "location", "condition", "scanned_at"})
_EXPORT_KINDS = frozenset({"findings", "filter", "unverified", "work_order"})
_EXPORT_FORMATS = frozenset({"csv", "xlsx"})


def _koha_client() -> KohaClient:
    return KohaClient(get_settings())


def _raise_inventory(exc: InventoryError) -> None:
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    ) from exc


def _validation_error() -> None:
    raise HTTPException(
        status_code=422,
        detail={"code": "validation_error", "message": "That request is not valid."},
    )


def _require_department(payload: CurrentUserOut) -> uuid.UUID | None:
    if payload.active_department_id is None:
        if not payload.can_select_all_departments:
            _raise_inventory(department_required())
        return None
    return payload.active_department_id


def _assert_write_csrf(request: Request, session_row: UserSession) -> None:
    try:
        assert_csrf(
            session_row,
            request.headers.get("X-CSRF-Token"),
            request.cookies.get("libraryhub_csrf"),
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (TypeError, ValueError) as exc:
        raise _NOT_FOUND from exc


def _bounded_query(value: str, *, low: int, high: int | None) -> int:
    if not value or any(char < "0" or char > "9" for char in value):
        _validation_error()
    parsed = int(value)
    if parsed < low or (high is not None and parsed > high):
        _validation_error()
    return parsed


def _clean_q(value: str) -> str:
    if len(value) > 80 or any(ord(char) < 32 or ord(char) == 127 for char in value):
        _validation_error()
    return value


def _load_session(
    db: Session,
    session_id: uuid.UUID,
    *,
    department_id: uuid.UUID | None,
) -> InventorySession:
    session = db.get(InventorySession, session_id)
    if session is None or (
        department_id is not None and session.department_id != department_id
    ):
        raise _NOT_FOUND
    return session


def _load_adjustment(
    db: Session,
    adjustment_id: uuid.UUID,
    *,
    department_id: uuid.UUID | None,
) -> tuple[InventoryAdjustment, InventorySession]:
    row = db.get(InventoryAdjustment, adjustment_id)
    if row is None:
        raise _NOT_FOUND
    session = _load_session(db, row.session_id, department_id=department_id)
    return row, session


def _location_rows(db: Session, session_id: uuid.UUID) -> list[str]:
    from app.models.inventory import InventorySessionLocation

    return list(
        db.scalars(
            select(InventorySessionLocation.location)
            .where(InventorySessionLocation.session_id == session_id)
            .order_by(InventorySessionLocation.location),
        ).all(),
    )


def _operator_ids(db: Session, session_id: uuid.UUID) -> list[str]:
    from app.models.inventory import InventorySessionOperator

    rows = db.scalars(
        select(InventorySessionOperator.user_id)
        .where(InventorySessionOperator.session_id == session_id)
        .order_by(InventorySessionOperator.user_id),
    ).all()
    return [str(row) for row in rows]


def _session_payload(session: InventorySession, db: Session) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "department_id": str(session.department_id),
        "name": session.name,
        "description": session.description,
        "status": session.status,
        "home_library_id": session.home_library_id,
        "item_type_id": session.item_type_id,
        "start_on": session.start_on.isoformat(),
        "target_on": session.target_on.isoformat() if session.target_on else None,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "cancelled_at": session.cancelled_at.isoformat() if session.cancelled_at else None,
        "reopened_at": session.reopened_at.isoformat() if session.reopened_at else None,
        "snapshot_taken_at": session.snapshot_taken_at.isoformat()
        if session.snapshot_taken_at
        else None,
        "expected_count": session.expected_count,
        "created_by": str(session.created_by) if session.created_by else None,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "locations": _location_rows(db, session.id),
        "operator_ids": _operator_ids(db, session.id),
    }


def _adjustment_payload(row: InventoryAdjustment) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "session_id": str(row.session_id),
        "koha_item_id": row.koha_item_id,
        "expected_item_id": str(row.expected_item_id) if row.expected_item_id else None,
        "scan_id": str(row.scan_id) if row.scan_id else None,
        "field": row.field,
        "from_value": row.from_value,
        "to_value": row.to_value,
        "reason": row.reason,
        "status": row.status,
        "drafted_by": str(row.drafted_by) if row.drafted_by else None,
        "decided_by": str(row.decided_by) if row.decided_by else None,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
        "koha_http_status": row.koha_http_status,
        "koha_error": row.koha_error,
    }


def _scan_response(payload: dict[str, Any], *, include_barcode: bool) -> dict[str, Any]:
    body = dict(payload)
    submitted = body.pop("barcode_submitted", None)
    if include_barcode and submitted is not None:
        body["external_id"] = submitted
    return body


def _strip_item_barcodes(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{key: value for key, value in row.items() if key != "barcode"} for row in items]


def _audit_payload(row) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "user_id": str(row.user_id) if row.user_id else None,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.details,
        "created_at": row.created_at.isoformat(),
    }


def _department_scope(department: LibraryDepartment) -> dict[str, str | None]:
    branch = (department.koha_branchcode or "").strip()
    return {
        "id": str(department.id),
        "name": department.name,
        "home_library_id": branch or None,
    }


def _list_manage_operators(db: Session, department_id: uuid.UUID | None) -> list[dict[str, str]]:
    perm_id = db.scalar(select(Permission.id).where(Permission.code == "inventory.manage"))
    if perm_id is None:
        return []
    department_filter = (
        or_(
            UserRoleAssignment.department_id == department_id,
            UserRoleAssignment.department_id.is_(None),
        )
        if department_id is not None
        else None
    )
    stmt = (
        select(AppUser)
        .join(UserRoleAssignment, UserRoleAssignment.user_id == AppUser.id)
        .join(RolePermission, RolePermission.role_id == UserRoleAssignment.role_id)
        .where(
            RolePermission.permission_id == perm_id,
            AppUser.status == "active",
            *([department_filter] if department_filter is not None else []),
        )
        .distinct()
        .order_by(AppUser.display_name)
    )
    return [
        {"id": str(user.id), "display_name": user.display_name, "username": user.username}
        for user in db.scalars(stmt).all()
    ]


@router.get("/capabilities")
def capabilities(
    _user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
) -> dict:
    caps = get_inventory_capabilities()
    return capabilities_payload(caps)


@router.get("/scope-options")
def scope_options(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    caps = get_inventory_capabilities()
    client = _koha_client()
    labels: dict[str, str] = {}
    try:
        labels = client.item_type_labels()
    except KohaError:
        labels = {}
    item_types = [{"id": key, "label": value} for key, value in sorted(labels.items())]
    locations: list[dict[str, str]] = []
    if caps.locations is not None:
        try:
            raw = client.get_json(caps.locations.path, {})
            if isinstance(raw, list):
                for row in raw:
                    code = row.get("code") or row.get("id") or row.get("location")
                    label = row.get("description") or row.get("name") or code
                    if code is not None:
                        locations.append({"id": str(code), "label": str(label)})
        except KohaError:
            locations = []
    if department_id is None:
        departments = db.scalars(
            select(LibraryDepartment)
            .where(LibraryDepartment.is_active.is_(True))
            .order_by(LibraryDepartment.name),
        ).all()
        return {
            "item_types": item_types,
            "locations": locations,
            "home_library_id": None,
            "departments": [_department_scope(row) for row in departments],
        }
    department = db.get(LibraryDepartment, department_id)
    option = _department_scope(department) if department is not None else None
    return {
        "item_types": item_types,
        "locations": locations,
        "home_library_id": None if option is None else option["home_library_id"],
        "departments": [] if option is None else [option],
    }


@router.get("/operators")
def operators(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    return {"items": _list_manage_operators(db, department_id)}


@router.get("/sessions")
def sessions_list(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
    status: Annotated[str, Query()] = "all",
    q: Annotated[str, Query()] = "",
    page: Annotated[str, Query()] = "1",
    per_page: Annotated[str, Query()] = "20",
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    if status not in _SESSION_STATUSES:
        _validation_error()
    q = _clean_q(q) if q else ""
    parsed_page = _bounded_query(page, low=1, high=10000)
    parsed_per_page = _bounded_query(per_page, low=1, high=50)
    try:
        result = list_sessions(
            db,
            department_id=department_id,
            status=status,
            q=q,
            page=parsed_page,
            per_page=parsed_per_page,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return {
        "items": [_session_payload(row, db) for row in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
    }


@router.post("/sessions", status_code=201)
def sessions_create(
    request: Request,
    body: SessionCreateIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload) or body.department_id
    if department_id is None:
        _raise_inventory(department_required())
    try:
        row = create_session(
            db,
            user_id=payload.user.id,
            department_id=department_id,
            name=body.name,
            description=body.description,
            start_on=body.start_on,
            target_on=body.target_on,
            locations=body.locations,
            item_type_id=body.item_type_id,
            operator_ids=list(body.operator_ids),
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(row, db)


@router.get("/sessions/{session_id}")
def sessions_detail(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    row = _load_session(db, _parse_uuid(session_id), department_id=department_id)
    return _session_payload(row, db)


@router.patch("/sessions/{session_id}")
def sessions_update(
    session_id: str,
    request: Request,
    body: SessionUpdateIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    session = _load_session(db, _parse_uuid(session_id), department_id=department_id)
    changes: dict[str, Any] = {}
    for field in ("name", "description", "start_on", "target_on", "item_type_id"):
        value = getattr(body, field)
        if value is not None:
            changes[field] = value
    if body.locations is not None:
        changes["locations"] = body.locations
    if body.operator_ids is not None:
        changes["operator_ids"] = list(body.operator_ids)
    try:
        updated = update_draft(db, session, changes)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(updated, db)


@router.post("/sessions/{session_id}/start")
def sessions_start(
    session_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    caps = get_inventory_capabilities()
    client = _koha_client()
    try:
        row = start_session(db, client, caps, parsed_id)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(row, db)


@router.post("/sessions/{session_id}/complete")
def sessions_complete(
    session_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    try:
        row = complete_session(db, session_id=parsed_id, user_id=payload.user.id)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(row, db)


@router.post("/sessions/{session_id}/cancel")
def sessions_cancel(
    session_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    try:
        row = cancel_session(db, session_id=parsed_id, user_id=payload.user.id)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(row, db)


@router.post("/sessions/{session_id}/reopen")
def sessions_reopen(
    session_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    try:
        row = reopen_session(db, session_id=parsed_id, user_id=payload.user.id)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _session_payload(row, db)


@router.get("/sessions/{session_id}/summary")
def sessions_summary(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    return session_summary(db, parsed_id)


@router.post("/sessions/{session_id}/scans")
def sessions_scan(
    session_id: str,
    request: Request,
    body: ScanIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    try:
        result = submit_scan(
            db,
            client,
            session_id=parsed_id,
            user_id=payload.user.id,
            barcode=body.barcode,
            station_location=body.station_location,
            damaged=body.damaged,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _scan_response(result, include_barcode=include_barcode)


@router.post("/sessions/{session_id}/scans/{scan_id}/damage")
def sessions_damage(
    session_id: str,
    scan_id: str,
    request: Request,
    body: DamageIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_session = _parse_uuid(session_id)
    _load_session(db, parsed_session, department_id=department_id)
    include_barcode = "catalog.barcode.view" in payload.permissions
    try:
        result = set_damage(
            db,
            session_id=parsed_session,
            scan_id=_parse_uuid(scan_id),
            user_id=payload.user.id,
            damaged=body.damaged,
            remark=body.remark,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _scan_response(result, include_barcode=include_barcode)


@router.get("/sessions/{session_id}/items")
def sessions_items(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
    condition: Annotated[str, Query()] = "all",
    q: Annotated[str, Query()] = "",
    location: Annotated[str, Query()] = "",
    page: Annotated[str, Query()] = "1",
    per_page: Annotated[str, Query()] = "20",
    sort: Annotated[str, Query()] = "scanned_at",
    direction: Annotated[str, Query()] = "desc",
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    session = _load_session(db, _parse_uuid(session_id), department_id=department_id)
    if condition not in _ITEM_CONDITIONS:
        _validation_error()
    if sort not in _ITEM_SORTS or direction not in {"asc", "desc"}:
        _validation_error()
    include_barcode = "catalog.barcode.view" in payload.permissions
    if sort == "barcode" and not include_barcode:
        _validation_error()
    q = _clean_q(q) if q else ""
    parsed_page = _bounded_query(page, low=1, high=10000)
    parsed_per_page = _bounded_query(per_page, low=1, high=50)
    result = list_session_items(
        db,
        session,
        condition=condition,
        q=q,
        location=location.strip(),
        page=parsed_page,
        per_page=parsed_per_page,
        sort=sort,
        direction=direction,
        include_barcode=include_barcode,
    )
    items = result["items"]
    if not include_barcode:
        items = _strip_item_barcodes(items)
    return {
        "items": items,
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
    }


@router.post("/sessions/{session_id}/shelf-searches", status_code=201)
def shelf_search_create(
    session_id: str,
    request: Request,
    body: ShelfSearchIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    try:
        rows = mark_not_found(
            db,
            session_id=parsed_id,
            user_id=payload.user.id,
            expected_item_ids=list(body.expected_item_ids),
            remark=body.remark,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return {
        "items": [
            {
                "id": str(row.id),
                "expected_item_id": str(row.expected_item_id),
                "batch_id": str(row.batch_id),
                "remark": row.remark,
            }
            for row in rows
        ],
    }


@router.post("/sessions/{session_id}/shelf-searches/{search_id}/reverse")
def shelf_search_reverse(
    session_id: str,
    search_id: str,
    request: Request,
    body: ShelfSearchReverseIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    try:
        row = reverse_not_found(
            db,
            session_id=parsed_id,
            search_id=_parse_uuid(search_id),
            user_id=payload.user.id,
            remark=body.remark,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return {
        "id": str(row.id),
        "expected_item_id": str(row.expected_item_id),
        "reversed_at": row.reversed_at.isoformat() if row.reversed_at else None,
    }


@router.get("/sessions/{session_id}/adjustments")
def session_adjustments(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    rows = db.scalars(
        select(InventoryAdjustment)
        .where(InventoryAdjustment.session_id == parsed_id)
        .order_by(InventoryAdjustment.created_at.desc()),
    ).all()
    return {"items": [_adjustment_payload(row) for row in rows]}


@router.post("/sessions/{session_id}/adjustments", status_code=201)
def session_adjustments_create(
    session_id: str,
    request: Request,
    body: AdjustmentCreateIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    caps = get_inventory_capabilities()
    try:
        row = draft_adjustment(
            db,
            caps,
            session_id=parsed_id,
            user_id=payload.user.id,
            koha_item_id=body.koha_item_id,
            field=body.field,
            to_value=body.to_value,
            reason=body.reason,
            from_value=body.from_value,
            expected_item_id=body.expected_item_id,
            scan_id=body.scan_id,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _adjustment_payload(row)


@router.patch("/adjustments/{adjustment_id}")
def adjustments_update(
    adjustment_id: str,
    request: Request,
    body: AdjustmentUpdateIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.manage")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    _row, _session = _load_adjustment(db, _parse_uuid(adjustment_id), department_id=department_id)
    caps = get_inventory_capabilities()
    try:
        updated = update_draft_adjustment(
            db,
            caps,
            adjustment_id=_row.id,
            user_id=payload.user.id,
            field=body.field,
            to_value=body.to_value,
            reason=body.reason,
            from_value=body.from_value,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _adjustment_payload(updated)


@router.post("/adjustments/{adjustment_id}/approve")
def adjustments_approve(
    adjustment_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.adjustments.approve")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    row, _session = _load_adjustment(db, _parse_uuid(adjustment_id), department_id=department_id)
    try:
        updated = decide_adjustment(
            db,
            adjustment_id=row.id,
            decision="approved",
            user_id=payload.user.id,
            reason="",
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _adjustment_payload(updated)


@router.post("/adjustments/{adjustment_id}/reject")
def adjustments_reject(
    adjustment_id: str,
    request: Request,
    body: AdjustmentRejectIn,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.adjustments.approve")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    row, _session = _load_adjustment(db, _parse_uuid(adjustment_id), department_id=department_id)
    try:
        updated = decide_adjustment(
            db,
            adjustment_id=row.id,
            decision="rejected",
            user_id=payload.user.id,
            reason=body.reason,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    return _adjustment_payload(updated)


@router.post("/adjustments/{adjustment_id}/submit")
def adjustments_submit(
    adjustment_id: str,
    request: Request,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.adjustments.approve")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    department_id = _require_department(payload)
    row, _session = _load_adjustment(db, _parse_uuid(adjustment_id), department_id=department_id)
    caps = get_inventory_capabilities()
    client = _koha_client()
    try:
        updated = submit_adjustment(db, client, caps, row.id, payload.user.id)
    except InventoryError as exc:
        _raise_inventory(exc)
    return _adjustment_payload(updated)


@router.get("/sessions/{session_id}/exports")
def session_exports(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
    kind: Annotated[str, Query()] = "findings",
    format: Annotated[str, Query()] = "csv",
    condition: Annotated[str, Query()] = "all",
    q: Annotated[str, Query()] = "",
    location: Annotated[str, Query()] = "",
    sort: Annotated[str, Query()] = "scanned_at",
    direction: Annotated[str, Query()] = "desc",
) -> Response:
    payload, _session = user
    department_id = _require_department(payload)
    session = _load_session(db, _parse_uuid(session_id), department_id=department_id)
    if kind not in _EXPORT_KINDS or format not in _EXPORT_FORMATS:
        _validation_error()
    if condition not in _ITEM_CONDITIONS:
        _validation_error()
    if sort not in _ITEM_SORTS or direction not in {"asc", "desc"}:
        _validation_error()
    include_barcode = "catalog.barcode.view" in payload.permissions
    if sort == "barcode" and not include_barcode:
        _validation_error()
    q = _clean_q(q) if q else ""
    item_query = {
        "condition": condition,
        "q": q,
        "location": location.strip(),
        "sort": sort,
        "direction": direction,
    }
    rows = export_rows(
        db,
        session_id=session.id,
        kind=kind,
        item_query=item_query,
        include_barcode=include_barcode,
    )
    content, media_type = render_export(rows, format)
    write_inventory_audit(
        db,
        user_id=payload.user.id,
        action="inventory.export",
        entity_type="session",
        entity_id=str(session.id),
        details={"kind": kind, "format": format, "row_count": len(rows)},
    )
    db.commit()
    filename = f"inventory-{session.id}.{format}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/sessions/{session_id}/audit")
def session_audit(
    session_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_inventory_permission("inventory.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
    actor_id: Annotated[str | None, Query()] = None,
    action: Annotated[str | None, Query()] = None,
    page: Annotated[str, Query()] = "1",
    per_page: Annotated[str, Query()] = "20",
) -> dict:
    payload, _session = user
    department_id = _require_department(payload)
    parsed_id = _parse_uuid(session_id)
    _load_session(db, parsed_id, department_id=department_id)
    parsed_actor: uuid.UUID | None = None
    if actor_id:
        try:
            parsed_actor = uuid.UUID(actor_id)
        except (TypeError, ValueError):
            _validation_error()
    parsed_page = _bounded_query(page, low=1, high=10000)
    parsed_per_page = _bounded_query(per_page, low=1, high=50)
    result = list_session_audit(
        db,
        parsed_id,
        actor_id=parsed_actor,
        action=action,
        page=parsed_page,
        per_page=parsed_per_page,
    )
    return {
        "items": [_audit_payload(row) for row in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "per_page": result["per_page"],
    }