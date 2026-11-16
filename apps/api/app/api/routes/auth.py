from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.database.session import get_db_session
from app.schemas.auth import CurrentUserOut, LoginIn
from app.services.auth import AuthError, SESSION_MAX_AGE_SECONDS, login as login_service

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