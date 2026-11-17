# Catalog search and Koha REST integration

Date: 2026-11-17
Status: approved in conversation, pending spec review

## Purpose

Signed-in staff and students search the university catalog from the ULMS staff shell. Koha remains the authority for bibliographic records, items, and availability. The ULMS stores search preferences only. It does not copy the catalog.

The public marketing site at `/` is unchanged, including its existing links to `https://library.usant.edu.ph/`. This module does not call that host.

## Decisions

- Audience is signed-in users with `catalog.view`. Student receives that permission and keeps `student.view`. There is no Faculty role and no anonymous search.
- Search uses the Koha REST API on `KOHA_BASE_URL`. The client authenticates with OAuth client credentials (`KOHA_CLIENT_ID`, `KOHA_CLIENT_SECRET`). `KOHA_API_USERNAME` and `KOHA_API_PASSWORD` are unused.
- One Koha query fetches the current page. Nothing in this module downloads the catalog, builds a local index, or caches availability. Redis is not used.
- Results have a cover view and a list view. There is no summary view and no A–Z index. Identifiers, subjects, and the description live on the detail page.
- The OPAC link is shown only when `KOHA_OPAC_URL` is set. It is never hardcoded.
- Library, item type, availability, and subject are not result-set filters. They are shown on copies when Koha returns them. Publication year is a filter only after a year column is confirmed on the biblio object.
- Item barcodes (`external_id`) require `catalog.barcode.view`. The API removes the field for everyone else.

## Koha capabilities

Observed on the configured staff host (`KOHA_BASE_URL`, development value `http://test-intra.koha.localhost:8888/`):

| Fact | Consequence |
|---|---|
| `POST /api/v1/oauth/token` accepts `grant_type=client_credentials` | The ULMS client uses that grant and a bearer token. |
| `GET /api/v1/biblios` returns 401 without a token and requires Koha permission `catalogue` | Search and biblio JSON reads are authenticated. |
| `GET /api/v1/public/biblios/{id}` accepts only MARC media types | Detail subjects and descriptions are parsed from `application/marc-in-json`. |
| No public biblio list. SRU and `svc/search` are not available on this host | Keyword search is not the OPAC index. |
| `GET /api/v1/biblios` supports `q`, `_page`, `_per_page`, `_order_by`, and `X-Total-Count` | Page, sort, and column filters go through those parameters. |
| Public items include `external_id` | The ULMS strips it unless the caller has `catalog.barcode.view`. |
| Public libraries on the dev host are `CPL`, `UCL`, `FRL`, `MPL`, `PVL`, `SPL` | Copy labels use Koha’s library name. ULMS department codes stay unmapped. `koha_branchcode` stays null. |
| Staff `opac-image.pl` is absent on this host | Covers are used only when an authenticated record exposes a cover URL. Otherwise the UI shows a placeholder. |

The first live check during implementation calls `GET /biblios?_per_page=1` with the bearer token and records the JSON keys in `docs/koha-integration.md`. The code allowlist below is the default until that check confirms or narrows it. Automated tests use this default and never call the live host.

Default allowlist, used by code and by tests until the live check:

- Search fields: `keyword`, `title`, `author`, `isbn`, `barcode`.
- The keyword option is labeled `Keyword (title or author)`.
- Sorts: `title`, `author`. Default is title ascending.
- `year_filter` is false. `subject` is omitted.

The live check then edits that allowlist. A missing `title` removes `title` and `keyword`. A missing `author` removes `author`, and keyword becomes title only. A missing `isbn` removes `isbn`. A publication-year column sets `year_filter` true and adds that column to sorts. A subject column adds `subject` as a biblio `q` filter. No other field is added. Search-result years come from that JSON column only. The detail page may still show a year parsed from MARC.

## Architecture

```text
Browser (staff shell, session cookie)
  -> Next.js /api/v1 rewrite
    -> FastAPI catalog routes
      -> catalog service (authorization, allowlists, mapping)
        -> Koha client (token, HTTP, MARC)
        -> saved_searches (PostgreSQL)
```

| Piece | Owns |
|---|---|
| `app/integrations/koha/` | Token, timeout, HTTP errors, biblio list, one biblio, items, libraries, item types, MARC. No ULMS rules. |
| Catalog service | Query building, pagination, availability summary, barcode stripping, recent-search writes. |
| Catalog routes | `/api/v1/catalog/...`, Pydantic validation, session, CSRF on writes. |
| `saved_searches` | One user’s recent and saved query rows. |
| `app/(app)/catalog` | Cover and list results, detail page, URL state. |

The browser never calls Koha. The client id, secret, and bearer token are not returned and are not written to logs. `KOHA_OPAC_URL` is returned only as a link target.

## Configuration

`Settings` reads:

| Variable | Use |
|---|---|
| `KOHA_BASE_URL` | Staff host root. The client appends `/api/v1`. A value that already ends in `/api/v1` is not doubled. |
| `KOHA_CLIENT_ID` | OAuth client id. |
| `KOHA_CLIENT_SECRET` | OAuth client secret. |
| `KOHA_OPAC_URL` | Public OPAC origin. Empty means no OPAC links. |
| `KOHA_API_TIMEOUT` | Seconds, default 15. |

`.env.example` lists these names with empty values. `koha_configured` on `/auth/me` stays true when `KOHA_BASE_URL` is set. This module does not read the staff username or password.

## Koha client

- `POST {base}/api/v1/oauth/token` with form fields `grant_type`, `client_id`, and `client_secret`.
- The access token is kept in process memory until 30 seconds before `expires_in`.
- A 401 clears the token, fetches a new one, and retries that request once. A second 401 becomes `catalog_unavailable`.
- Connect and read timeouts use `KOHA_API_TIMEOUT`.
- Logs include the path template (`/biblios`, `/items`, `/oauth/token`), HTTP status, and duration. They omit the Authorization header, the client secret, the token, and query parameters.
- Typed failures: connection error, timeout, not found, unexpected status or body. Callers do not see the Koha response body.

Library and item-type lists may be cached in process for 10 minutes. Item availability is never cached. Bibliographic search pages are never cached.

## HTTP API

All routes sit under `/api/v1/catalog`. They require a valid session and `catalog.view`. Writes require the existing CSRF check (`X-CSRF-Token` matches the `libraryhub_csrf` cookie and its hash). Error bodies use the current envelope: `detail.code` and `detail.message`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/config` | Allowlisted fields, sorts, `year_filter`, and `opac_url` or null. |
| `GET` | `/search` | One page of biblios, or one barcode lookup. After Koha returns, including an empty page, writes a recent-search row. A Koha failure does not write one. |
| `GET` | `/biblios/{biblio_id}` | One record. `biblio_id` is a positive integer. |
| `GET` | `/biblios/{biblio_id}/items` | Copies for that record, with barcodes removed unless `catalog.barcode.view` is held. |
| `GET` | `/biblios/{biblio_id}/cover` | Proxied image bytes when Koha exposes a cover URL. Otherwise 404. |
| `GET` | `/recent-searches` | The caller’s recent rows, newest first. |
| `GET` | `/saved-searches` | The caller’s saved rows, newest first. |
| `POST` | `/saved-searches` | Save the current query under a label. |
| `DELETE` | `/saved-searches/{search_id}` | Delete the caller’s saved row. Another user’s id is 404. |

There is no `POST /recent-searches`. The search handler is the only writer of recent rows.

### Search request

| Parameter | Rule |
|---|---|
| `q` | Required. Trimmed. 1–200 characters. Reject C0 and DEL control characters. |
| `field` | One of the allowlisted fields. |
| `page` | Integer ≥ 1. Default 1. |
| `per_page` | 10, 20, or 40. Default 20. |
| `sort` | An allowlisted sort. Default `title`. |
| `direction` | `asc` or `desc`. Default `asc`. |
| `year_from`, `year_to` | Optional. Integers from 1000 through 2100. `year_from` ≤ `year_to`. Accepted only when `year_filter` is true. |

Title, author, ISBN, and subject (when enabled) become one JSON `q` object. The user string is escaped for `%`, `_`, and `\`, then matched with `-like` and surrounding wildcards. Keyword becomes `{"-or": [title like, author like]}`. The value is never parsed as JSON from the client.

Barcode search ignores sort and year. The trimmed barcode, at most 32 characters, is sent as `external_id` to `GET /items`. The matching `biblio_id` is then loaded. No match is an empty page with `total` 0.

Biblio search sends Koha `_page` (1-based), `_per_page`, and `_order_by`. Descending sorts prefix the field with `-`. `total` is the integer `X-Total-Count` header when it is present, otherwise null. `has_next` is true when `total` says another page exists, or, when `total` is null, when the page is full.

After the biblio page returns, items for those ids are loaded. Prefer one `GET /items` whose `q` is `biblio_id` in that id list. If that query is rejected, request items per id on the page only. A failed item lookup still returns the bibliographic hits.

### Search hit

Each hit includes `biblio_id`, `title`, `author`, `edition`, `isbn`, `publication_year`, `item_type`, `availability`, and `has_cover`. Null or blank fields are null in JSON and omitted in the UI. Search hits do not include MARC subjects or descriptions.

`availability` is `{ "status", "label", "copy_count", "available_count", "last_checked" }`. `last_checked` is the UTC time of the item response, ISO-8601. It is omitted when items could not be loaded (`status` `unknown`, label `Availability unavailable`). No items yields `status` `no_copies`, label `No copies`, counts 0, and a `last_checked` time.

### Record detail

The JSON biblio supplies title, author, edition, publisher, place, year, and ISBN when those keys exist. The same id is also read as `application/marc-in-json`. Parsed fields:

| MARC | ULMS |
|---|---|
| 245 | Title, when JSON has none |
| 100 and 700 | Authors and contributors |
| 250 | Edition |
| 264, else 260 | Place, publisher, year |
| 020 | ISBN values |
| 650 and 600 | Subjects |
| 520 | Description |

Empty parsed values are dropped. Unknown MARC tags are ignored. A Koha 404 is ULMS 404.

### Copies

Each copy includes call number, copy number, item type code, item type label when the cached type list has one, home and holding library ids, library names from the cached library list (the id is shown when the name is missing), shelving location, status, and status label. `external_id` is included only for `catalog.barcode.view` and is named `barcode` in the ULMS payload.

These item fields are never returned: patron identifiers, checkout history, prices, acquisition data, internal notes, and `holds_count`.

Status is chosen in this order:

| Condition | `status` | Label |
|---|---|---|
| `withdrawn` > 0 | `withdrawn` | Withdrawn |
| `lost_status` > 0 | `lost` | Lost |
| `damaged_status` > 0 | `damaged` | Damaged |
| `not_for_loan_status` > 0 or `effective_not_for_loan_status` > 0 | `not_for_loan` | Not for loan |
| `checked_out_date` is set | `checked_out` | Checked out |
| Both library ids are set and they differ | `in_transit` | In transit |
| Otherwise | `available` | Available |

The detail response includes `last_checked` and the fixed sentence: “Availability can change after this time. This is not a reservation.”

A hit’s summary uses the same function on each copy. `available_count` is how many copies are `available`. If that count is positive, the summary status is `available` and the label is `Available`. If there are no copies, the summary is `no_copies` / `No copies`. Otherwise the summary is the first status in the table above that any copy has, from withdrawn through in transit.

### Covers

`has_cover` is true only when the biblio or its items expose a cover URL the client can fetch with the bearer token. `GET /cover` streams those bytes with the upstream content type and `Cache-Control: private, max-age=3600`. A missing cover is 404. The UI does not request `/cover` when `has_cover` is false, and it does not call Open Library, Google, or any other cover host.

### Saved searches

PostgreSQL schema `libraryhub`, table `saved_searches`, created by the next Alembic revision after `20261116_0002`:

| Column | Rule |
|---|---|
| `id` | UUID primary key, `gen_random_uuid()` |
| `user_id` | FK to `app_users.id`, `ON DELETE CASCADE`, not null |
| `kind` | `recent` or `saved` |
| `label` | Null for recent. Required for saved, 1–80 trimmed characters |
| `query_text` | 1–200 characters |
| `search_field` | Allowlisted field stored as text |
| `filters` | JSON object. Only `year_from` and `year_to` when present |
| `sort_field` | Allowlisted sort |
| `sort_direction` | `asc` or `desc` |
| `created_at`, `updated_at` | `timestamptz`, not null |

Index `(user_id, kind, updated_at)`. Unique index `(user_id, kind, query_text, search_field, filters, sort_field, sort_direction)`. A check constraint requires `label` when `kind` is `saved` and forbids it when `kind` is `recent`.

The revision id is `20261117_0003` and its `down_revision` is `20261116_0002`.

A successful search upserts a recent row on that unique key by refreshing `updated_at`. When a new recent row would exceed 10 for that user, the oldest recent row is deleted. Saved rows use the same cap of 30, and the oldest saved row is deleted when the 31st is inserted. Cover/list view is not stored. Restoring a row sets the query, field, sort, direction, and year filter only.

`POST /saved-searches` body: `label`, `q`, `field`, `sort`, `direction`, `year_from`, `year_to`. Validation matches search. `DELETE` affects one row owned by the session user.

## Permissions

The same Alembic revision:

- Inserts permission `catalog.barcode.view` (`catalog`, “See item barcodes”).
- Grants `catalog.view` to Student.
- Grants `catalog.barcode.view` to Super Administrator, Library Administrator, Department Head, and Librarian.

Auditor is unchanged. Authorization is enforced in the catalog service, not only in the UI.

## Failures

| Condition | HTTP | `detail.code` |
|---|---|---|
| Koha connection error, HTTP 5xx, or OAuth failure after one refresh | 503 | `catalog_unavailable` |
| Timeout | 504 | `catalog_timeout` |
| Field, page, sort, year, or label fails validation | 422 | `invalid_search` |
| Biblio or saved-search id is absent, including another user’s saved search | 404 | `not_found` |
| No session | 401 | `unauthenticated` |
| Session lacks `catalog.view` | 403 | `permission_denied` |
| Write without a valid CSRF token | 403 | `csrf_failed` |

Messages are fixed sentences: `catalog_unavailable` is “The catalog is unavailable. Try again.” `catalog_timeout` is “The catalog took too long to respond. Try again.” `invalid_search` is “That search is not valid.” A missing biblio is “That record was not found.” A missing saved search is “That saved search was not found.” `permission_denied` is “You do not have access to the catalog.” They do not include exception text, Koha bodies, or credentials. A failed search leaves the request URL unchanged so the form still shows what was submitted.

When `KOHA_OPAC_URL` is empty, failure banners say the OPAC address is not configured. When it is set, the banner also offers the OPAC link and states that the link leaves ULMS.

## OPAC links

`opac_url` has no trailing slash. The header control “Open Koha OPAC” uses that origin. The detail control “View this record in the Koha OPAC” uses `{opac_url}/cgi-bin/koha/opac-detail.pl?biblionumber={biblio_id}`. Both open a new tab with `rel="noopener"`. Both are absent when `opac_url` is null. The visible text says the destination is the Koha OPAC.

## Frontend

`/catalog` remains behind `gatePage("catalog.view")`. The module header stays. The sentence “This module’s tools will be added in a later spec” is not shown. The OPAC action is rendered only when config provides `opac_url`. The hardcoded `https://library.usant.edu.ph/` link on this page is removed.

The search form has the query, the field select, and the year range when `year_filter` is true. Results show a cover/list switch. Cover is a responsive grid of cover-or-placeholder, title, author, year, and one availability line. List is one column of those facts plus edition, ISBN, and item type when present. The switch is the `view` query parameter, `cover` or `list`, default `cover`.

`/catalog/[biblioId]` shows the record, the description, subjects, the availability sentence, `Last checked`, and the copy list. Barcodes render only when the items payload includes them. The back link returns to `/catalog` with the search query string preserved.

Recent and saved searches sit beside the form from the `lg` breakpoint up, and below the form on a narrower screen. Choosing a row navigates to that search URL. Save asks for a label and posts the current query. Delete confirms, then calls `DELETE`.

URL parameters are `q`, `field`, `sort`, `direction`, `page`, `per_page`, `view`, `year_from`, and `year_to`. A small helper parses and serializes them. Before the first `q`, the page shows a prompt to search. Later states are loading, results, no results, unavailable, timeout, and invalid input. Loading does not clear the form. Retry repeats the current URL.

`@tanstack/react-query` is added and provided for the staff shell. Catalog requests go to `/api/v1/catalog` on the Next.js origin. No other module’s layout changes. Student’s sidebar shows Catalog and Student Portal because those are the permissions they hold.

## Tests

Pytest uses `httpx.MockTransport`. Tests do not open a socket to Koha.

- Token request form, in-memory reuse, and one refresh after 401.
- Log records do not contain the client secret or the bearer token.
- Title, author, and ISBN become one allowlisted `q`. Keyword becomes the title-or-author `-or` object. A client-supplied JSON object is not forwarded.
- `_page`, `_per_page`, and `_order_by` match the request. A response page is not followed by a request for every remaining page.
- Barcode search sends `external_id` and does not put the barcode in the log assertion fixture’s captured logs.
- A session without `catalog.barcode.view` receives items with no `barcode`. A session with it receives `barcode`.
- Status mapping follows the table above, including `no_copies` and `unknown`.
- Connection failure maps to 503 and timeout to 504, and the body has no upstream payload.
- Recent rows dedupe, cap at 10, and saved rows cap at 30.
- Saved-search create and delete require CSRF. Another user’s id returns 404.
- `/config` returns `opac_url: null` when the setting is empty.

The URL helper is tested with `node:test`. This spec does not add a browser test runner. After the API is running, the catalog flow is exercised in the browser: search, cover and list, detail, back link, empty, unavailable, and a student payload without barcodes.

## Documentation

`docs/koha-integration.md` records the host role (staff REST, not the public OPAC), the OAuth grant, the default allowlist, the filter limits in the table above, and the result of the live `GET /biblios` field check. It contains no secrets. If that live check cannot be run, the doc says the check is outstanding and the default allowlist is in force.

## Out of scope

- Anonymous OPAC, a Faculty role, and circulation writes.
- HTML scraping, SRU, and a local bibliographic database or search index.
- Mapping `koha_branchcode` or hiding Koha sample branches in code.
- Result-set filters for library, item type, availability, or subject, unless the live biblio object grows a matching column.
- Open Library or Google covers, A–Z browse, and a summary results mode.
- Changes to the marketing site.
