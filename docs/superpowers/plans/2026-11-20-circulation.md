# Staff circulation desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized staff run Koha-backed checkout, check-in, renewal, and patron-scoped loan reads from `/circulation`, with request locking, capability gating, and audit rows.

**Architecture:** The browser calls `/api/v1/circulation` through the Next.js rewrite. Circulation services validate permissions and capabilities, insert `circulation_requests` after successful identifying reads, call Koha only through recorded capability entries, strip barcodes without `catalog.barcode.view`, and write `audit_logs` on writes and verify. Koha remains the authority; ULMS stores no loan copy.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, HTTPX MockTransport, pytest, Next.js 16, TanStack Query, shadcn, node:test.

## Global Constraints

- Koha is the authority. No loan copy. No due date math. No override header. No Web NFC. No branch block. Do not fill `koha_branchcode`.
- Do not invent Koha paths. Capabilities start unset (`None` / `false`). Unset checkout, check-in, renew, history, and single-loan reads return `501` `circulation_unsupported` with message `This Koha operation is not available.`
- Loans use the existing per-patron checkout list (`loans.scope` is `patron`) because `GET /patrons/{patron_id}/checkouts` already exists on the client. Global list stays unset until a later recorded OpenAPI entry says otherwise. History stays unsupported.
- Permissions: `circulation.checkout`, `circulation.checkin`, and `circulation.renew` are granted only to Librarian, Department Head, Library Administrator, and Super Administrator. `circulation.view` already exists.
- Permission denial message: `You do not have permission for this action.`
- Barcodes appear in circulation responses only when the caller has `catalog.barcode.view`.
- Writes require CSRF header `X-CSRF-Token` and cookie `libraryhub_csrf` via `assert_csrf`, same as patrons.
- A `circulation_requests` row is inserted only after identifying reads succeed, then committed before the Koha write.
- Checkout batch stops on the first refusal or unknown item. The same `request_id` replays stored results. Verify does not repeat the write.
- Overdue uses today’s calendar date in `Asia/Manila`. A null `due_date` yields `overdue` null.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains `Co-authored-by: Cursor <cursoragent@cursor.com>`, replace the commit with `git commit-tree` as in `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend`.
- Pytest runs from `apps/api` with `TestClient` and `httpx.MockTransport`. No live Koha socket.
- Web tests use `node --test`. Update `apps/web/package.json` `test` script to include `lib/circulation/*.test.ts`.
- Staff page copy: eyebrow `Library`, title `Circulation desk`, description `Koha confirms every checkout, check-in, and renewal.` Use `ModuleFrame` with `hideModuleSentence`. Tab query `tab` is `checkout`, `checkin`, `renew`, `loans`, or `history`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261120_0005_circulation.py` | Write permissions and `circulation_requests` table |
| `apps/api/app/models/circulation.py` | `CirculationRequest` SQLAlchemy model |
| `apps/api/app/integrations/koha/circulation.py` | Recorded `CirculationCapabilities` table (paths unset until host OpenAPI is recorded) |
| `apps/api/app/scripts/koha_circulation_capabilities.py` | Manual OpenAPI printer for checkout, check-in, renewal paths (does not write code) |
| `apps/api/app/schemas/circulation.py` | Request and response Pydantic models |
| `apps/api/app/services/circulation_errors.py` | `CirculationError` and shared messages |
| `apps/api/app/services/circulation_requests.py` | Insert, replay, stale `in_progress` → `unknown` |
| `apps/api/app/services/circulation_lookup.py` | Card, barcode, desk patron, desk item |
| `apps/api/app/services/circulation_checkout.py` | Batch checkout, replay, audit |
| `apps/api/app/services/circulation_checkin.py` | Check-in, confirmation flag, audit |
| `apps/api/app/services/circulation_renew.py` | Preview, renew, verify renewal |
| `apps/api/app/services/circulation_loans.py` | Patron-scoped loans list, history unsupported |
| `apps/api/app/api/routes/circulation.py` | `/api/v1/circulation` routes |
| `apps/api/app/api/dependencies/session.py` | `require_circulation_permission` |
| `apps/api/app/api/routes/__init__.py` | Export `circulation_router` |
| `apps/api/app/main.py` | Include circulation router |
| `apps/web/lib/circulation/types.ts` | API response types |
| `apps/web/lib/circulation/search-params.ts` | `tab` query parsing |
| `apps/web/lib/circulation/scan.ts` | Scan queue, validation, Enter/Tab submit |
| `apps/web/lib/circulation/print.ts` | Print payload (confirmed lines only) |
| `apps/web/components/circulation/*.tsx` | Desk tabs and panels |
| `apps/web/app/(app)/circulation/page.tsx` | Permission gate and desk shell |
| `docs/koha-integration.md` | Circulation section (writes unsupported until capability table recorded) |

---

### Task 1: Migration, model, schema test

**Files:**
- Create: `apps/api/alembic/versions/20261120_0005_circulation.py`
- Create: `apps/api/app/models/circulation.py`
- Create: `apps/api/tests/api/test_circulation_schema.py`
- Test: `apps/api/tests/api/test_circulation_schema.py`

**Interfaces:**
- Consumes: Alembic revision `20261120_0004`, schema `libraryhub`, tables `permissions`, `role_permissions`, `from app.models.base import Base`
- Produces: permission codes `circulation.checkout`, `circulation.checkin`, `circulation.renew` (module `circulation`, granted to Librarian, Department Head, Library Administrator, Super Administrator only); SQLAlchemy model `CirculationRequest` with columns `id`, `user_id`, `action`, `status`, `patron_id`, `created_at`, `updated_at`, `result` (JSONB)

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_circulation_schema.py`:

```python
import uuid

from sqlalchemy import inspect, text

from app.models.circulation import CirculationRequest
from app.models.identity import Permission

WRITE_CODES = ("circulation.checkout", "circulation.checkin", "circulation.renew")
WRITE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
OTHER_ROLES = ("Student", "Auditor")


def test_circulation_write_permissions_and_table(db):
    rows = db.query(Permission).filter(Permission.code.in_(WRITE_CODES)).all()
    assert {row.code for row in rows} == set(WRITE_CODES)
    assert {row.module for row in rows} == {"circulation"}
    granted = db.execute(
        text("""
            SELECT r.name, p.code
            FROM libraryhub.roles r
            JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
            JOIN libraryhub.permissions p ON p.id = rp.permission_id
            WHERE p.code IN (
                'circulation.checkout',
                'circulation.checkin',
                'circulation.renew'
            )
        """),
    ).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in WRITE_ROLES:
        assert by_role[name] == set(WRITE_CODES)
    for name in OTHER_ROLES:
        assert name not in by_role

    inspector = inspect(db.get_bind())
    columns = {col["name"] for col in inspector.get_columns("circulation_requests", schema="libraryhub")}
    assert columns == {
        "id",
        "user_id",
        "action",
        "status",
        "patron_id",
        "created_at",
        "updated_at",
        "result",
    }

    row = CirculationRequest(
        id=uuid.uuid4(),
        user_id=None,
        action="checkout",
        status="in_progress",
        patron_id=42,
        result={"items": []},
    )
    db.add(row)
    db.flush()
    assert db.get(CirculationRequest, row.id) is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/api/test_circulation_schema.py::test_circulation_write_permissions_and_table -v`

Expected: FAIL with relation `circulation_requests` does not exist or permission rows missing.

- [ ] **Step 3: Add migration and model**

Create `apps/api/app/models/circulation.py`:

```python
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

_SCHEMA = "libraryhub"


class CirculationRequest(Base):
    __tablename__ = "circulation_requests"
    __table_args__ = (
        CheckConstraint(
            "action in ('checkout', 'checkin', 'renew')",
            name="ck_circulation_requests_action",
        ),
        CheckConstraint(
            "status in ('in_progress', 'completed', 'unknown')",
            name="ck_circulation_requests_status",
        ),
        {"schema": _SCHEMA},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.app_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    patron_id: Mapped[int | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
```

Create `apps/api/alembic/versions/20261120_0005_circulation.py` with `revision = "20261120_0005"`, `down_revision = "20261120_0004"`, `SCHEMA = "libraryhub"`, `WRITE_ROLES` as in the test. `upgrade` creates `circulation_requests` with the columns above and check constraints, then inserts the three permissions when missing:

| code | description |
|---|---|
| `circulation.checkout` | Submit a Koha checkout |
| `circulation.checkin` | Submit a Koha check-in |
| `circulation.renew` | Submit a Koha renewal |

Grant each code to each role in `WRITE_ROLES` using the same `INSERT … WHERE NOT EXISTS` shape as `20261120_0004_patron_permissions.py`. `downgrade` drops `circulation_requests`, deletes `role_permissions` for the three codes, then deletes the permissions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m alembic upgrade head; python -m pytest tests/api/test_circulation_schema.py::test_circulation_write_permissions_and_table -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/alembic/versions/20261120_0005_circulation.py apps/api/app/models/circulation.py apps/api/tests/api/test_circulation_schema.py
git commit -F <msgfile>
```

Message: `Add circulation write permissions and request rows.`

---

### Task 2: Capability table and circulation errors

**Files:**
- Replace: `apps/api/app/integrations/koha/circulation.py`
- Create: `apps/api/app/services/circulation_errors.py`
- Create: `apps/api/app/scripts/koha_circulation_capabilities.py`
- Create: `apps/api/tests/unit/test_circulation_capabilities.py`
- Test: `apps/api/tests/unit/test_circulation_capabilities.py`

**Interfaces:**
- Consumes: none from prior tasks beyond project layout
- Produces: `CirculationCapabilities` dataclass, `get_circulation_capabilities() -> CirculationCapabilities`, `capabilities_payload(caps: CirculationCapabilities) -> dict`, `CirculationError` with `status_code`, `code`, `message`, and optional `request_id` / `items`; constants `_UNSUPPORTED` (501), `_PERMISSION_DENIED` (403), `_UNAVAILABLE` (503), `_TIMEOUT` (504); script `python -m app.scripts.koha_circulation_capabilities` prints `METHOD path` lines for operations whose paths exist in the host OpenAPI document

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_circulation_capabilities.py`:

```python
from app.integrations.koha.circulation import (
    CirculationCapabilities,
    capabilities_payload,
    get_circulation_capabilities,
)
from app.services.circulation_errors import CirculationError, unsupported_write


def test_default_capabilities_are_unset_except_patron_loans():
    caps = get_circulation_capabilities()
    assert isinstance(caps, CirculationCapabilities)
    assert caps.loans_scope == "patron"
    assert caps.checkout is None
    assert caps.checkin is None
    assert caps.renew is None
    assert caps.history is None
    assert caps.renewal_preview is None
    assert caps.checkin_confirmation is False
    assert caps.single_loan is None
    payload = capabilities_payload(caps)
    assert payload["checkout"] is False
    assert payload["checkin"] is False
    assert payload["renew"] is False
    assert payload["history"] is False
    assert payload["loans"]["scope"] == "patron"
    assert payload["renewal_preview"] is False
    assert payload["checkin_confirmation"] is False


def test_unsupported_write_error_message():
    exc = unsupported_write()
    assert exc.status_code == 501
    assert exc.code == "circulation_unsupported"
    assert exc.message == "This Koha operation is not available."
    assert isinstance(exc, CirculationError)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_capabilities.py -v`

Expected: FAIL with `ImportError` or missing `get_circulation_capabilities`.

- [ ] **Step 3: Implement capability table and errors**

Replace `apps/api/app/integrations/koha/circulation.py`:

```python
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WriteCapability:
    method: str
    path: str


@dataclass(frozen=True)
class CirculationCapabilities:
    checkout: WriteCapability | None = None
    checkin: WriteCapability | None = None
    renew: WriteCapability | None = None
    loans_scope: str = "patron"
    history: WriteCapability | None = None
    renewal_preview: WriteCapability | None = None
    checkin_confirmation: bool = False
    single_loan: WriteCapability | None = None


def get_circulation_capabilities() -> CirculationCapabilities:
    return CirculationCapabilities()


def capabilities_payload(caps: CirculationCapabilities) -> dict:
    return {
        "checkout": caps.checkout is not None,
        "checkin": caps.checkin is not None,
        "renew": caps.renew is not None,
        "history": caps.history is not None,
        "renewal_preview": caps.renewal_preview is not None,
        "checkin_confirmation": caps.checkin_confirmation,
        "loans": {
            "scope": caps.loans_scope,
            "filters": ["q", "patron_id", "overdue", "page", "per_page", "sort", "direction"],
        },
        "single_loan": caps.single_loan is not None,
    }
```

Create `apps/api/app/services/circulation_errors.py`:

```python
from __future__ import annotations


class CirculationError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        request_id: str | None = None,
        items: list[dict] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.request_id = request_id
        self.items = items
        super().__init__(message)


def unsupported_write() -> CirculationError:
    return CirculationError(
        501,
        "circulation_unsupported",
        "This Koha operation is not available.",
    )


_PERMISSION_DENIED = CirculationError(
    403,
    "permission_denied",
    "You do not have permission for this action.",
)

_UNAVAILABLE = CirculationError(
    503,
    "circulation_unavailable",
    "Circulation is unavailable. Try again.",
)

_TIMEOUT = CirculationError(
    504,
    "circulation_timeout",
    "The outcome is unknown. Verify before trying again.",
)

_NOT_FOUND = CirculationError(404, "not_found", "That patron was not found.")

_INVALID_SCAN = CirculationError(422, "invalid_scan", "That scan is not valid.")

_INVALID_SEARCH = CirculationError(422, "invalid_search", "That search is not valid.")
```

Create `apps/api/app/scripts/koha_circulation_capabilities.py`:

```python
import json
import urllib.error
import urllib.request

from app.core.config import get_settings

_TAGS = ("checkouts", "checkins", "renewals")


def main() -> None:
    settings = get_settings()
    if not settings.koha_base_url:
        print("Koha is not configured")
        raise SystemExit(2)
    base = settings.koha_base_url.rstrip("/")
    if not base.endswith("/api/v1"):
        base = f"{base}/api/v1"
    url = f"{base}/.well-known/openapi"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            document = json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        print(type(exc).__name__)
        raise SystemExit(2) from exc
    paths = document.get("paths", {})
    for path, operations in sorted(paths.items()):
        if not isinstance(operations, dict):
            continue
        lowered = path.lower()
        if not any(tag in lowered for tag in _TAGS):
            continue
        for method, detail in operations.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                continue
            print(f"{method.upper()} {path}")


if __name__ == "__main__":
    main()
```

Manual recording (not a test step): from `apps/api`, run `python -m app.scripts.koha_circulation_capabilities` only when the configured host is reachable. Paste the printed lines into `docs/koha-integration.md` and into `circulation.py` capability fields only after human review. **Leave capabilities unset when the host cannot be read.** Do not guess paths in code or in this plan.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_capabilities.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/integrations/koha/circulation.py apps/api/app/services/circulation_errors.py apps/api/app/scripts/koha_circulation_capabilities.py apps/api/tests/unit/test_circulation_capabilities.py
git commit -F <msgfile>
```

Message: `Record unset Koha circulation capabilities and shared errors.`

---

### Task 3: Request-row lock (replay, stale, no names/barcodes stored)

**Files:**
- Create: `apps/api/app/services/circulation_requests.py`
- Create: `apps/api/tests/unit/test_circulation_requests.py`
- Test: `apps/api/tests/unit/test_circulation_requests.py`

**Interfaces:**
- Consumes: `CirculationRequest` model; `get_settings().koha_api_timeout`; `CirculationError` with codes `still_processing`, `outcome_unknown`
- Produces: `begin_request(db, *, request_id: uuid.UUID, user_id: uuid.UUID | None, action: str, patron_id: int | None) -> CirculationRequest`, `load_request(db, request_id: uuid.UUID) -> CirculationRequest | None`, `mark_stale_unknown(db, row: CirculationRequest, *, timeout_seconds: float) -> None`, `replay_response(row: CirculationRequest) -> dict`, `store_result(db, row: CirculationRequest, status: str, result: dict) -> None`, `touch_updated(row: CirculationRequest) -> None`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_circulation_requests.py`:

```python
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.circulation import CirculationRequest
from app.services.circulation_errors import CirculationError
from app.services.circulation_requests import (
    begin_request,
    load_request,
    mark_stale_unknown,
    replay_response,
    store_result,
)


def test_begin_request_inserts_once_and_replay_completed(db):
    request_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    first = begin_request(
        db,
        request_id=request_id,
        user_id=admin_id,
        action="checkout",
        patron_id=9,
    )
    db.commit()
    second = begin_request(
        db,
        request_id=request_id,
        user_id=admin_id,
        action="checkout",
        patron_id=9,
    )
    assert second.id == first.id
    store_result(
        db,
        first,
        status="completed",
        result={
            "items": [
                {
                    "item_id": 1,
                    "outcome": "confirmed",
                    "checkout_id": 3,
                    "due_date": "2026-12-01",
                },
            ],
        },
    )
    db.commit()
    replay_row = begin_request(
        db,
        request_id=request_id,
        user_id=admin_id,
        action="checkout",
        patron_id=9,
    )
    assert replay_row.status == "completed"
    payload = replay_response(replay_row)
    assert payload["request_id"] == str(request_id)
    assert payload["items"][0]["outcome"] == "confirmed"
    assert "barcode" not in payload["items"][0]
    assert "patron_name" not in payload


def test_in_progress_raises_still_processing(db):
    request_id = uuid.uuid4()
    begin_request(db, request_id=request_id, user_id=None, action="checkin", patron_id=None)
    db.commit()
    with pytest.raises(CirculationError) as exc:
        begin_request(db, request_id=request_id, user_id=None, action="checkin", patron_id=None)
    assert exc.value.code == "still_processing"
    assert exc.value.status_code == 409


def test_stale_in_progress_becomes_unknown(db):
    request_id = uuid.uuid4()
    row = begin_request(
        db,
        request_id=request_id,
        user_id=None,
        action="renew",
        patron_id=5,
    )
    row.updated_at = datetime.now(timezone.utc) - timedelta(seconds=120)
    db.flush()
    mark_stale_unknown(db, row, timeout_seconds=15.0)
    assert row.status == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_requests.py -v`

Expected: FAIL because `circulation_requests` module is missing.

- [ ] **Step 3: Implement request helpers**

Create `apps/api/app/services/circulation_requests.py`:

```python
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.circulation import CirculationRequest
from app.services.circulation_errors import CirculationError


def begin_request(
    db: Session,
    *,
    request_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    patron_id: int | None,
    timeout_seconds: float = 15.0,
) -> CirculationRequest:
    existing = load_request(db, request_id)
    if existing is not None:
        mark_stale_unknown(db, existing, timeout_seconds=timeout_seconds)
        db.flush()
        if existing.status == "completed":
            if _confirmation_required(existing):
                raise CirculationError(
                    409,
                    "circulation_confirmation",
                    _replay_message(existing),
                    request_id=str(request_id),
                    items=existing.result.get("items"),
                )
            return existing
        if existing.status == "unknown":
            raise CirculationError(
                409,
                "outcome_unknown",
                "The outcome is unknown. Verify before trying again.",
                request_id=str(request_id),
                items=existing.result.get("items"),
            )
        raise CirculationError(
            409,
            "still_processing",
            "That transaction is still in progress.",
            request_id=str(request_id),
            items=existing.result.get("items"),
        )
    row = CirculationRequest(
        id=request_id,
        user_id=user_id,
        action=action,
        status="in_progress",
        patron_id=patron_id,
        result={"items": []} if action == "checkout" else {},
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raced = load_request(db, request_id)
        if raced is None:
            raise
        return begin_request(
            db,
            request_id=request_id,
            user_id=user_id,
            action=action,
            patron_id=patron_id,
            timeout_seconds=timeout_seconds,
        )
    return row


def load_request(db: Session, request_id: uuid.UUID) -> CirculationRequest | None:
    return db.get(CirculationRequest, request_id)


def mark_stale_unknown(db: Session, row: CirculationRequest, *, timeout_seconds: float) -> None:
    if row.status != "in_progress":
        return
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds + 30.0)
    updated = row.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    if updated < cutoff:
        row.status = "unknown"
        db.flush()


def store_result(db: Session, row: CirculationRequest, *, status: str, result: dict) -> None:
    row.status = status
    row.result = result
    row.updated_at = datetime.now(timezone.utc)
    db.flush()


def touch_updated(row: CirculationRequest) -> None:
    row.updated_at = datetime.now(timezone.utc)


def replay_response(row: CirculationRequest) -> dict:
    base = {"request_id": str(row.id), "status": row.status}
    base.update(row.result)
    return base


def _confirmation_required(row: CirculationRequest) -> bool:
    items = row.result.get("items")
    if isinstance(items, list):
        return any(item.get("outcome") == "confirmation_required" for item in items if isinstance(item, dict))
    return row.result.get("outcome") == "confirmation_required"


def _replay_message(row: CirculationRequest) -> str:
    if _confirmation_required(row):
        return row.result.get("message") or "Koha requires confirmation."
    return "That transaction is still in progress."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_requests.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_requests.py apps/api/tests/unit/test_circulation_requests.py
git commit -F <msgfile>
```

Message: `Add circulation request row locking and replay.`

---

### Task 4: Exact card and barcode lookup

**Files:**
- Create: `apps/api/app/services/circulation_lookup.py`
- Create: `apps/api/app/schemas/circulation.py` (desk patron and item models)
- Create: `apps/api/tests/unit/test_circulation_lookup.py`
- Test: `apps/api/tests/unit/test_circulation_lookup.py`

**Interfaces:**
- Consumes: `KohaClient.get_patron`, `get_patron_balance`, `directory_item` from `app.services.patrons`, `item_status` from `app.integrations.koha.availability`, `CirculationError`, `_INVALID_SCAN`, `_NOT_FOUND`
- Produces: `validate_scan_value(value: str) -> str`, `patron_by_card(client, categories, libraries, cardnumber: str) -> dict`, `desk_patron(client, categories, libraries, patron_id: int, *, include_barcode: bool) -> dict`, `item_by_barcode(client, categories, libraries, barcode: str, *, include_barcode: bool) -> dict`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_circulation_lookup.py`:

```python
import pytest

from app.services.circulation_errors import CirculationError
from app.services.circulation_lookup import item_by_barcode, patron_by_card, validate_scan_value


class FakeClient:
    def __init__(self, patrons: list[dict] | None = None, items: list[dict] | None = None) -> None:
        self._patrons = patrons or []
        self._items = items or []

    def search_patrons(self, params: dict) -> list[dict]:
        card = params.get("cardnumber")
        return [row for row in self._patrons if row.get("cardnumber") == card]

    def search_items(self, params: dict) -> list[dict]:
        barcode = params.get("external_id")
        return [row for row in self._items if row.get("external_id") == barcode]


def test_validate_scan_rejects_control_chars():
    with pytest.raises(CirculationError) as exc:
        validate_scan_value("ab\x01c")
    assert exc.value.code == "invalid_scan"


def test_patron_by_card_zero_and_many():
    client = FakeClient(patrons=[{"patron_id": 1, "cardnumber": "C1", "surname": "A", "library_id": "CPL", "category_id": "ST"}])
    with pytest.raises(CirculationError) as none_exc:
        patron_by_card(client, {}, {}, "MISSING")
    assert none_exc.value.code == "not_found"
    client_many = FakeClient(
        patrons=[
            {"patron_id": 1, "cardnumber": "DUP", "surname": "A", "library_id": "CPL", "category_id": "ST"},
            {"patron_id": 2, "cardnumber": "DUP", "surname": "B", "library_id": "CPL", "category_id": "ST"},
        ],
    )
    with pytest.raises(CirculationError) as amb_exc:
        patron_by_card(client_many, {}, {}, "DUP")
    assert amb_exc.value.code == "ambiguous_card"


def test_item_by_barcode_strips_external_id_without_permission():
    client = FakeClient(
        items=[
            {
                "item_id": 7,
                "biblio_id": 3,
                "external_id": "B-1",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
                "itype": "BK",
            },
        ],
    )
    item = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=False)
    assert "external_id" not in item
    item2 = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=True)
    assert item2["external_id"] == "B-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_lookup.py -v`

Expected: FAIL with import error for `circulation_lookup`.

- [ ] **Step 3: Implement lookup and schemas**

Create `apps/api/app/schemas/circulation.py` with Pydantic models `DeskPatronOut`, `DeskItemOut`, `CapabilitiesOut` (fields match spec summaries). Create `apps/api/app/services/circulation_lookup.py`:

```python
from __future__ import annotations

import re

from app.integrations.koha.availability import item_status
from app.services.circulation_errors import CirculationError, _INVALID_SCAN
from app.services.patrons import directory_item

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_MAX_SCAN = 64


def validate_scan_value(value: str) -> str:
    trimmed = value.strip()
    if not trimmed or len(trimmed) > _MAX_SCAN or _CONTROL.search(trimmed):
        raise _INVALID_SCAN
    return trimmed


def patron_by_card(client, categories: dict, libraries: dict, cardnumber: str) -> dict:
    validate_scan_value(cardnumber)
    rows = client.search_patrons({"cardnumber": cardnumber, "_per_page": 5})
    if not rows:
        raise CirculationError(404, "not_found", "No patron matches that card number.")
    if len(rows) > 1:
        raise CirculationError(409, "ambiguous_card", "More than one patron has that card number.")
    return desk_patron(client, categories, libraries, int(rows[0]["patron_id"]), include_barcode=True)


def desk_patron(
    client,
    categories: dict,
    libraries: dict,
    patron_id: int,
    *,
    include_barcode: bool,
) -> dict:
    row = client.get_patron(patron_id)
    item = directory_item(row, categories, libraries)
    try:
        balance = client.get_patron_balance(patron_id)
    except Exception:
        balance = None
    item["balance"] = balance
    if not include_barcode:
        item.pop("cardnumber", None)
    return item


def item_by_barcode(
    client,
    categories: dict,
    libraries: dict,
    barcode: str,
    *,
    include_barcode: bool,
) -> dict:
    validate_scan_value(barcode)
    rows = client.search_items({"external_id": barcode, "_per_page": 5})
    if not rows:
        raise CirculationError(404, "not_found", "No item matches that barcode.")
    if len(rows) > 1:
        raise CirculationError(409, "ambiguous_item", "More than one item has that barcode.")
    row = rows[0]
    status, status_label = item_status(row)
    biblio = row.get("biblio") if isinstance(row.get("biblio"), dict) else {}
    item = {
        "item_id": row.get("item_id"),
        "biblio_id": row.get("biblio_id") or biblio.get("biblio_id"),
        "title": biblio.get("title"),
        "author": biblio.get("author"),
        "call_number": row.get("callnumber") or row.get("itemcallnumber"),
        "item_type_id": row.get("itype"),
        "item_type_label": categories.get(str(row.get("itype")), str(row.get("itype"))),
        "home_library_id": row.get("home_library_id"),
        "home_library_name": libraries.get(str(row.get("home_library_id")), row.get("home_library_id")),
        "holding_library_id": row.get("holding_library_id"),
        "holding_library_name": libraries.get(
            str(row.get("holding_library_id")),
            row.get("holding_library_id"),
        ),
        "status": status,
        "status_label": status_label,
    }
    if include_barcode:
        item["external_id"] = row.get("external_id")
    return item
```

In the same task, extend `apps/api/app/integrations/koha/client.py` with:

```python
    def search_patrons(self, params: dict) -> list[dict]:
        body, _headers = self.get_json("/patrons", params)
        if not isinstance(body, list):
            raise KohaResponseError
        return [row for row in body if isinstance(row, dict)]

    def search_items(self, params: dict) -> list[dict]:
        body, _headers = self.get_json("/items", params)
        if not isinstance(body, list):
            raise KohaResponseError
        return [row for row in body if isinstance(row, dict)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_lookup.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_lookup.py apps/api/app/schemas/circulation.py apps/api/tests/unit/test_circulation_lookup.py
git commit -F <msgfile>
```

Message: `Add circulation card and barcode lookups.`

---

### Task 5: Checkout batch

**Files:**
- Create: `apps/api/app/services/circulation_checkout.py`
- Create: `apps/api/tests/unit/test_circulation_checkout.py`
- Test: `apps/api/tests/unit/test_circulation_checkout.py`

**Interfaces:**
- Consumes: `begin_request`, `store_result`, `replay_response`, `touch_updated`, `desk_patron`, `get_circulation_capabilities`, `unsupported_write`, `AuditLog` from `app.models.identity`
- Produces: `submit_checkout(db, client, user_id, *, request_id, patron_id, item_ids: list[int]) -> dict`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_circulation_checkout.py`:

```python
import uuid

import pytest

from app.integrations.koha.circulation import CirculationCapabilities, WriteCapability, get_circulation_capabilities
from app.services.circulation_checkout import submit_checkout


class CheckoutClient:
    def __init__(self) -> None:
        self.calls: list[int] = []
        self._patron = {"patron_id": 5, "surname": "A", "firstname": "B", "library_id": "CPL", "category_id": "ST"}

    def get_patron(self, patron_id: int) -> dict:
        return self._patron

    def get_patron_balance(self, patron_id: int):
        return 0

    def post_checkout(self, patron_id: int, item_id: int) -> dict:
        self.calls.append(item_id)
        if item_id == 2:
            raise RuntimeError("refused")
        return {"checkout_id": item_id + 10, "due_date": "2026-12-04"}


def test_checkout_stops_on_refusal_and_replays(monkeypatch, db):
    caps = CirculationCapabilities(
        checkout=WriteCapability("POST", "/checkouts"),
        loans_scope="patron",
    )
    monkeypatch.setattr("app.services.circulation_checkout.get_circulation_capabilities", lambda: caps)
    client = CheckoutClient()
    request_id = uuid.uuid4()
    result = submit_checkout(
        db,
        client,
        uuid.uuid4(),
        request_id=request_id,
        patron_id=5,
        item_ids=[1, 2, 3],
    )
    assert client.calls == [1, 2]
    assert result["items"][0]["outcome"] == "confirmed"
    assert result["items"][1]["outcome"] == "refused"
    assert result["items"][2]["outcome"] == "unsent"
    again = submit_checkout(
        db,
        client,
        uuid.uuid4(),
        request_id=request_id,
        patron_id=5,
        item_ids=[1, 2, 3],
    )
    assert again == result
    assert len(client.calls) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_checkout.py::test_checkout_stops_on_refusal_and_replays -v`

Expected: FAIL — `submit_checkout` missing.

- [ ] **Step 3: Implement checkout service**

Create `apps/api/app/services/circulation_checkout.py`:

```python
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.integrations.koha.circulation import get_circulation_capabilities
from app.integrations.koha.exceptions import KohaError, KohaTimeoutError
from app.models.identity import AuditLog
from app.services.circulation_errors import CirculationError, unsupported_write
from app.services.circulation_requests import (
    begin_request,
    replay_response,
    store_result,
    touch_updated,
)


def submit_checkout(
    db: Session,
    client,
    user_id: uuid.UUID | None,
    *,
    request_id: uuid.UUID,
    patron_id: int,
    item_ids: list[int],
) -> dict:
    if not item_ids or len(item_ids) > 20 or len(set(item_ids)) != len(item_ids):
        raise CirculationError(422, "validation_error", "That request is not valid.")
    if any(item_id < 1 for item_id in item_ids):
        raise CirculationError(422, "validation_error", "That request is not valid.")
    caps = get_circulation_capabilities()
    if caps.checkout is None:
        raise unsupported_write()
    try:
        client.get_patron(patron_id)
    except Exception:
        raise CirculationError(404, "not_found", "That patron was not found.") from None
    row = begin_request(
        db,
        request_id=request_id,
        user_id=user_id,
        action="checkout",
        patron_id=patron_id,
    )
    if row.status == "completed":
        return replay_response(row)
    db.commit()
    outcomes: list[dict] = []
    request_unknown = False
    for item_id in item_ids:
        touch_updated(row)
        db.flush()
        try:
            answer = client.post_checkout(patron_id, item_id)
            outcomes.append(
                {
                    "item_id": item_id,
                    "outcome": "confirmed",
                    "checkout_id": answer.get("checkout_id"),
                    "due_date": answer.get("due_date"),
                },
            )
        except KohaTimeoutError:
            outcomes.append({"item_id": item_id, "outcome": "unknown"})
            request_unknown = True
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
        except KohaError:
            outcomes.append({"item_id": item_id, "outcome": "refused", "message": "Koha refused this transaction."})
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
        except RuntimeError:
            outcomes.append({"item_id": item_id, "outcome": "refused", "message": "Koha refused this transaction."})
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
    status = "unknown" if request_unknown else "completed"
    result = {"items": outcomes}
    store_result(db, row, status=status, result=result)
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.checkout",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={
                "request_id": str(request_id),
                "patron_id": patron_id,
                "items": [{"item_id": line["item_id"], "outcome": line["outcome"]} for line in outcomes if line["outcome"] != "unsent"],
            },
        ),
    )
    db.commit()
    return replay_response(row)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_checkout.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_checkout.py apps/api/tests/unit/test_circulation_checkout.py
git commit -F <msgfile>
```

Message: `Implement circulation checkout batch with replay.`

---

### Task 6: Check-in with optional confirmation capability

**Files:**
- Create: `apps/api/app/services/circulation_checkin.py`
- Create: `apps/api/tests/unit/test_circulation_checkin.py`
- Test: `apps/api/tests/unit/test_circulation_checkin.py`

**Interfaces:**
- Consumes: `begin_request`, `store_result`, `get_circulation_capabilities`, `item_by_barcode` / item load by id, `unsupported_write`
- Produces: `submit_checkin(db, client, user_id, *, request_id, item_id: int, confirm: bool) -> dict`

- [ ] **Step 1: Write the failing test**

```python
import uuid

import pytest

from app.integrations.koha.circulation import CirculationCapabilities, WriteCapability
from app.services.circulation_checkin import CirculationConfirmation, submit_checkin


class CheckinClient:
    def __init__(self, need_confirm: bool) -> None:
        self.need_confirm = need_confirm
        self.confirm_sent = False

    def get_item(self, item_id: int) -> dict:
        return {"item_id": item_id, "biblio_id": 1, "external_id": "X1", "home_library_id": "CPL", "holding_library_id": "CPL", "itype": "BK"}

    def post_checkin(self, item_id: int, *, confirm: bool) -> dict:
        self.confirm_sent = confirm
        if self.need_confirm and not confirm:
            raise CirculationConfirmation("Please confirm")
        return {"item_id": item_id, "title": "Title"}


# CirculationConfirmation is defined in circulation_checkin.py. The client raises that type.


def test_checkin_confirmation_only_when_capability_set(monkeypatch, db):
    caps_off = CirculationCapabilities(
        checkin=WriteCapability("POST", "/checkins"),
        checkin_confirmation=False,
    )
    monkeypatch.setattr("app.services.circulation_checkin.get_circulation_capabilities", lambda: caps_off)
    client = CheckinClient(need_confirm=True)
    with pytest.raises(Exception):
        submit_checkin(db, client, None, request_id=uuid.uuid4(), item_id=9, confirm=False)
    assert client.confirm_sent is False
    caps_on = CirculationCapabilities(
        checkin=WriteCapability("POST", "/checkins"),
        checkin_confirmation=True,
    )
    monkeypatch.setattr("app.services.circulation_checkin.get_circulation_capabilities", lambda: caps_on)
    client2 = CheckinClient(need_confirm=True)
    result = submit_checkin(db, client2, None, request_id=uuid.uuid4(), item_id=9, confirm=True)
    assert client2.confirm_sent is True
    assert result["item_id"] == 9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_checkin.py::test_checkin_confirmation_only_when_capability_set -v`

Expected: FAIL.

- [ ] **Step 3: Implement check-in service**

Create `apps/api/app/services/circulation_checkin.py`:

```python
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.integrations.koha.circulation import get_circulation_capabilities
from app.integrations.koha.exceptions import KohaError, KohaTimeoutError
from app.models.identity import AuditLog
from app.services.circulation_errors import CirculationError, unsupported_write
from app.services.circulation_requests import begin_request, replay_response, store_result


class CirculationConfirmation(Exception):
    pass


def submit_checkin(
    db: Session,
    client,
    user_id: uuid.UUID | None,
    *,
    request_id: uuid.UUID,
    item_id: int,
    confirm: bool,
) -> dict:
    if item_id < 1:
        raise CirculationError(422, "validation_error", "That request is not valid.")
    caps = get_circulation_capabilities()
    if caps.checkin is None:
        raise unsupported_write()
    try:
        client.get_item(item_id)
    except Exception:
        raise CirculationError(404, "not_found", "That item was not found.") from None
    row = begin_request(
        db,
        request_id=request_id,
        user_id=user_id,
        action="checkin",
        patron_id=None,
    )
    if row.status == "completed":
        return replay_response(row)
    db.commit()
    send_confirm = bool(caps.checkin_confirmation and confirm)
    try:
        answer = client.post_checkin(item_id, confirm=send_confirm)
    except CirculationConfirmation as exc:
        if caps.checkin_confirmation and not confirm:
            store_result(
                db,
                row,
                status="completed",
                result={"outcome": "confirmation_required", "item_id": item_id, "message": str(exc)},
            )
            _audit(db, user_id, request_id, item_id, "confirmation_required")
            db.commit()
            raise CirculationError(
                409,
                "circulation_confirmation",
                str(exc),
                request_id=str(request_id),
            ) from exc
        store_result(
            db,
            row,
            status="completed",
            result={"outcome": "refused", "item_id": item_id, "message": "Koha refused this transaction."},
        )
        _audit(db, user_id, request_id, item_id, "refused")
        db.commit()
        raise CirculationError(409, "circulation_refused", "Koha refused this transaction.") from exc
    except (KohaTimeoutError, KohaError) as exc:
        outcome = "unknown" if isinstance(exc, KohaTimeoutError) else "refused"
        status = "unknown" if outcome == "unknown" else "completed"
        message = (
            "The outcome is unknown. Verify before trying again."
            if outcome == "unknown"
            else "Koha refused this transaction."
        )
        store_result(db, row, status=status, result={"outcome": outcome, "item_id": item_id, "message": message})
        _audit(db, user_id, request_id, item_id, outcome)
        db.commit()
        code = "circulation_timeout" if outcome == "unknown" else "circulation_refused"
        status_code = 504 if outcome == "unknown" else 409
        raise CirculationError(status_code, code, message, request_id=str(request_id)) from exc
    patron = answer.get("patron") if isinstance(answer, dict) else None
    result = {
        "item_id": item_id,
        "title": answer.get("title") if isinstance(answer, dict) else None,
        "author": answer.get("author") if isinstance(answer, dict) else None,
        "previous_due_date": answer.get("previous_due_date") if isinstance(answer, dict) else None,
        "returned_date": answer.get("returned_date") if isinstance(answer, dict) else None,
        "charge_text": answer.get("charge_text") if isinstance(answer, dict) else None,
        "patron": patron if isinstance(patron, dict) else None,
        "outcome": "confirmed",
    }
    if isinstance(answer, dict) and answer.get("patron_id") is not None:
        row.patron_id = answer.get("patron_id")
    store_result(db, row, status="completed", result=result)
    _audit(db, user_id, request_id, item_id, "confirmed")
    db.commit()
    return replay_response(row)


def _audit(db: Session, user_id, request_id, item_id: int, outcome: str) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.checkin",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={"request_id": str(request_id), "item_id": item_id, "outcome": outcome},
        )
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_checkin.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_checkin.py apps/api/tests/unit/test_circulation_checkin.py
git commit -F <msgfile>
```

Message: `Add circulation check-in with gated confirmation.`

---

### Task 7: Renewal preview, renew, verify

**Files:**
- Create: `apps/api/app/services/circulation_renew.py`
- Create: `apps/api/tests/unit/test_circulation_renew.py`
- Test: `apps/api/tests/unit/test_circulation_renew.py`

**Interfaces:**
- Consumes: `list_checkouts`, `begin_request`, `store_result`, loan row shaping helpers, `get_circulation_capabilities`
- Produces: `renewal_preview(client, *, barcode: str | None, checkout_id: int | None) -> dict`, `submit_renewal(db, client, user_id, *, request_id, checkout_id: int) -> dict`, `verify_request(db, client, row: CirculationRequest) -> dict`

- [ ] **Step 1: Write the failing test**

```python
from app.integrations.koha.circulation import CirculationCapabilities
from app.services.circulation_renew import renewal_preview


def test_preview_unrecorded_when_capability_unset(monkeypatch):
    monkeypatch.setattr(
        "app.services.circulation_renew.get_circulation_capabilities",
        lambda: CirculationCapabilities(loans_scope="patron"),
    )

    class Client:
        def list_checkouts(self, patron_id: int):
            return [{"checkout_id": 1, "item_id": 2, "due_date": "2026-12-01", "patron_id": patron_id}]

        def search_items(self, params: dict):
            return [{"item_id": 2, "biblio_id": 1}]

    payload = renewal_preview(Client(), barcode="B1")
    assert payload["renewal"] == {"status": "unrecorded"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_renew.py::test_preview_unrecorded_when_capability_unset -v`

Expected: FAIL.

- [ ] **Step 3: Implement renew service**

Create `apps/api/app/services/circulation_renew.py` with `renewal_preview`, `submit_renewal`, and `verify_request`.

`renewal_preview` finds the open loan. A barcode uses `client.search_items` for one exact item, then scans `client.list_checkouts` only when the item row includes `patron_id`. A `checkout_id` uses `client.get_checkout` when `single_loan` is set, otherwise raises `CirculationError(404, "not_found", "No current loan matches that barcode.")` for a barcode miss and `CirculationError(404, "not_found", "That loan was not found.")` for a missing checkout. When `renewal_preview` capability is `None`, `renewal` is `{"status": "unrecorded"}`. When it is set, call `client.allows_renewal(checkout_id)` and set `renewal` to `{"status": "known", "allowed": bool, "message": str | None}`.

`submit_renewal` loads the loan before inserting a row. An unknown loan is `404` `not_found` with “That loan was not found.” and no row. It stores `previous_due_date`, commits, then calls `client.post_renew(checkout_id)`. Success stores `completed` and returns the new `due_date` from Koha. `KohaTimeoutError` stores `unknown` and raises `CirculationError(504, "circulation_timeout", "The outcome is unknown. Verify before trying again.")`. Other `KohaError` stores `completed` / `refused` and raises `409` `circulation_refused`. Write `circulation.renew` audit with `request_id`, `checkout_id`, and `outcome` only.

`verify_request(db, client, row)` does not post a write.

- `renew`: read `client.get_checkout(checkout_id)`. A different `due_date` from `previous_due_date` becomes `confirmed`. The same due date becomes `not_applied`. Store `completed`.
- `checkout`: `client.list_checkouts(patron_id)`. Each `unknown` item present in that list becomes `confirmed` with that loan’s `checkout_id` and `due_date`. An `unknown` item absent from the list becomes `not_applied`. Leave `confirmed`, `refused`, and `unsent` unchanged.
- `checkin`: when `row.patron_id` is null, raise `unsupported_write()` and leave the row `unknown`. Otherwise list that patron’s checkouts. The item still on loan becomes `not_applied`. The item absent from the open loans becomes `confirmed`.

A verify that changes an outcome writes `circulation.verify` with the same detail shape as the action it resolved. A read timeout leaves the row `unknown` and raises `504`. Any other read failure leaves it `unknown` and raises `503` `circulation_unavailable` with “Circulation is unavailable. Try again.”

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_renew.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_renew.py apps/api/tests/unit/test_circulation_renew.py
git commit -F <msgfile>
```

Message: `Add renewal preview, submit, and verify.`

---

### Task 8: Patron-scoped loans and unsupported history

**Files:**
- Create: `apps/api/app/services/circulation_loans.py`
- Create: `apps/api/tests/unit/test_circulation_loans.py`
- Test: `apps/api/tests/unit/test_circulation_loans.py`

**Interfaces:**
- Consumes: `list_checkouts`, `is_overdue` from `app.services.patrons`, `get_circulation_capabilities`, `unsupported_write`
- Produces: `list_loans(client, *, patron_id: int, q: str, overdue: bool | None, page: int, per_page: int, sort: str, direction: str, include_barcode: bool) -> dict`, `get_loan(client, checkout_id: int, *, include_barcode: bool) -> dict`, `list_history(...) -> never` raises `unsupported_write()`

- [ ] **Step 1: Write the failing test**

```python
from datetime import date

from app.services.circulation_loans import list_loans


def test_loans_require_patron_and_null_overdue_when_no_due_date(monkeypatch):
    today = date(2026, 11, 20)

    class Client:
        def list_checkouts(self, patron_id: int):
            return [
                {"checkout_id": 1, "item_id": 2, "due_date": None, "patron_id": patron_id},
                {"checkout_id": 2, "item_id": 3, "due_date": "2026-11-10", "patron_id": patron_id},
            ]

    result = list_loans(
        Client(),
        patron_id=5,
        q="",
        overdue=None,
        page=1,
        per_page=20,
        sort="due_date",
        direction="asc",
        include_barcode=False,
        today=today,
    )
    assert result["items"][0]["overdue"] is None
    assert result["items"][1]["overdue"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_loans.py::test_loans_require_patron_and_null_overdue_when_no_due_date -v`

Expected: FAIL.

- [ ] **Step 3: Implement loans list**

Create `apps/api/app/services/circulation_loans.py`:

```python
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.integrations.koha.circulation import get_circulation_capabilities
from app.services.circulation_errors import unsupported_write, _INVALID_SEARCH
from app.services.patrons import is_overdue


def manila_today() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def list_loans(
    client,
    *,
    patron_id: int,
    q: str,
    overdue: bool | None,
    page: int,
    per_page: int,
    sort: str,
    direction: str,
    include_barcode: bool,
    today: date | None = None,
) -> dict:
    if patron_id < 1 or page < 1 or page > 10000 or per_page < 1 or per_page > 20:
        raise _INVALID_SEARCH
    if get_circulation_capabilities().loans_scope != "patron":
        raise _INVALID_SEARCH
    rows = client.list_checkouts(patron_id)
    filtered = _filter_loan_rows(rows, q)
    if overdue is True:
        filtered = [row for row in filtered if _row_overdue(row, today or manila_today())]
    elif overdue is False:
        filtered = [row for row in filtered if not _row_overdue(row, today or manila_today())]
    sorted_rows = _sort_loans(filtered, sort, direction)
    start = (page - 1) * per_page
    page_rows = sorted_rows[start : start + per_page]
    items = [_loan_item(row, include_barcode=include_barcode, today=today or manila_today()) for row in page_rows]
    return {
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": len(sorted_rows),
        "has_next": start + per_page < len(sorted_rows),
    }


def list_history(client, **kwargs) -> dict:
    raise unsupported_write()


def get_loan(client, checkout_id: int, *, include_barcode: bool) -> dict:
    if get_circulation_capabilities().single_loan is None:
        raise unsupported_write()
    row = client.get_checkout(checkout_id)
    return _loan_item(row, include_barcode=include_barcode, today=manila_today())


def _title(row: dict):
    item = row.get("item")
    if isinstance(item, dict):
        biblio = item.get("biblio")
        if isinstance(biblio, dict) and biblio.get("title"):
            return biblio.get("title")
    biblio = row.get("biblio")
    if isinstance(biblio, dict):
        return biblio.get("title")
    return row.get("title")


def _loan_item(row: dict, *, include_barcode: bool, today: date) -> dict:
    due = row.get("due_date")
    overdue = None if not due else is_overdue(str(due), row.get("checkin_date"), today)
    item = {
        "checkout_id": row.get("checkout_id"),
        "item_id": row.get("item_id"),
        "patron_id": row.get("patron_id"),
        "patron_name": None,
        "cardnumber": None,
        "title": _title(row),
        "author": None,
        "call_number": None,
        "item_type_id": None,
        "item_type_label": None,
        "library_id": None,
        "library_name": None,
        "checkout_date": row.get("checkout_date"),
        "due_date": due,
        "renewals_count": row.get("renewals_count"),
        "overdue": overdue,
    }
    if include_barcode and "external_id" in row:
        item["external_id"] = row.get("external_id")
    return item


def _filter_loan_rows(rows: list[dict], q: str) -> list[dict]:
    text = q.strip().casefold()
    if not text:
        return rows
    matched = []
    for row in rows:
        title = str(_title(row) or "").casefold()
        barcode = str(row.get("external_id") or "").casefold()
        if text in title or text in barcode:
            matched.append(row)
    return matched


def _sort_loans(rows: list[dict], sort: str, direction: str) -> list[dict]:
    reverse = direction == "desc"

    def key(row: dict) -> tuple:
        if sort == "title":
            return (str(_title(row) or ""),)
        if sort == "checkout_date":
            return (str(row.get("checkout_date") or ""),)
        due = row.get("due_date")
        return (0, "") if not due else (1, str(due)[:10])

    return sorted(rows, key=key, reverse=reverse)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/unit/test_circulation_loans.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/circulation_loans.py apps/api/tests/unit/test_circulation_loans.py
git commit -F <msgfile>
```

Message: `Add patron-scoped loans and block history.`

---

### Task 9: FastAPI routes, CSRF, permission dependency, router include

**Files:**
- Create: `apps/api/app/api/routes/circulation.py`
- Modify: `apps/api/app/api/dependencies/session.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/api/test_circulation_http.py`
- Test: `apps/api/tests/api/test_circulation_http.py`

**Interfaces:**
- Consumes: all circulation services; `require_circulation_permission(code: str)`; `assert_csrf`; `add_user`, `csrf_headers`, `_login` from `tests/api/test_auth.py`
- Produces: `router` with `prefix="/circulation"`; route handlers `capabilities`, `patron_by_card_route`, `patron_detail`, `item_by_barcode_route`, `loans_list`, `history_list`, `renewal_preview_route`, `checkout`, `checkin`, `renew`, `verify_request`; static paths registered before `/{id}` patterns

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_circulation_http.py`:

```python
import httpx
import pytest

from app.integrations.koha.client import KohaClient
from tests.api.test_auth import PASSWORD, add_user, csrf_headers


def _login(client, username: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200


def _patch_koha(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    monkeypatch.setattr(
        "app.api.routes.circulation.KohaClient",
        lambda settings: KohaClient(settings, transport=httpx.MockTransport(handler)),
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    return httpx.Response(404)


def test_capabilities_require_session(auth_client):
    response = auth_client.get("/api/v1/circulation/capabilities")
    assert response.status_code == 401


def test_checkout_write_requires_csrf_and_permission(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-view-only",
        email="circ-view-only@usant.edu.ph",
        display_name="Circ View",
        password=PASSWORD,
        role_name="Auditor",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-view-only")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={"request_id": "00000000-0000-0000-0000-000000000001", "patron_id": 1, "item_ids": [1]},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"
```

Add second test: librarian with `circulation.view` only (strip write perms in test DB) gets `permission_denied` on POST; librarian with write gets `501 circulation_unsupported` when capability unset.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; python -m pytest tests/api/test_circulation_http.py::test_capabilities_require_session -v`

Expected: FAIL with 404 route not found.

- [ ] **Step 3: Add dependency, routes, wire app**

Append to `session.py`:

```python
_CIRCULATION_PERMISSION_DENIED = HTTPException(
    status_code=403,
    detail={
        "code": "permission_denied",
        "message": "You do not have permission for this action.",
    },
)


def require_circulation_permission(
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
            raise _CIRCULATION_PERMISSION_DENIED
        return payload, session_row

    return _dependency
```

Create `circulation.py` router mapping all spec routes, `_assert_write_csrf` mirroring patrons, `_raise_circulation` for `CirculationError`. Include router in `main.py` and export in `__init__.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api; python -m pytest tests/api/test_circulation_http.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/api/routes/circulation.py apps/api/app/api/dependencies/session.py apps/api/app/api/routes/__init__.py apps/api/app/main.py apps/api/tests/api/test_circulation_http.py
git commit -F <msgfile>
```

Message: `Expose circulation API with session, CSRF, and permissions.`

---

### Task 10: Web scan, tab query, queue limit, print payload tests and modules

**Files:**
- Create: `apps/web/lib/circulation/types.ts`
- Create: `apps/web/lib/circulation/search-params.ts`
- Create: `apps/web/lib/circulation/scan.ts`
- Create: `apps/web/lib/circulation/print.ts`
- Create: `apps/web/lib/circulation/search-params.test.ts`
- Create: `apps/web/lib/circulation/scan.test.ts`
- Create: `apps/web/lib/circulation/print.test.ts`
- Modify: `apps/web/package.json` (`test` script)
- Test: `apps/web/lib/circulation/*.test.ts`

**Interfaces:**
- Produces: `parseCirculationTab(params: URLSearchParams): CirculationTab`, `submitScanValue(value: string): { ok: true; value: string } | { ok: false; message: string }`, `pushQueue(queue: string[], value: string, limit?: number): { queue: string[]; error?: string }`, `buildPrintPayload(input: PrintInput): string`

- [ ] **Step 1: Write the failing tests**

`search-params.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { parseCirculationTab } from "./search-params.ts";

test("tab defaults to checkout and rejects unknown values", () => {
  assert.equal(parseCirculationTab(new URLSearchParams("tab=renew")), "renew");
  assert.equal(parseCirculationTab(new URLSearchParams("tab=nope")), "checkout");
});
```

`scan.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { pushQueue, submitScanValue } from "./scan.ts";

test("empty scan does nothing and control chars are invalid", () => {
  assert.deepEqual(submitScanValue(""), { ok: false, message: "" });
  assert.equal(submitScanValue("a\u0001")?.ok, false);
});

test("queue stops at twenty", () => {
  const start = Array.from({ length: 20 }, (_, i) => `B${i}`);
  const next = pushQueue(start, "B20");
  assert.equal(next.error, "The scan queue is full.");
});
```

`print.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { buildPrintPayload } from "./print.ts";

test("print includes confirmed lines only", () => {
  const text = buildPrintPayload({
    type: "checkout",
    patronName: "Ada Cruz",
    cardnumber: "C1",
    confirmedAt: "2026-11-20T10:00:00",
    lines: [
      { outcome: "confirmed", title: "Book", dueDate: "2026-12-01", checkoutId: 9 },
      { outcome: "refused", title: "Other" },
    ],
  });
  assert.match(text, /Book/);
  assert.doesNotMatch(text, /Other/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web; node --test lib/circulation/search-params.test.ts`

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement modules and package script**

Implement the four `lib/circulation/*.ts` files per spec messages. Update `package.json`:

```json
"test": "node --test lib/catalog/*.test.ts lib/patrons/*.test.ts lib/circulation/*.test.ts"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web; node --test lib/circulation/scan.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/circulation apps/web/package.json
git commit -F <msgfile>
```

Message: `Add circulation desk client helpers and tests.`

---

### Task 11: Desk UI wired to the API

**Files:**
- Create: `apps/web/components/circulation/circulation-desk.tsx`
- Create: `apps/web/components/circulation/checkout-panel.tsx`
- Create: `apps/web/components/circulation/checkin-panel.tsx`
- Create: `apps/web/components/circulation/renew-panel.tsx`
- Create: `apps/web/components/circulation/loans-panel.tsx`
- Create: `apps/web/components/circulation/history-panel.tsx`
- Create: `apps/web/components/circulation/result-panel.tsx`
- Modify: `apps/web/app/(app)/circulation/page.tsx`

**Interfaces:**
- Consumes: `/api/v1/circulation/*` via fetch; `displayName`, `formatPeso`, patron status badges from `@/lib/patrons/display`; circulation lib helpers
- Produces: `CirculationDesk` default export; tab panels with scan fields, inactive submits when permission missing, confirm dialog for checkout warnings, `sessionStorage` key `circulation-mute`, print region id `circulation-print`

- [ ] **Step 1: Manual browser checklist (no automated test runner for components)**

Verify in browser after implementation: five tabs, scan vs search, permission-inactive copy `You do not have permission for this action.`, result column placeholder `Koha's confirmation will appear here`.

- [ ] **Step 2: Implement desk shell**

`circulation-desk.tsx` structure:

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { parseCirculationTab } from "@/lib/circulation/search-params";

import { CheckoutPanel } from "./checkout-panel";
import { CheckinPanel } from "./checkin-panel";
import { HistoryPanel } from "./history-panel";
import { LoansPanel } from "./loans-panel";
import { RenewPanel } from "./renew-panel";
import { ResultPanel } from "./result-panel";

const TABS = ["checkout", "checkin", "renew", "loans", "history"] as const;

export function CirculationDesk({ permissions }: { permissions: string[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = parseCirculationTab(searchParams);
  const [result, setResult] = useState<unknown>(null);

  const setTab = useCallback(
    (next: (typeof TABS)[number]) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <nav className="flex flex-wrap gap-2">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              className={name === tab ? "btn-primary" : "btn-ghost"}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        {tab === "checkout" && (
          <CheckoutPanel permissions={permissions} onResult={setResult} />
        )}
        {tab === "checkin" && (
          <CheckinPanel permissions={permissions} onResult={setResult} />
        )}
        {tab === "renew" && <RenewPanel permissions={permissions} onResult={setResult} />}
        {tab === "loans" && <LoansPanel permissions={permissions} />}
        {tab === "history" && <HistoryPanel permissions={permissions} />}
      </div>
      <ResultPanel result={result} />
    </div>
  );
}
```

`checkout-panel.tsx` key handler:

```tsx
async function confirmCheckout() {
  if (!canCheckout || !patron || items.length === 0 || submitting) {
    return;
  }
  setSubmitting(true);
  try {
    const response = await fetch("/api/v1/circulation/checkouts", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({
        request_id: crypto.randomUUID(),
        patron_id: patron.patron_id,
        item_ids: items.map((row) => row.item_id),
      }),
    });
    const body = await response.json();
    onResult(body);
    playTone(body, muted);
  } finally {
    setSubmitting(false);
  }
}
```

Wire remaining panels to their endpoints; history panel renders unavailable when `capabilities.history` is false.

- [ ] **Step 3: Update page gate**

```tsx
import { CirculationDesk } from "@/components/circulation/circulation-desk";
import { AccessDenied } from "@/components/layout/module-frame";
import { gatePage } from "@/lib/auth/session";

export default async function CirculationPage() {
  const gate = await gatePage("circulation.view");
  if (gate.denied) {
    return <AccessDenied roleName={gate.roleName} />;
  }
  return <CirculationDesk permissions={gate.me.permissions} />;
}
```

`ModuleFrame` does not accept children. `CirculationDesk` renders it:

```tsx
<ModuleFrame
  eyebrow="Library"
  title="Circulation desk"
  description="Koha confirms every checkout, check-in, and renewal."
  hideModuleSentence
/>
```

Tab buttons use `Button` from `@/components/ui/button` with `variant={name === tab ? "default" : "outline"}`. Labels are Checkout, Check-in, Renew, Current loans, and History.

`checkin-panel.tsx` resolves `GET /api/v1/circulation/items/by-barcode`, then `POST /api/v1/circulation/checkins` with a new `request_id`. A lookup 404 is shown and no write is sent. `history-panel.tsx` reads `GET /api/v1/circulation/capabilities` and, when `history` is false, shows the message “This Koha operation is not available.” `renew-panel.tsx` loads `GET /renewals/preview` before `POST /renewals`. Checkout warnings (Expired, Restricted, Card lost, balance greater than zero, item status other than available) open one confirm dialog before `POST /checkouts`. Mute uses `sessionStorage` key `circulation-mute`. Print uses the element `circulation-print` and includes confirmed lines only.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web; npm run typecheck`

Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/components/circulation apps/web/app/(app)/circulation/page.tsx
git commit -F <msgfile>
```

Message: `Build circulation desk UI with five tabs.`

---

### Task 12: koha-integration.md

**Files:**
- Modify: `docs/koha-integration.md`

**Interfaces:**
- Consumes: `get_circulation_capabilities()`, output of `python -m app.scripts.koha_circulation_capabilities` when host is available
- Produces: documentation section **Circulation** stating browser calls only `/api/v1/circulation/*`, loans read uses `GET /patrons/{patron_id}/checkouts`, writes stay unsupported until capability table paths are recorded from host OpenAPI

- [ ] **Step 1: Add failing doc check (manual)**

Read `docs/koha-integration.md` and confirm there is no **Circulation** section.

- [ ] **Step 2: Append Circulation section**

Add after **Patrons**:

```markdown
## Circulation

Circulation transactions stay in Koha. ULMS stores `circulation_requests` and audit rows only. It does not copy open loans into PostgreSQL.

The browser calls ULMS only under `/api/v1/circulation` for capabilities, patron and item lookups, checkout, check-in, renewal, verify, patron-scoped current loans, and history when that capability is recorded. The API server uses the Koha staff REST API entries recorded in `apps/api/app/integrations/koha/circulation.py`.

Current loans use `GET /patrons/{patron_id}/checkouts` with `x-koha-embed: item.biblio` until a global checkout list is recorded from the host OpenAPI document. Checkout, check-in, renewal, history, single-loan reads, and renewal preview writes remain **unsupported in code** until a maintainer runs:

```bash
cd apps/api
python -m app.scripts.koha_circulation_capabilities
```

and copies the printed `METHOD path` lines into this document and into the capability table. Do not guess paths when the host cannot be read.

ULMS never sends a Koha override header. Due dates and fines come only from Koha responses.
```

- [ ] **Step 3: Verify plan constraint**

Confirm the section does not invent concrete write paths.

- [ ] **Step 4: Commit**

```powershell
git add docs/koha-integration.md
git commit -F <msgfile>
```

Message: `Document Koha circulation capability recording.`

---

## Self-review

**Spec coverage:** Permissions, request locking, lookups, checkout batch, check-in confirmation gate, renewal preview/submit/verify, patron-scoped loans, unsupported history/single-loan, capabilities endpoint, desk UI, audit, errors, CSRF, barcode stripping, and docs each map to Tasks 1–12.

**Placeholder scan:** Tasks 6, 7, 8, and 11 now include the check-in service, `verify_request` for checkout, check-in, and renewal, the loan row helpers, and the desk page shell. `ModuleFrame` is not given children.

**Type consistency:** `request_id` is a UUID string in JSON. `CirculationRequest.id` is a UUID. `verify_request` is the only verify function. `gate.me.permissions` is the permission list passed to `CirculationDesk`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-11-20-circulation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task with review between tasks.

**2. Inline Execution** — run tasks in one session using superpowers:executing-plans with checkpoints.

Which approach?