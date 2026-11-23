from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.api.dependencies.session import (
    _CIRCULATION_PERMISSION_DENIED,
    require_circulation_permission,
)
from app.core.config import get_settings
from app.database.session import get_db_session
from app.integrations.koha.circulation import (
    capabilities_payload,
    get_circulation_capabilities,
)
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import KohaError, KohaNotFound
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.services.auth import AuthError, assert_csrf, load_session
from app.services.circulation_checkin import submit_checkin
from app.services.circulation_checkout import submit_checkout
from app.services.circulation_errors import CirculationError
from app.services.circulation_loans import get_loan, list_history, list_loans
from app.services.circulation_lookup import desk_patron, item_by_barcode, patron_by_card
from app.services.circulation_renew import renewal_preview, submit_renewal, verify_request
from app.services.circulation_requests import load_request

router = APIRouter(prefix="/circulation", tags=["circulation"])

_NOT_FOUND = HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "That resource was not found."},
)
_CIRCULATION_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "circulation_unavailable",
        "message": "Circulation is unavailable. Try again.",
    },
)

_ACTION_PERMISSION = {
    "checkout": "circulation.checkout",
    "checkin": "circulation.checkin",
    "renew": "circulation.renew",
}


def _koha_client() -> KohaClient:
    return KohaClient(get_settings())


def _raise_circulation(exc: CirculationError) -> None:
    detail: dict = {"code": exc.code, "message": exc.message}
    if exc.request_id is not None:
        detail["request_id"] = exc.request_id
    if exc.items is not None:
        detail["items"] = exc.items
    raise HTTPException(status_code=exc.status_code, detail=detail) from exc


def _handle_koha(exc: KohaError, *, not_found: str | None = None) -> None:
    if isinstance(exc, KohaNotFound) and not_found is not None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": not_found},
        ) from exc
    raise _CIRCULATION_UNAVAILABLE from exc


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


def _patron_category_labels(client: KohaClient) -> dict[str, str]:
    try:
        rows = client.list_patron_categories()
    except KohaError:
        return {}
    labels: dict[str, str] = {}
    for row in rows:
        cat_id = row.get("patron_category_id")
        name = row.get("name")
        if cat_id is not None and name is not None:
            labels[str(cat_id)] = str(name)
    return labels


def _library_labels(client: KohaClient) -> dict[str, str]:
    try:
        return client.library_names()
    except KohaError:
        return {}


def _item_type_labels(client: KohaClient) -> dict[str, str]:
    try:
        return client.item_type_labels()
    except KohaError:
        return {}


def _positive_id(value: str, *, message: str) -> int:
    parsed = _ascii_int(value)
    if parsed is None or parsed < 1:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": message})
    return parsed


def _ascii_int(value: str) -> int | None:
    if not value or any(char < "0" or char > "9" for char in value):
        return None
    return int(value)


def _invalid_search() -> None:
    raise HTTPException(
        status_code=422,
        detail={"code": "invalid_search", "message": "That search is not valid."},
    )


def _bounded_query(value: str, *, low: int, high: int | None) -> int:
    parsed = _ascii_int(value)
    if parsed is None or parsed < low or (high is not None and parsed > high):
        _invalid_search()
    return parsed


def _parse_uuid(value: object) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That request is not valid.",
            },
        ) from exc


@router.get("/capabilities")
def capabilities(
    _user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
) -> dict:
    caps = get_circulation_capabilities()
    return capabilities_payload(caps)


@router.get("/patrons/by-card")
def patron_by_card_route(
    _user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
    cardnumber: Annotated[str, Query()],
) -> dict:
    client = _koha_client()
    categories = _patron_category_labels(client)
    libraries = _library_labels(client)
    try:
        return patron_by_card(client, categories, libraries, cardnumber)
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc, not_found="That patron was not found.")


@router.get("/patrons/{patron_id}")
def patron_detail(
    patron_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
) -> dict:
    parsed_id = _positive_id(patron_id, message="That patron was not found.")
    client = _koha_client()
    categories = _patron_category_labels(client)
    libraries = _library_labels(client)
    try:
        return desk_patron(client, categories, libraries, parsed_id, include_barcode=True)
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc, not_found="That patron was not found.")


@router.get("/items/by-barcode")
def item_by_barcode_route(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
    barcode: Annotated[str, Query()],
) -> dict:
    payload, _session = user
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    types = _item_type_labels(client)
    libraries = _library_labels(client)
    try:
        return item_by_barcode(
            client,
            types,
            libraries,
            barcode,
            include_barcode=include_barcode,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc, not_found="That item was not found.")


@router.get("/loans")
def loans_list(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
    patron_id: Annotated[str, Query()],
    q: Annotated[str, Query()] = "",
    overdue: Annotated[str | None, Query()] = None,
    page: Annotated[str, Query()] = "1",
    per_page: Annotated[str, Query()] = "20",
    sort: Annotated[str, Query()] = "due_date",
    direction: Annotated[str, Query()] = "asc",
) -> dict:
    payload, _session = user
    parsed_patron = _bounded_query(patron_id, low=1, high=None)
    parsed_page = _bounded_query(page, low=1, high=10000)
    parsed_per_page = _bounded_query(per_page, low=1, high=20)
    if overdue is None:
        overdue_flag = None
    elif overdue.casefold() == "true":
        overdue_flag = True
    elif overdue.casefold() == "false":
        overdue_flag = False
    else:
        _invalid_search()
        overdue_flag = None
    if sort not in {"due_date", "title", "checkout_date"} or direction not in {"asc", "desc"}:
        _invalid_search()
    if len(q) > 64 or any(ord(char) < 32 or ord(char) == 127 for char in q):
        _invalid_search()
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    try:
        return list_loans(
            client,
            patron_id=parsed_patron,
            q=q,
            overdue=overdue_flag,
            page=parsed_page,
            per_page=parsed_per_page,
            sort=sort,
            direction=direction,
            include_barcode=include_barcode,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc, not_found="That patron was not found.")


@router.get("/loans/{checkout_id}")
def loan_detail(
    checkout_id: str,
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
) -> dict:
    parsed_id = _positive_id(checkout_id, message="That loan was not found.")
    payload, _session = user
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    try:
        return get_loan(client, parsed_id, include_barcode=include_barcode)
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc, not_found="That loan was not found.")


@router.get("/history")
def history_list(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
    page: Annotated[str, Query()] = "1",
    per_page: Annotated[str, Query()] = "20",
) -> dict:
    payload, _session = user
    parsed_page = _bounded_query(page, low=1, high=10000)
    parsed_per_page = _bounded_query(per_page, low=1, high=20)
    include_barcode = "catalog.barcode.view" in payload.permissions
    client = _koha_client()
    try:
        return list_history(
            client,
            page=parsed_page,
            per_page=parsed_per_page,
            include_barcode=include_barcode,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/renewals/preview")
def renewal_preview_route(
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.view")),
    ],
    barcode: Annotated[str | None, Query()] = None,
    checkout_id: Annotated[int | None, Query()] = None,
) -> dict:
    payload, _session = user
    client = _koha_client()
    try:
        preview = renewal_preview(client, barcode=barcode, checkout_id=checkout_id)
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        message = (
            "No current loan matches that barcode."
            if barcode is not None
            else "That loan was not found."
        )
        _handle_koha(exc, not_found=message)
    if "catalog.barcode.view" not in payload.permissions:
        preview.pop("external_id", None)
    return preview


@router.post("/checkouts")
def checkout(
    request: Request,
    raw: Annotated[dict, Body()],
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.checkout")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    request_id = _parse_uuid(raw.get("request_id"))
    patron_id = raw.get("patron_id")
    item_ids = raw.get("item_ids")
    if (
        not isinstance(patron_id, int)
        or isinstance(patron_id, bool)
        or patron_id < 1
        or not isinstance(item_ids, list)
    ):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That request is not valid.",
            },
        )
    parsed_items = [
        item_id for item_id in item_ids if isinstance(item_id, int) and not isinstance(item_id, bool)
    ]
    if len(parsed_items) != len(item_ids):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That request is not valid.",
            },
        )
    client = _koha_client()
    try:
        return submit_checkout(
            db,
            client,
            payload.user.id,
            request_id=request_id,
            patron_id=patron_id,
            item_ids=parsed_items,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.post("/checkins")
def checkin(
    request: Request,
    raw: Annotated[dict, Body()],
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.checkin")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    request_id = _parse_uuid(raw.get("request_id"))
    item_id = raw.get("item_id")
    confirm = raw.get("confirm", False)
    if not isinstance(item_id, int) or isinstance(item_id, bool) or not isinstance(confirm, bool):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That request is not valid.",
            },
        )
    client = _koha_client()
    try:
        return submit_checkin(
            db,
            client,
            payload.user.id,
            request_id=request_id,
            item_id=item_id,
            confirm=confirm,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.post("/renewals")
def renew(
    request: Request,
    raw: Annotated[dict, Body()],
    user: Annotated[
        tuple[CurrentUserOut, UserSession],
        Depends(require_circulation_permission("circulation.renew")),
    ],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
    _assert_write_csrf(request, session_row)
    request_id = _parse_uuid(raw.get("request_id"))
    checkout_id = raw.get("checkout_id")
    if not isinstance(checkout_id, int) or isinstance(checkout_id, bool):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "validation_error",
                "message": "That request is not valid.",
            },
        )
    client = _koha_client()
    try:
        return submit_renewal(
            db,
            client,
            payload.user.id,
            request_id=request_id,
            checkout_id=checkout_id,
        )
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.post("/requests/{request_id}/verify")
def verify_request_route(
    request_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    raw_token = request.cookies.get("libraryhub_session")
    try:
        payload, session_row = load_session(db, raw_token)
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    try:
        parsed_id = uuid.UUID(request_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "That resource was not found."},
        ) from exc

    row = load_request(db, parsed_id)
    if row is None:
        raise _NOT_FOUND

    perm = _ACTION_PERMISSION.get(row.action)
    if perm is None or perm not in payload.permissions:
        raise _CIRCULATION_PERMISSION_DENIED
    _assert_write_csrf(request, session_row)

    client = _koha_client()
    try:
        return verify_request(db, client, row)
    except CirculationError as exc:
        _raise_circulation(exc)
    except KohaError as exc:
        _handle_koha(exc)