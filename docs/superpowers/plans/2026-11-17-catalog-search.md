# Catalog search and Koha REST integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in staff member or student search the Koha catalog from the ULMS, open a record, and save a search, while Koha stays the only copy of the catalog.

**Architecture:** The browser calls `/api/v1/catalog` with the existing session cookie. FastAPI checks `catalog.view`, and a catalog service asks one in-process Koha client for the current page. The client uses OAuth client credentials against `KOHA_BASE_URL`. Recent and saved searches are rows in `libraryhub.saved_searches`. Availability is computed for that page and is not cached.

**Tech Stack:** FastAPI, HTTPX, Pydantic, SQLAlchemy 2, Alembic, PostgreSQL, pytest, Next.js 16, TanStack Query, node:test.

## Global Constraints

- Search uses the Koha REST API on `KOHA_BASE_URL`. The client authenticates with OAuth client credentials (`KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET`). `KOHA_API_USERNAME` and `KOHA_API_PASSWORD` are unused.
- Do not call `https://library.usant.edu.ph/`. The marketing site stays unchanged.
- One Koha query fetches the current page. Do not download the catalog, build a local index, or cache availability. Do not use Redis.
- Results have a cover view and a list view. There is no summary view and no A–Z index.
- The OPAC link is shown only when `KOHA_OPAC_URL` is set. It is never hardcoded.
- Library, item type, availability, and subject are not result-set filters unless the live biblio JSON grows a matching column. Publication year is a filter only after a year column is confirmed.
- Item barcodes (`external_id`) require `catalog.barcode.view`. The API removes the field for everyone else.
- Default allowlist: fields `keyword`, `title`, `author`, `isbn`, `barcode`. Keyword label is `Keyword (title or author)`. Sorts `title`, `author`. Default sort is title ascending. `year_filter` is false. `subject` is omitted.
- Keyword query is `{"-or": [{"title": {"-like": "%...%"}}, {"author": {"-like": "%...%"}}]}`. Like-values escape `\`, `%`, and `_`.
- Page sizes are 10, 20, and 40. Default 20. `q` is 1–200 characters after trim. Control characters and DEL are rejected.
- Error messages are fixed: `catalog_unavailable` is “The catalog is unavailable. Try again.” `catalog_timeout` is “The catalog took too long to respond. Try again.” `invalid_search` is “That search is not valid.” A missing biblio is “That record was not found.” A missing saved search is “That saved search was not found.” `permission_denied` is “You do not have access to the catalog.”
- Availability sentence is “Availability can change after this time. This is not a reservation.”
- Status order: withdrawn, lost, damaged, not for loan, checked out, in transit, available. No copies is `no_copies` / `No copies`. A failed item lookup is `unknown` / `Availability unavailable` with `last_checked` omitted.
- Recent cap 10. Saved cap 30. Cover/list view is not stored.
- Pytest uses `httpx.MockTransport` and does not open a socket to Koha.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains that trailer, replace the commit with `git commit-tree` as required by `.cursor/rules/strip-cursor-coauthor.mdc`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/api/app/core/config.py` | Read the five Koha settings |
| `apps/api/app/integrations/koha/exceptions.py` | Typed client failures with no upstream body |
| `apps/api/app/integrations/koha/query.py` | Allowlisted `q` and `_order_by` |
| `apps/api/app/integrations/koha/availability.py` | Item status and page summary |
| `apps/api/app/integrations/koha/marc.py` | MARC-in-JSON fields used by the detail page |
| `apps/api/app/integrations/koha/client.py` | Token, HTTP, library and item-type caches |
| `apps/api/app/integrations/koha/allowlist.py` | Default fields, sorts, and `year_filter` |
| `apps/api/alembic/versions/20261117_0003_catalog_searches.py` | Permission grants and `saved_searches` |
| `apps/api/app/models/catalog.py` | `SavedSearch` ORM |
| `apps/api/app/schemas/catalog.py` | Request and response models |
| `apps/api/app/services/catalog.py` | Authorization, mapping, recent and saved rows |
| `apps/api/app/api/dependencies/session.py` | Session, permission, CSRF |
| `apps/api/app/api/routes/catalog.py` | `/api/v1/catalog` handlers |
| `apps/api/app/scripts/koha_fields.py` | Print live biblio JSON keys, never values |
| `apps/web/lib/catalog/search-params.ts` | URL state |
| `apps/web/lib/catalog/types.ts` | Response types |
| `apps/web/components/catalog/query-provider.tsx` | TanStack Query for the staff shell |
| `apps/web/components/catalog/catalog-browser.tsx` | Search, results, recent, saved |
| `apps/web/components/catalog/record-view.tsx` | Detail and copies |
| `apps/web/app/(app)/catalog/page.tsx` | Gate plus browser |
| `apps/web/app/(app)/catalog/[biblioId]/page.tsx` | Gate plus record |
| `docs/koha-integration.md` | Capability notes, no secrets |
| `.env.example` | Empty Koha variable names |

Existing stub modules `bibliographic.py`, `items.py`, `authentication.py`, `mapping.py`, `libraries.py`, `circulation.py`, `holds.py`, `patrons.py`, and `capabilities.py` stay as stubs. This plan does not put catalog behavior in them.

---

### Task 1: Koha settings

**Files:**
- Modify: `apps/api/app/core/config.py`
- Modify: `.env.example`
- Test: `apps/api/tests/unit/test_koha_settings.py`

**Interfaces:**
- Consumes: `get_settings()` and its `lru_cache`
- Produces: `Settings.koha_client_id: str | None`, `Settings.koha_client_secret: str | None`, `Settings.koha_opac_url: str | None`, `Settings.koha_api_timeout: float` default `15`. Existing `koha_base_url`, `koha_api_username`, and `koha_api_password` stay.

- [ ] **Step 1: Write the failing test**

```python
from app.core.config import get_settings


def test_koha_settings_read_oauth_timeout_and_opac(monkeypatch):
    monkeypatch.setenv("KOHA_BASE_URL", "http://koha.test")
    monkeypatch.setenv("KOHA_CLIENT_ID", "cid")
    monkeypatch.setenv("KOHA_CLIENT_SECRET", "csecret")
    monkeypatch.setenv("KOHA_OPAC_URL", "http://opac.test/")
    monkeypatch.setenv("KOHA_API_TIMEOUT", "9")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.koha_base_url == "http://koha.test"
    assert settings.koha_client_id == "cid"
    assert settings.koha_client_secret == "csecret"
    assert settings.koha_opac_url == "http://opac.test/"
    assert settings.koha_api_timeout == 9.0
    get_settings.cache_clear()
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `python -m pytest tests/unit/test_koha_settings.py -v`

Expected: FAIL because `koha_client_id` does not exist.

- [ ] **Step 3: Add the settings**

In `Settings`, after `koha_api_password`:

```python
koha_client_id: str | None = Field(default=None, validation_alias="KOHA_CLIENT_ID")
koha_client_secret: str | None = Field(default=None, validation_alias="KOHA_CLIENT_SECRET")
koha_opac_url: str | None = Field(default=None, validation_alias="KOHA_OPAC_URL")
koha_api_timeout: float = Field(default=15, validation_alias="KOHA_API_TIMEOUT")
```

Append to `.env.example` under the Koha comment, with empty values:

```text
KOHA_CLIENT_ID=
KOHA_CLIENT_SECRET=
KOHA_OPAC_URL=
KOHA_API_TIMEOUT=15
```

Leave `KOHA_API_USERNAME` and `KOHA_API_PASSWORD` in the example. Do not copy values from `.env`.

- [ ] **Step 4: Run the test**

Run: `python -m pytest tests/unit/test_koha_settings.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/core/config.py apps/api/tests/unit/test_koha_settings.py .env.example
$msg = Join-Path (git rev-parse --git-dir) "COMMIT_MSG_NEW.txt"
[System.IO.File]::WriteAllText($msg, "Read Koha OAuth and OPAC settings on the API.`n")
git commit -F $msg
Remove-Item -Force $msg
```

---

### Task 2: Query, availability, and MARC

**Files:**
- Create: `apps/api/app/integrations/koha/allowlist.py`
- Create: `apps/api/app/integrations/koha/query.py`
- Create: `apps/api/app/integrations/koha/availability.py`
- Create: `apps/api/app/integrations/koha/marc.py`
- Test: `apps/api/tests/unit/test_koha_catalog_mapping.py`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces:
  - `DEFAULT_FIELDS = ("keyword", "title", "author", "isbn", "barcode")`
  - `DEFAULT_SORTS = ("title", "author")`
  - `YEAR_FILTER = False`
  - `KEYWORD_LABEL = "Keyword (title or author)"`
  - `escape_like(value: str) -> str`
  - `build_biblio_query(field: str, text: str, *, year_from: int | None, year_to: int | None, year_field: str | None) -> dict`
  - `order_by(sort: str, direction: str) -> str`
  - `item_status(item: dict) -> tuple[str, str]`
  - `summarize_copies(items: list[dict] | None, *, failed: bool, checked_at: str | None) -> dict`
  - `parse_marc(payload: dict) -> dict` with keys `title`, `authors`, `edition`, `place`, `publisher`, `year`, `isbns`, `subjects`, `description`

- [ ] **Step 1: Write the failing test**

```python
from app.integrations.koha.availability import item_status, summarize_copies
from app.integrations.koha.marc import parse_marc
from app.integrations.koha.query import build_biblio_query, escape_like, order_by


def test_like_escapes_wildcards_and_keyword_is_title_or_author():
    assert escape_like("100%_a\\b") == "100\\%\\_a\\\\b"
    assert build_biblio_query("title", "Ada", year_from=None, year_to=None, year_field=None) == {
        "title": {"-like": "%Ada%"}
    }
    assert build_biblio_query("keyword", "Ada", year_from=None, year_to=None, year_field=None) == {
        "-or": [
            {"title": {"-like": "%Ada%"}},
            {"author": {"-like": "%Ada%"}},
        ]
    }
    assert order_by("author", "desc") == "-author"


def test_year_filter_uses_between_and_comparisons():
    assert build_biblio_query(
        "title", "Ada", year_from=1990, year_to=2000, year_field="copyright_date"
    ) == {
        "-and": [
            {"title": {"-like": "%Ada%"}},
            {"copyright_date": {"-between": [1990, 2000]}},
        ]
    }


def test_status_order_and_summary():
    assert item_status({"withdrawn": 1, "lost_status": 1}) == ("withdrawn", "Withdrawn")
    assert item_status({"withdrawn": 0, "lost_status": 0, "damaged_status": 0,
                        "not_for_loan_status": 0, "effective_not_for_loan_status": 0,
                        "checked_out_date": None, "home_library_id": "CPL",
                        "holding_library_id": "UCL"}) == ("in_transit", "In transit")
    assert item_status({"withdrawn": 0, "lost_status": 0, "damaged_status": 0,
                        "not_for_loan_status": 0, "effective_not_for_loan_status": 0,
                        "checked_out_date": None, "home_library_id": "CPL",
                        "holding_library_id": "CPL"}) == ("available", "Available")
    available = summarize_copies(
        [{"withdrawn": 0, "lost_status": 0, "damaged_status": 0, "not_for_loan_status": 0,
          "effective_not_for_loan_status": 0, "checked_out_date": "2024-01-01",
          "home_library_id": "CPL", "holding_library_id": "CPL"},
         {"withdrawn": 0, "lost_status": 0, "damaged_status": 0, "not_for_loan_status": 0,
          "effective_not_for_loan_status": 0, "checked_out_date": None,
          "home_library_id": "CPL", "holding_library_id": "CPL"}],
        failed=False,
        checked_at="2026-11-17T06:00:00+00:00",
    )
    assert available["status"] == "available"
    assert available["available_count"] == 1
    assert available["copy_count"] == 2
    assert summarize_copies([], failed=False, checked_at="2026-11-17T06:00:00+00:00")["status"] == "no_copies"
    unknown = summarize_copies(None, failed=True, checked_at=None)
    assert unknown == {
        "status": "unknown",
        "label": "Availability unavailable",
        "copy_count": 0,
        "available_count": 0,
        "last_checked": None,
    }


def test_marc_parser_reads_the_detail_fields_and_drops_empty_ones():
    payload = {
        "fields": [
            {"245": {"subfields": [{"a": "Ada "}, {"b": "a biography"}], "ind1": "1", "ind2": "0"}},
            {"100": {"subfields": [{"a": "Lovelace, Ada"}], "ind1": "1", "ind2": " "}},
            {"700": {"subfields": [{"a": "Babbage, Charles"}], "ind1": "1", "ind2": " "}},
            {"250": {"subfields": [{"a": "2nd ed."}], "ind1": " ", "ind2": " "}},
            {"264": {"subfields": [{"a": "London :"}, {"b": "Murray,"}, {"c": "2019."}], "ind1": " ", "ind2": "1"}},
            {"020": {"subfields": [{"a": "9780000000000"}], "ind1": " ", "ind2": " "}},
            {"650": {"subfields": [{"a": "Mathematics"}], "ind1": " ", "ind2": "0"}},
            {"520": {"subfields": [{"a": "A short life."}], "ind1": " ", "ind2": " "}},
            {"999": {"subfields": [{"a": "ignore"}], "ind1": " ", "ind2": " "}},
        ]
    }
    parsed = parse_marc(payload)
    assert parsed["title"] == "Ada a biography"
    assert parsed["authors"] == ["Lovelace, Ada", "Babbage, Charles"]
    assert parsed["edition"] == "2nd ed."
    assert parsed["place"] == "London"
    assert parsed["publisher"] == "Murray"
    assert parsed["year"] == "2019"
    assert parsed["isbns"] == ["9780000000000"]
    assert parsed["subjects"] == ["Mathematics"]
    assert parsed["description"] == "A short life."
```

- [ ] **Step 2: Run the test**

Run: `python -m pytest tests/unit/test_koha_catalog_mapping.py -v`

Expected: FAIL with import errors.

- [ ] **Step 3: Implement the three modules**

`allowlist.py`:

```python
DEFAULT_FIELDS = ("keyword", "title", "author", "isbn", "barcode")
DEFAULT_SORTS = ("title", "author")
YEAR_FILTER = False
YEAR_FIELD: str | None = None
KEYWORD_LABEL = "Keyword (title or author)"
SUBJECT_FIELD: str | None = None
```

`query.py` escapes `\`, then `%`, then `_`. `build_biblio_query` uses `-like` with surrounding `%`. `keyword` builds the `-or` object above. Any other field name is used as the JSON key (`title`, `author`, `isbn`, or a later `subject` field). When `year_field` is set and both years are set, wrap the text clause and `{"-between": [year_from, year_to]}` in `-and`. When only `year_from` is set, compare with `>=`. When only `year_to` is set, compare with `<=`. `order_by` returns `f"-{sort}"` when `direction == "desc"`, otherwise `sort`.

`availability.py` reads missing numeric flags as `0` and a missing checkout date as `None`. The first matching row in the spec table wins. In transit requires both library ids to be non-empty strings and different. `summarize_copies` returns the unknown object when `failed` is true. An empty list returns `no_copies`, counts `0`, and the supplied `checked_at`. Otherwise `available_count` counts `available` copies. A positive count forces summary status `available` / `Available`. Otherwise walk withdrawn, lost, damaged, not_for_loan, checked_out, in_transit and use the first status any copy has. `copy_count` is `len(items)`.

`marc.py` walks `fields`. A control field whose value is a string is ignored. A data field contributes subfield pairs. Join 245 `$a` and `$b` with a single space. Authors are 100 `$a` then 700 `$a`. Edition is 250 `$a`. Prefer 264 over 260 for `$a` place, `$b` publisher, and `$c` year. Strip trailing spaces and the characters `,:;.` from place, publisher, and year. Keep a four-digit year when `$c` contains one, otherwise keep the cleaned `$c`. ISBNs are every 020 `$a`. Subjects are 650 `$a` then 600 `$a`. Description is the first 520 `$a`. Drop keys whose value is an empty string or an empty list.

- [ ] **Step 4: Run the test**

Run: `python -m pytest tests/unit/test_koha_catalog_mapping.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

Message: `Map Koha search, copy status, and MARC detail fields.`

Files: the four modules and `tests/unit/test_koha_catalog_mapping.py`.

---

### Task 3: Koha HTTP client

**Files:**
- Modify: `apps/api/app/integrations/koha/exceptions.py`
- Create: `apps/api/app/integrations/koha/client.py`
- Test: `apps/api/tests/unit/test_koha_client.py`

**Interfaces:**
- Consumes: `Settings` fields from Task 1
- Produces:
  - `KohaConnectionError`, `KohaTimeoutError`, `KohaNotFound`, `KohaAuthError`, `KohaResponseError`, all subclasses of `KohaError`
  - `api_root(base_url: str) -> str`
  - `class KohaClient` with `__init__(self, settings, transport: httpx.BaseTransport | None = None)`
  - `get_json(self, path: str, params: dict | None = None, accept: str = "application/json") -> tuple[object, httpx.Headers]`
  - `get_bytes(self, url: str) -> tuple[bytes, str]`
  - `list_items_for_biblios(self, biblio_ids: list[int]) -> tuple[list[dict], str | None]` where the second value is an ISO UTC timestamp, or `(None, None)` when every item request fails
  - `library_names(self) -> dict[str, str]`
  - `item_type_labels(self) -> dict[str, str]`
  - Exception `str()` is `Koha request failed` and does not include the response body

- [ ] **Step 1: Write the failing test**

```python
import logging

import httpx

from app.integrations.koha.client import KohaClient, api_root
from app.integrations.koha.exceptions import KohaAuthError, KohaTimeoutError


class Settings:
    koha_base_url = "http://koha.test/"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15


def test_api_root_appends_v1_once():
    assert api_root("http://koha.test/") == "http://koha.test/api/v1"
    assert api_root("http://koha.test/api/v1") == "http://koha.test/api/v1"


def test_token_is_reused_and_absent_from_logs(caplog):
    posts = {"token": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            posts["token"] += 1
            assert b"grant_type=client_credentials" in request.content
            assert b"client_id=client-id" in request.content
            assert b"client_secret=client-secret" in request.content
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        assert request.headers["Authorization"] == "Bearer token-1"
        return httpx.Response(200, json=[{"biblio_id": 1}], headers={"X-Total-Count": "4"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    with caplog.at_level(logging.INFO, logger="app.integrations.koha"):
        first, headers = client.get_json("/biblios", {"_per_page": 1})
        second, _ = client.get_json("/biblios", {"_per_page": 1})
    assert first == second == [{"biblio_id": 1}]
    assert headers["X-Total-Count"] == "4"
    assert posts["token"] == 1
    assert "client-secret" not in caplog.text
    assert "token-1" not in caplog.text
    assert "/biblios" in caplog.text


def test_second_401_raises_auth_error_without_body():
    calls = {"token": 0, "biblios": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            calls["token"] += 1
            return httpx.Response(200, json={"access_token": f"token-{calls['token']}", "expires_in": 3600})
        calls["biblios"] += 1
        return httpx.Response(401, json={"error": "secret-body"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.get_json("/biblios")
    except KohaAuthError as exc:
        assert "secret-body" not in str(exc)
    else:
        raise AssertionError("expected KohaAuthError")
    assert calls["token"] == 2
    assert calls["biblios"] == 2


def test_timeout_is_typed():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.get_json("/oauth/token")
    except KohaTimeoutError:
        pass
    else:
        raise AssertionError("expected KohaTimeoutError")
```

The timeout test is allowed to raise on the token request. A timeout on `/biblios` after a successful token must also raise `KohaTimeoutError`. Add that assertion if the first form only covers the token URL.

- [ ] **Step 2: Run the test**

Run: `python -m pytest tests/unit/test_koha_client.py -v`

Expected: FAIL with import errors.

- [ ] **Step 3: Implement the client**

`api_root` strips one trailing slash, then appends `/api/v1` unless the URL already ends with `/api/v1`.

`KohaClient` stores the token and its monotonic expiry (`expires_in - 30` seconds, minimum 1 second). `get_json` builds `httpx.Client(transport=self._transport, timeout=settings.koha_api_timeout)`. It posts form data to `{api_root}/oauth/token` when the token is missing. It sends `Authorization: Bearer` and the `Accept` header. On 401 it clears the token, fetches once, and retries the same path once. A second 401 raises `KohaAuthError`. `httpx.TimeoutException` raises `KohaTimeoutError`. `httpx.TransportError` raises `KohaConnectionError`. 404 raises `KohaNotFound`. Any other status ≥ 400 raises `KohaResponseError`. None of those constructors receive the response text.

Log with `logging.getLogger("app.integrations.koha")` at INFO: the path template only (`/oauth/token`, `/biblios`, `/items`), the status, and the duration in milliseconds. Do not log `request.url.query`, headers, or the body.

`list_items_for_biblios([])` returns `[], timestamp`. For a non-empty list, call `GET /items` with `q` equal to `json.dumps({"biblio_id": {"-in": biblio_ids}})` and `_per_page` of `max(len(biblio_ids) * 20, 20)`. On `KohaResponseError`, request `GET /biblios/{id}/items` for each id. If every one of those fails, return `None, None`. The timestamp is `datetime.now(timezone.utc).isoformat()`.

`library_names` calls `GET /libraries` and caches `{library_id: name}` on the instance for 600 seconds. A failure returns `{}` and is not cached. `item_type_labels` does the same with `GET /item_types` and `{item_type_id: description}`.

`get_bytes` sends the bearer token and returns `(content, content_type)`. It uses the same auth and error mapping. The log path template is `/cover`.

- [ ] **Step 4: Run the test**

Run: `python -m pytest tests/unit/test_koha_client.py tests/unit/test_koha_settings.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

Message: `Add a Koha client that keeps the OAuth token on the server.`

---

### Task 4: Permissions and saved-search table

**Files:**
- Create: `apps/api/alembic/versions/20261117_0003_catalog_searches.py`
- Create: `apps/api/app/models/catalog.py`
- Test: `apps/api/tests/api/test_catalog_schema.py`

**Interfaces:**
- Consumes: revision `20261116_0002`, tables `permissions`, `roles`, `role_permissions`, `app_users`
- Produces: ORM `SavedSearch` in schema `libraryhub`. Permission code `catalog.barcode.view`. Student also has `catalog.view`. Super Administrator, Library Administrator, Department Head, and Librarian have `catalog.barcode.view`. Auditor does not gain either grant beyond what `20261116_0002` already gave.

- [ ] **Step 1: Write the failing test**

```python
from sqlalchemy import text

from app.models.catalog import SavedSearch
from app.models.identity import Permission, Role


def test_catalog_permission_grants(db):
    barcode = db.query(Permission).filter_by(code="catalog.barcode.view").one()
    assert barcode.module == "catalog"
    grants = {
        role.name: {perm.code for perm in db.query(Permission).join(Role.permissions)}
        for role in db.query(Role)
    }
    # Role.permissions does not exist yet as a relationship. Query role_permissions instead.
    rows = db.execute(text("""
        SELECT r.name, p.code
        FROM libraryhub.roles r
        JOIN libraryhub.role_permissions rp ON rp.role_id = r.id
        JOIN libraryhub.permissions p ON p.id = rp.permission_id
        WHERE p.code IN ('catalog.view', 'catalog.barcode.view')
    """)).all()
    by_role: dict[str, set[str]] = {}
    for name, code in rows:
        by_role.setdefault(name, set()).add(code)
    assert "catalog.view" in by_role["Student"]
    assert "catalog.barcode.view" not in by_role["Student"]
    for name in ("Super Administrator", "Library Administrator", "Department Head", "Librarian"):
        assert "catalog.barcode.view" in by_role[name]
    assert "Auditor" not in by_role or "catalog.barcode.view" not in by_role["Auditor"]
    assert SavedSearch.__tablename__ == "saved_searches"
```

Remove the unused `grants` comprehension from the test before running it. The SQL assertion is the test.

- [ ] **Step 2: Apply the migration and run the test**

From `apps/api`:

```text
python -m alembic upgrade head
python -m pytest tests/api/test_catalog_schema.py -v
```

Expected before the migration file exists: alembic does not know revision `20261117_0003`, and the test fails.

- [ ] **Step 3: Add the revision and model**

Revision id `20261117_0003`, `down_revision` `20261116_0002`. `upgrade`:

1. Insert `catalog.barcode.view` into `libraryhub.permissions` when that code is absent (`module` `catalog`, description `See item barcodes`).
2. Insert `role_permissions` for Student / `catalog.view` when absent.
3. Insert `role_permissions` for `catalog.barcode.view` on Super Administrator, Library Administrator, Department Head, and Librarian when absent.
4. Create `libraryhub.saved_searches` with the columns in the spec. `kind` check `kind in ('recent', 'saved')`. `sort_direction` check `sort_direction in ('asc', 'desc')`. Label check: `(kind = 'saved' and label is not null and char_length(label) between 1 and 80) or (kind = 'recent' and label is null)`. `filters` is JSONB, not null, server default `'{}'::jsonb`.
5. Index `ix_saved_searches_user_kind_updated` on `(user_id, kind, updated_at)`.
6. Unique index `uq_saved_searches_identity` on `(user_id, kind, query_text, search_field, filters, sort_field, sort_direction)`.

`downgrade` drops the table, deletes the barcode permission grants and the permission row, and deletes the Student `catalog.view` grant.

`SavedSearch` maps those columns. `user_id` FK uses `ondelete="CASCADE"`. `filters` is `JSONB`.

- [ ] **Step 4: Upgrade and run the test**

Run the same two commands. Expected: PASS. Then `python -m pytest tests/api/test_identity_schema.py tests/api/test_auth.py -v` still passes.

- [ ] **Step 5: Commit**

Message: `Store catalog searches and grant student catalog access.`

---

### Task 5: Catalog service

**Files:**
- Create: `apps/api/app/schemas/catalog.py`
- Create: `apps/api/app/services/catalog.py`
- Modify: `apps/api/app/services/auth.py` (export CSRF check)
- Test: `apps/api/tests/unit/test_catalog_service.py`
- Test: `apps/api/tests/api/test_saved_searches.py`

**Interfaces:**
- Consumes: `KohaClient`, mapping helpers, `SavedSearch`, `load_session`
- Produces:
  - `class CatalogError(Exception)` with `status_code`, `code`, `message`
  - `opac_url(settings) -> str | None` stripping one trailing slash, or `None` when unset
  - `config_payload(settings) -> dict` using the allowlist module
  - `validate_search(params: SearchParams) -> None` raising `CatalogError(422, "invalid_search", "That search is not valid.")`
  - `search(db, client, settings, user_id, params) -> dict`
  - `biblio_detail(client, biblio_id: int) -> dict`
  - `biblio_items(client, biblio_id: int, *, include_barcode: bool) -> dict`
  - `cover_bytes(client, biblio_id: int) -> tuple[bytes, str]` or `CatalogError(404, "not_found", "That record was not found.")`
  - `list_recent(db, user_id) -> list[dict]`
  - `list_saved(db, user_id) -> list[dict]`
  - `save_search(db, user_id, body: SavedSearchIn) -> dict`
  - `delete_saved(db, user_id, search_id: UUID) -> None` raising `CatalogError(404, "not_found", "That saved search was not found.")`
  - `assert_csrf(session_row, header, cookie)` in `app.services.auth`, raising the existing `_CSRF_FAILED`

`SearchParams` fields: `q: str`, `field: str = "keyword"`, `page: int = 1`, `per_page: int = 20`, `sort: str = "title"`, `direction: str = "asc"`, `year_from: int | None = None`, `year_to: int | None = None`.

A search hit dict has `biblio_id`, `title`, `author`, `edition`, `isbn`, `publication_year`, `item_type`, `availability`, `has_cover`. Blank strings become `None`. `has_cover` is true only when the biblio or one of its items has a string `cover_url`, `cover_image_url`, or `image_url` starting with `http://` or `https://`. Integer `cover_image_ids` do not count.

- [ ] **Step 1: Write the failing unit test**

```python
import httpx

from app.services.catalog import CatalogError, search, validate_search
from app.schemas.catalog import SearchParams


class Settings:
    koha_base_url = "http://koha.test"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15
    koha_opac_url = None


def test_invalid_control_character_is_rejected():
    try:
        validate_search(SearchParams(q="bad\x00"))
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.code == "invalid_search"
        assert exc.message == "That search is not valid."
    else:
        raise AssertionError("expected CatalogError")


def test_title_search_requests_one_page_and_strips_barcode(db):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            assert request.url.params["_page"] == "1"
            assert request.url.params["_per_page"] == "10"
            assert request.url.params["_order_by"] == "title"
            assert '"title"' in request.url.params["q"]
            assert "Ada" in request.url.params["q"]
            return httpx.Response(
                200,
                json=[{"biblio_id": 9, "title": "Ada", "author": "Lovelace"}],
                headers={"X-Total-Count": "1"},
            )
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[{
                "biblio_id": 9,
                "external_id": "SHOULD-NOT-LEAK",
                "item_type_id": "BK",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
                "withdrawn": 0,
                "lost_status": 0,
                "damaged_status": 0,
                "not_for_loan_status": 0,
                "effective_not_for_loan_status": 0,
                "checked_out_date": None,
            }])
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    user_id = db.execute(__import__("sqlalchemy").text(
        "SELECT id FROM libraryhub.app_users LIMIT 1"
    )).scalar()
    # The HTTP test in the next step owns persistence. This unit test passes user_id None
    # when search is called with record_recent=False.
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="Ada", field="title", per_page=10),
        record_recent=False,
    )
    assert payload["total"] == 1
    assert payload["results"][0]["title"] == "Ada"
    assert payload["results"][0]["item_type"] == "Book"
    assert "SHOULD-NOT-LEAK" not in str(payload)
    assert seen.count("/api/v1/biblios") == 1
```

`search(..., record_recent: bool = True)` skips the recent-row write when false, so this test does not need a user. Delete the unused `user_id` query from the test.

- [ ] **Step 2: Run the unit test**

Run: `python -m pytest tests/unit/test_catalog_service.py -v`

Expected: FAIL with import errors.

- [ ] **Step 3: Implement validation and search mapping**

`validate_search` trims `q`. Reject when the trimmed length is outside 1–200, when any character has `ord` below 32 or equal to 127, when `field` is not in `DEFAULT_FIELDS`, when `page < 1`, when `per_page` is not in `{10, 20, 40}`, when `sort` is not in `DEFAULT_SORTS`, or when `direction` is not `asc` or `desc`. Reject `year_from` or `year_to` while `YEAR_FILTER` is false. When a year is set, it must be an integer from 1000 through 2100, and `year_from` must not exceed `year_to`. Barcode `q` longer than 32 characters after trim is invalid. Store the trimmed `q` back on the params object.

`search` for `field == "barcode"` calls `GET /items` with params `{"external_id": trimmed, "_per_page": 1}`. No row returns `{query, page: 1, per_page, total: 0, sort, direction, has_next: false, results: []}`. A row loads `GET /biblios/{biblio_id}` and uses that one object as the page. Sort and year are not sent.

For other fields, call `GET /biblios` with `_page`, `_per_page`, `_order_by`, and `q` set to `json.dumps(build_biblio_query(...))`. `total` is `int` of `X-Total-Count` when that header is all digits, else `None`. `has_next` follows the spec. Then `list_items_for_biblios` for the returned ids. Map each biblio with `item_type` from the first item’s label, `publication_year` from the JSON keys `publication_year`, `copyright_date`, or `copyrightdate` in that order, and `availability` from `summarize_copies`. Do not put `external_id` on the hit.

When `record_recent` is true and `user_id` is not `None`, upsert a `recent` row on `uq_saved_searches_identity` by setting `updated_at` to `now()`. Then, while that user has more than 10 recent rows, delete the oldest by `updated_at`. Do this only after the Koha call returns. Let Koha exceptions propagate.

`biblio_detail` loads JSON from `GET /biblios/{id}` and MARC from `get_json(f"/biblios/{id}", accept="application/marc-in-json")`. JSON title, author, edition, isbn, publisher, place, and year win when they are non-empty. MARC fills the gaps. Authors from MARC are returned as `contributors`. `KohaNotFound` becomes `CatalogError(404, "not_found", "That record was not found.")`.

`biblio_items` uses `list_items_for_biblios([biblio_id])`. Each copy dict contains only `call_number` (from `callnumber`), `copy_number`, `item_type_id`, `item_type_label`, `home_library_id`, `home_library_name`, `holding_library_id`, `holding_library_name`, `location`, `status`, `status_label`. Add `barcode` from `external_id` only when `include_barcode` is true. Library names come from `library_names()`, falling back to the id. The response also has `last_checked` and `notice` set to the availability sentence. A failed item lookup returns `copies: []`, `last_checked: null`, and the same notice.

`cover_bytes` finds the first http(s) cover URL on the biblio or its items and returns `get_bytes`. No URL raises the biblio 404 error.

`save_search` validates through `SearchParams` plus a label of 1–80 trimmed characters. Insert a `saved` row. On the unique conflict, update `label` and `updated_at` instead of inserting a second row. Then delete the oldest saved rows until 30 remain. `delete_saved` deletes one row with that id and `user_id` and `kind == "saved"`. Zero rows raises the saved-search 404.

`assert_csrf` calls the existing `_verify_csrf`.

- [ ] **Step 4: Write the database test and run both**

`tests/api/test_saved_searches.py` logs in as a Librarian and a second Librarian through `add_user` from `tests/api/test_auth.py`. It calls `save_search` twice with the same query and different labels and asserts one row whose label is the second one. It inserts 31 distinct saved queries and asserts 30 remain. It inserts 11 distinct recent rows through `search(..., record_recent=True)` against a mock that returns an empty biblio page, and asserts 10 remain. `delete_saved` for the other user’s id raises the saved-search 404.

Run: `python -m pytest tests/unit/test_catalog_service.py tests/api/test_saved_searches.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

Message: `Search Koha one page at a time and remember the query.`

---

### Task 6: Catalog HTTP routes

**Files:**
- Create: `apps/api/app/api/dependencies/session.py`
- Create: `apps/api/app/api/routes/catalog.py`
- Modify: `apps/api/app/api/routes/__init__.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/api/test_catalog_http.py`

**Interfaces:**
- Consumes: `search`, `biblio_detail`, `biblio_items`, `cover_bytes`, `config_payload`, saved-search functions, `assert_csrf`, `load_session`
- Produces: routes mounted at `/api/v1/catalog`. `get_catalog_user` returns `(CurrentUserOut, UserSession)` or raises 401 `unauthenticated` / 403 `permission_denied`.

- [ ] **Step 1: Write the failing test**

Use `auth_client`, `add_user`, and a monkeypatch that replaces `KohaClient` inside the catalog route module with a client whose transport is `httpx.MockTransport`.

Cases:

1. No cookie on `GET /api/v1/catalog/config` returns 401 `unauthenticated`.
2. A Student login can `GET /config`. With `KOHA_OPAC_URL` unset, `opac_url` is `null`, `fields` contains `keyword`, and `year_filter` is false. `get_settings.cache_clear()` around the env change.
3. Student `GET /search?q=Ada&field=title` returns the hit and does not contain `SHOULD-NOT-LEAK`. The mock items include `external_id`.
4. Librarian `GET /biblios/9/items` includes `"barcode": "67786"`. Student response for the same path has no `barcode` key.
5. `GET /search?q=%00` returns 422 `invalid_search` and the message `That search is not valid.`
6. A transport that raises `httpx.ConnectError` on `/biblios` returns 503 `catalog_unavailable` and the message `The catalog is unavailable. Try again.` The body does not contain `ConnectError`.
7. A transport that raises `httpx.ReadTimeout` returns 504 `catalog_timeout`.
8. Student `POST /saved-searches` without `X-CSRF-Token` returns 403 `csrf_failed`. With the CSRF header from `tests/api/test_auth.py` `csrf_headers`, it returns 201. `DELETE` of that id by the other user returns 404 `not_found` and the message `That saved search was not found.`
9. `GET /biblios/9/cover` when the biblio has no cover URL returns 404. When `cover_url` is `https://koha.test/cover.jpg` and that URL returns `image/jpeg` bytes `b"jpeg"`, the route returns those bytes, `content-type: image/jpeg`, and `cache-control: private, max-age=3600`.

- [ ] **Step 2: Run the test**

Run: `python -m pytest tests/api/test_catalog_http.py -v`

Expected: FAIL with 404 because the routes are not mounted.

- [ ] **Step 3: Mount the routes**

`get_catalog_user` reads `libraryhub_session`, calls `load_session`, and requires `catalog.view`. Map `AuthError` to `HTTPException` with `detail={"code", "message"}`. Missing permission uses `permission_denied` and `You do not have access to the catalog.`

The route builds one `KohaClient(get_settings())` per request. Catch `CatalogError` and the five `KohaError` subclasses. `KohaTimeoutError` → 504 `catalog_timeout`. `KohaConnectionError`, `KohaAuthError`, and `KohaResponseError` → 503 `catalog_unavailable`. `KohaNotFound` on a biblio route → 404 `That record was not found.`

`POST` and `DELETE` call `assert_csrf` with header `X-CSRF-Token` and cookie `libraryhub_csrf` before the service call.

`GET /cover` returns a `Response` with the bytes and the cache header. Do not JSON-encode the image.

Include the router from `main.py` with `prefix=settings.api_v1_prefix`.

- [ ] **Step 4: Run the catalog and auth tests**

Run: `python -m pytest tests/api/test_catalog_http.py tests/api/test_auth.py tests/unit/test_koha_client.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

Message: `Expose catalog search without leaking barcodes or Koha credentials.`

---

### Task 7: Search URL helper

**Files:**
- Create: `apps/web/lib/catalog/search-params.ts`
- Create: `apps/web/lib/catalog/search-params.test.ts`
- Create: `apps/web/lib/catalog/types.ts`
- Modify: `apps/web/package.json` scripts

**Interfaces:**
- Produces:
  - `type CatalogSearchState` with `q`, `field`, `sort`, `direction`, `page`, `perPage`, `view`, `yearFrom`, `yearTo`
  - `parseCatalogSearch(params: URLSearchParams): CatalogSearchState`
  - `serializeCatalogSearch(state: CatalogSearchState): string` without a leading `?`
  - Default `field` is `keyword`, `sort` is `title`, `direction` is `asc`, `page` is `1`, `perPage` is `20`, `view` is `cover`

- [ ] **Step 1: Write the failing test**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { parseCatalogSearch, serializeCatalogSearch } from "./search-params.ts";

test("defaults and round trip", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("q=Ada&field=title&view=list&page=2&per_page=40"));
  assert.equal(parsed.q, "Ada");
  assert.equal(parsed.field, "title");
  assert.equal(parsed.view, "list");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.perPage, 40);
  assert.equal(parsed.sort, "title");
  const again = parseCatalogSearch(new URLSearchParams(serializeCatalogSearch(parsed)));
  assert.deepEqual(again, parsed);
});

test("invalid view and page fall back", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("view=summary&page=0&per_page=15"));
  assert.equal(parsed.view, "cover");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.perPage, 20);
});
```

Add `"test": "node --test lib/catalog/search-params.test.ts"` to `apps/web/package.json` scripts. The test imports the `.ts` file. Run it with `node --experimental-strip-types --test lib/catalog/search-params.test.ts` if the installed Node version requires the strip-types flag. Node on this machine is v26, which runs the test without a new TypeScript runner.

- [ ] **Step 2: Run the test**

From `apps/web`: `npm test`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the helper**

`parseCatalogSearch` reads `q`, `field`, `sort`, `direction`, `page`, `per_page`, `view`, `year_from`, and `year_to`. Unknown `view` becomes `cover`. `page` below 1 becomes 1. `per_page` outside 10, 20, and 40 becomes 20. `direction` outside `asc` and `desc` becomes `asc`. Empty year params become `null`. `serializeCatalogSearch` omits empty `q` and null years, and always writes `field`, `sort`, `direction`, `page`, `per_page`, and `view`.

`types.ts` mirrors the JSON from Task 5: `CatalogConfig`, `CatalogHit`, `CatalogSearchResponse`, `CatalogRecord`, `CatalogCopy`, `CatalogItems`, `SavedSearchRow`.

- [ ] **Step 4: Run the test**

Run: `npm test`

Expected: PASS

- [ ] **Step 5: Commit**

Message: `Keep catalog search state in the page URL.`

---

### Task 8: Catalog screens

**Files:**
- Modify: `apps/web/package.json` dependencies
- Create: `apps/web/components/catalog/query-provider.tsx`
- Create: `apps/web/components/catalog/catalog-browser.tsx`
- Create: `apps/web/components/catalog/record-view.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/app/(app)/catalog/page.tsx`
- Create: `apps/web/app/(app)/catalog/[biblioId]/page.tsx`

**Interfaces:**
- Consumes: `fetchApi` from `apps/web/lib/api.ts`, `parseCatalogSearch`, `serializeCatalogSearch`, `ModuleFrame`, `AccessDenied`, `gatePage`, `Button`
- Produces: `/catalog` and `/catalog/[biblioId]` inside the staff shell. TanStack Query is provided only in `app/(app)/layout.tsx`.

- [ ] **Step 1: Add the dependency and a typecheck target**

From `apps/web`: `npm install @tanstack/react-query`

`query-provider.tsx` is a client component with one `QueryClient` (`staleTime` 30 seconds) and `QueryClientProvider`. `app/(app)/layout.tsx` wraps `{children}` with it inside `.ulms`, around `StaffShell`. The marketing layout is not touched.

- [ ] **Step 2: Replace the catalog placeholder**

`app/(app)/catalog/page.tsx` keeps `gatePage("catalog.view")` and `AccessDenied`. On success it renders `<CatalogBrowser />` and does not pass a hardcoded OPAC href.

`CatalogBrowser` is a client component. It reads `useSearchParams` and parses them. `useQuery` loads `/catalog/config`, `/catalog/recent-searches`, and `/catalog/saved-searches`. A second `useQuery` calls `/catalog/search` only when `q` is non-empty. The query key is the serialized search state. `placeholderData` keeps the previous results while the next page loads, and the form state stays in the inputs.

The header is `ModuleFrame` with the existing eyebrow, title, and description, and `hideModuleSentence`. The action is a link labeled `Open Koha OPAC` only when `config.opac_url` is a string. `target="_blank"` and `rel="noopener"`.

The form has a text input, a field select whose options come from `config.fields`, and year inputs only when `config.year_filter` is true. The keyword option’s visible label is `config` does not supply labels, so the browser maps `keyword` to `Keyword (title or author)`, `title` to `Title`, `author` to `Author`, `isbn` to `ISBN`, `barcode` to `Barcode`, and `subject` to `Subject`. Submit writes the serialized params with `page` 1 through `router.push`.

Before the first `q`, show `Search the catalog.` When the search query is pending, show `Searching the catalog.` When `error.status` is 503, show `The catalog is unavailable. Try again.` When it is 504, show `The catalog took too long to respond. Try again.` When it is 422, show `That search is not valid.` If `opac_url` is null, add `The OPAC address is not configured.` If it is set, add a link `Open the Koha OPAC` with the same new-tab attributes and the sentence `This link leaves ULMS and opens the Koha OPAC.` A `Retry` button calls `refetch` and does not clear the inputs. An empty `results` array shows `No records matched this search.`

A cover/list control sets `view` in the URL. Cover is a grid (`grid-cols-2`, `md:grid-cols-4`, `xl:grid-cols-5`). Each card shows an image only when `has_cover` is true, using `src={`/api/v1/catalog/biblios/${biblio_id}/cover`}`. Otherwise show a bordered placeholder with no image request. Show title, author, year, and `availability.label` when those values are non-null. List adds edition, ISBN, and item type on the same rule. The title links to `/catalog/${biblio_id}?${serializeCatalogSearch(state)}`.

Pagination shows `Page {page}` and, when `total` is a number, `{total} results`. Previous and next call the URL helper. Next is disabled when `has_next` is false.

Recent and saved lists use the same restore link. From `lg` up they sit in a side column; below that they follow the results. Save posts `{label, q, field, sort, direction, year_from, year_to}` to `/catalog/saved-searches` through `fetchApi`, which already sends the CSRF header. The label field is required. Delete asks `window.confirm("Remove this saved search?")` and then `DELETE /catalog/saved-searches/{id}`.

- [ ] **Step 3: Add the detail route**

`app/(app)/catalog/[biblioId]/page.tsx` rejects a non-numeric id with `notFound()` from `next/navigation`. Otherwise it gates on `catalog.view` and renders `RecordView` with the id and `searchParams`.

`RecordView` loads `/catalog/biblios/{id}` and `/catalog/biblios/{id}/items`. It shows only non-null title, contributors, edition, place, publisher, year, ISBNs, subjects, and description. Copies show the fields present on `CatalogCopy`, including `barcode` only when the payload has that key. It shows `items.notice` and `Last checked {last_checked}` when `last_checked` is a string. The back link is `/catalog` plus the incoming search string, labeled `Back to results`. The OPAC record link is `{opac_url}/cgi-bin/koha/opac-detail.pl?biblionumber={id}` labeled `View this record in the Koha OPAC`, only when `opac_url` is set.

- [ ] **Step 4: Typecheck**

From `apps/web`: `npm run typecheck`

Expected: exit 0. Fix only types introduced by this task.

- [ ] **Step 5: Commit**

Message: `Show Koha search results in the staff catalog.`

---

### Task 9: Integration notes and browser check

**Files:**
- Modify: `docs/koha-integration.md`
- Modify: `docs/superpowers/specs/2026-11-17-catalog-search-design.md` status line
- Create: `apps/api/app/scripts/koha_fields.py`

**Interfaces:**
- Consumes: `KohaClient.get_json("/biblios", {"_per_page": "1"})`
- Produces: a script that prints sorted JSON keys, or exits 2 without printing a record. The doc states whether the live check ran.

- [ ] **Step 1: Write the field script**

`python -m app.scripts.koha_fields` from `apps/api` builds `KohaClient(get_settings())`. Missing base URL or client id prints `Koha is not configured` and exits 2. A `KohaError` prints the exception class name and exits 2. Success prints `keys:` plus the comma-separated sorted keys of the first object. It prints nothing else from the payload. If the first object has no `title` key, print `title-missing` on a second line. Same for `author` and `isbn`. If a key named `copyright_date`, `publication_year`, or `copyrightdate` exists, print `year-field:` and that key name. If a key contains `subject`, print `subject-field:` and that key name. Do not change `allowlist.py` in this task unless a key is missing or a year or subject key is present. When a key is missing, remove it from `DEFAULT_FIELDS` and adjust keyword as the spec says. When a year or subject key is present, set `YEAR_FILTER`, `YEAR_FIELD`, or `SUBJECT_FIELD` and add the sort or field. Update the unit test expectations in the same commit if those defaults change.

- [ ] **Step 2: Run the script and write the doc**

Run: `python -m app.scripts.koha_fields`

`docs/koha-integration.md` replaces the one-line stub. Include:

- ULMS calls the staff REST API at `KOHA_BASE_URL` and appends `/api/v1`.
- Authentication is `POST /oauth/token` with `grant_type=client_credentials`.
- The public OPAC origin is `KOHA_OPAC_URL` and may be empty.
- Staff username and password are not used.
- Default search fields, the keyword rule, and the statement that library, item type, availability, and subject are copy facts rather than result filters.
- Barcodes require `catalog.barcode.view`.
- A `Live field check` section. If the script exits 0, paste the key line and any `title-missing`, `author-missing`, `isbn-missing`, `year-field`, or `subject-field` lines. If it exits 2, write `Live field check: outstanding. The default allowlist is in force.`
- No client id, secret, token, barcode, or record title.

Set the spec status line to `Status: approved`.

- [ ] **Step 3: Run the automated suites**

From `apps/api`: `python -m pytest tests/unit tests/api -v`

From `apps/web`: `npm test` and `npm run typecheck`

Expected: the new tests pass, and the existing auth, health, and identity tests still pass.

- [ ] **Step 4: Exercise the browser**

With `npm run dev:web` and the API running, sign in as the seeded super administrator. Search for a short title. Confirm a result opens a detail page and Back returns the same query. Switch cover and list. Save the search, reload, and open it from saved searches. Confirm the page does not show a barcode to a user who lacks `catalog.barcode.view` by signing in as a Student if one exists, or by calling `GET /api/v1/catalog/biblios/{id}/items` with a student session. If Koha is down, confirm the banner keeps the query and does not show a credential or a stack trace. Record the result in the commit message body only as a sentence, not as a secret.

- [ ] **Step 5: Commit**

Message: `Record what this Koha server can search.`

---

## Spec coverage

| Spec section | Task |
|---|---|
| Settings and `.env.example` | Task 1 |
| Query, status, MARC | Task 2 |
| OAuth client, logs, caches | Task 3 |
| Permissions and `saved_searches` | Task 4 |
| Search, detail, copies, covers, recent and saved rules | Task 5 |
| HTTP errors, CSRF, barcode stripping | Task 6 |
| URL state | Task 7 |
| Screens and TanStack Query | Task 8 |
| `docs/koha-integration.md` and the live key check | Task 9 |

## Out of scope

Do not implement anonymous search, a Faculty role, circulation writes, HTML scraping, SRU, a local catalog, Redis, `koha_branchcode` mapping, Open Library covers, A–Z browse, a summary results mode, or marketing-site link changes.
