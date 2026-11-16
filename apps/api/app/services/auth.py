from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.identity import (
    AppUser,
    AuditLog,
    LibraryDepartment,
    Permission,
    Role,
    RolePermission,
    UserCredential,
    UserRoleAssignment,
    UserSession,
)
from app.schemas.auth import (
    AssignmentOut,
    CurrentUserOut,
    DepartmentBrief,
    RoleBrief,
    UserOut,
)
from app.services.passwords import hash_password, verify_password
from app.services.tokens import hash_secret, new_secret

GLOBAL_ROLE_NAMES = frozenset(
    {"Super Administrator", "Library Administrator", "Auditor"},
)

_INVALID_PASSWORD_HASH = hash_password("invalid")

SESSION_MAX_AGE_SECONDS = 43200


class AuthError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def initials(display_name: str) -> str:
    parts = display_name.split()
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _failure_count(db: Session, identifier: str) -> int:
    since = datetime.now(timezone.utc) - timedelta(minutes=15)
    return (
        db.query(AuditLog)
        .filter(
            AuditLog.action == "auth.login.failure",
            AuditLog.created_at >= since,
            AuditLog.details["identifier"].astext == identifier,
        )
        .count()
    )


def _record_login_failure(
    db: Session,
    *,
    identifier: str,
    reason: str,
    user_id: uuid.UUID | None,
    ip_address: str | None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="auth.login.failure",
            module="auth",
            ip_address=ip_address,
            details={"identifier": identifier, "reason": reason},
        )
    )
    db.commit()


AssignmentRow = tuple[UserRoleAssignment, Role]


def _user_assignments(db: Session, user_id: uuid.UUID) -> list[AssignmentRow]:
    return (
        db.query(UserRoleAssignment, Role)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .filter(UserRoleAssignment.user_id == user_id)
        .all()
    )


def _permission_codes(db: Session, user_id: uuid.UUID) -> list[str]:
    rows = (
        db.query(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .filter(UserRoleAssignment.user_id == user_id)
        .distinct()
        .all()
    )
    return sorted({code for (code,) in rows})


def _departments_for_user(db: Session, assignments: list[AssignmentRow]) -> list[LibraryDepartment]:
    has_global = any(a.department_id is None for a, _ in assignments)
    if has_global:
        return (
            db.query(LibraryDepartment)
            .filter(LibraryDepartment.is_active.is_(True))
            .order_by(LibraryDepartment.name)
            .all()
        )
    dept_ids = {a.department_id for a, _ in assignments if a.department_id is not None}
    if not dept_ids:
        return []
    return (
        db.query(LibraryDepartment)
        .filter(LibraryDepartment.id.in_(dept_ids))
        .order_by(LibraryDepartment.name)
        .all()
    )


def _can_select_all_departments(assignments: list[AssignmentRow]) -> bool:
    return any(
        a.department_id is None and role.name in GLOBAL_ROLE_NAMES for a, role in assignments
    )


def _initial_active_department_id(
    db: Session,
    assignments: list[AssignmentRow],
) -> uuid.UUID | None:
    if any(a.department_id is None and role.name in GLOBAL_ROLE_NAMES for a, role in assignments):
        return None
    dept_ids = {a.department_id for a, _ in assignments if a.department_id is not None}
    if not dept_ids:
        return None
    first = (
        db.query(LibraryDepartment)
        .filter(LibraryDepartment.id.in_(dept_ids))
        .order_by(LibraryDepartment.name)
        .first()
    )
    return first.id if first else None


def build_current_user(db: Session, user: AppUser, session_row: UserSession) -> CurrentUserOut:
    assignments = _user_assignments(db, user.id)
    departments = _departments_for_user(db, assignments)
    return CurrentUserOut(
        user=UserOut(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            initials=initials(user.display_name),
            status=user.status,
        ),
        assignments=[
            AssignmentOut(
                role=RoleBrief(id=role.id, name=role.name),
                department_id=a.department_id,
            )
            for a, role in assignments
        ],
        permissions=_permission_codes(db, user.id),
        departments=[
            DepartmentBrief(id=d.id, code=d.code, name=d.name) for d in departments
        ],
        active_department_id=session_row.active_department_id,
        can_select_all_departments=_can_select_all_departments(assignments),
        koha_configured=bool(get_settings().koha_base_url),
    )


def login(
    db: Session,
    username: str,
    password: str,
    ip_address: str | None,
) -> tuple[CurrentUserOut, str, str]:
    identifier = username.strip().lower()

    if _failure_count(db, identifier) >= 5:
        raise AuthError(
            429,
            "rate_limited",
            "Sign-in is temporarily paused. Try again later.",
        )

    user = (
        db.query(AppUser)
        .filter(func.lower(AppUser.username) == identifier)
        .one_or_none()
    )
    if user is None:
        user = (
            db.query(AppUser)
            .filter(func.lower(AppUser.email) == identifier)
            .one_or_none()
        )

    if user is None:
        verify_password(password, _INVALID_PASSWORD_HASH)
        _record_login_failure(
            db,
            identifier=identifier,
            reason="unknown_user",
            user_id=None,
            ip_address=ip_address,
        )
        raise AuthError(401, "invalid_credentials", "Those credentials are not valid.")

    credential = db.query(UserCredential).filter_by(user_id=user.id).one_or_none()
    if credential is None or not verify_password(password, credential.password_hash):
        _record_login_failure(
            db,
            identifier=identifier,
            reason="invalid_password",
            user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError(401, "invalid_credentials", "Those credentials are not valid.")

    if user.status != "active":
        _record_login_failure(
            db,
            identifier=identifier,
            reason="suspended",
            user_id=user.id,
            ip_address=ip_address,
        )
        raise AuthError(401, "invalid_credentials", "Those credentials are not valid.")

    assignments = _user_assignments(db, user.id)
    active_department_id = _initial_active_department_id(db, assignments)
    raw_token = new_secret()
    raw_csrf = new_secret()
    now = datetime.now(timezone.utc)

    session = UserSession(
        user_id=user.id,
        token_hash=hash_secret(raw_token),
        csrf_token_hash=hash_secret(raw_csrf),
        active_department_id=active_department_id,
        expires_at=now + timedelta(hours=12),
        idle_expires_at=now + timedelta(minutes=30),
        last_seen_at=now,
    )
    db.add(session)
    db.flush()

    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.login.success",
            module="auth",
            entity_type="user_session",
            entity_id=str(session.id),
            ip_address=ip_address,
        )
    )
    db.commit()
    db.refresh(session)

    payload = build_current_user(db, user, session)
    return payload, raw_token, raw_csrf


_UNAUTHENTICATED = AuthError(401, "unauthenticated", "Sign in required.")


def load_session(
    db: Session, raw_token: str | None
) -> tuple[CurrentUserOut, UserSession]:
    if not raw_token:
        raise _UNAUTHENTICATED

    session_row = (
        db.query(UserSession)
        .filter_by(token_hash=hash_secret(raw_token))
        .one_or_none()
    )
    if session_row is None:
        raise _UNAUTHENTICATED

    now = datetime.now(timezone.utc)

    if session_row.revoked_at is not None:
        raise _UNAUTHENTICATED
    if session_row.expires_at <= now or session_row.idle_expires_at <= now:
        session_row.revoked_at = now
        db.commit()
        raise _UNAUTHENTICATED

    user = db.query(AppUser).filter_by(id=session_row.user_id).one()
    if user.status != "active":
        session_row.revoked_at = now
        db.commit()
        raise _UNAUTHENTICATED

    if session_row.last_seen_at < now - timedelta(minutes=1):
        session_row.last_seen_at = now
        session_row.idle_expires_at = now + timedelta(minutes=30)
        db.commit()
        db.refresh(session_row)

    payload = build_current_user(db, user, session_row)
    return payload, session_row


_CSRF_FAILED = AuthError(
    403,
    "csrf_failed",
    "The sign-in check failed. Refresh the page and try again.",
)
_DEPARTMENT_FORBIDDEN = AuthError(
    403,
    "department_forbidden",
    "That department is outside your assignment.",
)


def _verify_csrf(
    session_row: UserSession,
    csrf_header: str | None,
    csrf_cookie: str | None,
) -> None:
    if not csrf_header or not csrf_cookie or csrf_header != csrf_cookie:
        raise _CSRF_FAILED
    if hash_secret(csrf_header) != session_row.csrf_token_hash:
        raise _CSRF_FAILED


def _require_live_session(db: Session, raw_token: str | None) -> tuple[AppUser, UserSession]:
    if not raw_token:
        raise _UNAUTHENTICATED

    session_row = (
        db.query(UserSession)
        .filter_by(token_hash=hash_secret(raw_token))
        .one_or_none()
    )
    if session_row is None:
        raise _UNAUTHENTICATED

    now = datetime.now(timezone.utc)

    if session_row.revoked_at is not None:
        raise _UNAUTHENTICATED
    if session_row.expires_at <= now or session_row.idle_expires_at <= now:
        session_row.revoked_at = now
        db.commit()
        raise _UNAUTHENTICATED

    user = db.query(AppUser).filter_by(id=session_row.user_id).one()
    if user.status != "active":
        session_row.revoked_at = now
        db.commit()
        raise _UNAUTHENTICATED

    return user, session_row


def _validate_active_department_change(
    db: Session,
    assignments: list[AssignmentRow],
    department_id: uuid.UUID | None,
) -> None:
    if department_id is None:
        if not _can_select_all_departments(assignments):
            raise _DEPARTMENT_FORBIDDEN
        return
    allowed_ids = {d.id for d in _departments_for_user(db, assignments)}
    if department_id not in allowed_ids:
        raise _DEPARTMENT_FORBIDDEN


def logout(
    db: Session,
    raw_token: str | None,
    csrf_header: str | None,
    csrf_cookie: str | None,
    ip_address: str | None,
) -> None:
    user, session_row = _require_live_session(db, raw_token)
    _verify_csrf(session_row, csrf_header, csrf_cookie)

    now = datetime.now(timezone.utc)
    session_row.revoked_at = now
    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.logout",
            module="auth",
            entity_type="user_session",
            entity_id=str(session_row.id),
            ip_address=ip_address,
        )
    )
    db.commit()


def set_active_department(
    db: Session,
    raw_token: str | None,
    csrf_header: str | None,
    csrf_cookie: str | None,
    department_id: uuid.UUID | None,
    ip_address: str | None,
) -> CurrentUserOut:
    user, session_row = _require_live_session(db, raw_token)
    _verify_csrf(session_row, csrf_header, csrf_cookie)

    assignments = _user_assignments(db, user.id)
    _validate_active_department_change(db, assignments, department_id)

    session_row.active_department_id = department_id
    db.add(
        AuditLog(
            user_id=user.id,
            action="auth.department_change",
            module="auth",
            entity_type="user_session",
            entity_id=str(session_row.id),
            ip_address=ip_address,
            details={
                "active_department_id": str(department_id)
                if department_id is not None
                else None
            },
        )
    )
    db.commit()
    db.refresh(session_row)
    return build_current_user(db, user, session_row)