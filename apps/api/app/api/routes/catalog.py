from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.api.dependencies.session import get_catalog_user
from app.core.config import get_settings
from app.database.session import get_db_session
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import (
    KohaAuthError,
    KohaConnectionError,
    KohaError,
    KohaNotFound,
    KohaResponseError,
    KohaTimeoutError,
)
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.schemas.catalog import SavedSearchIn, SearchParams
from app.services.auth import AuthError, assert_csrf
from app.services.catalog import (
    CatalogError,
    biblio_detail,
    biblio_items,
    config_payload,
    cover_bytes,
    delete_saved,
    list_recent,
    list_saved,
    save_search,
    search,
)

router = APIRouter(prefix="/catalog", tags=["catalog"])

_CATALOG_UNAVAILABLE = HTTPException(
    status_code=503,
    detail={
        "code": "catalog_unavailable",
        "message": "The catalog is unavailable. Try again.",
    },
)
_CATALOG_TIMEOUT = HTTPException(
    status_code=504,
    detail={
        "code": "catalog_timeout",
        "message": "The catalog took too long to respond. Try again.",
    },
)
_BIBLIO_NOT_FOUND = HTTPException(
    status_code=404,
    detail={"code": "not_found", "message": "That record was not found."},
)


def _koha_client() -> KohaClient:
    return KohaClient(get_settings())


def _raise_catalog(exc: CatalogError) -> None:
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    ) from exc


def _handle_koha(exc: KohaError) -> None:
    if isinstance(exc, KohaTimeoutError):
        raise _CATALOG_TIMEOUT from exc
    if isinstance(exc, KohaNotFound):
        raise _BIBLIO_NOT_FOUND from exc
    if isinstance(
        exc,
        (KohaConnectionError, KohaAuthError, KohaResponseError),
    ):
        raise _CATALOG_UNAVAILABLE from exc
    raise _CATALOG_UNAVAILABLE from exc


@router.get("/config")
def catalog_config(
    _user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
) -> dict:
    return config_payload(get_settings())


@router.get("/search")
def catalog_search(
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
    params: Annotated[SearchParams, Query()],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, _session = user
    client = _koha_client()
    settings = get_settings()
    try:
        payload_out = search(
            db,
            client,
            settings,
            payload.user.id,
            params,
            record_recent=True,
        )
        db.commit()
        return payload_out
    except CatalogError as exc:
        _raise_catalog(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/libraries")
def catalog_libraries(
    _user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
) -> list[dict]:
    client = _koha_client()
    try:
        names = client.library_names()
    except KohaError as exc:
        _handle_koha(exc)
    return [
        {"id": key, "name": value}
        for key, value in sorted(names.items(), key=lambda item: item[1])
    ]


@router.get("/biblios/{biblio_id}")
def catalog_biblio(
    biblio_id: int,
    _user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
) -> dict:
    client = _koha_client()
    try:
        return biblio_detail(client, biblio_id)
    except CatalogError as exc:
        _raise_catalog(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/biblios/{biblio_id}/items")
def catalog_biblio_items(
    biblio_id: int,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
) -> dict:
    payload, _session = user
    client = _koha_client()
    include_barcode = "catalog.barcode.view" in payload.permissions
    try:
        return biblio_items(client, biblio_id, include_barcode=include_barcode)
    except CatalogError as exc:
        _raise_catalog(exc)
    except KohaError as exc:
        _handle_koha(exc)


@router.get("/biblios/{biblio_id}/cover")
def catalog_biblio_cover(
    biblio_id: int,
    _user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
) -> Response:
    client = _koha_client()
    try:
        body, content_type = cover_bytes(client, biblio_id)
    except CatalogError as exc:
        _raise_catalog(exc)
    except KohaError as exc:
        _handle_koha(exc)
    return Response(
        content=body,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/recent-searches")
def catalog_recent(
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    payload, _session = user
    return list_recent(db, payload.user.id)


@router.get("/saved-searches")
def catalog_saved_list(
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> list[dict]:
    payload, _session = user
    return list_saved(db, payload.user.id)


@router.post("/saved-searches", status_code=201)
def catalog_saved_create(
    body: SavedSearchIn,
    request: Request,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> dict:
    payload, session_row = user
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
    try:
        row = save_search(db, payload.user.id, body)
        db.commit()
        return row
    except CatalogError as exc:
        _raise_catalog(exc)


@router.delete("/saved-searches/{search_id}", status_code=204)
def catalog_saved_delete(
    search_id: uuid.UUID,
    request: Request,
    user: Annotated[tuple[CurrentUserOut, UserSession], Depends(get_catalog_user)],
    db: Annotated[Session, Depends(get_db_session)],
) -> None:
    payload, session_row = user
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
    try:
        delete_saved(db, payload.user.id, search_id)
        db.commit()
    except CatalogError as exc:
        _raise_catalog(exc)