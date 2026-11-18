# Catalog browse page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Catalog on the first page of live Koha titles, and narrow that page with a prototype search card, an A–Z prefix, copy filters, and shadcn pagination.

**Architecture:** The browser keeps one URL and calls the existing `GET /api/v1/catalog/search`. `q` may be empty. A letter, author, and publisher are extra Koha `q` clauses. Availability and library are applied to copies inside a five-page Koha window. Recent and saved search routes stay; this page stops calling them.

**Tech Stack:** FastAPI, HTTPX, Pydantic, pytest, Next.js 16, TanStack Query, shadcn Select and Pagination, node:test.

## Global Constraints

- Koha stays the authority. Do not copy the catalog, build an index, or cache availability.
- `/catalog` loads page 1, sort title ascending, with no typed query.
- A letter is `{title: {-like: "A%"}}`. ALL means the letter is absent. The alphabet is A–Z and ALL.
- Titles that start with a number or symbol appear only when no letter is selected. Do not add a “#” control. Do not strip a leading article. *The Hobbit* is under T.
- Dropdowns are `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem` from `apps/web/components/ui/select.tsx`. `SelectContent` sets `alignItemWithTrigger` to false. The menu is portaled and must not reserve space in the card.
- Active color is the ULMS maroon already in `.ulms` (`#7d1519`). Do not introduce teal.
- Availability `available` keeps `available_count > 0`. `on_loan` keeps `copy_count > 0` and `available_count == 0`. Library matches a copy `home_library_id`.
- With either item filter, ULMS page 1 reads Koha pages 1–5, page 2 reads 6–10, and so on. Return every match in the window. `total` is null. Do not stop the window at `per_page`.
- A barcode search uses the barcode only.
- Write a recent-search row only when `q` is non-empty. Do not call recent or saved search routes from this page.
- Page sizes stay 10, 20, and 40. Default 20. This page has no page-size control.
- Error sentences stay: “The catalog is unavailable. Try again.” “The catalog took too long to respond. Try again.” “That search is not valid.” “You do not have access to the catalog.”
- Pytest uses `httpx.MockTransport` and does not open a socket to Koha.
- On Windows, commit with `git commit -F <msgfile>`. Do not add a `Co-authored-by: Cursor` trailer. After `git commit`, if `git log -1 --format=%B` contains that trailer, replace the commit with `git commit-tree` as required by `.cursor/rules/strip-cursor-coauthor.mdc`. Do not use `git commit --amend`.

---

## File map

| File | Responsibility |
|---|---|
| `apps/web/lib/catalog/search-params.ts` | Parse and serialize `letter`, `author`, `publisher`, `availability`, `library` |
| `apps/web/lib/catalog/group-titles.ts` | Consecutive title-letter groups |
| `apps/web/lib/catalog/page-items.ts` | Numbered pager tokens |
| `apps/web/lib/catalog/types.ts` | New response and library fields |
| `apps/web/components/ui/pagination.tsx` | shadcn pagination primitives |
| `apps/web/components/catalog/catalog-search-card.tsx` | Prototype search card |
| `apps/web/components/catalog/catalog-alphabet.tsx` | A–Z and ALL |
| `apps/web/components/catalog/catalog-results.tsx` | Cover grid, list, empty, loading |
| `apps/web/components/catalog/catalog-pagination.tsx` | Numbered pager or Previous/Next |
| `apps/web/components/catalog/catalog-browser.tsx` | URL state and queries only |
| `apps/api/app/integrations/koha/query.py` | Optional text, letter, author, publisher |
| `apps/api/app/schemas/catalog.py` | New search fields |
| `apps/api/app/services/catalog.py` | Validation, window, recent-search rule |
| `apps/api/app/api/routes/catalog.py` | `GET /libraries` |
| `docs/koha-integration.md` | Replace the sentence that forbids these filters |

---

### Task 1: URL state

**Files:**
- Modify: `apps/web/lib/catalog/search-params.ts`
- Modify: `apps/web/lib/catalog/search-params.test.ts`
- Modify: `apps/web/package.json` (test script runs `lib/catalog/*.test.ts`)

**Interfaces:**
- Consumes: existing `CatalogSearchState`
- Produces: `CatalogSearchState` extended with `letter: string | null`, `author: string`, `publisher: string`, `availability: "" | "available" | "on_loan"`, `library: string`. `parseCatalogSearch` rewrites `sort=copyright_date` to `sort: "title"` and `direction: "asc"`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/lib/catalog/search-params.test.ts`:

```ts
test("browse params round trip and drop an empty letter", () => {
  const parsed = parseCatalogSearch(
    new URLSearchParams(
      "letter=m&author=Ada&publisher=Murray&availability=available&library=CPL",
    ),
  );
  assert.equal(parsed.q, "");
  assert.equal(parsed.letter, "M");
  assert.equal(parsed.author, "Ada");
  assert.equal(parsed.publisher, "Murray");
  assert.equal(parsed.availability, "available");
  assert.equal(parsed.library, "CPL");
  const again = parseCatalogSearch(new URLSearchParams(serializeCatalogSearch(parsed)));
  assert.deepEqual(again, parsed);
  assert.equal(parseCatalogSearch(new URLSearchParams("letter=9")).letter, null);
  assert.equal(parseCatalogSearch(new URLSearchParams("availability=maybe")).availability, "");
});

test("year sort on this page becomes title ascending", () => {
  const parsed = parseCatalogSearch(new URLSearchParams("sort=copyright_date&direction=desc"));
  assert.equal(parsed.sort, "title");
  assert.equal(parsed.direction, "asc");
});
```

- [ ] **Step 2: Run the test**

Run from `apps/web`: `npm test`

Expected: FAIL because `letter` is not on the parsed object.

- [ ] **Step 3: Extend the parser**

Add the five fields to `CatalogSearchState`. Parse `letter` as one A–Z character, uppercased, otherwise null. Parse `availability` only when it is `available` or `on_loan`, otherwise `""`. Keep `author`, `publisher`, and `library` as trimmed strings, default `""`. When `sort` is `copyright_date`, return `sort: "title"` and `direction: "asc"`. Serialize `letter`, `author`, `publisher`, `availability`, and `library` only when they are non-empty.

Change the web test script to `node --test lib/catalog/*.test.ts`.

- [ ] **Step 4: Run the test**

Run from `apps/web`: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/lib/catalog/search-params.ts apps/web/lib/catalog/search-params.test.ts apps/web/package.json
git commit -F <msgfile>
```

Message: `Keep catalog browse filters in the page URL.`

---

### Task 2: Koha query clauses

**Files:**
- Modify: `apps/api/app/integrations/koha/query.py`
- Modify: `apps/api/tests/unit/test_koha_catalog_mapping.py`

**Interfaces:**
- Consumes: `escape_like`, existing `build_biblio_query`
- Produces: `build_biblio_query(field, text, *, year_from, year_to, year_field, letter=None, author=None, publisher=None) -> dict | None`. `None` means send no Koha `q`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/unit/test_koha_catalog_mapping.py`:

```python
def test_empty_browse_has_no_clause_and_letter_is_a_prefix():
    assert build_biblio_query(
        "keyword", "", year_from=None, year_to=None, year_field=None
    ) is None
    assert build_biblio_query(
        "keyword", "", year_from=None, year_to=None, year_field=None, letter="M"
    ) == {"title": {"-like": "M%"}}
    assert build_biblio_query(
        "keyword", "Ada", year_from=None, year_to=None, year_field=None,
        letter="A", author="Lovelace", publisher="Murray",
    ) == {
        "-and": [
            {"-or": [
                {"title": {"-like": "%Ada%"}},
                {"author": {"-like": "%Ada%"}},
            ]},
            {"title": {"-like": "A%"}},
            {"author": {"-like": "%Lovelace%"}},
            {"publisher": {"-like": "%Murray%"}},
        ]
    }
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `python -m pytest tests/unit/test_koha_catalog_mapping.py::test_empty_browse_has_no_clause_and_letter_is_a_prefix -v`

Expected: FAIL because `build_biblio_query` does not accept `letter`.

- [ ] **Step 3: Build the clause list**

Keep `_like` for contains matches. Add `_prefix(field, letter)` that returns `{field: {"-like": f"{escape_like(letter)}%"}}`. Collect clauses in this order: the existing field clause when `text` is non-empty, the letter prefix, the author contains clause, the publisher contains clause, then the existing year clause. Return `None` when the list is empty, the only clause when the list has one item, and `{"-and": clauses}` otherwise. Existing callers that omit the new keywords keep their current results.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `python -m pytest tests/unit/test_koha_catalog_mapping.py -v`

Expected: PASS, including the existing like and year tests.

- [ ] **Step 5: Commit**

Message: `Add title prefix and contains clauses to the Koha query.`

---

### Task 3: Search validation

**Files:**
- Modify: `apps/api/app/schemas/catalog.py`
- Modify: `apps/api/app/services/catalog.py` (`validate_search` and `_search_shell`)
- Modify: `apps/api/tests/unit/test_catalog_service.py`

**Interfaces:**
- Consumes: `SearchParams`, `CatalogError` `_INVALID`
- Produces: `SearchParams` fields `letter: str | None = None`, `author: str | None = None`, `publisher: str | None = None`, `availability: str | None = None`, `library: str | None = None`. `q` defaults to `""`. `validate_search` uppercases a valid letter and sets blank optional strings to `None`. `_search_shell` includes `letter`, `author`, `publisher`, `availability`, and `library`, using null for an unused value.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/unit/test_catalog_service.py`:

```python
def test_empty_query_is_valid_and_a_bad_letter_is_not():
    params = SearchParams(q="  ")
    validate_search(params)
    assert params.q == ""
    bad = SearchParams(q="", letter="99")
    try:
        validate_search(bad)
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.message == "That search is not valid."
    else:
        raise AssertionError("expected CatalogError")
    letter = SearchParams(q="", letter="m", author="  ", availability="any")
    validate_search(letter)
    assert letter.letter == "M"
    assert letter.author is None
    assert letter.availability is None
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py::test_empty_query_is_valid_and_a_bad_letter_is_not -v`

Expected: FAIL because empty `q` is rejected.

- [ ] **Step 3: Relax `q` and validate the new fields**

In `SearchParams`, default `q` to `""` and add the five optional fields. In `validate_search`, reject `q` only when it is non-empty and outside 1–200 characters. A barcode still requires 1–32 characters. Normalize `letter` to one uppercase A–Z or `None`. Normalize `author` and `publisher` like `q`: blank becomes `None`, otherwise 1–200 characters and no C0 or DEL. `availability` of `None`, `""`, or `any` becomes `None`; `available` and `on_loan` stay; anything else raises `_INVALID`. Blank `library` becomes `None`. A library longer than 64 characters raises `_INVALID`. Add the five echo fields to `_search_shell`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py -v`

Expected: PASS. Existing title and barcode tests still pass.

- [ ] **Step 5: Commit**

Message: `Allow an empty catalog query and validate browse filters.`

---

### Task 4: Library list

**Files:**
- Modify: `apps/api/app/api/routes/catalog.py`
- Modify: `apps/api/tests/api/test_catalog_http.py`

**Interfaces:**
- Consumes: `KohaClient.library_names()` which returns `{library_id: name}`
- Produces: `GET /api/v1/catalog/libraries` → `list[{"id": str, "name": str}]` sorted by name. Requires `catalog.view`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/api/test_catalog_http.py`, using the file’s `_login`, `_patch_koha`, `add_user`, and `PASSWORD`:

```python
def test_catalog_libraries_are_sorted_by_name(auth_client, db, monkeypatch):
    add_user(
        db,
        username="lib-list",
        email="lib-list@usant.edu.ph",
        display_name="Library List",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "lib-list")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return _oauth_token_response()
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[
                {"library_id": "SHS", "name": "Senior High School Library"},
                {"library_id": "CPL", "name": "College Library"},
            ])
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    response = auth_client.get("/api/v1/catalog/libraries")
    assert response.status_code == 200
    assert response.json() == [
        {"id": "CPL", "name": "College Library"},
        {"id": "SHS", "name": "Senior High School Library"},
    ]
```

- [ ] **Step 2: Run the test**

Run from `apps/api`: `python -m pytest tests/api/test_catalog_http.py -k libraries -v`

Expected: FAIL with 404.

- [ ] **Step 3: Add the route**

Add `GET /libraries` on the catalog router, before `GET /biblios/{biblio_id}`. Call `library_names()`, return `[{"id": key, "name": value} for key, value in sorted(names.items(), key=lambda item: item[1])]`. Map `KohaError` with the existing `_handle_koha`. An empty cache returns `[]`.

- [ ] **Step 4: Run the test**

Run from `apps/api`: `python -m pytest tests/api/test_catalog_http.py -k libraries -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `List Koha libraries for the catalog filter.`

---

### Task 5: Browse, prefix, and recent searches

**Files:**
- Modify: `apps/api/app/services/catalog.py` (`search`)
- Modify: `apps/api/tests/unit/test_catalog_service.py`

**Interfaces:**
- Consumes: `build_biblio_query` returning `dict | None`, `validate_search`, `_record_recent`
- Produces: search payload echo fields. Empty `q` omits Koha `q`. A non-empty `q` still writes a recent row when `record_recent` is true and `user_id` is set. An empty `q` does not. Barcode search ignores `letter`, `author`, `publisher`, `year_from`, `year_to`, `availability`, and `library`.

- [ ] **Step 1: Write the failing tests**

Use the `Settings`, `db`, and `KohaClient` setup from `test_title_search_requests_one_page_and_strips_barcode`.

```python
def test_empty_browse_omits_q_and_does_not_record_recent(db):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            seen["params"] = dict(request.url.params)
            return httpx.Response(200, json=[{"biblio_id": 1, "title": "Ada"}], headers={"X-Total-Count": "1"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/libraries") or request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    user_id = __import__("uuid").uuid4()
    payload = search(db, client, Settings(), user_id, SearchParams(q=""), record_recent=True)
    assert "q" not in seen["params"]
    assert payload["query"] == ""
    assert payload["letter"] is None
    assert db.query(__import__("app.models.catalog", fromlist=["SavedSearch"]).SavedSearch).count() == 0
```

Add these two tests beside it. Reuse the same token, items, libraries, and item-type branches.

```python
def test_letter_and_keyword_are_both_in_the_koha_query(db):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            seen["q"] = request.url.params["q"]
            return httpx.Response(200, json=[], headers={"X-Total-Count": "0"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/libraries") or request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    search(
        db, client, Settings(), None,
        SearchParams(q="Ada", field="keyword", letter="M"),
        record_recent=False,
    )
    assert "M%" in seen["q"]
    assert "%Ada%" in seen["q"]


def test_barcode_search_ignores_letter_and_library(db):
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/items"):
            assert request.url.params["external_id"] == "BC-1"
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="BC-1", field="barcode", letter="Z", library="CPL"),
        record_recent=False,
    )
    assert payload["results"] == []
    assert not any(path.endswith("/biblios") for path in paths)
```

- [ ] **Step 2: Run the tests**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py -k "empty_browse or letter or barcode" -v`

Expected: FAIL because empty `q` never reaches Koha, or the letter is not in `q`.

- [ ] **Step 3: Pass the new arguments through `search`**

Call `build_biblio_query` with `letter`, `author`, and `publisher`. When it returns `None`, omit `q` from the Koha params. When it returns a dict, send `json.dumps` as today. Include the echo fields on every payload, including barcode shells. Call `_record_recent` only when `record_recent`, `user_id` is not None, and `params.q` is non-empty. Barcode handling stays before the biblio query and does not read the new filters.

- [ ] **Step 4: Run the tests**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Browse the catalog without a typed query.`

---

### Task 6: Copy filters

**Files:**
- Modify: `apps/api/app/services/catalog.py`
- Modify: `apps/api/tests/unit/test_catalog_service.py`
- Modify: `docs/koha-integration.md`

**Interfaces:**
- Consumes: `_map_hit` availability counts, `client.library_names()`, `client.get_json("/biblios")`
- Produces: when `availability` or `library` is set, `search` reads Koha pages `(page - 1) * 5 + 1` through that start plus 4, stops early on a short page, filters hits, sets `total` to null, and sets `has_next` from the last page read. An unknown library id, when `library_names()` is non-empty, raises `CatalogError` 422 `invalid_search`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/unit/test_catalog_service.py`. Each biblio page returns one record. Odd ids are available. Even ids are checked out. `per_page` is 1 so a full Koha page is one biblio.

```python
def _copy(biblio_id: int, checked_out: bool) -> dict:
    return {
        "biblio_id": biblio_id,
        "external_id": f"BC-{biblio_id}",
        "item_type_id": "BK",
        "home_library_id": "CPL",
        "holding_library_id": "CPL",
        "withdrawn": 0,
        "lost_status": 0,
        "damaged_status": 0,
        "not_for_loan_status": 0,
        "effective_not_for_loan_status": 0,
        "checked_out_date": "2024-01-01" if checked_out else None,
    }


def test_available_filter_returns_the_whole_five_page_window(db):
    seen_pages = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            page = int(request.url.params["_page"])
            seen_pages.append(request.url.params["_page"])
            return httpx.Response(
                200,
                json=[{"biblio_id": page, "title": f"Title {page}"}],
                headers={"X-Total-Count": "6"},
            )
        if request.url.path.endswith("/items"):
            return httpx.Response(
                200,
                json=[_copy(i, checked_out=i % 2 == 0) for i in range(1, 7)],
            )
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="", per_page=1, availability="available"),
        record_recent=False,
    )
    assert [hit["biblio_id"] for hit in payload["results"]] == [1, 3, 5]
    assert payload["total"] is None
    assert payload["has_next"] is True
    assert seen_pages == ["1", "2", "3", "4", "5"]
```

The items handler above returns every copy on every call. That still lets the availability filter keep odd ids. If `list_items_for_biblios` sends a JSON `q` instead of a plain id, keep returning those six copies. The assertion is on the filtered biblio ids, not on the items query string.

Add `test_unknown_library_is_invalid`: the libraries response is College Library / `CPL`, `SearchParams(q="", library="NOPE")` raises `CatalogError` with status 422, and `/biblios` is not requested. Add `test_second_window_starts_at_koha_page_six`: the same handler, `page=2`, and `seen_pages[0] == "6"`.

- [ ] **Step 2: Run the tests**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py -k "window or unknown_library" -v`

Expected: FAIL because availability is ignored.

- [ ] **Step 3: Filter the window**

After items are grouped and hits are mapped for one Koha page, keep a hit when:

- `availability` is `available` and `hit["availability"]["available_count"] > 0`
- `availability` is `on_loan` and `copy_count > 0` and `available_count == 0`
- `library` is None or any grouped item for that biblio has `home_library_id` equal to `library`

If both filters are set, both must pass. If `library_names()` is non-empty and `library` is not a key, raise `_INVALID` before calling Koha. Loop `start = (params.page - 1) * 5 + 1` for up to five pages. A short page ends the loop. `has_next` is true when `X-Total-Count` says the last page index read is below the last page, otherwise when that page’s biblio count equals `per_page`. Set the payload `page` to `params.page` and `total` to null.

- [ ] **Step 4: Run the tests**

Run from `apps/api`: `python -m pytest tests/unit/test_catalog_service.py -v`

Expected: PASS.

- [ ] **Step 5: Update the integration note**

In `docs/koha-integration.md`, replace the sentence that says library and availability are not result-set filters with: availability and library filter the current five-page biblio window by copy facts; author, publisher, and title prefix filter the biblio `q`. Subject remains omitted.

- [ ] **Step 6: Commit**

Message: `Filter catalog pages by availability and home library.`

Files: `apps/api/app/services/catalog.py`, `apps/api/tests/unit/test_catalog_service.py`, `docs/koha-integration.md`.

---

### Task 7: Pager tokens and shadcn pagination

**Files:**
- Create: `apps/web/lib/catalog/page-items.ts`
- Create: `apps/web/lib/catalog/page-items.test.ts`
- Create: `apps/web/components/ui/pagination.tsx`
- Create: `apps/web/components/catalog/catalog-pagination.tsx`

**Interfaces:**
- Consumes: `pageItems(current: number, count: number): Array<number | "ellipsis">`
- Produces: `CatalogPagination` props `{ page: number; total: number | null; perPage: number; hasNext: boolean; onPage: (page: number) => void }`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { pageItems } from "./page-items.ts";

test("short lists show every page", () => {
  assert.deepEqual(pageItems(2, 4), [1, 2, 3, 4]);
});

test("long lists collapse the middle and the edges", () => {
  assert.deepEqual(pageItems(2, 10), [1, 2, 3, 4, "ellipsis", 10]);
  assert.deepEqual(pageItems(5, 10), [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  assert.deepEqual(pageItems(9, 10), [1, "ellipsis", 7, 8, 9, 10]);
});
```

- [ ] **Step 2: Run the test**

Run from `apps/web`: `npm test`

Expected: FAIL because `page-items.ts` does not exist.

- [ ] **Step 3: Implement the tokens and the components**

`pageItems` returns every page when `count <= 7`. When `current <= 4`, return `[1, 2, 3, 4, "ellipsis", count]`. When `current >= count - 3`, return `[1, "ellipsis", count - 3, count - 2, count - 1, count]`. Otherwise return `[1, "ellipsis", current - 1, current, current + 1, "ellipsis", count]`.

From `apps/web`, run `npx shadcn@latest add pagination --yes`. The file `components/ui/pagination.tsx` must export `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, and `PaginationEllipsis`. If the CLI prompts, accept the app’s `components.json` (`style` `base-mira`).

`CatalogPagination` computes `count = Math.ceil(total / perPage)` when `total` is a number and `total > 0`. It renders `pageItems` with `PaginationLink` `isActive` on the current page. Previous uses `onPage(page - 1)` and is disabled at page 1. Next uses `onPage(page + 1)` and is disabled at `count`. When `total` is null, render only Previous and Next. Next is disabled when `hasNext` is false. Render nothing when `total` is 0.

- [ ] **Step 4: Run the test**

Run from `apps/web`: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Add shadcn pagination for catalog pages.`

---

### Task 8: Title groups

**Files:**
- Create: `apps/web/lib/catalog/group-titles.ts`
- Create: `apps/web/lib/catalog/group-titles.test.ts`

**Interfaces:**
- Produces: `titleGroups(hits: { title: string | null }[], sort: string): { letter: string | null; hits: T[] }[]`. When `sort` is not `"title"`, return one group `{ letter: null, hits }`.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { titleGroups } from "./group-titles.ts";

test("title sort groups consecutive letters and leaves digits unlabeled", () => {
  const groups = titleGroups(
    [
      { title: "1984" },
      { title: "Amadeus" },
      { title: "Annotated Alice" },
      { title: "The Hobbit" },
    ],
    "title",
  );
  assert.deepEqual(
    groups.map((group) => group.letter),
    [null, "A", "T"],
  );
});

test("author sort is one unlabeled group", () => {
  const hits = [{ title: "Zebra" }, { title: "Amadeus" }];
  assert.deepEqual(titleGroups(hits, "author"), [{ letter: null, hits }]);
});
```

- [ ] **Step 2: Run the test**

Run from `apps/web`: `npm test`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Group consecutive letters**

A letter is the first trimmed character uppercased when it is A–Z. Otherwise the letter is null. Walk the hits in order. Start a new group when the letter changes. Do not reorder hits.

- [ ] **Step 4: Run the test**

Run from `apps/web`: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

Message: `Group catalog titles by their first letter.`

---

### Task 9: Catalog page

**Files:**
- Modify: `apps/web/lib/catalog/types.ts`
- Create: `apps/web/components/catalog/catalog-search-card.tsx`
- Create: `apps/web/components/catalog/catalog-alphabet.tsx`
- Create: `apps/web/components/catalog/catalog-results.tsx`
- Modify: `apps/web/components/catalog/catalog-browser.tsx`

**Interfaces:**
- Consumes: `CatalogSearchState`, `titleGroups`, `CatalogPagination`, `fetchApi`, `parseCatalogSearch`, `serializeCatalogSearch`
- Produces: `CatalogBrowser` with no recent or saved search queries. Search is enabled even when `q` is empty.

- [ ] **Step 1: Extend the client types**

Add to `CatalogSearchResponse`: `letter`, `author`, `publisher`, `availability`, and `library`, each `string | null`. Add `CatalogLibrary = { id: string; name: string }`.

- [ ] **Step 2: Build the search card**

`CatalogSearchCard` props are the current `CatalogSearchState`, `fieldOptions: string[]`, `yearFilter: boolean`, `libraries: CatalogLibrary[]`, `librariesFailed: boolean`, `total: number | null`, and `onSearch: (next: CatalogSearchState) => void`.

The card is a white rounded border with 16px padding. The query input has a leading `SearchIcon` and placeholder `Search by title, author, ISBN, or keyword…`. Local draft state copies `q`, `author`, `publisher`, `yearFrom`, and `yearTo`. Enter in the query, author, or publisher field, and blur of those fields, calls `onSearch` with `page: 1`. Selects call `onSearch` immediately with `page: 1`.

Select order: field, availability, library, sort. Each uses `SelectContent` with `alignItemWithTrigger={false}` and a trigger `className` of `h-9 min-w-36 text-sm`. Field options use the existing labels, with Keyword shown as `Keyword`. Availability options are `""` / Any availability, `available` / Available now, `on_loan` / All copies on loan. Library options are `""` / Any library, then `libraries`. When `librariesFailed` is true, the library select is disabled and its value is `""`. Sort options write both `sort` and `direction`: Title A–Z, Title Z–A, Author A–Z, Author Z–A.

Advanced search is a `<details>` closed by default, or a button that toggles a panel. The panel is a 12px top border and a four-column grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-4`) of Author contains, Publisher, and, when `yearFilter` is true, Year from and Year to. Labels are `text-xs font-semibold uppercase tracking-wide text-muted-foreground`. The footer is `mt-3 flex items-center justify-between text-xs text-muted-foreground`. The count text is `{total} records found` only when `total` is a number. The button text is `Advanced search`.

- [ ] **Step 3: Build the alphabet and the results**

`CatalogAlphabet` renders buttons A–Z and ALL. ALL is selected when `letter` is null. The selected button uses `bg-primary text-primary-foreground`. The row is `flex justify-center gap-2 overflow-x-auto text-xs`. Choosing a letter calls `onLetter` with that letter or null for ALL.

`CatalogResults` shows `Loading the catalog.` while `pending` is true. It shows `No records matched this search.` when the result list is empty. Otherwise it calls `titleGroups(hits, sort)`. A non-null letter renders as a heading with `border-b border-border`. Cover cards are a `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` grid. Each card is a `Link` to `/catalog/{biblioId}?{serialized state}` with `aspect-[3/4] object-cover`, a two-line title (`line-clamp-2`), and the author. No cover renders a `bg-muted` block and no image request. Hover is `transition hover:-translate-y-0.5 hover:shadow-sm`. List view keeps the current `ListRow` fields. Hits with a null `biblio_id` are not links.

- [ ] **Step 4: Replace the browser layout**

`CatalogBrowser` deletes the recent query, the saved query, the save form, the sidebar, and the effect that invalidates recent searches. `searchQuery` is enabled unconditionally. `buildApiSearchQuery` sends `letter`, `author`, `publisher`, `availability`, and `library` when set, and still sends `q` (empty string allowed). Add `useQuery` for `["catalog", "libraries"]` → `fetchApi<CatalogLibrary[]>("/catalog/libraries")`. Pass `librariesFailed` from `isError`.

The module frame title is `Catalog`. The description is `Browse and search the university catalog. Records come from Koha.` The OPAC action stays. Under it, render the search card, a toolbar with heading `Catalog`, the total only when it is a number, and Cover / List buttons, then the alphabet, the results, and `CatalogPagination`. Cover and List call `pushState` without changing `page`. `SearchErrorPanel` stays.

Changing any filter inside `onSearch` sets `page` to 1. The pager’s `onPage` changes only `page`.

- [ ] **Step 5: Typecheck**

Run from `apps/web`: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

Message: `Show the catalog as a browsable cover grid.`

---

### Task 10: Browser check

**Files:**
- None. This task verifies the running app.

- [ ] **Step 1: Start the API and the web app if they are not already running**

Web: `npm run dev:web` from the repo root. API: `npm run dev:api`.

- [ ] **Step 2: Exercise the catalog**

Sign in as a user with `catalog.view`. Open `/catalog`.

Confirm the first page of titles loads with no query, the recent and saved columns are gone, and the search card matches the spec: four shadcn selects, advanced author, publisher, and year, a menu that overlays the card. Choose a letter and confirm the request URL contains `letter`. Type a keyword and confirm it combines with the letter. Switch Cover and List and open a record, then use the back link and confirm the query string remains. Set availability or a library and confirm the footer count is hidden and the pager is Previous and Next. Narrow the window and confirm two covers per row and a sideways alphabet.

- [ ] **Step 3: Record the result in the task notes**

If a check fails, fix that behavior and re-run the matching automated test before checking the browser again. Do not commit a failing page.

---
