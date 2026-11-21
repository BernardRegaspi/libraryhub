from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies.session import require_inventory_user
from app.core.config import get_settings
from app.database.session import get_db_session
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import KohaError, KohaTimeoutError
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.schemas.inventory import ScanIn, ScanListParams, SessionCreateIn, SessionListParams
from app.services.auth import AuthError, assert_csrf
from app.services.inventory import (
    InventoryError,
    cancel_session,
    create_session,
    get_session,
    list_scans,
    list_sessions,
    record_scan,
    start_session,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

_SESSION_NOT_FOUND = HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "That inventory session was not found."},
)

_COUNT_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "inventory_unavailable",
        "message": "Koha could not count items. Try again.",
    },
)

_SCAN_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "inventory_unavailable",
        "message": "Koha could not look up this barcode. The scan was not saved.",
    },
)

_LIBRARIES_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "inventory_unavailable",
        "message": "Koha could not load libraries. Try again.",
    },
)

_INVENTORY_TIMEOUT = HTTPException(
    status_code=504,
    detail={
        "code": "inventory_timeout",
        "message": "Koha took too long to respond. Try again.",
    },
)


def _koha_client() -> KohaClient:
    return KohaClient(get_settings())


def _raise_inventory(exc: InventoryError) -> None:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.fields:
        detail["fields"] = exc.fields
    raise HTTPException(status_code=exc.status_code, detail=detail) from exc


def _handle_koha_create(exc: KohaError) -> None:
    if isinstance(exc, KohaTimeoutError):
        raise HTTPException(
            status_code=504,
            detail={
                "code": "inventory_timeout",
                "message": "Koha took too long to count items. Try again.",
            },
        ) from exc
    raise _COUNT_UNAVAILABLE from exc


def _handle_koha_scan(exc: KohaError) -> None:
    if isinstance(exc, KohaTimeoutError):
        raise HTTPException(
            status_code=504,
            detail={
                "code": "inventory_timeout",
                "message": "Koha took too long to look up this barcode. The scan was not saved.",
            },
        ) from exc
    raise _SCAN_UNAVAILABLE from exc


def _handle_koha_libraries(exc: KohaError) -> None:
    if isinstance(exc, KohaTimeoutError):
        raise _INVENTORY_TIMEOUT from exc
    raise _LIBRARIES_UNAVAILABLE from exc


def _parse_session_id(session_id: str) -> UUID:
    try:
        return UUID(session_id)
    except ValueError:
        raise _SESSION_NOT_FOUND from None


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


@router.get("/libraries")
def inventory_libraries(
    _user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
) -> dict:
    client = _koha_client()
    try:
        names = client.library_names()
    except KohaError as exc:
        _handle_koha_libraries(exc)
    return {"libraries": [{"id": library_id, "name": name} for library_id, name in names.items()]}


@router.get("/sessions")
def inventory_list_sessions(
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    params: Annotated[SessionListParams, Query()],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    try:
        return list_sessions(db, department_id=payload.active_department_id, params=params)
    except InventoryError as exc:
        _raise_inventory(exc)


@router.post("/sessions", status_code=201)
def inventory_create_session(
    request: Request,
    body: SessionCreateIn,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    client = _koha_client()
    try:
        return create_session(
            db,
            client,
            user_id=payload.user.id,
            department_id=payload.active_department_id,
            name=body.name,
            home_library_id=body.home_library_id,
            location=body.location,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    except KohaError as exc:
        _handle_koha_create(exc)


@router.get("/sessions/{session_id}")
def inventory_get_session(
    session_id: str,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    parsed = _parse_session_id(session_id)
    try:
        return get_session(
            db,
            department_id=payload.active_department_id,
            session_id=parsed,
        )
    except InventoryError as exc:
        _raise_inventory(exc)


@router.post("/sessions/{session_id}/start")
def inventory_start_session(
    session_id: str,
    request: Request,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    parsed = _parse_session_id(session_id)
    try:
        return start_session(
            db,
            user_id=payload.user.id,
            department_id=payload.active_department_id,
            session_id=parsed,
        )
    except InventoryError as exc:
        _raise_inventory(exc)


@router.post("/sessions/{session_id}/cancel")
def inventory_cancel_session(
    session_id: str,
    request: Request,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    parsed = _parse_session_id(session_id)
    try:
        return cancel_session(
            db,
            user_id=payload.user.id,
            department_id=payload.active_department_id,
            session_id=parsed,
        )
    except InventoryError as exc:
        _raise_inventory(exc)


@router.post("/sessions/{session_id}/scans")
def inventory_record_scan(
    session_id: str,
    request: Request,
    body: ScanIn,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    parsed = _parse_session_id(session_id)
    client = _koha_client()
    try:
        return record_scan(
            db,
            client,
            user_id=payload.user.id,
            department_id=payload.active_department_id,
            session_id=parsed,
            client_scan_id=body.client_scan_id,
            barcode=body.barcode,
        )
    except InventoryError as exc:
        _raise_inventory(exc)
    except KohaError as exc:
        _handle_koha_scan(exc)


@router.get("/sessions/{session_id}/scans")
def inventory_list_scans(
    session_id: str,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(require_inventory_user)],
    params: Annotated[ScanListParams, Query()],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    parsed = _parse_session_id(session_id)
    try:
        return list_scans(
            db,
            department_id=payload.active_department_id,
            session_id=parsed,
            params=params,
        )
    except InventoryError as exc:
        _raise_inventory(exc)