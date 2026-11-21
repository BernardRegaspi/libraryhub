from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database.session import get_db_session
from app.models.identity import UserSession
from app.schemas.auth import CurrentUserOut
from app.services.auth import AuthError, load_session

_PERMISSION_DENIED = HTTPException(
    status_code=403,
    detail={
        "code": "permission_denied",
        "message": "You do not have access to the catalog.",
    },
)


def get_catalog_user(
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
) -> tuple[CurrentUserOut, UserSession]:
    raw_token = request.cookies.get("libraryhub_session")
    try:
        payload, session_row = load_session(db, raw_token)
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    if "catalog.view" not in payload.permissions:
        raise _PERMISSION_DENIED
    return payload, session_row


_PATRON_PERMISSION_DENIED = HTTPException(
    status_code=403,
    detail={
        "code": "permission_denied",
        "message": "You do not have access to patron records.",
    },
)


def require_patron_permission(
    code: str,
) -> Callable[..., tuple[CurrentUserOut, UserSession]]:
    def _dependency(
        request: Request,
        db: Annotated[Session, Depends(get_db_session)],
    ) -> tuple[CurrentUserOut, UserSession]:
        raw_token = request.cookies.get("libraryhub_session")
        try:
            payload, session_row = load_session(db, raw_token)
        except AuthError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        if code not in payload.permissions:
            raise _PATRON_PERMISSION_DENIED
        return payload, session_row

    return _dependency


_INVENTORY_PERMISSION_DENIED = HTTPException(
    status_code=403,
    detail={
        "code": "permission_denied",
        "message": "You do not have access to inventory.",
    },
)


def require_inventory_user(
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
) -> tuple[CurrentUserOut, UserSession]:
    raw_token = request.cookies.get("libraryhub_session")
    try:
        payload, session_row = load_session(db, raw_token)
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    if "inventory.view" not in payload.permissions:
        raise _INVENTORY_PERMISSION_DENIED
    return payload, session_row