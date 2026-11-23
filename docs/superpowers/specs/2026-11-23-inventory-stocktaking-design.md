# Inventory and stocktaking

Date: 2026-11-23
Status: approved

## Purpose

Authorized staff plan a stocktake, freeze the shelf copies they expect to find, scan barcodes, and review what was missing, misplaced, unexpected, damaged, or withdrawn. Koha remains the authority for the live item. ULMS stores the session, the frozen expected rows, the scans, the shelf-search marks, the proposals, and the audit. A missing scan does not change Koha.

The page is `/inventory`. It follows the five views in `plan/inventory.html` and uses the staff shell’s existing components and color theme. The prototype’s palette, its second application sidebar, and its demo controls are not part of this page.

## Decisions

- `inventory.view` opens the page, reads sessions for the active department, and exports. `inventory.manage` runs the session and drafts proposals. `inventory.adjustments.approve` approves, rejects, and submits. The approver is a different user from the drafter.
- A session belongs to the active department. Its home library is that department’s `koha_branchcode`, copied onto the session at create. An empty branch code blocks create and start. This module does not fill branch codes.
- Scope is that home library, zero or more Koha locations, and an optional item type. Collection code is not a scope field.
- The expected set is frozen when the session starts. It contains shelf copies only. Checked out, in transit, lost, and withdrawn copies are excluded. Not-for-loan and Koha-damaged copies stay in, because they can still be on the shelf.
- An unscanned expected item is Unverified. Not Found is a shelf-search mark with a required remark, on one row or a selected set. A later counting scan supersedes that mark. The mark stays in the history.
- A scan looks the barcode up in Koha and classifies it against the frozen list and the live record. A scan never adds an item to the expected list.
- A withdrawn copy whose live library and location sit inside the session scope is Withdrawn. Any other copy that is not on the expected list is Unexpected. The Koha status is stored on that row.
- Damage is a staff observation. It does not by itself write Koha’s damaged flag.
- The scanner path is a keyboard wedge that submits on Enter, plus typing the barcode and pressing Capture. The page does not use a camera, Bluetooth, or a browser queue of unscanned barcodes.
- Item changes leave ULMS only as an approved proposal, and only for a field on the recorded Koha allowlist. Lost, withdrawn, and delete are never preselected, and a Not Found mark does not create a proposal.
- The browser never calls Koha. Client id, client secret, and bearer token stay on the API server and out of logs.

## Koha capability gate

Koha paths are fixed only after a read of the configured host’s OpenAPI document. The patron spec recorded that host as Koha `25.06.00`. Inventory uses the same host and the same OAuth client.

The first implementation task writes a capability table in `apps/api/app/integrations/koha/inventory.py` and quotes it in the implementation plan before any start or submit route calls Koha. Each entry names the HTTP method, path, and the response fields this module reads or sends. ULMS calls only those entries. Unknown Koha keys are dropped. A field Koha omits is JSON `null`, and the page shows Unavailable for that field.

| Capability | Required Koha behavior | When it is unset |
|---|---|---|
| `item_list` | A paged `GET /items` that can be limited to one `home_library_id`. | Start is disabled. `POST /sessions/{id}/start` returns `501` `inventory_unsupported`. The session stays Draft. |
| `locations` | A read that returns the same codes stored on item `location`. | The location control is empty. A session may still cover the whole home library. Staff cannot type a location. If the read returns a different vocabulary than item `location`, `locations` stays unset. |
| `item_update` | A write that updates one item field and returns success or a structured error. The allowlist names the fields the write accepts. | Submit is disabled. `POST /adjustments/{id}/submit` returns `501` `inventory_unsupported`. The proposal stays `approved`. The work-order export remains available. |

`lost`, `withdrawn`, and any delete operation are left off the `item_update` allowlist unless the OpenAPI document names that exact field on the recorded write. The proposal form never preselects those fields.

Barcode lookup is the existing exact `external_id` query used by circulation. Item-type labels use the client’s existing `GET /item_types` cache. Library labels use the existing library cache. `GET /inventory/capabilities` returns the table to the page. Flags come from the recorded table, not from a live OpenAPI fetch on each request.

## Architecture

```text
Browser (staff shell, session cookie)
  -> Next.js /api/v1 rewrite
    -> FastAPI /api/v1/inventory
      -> inventory service
        -> Koha client (recorded item reads; item update only when recorded)
        -> inventory tables
        -> audit_logs
```

| Piece | Owns |
|---|---|
| Koha client | Token, timeouts, the recorded item reads, and the recorded item update. No stocktake rules. |
| Inventory service | Scope, the snapshot, classification, duplicate scans, shelf-search marks, proposals, and audit. |
| Inventory routes | `/api/v1/inventory`, validation, the staff session, CSRF on writes, and department scope. |
| `/inventory` | Overview, Scan, Exceptions, Adjustments, and Audit. |

Logs include the path template, HTTP status, and duration. They omit the query string, barcodes, the Authorization header, and the token.

## Session lifecycle

| State | What staff can do |
|---|---|
| Draft | Edit the name, description, dates, locations, item type, and operators. No expected rows. |
| In Progress | Scan, mark or reverse Not Found, set or clear damage, and draft proposals. The snapshot is not rebuilt. |
| Completed | Scans and shelf-search marks stop. Proposals, approval, submit, and export remain. A manager can reopen it to In Progress on the same snapshot. |
| Cancelled | Read and export only. It cannot be reopened. |

Create copies `koha_branchcode` into `home_library_id`. Start is allowed from Draft only. It pages the recorded item list for that home library. When the recorded query cannot limit by home library, start returns `501` and does not page the whole catalog. Location and item type are applied in ULMS after each library-scoped page.

An item is kept when all of these hold:

- `home_library_id` equals the session’s home library.
- The session has no locations, or `location` is one of those locations. A blank location is dropped when the session has any location.
- The session has no item type, or `item_type_id` matches.
- `item_status` is `available`, `damaged`, or `not_for_loan`. `withdrawn`, `lost`, `checked_out`, and `in_transit` are dropped.

The inserts, `expected_count`, `snapshot_taken_at`, and the move to In Progress are one transaction. Start locks the session row. A second start that finds the session no longer Draft returns `409` `invalid_state`. A Koha error before commit rolls the transaction back and leaves the session Draft. Two kept items with the same barcode roll back and return `409` `ambiguous_barcode`. An empty kept set still starts. `expected_count` is 0.

Complete is allowed from In Progress only. Cancel is allowed from Draft or In Progress. Reopen is allowed from Completed only. Reopen sets `reopened_at`, clears `completed_at`, and leaves the expected rows in place.

## Data

All tables live in the `libraryhub` schema. Koha ids are references. Title, author, call number, libraries, location, and status on these rows are the values copied at snapshot or scan time.

### `inventory_sessions`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `department_id` | Required foreign key to `library_departments`. |
| `name` | Required, 1–160 characters. |
| `description` | Optional, at most 4000 characters. |
| `status` | `draft`, `in_progress`, `completed`, or `cancelled`. |
| `home_library_id` | Required. Copied from the department branch code. Not editable. |
| `item_type_id` | Optional. |
| `start_on` | Required date. |
| `target_on` | Optional date, on or after `start_on`. |
| `started_at`, `completed_at`, `cancelled_at`, `reopened_at`, `snapshot_taken_at` | Timezone-aware, nullable. |
| `expected_count` | Integer, nullable until start. |
| `created_by` | Staff user. Nullable so a deleted user can be set null. |
| `created_at`, `updated_at` | Timezone-aware. |

### `inventory_session_locations`

Primary key `(session_id, location)`. `location` is a non-empty string returned by the `locations` capability. No rows means the whole home library.

### `inventory_session_operators`

Primary key `(session_id, user_id)`. This is the planned crew. Any user with `inventory.manage` for the active department may scan. The scan stores the logged-in user.

### `inventory_expected_items`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id` | Foreign key. Deleting a session deletes its expected rows. |
| `koha_item_id` | Required integer. Unique with `session_id`. |
| `barcode` | Required. Unique with `session_id`. |
| `biblio_id` | Integer, nullable. |
| `title`, `author`, `call_number`, `item_type_id`, `item_type_label` | Nullable copies. |
| `home_library_id`, `holding_library_id`, `location` | Nullable copies. |
| `koha_status` | `available`, `damaged`, or `not_for_loan` at snapshot. |

### `inventory_scans`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id` | Foreign key. |
| `expected_item_id` | Nullable foreign key. Set when the Koha item is on the frozen list. |
| `koha_item_id` | Nullable. Null for an invalid barcode and for a Koha error. |
| `barcode_submitted` | The trimmed value. |
| `outcome` | `found`, `misplaced`, `unexpected`, `damaged`, `withdrawn`, `invalid`, `duplicate`, or `koha_error`. |
| `match_basis` | `found` or `misplaced` when `outcome` is `damaged` on an expected item. Otherwise null. |
| `observed_damaged` | Boolean. True when staff flagged damage and the primary outcome stayed `unexpected` or `withdrawn`. |
| `counts` | True for the first accepted result of a Koha item in this session. False for invalid, Koha error, and duplicate. |
| `original_scan_id` | Set on a duplicate. |
| `operator_id` | The logged-in user. Nullable when that user is later deleted. |
| `station_location`, `live_location`, `live_home_library_id`, `live_status` | Nullable copies used for the decision. |
| `title`, `author`, `call_number`, `item_type_label` | Copies for a row that has no expected item. |
| `created_at` | Timezone-aware. |

A partial unique index on `(session_id, koha_item_id)` where `counts` is true and `koha_item_id` is not null makes one counting scan win when two staff scan the same new barcode together. The loser is stored as `duplicate`.

### `inventory_shelf_searches`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id`, `expected_item_id` | Required foreign keys. |
| `batch_id` | UUID. One value for every row in a selection. A single row gets its own value. |
| `remark` | Required, 1–2000 characters. |
| `marked_by` | Staff user, nullable on user delete. |
| `created_at` | Timezone-aware. |
| `reversed_at`, `reversed_by`, `reverse_remark` | Set together when the mark is reversed. `reverse_remark` is 1–2000 characters. |

At most one row per expected item has `reversed_at` null.

### `inventory_adjustments`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id` | Foreign key. |
| `koha_item_id` | Required integer. |
| `expected_item_id`, `scan_id` | Nullable links. |
| `field` | A field on the recorded allowlist. |
| `from_value` | The stored snapshot or live value. Nullable when that value was null. |
| `to_value` | Required. |
| `reason` | Required, 1–2000 characters. |
| `status` | `draft`, `approved`, `rejected`, `submitted`, or `failed`. |
| `drafted_by`, `decided_by` | Staff users, nullable on user delete. |
| `decided_at`, `submitted_at` | Timezone-aware, nullable. |
| `koha_http_status` | Nullable integer. |
| `koha_error` | Nullable text, at most 500 characters, with no HTML. |
| `created_at`, `updated_at` | Timezone-aware. |

## Classification

The condition of an expected item is derived, not stored:

1. A counting scan with outcome `damaged` is Damaged.
2. A counting scan with outcome `misplaced` is Misplaced.
3. A counting scan with outcome `found` is Found.
4. A counting scan with outcome `withdrawn` is Withdrawn. This happens when Koha withdrew the copy after the snapshot.
5. An active shelf-search mark, and no counting scan, is Not Found.
6. Otherwise the item is Unverified.

Unexpected and Withdrawn copies that were never on the list exist only as scans.

Completion is the number of expected items that have a counting scan, divided by `expected_count`. The percentage is 0 when `expected_count` is 0. Duplicates, unexpected items, and withdrawn items that are not on the list do not raise it. Not Found does not count as scanned.

Open exceptions are the distinct items that are Not Found, Misplaced, Unexpected, Damaged, or Withdrawn. An item counts once in that total. The progress bar counts primary outcomes only, so its segments do not overlap. The Damaged tab also lists Unexpected and Withdrawn rows with `observed_damaged`, and that tab’s count can be higher than the Damaged segment.

The scan field trims the value, rejects an empty value, and rejects a value longer than 64 characters or containing a C0 or DEL control character. That rejection is `422` and stores no row. Enter and Capture both submit. The client ignores a second submit of the same value while the request is in flight. After a result the field clears and takes focus again.

When the session has locations, `station_location` is required and must be one of them. The page keeps the choice until the operator changes it. When the session has no locations, `station_location` may be omitted.

A live lookup then classifies in this order:

1. **No Koha row, or more than one row.** Store `invalid`. It does not count.
2. **Timeout or connection error.** Store `koha_error`. It does not count. Earlier counting scans stay. The same barcode can be sent again.
3. **A counting scan already exists for this `koha_item_id`.** Store `duplicate` and return the original outcome. Counts stay.
4. **Live `item_status` is `withdrawn`, the live home library equals the session library, and the live location is inside the session locations when the session has any.** Store `withdrawn`. Link `expected_item_id` when the item is on the list. Do not add a new expected row.
5. **The item is not on the expected list.** Store `unexpected`. Checked out, lost, in transit, a different library, a different location, and a different item type land here.
6. **The operator set damage and the item is on the list.** Store `damaged`. `match_basis` is `misplaced` when the location rule below would have said Misplaced, and `found` otherwise.
7. **The item is on the list, and either the station location is set and differs from the snapshot location, or the live location is non-empty and differs from the snapshot location.** Store `misplaced`. A null snapshot location differs from a set station location.
8. **Otherwise.** Store `found`.

When step 4 or 5 also has the damage flag, the primary outcome stays `withdrawn` or `unexpected` and `observed_damaged` is true.

A shelf-search mark is allowed only for an Unverified expected item, and only while the session is In Progress. One remark is stored on every selected row, with one shared `batch_id`. A later counting scan does not delete the mark. Reverse is allowed for an active mark, with a required remark, including after a scan has superseded it. Reverse does not change the counting scan.

Staff with `inventory.manage` can set or clear damage on a counting scan while the session is In Progress. The remark is required. Setting it on a Found or Misplaced scan changes the outcome to `damaged` and fills `match_basis` from the previous outcome. Clearing it restores `found` or `misplaced` from `match_basis`. On an Unexpected or Withdrawn scan it only changes `observed_damaged`. A scan row is not deleted. An Unexpected item is not moved onto the expected list.

## HTTP API

All routes sit under `/api/v1/inventory`. They require a valid session. Writes require the existing CSRF check. Error bodies use `detail.code` and `detail.message`.

A session whose `department_id` is not the active department is `404` `not_found`. Adjustment routes load the proposal’s session and use that same check. No active department is `409` `department_required` with “Choose a department first.” A malformed body or a query outside an allowlist is `422` `validation_error`.

| Method | Path | Permission | Behavior |
|---|---|---|---|
| `GET` | `/capabilities` | `inventory.view` | The recorded flags and the item-update allowlist. |
| `GET` | `/scope-options` | `inventory.view` | Item types from the existing cache, and locations when `locations` is recorded. |
| `GET` | `/operators` | `inventory.manage` | Users with `inventory.manage` whose assignment includes the active department or is global. |
| `GET` | `/sessions` | `inventory.view` | Paged sessions for the active department. |
| `POST` | `/sessions` | `inventory.manage` | Create a Draft. |
| `GET` | `/sessions/{id}` | `inventory.view` | One session, its locations, and its operators. |
| `PATCH` | `/sessions/{id}` | `inventory.manage` | Edit a Draft. When `locations` or `operators` is present, that list replaces the stored rows. |
| `POST` | `/sessions/{id}/start` | `inventory.manage` | Freeze the expected rows. |
| `POST` | `/sessions/{id}/complete` | `inventory.manage` | Complete an in-progress session. |
| `POST` | `/sessions/{id}/cancel` | `inventory.manage` | Cancel a draft or an in-progress session. |
| `POST` | `/sessions/{id}/reopen` | `inventory.manage` | Reopen a completed session. |
| `GET` | `/sessions/{id}/summary` | `inventory.view` | The counts for the overview. |
| `POST` | `/sessions/{id}/scans` | `inventory.manage` | Classify one barcode. |
| `POST` | `/sessions/{id}/scans/{scan_id}/damage` | `inventory.manage` | Set or clear damage. Body is `damaged` and `remark`. |
| `GET` | `/sessions/{id}/items` | `inventory.view` | Paged expected rows and out-of-list scans. |
| `POST` | `/sessions/{id}/shelf-searches` | `inventory.manage` | Mark the selected unverified rows Not Found. |
| `POST` | `/sessions/{id}/shelf-searches/{search_id}/reverse` | `inventory.manage` | Reverse that mark. A batch reverse is one call per row. |
| `GET` | `/sessions/{id}/adjustments` | `inventory.view` | The session’s proposals. |
| `POST` | `/sessions/{id}/adjustments` | `inventory.manage` | Draft a proposal. |
| `PATCH` | `/adjustments/{id}` | `inventory.manage` | Edit a draft. |
| `POST` | `/adjustments/{id}/approve` | `inventory.adjustments.approve` | Approve a draft. |
| `POST` | `/adjustments/{id}/reject` | `inventory.adjustments.approve` | Reject a draft. Body includes `reason`. |
| `POST` | `/adjustments/{id}/submit` | `inventory.adjustments.approve` | Send one approved or failed proposal to Koha. |
| `GET` | `/sessions/{id}/exports` | `inventory.view` | CSV or Excel. |
| `GET` | `/sessions/{id}/audit` | `inventory.view` | This session’s audit rows. |

`page` is 1–10000, default 1. `per_page` is 1–50, default 20. `q` is empty or 1–80 characters with no C0 or DEL controls. `sort` for items is `title`, `author`, `barcode`, `location`, `condition`, or `scanned_at`. `direction` is `asc` or `desc`. The default item sort is `scanned_at` descending. A barcode sort uses `barcode` only when the caller has `catalog.barcode.view`. Otherwise that sort is `422`.

`GET /sessions` accepts `status` of `all`, `active`, `planned`, `review`, or `closed`, and `q` matched against the session name. `active` is In Progress. `planned` is Draft. `review` is Completed with a proposal in `draft`, `approved`, or `failed`. `closed` is Completed or Cancelled.

`GET /items` accepts `condition` of `all`, `unverified`, `found`, `not_found`, `misplaced`, `unexpected`, `damaged`, or `withdrawn`, plus `location` and `q`. `q` matches title, author, call number, and barcode. Barcode match and the barcode field are omitted without `catalog.barcode.view`. `damaged` includes primary outcome `damaged` and `observed_damaged`. `found` is primary outcome `found` only.

`POST /scans` returns `200` with the stored attempt: outcome, match basis, observed damage, the display fields, the Koha status, whether it counted, and the original outcome when it is a duplicate. `external_id` is included only with `catalog.barcode.view`. The same shape is used for invalid and Koha-error attempts.

`POST /shelf-searches` accepts 1–200 expected-item ids and one remark. An id that is not Unverified fails the whole call with `409` `not_unverified` and inserts nothing.

An adjustment field that is not on the allowlist is `422` `field_not_allowed`. Approve and reject require the caller’s user id to differ from `drafted_by`. Otherwise the response is `403` `not_approver`. Submit of a draft, a rejected proposal, or a submitted proposal is `409` `not_submittable`. A missing `item_update` capability is `501`. A Koha refusal stores `failed`, `koha_http_status`, and `koha_error`, and returns `200` with that proposal. A timeout or connection error does the same with `koha_http_status` null. A success stores `submitted` and returns `200`. Submit sends one proposal. It does not roll back a previous success.

`GET /exports` accepts `format` of `csv` or `xlsx` and `kind` of `findings`, `filter`, `unverified`, or `work_order`. `findings` is every exception row. `filter` uses the same query as `GET /items` except paging, and returns the full filtered set. `unverified` is the unverified expected rows. `work_order` is proposals in `approved` or `failed`. Columns are session name, department, home library, barcode when permitted, Koha item id, title, author, call number, item type, snapshot location, live or station location, condition, Koha status, scanned-at time, operator name, and remark. The work order uses proposal id, field, from value, to value, reason, status, and those item columns. CSV uses the standard library. Excel uses `openpyxl`, added as an API dependency, with one sheet and the same columns. The response is the file. The export audit stores the kind, the format, and the row count.

## Screens

The page keeps the staff shell. Inside it, a local nav switches Overview, Scan, Exceptions, Adjustments, and Audit. The header has the session switcher, search, the export menu, and **New session**. The safeguard banner states that an unscanned item stays Unverified and that Koha is unchanged. Refresh reloads ULMS data and does not call start again.

The new-session dialog collects name, description, start date, target date, operators, locations, and an optional item type. The home library is shown and not edited. **Save draft** creates the Draft. **Start and pull snapshot** creates it and starts it, then opens Scan. Both stay inactive when the department has no branch code or when `item_list` is unset.

**Overview.** Five cards show expected items, scanned expected items, open exceptions, unverified items, and proposals still in `draft`, `approved`, or `failed`. The ring is the completion percentage. The bar shows Found, Misplaced, Damaged, Withdrawn, and Unexpected. The legend also shows Unverified and Not Found. Coverage by location uses the snapshot locations. The scan feed shows the latest attempts. The session table uses the status filters from `GET /sessions`. A draft offers **Start**. An in-progress session offers **Scan**.

**Scan.** The capture field is focused when the view opens and after every result. **Flag next: damaged** stays armed until a scan stores a Koha item. An invalid barcode or a Koha error leaves it armed. The last result shows the condition, title, barcode when permitted, locations, and Koha status. The side column shows the session counts and the signed-in operator’s counting scans. A Koha error leaves the field ready for the same barcode.

**Exceptions.** Tabs are All, Not Found, Misplaced, Unexpected, Damaged, and Withdrawn. The table shows barcode when permitted, title, author, item type, snapshot location, station or live location, condition, time, and operator. A location filter and checkboxes select unverified rows. **Mark not found** asks for one remark. The item drawer shows the stored fields, the remark, **Flag damaged** or **Clear damaged**, and **Return to unverified** for a Not Found row. It can draft a proposal when the caller has `inventory.manage` and the session is In Progress or Completed.

**Adjustments.** The capability card states whether `item_update` is recorded and names the allowlist. The list shows each proposal’s field, values, reason, status, drafter, and decider. Submit is inactive when the capability is unset or the caller lacks `inventory.adjustments.approve`. **Export work order** stays available.

**Audit.** The table is this session’s `audit_logs` rows, filtered by person and action. It shows time, actor, action, object, and the before and after values when the row has them. It does not show a hash chain.

Desktop keeps the prototype’s two- and three-column arrangement. Below the `xl` breakpoint the columns stack, and wide tables scroll sideways. Each view has a loading state, an empty state, and a Koha-unavailable state. The existing department prompt remains when no department is selected.

There is no pause status, no undo, no “flag withdrawn” control, no simulated scan button, and no device list for a camera or a handheld batch scanner. Resume means opening an in-progress session on the Scan view.

## Permissions

A new Alembic revision revises `20261120_0005`. It adds the inventory tables and two permissions.

| Code | Who receives it | Allows |
|---|---|---|
| `inventory.view` | Unchanged. Librarian, Department Head, Library Administrator, Super Administrator | Open the page, read, and export. |
| `inventory.manage` | Those same four roles | Create, edit, start, cancel, complete, reopen, scan, shelf-search marks, the damage flag, and a draft proposal. |
| `inventory.adjustments.approve` | Department Head, Library Administrator, Super Administrator | Approve, reject, and submit. |

Student and Auditor receive neither new permission. Auditor already lacks `inventory.view`. A missing permission is `403` `permission_denied`. Hiding a button is not the authorization check.

Barcodes in item, scan, and export payloads follow `catalog.barcode.view`. The four inventory roles already have that permission.

## Audit

The existing `audit_logs` table is append-only for this module. `module` is `inventory`. There is no update or delete route for these rows.

| Action | When | `details` |
|---|---|---|
| `inventory.session_create` | A draft is created | Session id, department id, home library id. |
| `inventory.session_update` | A draft is edited | The changed fields, each with its before and after value. |
| `inventory.session_start` | Start commits | `expected_count`. No barcode list. |
| `inventory.session_complete` | Complete | Session id. |
| `inventory.session_cancel` | Cancel | Session id and the previous status. |
| `inventory.session_reopen` | Reopen | Session id. |
| `inventory.scan` | A scan row is stored | Scan id, `koha_item_id` when present, outcome, `counts`. No barcode. |
| `inventory.not_found` | A shelf-search batch is stored | `batch_id` and the expected-item ids. |
| `inventory.not_found_reverse` | A mark is reversed | Search id and expected-item id. |
| `inventory.damage` | The damage flag changes | Scan id, before outcome, after outcome. |
| `inventory.adjustment_draft` | A proposal is drafted or edited | Adjustment id, field, before value, after value. |
| `inventory.adjustment_decide` | Approve or reject | Adjustment id, decision, decider. |
| `inventory.adjustment_submit` | Submit returns | Adjustment id, status, HTTP status or null. |
| `inventory.export` | A file is downloaded | Kind, format, row count. |

`entity_type` is `session`, `scan`, `shelf_search`, or `adjustment`. `entity_id` is that row’s id. The row stores the staff user id. Barcodes are not copied into `details` or into application logs. The Audit view loads the barcode from the scan or expected row when the caller may see it.

## Errors

| Situation | Result |
|---|---|
| No active department | `409` `department_required`. |
| The session is in another department, or the id is unknown | `404` `not_found`. |
| The department has no `koha_branchcode` | `422` `branch_unmapped`. “This department has no Koha library.” |
| The scan value is empty, too long, or contains a control character | `422` `invalid_scan`. “That scan is not valid.” No scan row. |
| The session is not in the state the action requires, including a second start | `409` `invalid_state`. |
| Two kept items share a barcode | `409` `ambiguous_barcode`. The session stays Draft. |
| A shelf-search id is not Unverified | `409` `not_unverified`. Nothing is inserted. |
| The caller drafted the proposal they are approving or rejecting | `403` `not_approver`. |
| The proposal cannot be submitted from its current status | `409` `not_submittable`. |
| The field is not on the allowlist | `422` `field_not_allowed`. |
| `item_list` or `item_update` is unset | `501` `inventory_unsupported`. “This Koha operation is not available.” |
| Koha refuses the item update | The proposal is stored `failed`. The response is `200`. |
| Koha times out or the connection fails during a scan | A `koha_error` scan is stored. The response is `200`. |
| Koha times out or the connection fails during start | The transaction rolls back. `503` `inventory_unavailable`. The session stays Draft. |
| Koha times out during submit | The proposal is stored `failed`. The response is `200`. |
| The session lacks the route’s permission | `403` `permission_denied`. |
| A write lacks a valid CSRF header | Existing `403` `csrf_failed`. |

The response never includes the raw Koha body, a token, or a credential. A failed scan does not delete earlier scans.

## Testing

Automated tests never call the live Koha host. They use a fake Koha client.

Service tests cover the shelf filter: checked out, in transit, lost, and withdrawn copies are dropped; not-for-loan and Koha-damaged copies are kept; a blank location is dropped when the session has locations. They cover the classification order, including a withdrawn copy inside scope, an out-of-scope copy, damage with each match basis, and a location mismatch. A second scan of the same item is a duplicate and does not change completion. Two concurrent counting inserts leave one counting row. A shelf-search mark sets Not Found, and a later scan supersedes it. Reverse clears the mark. The item is Unverified only when no counting scan exists. Otherwise the scan outcome remains. Start rolls back when Koha fails on a later page. Submit with no `item_update` capability returns `501` and leaves the proposal `approved`. A failed submit leaves the scan rows in place. The drafter cannot approve. Audit details for a scan contain the item id and the outcome and contain no barcode.

API tests cover a required session, CSRF on writes, `department_required`, a session in another department as `404`, `invalid_scan`, and `permission_denied` for a session that has `inventory.view` and lacks `inventory.manage`. The migration grants `inventory.manage` to the four roles named above, grants `inventory.adjustments.approve` to Department Head, Library Administrator, and Super Administrator, and grants neither code to Student or Auditor.

Web tests use `node --test` for the scan value: Enter submits, an empty value does not, a control character is rejected, and a second submit of the same in-flight value is ignored. This app has no component test runner. During implementation the five views are exercised in the browser, including a draft start, a found scan, a duplicate, an unknown barcode, a Not Found mark on a selected set, an export, and a proposal that cannot be submitted when `item_update` is unset. A physical reader is checked as keyboard input into the scan field. CI does not require the reader.

## Out of scope

- Filling `koha_branchcode`.
- Collection-code scope, call-number ranges, and a second snapshot after start.
- A camera, a Bluetooth scanner, and an Android batch upload.
- A browser queue that accepts barcodes while Koha is down.
- Pause as a session status, undo of a scan, and a control that flags a copy withdrawn.
- Automatic or preselected lost, withdrawn, or delete proposals.
- A second approver, a hash-chained audit log, and a retention period other than the one `audit_logs` already has.
- Writing Koha’s database, or any item field the recorded allowlist does not name.
