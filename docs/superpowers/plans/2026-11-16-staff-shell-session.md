# Staff shell and FastAPI sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the themed staff shell and a FastAPI cookie session so a seeded super administrator can sign in, move between the prototype routes, and sign out.

**Architecture:** PostgreSQL in the `libraryhub` schema holds users, roles, sessions, and departments. FastAPI hashes the session token, sets `libraryhub_session` and `libraryhub_csrf`, and is the only authentication authority. The browser calls `/api/v1` on the Next.js origin. Server components call FastAPI with `API_PROXY_TARGET` and forward the cookie. Staff routes share one sidebar layout. Page bodies are the prototype headers only.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, pwdlib[argon2], pytest, Next.js 16 App Router, shadcn/ui (`sidebar-01`, `login-02`), Hugeicons, Tailwind CSS 4.

## Global Constraints

- Database name `libraryhub`, schema `libraryhub`. Do not create a database named `university_library`.
- Do not create tables for Koha bibliographic records, patrons, copies, loans, holds, or fines.
- Department codes: `COLLEGE`, `JHS`, `SHS`, `GRADE`, `GRADUATE`. `koha_branchcode` stays null.
- Roles: Super Administrator, Library Administrator, Department Head, Librarian, Student, Auditor. Do not seed Faculty or Library Assistant.
- Password hash: Argon2id via `pwdlib[argon2]`, library defaults. Session and CSRF secrets are 32-byte URL-safe values. Only their SHA-256 hex digests are stored.
- Cookies: `libraryhub_session` (HttpOnly) and `libraryhub_csrf` (not HttpOnly). `Path=/`, no `Domain`, `SameSite=Lax`, `Max-Age` 43200. `Secure` only when `APP_ENV` is not `development`.
- Absolute session lifetime 12 hours. Idle lifetime 30 minutes, slid only when `last_seen_at` is older than one minute.
- Login identifier matches `username` first, then `email`, case-insensitively. Unknown user, wrong password, and suspended account all return 401 `invalid_credentials` with message `Those credentials are not valid.`
- Five `auth.login.failure` rows for one normalized identifier in 15 minutes make the next attempt 429 `rate_limited` with message `Sign-in is temporarily paused. Try again later.` That 429 writes no new failure row.
- CSRF header `X-CSRF-Token` is required on logout and department change. It must match the cookie and `csrf_token_hash`.
- `active_department_id` null means All departments and is allowed only for a global Super Administrator, Library Administrator, or Auditor.
- `koha_configured` is true only when `KOHA_BASE_URL` is set. Do not call Koha.
- No token in `localStorage` or `sessionStorage`. No Auth.js.
- Browser API base is same-origin `/api/v1`. Upstream is server-only `API_PROXY_TARGET`, default `http://127.0.0.1:8000`.
- Icons are Hugeicons. Staff copy is the copy in `docs/superpowers/specs/2026-11-16-staff-shell-session-design.md`. Do not rewrite it.
- The public homepage at `/` stays on the root layout and does not use the `.ulms` theme.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261116_0002_identity_and_sessions.py` | Tables and reference rows |
| `apps/api/app/models/base.py` | Declarative base bound to schema `libraryhub` |
| `apps/api/app/models/identity.py` | ORM models for this slice |
| `apps/api/app/services/passwords.py` | Argon2id hash and verify |
| `apps/api/app/services/tokens.py` | Random secrets and SHA-256 |
| `apps/api/app/services/auth.py` | Login, session load, logout, department change |
| `apps/api/app/schemas/auth.py` | Pydantic request and current-user response |
| `apps/api/app/api/dependencies/auth.py` | Cookie session dependency |
| `apps/api/app/api/routes/auth.py` | HTTP handlers and cookies |
| `apps/api/app/scripts/seed.py` | Idempotent Maria Reyes seed |
| `apps/api/tests/api/test_identity_schema.py` | Reference data |
| `apps/api/tests/unit/test_passwords.py` | Hash round trip |
| `apps/api/tests/api/test_auth.py` | Session HTTP behavior |
| `apps/api/tests/api/test_seed.py` | Seed idempotency |
| `apps/web/lib/api.ts` | Same-origin browser calls and direct server calls |
| `apps/web/lib/auth/types.ts` | Current-user type |
| `apps/web/lib/auth/session.ts` | Server `getCurrentUser` and page gate |
| `apps/web/lib/auth/nav.ts` | Staff paths, permissions, and sidebar icons |
| `apps/web/middleware.ts` | Records the pathname and sends cookieless staff requests to `/login` |
| `apps/web/components/layout/staff-shell.tsx` | Sidebar, header, palette, sign-out |
| `apps/web/components/layout/module-frame.tsx` | Prototype page header and access-denied panel |
| `apps/web/app/(auth)/login/page.tsx` | `login-02` layout with prototype copy |
| `apps/web/app/(app)/layout.tsx` | Authenticated shell |
| `apps/web/app/(app)/*/page.tsx` | One frame per prototype view |

`plan/file-structure.md` still shows `app/catalog` and `app/student` beside `(dashboard)`. This plan replaces the empty `(dashboard)` group with `(app)` and puts every staff URL under that layout. That is the approved spec, and it overrides the older sketch.

---

### Task 1: Identity schema

**Files:**
- Modify: `apps/api/pyproject.toml`
- Create: `apps/api/alembic/versions/20261116_0002_identity_and_sessions.py`
- Create: `apps/api/app/models/base.py`
- Create: `apps/api/app/models/identity.py`
- Create: `apps/api/tests/api/test_identity_schema.py`
- Modify: `apps/api/tests/conftest.py`

**Interfaces:**
- Consumes: Alembic revision `20251115_0001`
- Produces: ORM classes `LibraryDepartment`, `AppUser`, `AuthIdentity`, `UserCredential`, `UserSession`, `Role`, `Permission`, `RolePermission`, `UserRoleAssignment`, `AuditLog`. Fixture `db` yields a SQLAlchemy `Session` bound to an outer transaction that rolls back. Fixture skips when PostgreSQL is unreachable.

- [ ] **Step 1: Write the failing test**

Add `apps/api/tests/api/test_identity_schema.py`:

```python
from app.models.identity import LibraryDepartment, Role


def test_reference_departments_and_roles(db):
    codes = {row.code for row in db.query(LibraryDepartment).all()}
    assert codes == {"COLLEGE", "JHS", "SHS", "GRADE", "GRADUATE"}
    assert all(row.koha_branchcode is None and row.is_active for row in db.query(LibraryDepartment))
    names = {row.name for row in db.query(Role).all()}
    assert names == {
        "Super Administrator",
        "Library Administrator",
        "Department Head",
        "Librarian",
        "Student",
        "Auditor",
    }
```

Add the `db` fixture to `apps/api/tests/conftest.py`. Keep the existing `client` fixture and the health monkeypatch.

```python
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings


@pytest.fixture
def db():
    settings = get_settings()
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"options": "-c search_path=libraryhub,public"},
    )
    try:
        with engine.connect() as probe:
            probe.execute(text("SELECT 1"))
    except SQLAlchemyError:
        pytest.skip("PostgreSQL is not reachable")
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()
```

- [ ] **Step 2: Run the test and confirm it fails**

Run from `apps/api`:

```bash
python -m pytest tests/api/test_identity_schema.py -v
```

Expected: FAIL because `app.models.identity` does not exist, or SKIP when PostgreSQL is down. If it skips, start the local database and run again. Do not treat a skip as success.

- [ ] **Step 3: Add the dependency, models, and migration**

In `apps/api/pyproject.toml`, add `"pwdlib[argon2]>=0.2"` to `dependencies`.

`apps/api/app/models/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

`apps/api/app/models/identity.py` maps every table in the spec. Use `mapped_column`, UUID primary keys, `TIMESTAMPTZ`, and `__table_args__ = {"schema": "libraryhub"}`. Relationships are not required. `AuditLog.details` is `JSONB`. `AppUser.status` is a string.

`apps/api/alembic/versions/20261116_0002_identity_and_sessions.py`:

- `revision = "20261116_0002"`
- `down_revision = "20251115_0001"`
- Create the tables in the spec with `schema="libraryhub"`.
- Primary keys use `server_default=sa.text("gen_random_uuid()")`.
- Unique constraints: `app_users.username`, `app_users.email`, `user_credentials.user_id`, `user_sessions.token_hash`, `library_departments.code`, `permissions.code`, `roles.name`.
- Check constraint `ck_app_users_status`: `status in ('active', 'suspended')`.
- Foreign keys from credentials, identities, sessions, and role assignments to `app_users` use `ON DELETE CASCADE`. `audit_logs.user_id` and `user_role_assignments.assigned_by` use `ON DELETE SET NULL`.
- `user_sessions.active_department_id` and `user_role_assignments.department_id` reference `library_departments` and are nullable.
- Index `ix_audit_logs_action_created` on `(action, created_at)`.

After the tables exist, insert the five departments and six roles (`is_system_role=true`). Insert these permissions and grants:

```python
PERMISSIONS = [
    ("dashboard.view", "dashboard", "Open the dashboard"),
    ("catalog.view", "catalog", "Open the catalog"),
    ("patrons.view", "patrons", "Open patron lookup"),
    ("circulation.view", "circulation", "Open the circulation desk"),
    ("holds.view", "holds", "Open holds"),
    ("inventory.view", "inventory", "Open inventory"),
    ("notifications.view", "notifications", "Open notifications"),
    ("announcements.view", "announcements", "Open announcements"),
    ("reports.view", "reports", "Open reports"),
    ("departments.view", "departments", "Open departments"),
    ("staff.view", "staff", "Open staff and roles"),
    ("audit.view", "audit", "Open the audit log"),
    ("integrations.view", "integrations", "Open Koha integration"),
    ("student.view", "student", "Open the student portal"),
]

STAFF = [code for code, _, _ in PERMISSIONS if code != "student.view"]
HEAD = [code for code in STAFF if code not in {"staff.view", "audit.view", "integrations.view"}]
LIBRARIAN = [
    "dashboard.view", "catalog.view", "patrons.view", "circulation.view",
    "holds.view", "inventory.view", "notifications.view",
]
GRANTS = {
    "Super Administrator": STAFF,
    "Library Administrator": STAFF,
    "Department Head": HEAD,
    "Librarian": LIBRARIAN,
    "Auditor": ["dashboard.view", "reports.view", "audit.view"],
    "Student": ["student.view"],
}
```

`downgrade()` drops the tables in reverse foreign-key order.

Point `apps/api/alembic/env.py` `target_metadata` at `Base.metadata` from `app.models.base` after importing `app.models.identity`.

- [ ] **Step 4: Apply the migration and run the test**

From `apps/api`:

```bash
python -m alembic upgrade head
python -m pytest tests/api/test_identity_schema.py -v
```

Expected: one PASS. `alembic current` prints `20261116_0002`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/pyproject.toml apps/api/alembic/env.py apps/api/alembic/versions/20261116_0002_identity_and_sessions.py apps/api/app/models/base.py apps/api/app/models/identity.py apps/api/tests/conftest.py apps/api/tests/api/test_identity_schema.py
git commit -F commit-msg.txt
```

Message: `Add the ULMS identity schema and reference roles.`

---

### Task 2: Password and token helpers

**Files:**
- Create: `apps/api/app/services/passwords.py`
- Create: `apps/api/app/services/tokens.py`
- Create: `apps/api/tests/unit/test_passwords.py`

**Interfaces:**
- Consumes: `pwdlib`
- Produces: `hash_password(password: str) -> str`, `verify_password(password: str, password_hash: str) -> bool`, `new_secret() -> str`, `hash_secret(raw: str) -> str`

- [ ] **Step 1: Write the failing test**

```python
from app.services.passwords import hash_password, verify_password
from app.services.tokens import hash_secret, new_secret


def test_password_round_trip():
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong", stored)
    assert stored != "correct horse"


def test_secret_is_hashed():
    raw = new_secret()
    assert raw not in hash_secret(raw)
    assert hash_secret(raw) == hash_secret(raw)
    assert len(raw) >= 32
```

- [ ] **Step 2: Run it and confirm failure**

```bash
python -m pytest tests/unit/test_passwords.py -v
```

Expected: FAIL with import error.

- [ ] **Step 3: Implement**

`passwords.py` uses one module-level `PasswordHash.recommended()` hasher. `tokens.py` uses `secrets.token_urlsafe(32)` and `hashlib.sha256(raw.encode()).hexdigest()`.

- [ ] **Step 4: Run the test**

Expected: 2 passed. This test does not need PostgreSQL.

- [ ] **Step 5: Commit**

Message: `Hash staff passwords with Argon2id.`

---

### Task 3: Login

**Files:**
- Create: `apps/api/app/schemas/auth.py`
- Create: `apps/api/app/services/auth.py`
- Create: `apps/api/app/api/routes/auth.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/api/test_auth.py`
- Modify: `apps/api/tests/conftest.py`

**Interfaces:**
- Consumes: identity models, `hash_password`, `verify_password`, `new_secret`, `hash_secret`, `db`
- Produces: `POST /api/v1/auth/login`. `CurrentUserOut` in `app.schemas.auth`. `login(db, username, password, ip_address) -> tuple[CurrentUserOut, str, str]` returns the payload, raw session token, and raw CSRF token. `AuthError(status_code, code, message)`.

- [ ] **Step 1: Write the failing tests**

Add fixture `auth_client` that builds `create_app()`, overrides `get_db_session` to yield the `db` fixture, and returns a `TestClient`. Add helper `add_user(db, *, username, email, display_name, password, role_name, department_code, status="active")` which inserts the user, an Argon2 credential, a `local` identity whose `provider_subject` is the user id, and one role assignment. `department_code=None` stores a null `department_id`.

```python
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
```

- [ ] **Step 2: Run the tests and confirm failure**

```bash
python -m pytest tests/api/test_auth.py -v
```

Expected: FAIL with 404, because the route does not exist.

- [ ] **Step 3: Implement login**

`CurrentUserOut` fields are exactly the spec's current-user payload. `LoginIn` has `username: str` and `password: str`, both with `min_length=1`.

`login` normalizes the identifier with `strip().lower()`. It counts failure rows before verifying the password. The rate-limit response is implemented in Task 5; this task still counts so the query exists, and returns 429 when the count is 5 or more.

Lookup order: `func.lower(AppUser.username) == identifier`, else `func.lower(AppUser.email) == identifier`. A missing user verifies the password against `hash_password("invalid")` and then raises `invalid_credentials` with reason `unknown_user`. A credential that does not verify uses reason `invalid_password`. Status other than `active` uses reason `suspended` and does not create a session. Each of those three writes `auth.login.failure` with `details.identifier` and `details.reason`. The password is not written.

A global Super Administrator, Library Administrator, or Auditor gets `active_department_id=None`. Any other user gets the assigned department whose name is alphabetically first. Create the session with hashed token, hashed CSRF, `expires_at=now+12h`, `idle_expires_at=now+30m`, `last_seen_at=now`. Write `auth.login.success` with `entity_type="user_session"` and `entity_id` the session id as text. Commit the session. Return the payload from the assignments and permissions of that user.

Initials:

```python
def initials(display_name: str) -> str:
    parts = display_name.split()
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()
```

`build_current_user(db, user, session_row)`:

- Permissions are the sorted union of codes from the user's assignments.
- A global assignment lists every active department ordered by name. Otherwise list the assigned departments ordered by name.
- `can_select_all_departments` is true when an assignment has null `department_id` and the role name is Super Administrator, Library Administrator, or Auditor.
- `koha_configured` is `bool(get_settings().koha_base_url)`.

The route catches `AuthError` and raises `HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message})`. Success sets both cookies and returns the payload. Include the router from `main.py` at `settings.api_v1_prefix`.

- [ ] **Step 4: Run the tests**

Expected: the two login tests PASS.

- [ ] **Step 5: Commit**

Message: `Accept staff login with a hashed session cookie.`

---

### Task 4: Current user, idle expiry, and suspension

**Files:**
- Modify: `apps/api/app/services/auth.py`
- Modify: `apps/api/app/api/routes/auth.py`
- Modify: `apps/api/tests/api/test_auth.py`

**Interfaces:**
- Consumes: `login`
- Produces: `GET /api/v1/auth/me`. `load_session(db, raw_token: str | None) -> tuple[CurrentUserOut, UserSession]`. A missing, unknown, revoked, idle, absolute-expired, or suspended session raises `AuthError(401, "unauthenticated", "Sign in required.")`.

- [ ] **Step 1: Add the failing tests**

```python
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
```

- [ ] **Step 2: Run the new tests and confirm failure**

Expected: FAIL with 404 on `GET /api/v1/auth/me`.

- [ ] **Step 3: Implement `load_session` and `GET /auth/me`**

Reject when the cookie is absent, the hash matches no row, `revoked_at` is set, `expires_at` is past, or `idle_expires_at` is past. When the user status is not `active`, set `revoked_at` and raise the same 401. When `last_seen_at` is older than one minute, set `last_seen_at` to now and `idle_expires_at` to now plus 30 minutes. Do not change `expires_at`.

`GET /auth/me` returns the payload. If the CSRF cookie is missing or its hash does not equal `csrf_token_hash`, replace the secret, store the new hash, and set a new `libraryhub_csrf` cookie.

- [ ] **Step 4: Run `tests/api/test_auth.py`**

Expected: previous login tests and these two PASS.

- [ ] **Step 5: Commit**

Message: `Restore the staff session from the cookie.`

---

### Task 5: Logout, CSRF, department change, and rate limit

**Files:**
- Modify: `apps/api/app/services/auth.py`
- Modify: `apps/api/app/schemas/auth.py`
- Modify: `apps/api/app/api/routes/auth.py`
- Modify: `apps/api/tests/api/test_auth.py`

**Interfaces:**
- Consumes: `load_session`
- Produces: `logout(db, raw_token, csrf_header, csrf_cookie, ip_address) -> None`, `set_active_department(db, raw_token, csrf_header, csrf_cookie, department_id: UUID | None, ip_address) -> CurrentUserOut`. Logout returns HTTP 204. `SessionPatch` body is `{ "active_department_id": UUID | None }`.

- [ ] **Step 1: Add the failing tests**

```python
def csrf_headers(client):
    return {"X-CSRF-Token": client.cookies["libraryhub_csrf"]}


def test_logout_and_department_change_require_csrf(auth_client, db):
    add_user(db, username="ada", email="ada@usant.edu.ph", display_name="Ada Cruz",
             password="local-secret", role_name="Librarian", department_code="COLLEGE")
    assert auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"}).status_code == 200
    rejected = auth_client.post("/api/v1/auth/logout")
    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "csrf_failed"
    college_id = auth_client.get("/api/v1/auth/me").json()["active_department_id"]
    forbidden = auth_client.patch("/api/v1/auth/session", json={"active_department_id": None}, headers=csrf_headers(auth_client))
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"]["code"] == "department_forbidden"
    assert auth_client.get("/api/v1/auth/me").json()["active_department_id"] == college_id
    signed_out = auth_client.post("/api/v1/auth/logout", headers=csrf_headers(auth_client))
    assert signed_out.status_code == 204
    assert auth_client.get("/api/v1/auth/me").status_code == 401


def test_super_administrator_can_select_all_departments(auth_client, db):
    add_user(db, username="maria", email="maria@usant.edu.ph", display_name="Maria Reyes",
             password="local-secret", role_name="Super Administrator", department_code=None)
    assert auth_client.post("/api/v1/auth/login", json={"username": "maria", "password": "local-secret"}).status_code == 200
    college = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    chosen = auth_client.patch(
        "/api/v1/auth/session",
        json={"active_department_id": str(college.id)},
        headers=csrf_headers(auth_client),
    )
    assert chosen.status_code == 200
    assert chosen.json()["active_department_id"] == str(college.id)
    cleared = auth_client.patch(
        "/api/v1/auth/session",
        json={"active_department_id": None},
        headers=csrf_headers(auth_client),
    )
    assert cleared.status_code == 200
    assert cleared.json()["active_department_id"] is None
    change = db.query(AuditLog).filter_by(action="auth.department_change").all()
    assert len(change) == 2


def test_sixth_login_attempt_is_rate_limited(auth_client, db):
    add_user(db, username="ada", email="ada@usant.edu.ph", display_name="Ada Cruz",
             password="local-secret", role_name="Librarian", department_code="COLLEGE")
    for _ in range(5):
        failed = auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "wrong"})
        assert failed.status_code == 401
    blocked = auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"})
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "rate_limited"
    assert db.query(AuditLog).filter_by(action="auth.login.failure").count() == 5
```

```python
def test_librarian_cannot_select_another_department(auth_client, db):
    add_user(db, username="ada", email="ada@usant.edu.ph", display_name="Ada Cruz",
             password="local-secret", role_name="Librarian", department_code="COLLEGE")
    logged = auth_client.post("/api/v1/auth/login", json={"username": "ada", "password": "local-secret"})
    college_id = logged.json()["active_department_id"]
    junior = db.query(LibraryDepartment).filter_by(code="JHS").one()
    rejected = auth_client.patch(
        "/api/v1/auth/session",
        json={"active_department_id": str(junior.id)},
        headers=csrf_headers(auth_client),
    )
    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "department_forbidden"
    assert auth_client.get("/api/v1/auth/me").json()["active_department_id"] == college_id
```

- [ ] **Step 2: Run the new tests and confirm failure**

Expected: FAIL with 404 on logout or 405, because the routes are absent.

- [ ] **Step 3: Implement the mutations**

CSRF check: header and cookie are present, equal, and `hash_secret(header) == session.csrf_token_hash`. Otherwise `AuthError(403, "csrf_failed", "The sign-in check failed. Refresh the page and try again.")`.

Department change loads the session, checks CSRF, then rejects with `department_forbidden` and message `That department is outside your assignment.` when null is not allowed or the id is not in the user's department list. On success, store the id, write `auth.department_change` with `details.active_department_id` as the uuid string or null, and return the payload. Do not commit a rejected change.

Logout checks CSRF, sets `revoked_at`, writes `auth.logout`, commits, and the route returns 204 after deleting both cookies.

Rate limit stays in `login` before password verification. At five matching failure rows in the last 15 minutes, raise `AuthError(429, "rate_limited", "Sign-in is temporarily paused. Try again later.")` and do not add an audit row.

- [ ] **Step 4: Run `tests/api/test_auth.py`**

Expected: all auth tests PASS.

- [ ] **Step 5: Commit**

Message: `Protect logout and department changes with the session.`

---

### Task 6: Bootstrap seed

**Files:**
- Create: `apps/api/app/scripts/__init__.py`
- Create: `apps/api/app/scripts/seed.py`
- Create: `apps/api/tests/api/test_seed.py`

**Interfaces:**
- Consumes: identity models, `hash_password`
- Produces: `seed_bootstrap(db: Session) -> None`. CLI `python -m app.scripts.seed` from `apps/api` commits that function. Missing `LIBRARYHUB_BOOTSTRAP_PASSWORD` exits with status 1 and writes nothing.

- [ ] **Step 1: Write the failing test**

```python
def test_seed_creates_maria_once(db, monkeypatch):
    monkeypatch.setenv("LIBRARYHUB_BOOTSTRAP_PASSWORD", "bootstrap-secret")
    existing = db.query(AppUser).filter_by(username="m.reyes").one_or_none()
    if existing is not None:
        db.delete(existing)
        db.commit()
    seed_bootstrap(db)
    seed_bootstrap(db)
    users = db.query(AppUser).filter_by(username="m.reyes").all()
    assert len(users) == 1
    user = users[0]
    assert user.email == "m.reyes@usant.edu.ph"
    assert user.display_name == "Maria Reyes"
    assert user.status == "active"
    identity = db.query(AuthIdentity).filter_by(user_id=user.id).one()
    assert identity.provider == "local"
    assert identity.koha_borrowernumber is None
    assignment = db.query(UserRoleAssignment).filter_by(user_id=user.id).one()
    assert assignment.department_id is None
    assert db.query(Role).filter_by(id=assignment.role_id).one().name == "Super Administrator"
    assert verify_password("bootstrap-secret", db.query(UserCredential).filter_by(user_id=user.id).one().password_hash)
```

The rollback fixture undoes this row even if Maria already existed, because the delete and the insert share the test transaction.

- [ ] **Step 2: Run the test and confirm failure**

Expected: FAIL with import error for `app.scripts.seed`.

- [ ] **Step 3: Implement the seed**

`seed_bootstrap` reads `LIBRARYHUB_BOOTSTRAP_PASSWORD`. If it is missing or blank, raise `SystemExit(1)`. If `m.reyes` already exists, return without changing the password. Otherwise insert the user, credential, identity, and Super Administrator assignment from the spec.

The `__main__` block opens a normal session, calls `seed_bootstrap`, commits, and closes it. When the environment variable is missing, `seed_bootstrap` raises `SystemExit(1)` before it touches the database. Add this test beside the idempotency test; it does not need the `db` fixture:

```python
def test_seed_requires_the_bootstrap_password(monkeypatch):
    monkeypatch.delenv("LIBRARYHUB_BOOTSTRAP_PASSWORD", raising=False)
    with pytest.raises(SystemExit) as raised:
        seed_bootstrap(None)
    assert raised.value.code == 1
```

- [ ] **Step 4: Run the test**

```bash
python -m pytest tests/api/test_seed.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Seed the first super administrator from the environment.`

---

### Task 7: Web API client and session reader

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/lib/auth/types.ts`
- Create: `apps/web/lib/auth/session.ts`
- Create: `apps/web/lib/auth/nav.ts`
- Create: `apps/web/middleware.ts`

**Interfaces:**
- Consumes: `GET /api/v1/auth/me` and the cookie names
- Produces: `fetchApi`, `getCurrentUser(): Promise<CurrentUser | null>`, `gatePage(permission: string)`, `STAFF_NAV` path and permission entries (icons are added in Task 10), middleware that sets `x-pathname` and redirects cookieless requests for staff paths to `/login?next=<path>`.

- [ ] **Step 1: Read the Next.js 16 docs that ship with this repo**

Read `apps/web/node_modules/next/dist/docs/` for middleware, `cookies()`, and `cacheComponents` before editing the layout or middleware. Use the APIs that those docs describe.

- [ ] **Step 2: Implement the client**

`getApiBaseUrl()` returns `""` in the browser and `process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000"` on the server. `fetchApi` joins that base with `/api/v1` and the path. Browser calls set `credentials: "include"` and, for POST, PATCH, PUT, and DELETE, copy the `libraryhub_csrf` cookie into `X-CSRF-Token`. A non-OK response throws an `ApiError` carrying `status` and `detail`. `detail` is the JSON `detail` object when the body has one.

`next.config.ts` rewrites `/api/v1/:path*` to `${process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000"}/api/v1/:path*`.

`CurrentUser` in `types.ts` matches `CurrentUserOut`.

`getCurrentUser` is wrapped in React `cache`. It forwards the request `Cookie` header to `/auth/me`. 401 returns null. Any other failure returns null only for 401; a network failure throws so the shell can show the unavailable state rather than pretending the user signed out.

`gatePage` uses `getCurrentUser`. Null redirects to `/login`. A missing permission returns `{ denied: true, roleName }` where `roleName` is the assignment role names joined with `", "`. Otherwise it returns `{ denied: false, me }`.

`middleware.ts` matcher covers the staff paths and `/login`. It copies `request.nextUrl.pathname` into request header `x-pathname`. For a staff path with no `libraryhub_session` cookie, it redirects to `/login?next=` plus that pathname. `/login` is not redirected by middleware; the login page does that after `/auth/me`.

Create `apps/web/lib/auth/nav.ts` with `STAFF_NAV`: the groups, labels, hrefs, and permissions from the spec table. Leave each item's `icon` as `null` until Task 10. Middleware imports the hrefs from `STAFF_NAV` instead of a second list.

Staff paths: `/dashboard`, `/catalog`, `/patrons`, `/circulation`, `/holds`, `/inventory`, `/notifications`, `/announcements`, `/reports`, `/departments`, `/staff`, `/audit`, `/integrations`, `/student`.

- [ ] **Step 3: Typecheck**

From `apps/web`:

```bash
npm run typecheck
```

Expected: exit 0. The new modules must be imported by the login page in Task 9; until then, export them and add a temporary import from `app/(auth)/layout.tsx` only if the compiler drops unused files. Prefer wiring them in Task 9 and running typecheck there if this task's files are otherwise unused. Do not leave a dummy export that the homepage imports.

- [ ] **Step 4: Commit**

Message: `Call FastAPI sessions from the Next.js origin.`

---

### Task 8: Theme and shadcn blocks

**Files:**
- Modify: `apps/web/app/globals.css`
- Create: shadcn primitives under `apps/web/components/ui/`
- Delete, if the CLI creates them: `apps/web/app/login/page.tsx`, `apps/web/app/dashboard/page.tsx`, and any sample sidebar page at the app root

**Interfaces:**
- Consumes: `apps/web/components.json`
- Produces: `.ulms` theme tokens and the installed `sidebar`, `command`, `select`, `dropdown-menu`, `input`, `label`, and `card` primitives.

- [ ] **Step 1: Install the blocks from `apps/web`**

```bash
npx shadcn@latest add sidebar-01 login-02 command select dropdown-menu
```

Keep the generated files in `components/ui` and `hooks`. Delete sample routes the CLI places in `app/login` or `app/dashboard`. Do not let those samples occupy `/login` or `/dashboard`.

- [ ] **Step 2: Add the `.ulms` scope to `globals.css`**

```css
.ulms {
  --background: #faf7f1;
  --foreground: #221a18;
  --card: #ffffff;
  --card-foreground: #221a18;
  --primary: #7d1519;
  --primary-foreground: #faf7f1;
  --secondary: #fbf4f4;
  --secondary-foreground: #7d1519;
  --muted: #f3ece1;
  --muted-foreground: rgb(34 26 24 / 60%);
  --accent: #faa61a;
  --accent-foreground: #2e080a;
  --border: rgb(125 21 25 / 15%);
  --input: rgb(125 21 25 / 20%);
  --ring: #faa61a;
  --sidebar: #2e080a;
  --sidebar-foreground: #faf7f1;
  --sidebar-primary: #faa61a;
  --sidebar-primary-foreground: #2e080a;
  --sidebar-accent: #faa61a;
  --sidebar-accent-foreground: #2e080a;
  --sidebar-border: rgb(255 255 255 / 10%);
  --sidebar-ring: #faa61a;
}
```

Do not change the `:root` tokens the homepage uses.

- [ ] **Step 3: Typecheck**

Expected: exit 0.

- [ ] **Step 4: Commit**

Message: `Install the staff sidebar and login blocks.`

---

### Task 9: Login page

**Files:**
- Modify: `apps/web/app/(auth)/layout.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`
- Create: `apps/web/components/auth/login-form.tsx`

**Interfaces:**
- Consumes: `fetchApi`, `getCurrentUser`, shadcn `Button`, `Input`, `Label`
- Produces: `/login` matching the prototype panel and the local-account form.

- [ ] **Step 1: Replace the auth layout**

The layout is a full-height `div` with `className="ulms min-h-full"`. It does not set `max-w-md`.

- [ ] **Step 2: Build the page**

Server page: if `getCurrentUser()` returns a user, `redirect("/dashboard")`. Otherwise render a two-column grid. From `lg` up, the left column is the prototype maroon panel:

- Seal image `https://www.usant.edu.ph/images/usant_logo_new.png` with alt `USANT seal`. The university name and "libraryhub" remain if the image fails.
- Eyebrow `University Library Management System`
- Heading `One workspace for five libraries.` with `five libraries.` in gold italic Playfair
- Text: `Department-aware dashboards, circulation, inventory, announcements and reports — powered by the Koha REST API. Koha stays the source of truth.`
- Tiles: `5` / `Departments`, `RBAC` / `Role + dept scope`, `Koha` / `Source of truth`
- Footer: `ULMS workspace for the University of Saint Anthony.`

The right column is a cream card, `max-w-md`, radius matching `rounded-3xl`.

`login-form.tsx` is a client form:

- Eyebrow `Staff sign-in`, heading `Welcome back`, text `Sign in to manage your library department.`
- Disabled button `Continue with University SSO (OIDC)` with `aria-describedby` pointing at `University SSO is not configured.`
- Divider text `or local account`
- Labels `Username or email` and `Password`. Both inputs start empty.
- Gold submit button `Sign in`, disabled while the request is in flight.
- Note: `Argon2id password hashing, secure HttpOnly cookies, and rate limiting. Permissions are enforced by FastAPI.`

Submit calls `fetchApi("/auth/login", { method: "POST", body: JSON.stringify({ username, password }), headers: { "Content-Type": "application/json" } })`. On success, read `next` from the query string. Assign that path only when it is exactly one of the staff paths and the login payload's `permissions` includes that path's permission from `STAFF_NAV`. Otherwise assign `/dashboard`. On `ApiError`, show `detail.message`. On a network failure, show `The sign-in service is unavailable.` and keep the field values.

Do not render a signup link, a forgot-password link, or a demo role picker.

- [ ] **Step 3: Typecheck**

Expected: exit 0.

- [ ] **Step 4: Commit**

Message: `Add the staff sign-in page.`

---

### Task 10: Staff shell

**Files:**
- Modify: `apps/web/lib/auth/nav.ts`
- Create: `apps/web/components/layout/staff-shell.tsx`
- Create: `apps/web/components/layout/module-frame.tsx`
- Create: `apps/web/app/(app)/layout.tsx`
- Delete: `apps/web/app/(dashboard)/layout.tsx`
- Delete: `apps/web/app/(dashboard)/.gitkeep`
- Delete: `apps/web/components/layout/app-shell.tsx`
- Delete: `apps/web/app/catalog/.gitkeep`
- Delete: `apps/web/app/student/.gitkeep`

**Interfaces:**
- Consumes: `CurrentUser`, `getCurrentUser`, sidebar primitives, `fetchApi`
- Produces: `STAFF_NAV`, `StaffShell`, `ModuleFrame`, `AccessDenied`. The `(app)` layout redirects to `/login?next=<x-pathname>` when `getCurrentUser()` returns null, and shows `The sign-in service is unavailable.` when that call throws.

- [ ] **Step 1: Add icons to `STAFF_NAV`**

The groups, labels, hrefs, and permissions already exist from Task 7. Set each item's icon:

| Href | Icon export |
|---|---|
| `/dashboard` | `DashboardSpeed01Icon` |
| `/catalog` | `BookOpen01Icon` |
| `/patrons` | `IdentityCardIcon` |
| `/circulation` | `ArrowReloadHorizontalIcon` |
| `/holds` | `Bookmark01Icon` |
| `/inventory` | `BarcodeIcon` |
| `/notifications` | `Notification01Icon` |
| `/announcements` | `Megaphone01Icon` |
| `/reports` | `Chart01Icon` |
| `/departments` | `Building03Icon` |
| `/staff` | `UserGroupIcon` |
| `/audit` | `ClipboardIcon` |
| `/integrations` | `Plug01Icon` |
| `/student` | `Mortarboard01Icon` |

- [ ] **Step 2: Write the shell**

`StaffShell` is a client component. It receives `me: CurrentUser`. It renders `SidebarProvider` with `Sidebar collapsible="icon"`. Header: the USANT seal, `libraryhub`, and `USANT · ULMS`. Menu items are the nav entries whose permission is in `me.permissions`. The active item uses the current pathname and the classes `data-active:bg-[#FAA61A] data-active:text-[#2E080A] data-active:font-bold`. Inactive items use cream at 75% opacity. Hover uses `hover:bg-white/7 hover:text-white`. Include `SidebarRail`.

Footer card: a green dot and `Koha configured` when `me.koha_configured` is true, otherwise a muted dot and `Koha not configured`. Second line: `Source of truth for catalog, patrons & circulation.`

Header row:

- `SidebarTrigger` with `className="lg:hidden"` and `aria-label="Open menu"`
- Department `Select`. Options are `me.departments`. Prepend `All departments` with value `all` when `me.can_select_all_departments`. The selected value is `all` when `active_department_id` is null. On change, PATCH `/auth/session` with `active_department_id` null or the uuid. Then `router.refresh()`. On `department_forbidden`, set the select back and show `detail.message`.
- Command dialog opened by a button labeled `Search or jump to…` and by Ctrl+K or ⌘K. Items are the same permitted routes. Choosing one navigates there.
- Bell link to `/notifications` with `aria-label="Notifications"`. No count.
- Dropdown with initials, display name, role names joined by `", "`, and `Sign out`.

Sign out POSTs `/auth/logout`. On success, `window.location.assign("/login")`. On failure, show `Sign-out did not complete.` and stay on the page.

`fetchApi` already retries nothing. In the shell, a thrown `ApiError` with `detail.code === "csrf_failed"` calls `GET /auth/me` once and retries the mutation once. A second `csrf_failed`, or any 401, assigns `/login?next=` plus the current pathname.

`ModuleFrame` renders the eyebrow, Playfair title, description, optional actions, and the sentence `This module's tools will be added in a later spec.` `AccessDenied` renders a lock mark, `Access denied`, and `Your role (<roleName>) does not include this module. Authorization is enforced by the backend API as well as this UI.`

The layout wraps children in `.ulms min-h-screen` and `StaffShell`. While this is a server layout, the loading file `app/(app)/loading.tsx` shows a sidebar-width skeleton and a header skeleton.

- [ ] **Step 3: Typecheck**

Expected: exit 0.

- [ ] **Step 4: Commit**

Message: `Add the staff sidebar shell.`

---

### Task 11: Prototype page frames

**Files:**
- Create: `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/app/(app)/catalog/page.tsx`
- Create: `apps/web/app/(app)/patrons/page.tsx`
- Create: `apps/web/app/(app)/circulation/page.tsx`
- Create: `apps/web/app/(app)/holds/page.tsx`
- Create: `apps/web/app/(app)/inventory/page.tsx`
- Create: `apps/web/app/(app)/notifications/page.tsx`
- Create: `apps/web/app/(app)/announcements/page.tsx`
- Create: `apps/web/app/(app)/reports/page.tsx`
- Create: `apps/web/app/(app)/departments/page.tsx`
- Create: `apps/web/app/(app)/staff/page.tsx`
- Create: `apps/web/app/(app)/audit/page.tsx`
- Create: `apps/web/app/(app)/integrations/page.tsx`
- Create: `apps/web/app/(app)/student/page.tsx`
- Create: `apps/web/app/(app)/not-found.tsx`

**Interfaces:**
- Consumes: `gatePage`, `ModuleFrame`, `AccessDenied`
- Produces: one server page per staff path.

- [ ] **Step 1: Add each page**

Every page calls `gatePage` with its permission and returns `AccessDenied` when `denied` is true. The eyebrow, title, and description are copied from the spec's page-frame table.

Dashboard title is computed in Asia/Manila: `Good morning` before 12:00, `Good afternoon` before 18:00, and `Good evening` from 18:00, then a comma and the first word of `display_name`. The description is `Operational overview for <name> · <weekday, month day, year>`. `<name>` is `All departments` when `active_department_id` is null, otherwise that department's `name`. Actions: a link to `/catalog` when `catalog.view` is present, and a link to `/circulation` when `circulation.view` is present. Labels: `Search catalog` and `Circulation desk`.

Catalog action: link text `Open Koha OPAC`, `href="https://library.usant.edu.ph/"`, `target="_blank"`, `rel="noopener"`.

Inventory: when `me.active_department_id` is null, do not render the module sentence. Render the header and a centered card titled `Choose a department` with the text `Inventory sessions run against one department at a time. Use the department selector in the top bar.`

Student title is `Student portal`. Eyebrow is `Student self-service`. Description is the spec sentence.

`not-found.tsx` renders inside the shell with heading `Page not found`.

- [ ] **Step 2: Typecheck and lint**

From `apps/web`:

```bash
npm run typecheck
npm run lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

Message: `Add a route for each prototype staff view.`

---

### Task 12: Verification

**Files:** none new.

- [ ] **Step 1: Run the API suite**

From `apps/api`, with PostgreSQL up and the migration applied:

```bash
python -m pytest tests/api/test_identity_schema.py tests/unit/test_passwords.py tests/api/test_auth.py tests/api/test_seed.py -v
```

Expected: all PASS, none SKIPPED.

- [ ] **Step 2: Seed a local user**

Set `LIBRARYHUB_BOOTSTRAP_PASSWORD` in the environment, not in a committed file. From `apps/api`:

```bash
python -m app.scripts.seed
```

Expected: one Maria Reyes row. A second run prints or returns without a second row.

- [ ] **Step 3: Browser pass**

Start the API and `apps/web`. Exercise:

1. Open `/login`. Fields are empty. The SSO button does not submit. Wrong password shows `Those credentials are not valid.`
2. Sign in as `m.reyes`. The browser lands on `/dashboard`. The sidebar shows every staff item and hides Student Portal. The footer says `Koha not configured` when `KOHA_BASE_URL` is empty.
3. Refresh. The same user is still signed in.
4. Change the department to College Library, refresh, and confirm it is still selected. Change it back to All departments.
5. Open `/catalog` from the sidebar and from the dashboard link. Open `/student` by typing the URL and confirm the access-denied panel names Super Administrator.
6. Open `/inventory` while All departments is selected and confirm the choose-department card.
7. Narrow the viewport until the menu button appears. Open and close the sheet. Confirm the active item matches the route.
8. Sign out. `/dashboard` returns to `/login`. A failed network sign-out, if you can simulate it by stopping the API, stays on the page and shows `Sign-out did not complete.`

- [ ] **Step 4: Commit only if verification required a fix**

Message: `Fix staff shell session verification failures.`

Do not commit an empty verification commit.
