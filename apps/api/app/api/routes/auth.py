from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db_session
from app.schemas.auth import CurrentUserOut, LoginIn, SessionPatch
from app.services.auth import (
    AuthError,
    SESSION_MAX_AGE_SECONDS,
    load_session,
    login as login_service,
    logout as logout_service,
    set_active_department,
)
from app.services.tokens import hash_secret, new_secret

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=CurrentUserOut)
def login_route(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> CurrentUserOut:
    ip_address = request.client.host if request.client else None
    try:
        payload, raw_token, raw_csrf = login_service(
            db, body.username, body.password, ip_address
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    settings = get_settings()
    secure = settings.environment != "development"
    cookie_kwargs = {
        "max_age": SESSION_MAX_AGE_SECONDS,
        "path": "/",
        "samesite": "lax",
        "secure": secure,
    }
    response.set_cookie(
        "libraryhub_session",
        raw_token,
        httponly=True,
        **cookie_kwargs,
    )
    response.set_cookie(
        "libraryhub_csrf",
        raw_csrf,
        httponly=False,
        **cookie_kwargs,
    )
    return payload


@router.get("/auth/me", response_model=CurrentUserOut)
def me_route(
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> CurrentUserOut:
    raw_token = request.cookies.get("libraryhub_session")
    try:
        payload, session_row = load_session(db, raw_token)
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    raw_csrf = request.cookies.get("libraryhub_csrf")
    if raw_csrf is None or hash_secret(raw_csrf) != session_row.csrf_token_hash:
        raw_csrf = new_secret()
        session_row.csrf_token_hash = hash_secret(raw_csrf)
        db.commit()

        settings = get_settings()
        secure = settings.environment != "development"
        response.set_cookie(
            "libraryhub_csrf",
            raw_csrf,
            httponly=False,
            max_age=SESSION_MAX_AGE_SECONDS,
            path="/",
            samesite="lax",
            secure=secure,
        )

    return payload


@router.post("/auth/logout", status_code=204)
def logout_route(
    request: Request,
    response: Response,
    db: Session = Depends(get_db_session),
) -> None:
    ip_address = request.client.host if request.client else None
    try:
        logout_service(
            db,
            request.cookies.get("libraryhub_session"),
            request.headers.get("X-CSRF-Token"),
            request.cookies.get("libraryhub_csrf"),
            ip_address,
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    response.delete_cookie("libraryhub_session", path="/")
    response.delete_cookie("libraryhub_csrf", path="/")


@router.patch("/auth/session", response_model=CurrentUserOut)
def session_patch_route(
    body: SessionPatch,
    request: Request,
    db: Session = Depends(get_db_session),
) -> CurrentUserOut:
    ip_address = request.client.host if request.client else None
    try:
        return set_active_department(
            db,
            request.cookies.get("libraryhub_session"),
            request.headers.get("X-CSRF-Token"),
            request.cookies.get("libraryhub_csrf"),
            body.active_department_id,
            ip_address,
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc