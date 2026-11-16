from datetime import datetime, timedelta, timezone

from app.models.identity import (
    AppUser,
    AuditLog,
    AuthIdentity,
    LibraryDepartment,
    Role,
    UserCredential,
    UserRoleAssignment,
    UserSession,
)
from app.services.passwords import hash_password
from app.services.tokens import hash_secret


def add_user(
    db,
    *,
    username,
    email,
    display_name,
    password,
    role_name,
    department_code,
    status="active",
) -> AppUser:
    user = AppUser(
        username=username,
        email=email,
        display_name=display_name,
        status=status,
    )
    db.add(user)
    db.flush()
    db.add(UserCredential(user_id=user.id, password_hash=hash_password(password)))
    db.add(
        AuthIdentity(
            user_id=user.id,
            provider="local",
            provider_subject=str(user.id),
        )
    )
    role = db.query(Role).filter_by(name=role_name).one()
    department_id = None
    if department_code is not None:
        department_id = db.query(LibraryDepartment).filter_by(code=department_code).one().id
    db.add(
        UserRoleAssignment(
            user_id=user.id,
            role_id=role.id,
            department_id=department_id,
        )
    )
    db.commit()
    return user


def test_login_by_username_and_email_stores_only_the_token_hash(auth_client, db):
    add_user(
        db,
        username="m.reyes",
        email="m.reyes@usant.edu.ph",
        display_name="Maria Reyes",
        password="local-secret",
        role_name="Super Administrator",
        department_code=None,
    )
    by_name = auth_client.post("/api/v1/auth/login", json={"username": "M.REYES", "password": "local-secret"})
    assert by_name.status_code == 200
    body = by_name.json()
    assert body["user"]["initials"] == "MR"
    assert body["active_department_id"] is None
    assert body["can_select_all_departments"] is True
    assert "dashboard.view" in body["permissions"]
    assert "student.view" not in body["permissions"]
    assert "local-secret" not in by_name.text
    token = by_name.cookies["libraryhub_session"]
    assert db.query(UserSession).filter_by(token_hash=hash_secret(token)).count() == 1
    assert db.query(UserSession).filter_by(token_hash=token).count() == 0

    by_email = auth_client.post(
        "/api/v1/auth/login",
        json={"username": "M.REYES@USANT.EDU.PH", "password": "local-secret"},
    )
    assert by_email.status_code == 200


def test_login_failures_share_one_message_and_audit_the_reason(auth_client, db):
    add_user(
        db,
        username="librarian",
        email="librarian@usant.edu.ph",
        display_name="Rico Mendoza",
        password="local-secret",
        role_name="Librarian",
        department_code="COLLEGE",
        status="suspended",
    )
    unknown = auth_client.post("/api/v1/auth/login", json={"username": "nobody", "password": "nope"})
    wrong = auth_client.post("/api/v1/auth/login", json={"username": "librarian", "password": "nope"})
    suspended = auth_client.post("/api/v1/auth/login", json={"username": "librarian", "password": "local-secret"})
    for response in (unknown, wrong, suspended):
        assert response.status_code == 401
        assert response.json()["detail"] == {
            "code": "invalid_credentials",
            "message": "Those credentials are not valid.",
        }
        assert "nope" not in response.text
        assert "local-secret" not in response.text
    reasons = {row.details["reason"] for row in db.query(AuditLog).filter_by(action="auth.login.failure")}
    assert reasons == {"unknown_user", "invalid_password", "suspended"}
    for row in db.query(AuditLog).all():
        assert "nope" not in str(row.details)
        assert "local-secret" not in str(row.details)


def test_me_requires_a_live_session(auth_client, db):
    add_user(db, username="ada", email="ada@usant.edu.ph", display_name="Ada Cruz",
             password="local-secret", role_name="Librarian", department_code="COLLEGE")
    missing = auth_client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.json()["detail"]["code"] == "unauthenticated"

    logged = auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"})
    assert logged.json()["active_department_id"] is not None
    ok = auth_client.get("/api/v1/auth/me")
    assert ok.status_code == 200
    assert ok.json()["user"]["username"] == "ada"

    row = db.query(UserSession).one()
    row.idle_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    idle = auth_client.get("/api/v1/auth/me")
    assert idle.status_code == 401

    fresh = auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"})
    assert fresh.status_code == 200
    row = db.query(UserSession).filter(UserSession.revoked_at.is_(None)).one()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db.commit()
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_suspended_user_session_is_revoked_on_next_request(auth_client, db):
    user = add_user(db, username="ada", email="ada@usant.edu.ph", display_name="Ada Cruz",
                    password="local-secret", role_name="Librarian", department_code="COLLEGE")
    assert auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"}).status_code == 200
    user.status = "suspended"
    db.commit()
    denied = auth_client.get("/api/v1/auth/me")
    assert denied.status_code == 401
    assert db.query(UserSession).one().revoked_at is not None