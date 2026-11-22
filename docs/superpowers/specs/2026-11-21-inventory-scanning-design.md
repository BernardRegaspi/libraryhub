# Inventory scanning

Date: 2026-11-21
Status: approved

## Purpose

Authorized staff create an inventory session for one Koha home library, optionally narrowed to one shelving location, then scan barcodes continuously. Each scan is classified from the live Koha item and stored in PostgreSQL. Koha remains the item authority. This slice does not change Koha, export reports, or review unscanned items.

The screens follow the staff shell and the maroon, display-serif language of `plan/prototype2.html`. The prototype inventory page is a simulated dashboard. This module does not copy that simulation.

## Decisions

- This spec is the scanning slice only. Exception review, session completion, exports, and Koha item changes are later specs.
- A session belongs to the active ULMS department. That department decides who may open it. It does not filter items. `library_departments.koha_branchcode` stays unset.
- The expected set is one Koha home library, plus an optional shelving location matched exactly, case-sensitive, to the item `location` field. Call number range and collection are out of this slice.
- Misplaced exists only when a location was selected, the home library matches, and the item location is blank or different. With no location selected, a matching home library is in scope.
- Place is decided before condition. An in-scope item then uses the catalog status order. Wrong-library and wrong-shelf outcomes keep that place result, and the card still shows the Koha status label.
- The expected population is a count from `X-Total-Count` at create time. Item rows are not copied into PostgreSQL.
- Each new barcode is one Koha item lookup. A barcode already stored for the session is a duplicate and does not call Koha again.
- Two signed-in staff may scan the same in-progress session. A duplicate is any barcode or Koha item already recorded in that session.
- Anyone with `inventory.view` and that active department may create, start, scan, cancel, and read history. `inventory.manage` is not added.
- Session states in this slice are `draft`, `in_progress`, and `cancelled`. `pending_review` and `completed` wait for the review spec.
- Name, library, and location do not change after create. A wrong scope is cancelled and created again. Sessions and scans are not deleted.
- The browser never calls Koha. Client id, client secret, and bearer token stay on the API server and out of logs.

## Out of scope

- Review notes, resolutions, and an unscanned-item list.
- Marking items lost, withdrawn, or deleted, including any automatic status change.
- CSV, Excel, and PDF exports.
- Koha item writes, and any local update that pretends a Koha write succeeded.
- `pending_review` and `completed`.
- Call number range, collection, and a Koha location-code picker.
- An assigned-staff roster. The operator is stored on each scan.
- Background jobs and an expected-item snapshot table.

## Koha use

The client already authenticates with `POST /api/v1/oauth/token` and `grant_type=client_credentials`. Library names and item type labels already come from that client and may use its existing cache. This slice adds no second Koha integration layer.

| Call | Use |
|---|---|
| `GET /items` with `q` and `_per_page=1` | Expected count for the home library and optional location. `total` is the integer `X-Total-Count` header. |
| `GET /items` with `external_id` and `_per_page=1` | One barcode. Same parameter shape as catalog barcode search. Header `x-koha-embed: biblio`. |
| Existing library and item-type caches | Labels on the session and on the scan snapshot. |

The count query is a JSON `q` object. With no location it is `{"home_library_id": "<id>"}`. With a location it also includes `"location": "<code>"`. A rejected query, a timeout, a missing count header, or a non-list body creates no session.

The barcode query uses the trimmed barcode as `external_id`. An empty list is a saved `not_found` scan. More than one item, a row that is not an object, or a row with no `item_id` saves nothing. Title and author come from the embedded `biblio` object when those keys are present. A missing title or author stays null. There is no second request for the bibliographic record.

In-scope condition uses `item_status` in `apps/api/app/integrations/koha/availability.py`, in that order: withdrawn, lost, damaged, not for loan, checked out, in transit, available. The scan snapshot stores that status code and label whenever an item was returned.

A failed library or item-type cache does not fail a scan that already has an item. The id is stored and the label is null. Create cannot validate a library id when the library cache fails, so no session is created.

## Architecture

```text
Browser (staff shell, session cookie)
  -> Next.js /api/v1 rewrite
    -> FastAPI /api/v1/inventory
      -> inventory service (scope, classification, counters, audit)
        -> existing Koha client (OAuth client credentials)
        -> PostgreSQL: inventory_sessions, inventory_scans, audit_logs
```

| Piece | Owns |
|---|---|
| Koha client | Token, timeouts, the count request, one item by barcode, library names, item type labels. No stocktaking rules. |
| Inventory service | Department check, expected count, classification, scan rows, counters, audit. |
| Inventory routes | `/api/v1/inventory`, validation, session, CSRF on writes. |
| `/inventory`, `/inventory/new`, `/inventory/[sessionId]` | Session list, create, draft, scanning, cancelled summary. |
| PostgreSQL | The session, every scan event, and audit rows. |
| Koha | The item, its library, its location, and its status. This slice does not change them. |

Application logs include the path template, HTTP status, duration, and session id. They omit the barcode, the query string, the Authorization header, and the token.

## Permissions

No new permission is seeded. `inventory.view` remains with Librarian, Department Head, Library Administrator, and Super Administrator. Student and Auditor do not receive it.

Every inventory route requires a signed-in session and `inventory.view`. A missing permission is `403` `permission_denied`. Hiding a button is not the authorization check. Writes use the existing CSRF check. A missing CSRF header is the existing `403` `csrf_failed`.

The caller’s `active_department_id` must be the session department. Another department, or an unknown id, is `404` `not_found` with “That inventory session was not found.” Create and the session list require an active department. A null active department on create is `409` `department_required` with “Choose a department before creating a session.” On the session list the same code uses “Choose a department.”

## Data model

Schema `libraryhub`. Alembic is the only migration path. Primary keys are UUIDs from `gen_random_uuid()`. Timestamps are timezone-aware.

### `inventory_sessions`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `reference` | Unique. `INV-` + the Asia/Manila year + `-` + the next value of sequence `libraryhub.inventory_session_ref_seq`. Example: `INV-2026-0007`. The sequence does not restart each year. |
| `name` | Required. Trimmed. 1–120 characters. Reject C0 and DEL control characters. |
| `department_id` | Required foreign key to `library_departments.id`. The active department at create time. |
| `status` | `draft`, `in_progress`, or `cancelled`. |
| `home_library_id` | Required Koha library id. |
| `home_library_name` | Name from the library cache at create time. The id is still stored when the name is missing. |
| `location` | Null, or the exact shelving-location code. Trimmed. 1–80 characters. A blank input is stored as null. Reject C0 and DEL control characters. |
| `expected_count` | Integer from `X-Total-Count` at create time. Zero is allowed. It is not refreshed. |
| `created_by`, `started_by`, `cancelled_by` | Foreign keys to `app_users.id`. Start and cancel stay null until those actions. |
| `started_at`, `cancelled_at`, `created_at`, `updated_at` | Timezone-aware timestamps. |

Indexes: unique `reference`, and `(department_id, created_at)`.

### `inventory_scans`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id` | Required foreign key to `inventory_sessions.id`. The session cannot be removed while scans exist. |
| `client_scan_id` | UUID created in the browser before the request. Unique per session. |
| `barcode` | Trimmed. 1–32 characters. Compared exactly with Koha `external_id`. Reject C0 and DEL control characters. |
| `koha_item_id`, `koha_biblio_id` | Integers. Null when Koha has no item. |
| `outcome` | `verified`, `misplaced`, `unexpected`, `not_found`, `duplicate`, `withdrawn`, `damaged`, or `other_exception`. |
| `is_primary` | True for the first result of a Koha item, or of a barcode Koha does not have. |
| `primary_scan_id` | Null on a primary row. On a duplicate, the primary row. |
| `message` | The sentence shown on the scanning screen. |
| Display snapshot | `title`, `author`, `call_number`, `item_type_id`, `item_type_label`, `home_library_id`, `home_library_name`, `holding_library_id`, `holding_library_name`, `location`, `koha_status`, `koha_status_label`. Null when the item was not found. A duplicate copies the primary snapshot. |
| `scanned_by`, `scanned_at` | Operator and timezone-aware time. |

Unique indexes:

- `(session_id, client_scan_id)`
- `(session_id, koha_item_id)` where `is_primary` and `koha_item_id` is not null
- `(session_id, barcode)` where `is_primary` and `koha_item_id` is null

Lookup index: `(session_id, barcode)` and `(session_id, scanned_at)`.

If two requests both try to insert the primary row, the unique index keeps one primary. The loser inserts a `duplicate`. The Koha call sits outside the database transaction.

## Classification

A primary scan is classified in this order:

1. No Koha item: `not_found`. Message: “No Koha item has this barcode.”
2. Home library missing, blank, or different from the session library: `unexpected`. Missing or blank: “Home library is not on this Koha item.” Different: “Home library is {name or id}, not {session library name or id}.”
3. The session has a location, and the item location is blank or different: `misplaced`. “Shelving location is {item location or “blank”}, not {session location}.”
4. Otherwise the item is in scope. Map `item_status` as follows.

| Catalog status | Outcome | Message |
|---|---|---|
| `withdrawn` | `withdrawn` | “Koha marks this item withdrawn.” |
| `lost` | `other_exception` | “Koha status: Lost.” |
| `damaged` | `damaged` | “Koha marks this item damaged.” |
| `not_for_loan` | `other_exception` | “Koha status: Not for loan.” |
| `checked_out` | `other_exception` | “Koha status: Checked out.” |
| `in_transit` | `other_exception` | “Koha status: In transit.” |
| `available` | `verified` | “On this shelf.” when the session has a location. “In this library.” when it does not. |

Home library values are compared as strings. In transit keeps the catalog rule: both library ids are present, non-blank strings, and different. That rule runs only inside `item_status`, after the place checks above.

A duplicate row uses outcome `duplicate`. Its message is “Already scanned as {primary outcome label}.” Labels are Verified, Misplaced, Unexpected, Not found, Withdrawn, Damaged, and the Koha status label for `other_exception`.

## Counters

Counters are counted from rows. They are not stored on the session.

| Figure | Rule |
|---|---|
| `verified`, `misplaced`, `unexpected`, `not_found`, `withdrawn`, `damaged`, `other_exception` | Primary rows of that outcome. |
| `duplicates` | Rows whose outcome is `duplicate`. |
| `needs_a_look` | Every primary row except `verified`. |
| `seen` | Primary rows that are `verified`, `withdrawn`, `damaged`, or `other_exception`. |
| `remaining` | `expected_count - seen`, and never below zero. |
| `expected_count` | The count stored at create time. |

A withdrawn, damaged, or other in-scope item counts in both `seen` and `needs_a_look`. It does not count as `verified`. Duplicate rows change none of the primary figures.

When `seen` is greater than `expected_count`, `remaining` is 0 and `seen` still shows the larger number. When `expected_count` is 0, the screen shows the zero and does not show a ratio.

## HTTP API

All routes sit under `/api/v1/inventory`. Error bodies use `detail.code` and `detail.message`. Write validation may also include `detail.fields`, a list of `{ name, message }`.

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/libraries` | Library id and name pairs from the existing cache. Registered as its own path. |
| `GET` | `/sessions` | One page of sessions for the active department. |
| `POST` | `/sessions` | Create a draft and store the count. |
| `GET` | `/sessions/{session_id}` | The session and its counters. |
| `POST` | `/sessions/{session_id}/start` | `draft` becomes `in_progress`. |
| `POST` | `/sessions/{session_id}/cancel` | `draft` or `in_progress` becomes `cancelled`. |
| `POST` | `/sessions/{session_id}/scans` | Record one barcode. |
| `GET` | `/sessions/{session_id}/scans` | One page of scans, newest first. |

`session_id` is a UUID. Any other value is `404` `not_found`.

### Session list

| Parameter | Rule |
|---|---|
| `q` | Optional. Trimmed. 1–80 characters. Matches `reference` or `name` with a case-insensitive contains query. Like-patterns reuse `escape_like`. |
| `status` | Optional. `draft`, `in_progress`, or `cancelled`. |
| `page` | Integer from 1 through 10000. Default 1. |
| `per_page` | Integer from 1 through 50. Default 20. |
| `sort` | `created_at`, `reference`, `name`, or `status`. Default `created_at`. |
| `direction` | `asc` or `desc`. Default `desc`. |

An out-of-range parameter is `422` `invalid_search` with “That search is not valid.”

### Create body

`name` (required), `home_library_id` (required), `location` (optional). The library id must be one of the ids in the library cache. An unknown id is `422` `validation_error` on `home_library_id`.

### Scan list

| Parameter | Rule |
|---|---|
| `q` | Optional. Trimmed barcode contains match, case-sensitive, 1–32 characters. |
| `outcome` | Optional. One of the eight outcome values. |
| `page`, `per_page` | Same bounds as the session list. Default 20. |
| `sort` | `scanned_at` only. Default `scanned_at`. |
| `direction` | `asc` or `desc`. Default `desc`. |

### Scan body

`client_scan_id` (UUID) and `barcode` (string). The same `client_scan_id` for that session returns the stored row and the current counters with `200`, and does not insert another row.

The scan response and the session response include `counters` with `expected_count`, `seen`, `verified`, `misplaced`, `unexpected`, `not_found`, `withdrawn`, `damaged`, `other_exception`, `needs_a_look`, `duplicates`, and `remaining`. The scan object includes the outcome, the outcome label, the message, the display snapshot, `is_primary`, the barcode, and `scanned_at`.

### Errors

| Situation | Result |
|---|---|
| Koha is not configured, the connection fails, authentication fails, or the count or item body is unexpected | `503` `inventory_unavailable`. “Koha could not count items. Try again.” on create. “Koha could not look up this barcode. The scan was not saved.” on scan. “Koha could not load libraries. Try again.” on the library list. |
| Koha exceeds the timeout | `504` `inventory_timeout`. “Koha took too long to count items. Try again.” on create. “Koha took too long to look up this barcode. The scan was not saved.” on scan. |
| The count header is missing or not an integer | `503` `inventory_count_unavailable`. “Koha did not return an item count. The session was not created.” |
| More than one item, or an item with no `item_id` | `503` `inventory_ambiguous`. “Koha returned an item record this scan cannot use. The scan was not saved.” |
| No active department on create | `409` `department_required`. “Choose a department before creating a session.” |
| No active department on the session list | `409` `department_required`. “Choose a department.” |
| Unknown session, or a session outside the active department | `404` `not_found`. “That inventory session was not found.” |
| Start when the status is not `draft` | `409` `session_not_draft`. “Only a draft session can be started.” |
| Cancel when the status is `cancelled` | `409` `session_cancelled`. “This session is already cancelled.” |
| Scan when the status is `draft` | `409` `session_not_started`. “Start the session before scanning.” |
| Scan when the status is `cancelled` | `409` `session_cancelled`. “This session is cancelled.” |
| Barcode or session field fails validation | `422` `validation_error` with `detail.fields`. No row is written. |
| The caller lacks `inventory.view` | `403` `permission_denied`. |
| A write lacks a valid CSRF header | Existing `403` `csrf_failed`. |

A Koha `404` on the items collection is `inventory_unavailable`, not a saved `not_found` scan. An empty `200` list is the saved `not_found` scan. Create and failed lookups leave no new row. The response never includes the Koha body, a token, or a credential. The UI does not substitute sample items.

## Audit

`audit_logs` records:

| Action | When | `entity_type` | Details |
|---|---|---|---|
| `inventory.session.create` | Draft created | `inventory_session` | `reference`, `home_library_id`, `location`, `expected_count` |
| `inventory.session.start` | Status becomes `in_progress` | `inventory_session` | `reference` |
| `inventory.session.cancel` | Status becomes `cancelled` | `inventory_session` | `reference` |
| `inventory.scan` | A scan row is inserted | `inventory_scan` | `reference`, `barcode`, `outcome` |

`module` is `inventory`. `entity_id` is the session id or the scan id. An idempotent replay of `client_scan_id` does not write another audit row.

## Scanning behavior

Create asks Koha for the count and opens the draft. The draft shows that count before anyone scans. Start moves the session to `in_progress` and opens the scanner. Resume opens an `in_progress` session on the scanner again. Cancel asks for confirmation, then refuses further scans. The scan history remains.

The scanner field is focused when the scanning screen opens. A USB or Bluetooth scanner types the barcode and sends Enter. The screen tells staff: “Set the scanner suffix to Enter.” The browser trims the value. An empty value is ignored. A value longer than 32 characters, or one that contains a control character, stays on screen and is not posted.

A valid barcode receives a new `client_scan_id`. The field is cleared and focused again before the response arrives. The same barcode is ignored while a queue item for it is still waiting. After that request has finished, a later scan of the same barcode is sent and recorded as a duplicate.

The device queue keeps scans in order. Two requests may be in flight. Further barcodes stay in the queue. Each response is applied to its own `client_scan_id`. The result panel shows the scan that finished most recently. A waiting barcode shows “Checking Koha…” and how many are still queued. Counters and the recent list update from that response.

A network failure, `503`, or `504` saves nothing. The barcode stays on screen as “Scan not saved.” with “Retry”. Retry sends the same `client_scan_id`. After a failure, the client reloads the recent scans. If that id is already stored, the row is shown as saved. Reloading the page loads the counters and the latest scans from the server.

The scanner field uses `inputmode="none"`, `autocomplete="off"`, `autocapitalize="off"`, and `spellcheck="false"`. “Type barcode” switches that field so manual entry can open the on-screen keyboard, then returns it to scanner mode after Enter.

Sound is off until staff turn it on. The control reads “Sound on” or “Sound off”. The choice is stored on the device under `libraryhub.inventory.scanSound`. Verified uses one short tone. Every other outcome uses a different short tone. No audio file is added.

## Screens

Reading this as a shelf workstation for library staff, in the existing maroon and display-serif staff shell. Dial ENERGY 1 / RHYTHM 2 / MOTION 1.

Reasons for the visual choices:

- Maroon and gold are the staff shell palette, so the module belongs to the same product as patrons and the catalog.
- The display serif is reserved for the session title and the outcome word, which are the two headings a person reads while holding a book.
- ENERGY 1 keeps the page quiet for a long shelf run. RHYTHM 2 lets the session list follow the patron directory while the scanning page uses a different composition. MOTION 1 is an instant color change of the result, with no entrance animation.
- The prototype’s six equal stat cards are not used. One result and a count line tell staff whether to keep going.
- Verified uses gold-700 on gold-100. Every other primary outcome uses maroon-700 on maroon-50. A duplicate uses the ordinary foreground and no extra fill. The word names the specific outcome.
- The barcode is the only monospace text, because it is a code.
- Icons use the staff shell’s Hugeicons set only where the patron directory already uses them: search, and the access-denied lock. The outcome is a word.
- The scanner field, “Type barcode”, “Retry”, “Sound on”, “Start scanning”, “Create session”, and “Cancel session” are at least 44px on the short side. Focus uses the existing input and button focus styles.

`/inventory` keeps the `inventory.view` gate. `ModuleFrame` uses `hideModuleSentence`. The eyebrow is Library. The title is Inventory. The description is “Scan a Koha library, or one shelving location, and keep a record of each barcode.” With no active department, the current “Choose a department” card stays and the list is not requested. With a department, the page offers search for reference or name, a status filter, and “New session”. Columns are reference, name, library, location, expected count, status, and when it started. A null location reads “Whole library”. A row opens `/inventory/[sessionId]`. Empty copy is “No inventory sessions for this department.” The first load uses skeleton rows. A failed load shows the error message and “Try again”.

`/inventory/new` has three fields: name, Koha library, and shelving location code. The location hint is “Leave blank for the whole library. The code must match Koha exactly.” “Create session” waits for the count, then opens the draft. “Back to sessions” leaves without saving. If the count request fails, no session exists and the form stays filled.

`/inventory/[sessionId]` is the draft, the scanner, and the cancelled summary.

- Draft. The reference and name are the heading. The expected count is the large display-serif number. Library and location sit under it. A null location reads “Whole library”. Actions are “Start scanning” and “Cancel session”. A count of zero includes the sentence “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”
- Scanning. Below the `lg` breakpoint the barcode field is sticky at the top, the last result sits directly under it, then the counts, then the recent scans. From `lg` up, the field and the result sit side by side, the result is the wider column, and the counts and recent scans use the full width below. There is no dialog on the scan path. “Cancel session” confirms in a dialog that closes with Escape. After the dialog closes on an in-progress session, focus returns to the scanner field.
- Cancelled. The same summary and scan list, with no field and no start action. The status reads Cancelled.

The outcome word is the display-serif heading of the result. Under it: the title, or “No title from Koha”, then call number, location, Koha status, and the message. The counts are one wrapping line, not cards and not a horizontal scroller: Expected, Seen, Verified, Needs a look, Duplicates, Remaining. A failed scan shows that barcode, “Scan not saved.”, and “Retry”.

The latest twenty scans show outcome, barcode, title or the not-found message, and time. Search and the outcome filter query that session. The scanner field stays mounted while the list updates.

The first load of a session uses skeletons. An empty scan list says “No scans yet.” A failed session or scan list shows the error message and “Try again”.

## Testing

Automated tests never call the live Koha host.

Service tests, with a fake Koha client, cover:

- Place before condition, including a withdrawn item whose home library does not match.
- A missing or blank home library is `unexpected`.
- A selected location with a blank or different item location is `misplaced`.
- No selected location and a matching home library does not produce `misplaced`.
- In-scope mapping for withdrawn, lost, damaged, not for loan, checked out, in transit, and available.
- Withdrawn wins over lost, using the catalog order.
- Duplicate rows do not increase `verified`. A withdrawn in-scope item increases `seen` and `needs_a_look`, and does not increase `verified`.
- `expected_count` of 0 leaves `remaining` at 0. `seen` above `expected_count` leaves `remaining` at 0 and keeps the larger `seen`.
- A missing count header, a Koha timeout, and an ambiguous item write no session or no scan.
- The same `client_scan_id` returns the original row and does not add an audit row.
- Two primary inserts for one Koha item become one primary and one duplicate.
- A cancelled session and a draft reject a scan. A department mismatch is `not_found`.

Route tests, with the existing session fixtures, cover:

- Librarian can create, start, scan, and cancel. Student and Auditor receive `403`.
- A write without the CSRF header returns `csrf_failed`.
- Koha timeout and unavailable responses use the inventory messages above.
- Create, start, cancel, and each inserted scan write one audit row.

Web tests use `node --test` for the device queue: ignore a repeated barcode while it is waiting, apply each response by `client_scan_id`, and mark a failed id saved when a reload contains that id. This app has no component test runner. During implementation the scanning page is checked in the browser: Enter submits, focus returns, a failed scan stays on screen with Retry, and a narrow viewport keeps the field reachable without horizontal scrolling.
