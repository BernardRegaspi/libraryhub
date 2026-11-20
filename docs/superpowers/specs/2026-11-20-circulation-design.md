# Staff circulation desk

Date: 2026-11-20
Status: draft

## Purpose

Authorized staff check books out, check them in, and renew loans. They can also read current loans and whatever circulation history Koha exposes. Koha remains the authority for every transaction. ULMS stores permissions, an audit row, and a short request record. It does not store a copy of the loan.

The page is `/circulation`. It follows the circulation desk in `plan/prototype1.html` and the loan tables in `plan/prototype2.html`, using the staff shell’s existing components. Prototype 2’s local loan periods, fine math, and session totals are not part of this desk.

## Decisions

- `circulation.view` opens the desk and the read-only loans and history views. Checkout, check-in, and renewal require `circulation.checkout`, `circulation.checkin`, and `circulation.renew`. Those three permissions are granted to Librarian, Department Head, Library Administrator, and Super Administrator, the same roles that already have `circulation.view`.
- A card scan is a keyboard-wedge value matched exactly to Koha `cardnumber`. The desk then loads that patron from Koha. Manual patron search remains available.
- A barcode scan is a keyboard-wedge value matched exactly to the item barcode (`external_id`). Manual item search remains available.
- USB wedge input is the scanner path. The page does not use Web NFC.
- While `library_departments.koha_branchcode` is empty, ULMS adds no library block. The desk shows the item’s Koha library. Koha accepts or rejects the transaction. This module does not fill branch codes.
- Checkout collects a list, then one confirm submits the items in order, one Koha checkout at a time, and stops on the first refusal or uncertain write.
- Check-in submits on each barcode. Renewal shows the current loan, then submits only after confirm.
- The browser may print a result Koha has already confirmed. Refused and unknown lines are left off that print.
- Barcodes in circulation responses follow `catalog.barcode.view`. The four circulation roles already have that permission.
- The browser never calls Koha. Client id, client secret, and bearer token stay on the API server and out of logs.

## Koha capability gate

Koha paths are fixed only after a read of the configured host’s OpenAPI document. The patron spec recorded that host as Koha `25.06.00` on 2026-11-19. Circulation uses the same host and the same OAuth client.

The first implementation task writes a capability table in `apps/api/app/integrations/koha/circulation.py` and quotes it in the implementation plan before any write route calls Koha. Each entry names the HTTP method, path, and the response fields this module reads. ULMS calls only those entries. Unknown Koha keys are dropped. A field Koha omits is JSON `null`, and the desk shows Unavailable for that field.

| Capability | Required Koha behavior | When it is unset |
|---|---|---|
| `checkout` | A write accepting a patron id and an item id. Success returns a checkout id and a due date. Refusal returns a structured error. | Checkout confirm is disabled. `POST /checkouts` returns `501` `circulation_unsupported`. |
| `checkin` | A write accepting an item id. Success or a structured error comes back from Koha. | The check-in field is disabled. `POST /checkins` returns `501`. |
| `renew` | A write accepting a checkout id or an item id. Success returns the updated due date. | Renew confirm is disabled. `POST /renewals` returns `501`. |
| `loans` | A paged list of open checkouts, or the existing per-patron checkout list. | Current loans shows the unavailable panel. |
| `history` | A paged list of completed circulation records. | History shows the unavailable panel. |
| `renewal_preview` | A read that says whether Koha will allow a renewal. | The preview’s renewal status is `unrecorded`. Confirm still submits the write. |
| `checkin_confirmation` | A documented confirmation flag on the check-in write. | The desk never sends `confirm: true`. |

`GET /circulation/capabilities` returns this table to the desk. Flags come from the recorded table, not from a live OpenAPI fetch on each request. Static paths (`/capabilities`, `/patrons/by-card`, `/items/by-barcode`, `/renewals/preview`) are registered before any `/{id}` route.

When `loans` is only the existing `GET /patrons/{patron_id}/checkouts` list, `loans.scope` is `patron`. The desk asks for a patron, then lists that patron’s open loans. Title and barcode filter those rows. A global checkout list sets `loans.scope` to `global`. Filters and sorts appear only for fields the recorded list accepts. History follows the same rule. A permission failure from Koha on either list is the unavailable panel, not an empty table.

ULMS never sends a Koha override header.

## Architecture

```text
Browser (staff shell, session cookie)
  -> Next.js /api/v1 rewrite
    -> FastAPI /api/v1/circulation
      -> circulation service (permission, capability table, request row, audit)
        -> existing Koha client
        -> audit_logs
        -> circulation_requests
```

| Piece | Owns |
|---|---|
| Koha client | Token, timeouts, and the recorded circulation calls. No ULMS rules. |
| Circulation service | Exact lookups, batch checkout, request locking, field stripping, audit. |
| Circulation routes | `/api/v1/circulation`, validation, session, CSRF on writes. |
| `/circulation` | The five-tab desk. |
| Patron routes | Manual patron search and the existing per-patron loan read. |
| Catalog routes | Manual title search and copy barcodes. |

Patron pages, catalog pages, and the existing loan read stay as they are. Category and library labels use the caches the Koha client already keeps for 10 minutes. Loan and transaction responses are never cached.

Logs include the path template, HTTP status, and duration. They omit the query string, barcodes, patron names, the Authorization header, and the token.

## Permissions

A new Alembic revision adds three permissions and the `circulation_requests` table.

| Code | Who receives it | Allows |
|---|---|---|
| `circulation.view` | Unchanged | Open the desk, look up a patron or item, read loans and history. |
| `circulation.checkout` | Librarian, Department Head, Library Administrator, Super Administrator | Submit a checkout. |
| `circulation.checkin` | Those same four roles | Submit a check-in. |
| `circulation.renew` | Those same four roles | Submit a renewal. |

Student and Auditor receive none of the new permissions. Auditor already lacks `circulation.view`. A missing permission is `403` `permission_denied` with no patron or item fields in the body. Hiding a button is not the authorization check.

A staff member who can open the desk and lacks a write permission still sees that tab. The submit control is inactive and the tab says “You do not have permission for this action.”

## Data

`circulation_requests` lives in the `libraryhub` schema.

| Column | Rule |
|---|---|
| `id` | UUID supplied by the browser. Primary key. |
| `user_id` | Staff user. Nullable so a deleted user can be set null. |
| `action` | `checkout`, `checkin`, or `renew`. |
| `status` | `in_progress`, `completed`, or `unknown`. |
| `patron_id` | Koha patron id when the action has one. Null for a check-in until Koha returns a patron. |
| `created_at`, `updated_at` | Timezone-aware timestamps. |
| `result` | JSON object of ids, outcome codes, and the staff-facing message already returned to the desk. |

The service validates the body and completes the reads that identify the patron or item before it inserts a row. A failed read inserts nothing, and the same `request_id` may be sent again. The insert is `in_progress` and is committed before the Koha write. A second insert with the same id loses on the primary key, reads the existing row, and follows the replay rules in Checkout. The service updates `updated_at` before each Koha write in a batch. A row that is still `in_progress` and whose `updated_at` is older than the configured Koha timeout plus 30 seconds is stored as `unknown`.

`result` for a checkout:

```json
{
  "items": [
    {"item_id": 1, "outcome": "confirmed", "checkout_id": 9, "due_date": "2026-12-04"},
    {"item_id": 2, "outcome": "refused", "message": "Koha refused this transaction."},
    {"item_id": 3, "outcome": "unsent"}
  ]
}
```

Outcome codes are `confirmed`, `refused`, `unknown`, `unsent`, `not_applied`, and `confirmation_required`. A renewal result also stores `previous_due_date` and `checkout_id`. A check-in result stores `item_id`, `checkout_id` when Koha returned one, and `patron_id` when Koha returned one. Barcodes and patron names are not stored.

## HTTP API

All routes sit under `/api/v1/circulation`. They require a valid session. Writes require the existing CSRF check. Error bodies use `detail.code` and `detail.message`. A write that must be verified also includes `detail.request_id` and, when a stored result exists, `detail.items`.

| Method | Path | Permission | Behavior |
|---|---|---|---|
| `GET` | `/capabilities` | `circulation.view` | The recorded capability flags. |
| `GET` | `/patrons/by-card` | `circulation.view` | Exact card-number lookup. |
| `GET` | `/patrons/{patron_id}` | `circulation.view` | Desk patron block. |
| `GET` | `/items/by-barcode` | `circulation.view` | Exact barcode lookup. |
| `GET` | `/loans` | `circulation.view` | Current loans. |
| `GET` | `/loans/{checkout_id}` | `circulation.view` | One loan, when a single-checkout read is recorded. |
| `GET` | `/history` | `circulation.view` | History, when that capability is recorded. |
| `GET` | `/renewals/preview` | `circulation.view` | The loan shown before renewal. |
| `POST` | `/checkouts` | `circulation.checkout` | Submit the item list. |
| `POST` | `/checkins` | `circulation.checkin` | Submit one return. |
| `POST` | `/renewals` | `circulation.renew` | Submit one renewal. |
| `POST` | `/requests/{request_id}/verify` | The write permission for the stored action | Read Koha and resolve an `unknown` request. |

`patron_id` and `checkout_id` are positive integers. Any other path value is `404` `not_found`.

### Desk patron

`GET /patrons/by-card?cardnumber=` trims the value and requires 1–64 characters with no C0 or DEL control characters. The Koha query is an exact `cardnumber` match. Zero rows is `404` `not_found` with “No patron matches that card number.” More than one row is `409` `ambiguous_card` with “More than one patron has that card number.”

`GET /patrons/{patron_id}` loads that patron. An unknown id is `404` “That patron was not found.”

Both routes return the patron directory fields from `directory_item`, plus `balance`. The balance call is `GET /patrons/{patron_id}/account`. A balance failure leaves `balance` null and still returns the patron. Counts use the same embed as the patron directory. A count Koha omits is null. A returned number, including `0`, is that number.

The desk builds the name with the existing `displayName` helper and the status badges with the existing patron status helper. Balance uses `formatPeso`. A null balance is shown as Unavailable.

### Desk item

`GET /items/by-barcode?barcode=` uses the same length and control-character rule. The Koha query is an exact `external_id` match. Zero rows is `404` “No item matches that barcode.” More than one row is `409` `ambiguous_item` with “More than one item has that barcode.”

The response contains `item_id`, `biblio_id`, `title`, `author`, `call_number`, `item_type_id`, `item_type_label`, `home_library_id`, `home_library_name`, `holding_library_id`, `holding_library_name`, `status`, and `status_label`. Status comes from the existing `item_status` helper. `external_id` is included only when the caller has `catalog.barcode.view`. Title, author, call number, and library name are null when Koha omits them. The type and library labels fall back to the id, the same way the catalog copy does.

### Checkout

`POST /checkouts` accepts `request_id` (UUID), `patron_id` (positive integer), and `item_ids` (1–20 positive integers, no duplicates). A malformed body is `422` `validation_error`.

The service loads the patron. An unknown patron is `404` “That patron was not found.” Koha is not asked to check anything out, and no request row is stored. It then posts one recorded checkout per item. On `confirmed`, it keeps `checkout_id` and `due_date` from that response. On a Koha refusal, that item is `refused` and every later item is `unsent`. On a timeout or a connection error, that item is `unknown`, later items are `unsent`, and the request status is `unknown`. A finished batch with no `unknown` item is `completed`.

A batch that reached Koha returns `200` with `request_id`, `status`, and `items`, including a refusal or an unknown item. The due date is the value Koha returned. ULMS does not calculate one.

Replaying a `completed` request returns the stored `200` result and does not call Koha. A `completed` request whose outcome is `confirmation_required` returns `409` `circulation_confirmation` again. `in_progress` returns `409` `still_processing`. `unknown` returns `409` `outcome_unknown`. The `409` bodies include the stored items.

### Check-in

`POST /checkins` accepts `request_id`, `item_id`, and optional `confirm` (boolean, default false). An unknown `item_id` is `404` “That item was not found.” No check-in write runs, and no request row is stored.

When the item exists, the service posts the recorded check-in. `confirm: true` is sent only when `checkin_confirmation` is recorded and the client set `confirm`. A Koha response that asks for that confirmation is `409` `circulation_confirmation`, the request is `completed` with outcome `confirmation_required`, and the desk shows Koha’s message plus a confirm control. The confirm control sends a new `request_id` and `confirm: true`.

Success is `200`. The body contains `item_id`, `title`, `author`, `call_number`, `status`, `status_label`, `previous_due_date`, `returned_date`, `charge_text`, and `patron`. `patron` is a desk patron when Koha included one, otherwise null. `charge_text` is the charge or overdue sentence Koha returned, otherwise null. `external_id` is included only with `catalog.barcode.view`. A null date or title is null. The desk shows a successful return only on this response.

### Renewal

`GET /renewals/preview` accepts either `barcode` or `checkout_id`. The barcode lookup finds the open loan for that item. No open loan is `404` “No current loan matches that barcode.”

The response contains the loan fields listed under Current loans, the desk patron, and `renewal`. When `renewal_preview` is recorded, `renewal` is `{ "status": "known", "allowed": true|false, "message": string|null }` using Koha’s answer. Otherwise `renewal` is `{ "status": "unrecorded" }`.

`POST /renewals` accepts `request_id` and `checkout_id`. An unknown checkout is `404` “That loan was not found.” No request row is stored. The service loads the loan, stores `previous_due_date`, and posts the recorded renewal with the identifier that operation requires. Success is `200` with the new `due_date` from Koha. A refusal is `409` `circulation_refused`. A timeout or connection error stores `unknown` and returns `504` `circulation_timeout`.

### Verify

`POST /requests/{request_id}/verify` reads Koha. It does not repeat the write.

- Checkout: the patron’s open loans are read. Each item still `unknown` becomes `confirmed`, with that loan’s `checkout_id` and `due_date`, when the read shows it. An `unknown` item absent from that read becomes `not_applied`. Items already `confirmed`, `refused`, or `unsent` stay as they are.
- Check-in: the item’s open loan is read. No open loan becomes `confirmed`. An open loan still present becomes `not_applied`. When the recorded API cannot answer that question, the route returns `501` and the row stays `unknown`.
- Renewal: the checkout is read. A `due_date` different from `previous_due_date` becomes `confirmed` with the new date. The same due date becomes `not_applied`.

A successful verify stores `completed` and returns the updated result. A timeout on the read leaves the row `unknown` and returns `504`. Any other read failure leaves it `unknown` and returns `503`. A verify that changes an outcome writes an audit row.

### Current loans

`GET /loans` accepts `q`, `patron_id`, `library_id`, `item_type`, `overdue` (`true` or `false`), `page`, `per_page`, `sort`, and `direction`. `page` is 1–10000, default 1. `per_page` is 1–20, default 20. `direction` is `asc` or `desc`. A parameter the recorded list does not support, or a value outside those bounds, is `422` `invalid_search` with “That search is not valid.” `q` is empty or 1–80 characters with no C0 or DEL controls.

`patron` scope requires `patron_id`. The service calls the existing per-patron checkout read, filters the returned rows by title and barcode when `q` is present, and paginates those rows in ULMS. `global` scope sends Koha’s paging, sort, and the recorded filters. Descending sorts prefix the field with `-` when Koha uses that convention. The default sort is `due_date` ascending when that sort is recorded. Otherwise the list uses Koha’s order.

The response is `{ items, page, per_page, total, has_next }`. `total` is the integer `X-Total-Count` header when the global list provides it, otherwise null. `has_next` follows the patron directory rule.

Each item contains `checkout_id`, `item_id`, `patron_id`, `patron_name`, `cardnumber`, `title`, `author`, `call_number`, `item_type_id`, `item_type_label`, `library_id`, `library_name`, `checkout_date`, `due_date`, `renewals_count`, and `overdue`. `external_id` is included only with `catalog.barcode.view`. Names and labels are null when the embed or the label cache has no value. When `due_date` is present, `overdue` is the boolean from `is_overdue` using today’s date in `Asia/Manila`, the same rule as patron loans. When `due_date` is null, `overdue` is null. The desk shows an overdue badge only when `overdue` is true.

`GET /loans/{checkout_id}` returns one item of that shape when a single-checkout read is recorded. Otherwise it is `501`.

### History

`GET /history` uses the same paging rules. It also accepts `type` (`checkout`, `checkin`, `renewal`) and `date_from` / `date_to` (`YYYY-MM-DD`) when the recorded operation accepts them. `types` on the capability object lists the values the desk may send.

Each item contains the loan fields the history payload can fill, plus `type` and `returned_date`. `type` is `checkout`, `checkin`, or `renewal` when the source distinguishes them. A source that only returns completed loans uses `loan`. `staff_name` is present only when the Koha object includes it. The Koha reference shown on the desk is `checkout_id`.

An unset history capability, or a Koha permission failure on that call, is `501` `circulation_unsupported` with “This Koha operation is not available.” The desk renders the unavailable panel.

## Scanning and the desk

The page keeps `ModuleFrame` with `hideModuleSentence`. The eyebrow is Library. The title is Circulation desk. The description is “Koha confirms every checkout, check-in, and renewal.”

Five tabs sit under the header. The active tab uses the primary fill. The query parameter `tab` is `checkout`, `checkin`, `renew`, `loans`, or `history`. An unknown value opens Checkout. Switching tabs keeps the checkout list and the latest result in memory. A refresh keeps the tab and clears the unsaved list.

Scan input is a dedicated field. The page does not listen for keys on the document. Enter or Tab submits the trimmed value. An empty value does nothing. The client rejects control characters with “That scan is not valid.” Check-in, and the checkout item field, keep a visible queue of at most 20 values and submit one at a time. The twenty-first value is refused with “The scan queue is full.” After each result the field clears and takes focus again.

Checkout scan mode focuses the card field. After a patron loads, focus moves to the barcode field. The patron block shows the desk patron fields. The item list shows title, author, barcode when the caller may see it, call number, item type, home library, and status, with a remove control. A barcode already in the list is refused in the client. The footer shows the item count, Clear, and Confirm checkout. Confirm is inactive without a patron, with an empty list, without `circulation.checkout`, or while a submit is running.

Search mode uses the patron directory search and the catalog search. Choosing a patron loads the desk patron block. Choosing a catalog copy that has a barcode runs the barcode lookup and adds that item. A copy without a barcode says the barcode is unavailable and has no add control. Search mode does not move focus back to the scan field.

Before checkout, a patron flag of Expired, Restricted, or Card lost, a balance greater than zero, or an item `status` other than `available` opens one confirm dialog quoting those labels and the peso balance. The dialog asks the staff member to continue. Koha still accepts or refuses. A null balance does not open the dialog.

The right column says “Koha’s confirmation will appear here” until a submit returns. On a desktop the column sits beside the form. Below the `lg` breakpoint it stacks underneath. The result lists each item’s outcome, the due date Koha returned, and the checkout id.

Check-in is one column. The client resolves the barcode, then posts `item_id` with a new `request_id`. A lookup `404` is shown and no write is sent. The barcode field stays focused. This session’s returns list newest first with title, barcode, patron when Koha returned one, previous due date, return time, charge or overdue text when Koha returned it, and the outcome. A Koha confirmation is the only check-in dialog.

Renew uses Scan and Search for one loan. The preview shows the patron, title, barcode when allowed, current due date, renewal count when Koha returned it, and the preview message. A known denial is quoted in the confirm dialog. Confirm still submits. The result shows the new due date or the refusal.

Current loans is a read-only table: search, the filters the capability object lists, pagination, sort, and a detail sheet. Renewal stays on the Renew tab. History uses the same table pattern with the recorded type and date filters. An unsupported history operation shows the unavailable panel.

A confirmed result plays a short tone. A refusal plays a different short tone. The outcome is visible either way. Mute is stored in `sessionStorage` under `circulation-mute`.

The print control appears when at least one line is `confirmed`. The print region contains the transaction type, the local time of the confirmed response, the patron name and card number, each confirmed item, the due date or return detail Koha returned, and the checkout id. Refused and unknown lines are omitted.

## Audit

The existing `audit_logs` table records one row per Koha write request, and one row when verify changes an outcome.

| Action | When | `details` |
|---|---|---|
| `circulation.checkout` | A checkout batch finishes `completed` or `unknown` | `{ "request_id", "patron_id", "items": [{ "item_id", "outcome" }] }` for items that were sent |
| `circulation.checkin` | A check-in write finishes | `{ "request_id", "item_id", "outcome" }` |
| `circulation.renew` | A renewal write finishes | `{ "request_id", "checkout_id", "outcome" }` |
| `circulation.verify` | Verify changes an `unknown` outcome | The same shape as the action it resolved |

`module` is `circulation`. `entity_type` is `checkout` when a checkout id exists, otherwise `request`. `entity_id` is that id. The row stores the staff user id. Messages, barcodes, and patron names are not stored. A lookup that never calls a write, including an unknown card, writes no audit row.

## Errors

| Situation | Result |
|---|---|
| The card number matches nothing | `404` `not_found`. “No patron matches that card number.” |
| The barcode matches nothing | `404` `not_found`. “No item matches that barcode.” |
| The loan or patron id is unknown | `404` `not_found`. “That patron was not found.” or “That loan was not found.” or “That item was not found.” |
| More than one patron has the card number | `409` `ambiguous_card`. |
| More than one item has the barcode | `409` `ambiguous_item`. |
| The scan or the search is outside the allowlist | `422` `invalid_scan` or `invalid_search`. |
| The session lacks the route’s permission | `403` `permission_denied`. “You do not have permission for this action.” |
| A write lacks a valid CSRF header | Existing `403` `csrf_failed`. |
| Koha refuses the write | `409` `circulation_refused`. Koha’s message when it is one line, shorter than 200 characters, and contains no HTML. Otherwise “Koha refused this transaction.” Inside a checkout batch this is an item outcome on the `200` body. |
| Koha asks for check-in confirmation | `409` `circulation_confirmation`. |
| The capability is unset | `501` `circulation_unsupported`. “This Koha operation is not available.” |
| Koha is not configured, authentication fails, or a read fails | `503` `circulation_unavailable`. “Circulation is unavailable. Try again.” |
| A write times out or the connection fails after the request row is stored | Checkout batch: item outcome `unknown` on `200`. Check-in and renewal: `504` `circulation_timeout`. “The outcome is unknown. Verify before trying again.” |
| The same request is still running | `409` `still_processing`. |
| The same request is `unknown` | `409` `outcome_unknown`. |

The response never includes the raw Koha body, a token, or a credential. Reads may be retried by the desk. Writes are not retried automatically. An empty loan page is `200` with an empty collection. The UI does not substitute sample loans.

## Testing

Automated tests never call the live Koha host. They use a fake Koha client.

Service tests cover an exact card match, zero matches, and several matches. They cover the same three barcode cases. A checkout of several items posts in order and stops on the first refusal, with later items `unsent`. The same request id returns the stored result and does not call Koha again. A timeout stores `unknown` and does not retry. Verify confirms a loan that the read shows, and stores `not_applied` when the read shows no loan. Refusal, an unset capability, a connection failure, and a missing permission keep separate codes. Barcodes are omitted without `catalog.barcode.view`. Audit details contain the outcome, request id, patron id, and item id, and contain no barcode or patron name. A null `due_date` sets `overdue` to null.

API tests cover a required session, CSRF on writes, `invalid_scan`, and `permission_denied` for a session that has `circulation.view` and lacks the write permission. The migration grants the three write permissions to the four roles named above and to nobody else.

Web tests use `node --test` for the tab query, Enter and Tab on the scan value, an empty value, the queue limit, and a print payload that contains confirmed lines only. This app has no component test runner. During implementation the five tabs are exercised in the browser, including a refused checkout, an unknown barcode, an unknown outcome, and the history panel when that capability is unset. A physical reader is checked as keyboard input into the scan field. CI does not require the reader.

## Out of scope

- Filling `koha_branchcode` or blocking a transaction by ULMS department.
- Web NFC, a local circulation queue, and a circulation-policy editor.
- Holds, fine payments, and student self-checkout.
- Local due dates, renewal limits, and fine calculation.
- Koha override headers.
- A PDF or thermal receipt, and session totals.
- Copying patrons or loans into PostgreSQL.
- Changing the catalog copy shape.
