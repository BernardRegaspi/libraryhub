from __future__ import annotations

from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.dependencies.session import require_patron_permission
from app.core.config import get_settings
from app.database.session import get_db_session
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import KohaError, KohaNotFound, KohaTimeoutError
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.schemas.patrons import PatronSearchParams, PatronWrite
from app.services.auth import AuthError, assert_csrf
from app.services.patrons import (
    PatronError,
    create_patron_record,
    get_patron_detail,
    patron_checkouts,
    patron_holds,
    patron_options,
    search_patrons,
    update_patron_record,
)

router = APIRouter(prefix="/patrons", tags=["patrons"])

_PATRONS_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "patrons_unavailable",
        "message": "Patron records are unavailable. Try again.",
    },
)
_PATRONS_TIMEOUT = HTTPException(
    status_code=504,
    detail={
        "code": "patrons_timeout",
        "message": "Patron records took too long to respond. Try again.",
    },
)
_PATRON_NOT_FOUND = HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "That patron was not found."},
)


def _koha_client() -> KohaClient:
    return KohaClient(get_settings())


def _raise_patron(exc: PatronError) -> None:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.fields:
        detail["fields"] = exc.fields
    raise HTTPException(status_code=exc.status_code, detail=detail) from exc


def _handle_koha(exc: KohaError) -> None:
    if isinstance(exc, KohaTimeoutError):
        raise _PATRONS_TIMEOUT from exc
    if isinstance(exc, KohaNotFound):
        raise _PATRON_NOT_FOUND from exc
    raise _PATRONS_UNAVAILABLE from exc


def _parse_patron_id(patron_id: str) -> int:
    if not patron_id.isdigit():
        raise _PATRON_NOT_FOUND
    value = int(patron_id)
    if value < 1:
        raise _PATRON_NOT_FOUND
    return value


def _validation_fields(exc: ValidationError) -> list[dict]:
    fields: list[dict] = []
    for err in exc.errors():
        loc = err.get("loc", ())
        name = str(loc[-1]) if loc else "body"
        fields.append({"name": name, "message": err["msg"]})
    return fields


def _parse_write(raw: dict) -> PatronWrite:
    try:
        return PatronWrite.model_validate(raw)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That patron record is not valid.",
                "fields": _validation_fields(exc),
            },
        ) from exc


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


def _manila_today() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


@router.get("")
def patrons_search(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.view")),
    ],
    params: Annotated[PatronSearchParams, Query()],
) -> dict:
    payload, _session = user
    client = _koha_client()
    try:
        return search_patrons(client, params)
    except PatronError as exc:
        _raise_patron(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/options")
def patrons_list_options(
    _user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.view")),
    ],
) -> dict:
    client = _koha_client()
    try:
        return patron_options(client)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/{patron_id}")
def patrons_detail(
    patron_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.view")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    parsed_id = _parse_patron_id(patron_id)
    payload, _session = user
    sensitive = "patrons.sensitive.view" in payload.permissions
    client = _koha_client()
    try:
        return get_patron_detail(
            db,
            client,
            parsed_id,
            user_id=payload.user.id,
            sensitive=sensitive,
        )
    except PatronError as exc:
        _raise_patron(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/{patron_id}/checkouts")
def patrons_checkouts(
    patron_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.view")),
    ],
) -> dict:
    parsed_id = _parse_patron_id(patron_id)
    payload, _session = user
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    try:
        return patron_checkouts(
            client,
            parsed_id,
            include_barcode=include_barcode,
            today=_manila_today(),
        )
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/{patron_id}/holds")
def patrons_holds(
    patron_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.view")),
    ],
) -> dict:
    parsed_id = _parse_patron_id(patron_id)
    client = _koha_client()
    try:
        return patron_holds(client, parsed_id)
    except KohaError as exc:
        _handle_koha(exc)


@router.post("")
def patrons_create(
    request: Request,
    raw: Annotated[dict, Body()],
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.create")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    body = _parse_write(raw)
    sensitive = "patrons.sensitive.view" in payload.permissions
    client = _koha_client()
    try:
        return create_patron_record(
            db,
            client,
            body,
            user_id=payload.user.id,
            sensitive=sensitive,
        )
    except PatronError as exc:
        _raise_patron(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.put("/{patron_id}")
def patrons_update(
    patron_id: str,
    request: Request,
    raw: Annotated[dict, Body()],
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_patron_permission("patrons.update")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    parsed_id = _parse_patron_id(patron_id)
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    body = _parse_write(raw)
    sensitive = "patrons.sensitive.view" in payload.permissions
    client = _koha_client()
    try:
        return update_patron_record(
            db,
            client,
            parsed_id,
            body,
            user_id=payload.user.id,
            sensitive=sensitive,
        )
    except PatronError as exc:
        _raise_patron(exc)
    except KohaError as exc:
        _handle_koha(exc)