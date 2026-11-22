# Inventory workstation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the inventory session page into the workstation from `plan/inventory.html`: finish scanning, review exceptions, and download a CSV, without writing Koha items.

**Architecture:** PostgreSQL gains `in_review` and one decision row per exception scan. The inventory service finishes, resumes, decides, exports, and lists audit. The existing session page keeps the scanner and adds the stepper, cards, review panel, and sidebar. The list and create pages keep their behavior and take the paper-and-card heading.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, Alembic, pytest, Next.js 16, TanStack Query, existing staff shell, Button, Select, and Dialog.

**Spec:** `docs/superpowers/specs/2026-11-21-inventory-workstation-design.md`

## Global Constraints

- Koha items stay unchanged. Do not add an expected-item snapshot or rows for books that were never scanned.
- Do not add a shelf dropdown, a damaged checkbox, sample barcodes, or “Simulate scans.”
- Do not add `pending_review`, `completed`, or `inventory.manage`. Permission stays `inventory.view`.
- Session statuses are `draft`, `in_progress`, `in_review`, and `cancelled`. Finish moves `in_progress` to `in_review`. Resume moves `in_review` to `in_progress` and keeps decision rows. Cancel from `draft`, `in_progress`, or `in_review` sets `cancelled` and keeps scans and decisions.
- A scan is accepted only in `in_progress`. Replaying the same `client_scan_id` still returns the stored row and writes nothing new.
- Review covers each primary scan whose outcome is not `verified`. Duplicates and verified scans have no decision row.
- Stored action sentences, with no trailing period: `Search the shelf again` / `Leave the Koha status unchanged`; `Reshelve to the session location` / `Leave it where it was found`; `Check the Koha item record` / `Reshelve to its home library`; `Set the book aside for repair` / `Leave it on the shelf`; `Remove it from the shelf` / `Leave it on the shelf`; `Set the book aside for a librarian` / `Leave it on the shelf`. `Leave it on the shelf` is valid for `damaged`, `withdrawn`, and `other_exception`.
- Decision is null, `approved`, or `no_action`. A null decision clears `decided_by` and `decided_at`.
- Error sentences: “Only a scanning session can be finished.” “Only a session in review can return to scanning.” “Return to scanning before recording a barcode.” “Finish the session before reviewing exceptions.” “That inventory scan was not found.” “Export is available after scanning is finished.” “That search is not valid.”
- Validation envelope stays “That inventory session is not valid.” A bad action uses `422` `validation_error` and `fields: [{"name": "action", "message": "This value is not valid."}]`.
- CSV columns, in order: `barcode`, `title`, `call_number`, `outcome`, `message`, `action`, `decision`, `decided_by`, `decided_at`. Filename is `{reference}-exceptions.csv`. Rows are oldest `scanned_at` first. An empty decision leaves `decided_by` and `decided_at` empty. A session with no exceptions returns the header only.
- Audit actions: `inventory.session.finish`, `inventory.session.resume`, `inventory.review.decide`, `inventory.review.export`. `module` is `inventory`. `entity_id` is the session id for finish, resume, and export, and the scan id for a decision.
- Export is allowed in `in_review` and `cancelled` and does not change status. Each download writes one export audit row.
- Scan search `q` matches barcode or title, case-sensitive contains, 1 to 80 characters. `exceptions=1` returns primary scans whose outcome is not `verified`. `outcome` together with `exceptions=1` is `422` `invalid_search`.
- List status filter accepts `in_review` and the visible label is “In review.”
- Page copy: heading “Inventory & Stocktaking.” Description “Plan, scan, and review shelf checks against Koha item records. Item status changes stay in Koha.” Button “New stocktake.” Empty review “No exceptions to review.” Progress “{seen} of {expected_count} expected items seen.” Null location “Whole library.” Zero-count sentence stays “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”
- Stepper labels are Plan, Scan, Review, and Submit. Submit is the export button, not a status.
- Count cards are Expected, Verified, Not found, Misplaced, Unexpected, Damaged, and Withdrawn. `seen` stays verified + withdrawn + damaged + other exception. The bar is empty when `expected_count` is 0.
- The scanner mounts only in `in_progress` and keeps the scanning spec’s field, sound, queue, and result colors. Review controls are enabled only in `in_review`.
- Colors stay the current tokens: `font-display`, maroon, gold, `bg-background` paper, `bg-card` cards. Do not add the prototype sidebar, top bar, or a second font.
- Link buttons that render a Next `Link` keep `nativeButton={false}`.
- Logs omit the barcode, the query string, the Authorization header, and the token.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains that trailer, replace the commit with `git commit-tree` and `git update-ref` as required by `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend` and do not use `git reset --soft`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261121_0006_inventory_review.py` | `in_review` check and `inventory_review_decisions` |
| `apps/api/app/models/inventory.py` | `InventoryReviewDecision` and the status check |
| `apps/api/app/services/inventory_review.py` | The six action pairs |
| `apps/api/app/services/inventory.py` | Finish, resume, decision, export, audit, scan and list rules |
| `apps/api/app/schemas/inventory.py` | Decision body and `exceptions` |
| `apps/api/app/api/routes/inventory.py` | The five new routes |
| `apps/web/lib/inventory/types.ts` | `in_review` and decision types |
| `apps/web/lib/inventory/search-params.ts` | List status `in_review` |
| `apps/web/lib/inventory/actions.ts` | The same six pairs for the preset menu |
| `apps/web/components/inventory/session-list.tsx` | Heading, description, New stocktake, In review |
| `apps/web/components/inventory/session-form.tsx` | Card heading copy |
| `apps/web/components/inventory/session-view.tsx` | Workstation, review, sidebar |

---

### Task 1: Review decision table

**Files:**
- Create: `apps/api/alembic/versions/20261121_0006_inventory_review.py`
- Modify: `apps/api/app/models/inventory.py`
- Test: `apps/api/tests/api/test_inventory_schema.py`

**Interfaces:**
- Consumes: revision `20261121_0005`, `libraryhub.inventory_sessions`, `libraryhub.inventory_scans`, `libraryhub.app_users`
- Produces: table `libraryhub.inventory_review_decisions` and model `InventoryReviewDecision`. Session status check includes `in_review`.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/api/tests/api/test_inventory_schema.py`:

```python
def test_inventory_review_decisions_and_in_review_status(db):
    status_check = db.execute(
        text(
            """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conname = 'ck_inventory_sessions_status'
            """
        )
    ).scalar_one()
    assert "in_review" in status_check

    columns = set(
        db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'libraryhub'
                  AND table_name = 'inventory_review_decisions'
                """
            )
        ).scalars()
    )
    assert columns == {
        "id",
        "session_id",
        "scan_id",
        "action",
        "decision",
        "decided_by",
        "decided_at",
    }

    unique_scan = db.execute(
        text(
            """
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_inventory_review_decisions_scan_id'
            """
        )
    ).scalar_one_or_none()
    assert unique_scan == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/api`: `py -3 -m pytest tests/api/test_inventory_schema.py::test_inventory_review_decisions_and_in_review_status -v`

Expected: FAIL because the table and `in_review` check do not exist.

- [ ] **Step 3: Add the migration and model**

Create `apps/api/alembic/versions/20261121_0006_inventory_review.py` with `down_revision = "20261121_0005"`. `upgrade` drops `ck_inventory_sessions_status` and creates it again as `status in ('draft', 'in_progress', 'in_review', 'cancelled')`. It creates `libraryhub.inventory_review_decisions`:

- `id` UUID primary key, `server_default=gen_random_uuid()`
- `session_id` UUID not null, foreign key to `libraryhub.inventory_sessions.id`, `ON DELETE RESTRICT`
- `scan_id` UUID not null, foreign key to `libraryhub.inventory_scans.id`, `ON DELETE RESTRICT`
- `action` `String(80)` not null
- `decision` `String(32)` nullable
- `decided_by` UUID nullable, foreign key to `libraryhub.app_users.id`, `ON DELETE RESTRICT`
- `decided_at` `DateTime(timezone=True)` nullable
- unique constraint `uq_inventory_review_decisions_scan_id` on `scan_id`
- check `ck_inventory_review_decisions_decision`: `(decision is null and decided_by is null and decided_at is null) or (decision in ('approved', 'no_action') and decided_by is not null and decided_at is not null)`
- check `ck_inventory_review_decisions_action`: `char_length(action) between 1 and 80`

`downgrade` drops the table and restores the old status check without `in_review`.

In `InventorySession.__table_args__`, change the status check to include `'in_review'`. Add `InventoryReviewDecision` in the same file with those columns and the same two checks. `scan_id` is unique. `session_id`, `scan_id`, and `decided_by` use `ondelete="RESTRICT"`.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m alembic upgrade head`

Then: `py -3 -m pytest tests/api/test_inventory_schema.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/alembic/versions/20261121_0006_inventory_review.py apps/api/app/models/inventory.py apps/api/tests/api/test_inventory_schema.py
```

Message: `Add the inventory review decision table.`

---

### Task 2: Preset action pairs

**Files:**
- Create: `apps/api/app/services/inventory_review.py`
- Test: `apps/api/tests/unit/test_inventory_review.py`

**Interfaces:**
- Consumes: nothing from the database
- Produces: `actions_for(outcome: str) -> tuple[str, str] | None` and `action_allowed(outcome: str, action: str) -> bool`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_inventory_review.py`:

```python
from app.services.inventory_review import action_allowed, actions_for


def test_actions_for_each_exception_outcome():
    assert actions_for("not_found") == (
        "Search the shelf again",
        "Leave the Koha status unchanged",
    )
    assert actions_for("misplaced") == (
        "Reshelve to the session location",
        "Leave it where it was found",
    )
    assert actions_for("unexpected") == (
        "Check the Koha item record",
        "Reshelve to its home library",
    )
    assert actions_for("damaged") == (
        "Set the book aside for repair",
        "Leave it on the shelf",
    )
    assert actions_for("withdrawn") == (
        "Remove it from the shelf",
        "Leave it on the shelf",
    )
    assert actions_for("other_exception") == (
        "Set the book aside for a librarian",
        "Leave it on the shelf",
    )


def test_verified_and_duplicate_have_no_actions():
    assert actions_for("verified") is None
    assert actions_for("duplicate") is None
    assert action_allowed("verified", "Leave it on the shelf") is False


def test_leave_it_on_the_shelf_is_limited_to_three_outcomes():
    assert action_allowed("damaged", "Leave it on the shelf") is True
    assert action_allowed("withdrawn", "Leave it on the shelf") is True
    assert action_allowed("other_exception", "Leave it on the shelf") is True
    assert action_allowed("not_found", "Leave it on the shelf") is False
    assert action_allowed("damaged", "Search the shelf again") is False
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/unit/test_inventory_review.py -v`

Expected: FAIL with `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Write the allowlist**

```python
_PAIRS: dict[str, tuple[str, str]] = {
    "not_found": (
        "Search the shelf again",
        "Leave the Koha status unchanged",
    ),
    "misplaced": (
        "Reshelve to the session location",
        "Leave it where it was found",
    ),
    "unexpected": (
        "Check the Koha item record",
        "Reshelve to its home library",
    ),
    "damaged": (
        "Set the book aside for repair",
        "Leave it on the shelf",
    ),
    "withdrawn": (
        "Remove it from the shelf",
        "Leave it on the shelf",
    ),
    "other_exception": (
        "Set the book aside for a librarian",
        "Leave it on the shelf",
    ),
}


def actions_for(outcome: str) -> tuple[str, str] | None:
    return _PAIRS.get(outcome)


def action_allowed(outcome: str, action: str) -> bool:
    pair = _PAIRS.get(outcome)
    return pair is not None and action in pair
```

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/unit/test_inventory_review.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Allow two shelf-work sentences for each exception.`

---

### Task 3: Finish and resume

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `InventorySession`, `AuditLog`, `_fetch_session`, `_session_payload`
- Produces: `finish_session(db, *, user_id, department_id, session_id) -> dict` and `resume_session(db, *, user_id, department_id, session_id) -> dict`. Both return the session payload.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/api/test_inventory_service.py` and import `finish_session` and `resume_session`:

```python
def test_finish_and_resume_session(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)

    finished = finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert finished["status"] == "in_review"
    finish_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.finish", entity_id=str(session_id))
        .one()
    )
    assert finish_audit.module == "inventory"
    assert finish_audit.details["reference"] == started["reference"]

    for status_name in ("draft", "cancelled", "in_review"):
        if status_name == "draft":
            other = _create_draft(db, user, department_id, "Still a draft")
            target = UUID(other["id"])
        elif status_name == "cancelled":
            cancel_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=session_id,
            )
            target = session_id
        else:
            again, again_id = _started_session(db, user, department_id)
            finish_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=again_id,
            )
            target = again_id
        with pytest.raises(InventoryError) as exc:
            finish_session(
                db,
                user_id=user.id,
                department_id=department_id,
                session_id=target,
            )
        assert exc.value.status_code == 409
        assert exc.value.code == "session_not_scanning"
        assert exc.value.message == "Only a scanning session can be finished."
        assert db.get(InventorySession, target).status == status_name

    resumed = resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=again_id,
    )
    assert resumed["status"] == "in_progress"
    resume_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.session.resume", entity_id=str(again_id))
        .one()
    )
    assert resume_audit.details["reference"] == again["reference"]

    with pytest.raises(InventoryError) as exc:
        resume_session(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=again_id,
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_not_in_review"
    assert exc.value.message == "Only a session in review can return to scanning."
```

`_create_draft` already exists in this file. Use it. The `again` and `again_id` names must be assigned before the loop’s `in_review` branch reads them after the loop. Declare `again = None` and `again_id = None` before the loop, assign them in the `in_review` branch, and call `resume_session` with `again_id` after the loop.

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_finish_and_resume_session -v`

Expected: FAIL with `ImportError` for `finish_session`.

- [ ] **Step 3: Implement finish and resume**

Add the constants:

```python
_SESSION_NOT_SCANNING = (
    409,
    "session_not_scanning",
    "Only a scanning session can be finished.",
)
_SESSION_NOT_IN_REVIEW = (
    409,
    "session_not_in_review",
    "Only a session in review can return to scanning.",
)
```

Add `_STATUSES` value `"in_review"`.

```python
def finish_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status != "in_progress":
        _raise(*_SESSION_NOT_SCANNING)
    row.status = "in_review"
    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.finish",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(db, row)


def resume_session(
    db: Session,
    *,
    user_id: UUID,
    department_id: UUID | None,
    session_id: UUID,
) -> dict[str, Any]:
    row = _fetch_session(db, department_id=department_id, session_id=session_id)
    if row.status != "in_review":
        _raise(*_SESSION_NOT_IN_REVIEW)
    row.status = "in_progress"
    db.add(
        AuditLog(
            user_id=user_id,
            action="inventory.session.resume",
            module="inventory",
            entity_type="inventory_session",
            entity_id=str(row.id),
            details={"reference": row.reference},
        )
    )
    db.commit()
    db.refresh(row)
    return _session_payload(db, row)
```

Finish does not insert scans. Resume does not delete decision rows.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_finish_and_resume_session -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Finish an inventory session into review and resume it.`

---

### Task 4: Reject a scan during review

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `finish_session`, `resume_session`, `record_scan`
- Produces: `record_scan` raises `session_in_review` when the status is `in_review` and the `client_scan_id` is new.

- [ ] **Step 1: Write the failing test**

```python
def test_scan_rejected_during_review_and_accepted_after_resume(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    before = db.query(InventoryScan).filter_by(session_id=session_id).count()

    with pytest.raises(InventoryError) as exc:
        record_scan(
            db,
            _FakeKoha(),
            user_id=user.id,
            department_id=department_id,
            session_id=session_id,
            client_scan_id=uuid4(),
            barcode="NOSUCHBC21",
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "session_in_review"
    assert exc.value.message == "Return to scanning before recording a barcode."
    assert db.query(InventoryScan).filter_by(session_id=session_id).count() == before

    resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    saved = record_scan(
        db,
        _FakeKoha(items_by_barcode={"NOSUCHBC21": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="NOSUCHBC21",
    )
    assert saved["scan"]["outcome"] == "not_found"
```

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_scan_rejected_during_review_and_accepted_after_resume -v`

Expected: FAIL because the scan is stored or the code is not `session_in_review`.

- [ ] **Step 3: Reject the new scan**

Add:

```python
_SESSION_IN_REVIEW = (
    409,
    "session_in_review",
    "Return to scanning before recording a barcode.",
)
```

In `record_scan`, after the `cancelled` branch and before the primary-barcode lookup:

```python
if session.status == "in_review":
    _raise(*_SESSION_IN_REVIEW)
```

Leave the existing `client_scan_id` replay ahead of this check.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_scan_rejected_during_review_and_accepted_after_resume tests/api/test_inventory_service.py::test_record_scan_empty_koha_list_not_found -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Reject a new inventory scan while the session is in review.`

---

### Task 5: Title search and exception filter

**Files:**
- Modify: `apps/api/app/schemas/inventory.py`
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `ScanListParams`, `list_scans`, `list_sessions`
- Produces: `ScanListParams.exceptions: bool = False`. `list_scans` matches `q` against barcode or title. `list_sessions` accepts status `in_review`.

- [ ] **Step 1: Write the failing test**

```python
def test_list_scans_matches_title_and_exceptions(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(
        items_by_barcode={
            "ITEM-101": [_AVAILABLE_ITEM],
            "GONE": [],
        }
    )
    record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="ITEM-101",
    )
    record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )

    by_title = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(q="Intro Python"),
    )
    assert [item["barcode"] for item in by_title["items"]] == ["ITEM-101"]

    exceptions = list_scans(
        db,
        department_id=department_id,
        session_id=session_id,
        params=ScanListParams(exceptions=True),
    )
    assert [item["outcome"] for item in exceptions["items"]] == ["not_found"]

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(q="x" * 81),
        )
    assert exc.value.code == "invalid_search"

    with pytest.raises(InventoryError) as exc:
        list_scans(
            db,
            department_id=department_id,
            session_id=session_id,
            params=ScanListParams(outcome="not_found", exceptions=True),
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "invalid_search"
    assert exc.value.message == "That search is not valid."


def test_list_sessions_accepts_in_review(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    listed = list_sessions(
        db,
        department_id=department_id,
        params=SessionListParams(status="in_review"),
    )
    assert [item["id"] for item in listed["items"]] == [str(session_id)]
```

Confirm `_AVAILABLE_ITEM` is in scope at home library `CPL` and location `GEN`, so the first scan is `verified` and the empty barcode is `not_found`.

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_list_scans_matches_title_and_exceptions tests/api/test_inventory_service.py::test_list_sessions_accepts_in_review -v`

Expected: FAIL because `exceptions` is not a field or the title search returns nothing.

- [ ] **Step 3: Implement the filters**

Add `exceptions: bool = False` to `ScanListParams`.

In `_validate_scan_list_params`, change the `q` length cap from 32 to 80. After the outcome check:

```python
if params.exceptions and params.outcome is not None:
    _raise(*_INVALID_SEARCH)
```

In `list_scans`, replace the barcode-only filter with:

```python
if params.q:
    pattern = f"%{escape_like(params.q)}%"
    query = query.filter(
        or_(
            InventoryScan.barcode.like(pattern, escape="\\"),
            InventoryScan.title.like(pattern, escape="\\"),
        )
    )
if params.exceptions:
    query = query.filter(
        InventoryScan.is_primary.is_(True),
        InventoryScan.outcome != "verified",
    )
```

`_STATUSES` already includes `in_review` from Task 3, which is what lets `list_sessions` accept it.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_list_scans_matches_title_and_exceptions tests/api/test_inventory_service.py::test_list_sessions_accepts_in_review tests/api/test_inventory_service.py::test_list_scans_filters_and_sorts -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Search inventory scans by title and list exception primaries.`

---

### Task 6: Save a review decision

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `InventoryReviewDecision`, `action_allowed`, `finish_session`
- Produces: `save_decision(db, *, user_id, display_name, department_id, session_id, scan_id, action, decision) -> dict` with keys `scan_id`, `action`, `decision`, `decided_by`, `decided_at`.

- [ ] **Step 1: Write the failing test**

```python
def test_save_decision_only_for_an_exception_during_review(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    client = _FakeKoha(items_by_barcode={"ITEM-101": [_AVAILABLE_ITEM], "GONE": []})
    verified = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="ITEM-101",
    )
    missing = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    duplicate = record_scan(
        db,
        client,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    scan_id = UUID(missing["scan"]["id"])

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=UUID(verified["scan"]["id"]),
            action="Search the shelf again",
            decision=None,
        )
    assert exc.value.status_code == 404
    assert exc.value.message == "That inventory scan was not found."

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=UUID(duplicate["scan"]["id"]),
            action="Search the shelf again",
            decision=None,
        )
    assert exc.value.code == "not_found"

    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=scan_id,
            action="Leave it on the shelf",
            decision=None,
        )
    assert exc.value.status_code == 422
    assert exc.value.code == "validation_error"
    assert exc.value.message == "That inventory session is not valid."
    assert exc.value.fields == [{"name": "action", "message": "This value is not valid."}]

    chosen = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision=None,
    )
    assert chosen["decision"] is None
    assert chosen["decided_by"] is None
    assert chosen["decided_at"] is None

    approved = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision="approved",
    )
    assert approved["decided_by"] == "Inv Librarian"
    assert approved["decided_at"] is not None

    cleared = save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Leave the Koha status unchanged",
        decision=None,
    )
    assert cleared["decision"] is None
    row = db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one()
    assert row.decided_by is None
    assert row.decided_at is None

    decide_audit = (
        db.query(AuditLog)
        .filter_by(action="inventory.review.decide", entity_id=str(scan_id))
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert decide_audit.details["decision"] is None
    assert decide_audit.details["barcode"] == "GONE"

    resume_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    with pytest.raises(InventoryError) as exc:
        save_decision(
            db,
            user_id=user.id,
            display_name=user.display_name,
            department_id=department_id,
            session_id=session_id,
            scan_id=scan_id,
            action="Search the shelf again",
            decision="no_action",
        )
    assert exc.value.code == "session_not_in_review"
    assert exc.value.message == "Finish the session before reviewing exceptions."
    assert db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one().action == (
        "Leave the Koha status unchanged"
    )
```

Import `InventoryReviewDecision` and `save_decision`. A second session’s scan id passed with this `session_id` must also return `not_found`. Add that assertion with a scan from `_started_session` on a second call.

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_save_decision_only_for_an_exception_during_review -v`

Expected: FAIL with `ImportError` for `save_decision`.

- [ ] **Step 3: Implement save_decision**

`decision` must be `None`, `"approved"`, or `"no_action"`. Any other value is `validation_error` on field `decision` with message “This value is not valid.”

Load the session. If `status != "in_review"`, raise `_SESSION_NOT_IN_REVIEW` with message “Finish the session before reviewing exceptions.” Use a separate constant from the resume message so the sentences stay distinct:

```python
_DECISION_NOT_IN_REVIEW = (
    409,
    "session_not_in_review",
    "Finish the session before reviewing exceptions.",
)
_SCAN_NOT_FOUND = (404, "not_found", "That inventory scan was not found.")
```

Load the scan by `id` and `session_id`. If it is missing, not primary, or `outcome == "verified"`, raise `_SCAN_NOT_FOUND`. If `action_allowed(scan.outcome, action)` is false, raise the action validation error.

Upsert one `InventoryReviewDecision` for that `scan_id`. Set `session_id` and `action`. When `decision` is null, set `decision`, `decided_by`, and `decided_at` to null. Otherwise set `decision`, `decided_by=user_id`, and `decided_at=datetime.now(UTC)`.

Write `inventory.review.decide` with `entity_type="inventory_scan"`, `entity_id=str(scan.id)`, and details `reference`, `barcode`, `action`, and `decision`. Commit and return:

```python
{
    "scan_id": str(scan.id),
    "action": saved.action,
    "decision": saved.decision,
    "decided_by": display_name if saved.decision is not None else None,
    "decided_at": _iso(saved.decided_at),
}
```

Add this second test in the same file:

```python
def test_cancel_from_review_keeps_the_decision(db):
    user, department_id = _user_and_department(db)
    _started, session_id = _started_session(db, user, department_id)
    missing = record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    scan_id = UUID(missing["scan"]["id"])
    save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=scan_id,
        action="Search the shelf again",
        decision="no_action",
    )
    cancelled = cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert cancelled["status"] == "cancelled"
    assert db.query(InventoryScan).filter_by(session_id=session_id).count() == 1
    assert db.query(InventoryReviewDecision).filter_by(scan_id=scan_id).one().decision == "no_action"
```

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_save_decision_only_for_an_exception_during_review tests/api/test_inventory_service.py::test_cancel_from_review_keeps_the_decision -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Save an inventory exception action without changing Koha.`

---

### Task 7: Export the exception CSV

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `InventoryReviewDecision`, `save_decision`, `AppUser.display_name`
- Produces: `export_exceptions(db, *, user_id, department_id, session_id) -> tuple[str, str]`. The first value is the filename. The second is the CSV text, including a trailing newline.

- [ ] **Step 1: Write the failing test**

```python
import csv
import io


def test_export_exceptions_csv(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)
    missing = record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    save_decision(
        db,
        user_id=user.id,
        display_name=user.display_name,
        department_id=department_id,
        session_id=session_id,
        scan_id=UUID(missing["scan"]["id"]),
        action="Search the shelf again",
        decision="approved",
    )

    filename, body = export_exceptions(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert filename == f"{started['reference']}-exceptions.csv"
    rows = list(csv.DictReader(io.StringIO(body)))
    assert list(rows[0]) == [
        "barcode",
        "title",
        "call_number",
        "outcome",
        "message",
        "action",
        "decision",
        "decided_by",
        "decided_at",
    ]
    assert rows[0]["barcode"] == "GONE"
    assert rows[0]["decision"] == "approved"
    assert rows[0]["decided_by"] == "Inv Librarian"
    assert db.get(InventorySession, session_id).status == "in_review"
    assert (
        db.query(AuditLog)
        .filter_by(action="inventory.review.export", entity_id=str(session_id))
        .count()
        == 1
    )

    cancel_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    export_exceptions(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )
    assert (
        db.query(AuditLog)
        .filter_by(action="inventory.review.export", entity_id=str(session_id))
        .count()
        == 2
    )

    draft = _create_draft(db, user, department_id, "Not ready")
    with pytest.raises(InventoryError) as exc:
        export_exceptions(
            db,
            user_id=user.id,
            department_id=department_id,
            session_id=UUID(draft["id"]),
        )
    assert exc.value.status_code == 409
    assert exc.value.code == "export_not_ready"
    assert exc.value.message == "Export is available after scanning is finished."
```

Before the draft assertion, start a second session and call `export_exceptions` while it is still `in_progress`. Expect the same `export_not_ready` error. For a finished session whose only scan is the verified `ITEM-101` item, `body.strip()` equals `barcode,title,call_number,outcome,message,action,decision,decided_by,decided_at`.

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_export_exceptions_csv -v`

Expected: FAIL with `ImportError` for `export_exceptions`.

- [ ] **Step 3: Implement the CSV**

```python
_EXPORT_NOT_READY = (
    409,
    "export_not_ready",
    "Export is available after scanning is finished.",
)
_CSV_COLUMNS = (
    "barcode",
    "title",
    "call_number",
    "outcome",
    "message",
    "action",
    "decision",
    "decided_by",
    "decided_at",
)
```

Load the session. If status is not `in_review` or `cancelled`, raise `_EXPORT_NOT_READY`. Query primary scans for that session whose outcome is not `verified`, ordered by `scanned_at` ascending, then `id` ascending. Left-join `InventoryReviewDecision` on `scan_id`. Left-join `AppUser` on `decided_by` for the display name.

Write the CSV with `csv.writer`. Empty title, call number, action, decision, display name, and timestamp become `""`. `decided_at` uses `_iso`. Count the data rows. Add an audit row `inventory.review.export`, `entity_type="inventory_session"`, `entity_id` the session id, details `reference` and `row_count`. Commit. Return `f"{session.reference}-exceptions.csv"` and the CSV text. Do not change `session.status`.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_export_exceptions_csv -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Download the inventory exception list as CSV.`

---

### Task 8: List session audit

**Files:**
- Modify: `apps/api/app/services/inventory.py`
- Test: `apps/api/tests/api/test_inventory_service.py`

**Interfaces:**
- Consumes: `AuditLog`, `AppUser`, `_fetch_session`
- Produces: `list_session_audit(db, *, department_id, session_id) -> dict` with `items`, at most 40, newest `created_at` first. Each item has `action`, `details`, `actor_name`, and `created_at`.

- [ ] **Step 1: Write the failing test**

```python
def test_list_session_audit(db):
    user, department_id = _user_and_department(db)
    started, session_id = _started_session(db, user, department_id)
    record_scan(
        db,
        _FakeKoha(items_by_barcode={"GONE": []}),
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
        client_scan_id=uuid4(),
        barcode="GONE",
    )
    finish_session(
        db,
        user_id=user.id,
        department_id=department_id,
        session_id=session_id,
    )

    listed = list_session_audit(
        db,
        department_id=department_id,
        session_id=session_id,
    )
    assert listed["items"][0]["action"] == "inventory.session.finish"
    assert listed["items"][0]["actor_name"] == "Inv Librarian"
    assert listed["items"][0]["created_at"]
    scan_rows = [item for item in listed["items"] if item["action"] == "inventory.scan"]
    assert scan_rows[0]["details"]["barcode"] == "GONE"
    assert scan_rows[0]["details"]["reference"] == started["reference"]
    assert "entity_id" not in scan_rows[0]

    hidden = _create_draft(db, user, _other_department_id(db), "Other department")
    with pytest.raises(InventoryError) as exc:
        list_session_audit(
            db,
            department_id=department_id,
            session_id=UUID(hidden["id"]),
        )
    assert exc.value.status_code == 404
    assert exc.value.message == "That inventory session was not found."
```

`_other_department_id` is already defined in this test file. Import `list_session_audit`.

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_list_session_audit -v`

Expected: FAIL with `ImportError` for `list_session_audit`.

- [ ] **Step 3: Implement the query**

Fetch the session. Collect its scan ids as strings. Query `AuditLog` left-joined to `AppUser` where `module == "inventory"` and either `entity_id == str(session.id)` or `entity_id` is in the scan id list. Order by `created_at` descending and limit 40. `actor_name` is `AppUser.display_name` or `""`. `created_at` is `_iso`. `details` is the JSON object or `{}`.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_service.py::test_list_session_audit -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `List the audit rows for one inventory session.`

---

### Task 9: HTTP routes

**Files:**
- Modify: `apps/api/app/schemas/inventory.py`
- Modify: `apps/api/app/api/routes/inventory.py`
- Test: `apps/api/tests/api/test_inventory_http.py`

**Interfaces:**
- Consumes: `finish_session`, `resume_session`, `save_decision`, `export_exceptions`, `list_session_audit`, `require_inventory_user`, `_assert_write_csrf`
- Produces: `DecisionIn` with `action: str` and `decision: Literal["approved", "no_action"] | None = None`. Routes `POST /sessions/{id}/finish`, `POST /sessions/{id}/resume`, `PUT /sessions/{id}/scans/{scanId}/decision`, `GET /sessions/{id}/exceptions.csv`, and `GET /sessions/{id}/audit`.

- [ ] **Step 1: Write the failing test**

In `test_inventory_http.py`, sign in as the librarian helper already used by `test_start_and_scan_verified`. Create a session, start it, post barcode `GONE` against the fake Koha handler that returns an empty list, then:

- `POST .../finish` returns 200 and `"status": "in_review"`.
- `POST .../scans` during review returns 409 `session_in_review`.
- `PUT .../scans/{scan_id}/decision` with `{ "action": "Search the shelf again", "decision": "approved" }` returns 200 and `"decided_by": "Inv Librarian"`.
- `POST .../finish`, `POST .../resume`, and the decision `PUT` without `csrf_headers` each return 403 `csrf_failed`. Call resume only after a successful finish, and use a fresh session for the missing-header finish check so the successful path still has a session to finish.
- `GET .../exceptions.csv` returns 200, `content-type` containing `text/csv`, and `content-disposition` containing `{reference}-exceptions.csv`. The body starts with `barcode,title,call_number,outcome,message,action,decision,decided_by,decided_at`.
- `GET .../audit` returns 200 and an `items` entry whose `action` is `inventory.review.export`.
- A student login receives 403 `permission_denied` and “You do not have access to inventory.” on finish.

Use the file’s `_login`, `_add_librarian`, `csrf_headers`, and Koha patch helpers. A non-UUID session id returns 404 “That inventory session was not found.”

- [ ] **Step 2: Run the test to verify it fails**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_http.py::test_finish_review_export -v`

Expected: FAIL with 404 or 405 on `/finish`.

- [ ] **Step 3: Add the routes**

Follow `inventory_start_session` for finish and resume: parse the id, require CSRF, call the service, and map `InventoryError` through `_raise_inventory`.

The decision route parses both ids. A bad scan id is 404 with “That inventory scan was not found.” Pass `payload.user.display_name` into `save_decision`. Require CSRF.

The CSV route calls `export_exceptions` and returns `Response(content=body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{filename}"'})`. Do not require CSRF.

The audit route returns `list_session_audit`.

Register `/sessions/{session_id}/exceptions.csv` and `/sessions/{session_id}/scans/{scan_id}/decision` so they do not get captured by a looser path. The existing `GET /sessions/{session_id}` stays an exact path.

- [ ] **Step 4: Run the test to verify it passes**

From `apps/api`: `py -3 -m pytest tests/api/test_inventory_http.py tests/api/test_inventory_service.py tests/unit/test_inventory_review.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Expose inventory review, export, and audit on the staff API.`

---

### Task 10: List and create copy

**Files:**
- Modify: `apps/web/lib/inventory/types.ts`
- Modify: `apps/web/lib/inventory/search-params.ts`
- Modify: `apps/web/components/inventory/session-list.tsx`
- Modify: `apps/web/components/inventory/session-form.tsx`

**Interfaces:**
- Consumes: the session list response, which can now include `status: "in_review"`
- Produces: `InventorySessionStatus` includes `"in_review"`. The list heading, description, and button use the Global Constraints copy.

- [ ] **Step 1: Write the failing typecheck**

Add `"in_review"` to the status union in `types.ts` and to `STATUS_VALUES` in `search-params.ts`. In `session-list.tsx`, pass a status label function a value `"in_review"` and expect the string `In review` to type-check as a returned label. Run from `apps/web`: `npm run typecheck`

Expected: FAIL until the label function and the union agree. If the union is updated in this same step, the failure is the missing label branch: leave the label function unchanged for this run, then fix it in Step 2.

- [ ] **Step 2: Update the copy**

`InventorySessionStatus` is `"draft" | "in_progress" | "in_review" | "cancelled"`. `search-params.ts` accepts `in_review` and still falls back to `""` for any other status.

`session-list.tsx` title is `Inventory & Stocktaking`. Description is `Plan, scan, and review shelf checks against Koha item records. Item status changes stay in Koha.` The button text is `New stocktake` and still links to `/inventory/new` with `nativeButton={false}`. The status option and the status cell say `In review` for `in_review`. Search placeholder, columns, pagination, empty copy, and the Choose a department card stay. The list card keeps `rounded-lg border border-border bg-card`.

`session-form.tsx` uses the same description. Fields stay Name, Library, and Shelving location code. The location hint stays `Leave blank for the whole library. The code must match Koha exactly.` The form stays inside `bg-card`.

- [ ] **Step 3: Run the typecheck**

From `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

Message: `Restyle the inventory list and name the review status.`

---

### Task 11: Workstation header and counts

**Files:**
- Modify: `apps/web/components/inventory/session-view.tsx`
- Modify: `apps/web/app/(app)/inventory/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `GET /sessions/{id}`, `POST /sessions/{id}/finish`, `POST /sessions/{id}/resume`, the existing start and cancel posts
- Produces: the session page heading is the reference and name. `ModuleFrame` is not rendered on this page.

- [ ] **Step 1: Remove the module frame from the session page**

The page file already renders `SessionView` after `gatePage("inventory.view")`. Keep that gate and the Choose a department card. In `session-view.tsx`, delete the `ModuleFrame` wrapper. The first heading is an `h1` with `font-display` containing the reference and the name.

- [ ] **Step 2: Build the header, stepper, progress, and cards**

Status pill text is Draft, In progress, In review, or Cancelled. Null location reads `Whole library`.

Actions:

- `draft`: `Start scanning` and `Cancel session`
- `in_progress`: `Finish scanning` and `Cancel session`
- `in_review`: `Back to scanning` and `Cancel session`
- `cancelled`: the word Cancelled, and no scanner

`Finish scanning` posts `/api/v1/inventory/sessions/{id}/finish` and refetches. `Back to scanning` posts `.../resume` and refetches. Cancel still confirms with `Cancel this inventory session?` and posts `.../cancel`. All four actions are `min-h-11`.

The stepper is an ordered list: Plan, Scan, Review, Submit. Plan is current on `draft`, Scan on `in_progress`, Review on `in_review`. Submit is a button labeled `Export exceptions`, disabled unless status is `in_review` or `cancelled`. This task disables it always; Task 12 wires the download. The current step uses `text-maroon-700`.

Progress text is `` `${session.counters.seen} of ${session.expected_count} expected items seen` ``. The bar width is `0%` when `expected_count` is 0, otherwise `Math.min(100, (seen / expected_count) * 100)%`. Use `bg-maroon-700` for the fill and `bg-muted` for the track.

Seven cards read Expected, Verified, Not found, Misplaced, Unexpected, Damaged, and Withdrawn from `expected_count` and the matching counter fields. The number uses `font-display`. On viewports below `md`, the cards wrap to two columns. They do not overflow the page.

The scan panel, including the field, Type barcode, sound, result, and `Checking Koha…`, renders only when `status === "in_progress"`. Draft still shows the zero-count sentence when `expected_count` is 0. The existing scan table remains until Task 12 replaces its filters.

- [ ] **Step 3: Run the typecheck**

From `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

Message: `Show the inventory stepper, progress, and count cards.`

---

### Task 12: Exception review

**Files:**
- Create: `apps/web/lib/inventory/actions.ts`
- Create: `apps/web/lib/inventory/actions.test.ts`
- Modify: `apps/web/components/inventory/session-view.tsx`
- Modify: `apps/web/package.json` only if the inventory test glob does not already include `lib/inventory/*.test.ts`

**Interfaces:**
- Consumes: `actions_for` sentences from Task 2, `PUT .../scans/{scanId}/decision`, `GET .../exceptions.csv`, `GET .../scans?exceptions=1`
- Produces: `actionsFor(outcome: InventoryScanOutcome): [string, string] | null`

- [ ] **Step 1: Write the failing node test**

Create `apps/web/lib/inventory/actions.test.ts` that imports `actionsFor` and asserts the `not_found` pair is `["Search the shelf again", "Leave the Koha status unchanged"]`, the `damaged` pair includes `Leave it on the shelf`, and `actionsFor("verified")` and `actionsFor("duplicate")` are null.

Run from `apps/web`: `npm test`

Expected: FAIL because `actions.ts` does not exist.

- [ ] **Step 2: Add the pairs and the review panel**

`actions.ts` exports `actionsFor` with the six pairs from Global Constraints.

The scan table keeps 20 rows per page. Its search still updates `q` and now matches barcode or title because Task 5 does that on the server. Chips are All, Exceptions, Verified, Misplaced, Unexpected, Not found, Withdrawn, Damaged, Other exception, and Duplicate. Exceptions sets `exceptions=1` and clears `outcome`. Each other chip sets `outcome` to that value and `exceptions` false. All clears both. The chip row wraps and each chip is at least 44px tall.

Below the table, render one review row per item from `GET /api/v1/inventory/sessions/{id}/scans?exceptions=1&per_page=20&page={reviewPage}`. Show barcode, title or `No title from Koha`, outcome label, and message. The preset control lists the two `actionsFor` sentences. Approve and No action are `disabled` until a sentence is selected, and also `disabled` when status is not `in_review`. Changing the preset sends `PUT` with `{ action, decision: null }`. Approve sends `decision: "approved"`. No action sends `decision: "no_action"`. A failed put shows `error.message` on that row. An empty exception list shows `No exceptions to review.` The same rows stay visible on draft, in progress, and cancelled, with the controls disabled.

`Export exceptions` fetches `/api/v1/inventory/sessions/{id}/exceptions.csv` with the session credentials used by `fetchApi`. On 200, download the blob with the filename from `Content-Disposition`, falling back to `exceptions.csv`. On an error JSON body, show `message`. The button is enabled only for `in_review` and `cancelled`.

- [ ] **Step 3: Run the tests and the typecheck**

From `apps/web`: `npm test` and `npm run typecheck`

Expected: PASS. The node suite still includes the queue tests.

- [ ] **Step 4: Commit**

Message: `Review inventory exceptions and download the CSV.`

---

### Task 13: Sidebar and browser check

**Files:**
- Modify: `apps/web/components/inventory/session-view.tsx`
- Modify: `docs/koha-integration.md`

**Interfaces:**
- Consumes: `GET /sessions/{id}/scans?per_page=12`, `GET /sessions/{id}/audit`, `GET /sessions?per_page=20`
- Produces: a sidebar on the session page. The Koha doc states that review and export do not call Koha.

- [ ] **Step 1: Add the sidebar**

On `lg` and wider, the sidebar sits beside the table. Below `lg`, it stacks under the review panel and does not cause horizontal scroll.

Three groups:

- Latest scans. `GET /api/v1/inventory/sessions/{id}/scans?per_page=12&sort=scanned_at&direction=desc`. Each line shows the barcode and the outcome label.
- Audit. `GET /api/v1/inventory/sessions/{id}/audit`. Each line shows `action`, `actor_name`, and `created_at`. Show the `details` object only as its `reference` when present. Do not show a percentage.
- Other sessions. `GET /api/v1/inventory/sessions?per_page=20&sort=created_at&direction=desc`. Omit the current id. Link the first five remaining rows to `/inventory/{id}` with the reference and status label.

- [ ] **Step 2: Update the Koha doc**

In the Inventory section of `docs/koha-integration.md`, add that finish, resume, decision, export, and audit read PostgreSQL only. Export does not call Koha. Point to `docs/superpowers/specs/2026-11-21-inventory-workstation-design.md`.

- [ ] **Step 3: Run the automated tests**

From `apps/api`: `py -3 -m pytest tests/unit/test_inventory_review.py tests/unit/test_inventory_classify.py tests/unit/test_inventory_counters.py tests/api/test_inventory_service.py tests/api/test_inventory_schema.py tests/api/test_inventory_http.py -v`

From `apps/web`: `npm test` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Check the workstation in the browser**

With `npm run dev:api` and `npm run dev` running, sign in as a librarian. Confirm:

- `/inventory` with no department shows `Choose a department` and does not request `/api/v1/inventory/sessions`.
- With a department, the heading is `Inventory & Stocktaking` and the button is `New stocktake`.
- Finish scanning hides the barcode field. Back to scanning shows it again.
- Approve stays disabled until a preset is chosen.
- Export downloads `{reference}-exceptions.csv`.
- At 390px width the session page has no horizontal scroll.

- [ ] **Step 5: Commit**

Message: `Show inventory audit beside the workstation.`

Include `docs/koha-integration.md` and `session-view.tsx` only. Do not stage `plan/prototype2.html`, `plan/inventory.html`, or the scanning spec status edit.
