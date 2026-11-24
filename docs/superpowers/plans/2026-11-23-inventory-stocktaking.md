# Inventory and stocktaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized staff run a department stocktake from `/inventory`: freeze shelf copies from Koha, scan barcodes, mark Not Found, and approve item updates only when a recorded Koha write exists.

**Architecture:** The browser calls `/api/v1/inventory` through the Next.js rewrite. Inventory services enforce department scope and permissions, store sessions and scans in PostgreSQL, call Koha only through recorded capability entries, and append `audit_logs`. Koha stays the authority for the live item. Expected rows are a frozen stocktake list, not a second catalog.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, HTTPX, pytest, openpyxl, Next.js 16, `fetchApi` from `apps/web/lib/api.ts`, shadcn, node:test.

**Spec:** `docs/superpowers/specs/2026-11-23-inventory-stocktaking-design.md`

## Global Constraints

- Koha is the authority for the live item. A missing scan, a Not Found mark, and a damage flag do not write Koha.
- Do not invent Koha paths. `item_list`, `locations`, and `item_update` start unset (`None`). An empty `update_fields` tuple is the allowlist. Unset `item_list` makes start return `501` `inventory_unsupported`. Unset `item_update` makes submit return `501` `inventory_unsupported`. Message for both: `This Koha operation is not available.`
- Barcode lookup uses the existing exact `external_id` query in `KohaClient.search_items`. Item-type labels use `KohaClient.item_type_labels`. Library labels use `KohaClient.library_names`.
- Shelf filter uses `item_status` from `app.integrations.koha.availability`. Keep `available`, `damaged`, and `not_for_loan`. Drop `withdrawn`, `lost`, `checked_out`, and `in_transit`.
- Permissions: `inventory.manage` goes to Librarian, Department Head, Library Administrator, and Super Administrator. `inventory.adjustments.approve` goes to Department Head, Library Administrator, and Super Administrator. Student and Auditor receive neither. `inventory.view` already exists.
- Permission denial message: `You do not have permission for this action.`
- No active department: `409` `department_required`, message `Choose a department first.`
- Empty `koha_branchcode`: `422` `branch_unmapped`, message `This department has no Koha library.`
- Invalid scan: `422` `invalid_scan`, message `That scan is not valid.` Store no row.
- Another department’s session, or an unknown id: `404` `not_found`.
- The approver’s user id must differ from `drafted_by`. Otherwise `403` `not_approver`.
- Barcodes appear in item, scan, and export payloads only when the caller has `catalog.barcode.view`. Audit `details` and application logs never contain a barcode.
- Writes require CSRF header `X-CSRF-Token` and cookie `libraryhub_csrf` via `assert_csrf`, same as circulation.
- Do not fill `koha_branchcode`. No collection-code scope. No second snapshot. No camera, Bluetooth, or browser offline queue. No pause status. No scan delete. No hash-chained audit.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains `Co-authored-by: Cursor <cursoragent@cursor.com>`, replace the commit with `git commit-tree` as in `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend`.
- Pytest runs from `apps/api`. No live Koha socket. The `db` fixture skips when PostgreSQL is unreachable.
- Web tests use `node --test`. Add `lib/inventory/*.test.ts` to the `test` script in `apps/web/package.json`.
- Page copy: eyebrow `Library`, title `Inventory & stocktaking`, description `Plan a stocktake, scan the shelf, and review exceptions.` Use the existing staff shell. Local views are `overview`, `scan`, `exceptions`, `adjustments`, and `audit`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261123_0006_inventory.py` | Permissions and the six inventory tables |
| `apps/api/app/models/inventory.py` | SQLAlchemy models for those tables |
| `apps/api/app/integrations/koha/inventory.py` | Recorded capability table. All writes and the item list start unset |
| `apps/api/app/scripts/koha_inventory_capabilities.py` | Prints item, location, and item-update paths from the host OpenAPI. Does not write code |
| `apps/api/app/services/inventory_errors.py` | `InventoryError` and the spec’s error constructors |
| `apps/api/app/services/inventory_rules.py` | Shelf filter, scan classification, expected-item condition |
| `apps/api/app/services/inventory_sessions.py` | Draft, start, complete, cancel, reopen, summary |
| `apps/api/app/services/inventory_scans.py` | One barcode, duplicate rule, damage flag |
| `apps/api/app/services/inventory_shelf.py` | Not Found batch and reverse |
| `apps/api/app/services/inventory_adjustments.py` | Draft, decide, submit, work-order rows |
| `apps/api/app/services/inventory_exports.py` | CSV and xlsx bytes |
| `apps/api/app/schemas/inventory.py` | Pydantic bodies |
| `apps/api/app/api/routes/inventory.py` | `/api/v1/inventory` |
| `apps/api/app/api/dependencies/session.py` | `require_inventory_permission` |
| `apps/web/lib/inventory/scan.ts` | Enter submit, control characters, in-flight duplicate |
| `apps/web/lib/inventory/types.ts` | Response types |
| `apps/web/components/inventory/*.tsx` | The five views |
| `apps/web/app/(app)/inventory/page.tsx` | Gate and desk shell |
| `docs/koha-integration.md` | Inventory capability section |

---

### Task 1: Migration, models, schema test

**Files:**
- Create: `apps/api/alembic/versions/20261123_0006_inventory.py`
- Create: `apps/api/app/models/inventory.py`
- Create: `apps/api/tests/api/test_inventory_schema.py`
- Test: `apps/api/tests/api/test_inventory_schema.py`

**Interfaces:**
- Consumes: Alembic revision `20261120_0005`, schema `libraryhub`, `permissions`, `roles`, `role_permissions`, `library_departments`, `app_users`
- Produces: permission codes `inventory.manage` and `inventory.adjustments.approve`; models `InventorySession`, `InventorySessionLocation`, `InventorySessionOperator`, `InventoryExpectedItem`, `InventoryScan`, `InventoryShelfSearch`, `InventoryAdjustment`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_inventory_schema.py`:

```python
from sqlalchemy import inspect, text

from app.models.identity import Permission

MANAGE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
APPROVE_ROLES = (
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
EXCLUDED = ("Student", "Auditor", "Librarian")


def test_inventory_permissions(db):
    codes = {"inventory.manage", "inventory.adjustments.approve"}
    rows = db.query(Permission).filter(Permission.code.in_(codes)).all()
    assert {row.code for row in rows} == codes
    assert {row.module for row in rows} == {"inventory"}
    granted = db.execute(
        text("""
            SELECT r.name, p.code
            FROM libraryhub.roles r
            JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
            JOIN libraryhub.permissions p ON p.id = rp.permission_id
            WHERE p.code IN ('inventory.manage', 'inventory.adjustments.approve')
        """),
    ).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in MANAGE_ROLES:
        assert "inventory.manage" in by_role[name]
    for name in APPROVE_ROLES:
        assert "inventory.adjustments.approve" in by_role[name]
    assert "inventory.adjustments.approve" not in by_role.get("Librarian", set())
    for name in ("Student", "Auditor"):
        assert name not in by_role


def test_inventory_tables_exist(db):
    inspector = inspect(db.get_bind())
    names = set(inspector.get_table_names(schema="libraryhub"))
    assert {
        "inventory_sessions",
        "inventory_session_locations",
        "inventory_session_operators",
        "inventory_expected_items",
        "inventory_scans",
        "inventory_shelf_searches",
        "inventory_adjustments",
    } <= names
    scan_indexes = {idx["name"] for idx in inspector.get_indexes("inventory_scans", schema="libraryhub")}
    assert "uq_inventory_scans_counting_item" in scan_indexes
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_inventory_schema.py -v`

Working directory: `apps/api`

Expected: FAIL because the permissions and tables are absent. If the output says PostgreSQL is not reachable, the `db` fixture skipped. Start PostgreSQL and rerun. A skip is not a pass.

- [ ] **Step 3: Write the migration and models**

`down_revision` is `20261120_0005`. `revision` is `20261123_0006`.

Insert the two permissions with `WHERE NOT EXISTS`. Grant `inventory.manage` to the four `MANAGE_ROLES`. Grant `inventory.adjustments.approve` to the three `APPROVE_ROLES`. `downgrade()` deletes those role grants and the two permission rows, then drops the tables in reverse foreign-key order.

Create the tables in `libraryhub` with timezone-aware timestamps, UUID primary keys from `gen_random_uuid()` except the composite primary keys, and these checks:

- `inventory_sessions.status` in `draft`, `in_progress`, `completed`, `cancelled`
- `inventory_expected_items.koha_status` in `available`, `damaged`, `not_for_loan`
- `inventory_scans.outcome` in `found`, `misplaced`, `unexpected`, `damaged`, `withdrawn`, `invalid`, `duplicate`, `koha_error`
- `inventory_scans.match_basis` is null or in `found`, `misplaced`
- `inventory_adjustments.status` in `draft`, `approved`, `rejected`, `submitted`, `failed`

Unique constraints: `(session_id, location)` is the primary key of `inventory_session_locations`. `(session_id, user_id)` is the primary key of `inventory_session_operators`. `(session_id, koha_item_id)` and `(session_id, barcode)` are unique on `inventory_expected_items`. Partial unique index `uq_inventory_scans_counting_item` on `(session_id, koha_item_id)` where `counts AND koha_item_id IS NOT NULL`. Partial unique index `uq_inventory_shelf_active` on `expected_item_id` where `reversed_at IS NULL`.

`created_by`, `operator_id`, `marked_by`, `reversed_by`, `drafted_by`, and `decided_by` foreign keys use `ON DELETE SET NULL`. Child rows of a session use `ON DELETE CASCADE`. `inventory_scans.expected_item_id` and `original_scan_id` use `ON DELETE SET NULL`. `inventory_adjustments.expected_item_id` and `scan_id` use `ON DELETE SET NULL`.

`apps/api/app/models/inventory.py` maps every column in the spec’s Data section onto those tables. Import is not required in `alembic/env.py` because this revision uses `op.create_table` rather than autogenerate.

- [ ] **Step 4: Apply the migration and rerun the test**

Run: `python -m alembic upgrade head`

Working directory: `apps/api`

Then: `python -m pytest tests/api/test_inventory_schema.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Add inventory tables and stocktake permissions.`n")
git add -- "apps/api/alembic/versions/20261123_0006_inventory.py" "apps/api/app/models/inventory.py" "apps/api/tests/api/test_inventory_schema.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 2: Capability table, errors, OpenAPI printer

**Files:**
- Create: `apps/api/app/integrations/koha/inventory.py`
- Create: `apps/api/app/scripts/koha_inventory_capabilities.py`
- Create: `apps/api/app/services/inventory_errors.py`
- Create: `apps/api/tests/unit/test_inventory_capabilities.py`
- Test: `apps/api/tests/unit/test_inventory_capabilities.py`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces: `InventoryCapabilities` with `item_list: ItemListCapability | None`, `locations: ReadCapability | None`, `item_update: ReadCapability | None`, `update_fields: tuple[str, ...]`; `get_inventory_capabilities() -> InventoryCapabilities`; `capabilities_payload(caps) -> dict`; `InventoryError`; `unsupported()`, `department_required()`, `branch_unmapped()`, `invalid_scan()`, `invalid_state()`, `not_unverified()`, `not_approver()`, `not_submittable()`, `field_not_allowed()`, `ambiguous_barcode()`, `inventory_unavailable()`

- [ ] **Step 1: Write the failing test**

```python
from app.integrations.koha.inventory import (
    InventoryCapabilities,
    capabilities_payload,
    get_inventory_capabilities,
)
from app.services.inventory_errors import unsupported


def test_inventory_capabilities_start_unset():
    caps = get_inventory_capabilities()
    assert isinstance(caps, InventoryCapabilities)
    assert caps.item_list is None
    assert caps.locations is None
    assert caps.item_update is None
    assert caps.update_fields == ()
    payload = capabilities_payload(caps)
    assert payload == {
        "item_list": False,
        "locations": False,
        "item_update": False,
        "update_fields": [],
    }


def test_unsupported_inventory_message():
    exc = unsupported()
    assert exc.status_code == 501
    assert exc.code == "inventory_unsupported"
    assert exc.message == "This Koha operation is not available."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_capabilities.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Write the modules**

`ReadCapability` and `ItemListCapability` are frozen dataclasses with `method: str` and `path: str`. `ItemListCapability` also has `library_param: str`.

`get_inventory_capabilities` returns `InventoryCapabilities()`. Do not set a path in this task. A later recording commit may set `item_list` only after `python -m app.scripts.koha_inventory_capabilities` prints a paged items read that accepts one home library. The same commit updates this unit test to the printed method and path. Until that commit, start and submit stay on the `501` path.

`capabilities_payload` returns booleans for the three capabilities and `list(caps.update_fields)`.

`InventoryError` stores `status_code`, `code`, and `message`. Constructors:

| Function | Status | Code | Message |
|---|---|---|---|
| `unsupported` | 501 | `inventory_unsupported` | `This Koha operation is not available.` |
| `department_required` | 409 | `department_required` | `Choose a department first.` |
| `branch_unmapped` | 422 | `branch_unmapped` | `This department has no Koha library.` |
| `invalid_scan` | 422 | `invalid_scan` | `That scan is not valid.` |
| `invalid_state` | 409 | `invalid_state` | `That action is not available for this session.` |
| `not_unverified` | 409 | `not_unverified` | `Only an unverified item can be marked not found.` |
| `not_approver` | 403 | `not_approver` | `The person who drafted this proposal cannot approve it.` |
| `not_submittable` | 409 | `not_submittable` | `That proposal cannot be submitted.` |
| `field_not_allowed` | 422 | `field_not_allowed` | `That item field cannot be changed from inventory.` |
| `ambiguous_barcode` | 409 | `ambiguous_barcode` | `Two items in this snapshot share a barcode.` |
| `inventory_unavailable` | 503 | `inventory_unavailable` | `Inventory is unavailable. Try again.` |

`koha_inventory_capabilities.py` copies the circulation printer. It prints every `GET`, `POST`, `PUT`, and `PATCH` whose path contains `item`, `location`, or `authorised_value`. It does not write files. Exit code 2 when Koha is not configured or the OpenAPI document cannot be read.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_capabilities.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Record inventory Koha capabilities as unset until the host is read.`n")
git add -- "apps/api/app/integrations/koha/inventory.py" "apps/api/app/scripts/koha_inventory_capabilities.py" "apps/api/app/services/inventory_errors.py" "apps/api/tests/unit/test_inventory_capabilities.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 3: Shelf filter and scan classification

**Files:**
- Create: `apps/api/app/services/inventory_rules.py`
- Create: `apps/api/tests/unit/test_inventory_rules.py`
- Test: `apps/api/tests/unit/test_inventory_rules.py`

**Interfaces:**
- Consumes: `item_status` from `app.integrations.koha.availability`
- Produces: `ScanDecision(outcome: str, match_basis: str | None, observed_damaged: bool, counts: bool)`; `keep_for_snapshot(item: dict, *, home_library_id: str, locations: frozenset[str], item_type_id: str | None) -> bool`; `classify_scan(...) -> ScanDecision`; `expected_condition(*, scan_outcome: str | None, active_shelf_search: bool) -> str`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_inventory_rules.py` with one item helper and these assertions:

```python
def _item(**overrides):
    base = {
        "home_library_id": "COLLEGE",
        "holding_library_id": "COLLEGE",
        "location": "STACK-A",
        "item_type_id": "BK",
        "withdrawn": 0,
        "lost_status": 0,
        "damaged_status": 0,
        "not_for_loan_status": 0,
        "checked_out_date": None,
    }
    base.update(overrides)
    return base


def test_shelf_filter_keeps_on_shelf_copies_only():
    locs = frozenset({"STACK-A"})
    assert keep_for_snapshot(_item(), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert keep_for_snapshot(_item(not_for_loan_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert keep_for_snapshot(_item(damaged_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(checked_out_date="2026-11-01"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(holding_library_id="OTHER"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(lost_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(withdrawn=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(location=""), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(location="STACK-B"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(item_type_id="AV"), home_library_id="COLLEGE", locations=locs, item_type_id="BK")
    assert keep_for_snapshot(_item(location=""), home_library_id="COLLEGE", locations=frozenset(), item_type_id=None)


def test_classify_order():
    common = dict(
        session_home_library_id="COLLEGE",
        session_locations=frozenset({"STACK-A"}),
        station_location="STACK-A",
        snapshot_location="STACK-A",
        on_expected_list=True,
        existing_counts=False,
        koha_failed=False,
        damaged=False,
    )
    assert classify_scan(matches=[], **common).outcome == "invalid"
    assert classify_scan(matches=[_item(), _item()], **common).outcome == "invalid"
    failed = classify_scan(matches=[], koha_failed=True, **{k: v for k, v in common.items() if k != "koha_failed"})
    assert failed.outcome == "koha_error" and failed.counts is False
    dup = classify_scan(matches=[_item()], existing_counts=True, **{k: v for k, v in common.items() if k != "existing_counts"})
    assert dup.outcome == "duplicate" and dup.counts is False
    withdrawn = classify_scan(matches=[_item(withdrawn=1)], on_expected_list=False, **{k: v for k, v in common.items() if k != "on_expected_list"})
    assert withdrawn.outcome == "withdrawn" and withdrawn.counts is True
    unexpected = classify_scan(matches=[_item(home_library_id="OTHER")], on_expected_list=False, **{k: v for k, v in common.items() if k != "on_expected_list"})
    assert unexpected.outcome == "unexpected"
    damaged = classify_scan(matches=[_item()], damaged=True, **{k: v for k, v in common.items() if k != "damaged"})
    assert damaged.outcome == "damaged" and damaged.match_basis == "found"
    misplaced = classify_scan(matches=[_item()], station_location="STACK-B", **{k: v for k, v in common.items() if k != "station_location"})
    assert misplaced.outcome == "misplaced"
    found = classify_scan(matches=[_item()], **common)
    assert found.outcome == "found" and found.counts is True


def test_expected_condition_priority():
    assert expected_condition(scan_outcome="found", active_shelf_search=True) == "found"
    assert expected_condition(scan_outcome=None, active_shelf_search=True) == "not_found"
    assert expected_condition(scan_outcome=None, active_shelf_search=False) == "unverified"
    assert expected_condition(scan_outcome="damaged", active_shelf_search=False) == "damaged"
```

Every `classify_scan` argument except `matches` is keyword-only. The comprehensions above drop the one key that the explicit keyword replaces, so no argument is passed twice.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_rules.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement the rules**

`keep_for_snapshot` returns False unless `str(item.get("home_library_id") or "") == home_library_id`. When `locations` is non-empty, `item.get("location")` must be a non-empty string in that set. When `item_type_id` is not None, `str(item.get("item_type_id"))` must equal it. `item_status(item)[0]` must be `available`, `damaged`, or `not_for_loan`.

`classify_scan` arguments: `matches: list[dict]`, `koha_failed: bool`, `existing_counts: bool`, `on_expected_list: bool`, `snapshot_location: str | None`, `session_home_library_id: str`, `session_locations: frozenset[str]`, `station_location: str | None`, `damaged: bool`.

Order:

1. `koha_failed` → `koha_error`, `counts=False`
2. `len(matches) != 1` → `invalid`, `counts=False`
3. `existing_counts` → `duplicate`, `counts=False`
4. Live status is `withdrawn`, live `home_library_id` equals the session library, and (`session_locations` is empty or live `location` is in it) → `withdrawn`, `counts=True`. If `damaged` and not `on_expected_list`, `observed_damaged=True`. If `damaged` and `on_expected_list`, still outcome `withdrawn` and `observed_damaged=True`.
5. Not `on_expected_list` → `unexpected`, `counts=True`, `observed_damaged=damaged`
6. `damaged` → `damaged`, `counts=True`, `match_basis` is `misplaced` when the location rule matches, else `found`
7. Location rule → `misplaced`, `counts=True`
8. Else `found`, `counts=True`

Location rule: `station_location is not None and station_location != snapshot_location`, or live `location` is a non-empty string and it differs from `snapshot_location`. A null snapshot differs from a set station location.

`expected_condition`: a non-null `scan_outcome` of `found`, `misplaced`, `damaged`, or `withdrawn` is returned as that condition. Otherwise an active shelf search is `not_found`. Otherwise `unverified`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_rules.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Classify inventory scans against the frozen shelf list.`n")
git add -- "apps/api/app/services/inventory_rules.py" "apps/api/tests/unit/test_inventory_rules.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 4: Session draft, start, and summary

**Files:**
- Create: `apps/api/app/services/inventory_sessions.py`
- Create: `apps/api/app/services/inventory_audit.py`
- Create: `apps/api/tests/unit/test_inventory_sessions.py`
- Test: `apps/api/tests/unit/test_inventory_sessions.py`

**Interfaces:**
- Consumes: `InventorySession` and child models from Task 1; `get_inventory_capabilities`, `unsupported`, `branch_unmapped`, `invalid_state`, `ambiguous_barcode`, `inventory_unavailable` from Task 2; `keep_for_snapshot` from Task 3; `AuditLog` from `app.models.identity`; `item_status`
- Produces: `create_session(db, *, user_id, department_id, name, description, start_on, target_on, locations, item_type_id, operator_ids) -> InventorySession`; `update_draft(db, session, changes) -> InventorySession`; `start_session(db, client, caps, session_id) -> InventorySession`; `complete_session(db, *, session_id, user_id) -> InventorySession`; `cancel_session(db, *, session_id, user_id) -> InventorySession`; `reopen_session(db, *, session_id, user_id) -> InventorySession`; `list_sessions(db, *, department_id, status, q, page, per_page) -> dict`; `session_summary(db, session_id) -> dict`; `write_inventory_audit(db, *, user_id, action, entity_type, entity_id, details) -> None`

- [ ] **Step 1: Write the failing test**

Use the `db` fixture. Insert a `LibraryDepartment` with `koha_branchcode="COLLEGE"` and one with `koha_branchcode=None`. The fake client is a class with `pages: list[list[dict]]` and `get_json(path, params)` returning the next page. Test these cases:

- Create with an empty branch code raises `InventoryError` `branch_unmapped` and inserts no session.
- Create with a branch stores `status="draft"` and `home_library_id="COLLEGE"`, and does not call Koha.
- `start_session` with `get_inventory_capabilities()` (item list unset) raises `inventory_unsupported` and leaves the session Draft.
- `start_session` with a passed `InventoryCapabilities(item_list=ItemListCapability("GET", "/items", "home_library_id"))` keeps one on-shelf item, drops a checked-out item, sets `expected_count == 1` and `status == "in_progress"`, and writes an `audit_logs` row whose `action` is `inventory.session_start`, `module` is `inventory`, and `details` are `{"expected_count": 1}` with no barcode key.
- A second page that raises `KohaConnectionError` rolls back. Query the session again: `status == "draft"` and expected-item count is 0.
- Two kept items with the same barcode raise `ambiguous_barcode` and leave the session Draft.
- A second `start_session` on an in-progress session raises `invalid_state`.
- `session_summary` for one found counting scan and one unverified expected item returns `expected == 2`, `scanned == 1`, `unverified == 1`, `completion == 0.5`.

Build the found scan with `InventoryScan` directly in the test so this task does not depend on Task 5.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_sessions.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`, or PostgreSQL skip. A skip is not a pass.

- [ ] **Step 3: Implement session commands**

`write_inventory_audit` inserts `AuditLog(user_id, action, module="inventory", entity_type, entity_id, details)` and does not put a barcode in `details`.

`create_session` loads the department. A null or blank `koha_branchcode` raises `branch_unmapped()`. Insert the session as `draft` with that branch code copied to `home_library_id`. Replace location and operator rows from the arguments. Audit `inventory.session_create` with session id, department id, and home library id.

`update_draft` requires `status == "draft"`. When `locations` or `operator_ids` is present, delete the old child rows and insert the new list. Audit `inventory.session_update` with before and after for each changed field. `home_library_id` and `department_id` are not accepted.

`start_session` locks the session row with `SELECT ... FOR UPDATE`. Status must be `draft`. `caps.item_list is None` raises `unsupported()`. Page `client.get_json(caps.item_list.path, {library_param: home_library_id, "_page": n, "_per_page": 50})` until a page is shorter than 50. `KohaConnectionError` or `KohaTimeoutError` raises `inventory_unavailable()` before commit, so the transaction rolls back. Keep rows with `keep_for_snapshot`. A repeated barcode among kept rows raises `ambiguous_barcode()` before commit. An empty kept set still sets `expected_count = 0` and `status = "in_progress"`. One audit row stores `expected_count` only.

`complete_session` requires `in_progress`, sets `completed_at`, status `completed`. `cancel_session` requires `draft` or `in_progress`. `reopen_session` requires `completed`, sets `reopened_at`, clears `completed_at`, status `in_progress`. Each writes its audit action from the spec.

`list_sessions` filters by `department_id`. `status` is `all`, `active` (`in_progress`), `planned` (`draft`), `review` (completed, with a proposal in `draft`, `approved`, or `failed`), or `closed` (`completed` or `cancelled`). `q` matches the session name.

`session_summary` counts expected rows and expected rows that have a counting scan. Unverified uses `expected_condition`. Open exceptions are the distinct items that are Not Found, Misplaced, Unexpected, Damaged, or Withdrawn. An item counts once. The bar counts are primary outcomes only: `found`, `misplaced`, `damaged`, `withdrawn`, and `unexpected`. Proposals still open are those in `draft`, `approved`, or `failed`. `completion` is `scanned / expected`, or `0` when expected is 0.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_sessions.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Freeze a stocktake snapshot without writing Koha.`n")
git add -- "apps/api/app/services/inventory_sessions.py" "apps/api/app/services/inventory_audit.py" "apps/api/tests/unit/test_inventory_sessions.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 5: Barcode scan and damage flag

**Files:**
- Create: `apps/api/app/services/inventory_scans.py`
- Create: `apps/api/tests/unit/test_inventory_scans.py`
- Test: `apps/api/tests/unit/test_inventory_scans.py`

**Interfaces:**
- Consumes: `classify_scan`, `expected_condition`, `InventoryScan`, `write_inventory_audit`, `invalid_scan`, `invalid_state`
- Produces: `submit_scan(db, client, *, session_id, user_id, barcode, station_location, damaged) -> dict`; `set_damage(db, *, session_id, scan_id, user_id, damaged, remark) -> dict`

`submit_scan` returns `outcome`, `match_basis`, `observed_damaged`, `counts`, `koha_item_id`, `title`, `live_status`, `station_location`, `live_location`, and `barcode` only when the caller later strips it. The service dict includes `barcode_submitted`. The route deletes that key when the caller lacks `catalog.barcode.view`.

- [ ] **Step 1: Write the failing test**

Start one in-progress session with two expected items, barcodes `AAA` and `BBB`, location `STACK-A`. Fake `search_items` returns a list or raises `KohaTimeoutError`.

Assert:

- `"A\u0001"` raises `invalid_scan` and the scan count stays 0.
- A barcode with no Koha row stores `invalid`, `counts is False`.
- `KohaTimeoutError` stores `koha_error`. The expected rows remain. A second call for the same barcode can store `found`.
- The first `AAA` scan with `station_location="STACK-A"` stores `found` and `counts is True`. Completion becomes 0.5.
- The second `AAA` scan stores `duplicate`, `counts is False`, and `original_scan_id` points at the found scan. Completion stays 0.5.
- `BBB` with `station_location="STACK-B"` stores `misplaced`.
- An item whose Koha home library is `OTHER` stores `unexpected` and does not add an expected row.
- A withdrawn item whose live library is `COLLEGE` and live location is `STACK-A` stores `withdrawn` and does not add an expected row.
- `set_damage(..., damaged=True, remark="Torn spine")` on the found scan changes `outcome` to `damaged` and `match_basis` to `found`. The audit action is `inventory.damage` and `details` have `before` and `after` and no barcode.
- `set_damage(..., damaged=True, remark="Cover torn")` on an unexpected scan leaves `outcome` as `unexpected` and sets `observed_damaged` true.
- `submit_scan` on a completed session raises `invalid_state`.
- Two `submit_scan` calls for a new barcode, the second after the first has committed, result in one row with `counts is True`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_scans.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement scans**

Reject the barcode before Koha when it is empty, longer than 64 characters, or matches `[\x00-\x1f\x7f]`. Raise `invalid_scan()`.

Require `in_progress`. When the session has location rows, `station_location` must be one of them or raise `invalid_state()`.

Call `client.search_items({"q": json.dumps({"external_id": trimmed}), "_per_page": 5})`. `KohaTimeoutError` and `KohaConnectionError` become a `koha_error` row and a normal return, not an exception. Look up an expected item by `koha_item_id` and by barcode. `existing_counts` is true when a scan for that `koha_item_id` has `counts` true.

Insert the scan from `classify_scan`. On `IntegrityError` for `uq_inventory_scans_counting_item`, roll back to the savepoint, set `existing_counts` true, and insert the duplicate. Audit `inventory.scan` with scan id, `koha_item_id` or null, outcome, and `counts`.

`set_damage` requires `in_progress` and a non-empty remark of at most 2000 characters. On `found` or `misplaced`, setting damage stores `outcome="damaged"` and `match_basis` equal to the previous outcome. Clearing damage restores `outcome` from `match_basis`. On `unexpected` or `withdrawn`, only `observed_damaged` changes. Audit `inventory.damage` with before and after outcomes.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_scans.py tests/unit/test_inventory_rules.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Store inventory scans without changing Koha items.`n")
git add -- "apps/api/app/services/inventory_scans.py" "apps/api/tests/unit/test_inventory_scans.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 6: Not Found marks

**Files:**
- Create: `apps/api/app/services/inventory_shelf.py`
- Create: `apps/api/tests/unit/test_inventory_shelf.py`
- Test: `apps/api/tests/unit/test_inventory_shelf.py`

**Interfaces:**
- Consumes: `expected_condition`, `InventoryShelfSearch`, `not_unverified`, `invalid_state`, `write_inventory_audit`
- Produces: `mark_not_found(db, *, session_id, user_id, expected_item_ids: list, remark: str) -> list[InventoryShelfSearch]`; `reverse_not_found(db, *, session_id, search_id, user_id, remark: str) -> InventoryShelfSearch`

- [ ] **Step 1: Write the failing test**

- Three unverified expected items. `mark_not_found` with two ids and remark `Shelf B empty` inserts two rows with the same `batch_id`, and `expected_condition` is `not_found` for those two and `unverified` for the third.
- The same call including an id that already has a counting scan raises `not_unverified` and inserts nothing.
- A later found scan leaves the shelf-search row in place. `expected_condition` for that item is `found`.
- `reverse_not_found` on the remaining Not Found row sets `reversed_at` and `reverse_remark`. The item is unverified again.
- Reverse on an item that also has a counting scan clears the mark and leaves the scan outcome.
- Mark on a completed session raises `invalid_state`.
- Audit action `inventory.not_found` details are `batch_id` and the expected-item ids. No barcode.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_shelf.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement shelf searches**

Require `in_progress`. Remark length 1–2000. Load every expected item in one query. If any id is missing or `expected_condition` is not `unverified`, raise `not_unverified()` before inserting. Insert one row per id with one new `batch_id`. Audit once.

Reverse requires an active mark (`reversed_at` is null) on that session. Set `reversed_at`, `reversed_by`, and `reverse_remark`. Do not change scans. Audit `inventory.not_found_reverse`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_shelf.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Record shelf searches as Not Found without writing Koha.`n")
git add -- "apps/api/app/services/inventory_shelf.py" "apps/api/tests/unit/test_inventory_shelf.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 7: Proposals, submit gate, and exports

**Files:**
- Create: `apps/api/app/services/inventory_adjustments.py`
- Create: `apps/api/app/services/inventory_exports.py`
- Modify: `apps/api/pyproject.toml`
- Create: `apps/api/tests/unit/test_inventory_adjustments.py`
- Test: `apps/api/tests/unit/test_inventory_adjustments.py`

**Interfaces:**
- Consumes: `get_inventory_capabilities`, `unsupported`, `not_approver`, `not_submittable`, `field_not_allowed`, `InventoryAdjustment`, `write_inventory_audit`
- Produces: `draft_adjustment(...)`; `update_draft_adjustment(...)`; `decide_adjustment(..., decision: Literal["approved", "rejected"], user_id, reason)`; `submit_adjustment(db, client, caps, adjustment_id, user_id) -> InventoryAdjustment`; `export_rows(db, *, session_id, kind, item_query, include_barcode) -> list[dict]`; `render_export(rows, format) -> tuple[bytes, str]`

- [ ] **Step 1: Write the failing test**

- Draft with `field="location"` while `update_fields` is empty raises `field_not_allowed`.
- Draft with `caps` whose `update_fields` is `("location",)` stores `status="draft"`.
- The drafter calling `decide_adjustment(..., decision="approved")` raises `not_approver` and leaves `draft`.
- A different user approves. `submit_adjustment` with `item_update is None` raises `unsupported()` and leaves `approved`. No Koha method is called.
- With `item_update=ReadCapability("PUT", "/items/{item_id}")` and a fake client that raises `KohaRequestError(400, [], "no")`, status becomes `failed`, `koha_http_status == 400`, and the session’s scan rows are unchanged.
- A fake client that returns `{"item_id": 9}` stores `submitted`.
- `export_rows(..., kind="work_order")` includes `approved` and `failed` and excludes `rejected` and `submitted`.
- `render_export(rows, "csv")` contains the header `koha_item_id` and, when `include_barcode` is False, an empty barcode column. `render_export(rows, "xlsx")` is a non-empty workbook readable by `openpyxl.load_workbook`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_inventory_adjustments.py -v`

Working directory: `apps/api`

Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement proposals and exports**

Add `"openpyxl"` to `apps/api/pyproject.toml` `dependencies`, then install the project in the API environment.

`draft_adjustment` allows session status `in_progress` or `completed`. `field` must be in `caps.update_fields`. `reason` is 1–2000 characters. Do not default `field` to `lost`, `withdrawn`, or a delete. Audit `inventory.adjustment_draft`.

`decide_adjustment` requires `status == "draft"` and `user_id != drafted_by`. Reject stores the decision reason on `koha_error` only when rejected? No. Store the reject reason in the audit details. The column `reason` stays the drafter’s reason. Audit `inventory.adjustment_decide`.

`submit_adjustment` requires status `approved` or `failed`. `item_update is None` raises `unsupported()` with no status change. Otherwise call `client.put_json` or `client.post_json` according to `caps.item_update.method`, path with `{item_id}` replaced by `koha_item_id`, body `{field: to_value}`. Success stores `submitted` and `koha_http_status` 200. `KohaRequestError` stores `failed`, the status code, and `koha_message` truncated to 500 characters with HTML stripped. `KohaTimeoutError` and `KohaConnectionError` store `failed` and null `koha_http_status`. Audit `inventory.adjustment_submit`. Do not delete scans.

`export_rows` kinds:

- `findings`: Not Found, Misplaced, Unexpected, Damaged, Withdrawn
- `filter`: the same filter arguments as the items list, ignoring page
- `unverified`: expected items whose condition is unverified
- `work_order`: adjustments in `approved` or `failed`

`render_export` columns are the spec’s export columns. CSV uses the `csv` module. `xlsx` uses `openpyxl.Workbook` with one sheet named `Inventory`. Audit is written by the route, not by `render_export`, so a renderer test does not require a user.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/unit/test_inventory_adjustments.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Gate inventory proposals on a recorded Koha item update.`n")
git add -- "apps/api/app/services/inventory_adjustments.py" "apps/api/app/services/inventory_exports.py" "apps/api/pyproject.toml" "apps/api/tests/unit/test_inventory_adjustments.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`. If `uv.lock` or `poetry.lock` changes because of `openpyxl`, add that lockfile too. Do not commit an unrelated lock change.

---

### Task 8: HTTP routes

**Files:**
- Create: `apps/api/app/schemas/inventory.py`
- Create: `apps/api/app/api/routes/inventory.py`
- Modify: `apps/api/app/api/dependencies/session.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/api/test_inventory_http.py`
- Test: `apps/api/tests/api/test_inventory_http.py`

**Interfaces:**
- Consumes: every service function from Tasks 4–7; `require_circulation_permission` as the pattern for `require_inventory_permission(code: str)`
- Produces: router prefix `/inventory`; `require_inventory_permission`; `list_session_items(db, session, *, condition, q, location, page, per_page, sort, direction, include_barcode) -> dict` in `inventory_sessions.py`; `list_session_audit(db, session_id, *, actor_id, action, page, per_page) -> dict` in `inventory_audit.py`

- [ ] **Step 1: Write the failing test**

Follow `tests/api/test_circulation_http.py` for the session cookie and CSRF cookie. Cases:

- `GET /api/v1/inventory/capabilities` without a session is 401.
- A session with only `inventory.view` that `POST /api/v1/inventory/sessions` gets `403` `permission_denied`.
- A manage session with `active_department_id` null that `POST /sessions` gets `409` `department_required`.
- A manage session whose department has no branch code gets `422` `branch_unmapped`.
- `POST /sessions/{id}/start` with the default unset capabilities gets `501` `inventory_unsupported` and the body message `This Koha operation is not available.`
- `POST /sessions/{id}/scans` with barcode `A\u0001` gets `422` `invalid_scan` and no scan row.
- `POST /adjustments/{id}/approve` by the drafter gets `403` `not_approver`.
- `GET /sessions/{other_department_id}` gets `404`.
- A write without `X-CSRF-Token` gets `403` `csrf_failed`.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/api/test_inventory_http.py -v`

Working directory: `apps/api`

Expected: FAIL with 404 because the router is not included.

- [ ] **Step 3: Implement the router**

`require_inventory_permission` copies `require_circulation_permission` and checks `payload.active_department_id`. Null raises `department_required()` through `_raise_inventory`. Do that check inside each route after the permission dependency so a missing permission stays 403. If the dependency only checks the permission, the route calls `_require_department(payload)` first.

`_raise_inventory` maps `InventoryError` to `HTTPException` with `detail.code` and `detail.message`.

Register every route from the spec’s HTTP table. Static paths `/capabilities`, `/scope-options`, and `/operators` are declared before `/{id}` routes. Adjustment routes load the proposal, then load its session, and return 404 when `session.department_id != payload.active_department_id`.

`GET /scope-options` returns `{"item_types": [{"id", "label"}], "locations": []}`. Item types come from `client.item_type_labels()`. Locations stay an empty list while `caps.locations is None`. `GET /operators` returns users who have `inventory.manage` and a role assignment for the active department or a null `department_id`.

`GET /sessions/{id}/items` uses the spec’s `condition`, `q`, `location`, `page`, `per_page`, `sort`, and `direction` allowlists. A barcode sort without `catalog.barcode.view` is `422` `validation_error`. Strip `barcode` from each item when that permission is missing.

`GET /sessions/{id}/exports` returns a `StreamingResponse` or `Response` with `text/csv` or the xlsx content type, and writes `inventory.export` with kind, format, and row count.

Include `inventory_router` in `app/api/routes/__init__.py` and `app.main.create_app`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/api/test_inventory_http.py tests/api/test_inventory_schema.py -v`

Working directory: `apps/api`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Expose inventory sessions through the staff API.`n")
git add -- "apps/api/app/schemas/inventory.py" "apps/api/app/api/routes/inventory.py" "apps/api/app/api/dependencies/session.py" "apps/api/app/api/routes/__init__.py" "apps/api/app/main.py" "apps/api/tests/api/test_inventory_http.py"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 9: Web scan helper

**Files:**
- Create: `apps/web/lib/inventory/scan.ts`
- Create: `apps/web/lib/inventory/scan.test.ts`
- Modify: `apps/web/package.json` `test` script
- Test: `apps/web/lib/inventory/scan.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `submitInventoryScan(value: string): { ok: true, value: string } | { ok: false, message: string }`; `acceptInventoryScan(value: string, inflight: string | null)` with the same result. A second call with the same value while `inflight` equals that value returns `{ ok: false, message: "" }`.

- [ ] **Step 1: Write the failing test**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { acceptInventoryScan, submitInventoryScan } from "./scan.ts";

test("empty inventory scan does nothing", () => {
  assert.deepEqual(submitInventoryScan("  "), { ok: false, message: "" });
});

test("control character is invalid", () => {
  const result = submitInventoryScan("A\u0001");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.message, "That scan is not valid.");
});

test("enter value is trimmed", () => {
  assert.deepEqual(submitInventoryScan("  ABC  "), { ok: true, value: "ABC" });
});

test("same value is ignored while in flight", () => {
  assert.deepEqual(acceptInventoryScan("ABC", "ABC"), { ok: false, message: "" });
  assert.deepEqual(acceptInventoryScan("ABC", null), { ok: true, value: "ABC" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/inventory/scan.test.ts`

Working directory: `apps/web`

Expected: FAIL because `./scan.ts` does not exist

- [ ] **Step 3: Implement the helper**

Copy the length and control-character rule from `apps/web/lib/circulation/scan.ts`. Maximum length is 64. Empty after trim returns `{ ok: false, message: "" }`. `acceptInventoryScan` calls `submitInventoryScan` and returns the empty failure when `inflight` is the trimmed value.

Add `lib/inventory/*.test.ts` to the `test` script array in `package.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/inventory/scan.test.ts`

Working directory: `apps/web`

Expected: PASS. Then `npm test` still passes the existing catalog, patron, and circulation tests.

- [ ] **Step 5: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Validate inventory barcode entry before it is sent.`n")
git add -- "apps/web/lib/inventory/scan.ts" "apps/web/lib/inventory/scan.test.ts" "apps/web/package.json"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 10: Inventory page

**Files:**
- Create: `apps/web/lib/inventory/types.ts`
- Create: `apps/web/components/inventory/inventory-desk.tsx`
- Create: `apps/web/components/inventory/overview-view.tsx`
- Create: `apps/web/components/inventory/scan-view.tsx`
- Create: `apps/web/components/inventory/exceptions-view.tsx`
- Create: `apps/web/components/inventory/adjustments-view.tsx`
- Create: `apps/web/components/inventory/audit-view.tsx`
- Create: `apps/web/components/inventory/session-dialog.tsx`
- Create: `apps/web/components/inventory/item-drawer.tsx`
- Modify: `apps/web/app/(app)/inventory/page.tsx`

**Interfaces:**
- Consumes: `fetchApi` from `@/lib/api`; `acceptInventoryScan`; `GET/POST /api/v1/inventory/...`; `gatePage("inventory.view")`
- Produces: `InventoryDesk` rendered by the inventory page. Query `view` is one of `overview`, `scan`, `exceptions`, `adjustments`, `audit`.

- [ ] **Step 1: Browser checklist, written before the UI**

After the views exist, exercise them in the browser on desktop and a narrow viewport:

- No department shows the existing choose-a-department card.
- New session: Save draft, then Start. With capabilities unset, Start shows `This Koha operation is not available.` and the session stays Planned.
- Scan view focuses the barcode field on open. Enter on an empty field does not call the API. A second Enter of the same value while the first request is in flight does not send a second request.
- Exceptions: select two unverified rows, mark Not Found with one remark, and see both rows on the Not Found tab.
- Export downloads a CSV.
- A user without `inventory.adjustments.approve` sees Submit inactive. The capability card says item update is unavailable.
- The safeguard sentence is visible: an unscanned item stays Unverified and Koha is unchanged.
- Columns stack below the `xl` width and the exception table scrolls sideways.

There is no component test runner. This checklist is the verification. A physical keyboard-wedge reader is checked once against the scan field. CI does not require the reader.

- [ ] **Step 2: Implement the desk**

`page.tsx` keeps `gatePage("inventory.view")` and `ModuleFrame`. When `active_department_id` is null, keep the current department card and do not mount the desk. Otherwise render `InventoryDesk` with `permissions` and `departmentId`.

`inventory-desk.tsx` is a client component. Local nav buttons set `?view=`. The header has the session `<select>`, search, export menu (`findings`, `filter`, `unverified`, `work_order`, each with CSV and Excel), and New session. The banner text is: `An unscanned item stays unverified. Koha is unchanged until an approved proposal is submitted.`

`session-dialog.tsx` posts `POST /sessions` for Save draft. Start posts create, then `POST /sessions/{id}/start`, then routes to `?view=scan`. Both buttons stay disabled when `capabilities.item_list` is false or the scope-options payload says the department has no home library. The home library is text, not an input. Locations are checkboxes from `scope-options`. Item type is an optional select. Operators are checkboxes from `GET /operators`.

`scan-view.tsx` uses `acceptInventoryScan`. The station location select is required when the session has locations and its value is kept in component state. **Flag next: damaged** stays true until a response includes a `koha_item_id`. The last result shows outcome, title, barcode when present, locations, and Koha status. The field is focused after each result.

`exceptions-view.tsx` tabs map to the `condition` query. **Mark not found** posts the selected ids and one remark. The drawer calls the damage and reverse routes. **Draft proposal** is shown only when `inventory.manage` is present and the session is `in_progress` or `completed`. The field select lists `update_fields` only.

`adjustments-view.tsx` shows the capability payload and each proposal. Approve, reject, and submit call the matching routes. Submit is disabled when `item_update` is false or the permission is missing. Export work order calls the export route with `kind=work_order`.

`audit-view.tsx` loads `GET /sessions/{id}/audit` and filters by actor and action in the query string. It shows time, actor, action, object, and before/after when `details` has them. It does not show a hash.

Use existing shadcn `Card`, `Button`, `Input`, `Select`, `Table`, `Sheet`, and `DropdownMenu`. Use the staff shell’s tokens. Do not copy the prototype’s indigo and rose palette or its sidebar.

- [ ] **Step 3: Verify in the browser**

Run the checklist in Step 1 against the dev server. Fix any failed check before committing.

- [ ] **Step 4: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Add the inventory desk for sessions, scans, and exceptions.`n")
git add -- "apps/web/lib/inventory/types.ts" "apps/web/components/inventory" "apps/web/app/(app)/inventory/page.tsx"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.

---

### Task 11: Koha integration note

**Files:**
- Modify: `docs/koha-integration.md`
- Test: the capabilities unit test from Task 2

**Interfaces:**
- Consumes: `get_inventory_capabilities`
- Produces: a short Inventory section in `docs/koha-integration.md`

- [ ] **Step 1: Write the section**

Add a heading `Inventory`. State that stocktake sessions and scans are stored in PostgreSQL. State that `item_list`, `locations`, and `item_update` are unset, so start and submit return `501` `inventory_unsupported`. State that barcode lookup reuses the circulation exact `external_id` read. State that a Not Found mark does not call Koha. Quote no path that `get_inventory_capabilities()` does not return.

If a recording commit has since set `item_list` or `item_update`, quote that method and path instead of “unset”, and name `update_fields`.

- [ ] **Step 2: Check the doc against the code**

Run: `python -m pytest tests/unit/test_inventory_capabilities.py -v`

Working directory: `apps/api`

Expected: PASS, and the doc’s set or unset claims match `capabilities_payload(get_inventory_capabilities())`.

- [ ] **Step 3: Commit**

```powershell
$path = Join-Path (git rev-parse --git-dir) "COMMIT_MSG.txt"
[System.IO.File]::WriteAllText($path, "Document the inventory Koha capability gate.`n")
git add -- "docs/koha-integration.md"
git commit -F $path
Remove-Item -Force $path
git log -1 --format=%B
```

If the log contains the Cursor co-author trailer, replace the commit as in `.cursor/rules/strip-cursor-coauthor.mdc`.
