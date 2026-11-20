# Staff patron management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized staff search and open live Koha patrons, and let Super Administrators and Library Administrators create and update those patrons.

**Architecture:** The browser keeps patron search in the URL and calls `/api/v1/patrons`. A patron service builds the Koha query, strips fields by permission, overlays updates onto the current Koha record, and writes audit rows. The existing Koha client performs the HTTP calls. No patron table is created.

**Tech Stack:** FastAPI, HTTPX, Pydantic, Alembic, pytest, Next.js 16, TanStack Query, shadcn Dialog, Select, and Pagination, node:test.

## Global Constraints

- Koha remains the patron authority. Do not store a patron copy. Do not create `patron_links`. Leave the student page placeholder unchanged.
- Search and detail require `patrons.view`. Create requires `patrons.create`. Update requires `patrons.update`. Date of birth, primary address, and staff notes require `patrons.sensitive.view`.
- The new permissions belong only to Super Administrator and Library Administrator. Librarian, Department Head, Student, and Auditor do not receive them.
- Directory fields are `patron_id`, `firstname`, `surname`, `preferred_name`, `cardnumber`, `category_id`, `category_name`, `library_id`, `library_name`, `expiry_date`, `expired`, `restricted`, `patron_card_lost`, `checkouts_count`, `overdues_count`. Email, phone, userid, date of birth, address, and staff notes stay off the directory.
- Detail adds `userid`, `email`, `phone`, `mobile`, and `date_enrolled`. Sensitive callers also receive `date_of_birth`, `address`, `address2`, `city`, `state`, `postal_code`, `country`, and `staff_notes`.
- Empty `q` browses. A word matches surname, firstname, preferred_name, cardnumber, and userid. Several words require each word on a name field, or the whole string on cardnumber or userid. Use `escape_like`.
- Page default is 20, maximum 50. Sort default is surname ascending. Sorts are `surname`, `firstname`, `cardnumber`, `category_id`, `expiry_date`.
- Status `active` sends `expired` 0 and `restricted` 0. `expired` sends `expired` 1. `restricted` sends `restricted` 1.
- Create requires `surname`, `library_id`, and `category_id`. Update loads the Koha patron, overlays allowlisted keys, and PUTs the merge. `confirm_duplicate` sends `x-confirm-not-duplicate` on POST only.
- A Koha 409 is `409` `patron_duplicate`. Do not delete, suspend, merge, or call fines, extended attributes, password, or public patron routes.
- Loan barcodes require `catalog.barcode.view`. Overdue uses the calendar date in `Asia/Manila`.
- Audit `patrons.detail`, `patrons.create`, and `patrons.update` with field names only. Do not audit search.
- Error sentences: “Patron records are unavailable. Try again.” “Patron records took too long to respond. Try again.” “That patron was not found.” “That search is not valid.” “Koha did not accept the patron record.” “You do not have access to patron records.”
- Page copy: title “Patron Management”. Description “Search Koha patron records by name, card number, or userid. People who share a name stay separate records. Records are never merged.” Search guidance “Name, card number, or userid”.
- Pytest uses `httpx.MockTransport` and does not open a socket to Koha. Leave `apps/api/app/integrations/koha/patrons.py`, `circulation.py`, and `holds.py` as stubs.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains that trailer, replace the commit with `git commit-tree` as required by `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/alembic/versions/20261120_0004_patron_permissions.py` | Three permissions and the two admin grants |
| `apps/api/app/integrations/koha/exceptions.py` | `KohaRequestError` with status and field names |
| `apps/api/app/integrations/koha/client.py` | POST, PUT, patron reads, and the confirm header |
| `apps/api/app/integrations/koha/patron_query.py` | Koha `q` and `_order_by` |
| `apps/api/app/services/patrons.py` | Validation, stripping, overlay, loans, holds, audit |
| `apps/api/app/schemas/patrons.py` | Search and write models |
| `apps/api/app/api/dependencies/session.py` | Patron permission dependency |
| `apps/api/app/api/routes/patrons.py` | `/api/v1/patrons` routes |
| `apps/api/app/api/routes/__init__.py` | Export the router |
| `apps/api/app/main.py` | Include the router |
| `apps/web/lib/patrons/search-params.ts` | URL state |
| `apps/web/lib/patrons/display.ts` | Name, initials, badges, overdue |
| `apps/web/lib/patrons/types.ts` | Response types |
| `apps/web/components/patrons/patron-directory.tsx` | Search, table, pagination |
| `apps/web/components/patrons/patron-detail.tsx` | Profile, loans, holds |
| `apps/web/components/patrons/patron-form-dialog.tsx` | Create and update |
| `apps/web/app/(app)/patrons/page.tsx` | Directory gate |
| `apps/web/app/(app)/patrons/[patronId]/page.tsx` | Detail gate |
| `docs/koha-integration.md` | Patron operations that this module calls |

---

### Task 1: Patron permissions

**Files:**
- Create: `apps/api/alembic/versions/20261120_0004_patron_permissions.py`
- Create: `apps/api/tests/api/test_patron_schema.py`
- Test: `apps/api/tests/api/test_patron_schema.py`

**Interfaces:**
- Consumes: revision `20261117_0003`, schema `libraryhub`, tables `permissions` and `role_permissions`
- Produces: permission codes `patrons.sensitive.view`, `patrons.create`, `patrons.update`, module `patrons`, granted only to `Super Administrator` and `Library Administrator`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_patron_schema.py`:

```python
from sqlalchemy import text

from app.models.identity import Permission


CODES = ("patrons.sensitive.view", "patrons.create", "patrons.update")
ADMINS = ("Super Administrator", "Library Administrator")
OTHERS = ("Department Head", "Librarian", "Student", "Auditor")


def test_patron_write_permissions_belong_to_admins(db):
    rows = db.query(Permission).filter(Permission.code.in_(CODES)).all()
    assert {row.code for row in rows} == set(CODES)
    assert {row.module for row in rows} == {"patrons"}
    granted = db.execute(text("""
        SELECT r.name, p.code
        FROM libraryhub.roles r
        JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
        JOIN libraryhub.permissions p ON p.id = rp.permission_id
        WHERE p.code IN ('patrons.sensitive.view', 'patrons.create', 'patrons.update')
    """)).all()
    by_role: dict[str, set[str]] = {}
    for name, code in granted:
        by_role.setdefault(name, set()).add(code)
    for name in ADMINS:
        assert by_role[name] == set(CODES)
    for name in OTHERS:
        assert name not in by_role
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_patron_schema.py -v`

Expected: FAIL because the permission rows do not exist.

- [ ] **Step 3: Add the migration**

Create `apps/api/alembic/versions/20261120_0004_patron_permissions.py`. `revision` is `20261120_0004`. `down_revision` is `20261117_0003`. `upgrade` inserts these rows when missing, then grants each code to each admin role when missing:

| code | description |
|---|---|
| `patrons.sensitive.view` | View date of birth, address, and staff notes |
| `patrons.create` | Create a Koha patron |
| `patrons.update` | Update a Koha patron |

Use the same `INSERT … WHERE NOT EXISTS` SQL shape as `20261117_0003_catalog_searches.py`. `downgrade` deletes the three `role_permissions` rows and then the three `permissions` rows.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_patron_schema.py -v`

Expected: PASS. Apply the revision with `py -3 -m alembic upgrade head` from `apps/api` before the test if the test database is behind.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/alembic/versions/20261120_0004_patron_permissions.py apps/api/tests/api/test_patron_schema.py
git commit -F <msgfile>
```

Message: `Grant patron create, update, and sensitive view to administrators.`

---

### Task 2: Patron search query

**Files:**
- Create: `apps/api/app/integrations/koha/patron_query.py`
- Create: `apps/api/tests/unit/test_patron_query.py`
- Test: `apps/api/tests/unit/test_patron_query.py`

**Interfaces:**
- Consumes: `escape_like` from `app.integrations.koha.query`
- Produces: `build_patron_query(text: str, *, category_id: str | None = None, library_id: str | None = None, status: str | None = None) -> dict | None` and `patron_order_by(sort: str, direction: str) -> str`. `None` means send no Koha `q`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_patron_query.py`:

```python
from app.integrations.koha.patron_query import build_patron_query, patron_order_by


def test_empty_browse_and_one_word():
    assert build_patron_query("  ") is None
    assert build_patron_query("Ada%") == {
        "-or": [
            {"surname": {"-like": "%Ada\\%%"}},
            {"firstname": {"-like": "%Ada\\%%"}},
            {"preferred_name": {"-like": "%Ada\\%%"}},
            {"cardnumber": {"-like": "%Ada\\%%"}},
            {"userid": {"-like": "%Ada\\%%"}},
        ]
    }


def test_two_words_require_each_name_word_or_the_whole_identifier():
    assert build_patron_query("Ada Cruz", category_id="ST", library_id="CPL", status="active") == {
        "category_id": "ST",
        "library_id": "CPL",
        "expired": 0,
        "restricted": 0,
        "-or": [
            {"-and": [
                {"-or": [
                    {"surname": {"-like": "%Ada%"}},
                    {"firstname": {"-like": "%Ada%"}},
                    {"preferred_name": {"-like": "%Ada%"}},
                ]},
                {"-or": [
                    {"surname": {"-like": "%Cruz%"}},
                    {"firstname": {"-like": "%Cruz%"}},
                    {"preferred_name": {"-like": "%Cruz%"}},
                ]},
            ]},
            {"cardnumber": {"-like": "%Ada Cruz%"}},
            {"userid": {"-like": "%Ada Cruz%"}},
        ],
    }


def test_status_and_sort():
    assert build_patron_query("", status="expired") == {"expired": 1}
    assert build_patron_query("", status="restricted") == {"restricted": 1}
    assert patron_order_by("surname", "asc") == "surname"
    assert patron_order_by("expiry_date", "desc") == "-expiry_date"
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_query.py -v`

Expected: FAIL with `ModuleNotFoundError` for `patron_query`.

- [ ] **Step 3: Build the query**

Create `apps/api/app/integrations/koha/patron_query.py`:

```python
from app.integrations.koha.query import escape_like

_NAME_FIELDS = ("surname", "firstname", "preferred_name")
_ONE_WORD_FIELDS = _NAME_FIELDS + ("cardnumber", "userid")


def _like(field: str, text: str) -> dict:
    return {field: {"-like": f"%{escape_like(text)}%"}}


def _text_clause(text: str) -> dict | None:
    stripped = text.strip()
    words = stripped.split()
    if not words:
        return None
    if len(words) == 1:
        return {"-or": [_like(field, words[0]) for field in _ONE_WORD_FIELDS]}
    names = {
        "-and": [
            {"-or": [_like(field, word) for field in _NAME_FIELDS]}
            for word in words
        ]
    }
    return {"-or": [names, _like("cardnumber", stripped), _like("userid", stripped)]}


def build_patron_query(
    text: str,
    *,
    category_id: str | None = None,
    library_id: str | None = None,
    status: str | None = None,
) -> dict | None:
    query: dict = {}
    if category_id:
        query["category_id"] = category_id
    if library_id:
        query["library_id"] = library_id
    if status == "active":
        query["expired"] = 0
        query["restricted"] = 0
    elif status == "expired":
        query["expired"] = 1
    elif status == "restricted":
        query["restricted"] = 1
    clause = _text_clause(text)
    if clause:
        query.update(clause)
    return query or None


def patron_order_by(sort: str, direction: str) -> str:
    if direction == "desc":
        return f"-{sort}"
    return sort
```

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_query.py tests/unit/test_koha_catalog_mapping.py -v`

Expected: PASS. Existing biblio query tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/integrations/koha/patron_query.py apps/api/tests/unit/test_patron_query.py
git commit -F <msgfile>
```

Message: `Build Koha patron search queries from name and card text.`

---

### Task 3: Koha patron HTTP

**Files:**
- Modify: `apps/api/app/integrations/koha/exceptions.py`
- Modify: `apps/api/app/integrations/koha/client.py`
- Modify: `apps/api/tests/unit/test_koha_client.py`
- Test: `apps/api/tests/unit/test_koha_client.py`

**Interfaces:**
- Consumes: `KohaClient.get_json`, `_send`, `_interpret`, `_bearer`
- Produces: `KohaRequestError(status_code: int, fields: list[str])` subclassing `KohaResponseError`. Methods `post_json(path, body, extra_headers=None)`, `put_json(path, body)`, `list_patrons(params) -> tuple[list[dict], httpx.Headers]`, `get_patron(patron_id) -> dict`, `create_patron(body, *, confirm_duplicate: bool) -> dict`, `update_patron(patron_id, body) -> dict`, `list_checkouts(patron_id) -> list[dict]`, `list_holds(patron_id) -> list[dict]`, `list_patron_categories() -> list[dict]`. `str(KohaRequestError)` stays `Koha request failed`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/unit/test_koha_client.py`:

```python
from app.integrations.koha.exceptions import KohaRequestError, KohaResponseError


def test_patron_write_keeps_error_field_names_and_hides_the_body():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.method == "POST" and request.url.path.endswith("/patrons"):
            assert request.headers.get("x-confirm-not-duplicate") == "1"
            assert "secret-name" not in request.content.decode()
            return httpx.Response(
                409,
                json={"errors": [{"message": "secret-name already exists", "path": "/body/cardnumber"}]},
            )
        if request.method == "PUT":
            return httpx.Response(400, json={"errors": [{"path": "/body/surname"}]})
        raise AssertionError(request.method + " " + request.url.path)

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.create_patron({"surname": "Cruz", "library_id": "CPL", "category_id": "ST"}, confirm_duplicate=True)
    except KohaRequestError as exc:
        assert exc.status_code == 409
        assert exc.fields == ["cardnumber"]
        assert "secret-name" not in str(exc)
    else:
        raise AssertionError("expected KohaRequestError")
    try:
        client.update_patron(4, {"surname": "Cruz"})
    except KohaRequestError as exc:
        assert exc.status_code == 400
        assert exc.fields == ["surname"]
        assert "x-confirm-not-duplicate" not in str(exc)
    else:
        raise AssertionError("expected KohaRequestError")


def test_patron_reads_send_embeds_and_a_plain_500_stays_a_response_error():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        seen.append((request.method, request.url.path, request.headers.get("x-koha-embed")))
        if request.url.path.endswith("/patrons") and request.method == "GET":
            return httpx.Response(200, json=[{"patron_id": 4}], headers={"X-Total-Count": "1"})
        if request.url.path.endswith("/checkouts"):
            return httpx.Response(200, json=[{"checkout_id": 1}])
        if request.url.path.endswith("/holds"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/patron_categories"):
            return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
        return httpx.Response(500, json={"error": "secret-body"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    rows, headers = client.list_patrons({"_per_page": "1"})
    assert rows == [{"patron_id": 4}]
    assert headers["X-Total-Count"] == "1"
    assert client.list_checkouts(4) == [{"checkout_id": 1}]
    assert client.list_holds(4) == []
    assert client.list_patron_categories()[0]["patron_category_id"] == "ST"
    try:
        client.get_patron(4)
    except KohaResponseError as exc:
        assert type(exc) is KohaResponseError
        assert "secret-body" not in str(exc)
    else:
        raise AssertionError("expected KohaResponseError")
    embeds = {path: embed for _method, path, embed in seen}
    assert embeds["/api/v1/patrons"] == "checkouts_count,overdues_count"
    assert embeds["/api/v1/patrons/4/checkouts"] == "item,biblio"
    assert embeds["/api/v1/patrons/4/holds"] == "biblio"
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_koha_client.py::test_patron_write_keeps_error_field_names_and_hides_the_body -v`

Expected: FAIL because `create_patron` does not exist.

- [ ] **Step 3: Add the client methods**

Add `KohaRequestError` to `exceptions.py`:

```python
class KohaRequestError(KohaResponseError):
    def __init__(self, status_code: int, fields: list[str]) -> None:
        super().__init__()
        self.status_code = status_code
        self.fields = fields
```

In `_interpret`, before the generic `status_code >= 400` branch, parse a JSON object’s `errors` list. Each string `path` contributes its final segment. Raise `KohaRequestError(response.status_code, names)`. A body that is not that shape still raises `KohaRequestError(status, [])` for 400 and 409, and `KohaResponseError` for every other status at or above 400. Do not put the body on the exception.

Add `post_json` and `put_json` by copying the `get_json` token and single 401 retry. Send `Content-Type: application/json` and `json.dumps(body)`. `create_patron` POSTs `/patrons` and sets `x-confirm-not-duplicate: 1` only when `confirm_duplicate` is true. `update_patron` PUTs `/patrons/{id}` with no confirm header. `list_patrons` GETs `/patrons` with `x-koha-embed: checkouts_count,overdues_count` and returns a list. `get_patron` GETs `/patrons/{id}`. `list_checkouts` GETs `/patrons/{id}/checkouts` with `x-koha-embed: item,biblio`. `list_holds` GETs `/patrons/{id}/holds` with `x-koha-embed: biblio`. `list_patron_categories` GETs `/patron_categories`. Non-list read bodies raise `KohaResponseError`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_koha_client.py tests/unit/test_catalog_service.py -v`

Expected: PASS. Catalog tests still treat connection and response failures as catalog errors.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/integrations/koha/exceptions.py apps/api/app/integrations/koha/client.py apps/api/tests/unit/test_koha_client.py
git commit -F <msgfile>
```

Message: `Call Koha patron reads and writes without returning the response body.`

---

### Task 4: Directory records and overdue

**Files:**
- Create: `apps/api/app/services/patrons.py`
- Create: `apps/api/tests/unit/test_patron_service.py`
- Test: `apps/api/tests/unit/test_patron_service.py`

**Interfaces:**
- Consumes: nothing from Koha yet
- Produces: `directory_item(row: dict, categories: dict[str, str], libraries: dict[str, str]) -> dict`, `detail_item(row: dict, categories: dict[str, str], libraries: dict[str, str], *, sensitive: bool) -> dict`, `is_overdue(due_date: str | None, checkin_date: str | None, today: date) -> bool`, `checkout_item(row: dict, *, include_barcode: bool, today: date) -> dict`, `hold_item(row: dict, libraries: dict[str, str]) -> dict`. `PatronError(status_code: int, code: str, message: str, fields: list[dict] | None = None)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/test_patron_service.py`:

```python
from datetime import date

from app.services.patrons import checkout_item, detail_item, directory_item, hold_item, is_overdue


ROW = {
    "patron_id": 4,
    "firstname": "Ada",
    "surname": "Cruz",
    "preferred_name": "",
    "cardnumber": "1004",
    "userid": "ada",
    "email": "ada@usant.edu.ph",
    "phone": "555",
    "mobile": "0917",
    "category_id": "ST",
    "library_id": "CPL",
    "date_enrolled": "2020-01-02",
    "expiry_date": "2027-01-02",
    "expired": 0,
    "restricted": 1,
    "patron_card_lost": 0,
    "date_of_birth": "2002-03-04",
    "address": "1 Rizal",
    "address2": "",
    "city": "Iriga",
    "state": "Camarines Sur",
    "postal_code": "4431",
    "country": "PH",
    "staff_notes": "desk note",
    "checkouts_count": 0,
}


def test_directory_hides_contact_and_sensitive_fields():
    item = directory_item(ROW, {"ST": "Student"}, {"CPL": "College Library"})
    assert item["category_name"] == "Student"
    assert item["library_name"] == "College Library"
    assert item["checkouts_count"] == 0
    assert item["overdues_count"] is None
    assert "email" not in item
    assert "date_of_birth" not in item
    assert "staff_notes" not in item


def test_detail_adds_sensitive_fields_only_for_that_permission():
    staff = detail_item(ROW, {"ST": "Student"}, {"CPL": "College Library"}, sensitive=False)
    admin = detail_item(ROW, {"ST": "Student"}, {"CPL": "College Library"}, sensitive=True)
    assert staff["userid"] == "ada"
    assert staff["email"] == "ada@usant.edu.ph"
    assert "date_of_birth" not in staff
    assert admin["date_of_birth"] == "2002-03-04"
    assert admin["staff_notes"] == "desk note"
    assert admin["city"] == "Iriga"


def test_overdue_uses_manila_calendar_date_and_barcode_is_optional():
    assert is_overdue("2026-11-19", None, date(2026, 11, 20)) is True
    assert is_overdue("2026-11-20", None, date(2026, 11, 20)) is False
    assert is_overdue("2026-11-19", "2026-11-19", date(2026, 11, 20)) is False
    hidden = checkout_item(
        {"checkout_id": 1, "item_id": 9, "due_date": "2026-11-19", "external_id": "SECRET", "item": {"biblio": {"title": "Ada"}}},
        include_barcode=False,
        today=date(2026, 11, 20),
    )
    assert hidden["title"] == "Ada"
    assert hidden["overdue"] is True
    assert "external_id" not in hidden
    shown = checkout_item(
        {"checkout_id": 1, "item_id": 9, "due_date": "2026-11-20", "external_id": "100", "renewals_count": 2},
        include_barcode=True,
        today=date(2026, 11, 20),
    )
    assert shown["external_id"] == "100"
    assert shown["title"] is None
    assert hold_item({"hold_id": 3, "status": "W", "biblio_id": 8}, {"CPL": "College"})["title"] is None
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py -v`

Expected: FAIL with `ModuleNotFoundError` for `app.services.patrons`.

- [ ] **Step 3: Map the records**

Create `apps/api/app/services/patrons.py` with `PatronError` matching `CatalogError` plus optional `fields`. `directory_item` copies the directory fields listed in Global Constraints. Missing `category_id` or `library_id` yields a null name. A missing count key yields `None`. A present count stays as returned, including `0`. `detail_item` starts from `directory_item` and adds the contact fields. It adds the eight sensitive fields only when `sensitive` is true.

`is_overdue` returns false when `due_date` is missing or `checkin_date` is present. Otherwise parse the first 10 characters of `due_date` as a date and return true when that date is before `today`. Callers pass today’s date in `Asia/Manila`.

`checkout_item` returns `checkout_id`, `item_id`, `title`, `checkout_date`, `due_date`, `renewals_count`, and `overdue`. Title comes from `item.biblio.title`, then `biblio.title`, else null. Include `external_id` only when `include_barcode` is true and the key exists. `hold_item` returns `hold_id`, `status`, `hold_date`, `waiting_date`, `expiration_date`, `pickup_library_id`, `pickup_library_name`, `biblio_id`, and `title`. Title comes from `biblio.title`, else null. `pickup_library_name` comes from the library map.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/patrons.py apps/api/tests/unit/test_patron_service.py
git commit -F <msgfile>
```

Message: `Strip patron fields and derive overdue from the Manila date.`

---

### Task 5: Search, options, and detail

**Files:**
- Modify: `apps/api/app/schemas/patrons.py` (create)
- Modify: `apps/api/app/services/patrons.py`
- Modify: `apps/api/tests/unit/test_patron_service.py`
- Test: `apps/api/tests/unit/test_patron_service.py`

**Interfaces:**
- Consumes: `build_patron_query`, `patron_order_by`, `KohaClient.list_patrons`, `get_patron`, `list_patron_categories`, `library_names`, `directory_item`, `detail_item`, `PatronError`, `AuditLog`
- Produces: `PatronSearchParams` with `q: str = ""`, `category_id: str | None = None`, `library_id: str | None = None`, `status: str | None = None`, `page: int = 1`, `per_page: int = 20`, `sort: str = "surname"`, `direction: str = "asc"`. `validate_search(params) -> None`. `search_patrons(client, params) -> dict`. `patron_options(client) -> dict`. `get_patron_detail(db, client, patron_id: int, *, user_id, sensitive: bool) -> dict`.

- [ ] **Step 1: Write the failing test**

Add a fake client and these tests to `apps/api/tests/unit/test_patron_service.py`:

```python
from app.schemas.patrons import PatronSearchParams
from app.services.patrons import PatronError, get_patron_detail, patron_options, search_patrons, validate_search


class FakePatronClient:
    def __init__(self):
        self.params = None

    def list_patrons(self, params):
        self.params = params
        return [dict(ROW)], {"X-Total-Count": "12"}

    def list_patron_categories(self):
        return [{"patron_category_id": "ST", "name": "Student"}]

    def library_names(self):
        return {"CPL": "College Library"}

    def get_patron(self, patron_id):
        assert patron_id == 4
        return dict(ROW)


def test_search_rejects_a_control_character_and_sends_one_page():
    bad = PatronSearchParams(q="Ada\n")
    try:
        validate_search(bad)
    except PatronError as exc:
        assert exc.code == "invalid_search"
    else:
        raise AssertionError("expected invalid_search")
    client = FakePatronClient()
    payload = search_patrons(client, PatronSearchParams(q="Ada", page=2, per_page=20, sort="cardnumber", direction="desc"))
    assert client.params["_page"] == "2"
    assert client.params["_per_page"] == "20"
    assert client.params["_order_by"] == "-cardnumber"
    assert payload["total"] == 12
    assert payload["has_next"] is False
    assert payload["items"][0]["cardnumber"] == "1004"
    assert "email" not in payload["items"][0]


def test_options_null_one_list_when_that_call_fails():
    class Partial(FakePatronClient):
        def list_patron_categories(self):
            from app.integrations.koha.exceptions import KohaResponseError
            raise KohaResponseError()

    options = patron_options(Partial())
    assert options["categories"] is None
    assert options["libraries"] == [{"id": "CPL", "name": "College Library"}]


def test_detail_audits_without_field_values(db):
    from app.models.identity import AuditLog
    payload = get_patron_detail(db, FakePatronClient(), 4, user_id=None, sensitive=False)
    assert "staff_notes" not in payload
    row = db.query(AuditLog).filter_by(action="patrons.detail").one()
    assert row.entity_id == "4"
    assert row.details == {"sensitive": False}
    assert "ada@usant.edu.ph" not in str(row.details)
```

`db` is the existing database fixture. `user_id=None` is allowed on `AuditLog`.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py::test_search_rejects_a_control_character_and_sends_one_page -v`

Expected: FAIL because `PatronSearchParams` is not defined.

- [ ] **Step 3: Implement search and detail**

Create `apps/api/app/schemas/patrons.py` with `PatronSearchParams`. `validate_search` trims `q`. Reject C0 and DEL, length over 80, `page` outside 1–10000, `per_page` outside 1–50, a sort outside the allowlist, a direction other than `asc` or `desc`, and a status other than `active`, `expired`, `restricted`, or empty. Raise `PatronError(422, "invalid_search", "That search is not valid.")`.

`search_patrons` calls `validate_search`, loads category and library maps, and raises `PatronError(503, "patrons_unavailable", "Patron records are unavailable. Try again.")` when a requested category or library id cannot be checked because that list failed. An id that is not in a loaded list is `invalid_search`. It calls `list_patrons` with string `_page`, `_per_page`, `_order_by`, and `q` set to `json.dumps(build_patron_query(...))` only when the query is not `None`. Header `x-koha-embed` is already added by the client. `total` is `X-Total-Count` or `x-total-count` parsed as an int, else null. `has_next` follows the catalog rule. Map rows with `directory_item`. `KohaTimeoutError` becomes `PatronError(504, "patrons_timeout", "Patron records took too long to respond. Try again.")`. Other `KohaError` values become `patrons_unavailable`.

`patron_options` returns `{categories, libraries}`. A failed category call sets `categories` to null. A failed library call sets `libraries` to null. A category object uses `patron_category_id` and `name`.

`get_patron_detail` calls `get_patron`, maps with `detail_item`, adds an `AuditLog` with action `patrons.detail`, module `patrons`, entity type `patron`, entity id `str(patron_id)`, and details `{"sensitive": sensitive}`, then commits. `KohaNotFound` becomes `PatronError(404, "not_found", "That patron was not found.")`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/schemas/patrons.py apps/api/app/services/patrons.py apps/api/tests/unit/test_patron_service.py
git commit -F <msgfile>
```

Message: `Search Koha patrons and audit a detail view without storing field values.`

---

### Task 6: Loans and holds

**Files:**
- Modify: `apps/api/app/services/patrons.py`
- Modify: `apps/api/tests/unit/test_patron_service.py`
- Test: `apps/api/tests/unit/test_patron_service.py`

**Interfaces:**
- Consumes: `checkout_item`, `hold_item`, `KohaClient.list_checkouts`, `list_holds`
- Produces: `patron_checkouts(client, patron_id: int, *, include_barcode: bool, today: date) -> dict` and `patron_holds(client, patron_id: int) -> dict`. Each returns `{"status": "ok", "items": [...]}` or `{"status": "unavailable"}`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date

from app.integrations.koha.exceptions import KohaResponseError
from app.services.patrons import patron_checkouts, patron_holds


def test_activity_failure_is_unavailable_and_success_keeps_an_empty_list():
    class Loans:
        def list_checkouts(self, patron_id):
            raise KohaResponseError()

        def list_holds(self, patron_id):
            return []

        def library_names(self):
            return {}

    assert patron_checkouts(Loans(), 4, include_barcode=False, today=date(2026, 11, 20)) == {"status": "unavailable"}
    holds = patron_holds(Loans(), 4)
    assert holds == {"status": "ok", "items": []}
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py::test_activity_failure_is_unavailable_and_success_keeps_an_empty_list -v`

Expected: FAIL because `patron_checkouts` is not defined.

- [ ] **Step 3: Map activity**

`patron_checkouts` calls `list_checkouts`. On any `KohaError`, return `{"status": "unavailable"}`. Otherwise return `{"status": "ok", "items": [checkout_item(...)]}` using the supplied `today`. `patron_holds` does the same with `list_holds`, `hold_item`, and `library_names()`. A library-name failure still returns holds, with null pickup names.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/services/patrons.py apps/api/tests/unit/test_patron_service.py
git commit -F <msgfile>
```

Message: `Return patron loans and holds, or an unavailable section.`

---

### Task 7: Create and update

**Files:**
- Modify: `apps/api/app/schemas/patrons.py`
- Modify: `apps/api/app/services/patrons.py`
- Modify: `apps/api/tests/unit/test_patron_service.py`
- Test: `apps/api/tests/unit/test_patron_service.py`

**Interfaces:**
- Consumes: `KohaClient.create_patron`, `update_patron`, `get_patron`, `KohaRequestError`, `detail_item`
- Produces: `PatronWrite` with the allowlisted fields and `confirm_duplicate: bool = False`, `extra="forbid"`. `create_patron_record(db, client, payload, *, user_id, sensitive: bool) -> dict`. `update_patron_record(db, client, patron_id: int, payload, *, user_id, sensitive: bool) -> dict`.

- [ ] **Step 1: Write the failing test**

```python
from app.integrations.koha.exceptions import KohaRequestError
from app.models.identity import AuditLog
from app.schemas.patrons import PatronWrite
from app.services.patrons import PatronError, create_patron_record, update_patron_record


class WriteClient:
    def __init__(self):
        self.created = None
        self.updated = None
        self.confirm = None

    def list_patron_categories(self):
        return [{"patron_category_id": "ST", "name": "Student"}]

    def library_names(self):
        return {"CPL": "College Library"}

    def create_patron(self, body, *, confirm_duplicate):
        self.created = body
        self.confirm = confirm_duplicate
        return {**ROW, **body, "patron_id": 8}

    def get_patron(self, patron_id):
        return dict(ROW)

    def update_patron(self, patron_id, body):
        self.updated = body
        return body


def test_create_sends_required_fields_and_audits_names(db):
    client = WriteClient()
    payload = PatronWrite(surname="Cruz", library_id="CPL", category_id="ST", email="ada@usant.edu.ph")
    created = create_patron_record(db, client, payload, user_id=None, sensitive=False)
    assert client.created == {"surname": "Cruz", "library_id": "CPL", "category_id": "ST", "email": "ada@usant.edu.ph"}
    assert client.confirm is False
    assert created["patron_id"] == 8
    audit = db.query(AuditLog).filter_by(action="patrons.create").one()
    assert audit.details["fields"] == ["surname", "library_id", "category_id", "email"]
    assert "ada@usant.edu.ph" not in str(audit.details)


def test_sensitive_write_without_permission_does_not_call_koha(db):
    client = WriteClient()
    payload = PatronWrite(surname="Cruz", library_id="CPL", category_id="ST", staff_notes="hidden")
    try:
        create_patron_record(db, client, payload, user_id=None, sensitive=False)
    except PatronError as exc:
        assert exc.status_code == 403
        assert exc.code == "permission_denied"
    else:
        raise AssertionError("expected permission_denied")
    assert client.created is None


def test_update_overlays_and_a_duplicate_does_not_confirm(db):
    class Duplicate(WriteClient):
        def update_patron(self, patron_id, body):
            self.updated = body
            raise KohaRequestError(409, ["cardnumber"])

    client = Duplicate()
    payload = PatronWrite(cardnumber="999", confirm_duplicate=True)
    try:
        update_patron_record(db, client, 4, payload, user_id=None, sensitive=True)
    except PatronError as exc:
        assert exc.code == "patron_duplicate"
    else:
        raise AssertionError("expected patron_duplicate")
    assert client.updated["surname"] == "Cruz"
    assert client.updated["cardnumber"] == "999"
    assert "confirm_duplicate" not in client.updated
    assert db.query(AuditLog).filter_by(action="patrons.update").count() == 0
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py::test_create_sends_required_fields_and_audits_names -v`

Expected: FAIL because `PatronWrite` is not defined.

- [ ] **Step 3: Validate and overlay**

Add `PatronWrite` with optional strings for `surname`, `firstname`, `preferred_name`, `cardnumber`, `userid`, `email`, `phone`, `mobile`, `library_id`, `category_id`, `expiry_date`, `date_of_birth`, `address`, `address2`, `city`, `state`, `postal_code`, `country`, and `staff_notes`, plus `confirm_duplicate: bool = False`. `model_config = ConfigDict(extra="forbid")`.

Sensitive keys are `date_of_birth`, `address`, `address2`, `city`, `state`, `postal_code`, `country`, and `staff_notes`. If any of those is not `None` and `sensitive` is false, raise `PatronError(403, "permission_denied", "You do not have access to patron records.")` before calling Koha.

Create requires non-blank `surname`, `library_id`, and `category_id`. Length limits are 255 for names, ids, email, and address lines, 64 for phone and mobile, and 1024 for staff notes. Email is blank or contains one `@` and no spaces. Dates are blank or `YYYY-MM-DD`. Library and category ids must be in the loaded lists. A list that cannot load becomes `patrons_unavailable`. Field failures raise `PatronError(422, "validation_error", "That patron record is not valid.", fields=[{"name", "message"}])`.

Create sends only keys whose values are not `None`, with blank strings omitted on create. `confirm_duplicate` goes to the client argument, not the body. A successful create audits `patrons.create` with the sent Koha key names in sorted order.

Update loads the current patron, copies it, and sets each provided key. A blank string becomes `None`. Compare the allowlisted keys and audit only the keys whose values changed. PUT the merged dict. Never pass `confirm_duplicate` into that dict.

`KohaRequestError` with status 409 becomes `PatronError(409, "patron_duplicate", "Koha already has a patron with that identifier.")`. Any other `KohaRequestError` becomes `PatronError(422, "patron_rejected", "Koha did not accept the patron record.", fields=...)` for names that are in the allowlist. The field message is `Koha did not accept this field.` A Koha failure writes no audit row.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/schemas/patrons.py apps/api/app/services/patrons.py apps/api/tests/unit/test_patron_service.py
git commit -F <msgfile>
```

Message: `Create and update Koha patrons from an allowlisted overlay.`

---

### Task 8: Patron HTTP routes

**Files:**
- Create: `apps/api/app/api/routes/patrons.py`
- Modify: `apps/api/app/api/dependencies/session.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/api/test_patrons_http.py`
- Test: `apps/api/tests/api/test_patrons_http.py`

**Interfaces:**
- Consumes: `search_patrons`, `patron_options`, `get_patron_detail`, `patron_checkouts`, `patron_holds`, `create_patron_record`, `update_patron_record`, `assert_csrf`, `PatronWrite`, `PatronError`
- Produces: `GET /api/v1/patrons`, `GET /api/v1/patrons/options`, `GET /api/v1/patrons/{patron_id}`, `GET /api/v1/patrons/{patron_id}/checkouts`, `GET /api/v1/patrons/{patron_id}/holds`, `POST /api/v1/patrons`, `PUT /api/v1/patrons/{patron_id}`. Dependency `require_patron_permission(code: str)`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/api/test_patrons_http.py` with this test, plus the same helpers for the cases below it:

```python
import httpx
import pytest
from test_auth import add_user, csrf_headers

from app.integrations.koha.client import KohaClient

PASSWORD = "local-secret"


def _login(client, username: str) -> None:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": PASSWORD})
    assert response.status_code == 200


def _patch_koha(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    monkeypatch.setattr(
        "app.api.routes.patrons.KohaClient",
        lambda settings: KohaClient(settings, transport=httpx.MockTransport(handler)),
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    if request.method == "GET" and request.url.path.endswith("/patrons"):
        return httpx.Response(
            200,
            json=[{"patron_id": 4, "firstname": "Ada", "surname": "Cruz", "cardnumber": "1004", "category_id": "ST", "library_id": "CPL", "email": "ada@usant.edu.ph"}],
            headers={"X-Total-Count": "1"},
        )
    if request.url.path.endswith("/patron_categories"):
        return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
    if request.url.path.endswith("/libraries"):
        return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
    return httpx.Response(404)


def test_librarian_search_hides_email(auth_client, db, monkeypatch):
    add_user(db, username="patron-librarian", email="patron-librarian@usant.edu.ph", display_name="Pat Librarian", password=PASSWORD, role_name="Librarian", department_code="COLLEGE")
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-librarian")
    response = auth_client.get("/api/v1/patrons?q=Ada")
    assert response.status_code == 200
    assert response.json()["items"][0]["cardnumber"] == "1004"
    assert "email" not in response.json()["items"][0]
```

Add these tests in the same file, reusing `_login` and `_patch_koha`:

- `test_patrons_require_a_session`: no login, GET `/api/v1/patrons` returns 401.
- `test_librarian_detail_hides_staff_notes`: GET `/api/v1/patrons/4` returns `email` and omits `staff_notes`. The handler must return the detail fields for `/patrons/4`.
- `test_librarian_cannot_write`: POST and PUT return 403 `permission_denied`.
- `test_student_and_auditor_cannot_list`: usernames `patron-student` and `patron-auditor`, GET returns 403.
- `test_admin_post_requires_csrf`: username `patron-admin`, role `Library Administrator`, POST without `csrf_headers` returns 403 `csrf_failed`.
- `test_admin_can_create`: the same admin, POST `{"surname":"Cruz","library_id":"CPL","category_id":"ST"}` with `csrf_headers`, handler POST `/patrons` returns the created patron, response 200 includes `patron_id`.
- `test_bad_patron_id_is_not_found`: GET `/api/v1/patrons/nope` returns 404 `not_found`.
- `test_koha_timeout_is_504`: handler raises `httpx.TimeoutException` and the response is 504 `patrons_timeout`.

- [ ] **Step 2: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_patrons_http.py::test_librarian_search_hides_email -v`

Expected: FAIL with 404 because the route is not registered. Name the test exactly that.

- [ ] **Step 3: Register the routes**

Add `require_patron_permission` in `session.py`. It loads the session the same way as `get_catalog_user`. A missing code raises 403 with `permission_denied` and `You do not have access to patron records.`

`patrons.py` uses `APIRouter(prefix="/patrons", tags=["patrons"])`. Declare `GET /options` before `GET /{patron_id}`. A non-integer `patron_id` raises 404 `not_found` with `That patron was not found.` Writes parse the body with `PatronWrite.model_validate`. A `ValidationError` becomes 422 `validation_error`, message `That patron record is not valid.`, and `fields` from the error locations. Writes call `assert_csrf` with `X-CSRF-Token` and cookie `libraryhub_csrf`. `sensitive` is `patrons.sensitive.view` in `payload.permissions`. `include_barcode` is `catalog.barcode.view` in `payload.permissions`. `today` is `datetime.now(ZoneInfo("Asia/Manila")).date()`. Map `PatronError` to `HTTPException` with `detail.fields` included only when present. Map `KohaTimeoutError`, `KohaNotFound`, and other `KohaError` values the same way as the service messages.

Export `patrons_router` from `app.api.routes` and include it in `create_app`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `py -3 -m pytest tests/api/test_patrons_http.py tests/api/test_catalog_http.py -v`

Expected: PASS. Catalog routes still require `catalog.view`.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/api/routes/patrons.py apps/api/app/api/dependencies/session.py apps/api/app/api/routes/__init__.py apps/api/app/main.py apps/api/tests/api/test_patrons_http.py
git commit -F <msgfile>
```

Message: `Expose patron search and writes behind staff permissions.`

---

### Task 9: Patron URL and display helpers

**Files:**
- Create: `apps/web/lib/patrons/types.ts`
- Create: `apps/web/lib/patrons/search-params.ts`
- Create: `apps/web/lib/patrons/search-params.test.ts`
- Create: `apps/web/lib/patrons/display.ts`
- Create: `apps/web/lib/patrons/display.test.ts`
- Modify: `apps/web/package.json`
- Test: `apps/web/lib/patrons/search-params.test.ts`, `apps/web/lib/patrons/display.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `PatronSearchState` with `q: string`, `categoryId: string`, `libraryId: string`, `status: "" | "active" | "expired" | "restricted"`, `page: number`, `sort: "surname" | "firstname" | "cardnumber" | "category_id" | "expiry_date"`, `direction: "asc" | "desc"`. `parsePatronSearch(params: URLSearchParams): PatronSearchState`. `serializePatronSearch(state: PatronSearchState): string`. `displayName(patron: { preferred_name?: string | null, firstname?: string | null, surname?: string | null, cardnumber?: string | null, patron_id: number }): string`. `initials(name: string): string`. `statusBadges(patron: { expired: number, restricted: number, patron_card_lost: number }): string[]`. `isOverdueDate(dueDate: string | null, checkinDate: string | null, today: Date): boolean`.

- [ ] **Step 1: Write the failing tests**

`search-params.test.ts` uses `node:test` and `node:assert/strict`, importing `./search-params.ts`:

```ts
test("patron params round trip and drop invalid filters", () => {
  const parsed = parsePatronSearch(new URLSearchParams("q=Ada&category_id=ST&library_id=CPL&status=expired&page=2&sort=cardnumber&direction=desc"));
  assert.equal(parsed.q, "Ada");
  assert.equal(parsed.categoryId, "ST");
  assert.equal(parsed.libraryId, "CPL");
  assert.equal(parsed.status, "expired");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.sort, "cardnumber");
  assert.equal(parsed.direction, "desc");
  const again = parsePatronSearch(new URLSearchParams(serializePatronSearch(parsed)));
  assert.deepEqual(again, parsed);
  assert.equal(parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).status, "");
  assert.equal(parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).page, 1);
  assert.equal(parsePatronSearch(new URLSearchParams("status=maybe&page=0&sort=email")).sort, "surname");
});
```

`display.test.ts`:

```ts
test("display name, initials, badges, and manila overdue", () => {
  assert.equal(displayName({ preferred_name: "Ace", firstname: "Ada", surname: "Cruz", cardnumber: "1", patron_id: 4 }), "Ace");
  assert.equal(displayName({ preferred_name: " ", firstname: "Ada", surname: "Cruz", cardnumber: "1", patron_id: 4 }), "Ada Cruz");
  assert.equal(displayName({ preferred_name: "", firstname: "", surname: "", cardnumber: "1004", patron_id: 4 }), "1004");
  assert.equal(displayName({ preferred_name: "", firstname: "", surname: "", cardnumber: "", patron_id: 4 }), "Patron 4");
  assert.equal(initials("Ada Cruz"), "AC");
  assert.equal(initials("Ada"), "AD");
  assert.deepEqual(statusBadges({ expired: 1, restricted: 1, patron_card_lost: 1 }), ["Expired", "Restricted", "Card lost"]);
  assert.deepEqual(statusBadges({ expired: 0, restricted: 0, patron_card_lost: 0 }), ["Active"]);
  assert.equal(isOverdueDate("2026-11-19", null, new Date("2026-11-20T00:30:00+08:00")), true);
  assert.equal(isOverdueDate("2026-11-20", null, new Date("2026-11-20T00:30:00+08:00")), false);
});
```

- [ ] **Step 2: Run the tests**

Change `apps/web/package.json` `test` to `node --test lib/catalog/*.test.ts lib/patrons/*.test.ts`.

Run from `apps/web`: `npm test`

Expected: FAIL because the patron modules do not exist.

- [ ] **Step 3: Implement the helpers**

`parsePatronSearch` defaults `q` to `""`, filters to `""`, page to 1, sort to `surname`, direction to `asc`. Trim `q` to 80 characters. Accept status only from the three values. Accept sort only from the allowlist. Page below 1 becomes 1. `serializePatronSearch` omits empty `q`, category, library, and status, and omits page 1, sort `surname`, and direction `asc`.

`displayName` uses the first non-blank value among preferred name, the joined first and last name, the card number, and `Patron ${patron_id}`. `initials` uppercases the first character of the first two words, or the first two characters of one word. `statusBadges` pushes Expired, Restricted, and Card lost when those flags are truthy, otherwise `["Active"]`. `isOverdueDate` formats `today` with `en-CA` and `timeZone: "Asia/Manila"` and compares it with the first 10 characters of `dueDate`. A check-in date or a missing due date returns false.

`types.ts` mirrors the directory item, detail item, options, checkout, and hold response fields from the spec. Counts are `number | null`. Activity responses are `{ status: "ok", items: T[] } | { status: "unavailable" }`.

- [ ] **Step 4: Run the tests**

Run from `apps/web`: `npm test`

Expected: PASS, including the existing catalog tests.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/patrons apps/web/package.json
git commit -F <msgfile>
```

Message: `Parse patron search URLs and patron display labels.`

---

### Task 10: Patron directory page

**Files:**
- Create: `apps/web/components/patrons/patron-directory.tsx`
- Modify: `apps/web/app/(app)/patrons/page.tsx`
- Test: browser, after Task 12

**Interfaces:**
- Consumes: `parsePatronSearch`, `serializePatronSearch`, `displayName`, `initials`, `statusBadges`, `fetchApi`, `CatalogPagination`, `ModuleFrame`, `Select`, `Input`, `Button`, `Skeleton`
- Produces: `PatronDirectory({ canUpdate: boolean })`. The page passes `canUpdate` from `gate.me.permissions`.

- [ ] **Step 1: Write the failing typecheck**

There is no component test runner. Add the page import of `PatronDirectory` first. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because `PatronDirectory` does not exist.

- [ ] **Step 2: Replace the placeholder page**

`patrons/page.tsx` keeps `gatePage("patrons.view")` and `AccessDenied`. On success render `PatronDirectory` inside `Suspense`. Pass `canUpdate={gate.me.permissions.includes("patrons.update")}`.

- [ ] **Step 3: Build the directory**

`PatronDirectory` is a client component. Read `useSearchParams` into `parsePatronSearch`. Changing a filter or page calls `router.replace` with `serializePatronSearch`. The search input keeps local text and writes `q` after 300ms, resetting page to 1. Reset clears `q`, category, library, and status.

`useQuery` loads `/api/v1/patrons/options` and `/api/v1/patrons` with the serialized API query (`q`, `category_id`, `library_id`, `status`, `page`, `per_page=20`, `sort`, `direction`).

Render `ModuleFrame` with `hideModuleSentence`, eyebrow `Library`, title `Patron Management`, and the description from Global Constraints. `canUpdate` shows an Add patron button that is wired in Task 12. The search input placeholder is `Name, card number, or userid`. Category and library selects use the options lists. A null list shows the select disabled with placeholder `Unavailable`. Status options are Any status, Active, Expired, and Restricted. Show the total when it is a number: `{total} patrons`.

The table columns are Patron, Category, Library, On loan, Overdue, Expiry, and Status. Patron shows initials, `displayName`, and the card number. Library cells use `hidden md:table-cell`. A null count renders `Unavailable`. A row links to `/patrons/{patron_id}`. The menu contains View, and Edit when `canUpdate`. Edit is wired in Task 12.

Use `CatalogPagination` with `perPage={20}`. Loading renders three `Skeleton` rows. An error renders `error.message` and a Retry button that calls `refetch`. An empty `items` array renders `No patrons matched.` and leaves the search text in the input. Below `md`, the filter row stacks with `flex-col`.

- [ ] **Step 4: Run the typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/components/patrons/patron-directory.tsx "apps/web/app/(app)/patrons/page.tsx"
git commit -F <msgfile>
```

Message: `Show a Koha patron directory with search, filters, and pagination.`

---

### Task 11: Patron detail page

**Files:**
- Create: `apps/web/components/patrons/patron-detail.tsx`
- Create: `apps/web/app/(app)/patrons/[patronId]/page.tsx`
- Test: browser, in Task 13

**Interfaces:**
- Consumes: `PatronDetail`, `PatronActivity`, `displayName`, `initials`, `statusBadges`, `fetchApi`
- Produces: `PatronDetailView({ patronId: string, canUpdate: boolean, canSensitive: boolean })`

- [ ] **Step 1: Write the failing typecheck**

Add the route file that imports `PatronDetailView`. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because the component file does not exist.

- [ ] **Step 2: Gate the route**

`[patronId]/page.tsx` calls `gatePage("patrons.view")`. A non-numeric id renders the not-found copy `That patron was not found.` Pass `canUpdate` and `canSensitive` from `patrons.update` and `patrons.sensitive.view`.

- [ ] **Step 3: Build the detail**

Three queries: `/api/v1/patrons/{id}`, `/checkouts`, and `/holds`. The header shows initials, display name, category, library, and status badges. Summaries are the loan item length, the number of loans with `overdue`, and the hold item length. An activity `status` of `unavailable` shows `Unavailable` in that summary and in the section, with a Retry button for that query.

Personal information lists the display name, card number, userid, email, phone, and mobile. When `canSensitive` is true and the keys exist, also list date of birth, the address lines, and staff notes. Library account lists category, library, enrolment date, expiry date, and the status badges.

Loan columns are Title, Checked out, Due, Renewals, and Barcode. Barcode is present only when `external_id` is on the item. A null title renders `Title unavailable` and the item id. Hold columns are Title, Status, Held, Waiting, Expires, and Pickup library. A null title renders `Title unavailable` and the biblio id. Empty ok lists render `No current loans.` and `No current holds.`

A failed patron query shows the error message and Retry. Edit shows when `canUpdate` and opens the dialog from Task 12. A back link returns to `/patrons`.

- [ ] **Step 4: Run the typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/components/patrons/patron-detail.tsx "apps/web/app/(app)/patrons/[patronId]/page.tsx"
git commit -F <msgfile>
```

Message: `Open a patron profile with loans and holds from Koha.`

---

### Task 12: Create and update dialog

**Files:**
- Create: `apps/web/components/patrons/patron-form-dialog.tsx`
- Modify: `apps/web/components/patrons/patron-directory.tsx`
- Modify: `apps/web/components/patrons/patron-detail.tsx`
- Test: browser, in Task 13

**Interfaces:**
- Consumes: `PatronWrite` JSON, `fetchApi` POST and PUT, `Dialog`, `Input`, `Button`
- Produces: `PatronFormDialog({ mode: "create" | "edit", patronId?: number, initial?: PatronDetail, canSensitive: boolean, open: boolean, onOpenChange: (open: boolean) => void })`

- [ ] **Step 1: Write the failing typecheck**

Import `PatronFormDialog` from the directory Add button and the detail Edit button. Run from `apps/web`: `npm run typecheck`

Expected: FAIL because the dialog module does not exist.

- [ ] **Step 2: Build the form**

Fields are surname, first name, preferred name, card number, userid, email, phone, mobile, library, category, and expiry date. `canSensitive` adds date of birth, address, address 2, city, state, postal code, country, and staff notes. Library and category use the options query. Required marks sit on surname, library, and category in create mode.

The first Save click opens a confirm line: `Save this patron to Koha?` with buttons Save and Back. The second Save sends POST `/api/v1/patrons` or PUT `/api/v1/patrons/{id}`. Disable the button while the request is running. On 409 in create mode, keep the dialog open and show `Koha already has a patron with that identifier.` with a Confirm duplicate button that resends `confirm_duplicate: true`. On 409 in edit mode, show the same sentence and `Enter a different card number or userid.` Do not send `confirm_duplicate` on PUT. On `validation_error` or `patron_rejected`, show `detail.fields` next to the named inputs and `detail.message` at the top. On success, close the dialog and invalidate the patron queries.

- [ ] **Step 3: Wire the buttons**

The directory Add patron button opens the dialog in create mode. The detail Edit button opens it in edit mode with the loaded patron as `initial`. Pass `canSensitive` from the detail page. The directory does not know sensitive permission, so the directory dialog receives `canSensitive={false}` unless the page also passes `canSensitive` from `patrons.sensitive.view`. Pass it from the page. Administrators have both permissions, so the directory create form includes sensitive fields for them.

- [ ] **Step 4: Run the typecheck and unit tests**

Run from `apps/web`: `npm run typecheck` and `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/components/patrons/patron-form-dialog.tsx apps/web/components/patrons/patron-directory.tsx apps/web/components/patrons/patron-detail.tsx "apps/web/app/(app)/patrons/page.tsx"
git commit -F <msgfile>
```

Message: `Add the patron create and update dialog for administrators.`

---

### Task 13: Docs and browser check

**Files:**
- Modify: `docs/koha-integration.md`
- Test: `apps/api` pytest, `apps/web` npm test, browser

**Interfaces:**
- Consumes: the routes and pages from Tasks 8–12
- Produces: a patron section in `docs/koha-integration.md`

- [ ] **Step 1: Document the patron calls**

Add a Patron section to `docs/koha-integration.md`. State that patron records stay in Koha, the browser calls `/api/v1/patrons`, and the server calls `GET/POST /patrons`, `GET/PUT /patrons/{id}`, `GET /patrons/{id}/checkouts`, `GET /patrons/{id}/holds`, `GET /patron_categories`, and `GET /libraries`. State that delete, fines, extended attributes, and the public patron routes are unused. Mention the observed host text `25.06.00` as the capability check date 2026-11-19, not as a hardcoded runtime version.

- [ ] **Step 2: Run the automated tests**

Run from `apps/api`: `py -3 -m pytest tests/unit/test_patron_query.py tests/unit/test_patron_service.py tests/unit/test_koha_client.py tests/api/test_patron_schema.py tests/api/test_patrons_http.py tests/api/test_catalog_http.py -v`

Run from `apps/web`: `npm test` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Exercise the pages**

Sign in as a Librarian. Open `/patrons`. Confirm the first page loads from Koha, a name search changes the URL after typing, reset clears it, and a row opens `/patrons/{id}` with contact fields and no staff notes. Open loans and holds: an empty list says `No current loans.` or `No current holds.`, and a failed section can be retried. Confirm Add patron and Edit are absent.

Sign in as a Library Administrator. Create a patron with surname, library, and category only if the dev Koha host is one the team is allowed to write to. If it is not, stop before Save and record that the write was not sent. When a write is allowed, cancel the confirm once, then save, and confirm the new detail shows the surname. Submit a duplicate card number, confirm the dialog stays open, and do not confirm the duplicate unless the record was created for this test and the team accepts the second Koha response.

Sign in as a Student. Open `/patrons` and confirm Access denied. `GET /api/v1/patrons` with that session returns 403.

- [ ] **Step 4: Commit the doc**

```powershell
git add docs/koha-integration.md
git commit -F <msgfile>
```

Message: `Document the Koha patron calls used by staff lookup.`

---

## Self-review

Spec coverage:

| Spec section | Task |
|---|---|
| Permissions | Task 1 and Task 8 |
| Koha query, pagination, status | Task 2 and Task 5 |
| Koha HTTP, duplicate header, hidden body | Task 3 and Task 7 |
| Directory and detail fields | Task 4 and Task 5 |
| Loans, holds, barcode, Manila overdue | Task 4 and Task 6 |
| Create, update, overlay, audit | Task 5 and Task 7 |
| Routes, CSRF, errors | Task 8 |
| URL, labels, badges | Task 9 |
| Directory and detail UI | Task 10 and Task 11 |
| Dialog, duplicate confirm | Task 12 |
| Docs and live check | Task 13 |
| Student placeholder and no link table | Global Constraints; no task adds them |

Placeholder scan: no TBD, TODO, or “write tests for the above” without a test body. UI tasks use typecheck because the web app has no component runner, and Task 13 states the browser steps.

Type names used across tasks: `PatronSearchParams`, `PatronWrite`, `PatronError`, `directory_item`, `detail_item`, `search_patrons`, `patron_options`, `get_patron_detail`, `patron_checkouts`, `patron_holds`, `create_patron_record`, `update_patron_record`, `parsePatronSearch`, `serializePatronSearch`, `displayName`, `PatronDirectory`, `PatronDetailView`, `PatronFormDialog`.
