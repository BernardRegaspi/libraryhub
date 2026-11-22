# Inventory scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff with `inventory.view` create a draft for one Koha home library, start it, and record continuous barcode scans without changing Koha.

**Architecture:** The browser posts one barcode at a time to `/api/v1/inventory`. The inventory service classifies the live Koha item, stores the scan in PostgreSQL, and returns counters. The existing Koha client performs the HTTP calls. Expected items are a count, not a copied catalog.

**Tech Stack:** FastAPI, HTTPX, Pydantic, SQLAlchemy, Alembic, pytest, Next.js 16, TanStack Query, shadcn Input, Select, Button, Dialog, and Skeleton, node:test.

**Spec:** `docs/superpowers/specs/2026-11-21-inventory-scanning-design.md`

## Global Constraints

- Koha remains the item authority. This slice does not write Koha items and does not copy expected item rows into PostgreSQL.
- `inventory.view` is the only permission. Do not seed `inventory.manage`. Student and Auditor stay without `inventory.view`.
- A session stores the active ULMS department. That department does not filter items. Do not set `library_departments.koha_branchcode`.
- Scope is `home_library_id` plus optional exact, case-sensitive `location`. No call-number range and no collection filter.
- Misplaced only when a location was selected, the home library matches, and the item location is blank or different.
- Place is decided before `item_status`. In-scope mapping: withdrawn, lost as `other_exception`, damaged, not for loan as `other_exception`, checked out as `other_exception`, in transit as `other_exception`, available as `verified`.
- `expected_count` comes from `X-Total-Count` at create time and is not refreshed. Zero is allowed.
- A barcode already stored for the session is `duplicate` and does not call Koha. The same `client_scan_id` returns the stored row and writes no second audit row.
- States are `draft`, `in_progress`, and `cancelled`. Name, library, and location do not change after create. Do not delete sessions or scans.
- Counters are derived. `seen` is primary `verified`, `withdrawn`, `damaged`, and `other_exception`. `needs_a_look` is every primary row except `verified`. `remaining` is `expected_count - seen`, never below zero.
- Error sentences: “Koha could not count items. Try again.” “Koha could not look up this barcode. The scan was not saved.” “Koha could not load libraries. Try again.” “Koha took too long to count items. Try again.” “Koha took too long to look up this barcode. The scan was not saved.” “Koha did not return an item count. The session was not created.” “Koha returned an item record this scan cannot use. The scan was not saved.” “Choose a department before creating a session.” “Choose a department.” “That inventory session was not found.” “Only a draft session can be started.” “This session is already cancelled.” “Start the session before scanning.” “This session is cancelled.” “That search is not valid.” “You do not have access to inventory.”
- Scan messages: “No Koha item has this barcode.” “Home library is not on this Koha item.” “Home library is {shown}, not {expected}.” “Shelving location is {shown}, not {session location}.” “Koha marks this item withdrawn.” “Koha status: Lost.” “Koha marks this item damaged.” “Koha status: Not for loan.” “Koha status: Checked out.” “Koha status: In transit.” “On this shelf.” “In this library.” “Already scanned as {label}.”
- Page copy: title “Inventory”. Description “Scan a Koha library, or one shelving location, and keep a record of each barcode.” Empty list “No inventory sessions for this department.” Empty scans “No scans yet.” Zero count “Koha returned no items for this library and location. You can still start and record unexpected barcodes.” Scanner hint “Set the scanner suffix to Enter.” Location hint “Leave blank for the whole library. The code must match Koha exactly.”
- The browser never calls Koha. Logs omit the barcode, the query string, the Authorization header, and the token.
- Pytest uses `httpx.MockTransport` or a fake client object and does not open a socket to Koha.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains that trailer, replace the commit with `git commit-tree` as required by `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261121_0005_inventory_sessions.py` | Sessions, scans, sequence, indexes |
| `apps/api/alembic/env.py` | Import the inventory model |
| `apps/api/app/models/inventory.py` | `InventorySession`, `InventoryScan` |
| `apps/api/app/services/inventory_classify.py` | Place, condition, labels, duplicate message |
| `apps/api/app/services/inventory_counters.py` | Derived counters |
| `apps/api/app/integrations/koha/client.py` | Count and barcode lookup |
| `apps/api/app/services/inventory.py` | Create, list, get, start, cancel, scan, audit |
| `apps/api/app/schemas/inventory.py` | Search and write models |
| `apps/api/app/api/dependencies/session.py` | `inventory.view` dependency |
| `apps/api/app/api/routes/inventory.py` | `/api/v1/inventory` |
| `apps/api/app/api/routes/__init__.py` | Export the router |
| `apps/api/app/main.py` | Include the router |
| `apps/web/lib/inventory/queue.ts` | Device queue |
| `apps/web/lib/inventory/queue.test.ts` | Queue unit test |
| `apps/web/lib/inventory/types.ts` | Response types |
| `apps/web/lib/inventory/search-params.ts` | List URL state |
| `apps/web/components/inventory/session-list.tsx` | Session directory |
| `apps/web/components/inventory/session-form.tsx` | Create form |
| `apps/web/components/inventory/session-view.tsx` | Draft, scanner, cancelled summary |
| `apps/web/app/(app)/inventory/page.tsx` | List gate |
| `apps/web/app/(app)/inventory/new/page.tsx` | Create gate |
| `apps/web/app/(app)/inventory/[sessionId]/page.tsx` | Session gate |
| `apps/web/package.json` | Include the inventory node test |
| `docs/koha-integration.md` | Read-only item calls this module makes |

---

### Task 1: Inventory tables

**Files:**
- Create: `apps/api/alembic/versions/20261121_0005_inventory_sessions.py`
- Create: `apps/api/app/models/inventory.py`
- Modify: `apps/api/alembic/env.py`
- Test: `apps/api/tests/api/test_inventory_schema.py`

**Interfaces:**
- Consumes: revision `20261120_0004`, schema `libraryhub`, `library_departments.id`, `app_users.id`
- Produces: tables `libraryhub.inventory_sessions` and `libraryhub.inventory_scans`, sequence `libraryhub.inventory_session_ref_seq`, models `InventorySession` and `InventoryScan`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_inventory_schema.py`:

```python
from sqlalchemy import text


def test_inventory_tables_and_primary_uniqueness(db):
    names = set(
        db.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'libraryhub'
                  AND table_name IN ('inventory_sessions', 'inventory_scans')
                """
            )
        ).scalars()
    )
    assert names == {"inventory_sessions", "inventory_scans"}
    sequence = db.execute(
        text("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'libraryhub' AND c.relname = 'inventory_session_ref_seq'")
    ).scalar_one_or_none()
    assert sequence == 1
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_schema.py -v`

Expected: FAIL because the tables do not exist. If pytest skips with “PostgreSQL is not reachable”, start Postgres from the repo root with `docker compose up -d postgres` and rerun.

- [ ] **Step 3: Add the migration and models**

`revision` is `20261121_0005`. `down_revision` is `20261120_0004`. `upgrade` creates sequence `libraryhub.inventory_session_ref_seq`, then `inventory_sessions`, then `inventory_scans`. `downgrade` drops the scans table, the sessions table, and the sequence.

`inventory_sessions` columns: `id` UUID PK default `gen_random_uuid()`, `reference` `String(32)` unique not null, `name` `String(120)` not null, `department_id` UUID FK to `libraryhub.library_departments.id` not null, `status` `String(32)` not null, `home_library_id` `String(64)` not null, `home_library_name` `String(255)` null, `location` `String(80)` null, `expected_count` integer not null, `created_by` UUID FK to `libraryhub.app_users.id` not null, `started_by` UUID FK null, `cancelled_by` UUID FK null, `started_at` timestamptz null, `cancelled_at` timestamptz null, `created_at` timestamptz not null server default `now()`, `updated_at` timestamptz not null server default `now()`. Check `status in ('draft', 'in_progress', 'cancelled')`. Check `expected_count >= 0`. Check `char_length(name) between 1 and 120`. Check `location is null or char_length(location) between 1 and 80`. Index `(department_id, created_at)`.

`inventory_scans` columns: `id` UUID PK default `gen_random_uuid()`, `session_id` UUID FK to `libraryhub.inventory_sessions.id` `ON DELETE RESTRICT` not null, `client_scan_id` UUID not null, `barcode` `String(32)` not null, `koha_item_id` integer null, `koha_biblio_id` integer null, `outcome` `String(32)` not null, `is_primary` boolean not null, `primary_scan_id` UUID FK to `libraryhub.inventory_scans.id` null, `message` `Text` not null, snapshot columns `title`, `author`, `call_number`, `item_type_id`, `item_type_label`, `home_library_id`, `home_library_name`, `holding_library_id`, `holding_library_name`, `location`, `koha_status`, `koha_status_label` all nullable strings, `scanned_by` UUID FK to `libraryhub.app_users.id` not null, `scanned_at` timestamptz not null server default `now()`. Check `outcome in ('verified', 'misplaced', 'unexpected', 'not_found', 'duplicate', 'withdrawn', 'damaged', 'other_exception')`. Check `(is_primary = true and primary_scan_id is null) or (is_primary = false and primary_scan_id is not null)`.

Indexes: unique `(session_id, client_scan_id)`, unique `(session_id, koha_item_id)` where `is_primary` and `koha_item_id` is not null, unique `(session_id, barcode)` where `is_primary` and `koha_item_id` is null, plus `(session_id, barcode)` and `(session_id, scanned_at)`.

`apps/api/app/models/inventory.py` maps those columns on `Base` with schema `libraryhub`. In `apps/api/alembic/env.py`, add `import app.models.inventory  # noqa: F401` next to the identity import.

- [ ] **Step 4: Apply and rerun**

From `apps/api`: `py -3 -m alembic upgrade head`, then `py -3 -m pytest tests/api/test_inventory_schema.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/alembic/versions/20261121_0005_inventory_sessions.py apps/api/app/models/inventory.py apps/api/alembic/env.py apps/api/tests/api/test_inventory_schema.py
git commit -F <msgfile>
```

Message: `Add inventory session and scan tables.`

---

### Task 2: Classification

**Files:**
- Create: `apps/api/app/services/inventory_classify.py`
- Test: `apps/api/tests/unit/test_inventory_classify.py`

**Interfaces:**
- Consumes: `item_status` from `app.integrations.koha.availability`
- Produces: `classify_primary(item: dict | None, *, session_library_id: str, session_library_name: str | None, session_location: str | None) -> tuple[str, str]` and `display_label(outcome: str, koha_status_label: str | None) -> str` and `duplicate_message(primary_outcome: str, koha_status_label: str | None) -> str`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_inventory_classify.py`:

```python
from app.services.inventory_classify import classify_primary, display_label, duplicate_message

_AVAILABLE = {
    "withdrawn": 0,
    "lost_status": 0,
    "damaged_status": 0,
    "not_for_loan_status": 0,
    "effective_not_for_loan_status": 0,
    "checked_out_date": None,
    "home_library_id": "CPL",
    "holding_library_id": "CPL",
    "location": "GEN",
}


def test_place_is_decided_before_condition():
    withdrawn = {**_AVAILABLE, "withdrawn": 1, "home_library_id": "UCL", "location": "OTHER"}
    assert classify_primary(
        withdrawn,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    ) == ("unexpected", "Home library is UCL, not College Library.")
    assert classify_primary(
        None,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    ) == ("not_found", "No Koha item has this barcode.")
    assert classify_primary(
        {**_AVAILABLE, "home_library_id": None},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    )[0] == "unexpected"
    misplaced = classify_primary(
        {**_AVAILABLE, "location": ""},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    )
    assert misplaced == ("misplaced", "Shelving location is blank, not GEN.")
    whole = classify_primary(
        {**_AVAILABLE, "holding_library_id": "UCL", "location": "OTHER"},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    )
    assert whole[0] == "other_exception"
    assert "In transit" in whole[1]


def test_in_scope_status_order_and_labels():
    assert classify_primary(
        {**_AVAILABLE, "withdrawn": 1, "lost_status": 1},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    )[0] == "withdrawn"
    assert classify_primary(
        _AVAILABLE,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    ) == ("verified", "On this shelf.")
    assert classify_primary(
        _AVAILABLE,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    ) == ("verified", "In this library.")
    assert display_label("other_exception", "Lost") == "Lost"
    assert display_label("verified", "Available") == "Verified"
    assert duplicate_message("verified", "Available") == "Already scanned as Verified."
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_inventory_classify.py -v`

Expected: FAIL with `ModuleNotFoundError` or `ImportError` for `inventory_classify`.

- [ ] **Step 3: Implement classification**

`classify_primary` returns `("not_found", "No Koha item has this barcode.")` when `item` is `None`. Compare `str(home_library_id).strip()` with `session_library_id.strip()`. A missing or blank home library returns `unexpected` and “Home library is not on this Koha item.” A different home library returns `unexpected` and `Home library is {item home_library_name or the id}, not {session_library_name or the session id}.` When `session_location` is not `None`, compare `str(item location).strip()` with it. A blank or different item location returns `misplaced` and `Shelving location is {location or "blank"}, not {session_location}.` Otherwise call `item_status`. Map `available` to `verified` with “On this shelf.” when `session_location` is set and “In this library.” when it is `None`. Map the other catalog statuses with the sentences in Global Constraints.

`display_label` returns `Verified`, `Misplaced`, `Unexpected`, `Not found`, `Withdrawn`, `Damaged`, or `Duplicate` for those outcomes. For `other_exception` it returns `koha_status_label` when that value is a non-blank string, otherwise `Other exception`. `duplicate_message` returns `Already scanned as {display_label(...)}.`

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_inventory_classify.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/inventory_classify.py apps/api/tests/unit/test_inventory_classify.py
git commit -F <msgfile>
```

Message: `Classify an inventory scan by shelf, then by Koha status.`

---

### Task 3: Counters

**Files:**
- Create: `apps/api/app/services/inventory_counters.py`
- Test: `apps/api/tests/unit/test_inventory_counters.py`

**Interfaces:**
- Consumes: outcome strings from Task 2
- Produces: `summarize_scans(outcomes: list[str], *, expected_count: int) -> dict[str, int]` with keys `expected_count`, `seen`, `verified`, `misplaced`, `unexpected`, `not_found`, `withdrawn`, `damaged`, `other_exception`, `needs_a_look`, `duplicates`, `remaining`

- [ ] **Step 1: Write the failing test**

```python
from app.services.inventory_counters import summarize_scans


def test_duplicates_do_not_increase_verified_and_remaining_floors_at_zero():
    totals = summarize_scans(
        ["verified", "duplicate", "withdrawn", "not_found"],
        expected_count=1,
    )
    assert totals["verified"] == 1
    assert totals["duplicates"] == 1
    assert totals["withdrawn"] == 1
    assert totals["seen"] == 2
    assert totals["needs_a_look"] == 2
    assert totals["remaining"] == 0
    assert totals["not_found"] == 1


def test_zero_expected_count_keeps_remaining_at_zero():
    totals = summarize_scans([], expected_count=0)
    assert totals["expected_count"] == 0
    assert totals["seen"] == 0
    assert totals["remaining"] == 0
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_inventory_counters.py -v`

Expected: FAIL with import error.

- [ ] **Step 3: Implement the counts**

Count each outcome. `duplicates` is the number of `duplicate` values. `seen` is `verified + withdrawn + damaged + other_exception`. `needs_a_look` is the length of the list minus `duplicates` minus `verified`. `remaining` is `max(0, expected_count - seen)`. Include `expected_count` unchanged. An unknown outcome string raises `ValueError`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_inventory_counters.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/inventory_counters.py apps/api/tests/unit/test_inventory_counters.py
git commit -F <msgfile>
```

Message: `Count inventory progress from primary scan rows.`

---

### Task 4: Koha count and barcode lookup

**Files:**
- Modify: `apps/api/app/integrations/koha/client.py`
- Test: `apps/api/tests/unit/test_koha_client.py`

**Interfaces:**
- Consumes: `KohaClient.get_json`
- Produces: `count_items(self, *, home_library_id: str, location: str | None) -> int` and `find_items_by_barcode(self, barcode: str) -> list[dict]`

- [ ] **Step 1: Write the failing test**

Add tests to `apps/api/tests/unit/test_koha_client.py` using the file’s existing `MockTransport` style. `count_items(home_library_id="CPL", location="GEN")` sends `GET` path ending in `/items`, a `q` JSON object containing `home_library_id` `CPL` and `location` `GEN`, and `_per_page` `1`. A header `X-Total-Count: 12` returns `12`. A missing header raises `KohaResponseError`. `find_items_by_barcode("BC-1")` sends `external_id` `BC-1`, `_per_page` `2`, and header `x-koha-embed: biblio`. It returns the list of dict rows.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_koha_client.py -v`

Expected: FAIL because `count_items` does not exist.

- [ ] **Step 3: Add the two methods**

`count_items` calls `get_json("/items", {"q": json.dumps(query), "_per_page": 1})`. `query` is `{"home_library_id": home_library_id}` and, when `location` is not `None`, also `"location": location`. Read `X-Total-Count` or `x-total-count`. Return `int` of that header. If the header is missing or not an integer, raise `KohaResponseError`. Ignore the body for the count.

`find_items_by_barcode` calls `get_json("/items", {"external_id": barcode, "_per_page": 2}, extra_headers={"x-koha-embed": "biblio"})`. If the body is not a list, raise `KohaResponseError`. Return only dict rows. `_per_page` is `2` so the service can see a second row. The catalog barcode search stays at `_per_page` `1`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_koha_client.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/integrations/koha/client.py apps/api/tests/unit/test_koha_client.py
git commit -F <msgfile>
```

Message: `Look up an inventory count and one barcode through the Koha client.`

---

### Task 5: Create a session

**Files:**
- Create: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `count_items`, `library_names`, `InventorySession`, `AuditLog`, `classify` is not used yet
- Produces: `class InventoryError(Exception)` with `status_code`, `code`, `message`, and optional `fields: list[dict] | None`. `create_session(db, client, *, user_id: UUID, department_id: UUID | None, name: str, home_library_id: str, location: str | None) -> dict`

- [ ] **Step 1: Write the failing test**

Put the test in `apps/api/tests/api/test_inventory_service.py` so `from test_auth import add_user` works, the same import `tests/api/test_patrons_http.py` uses. Use the `db` fixture. Call `create_session` with a fake client whose `library_names` returns `{"CPL": "College Library"}` and whose `count_items` returns `4`. Assert the saved row is `draft`, `expected_count` is `4`, `reference` matches `^INV-20[0-9]{2}-[0-9]+$`, `location` is `None` when the input is blank, and one `audit_logs` row has action `inventory.session.create`. The returned dict has `id`, `reference`, `name`, `status`, `home_library_id`, `home_library_name`, `location`, `expected_count`, `started_at`, `cancelled_at`, `created_at`, and `counters`. A fake that raises `KohaTimeoutError` leaves the session count unchanged. A fake whose `count_items` raises `KohaResponseError` leaves the session count unchanged. `department_id=None` raises `InventoryError` with code `department_required` and message “Choose a department before creating a session.” An unknown `home_library_id` raises `validation_error` and writes no row.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py -v`

Expected: FAIL with import error.

- [ ] **Step 3: Implement create**

Trim `name` and reject empty, longer than 120, or any character with `ord(ch) < 32` or `ord(ch) == 127` as `422` `validation_error` field `name`. Trim `location`. Blank becomes `None`. Otherwise apply the same control-character rule and the 80-character limit on field `location`. `department_id is None` raises the create department error from Global Constraints. Load `client.library_names()`. A `KohaError` becomes `503` `inventory_unavailable` with “Koha could not load libraries. Try again.” An id missing from that map is `422` `validation_error` on `home_library_id`. Call `count_items`. `KohaTimeoutError` becomes `504` `inventory_timeout` with “Koha took too long to count items. Try again.” `KohaResponseError` becomes `503` `inventory_count_unavailable` with “Koha did not return an item count. The session was not created.” Any other `KohaError` becomes `503` `inventory_unavailable` with “Koha could not count items. Try again.” On success, `nextval('libraryhub.inventory_session_ref_seq')` and the Asia/Manila year form `INV-{year}-{n:04d}`. Insert `draft`, the library name from the map, and the audit row. Commit. Return `id`, `reference`, `name`, `status`, `home_library_id`, `home_library_name`, `location`, `expected_count`, `started_at` null, `cancelled_at` null, `created_at`, and `counters` from `summarize_scans([], expected_count=stored)`. Datetimes are ISO strings.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/inventory.py apps/api/tests/api/test_inventory_service.py
git commit -F <msgfile>
```

Message: `Create an inventory draft from a Koha item count.`

---

### Task 6: List, get, start, and cancel

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Create: `apps/api/app/schemas/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `create_session`, `summarize_scans`
- Produces: `list_sessions(db, *, department_id: UUID | None, params: SessionListParams) -> dict`, `get_session(db, *, department_id: UUID | None, session_id: UUID) -> dict`, `start_session(db, *, user_id: UUID, department_id: UUID | None, session_id: UUID) -> dict`, `cancel_session(db, *, user_id: UUID, department_id: UUID | None, session_id: UUID) -> dict`. `SessionListParams` fields are `q: str`, `status: str | None`, `page: int`, `per_page: int`, `sort: str`, `direction: str`.

- [ ] **Step 1: Write the failing tests**

Add tests that create two drafts in one department and one draft in another. The list for the first department returns only its rows, newest `created_at` first by default. `q` matches reference or name, case-insensitive, and uses `escape_like` so `%` is literal. `status=draft` keeps drafts. `page=0` raises `InventoryError` `422` `invalid_search` “That search is not valid.” `get_session` for the other department raises `404` `not_found` “That inventory session was not found.” `start_session` sets `in_progress`, `started_at`, `started_by`, and audit action `inventory.session.start`. A second start raises `409` `session_not_draft` “Only a draft session can be started.” `cancel_session` from draft or in progress sets `cancelled`, `cancelled_at`, `cancelled_by`, and audit action `inventory.session.cancel`. A second cancel raises `409` `session_cancelled` “This session is already cancelled.” `department_id=None` on list raises `409` `department_required` “Choose a department.”

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py -v`

Expected: FAIL because `list_sessions` does not exist.

- [ ] **Step 3: Implement the four functions**

Allow `sort` of `created_at`, `reference`, `name`, `status`. Allow `direction` of `asc` or `desc`. `page` is 1 through 10000. `per_page` is 1 through 50. `q` is empty or 1 through 80. `status` is empty or one of the three states. Anything else is `invalid_search`. A missing session or a department mismatch is `not_found`. Start requires `draft`. Cancel rejects `cancelled` and allows `draft` and `in_progress`. Each success commits one audit row. The session dict includes `id`, `reference`, `name`, `status`, `home_library_id`, `home_library_name`, `location`, `expected_count`, `started_at`, `cancelled_at`, `created_at`, and `counters`. Datetimes are ISO strings. The list dict is `items`, `page`, `per_page`, `total`, `has_next`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/inventory.py apps/api/app/schemas/inventory.py apps/api/tests/api/test_inventory_service.py
git commit -F <msgfile>
```

Message: `List, start, and cancel inventory sessions inside one department.`

---

### Task 7: Record a scan

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `find_items_by_barcode`, `item_type_labels`, `library_names`, `classify_primary`, `display_label`, `duplicate_message`, `summarize_scans`, `get_session`
- Produces: `record_scan(db, client, *, user_id: UUID, department_id: UUID | None, session_id: UUID, client_scan_id: UUID, barcode: str) -> dict` with keys `scan` and `counters`. `list_scans(db, *, department_id: UUID | None, session_id: UUID, params: ScanListParams) -> dict`. `ScanListParams` fields are `q: str`, `outcome: str | None`, `page: int`, `per_page: int`, `sort: str`, `direction: str`.

- [ ] **Step 1: Write the failing tests**

Cover these cases with a started session whose library is `CPL` and location is `GEN`, and a second started session with location `None`:

- Barcode `""` or 33 characters raises `422` `validation_error` and the scan count stays 0.
- An empty Koha list inserts `not_found`, `is_primary` true, and audit action `inventory.scan`.
- One available item with `home_library_id` `CPL` and `location` `GEN` inserts `verified` and message “On this shelf.”
- The same barcode again inserts `duplicate`, does not call `find_items_by_barcode` a second time, copies the primary title, and leaves `verified` at 1 while `duplicates` becomes 1.
- Repeating the same `client_scan_id` returns the original scan id and does not add an audit row.
- `KohaTimeoutError` raises `504` `inventory_timeout` “Koha took too long to look up this barcode. The scan was not saved.” and writes no scan.
- Two dicts, or one dict without `item_id`, raises `503` `inventory_ambiguous` “Koha returned an item record this scan cannot use. The scan was not saved.”
- A draft scan raises `409` `session_not_started` “Start the session before scanning.” A cancelled scan raises `409` `session_cancelled` “This session is cancelled.”
- Two primary inserts for one `item_id` (call `record_scan` twice with different barcodes that resolve to the same item, or insert the first and force the unique conflict on the second) leave one primary and one duplicate.
- A withdrawn item whose home library is `UCL` is `unexpected`, and `verified` stays 0.
- `list_scans` for that session returns newest `scanned_at` first. `q` is a case-sensitive contains match on `barcode`. `outcome=verified` keeps verified rows. `sort` other than `scanned_at`, or `page=0`, raises `422` `invalid_search`. A session in another department raises `404` `not_found`.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py -v`

Expected: FAIL because `record_scan` does not exist.

- [ ] **Step 3: Implement `record_scan`**

Trim the barcode. Reject empty, longer than 32, or C0/DEL as `validation_error` on `barcode` before any Koha call. Load the session with the department check. If a row already has this `client_scan_id`, return it and the current counters. If status is `draft` or `cancelled`, raise the Global Constraints errors. If a primary row already has this barcode, insert a duplicate from that primary and return. Otherwise call `find_items_by_barcode`. Map `KohaTimeoutError` and other `KohaError` values, including `KohaNotFound`, to the lookup sentences in Global Constraints. `KohaNotFound` is `inventory_unavailable`, not a saved `not_found`. Zero dicts inserts `not_found`. More than one dict, or a dict whose `item_id` is missing, raises `inventory_ambiguous`. If a primary row exists for that `item_id`, insert a duplicate. Otherwise classify, build the snapshot, and insert the primary inside `db.begin_nested()`. On `IntegrityError`, the nested transaction rolls back and the function inserts the duplicate from the primary row that won. Do not call `db.rollback()` on the request session. Snapshot fields: `title` and `author` from `item["biblio"]` when that value is a dict, `call_number` from `callnumber`, library names from `library_names()`, item type label from `item_type_labels()`. A cache `KohaError` leaves the label null and still saves the scan. `koha_status` and `koha_status_label` come from `item_status`. Commit one `inventory.scan` audit row with `reference`, `barcode`, and `outcome`. The returned `scan` includes `id`, `client_scan_id`, `barcode`, `outcome`, `outcome_label`, `message`, `is_primary`, the snapshot fields, and `scanned_at`. `list_scans` uses the same page bounds as `list_sessions`. `q` is empty or 1 through 32 characters. `outcome` is empty or one of the eight outcome values. `sort` is only `scanned_at`. Default direction is `desc`. The list dict is `items`, `page`, `per_page`, `total`, `has_next`. Each item is the scan object without a nested `counters` key.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py tests/unit/test_inventory_classify.py tests/unit/test_inventory_counters.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/inventory.py apps/api/tests/api/test_inventory_service.py
git commit -F <msgfile>
```

Message: `Record one inventory barcode and keep the first result primary.`

---

### Task 8: Inventory HTTP routes

**Files:**
- Create: `apps/api/app/api/routes/inventory.py`
- Modify: `apps/api/app/schemas/inventory.py`
- Modify: `apps/api/app/api/dependencies/session.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/api/test_inventory_http.py`

**Interfaces:**
- Consumes: `create_session`, `list_sessions`, `get_session`, `start_session`, `cancel_session`, `record_scan`, `assert_csrf`, `KohaClient`
- Produces: router prefix `/inventory`. `require_inventory_user` returns `(CurrentUserOut, UserSession)`.

- [ ] **Step 1: Write the failing route tests**

Create `apps/api/tests/api/test_inventory_http.py` using `auth_client`, `add_user`, `csrf_headers`, and `_patch_koha` aimed at `app.api.routes.inventory.KohaClient`. The handler returns a token for `/oauth/token`, libraries `[{"library_id": "CPL", "name": "College Library"}]` for `/libraries`, and for `/items` either a count header or one item:

```python
{
    "item_id": 9,
    "biblio_id": 3,
    "external_id": "BC-1",
    "home_library_id": "CPL",
    "holding_library_id": "CPL",
    "location": "GEN",
    "callnumber": "QA76",
    "item_type_id": "BK",
    "withdrawn": 0,
    "lost_status": 0,
    "damaged_status": 0,
    "not_for_loan_status": 0,
    "effective_not_for_loan_status": 0,
    "checked_out_date": None,
    "biblio": {"title": "Ada", "author": "Cruz"},
}
```

Assert:

- Librarian `POST /api/v1/inventory/sessions` with CSRF, `name` “Shelf A”, `home_library_id` `CPL`, and `location` `GEN` returns `201`, `status` `draft`, and `expected_count` from `X-Total-Count`.
- The same post without CSRF returns `403` `csrf_failed`.
- Student and Auditor receive `403` `permission_denied` and “You do not have access to inventory.”
- `POST /sessions/{id}/start` then `POST /sessions/{id}/scans` with `client_scan_id` and barcode `BC-1` returns `200`, outcome `verified`, title `Ada`.
- Repeating that `client_scan_id` returns the same scan id.
- A Koha timeout handler on the scan returns `504` and a following `GET` scans list has `total` 0.
- Super Administrator with `active_department_id` null (`add_user` department `None`, the same setup as `test_super_administrator_can_select_all_departments`) receives `409` `department_required` on `GET /api/v1/inventory/sessions`.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_http.py -v`

Expected: FAIL with `404` because the routes are not registered.

- [ ] **Step 3: Add the routes**

`require_inventory_user` copies `require_patron_permission`, checks `inventory.view`, and uses “You do not have access to inventory.” `APIRouter(prefix="/inventory", tags=["inventory"])`. `GET /libraries` is declared before any path that could swallow it. Writes call `assert_csrf` the same way `app/api/routes/patrons.py` does. Map `InventoryError` to `HTTPException` with `detail.fields` only when present. Map an uncaught `KohaTimeoutError` to `504` `inventory_timeout` and other `KohaError` values to `503` `inventory_unavailable` using the count sentence on create and the lookup sentence on scan. `GET /libraries` returns `{"libraries": [{"id": library_id, "name": name}, ...]}` from `client.library_names()`. A `KohaError` there is `503` `inventory_unavailable` with “Koha could not load libraries. Try again.” `GET /sessions` calls `list_sessions`. `GET /sessions/{session_id}` calls `get_session`. `POST /sessions` calls `create_session` and returns `201`. Start, cancel, and scan call `start_session`, `cancel_session`, and `record_scan` and return `200`. `GET /sessions/{session_id}/scans` calls `list_scans`. A non-UUID `session_id` is `404` `not_found`. Export the router from `app/api/routes/__init__.py` and `include_router` it in `create_app` next to the patrons router. Log the path template, status, and duration through the existing client logger. Do not log the barcode.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_http.py tests/api/test_inventory_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/api/routes/inventory.py apps/api/app/schemas/inventory.py apps/api/app/api/dependencies/session.py apps/api/app/api/routes/__init__.py apps/api/app/main.py apps/api/tests/api/test_inventory_http.py
git commit -F <msgfile>
```

Message: `Expose inventory sessions and scans on the staff API.`

---

### Task 9: Device queue

**Files:**
- Create: `apps/web/lib/inventory/queue.ts`
- Create: `apps/web/lib/inventory/queue.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: nothing from the API yet
- Produces: `createScanQueue(): ScanQueue`. `ScanQueue.enqueue(barcode: string): { accepted: boolean, clientScanId: string | null }`. `ScanQueue.markDone(clientScanId: string): void`. `ScanQueue.markFailed(clientScanId: string): void`. `ScanQueue.reconcile(savedIds: string[]): void`. `ScanQueue.snapshot(): { pending: number, failed: { clientScanId: string, barcode: string }[], latestFinishedId: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/inventory/queue.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { createScanQueue } from "./queue.ts";

test("a waiting barcode is ignored and a finished one can scan again", () => {
  const queue = createScanQueue();
  const first = queue.enqueue("BC-1");
  assert.equal(first.accepted, true);
  assert.equal(queue.enqueue("BC-1").accepted, false);
  queue.markDone(first.clientScanId!);
  const again = queue.enqueue("BC-1");
  assert.equal(again.accepted, true);
  assert.notEqual(again.clientScanId, first.clientScanId);
});

test("responses stay on their own id and a reload can save a failure", () => {
  const queue = createScanQueue();
  const slow = queue.enqueue("BC-1");
  const next = queue.enqueue("BC-2");
  queue.markDone(next.clientScanId!);
  assert.equal(queue.snapshot().latestFinishedId, next.clientScanId);
  queue.markFailed(slow.clientScanId!);
  assert.equal(queue.snapshot().failed[0]?.barcode, "BC-1");
  queue.reconcile([slow.clientScanId!]);
  assert.equal(queue.snapshot().failed.length, 0);
  assert.equal(queue.snapshot().latestFinishedId, slow.clientScanId);
});
```

Add `lib/inventory/*.test.ts` to the `test` script in `apps/web/package.json`.

- [ ] **Step 2: Run the test**

Run from `apps/web`: `node --test lib/inventory/queue.test.ts`

Expected: FAIL because `queue.ts` does not exist.

- [ ] **Step 3: Implement the queue**

`enqueue` trims the barcode. An empty string returns `{ accepted: false, clientScanId: null }`. If a pending item has that barcode, return `{ accepted: false, clientScanId: null }`. Otherwise create `crypto.randomUUID()`, store it as pending, and return `{ accepted: true, clientScanId }`. `markDone` removes it from pending and failed and sets `latestFinishedId`. `markFailed` moves it to failed. `reconcile` calls `markDone` for each id that is pending or failed. The queue does not send HTTP itself. The scanner keeps at most two ids in flight and calls `enqueue` for every accepted Enter.

- [ ] **Step 4: Run the test**

Run from `apps/web`: `npm test`

Expected: PASS, including the existing catalog and patron tests.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/inventory/queue.ts apps/web/lib/inventory/queue.test.ts apps/web/package.json
git commit -F <msgfile>
```

Message: `Queue inventory scans on the device without mixing results.`

---

### Task 10: Session list

**Files:**
- Create: `apps/web/lib/inventory/types.ts`
- Create: `apps/web/lib/inventory/search-params.ts`
- Create: `apps/web/components/inventory/session-list.tsx`
- Modify: `apps/web/app/(app)/inventory/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/inventory/sessions`, `fetchApi`, `ModuleFrame`, `gatePage`
- Produces: `SessionList`. The page keeps `gatePage("inventory.view")` and `AccessDenied`.

- [ ] **Step 1: Write the failing typecheck**

Change `apps/web/app/(app)/inventory/page.tsx` to import `SessionList` and render it when the gate passes and `me.active_department_id` is not null. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because `SessionList` does not exist.

- [ ] **Step 2: Replace the placeholder**

Keep the “Choose a department” card when `active_department_id` is null, and do not render `SessionList` in that case. When a department is selected, render `SessionList` inside `Suspense`. `ModuleFrame` moves into `SessionList` with `hideModuleSentence`, eyebrow `Library`, title `Inventory`, and the description from Global Constraints. Delete the “tools will be added” path for this page by always hiding that sentence.

- [ ] **Step 3: Build the list**

`types.ts` declares the session, scan, and counters objects from Task 8. `search-params.ts` reads `q`, `status`, `page`, `sort`, and `direction` from `URLSearchParams`. Invalid status, page below 1, or an unknown sort falls back to empty status, page 1, and `created_at` descending. `SessionList` is a client component. The search placeholder is `Reference or name`. Status options are Any status, Draft, In progress, and Cancelled. “New session” links to `/inventory/new`. Columns are Reference, Name, Library, Location, Expected, Status, and Started. A null location renders `Whole library`. A null `started_at` renders nothing in that cell. A row links to `/inventory/{id}`. Loading renders three `Skeleton` rows. An error renders `error.message` and `Try again`, which calls `refetch`. An empty `items` array renders `No inventory sessions for this department.` Use `CatalogPagination` with `perPage={20}`. Below `md`, the filters stack.

- [ ] **Step 4: Run the typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/inventory/types.ts apps/web/lib/inventory/search-params.ts apps/web/components/inventory/session-list.tsx "apps/web/app/(app)/inventory/page.tsx"
git commit -F <msgfile>
```

Message: `Show inventory sessions for the active department.`

---

### Task 11: Create session page

**Files:**
- Create: `apps/web/components/inventory/session-form.tsx`
- Create: `apps/web/app/(app)/inventory/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/inventory/libraries`, `POST /api/v1/inventory/sessions`, `fetchApi`
- Produces: `SessionForm`. The page calls `gatePage("inventory.view")`.

- [ ] **Step 1: Write the failing typecheck**

Add `apps/web/app/(app)/inventory/new/page.tsx` that renders `SessionForm` after the gate. A null `active_department_id` renders the existing “Choose a department” card instead of the form. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because `SessionForm` does not exist.

- [ ] **Step 2: Build the form**

Fields are Name, Library, and Shelving location code. The location hint is the Global Constraints sentence. Library options come from `/api/v1/inventory/libraries`. A failed library load shows `error.message` and `Try again`, and the submit button stays disabled. “Create session” posts `{ name, home_library_id, location }`. A blank location sends `null`. While the request is in flight, the button is disabled. Success routes to `/inventory/{id}`. Failure shows `error.message` and keeps the typed values. “Back to sessions” links to `/inventory` and does not post. Inputs use the existing `Input`, `Label`, `Select`, and `Button` components. Submit and the back link are at least 44px tall.

- [ ] **Step 3: Run the typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/components/inventory/session-form.tsx "apps/web/app/(app)/inventory/new/page.tsx"
git commit -F <msgfile>
```

Message: `Let staff create an inventory draft for one Koha library.`

---

### Task 12: Draft, scanner, and cancelled summary

**Files:**
- Create: `apps/web/components/inventory/session-view.tsx`
- Create: `apps/web/app/(app)/inventory/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `createScanQueue`, session and scan types, `fetchApi`, shadcn `Dialog`
- Produces: `SessionView({ sessionId: string })`

- [ ] **Step 1: Write the failing typecheck**

The page calls `gatePage("inventory.view")`. A null active department renders “Choose a department”. Otherwise it renders `SessionView` with the route id inside `Suspense`. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because `SessionView` does not exist.

- [ ] **Step 2: Build the three statuses**

Load `GET /api/v1/inventory/sessions/{id}`. A failed load shows `error.message` and `Try again`. Draft shows the reference and name as the heading, the expected count in `font-display`, the library, and `Whole library` when `location` is null. Actions are `Start scanning` and `Cancel session`. When `expected_count` is 0, include the zero-count sentence from Global Constraints. `Start scanning` posts `/start` and refetches. Cancel confirms in a `Dialog` that closes on Escape, then posts `/cancel`.

In progress, the barcode field is focused on mount. It uses `inputmode="none"`, `autocomplete="off"`, `autocapitalize="off"`, and `spellcheck={false}`. The visible hint is `Set the scanner suffix to Enter.` Enter trims the value, ignores an empty value, and shows a validation message without posting when `queue.enqueue` returns `accepted: false` for an empty value or when the trimmed value is longer than 32 characters. An accepted id is posted to `/scans` with that `client_scan_id` and barcode. Clear and refocus the field before the response. Keep at most two requests in flight. Further accepted scans stay queued. Apply each response to its `client_scan_id`. The result heading is `outcome_label` in `font-display`. Verified uses `bg-gold-100 text-gold-700`. Every other primary outcome uses `bg-maroon-50 text-maroon-700`. Duplicate uses `text-foreground` with no extra fill. Under the word, show `title` or `No title from Koha`, then call number, location, `koha_status_label`, and `message`. The barcode is `font-mono`. Counts are one wrapping line: Expected, Seen, Verified, Needs a look, Duplicates, Remaining. A waiting barcode shows `Checking Koha…` and the pending count. A failure shows the barcode, `Scan not saved.`, and `Retry`. Retry posts the same `client_scan_id`. After a failure, refetch the latest scans and `reconcile` any id that is already stored. `Type barcode` sets `inputMode` to `text` and focuses the field. After that Enter, set it back to `none` and focus it. `Sound off` is the initial label. Turning it on stores `libraryhub.inventory.scanSound` as `on` and plays one short oscillator tone for `verified` and a second frequency for every other outcome. No audio file. Below `lg`, the field is sticky, the result is under it, then the counts, then the scans. From `lg` up, the field and the result are side by side and the result column is wider. The latest twenty scans come from `GET /scans?per_page=20`. Search and the outcome filter refetch that list. The field stays mounted. Empty copy is `No scans yet.` The field, `Type barcode`, `Retry`, the sound control, `Start scanning`, and `Cancel session` are at least 44px on the short side. Do not remove the focus outline.

Cancelled shows the same summary and scan list, with no field and no start action. The status text is `Cancelled`.

- [ ] **Step 3: Run the typecheck and the queue test**

Run from `apps/web`: `npm run typecheck` and `npm test`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add apps/web/components/inventory/session-view.tsx "apps/web/app/(app)/inventory/[sessionId]/page.tsx"
git commit -F <msgfile>
```

Message: `Scan barcodes from an in-progress inventory session.`

---

### Task 13: Docs and browser check

**Files:**
- Modify: `docs/koha-integration.md`

**Interfaces:**
- Consumes: the routes and pages from Tasks 8 through 12
- Produces: a short Inventory section in the Koha doc

- [ ] **Step 1: Document the Koha calls**

Add an Inventory section to `docs/koha-integration.md`. State that session rows live in PostgreSQL, Koha is read through `GET /items` for the count and for one barcode with `x-koha-embed: biblio`, and this module does not call item update routes. Point to the spec path.

- [ ] **Step 2: Run the automated tests**

From `apps/api`: `py -3 -m pytest tests/unit/test_inventory_classify.py tests/unit/test_inventory_counters.py tests/api/test_inventory_service.py tests/api/test_inventory_schema.py tests/api/test_inventory_http.py tests/unit/test_koha_client.py -v`

From `apps/web`: `npm test` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Check the scanner in the browser**

With `npm run dev:api` and `npm run dev` running, sign in as a librarian who has an active department. Confirm:

- `/inventory` with no department shows “Choose a department” and does not request the session list.
- “New session” creates a draft and shows the Koha count before “Start scanning”.
- Enter in the scanner field submits, clears the field, and returns focus. A second Enter on the same barcode after the first result shows Duplicate and does not increase Verified.
- A barcode Koha does not have shows Not found and stays in the recent list after refresh.
- Stopping the API, scanning once, shows “Scan not saved.” and Retry. Restoring the API and pressing Retry keeps a single row for that `client_scan_id`.
- At a viewport below `lg`, the field is on screen, the page does not scroll sideways, and “Type barcode” can be tapped. The sound control changes between “Sound off” and “Sound on”.
- Cancel asks for confirmation, closes with Escape when dismissed, and leaves a cancelled session with its scans and without a scanner field.

- [ ] **Step 4: Commit the doc**

```powershell
git add docs/koha-integration.md
git commit -F <msgfile>
```

Message: `Document the read-only Koha calls used by inventory scanning.`
