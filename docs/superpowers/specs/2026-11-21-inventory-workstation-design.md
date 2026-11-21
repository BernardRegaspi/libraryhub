# Inventory workstation

Date: 2026-11-21
Status: pending review

## Purpose

The inventory session page takes the layout of `plan/inventory.html`: a session header, a four-step stepper, a progress bar, count cards, a scan panel, a scan table, an exception review panel, and a sidebar. Decisions are stored in PostgreSQL. Export downloads a CSV. Koha items are not updated.

This spec extends `docs/superpowers/specs/2026-11-21-inventory-scanning-design.md`. Where the two disagree about review or CSV export, this spec wins. Classification, the Koha count, the barcode lookup, the scanner field, and the device queue stay as written there.

## Decisions

- The workstation is `/inventory/[sessionId]`. `/inventory` stays the session list. `/inventory/new` stays the create form. Both list and create take the same paper background, white cards, and display serif. Their fields and filters do not change, except the list status filter accepts `in_review`.
- The staff shell stays. This module does not draw the prototype sidebar or top bar.
- The session status set is `draft`, `in_progress`, `in_review`, and `cancelled`. `pending_review` and `completed` are not added.
- Finish scanning moves `in_progress` to `in_review` and hides the scanner. It does not insert rows for books that were never scanned.
- Back to scanning moves `in_review` to `in_progress` and keeps every saved decision.
- Cancel from `draft`, `in_progress`, or `in_review` sets `cancelled`, keeps scans and decisions, and removes the scanner.
- The scan table lists saved scans only. The expected population remains the count stored at create time.
- Review covers each primary scan whose outcome is not `verified`. Duplicates and verified scans have no decision row.
- The librarian picks one of two preset sentences for that outcome, then Approve or No action. Both stay disabled until a preset is chosen. A new preset clears the decision.
- Export is a CSV download. It is available in `in_review` and `cancelled`. It does not change the session status and does not call Koha.
- `inventory.view` covers finish, resume, decisions, export, and the audit list. `inventory.manage` is not added.
- The shelf dropdown, the damaged checkbox, sample barcodes, and “Simulate scans” are not on the page.

## Out of scope

- Koha item writes, including lost, damaged, withdrawn, and location updates.
- An expected-item snapshot, and rows for books that were never scanned.
- A per-scan shelf, a collection picker, and a damaged checkbox.
- Accuracy percentages and the prototype’s stocktake-history statistics.
- `pending_review` and `completed`.
- Deleting sessions, scans, or decisions.

## Status

| From | Action | To |
|---|---|---|
| `draft` | Start scanning | `in_progress` |
| `in_progress` | Finish scanning | `in_review` |
| `in_review` | Back to scanning | `in_progress` |
| `draft`, `in_progress`, or `in_review` | Cancel | `cancelled` |

A scan is accepted only in `in_progress`. A decision is accepted only in `in_review`.

The stepper labels are Plan, Scan, Review, and Submit. Plan is `draft`, Scan is `in_progress`, and Review is `in_review`. Submit is the export button on the review step. It is not a status.

## Decisions table

`libraryhub.inventory_review_decisions`

| Column | Rule |
|---|---|
| `id` | UUID primary key. |
| `session_id` | Session foreign key, `ON DELETE RESTRICT`. |
| `scan_id` | Primary-scan foreign key, unique, `ON DELETE RESTRICT`. |
| `action` | One of the two sentences for that scan’s outcome. `String(80)`. |
| `decision` | Null, `approved`, or `no_action`. |
| `decided_by` | User id. Null while `decision` is null. |
| `decided_at` | Timestamp. Null while `decision` is null. |

Saving a preset with an empty decision stores `action` and clears `decision`, `decided_by`, and `decided_at`. Saving Approve or No action sets `decision`, `decided_by`, and `decided_at` on that row. A verified scan or a duplicate cannot have a row. A scan recorded after returning to `in_progress` has no decision until the session is finished again.

Preset sentences:

| Outcome | Choices |
|---|---|
| `not_found` | Search the shelf again. Leave the Koha status unchanged. |
| `misplaced` | Reshelve to the session location. Leave it where it was found. |
| `unexpected` | Check the Koha item record. Reshelve to its home library. |
| `damaged` | Set the book aside for repair. Leave it on the shelf. |
| `withdrawn` | Remove it from the shelf. Leave it on the shelf. |
| `other_exception` | Set the book aside for a librarian. Leave it on the shelf. |

The stored value is the sentence without a trailing period, so the six pairs are exactly:

- `Search the shelf again` / `Leave the Koha status unchanged`
- `Reshelve to the session location` / `Leave it where it was found`
- `Check the Koha item record` / `Reshelve to its home library`
- `Set the book aside for repair` / `Leave it on the shelf`
- `Remove it from the shelf` / `Leave it on the shelf`
- `Set the book aside for a librarian` / `Leave it on the shelf`

“Leave it on the shelf” is valid for damaged, withdrawn, and other exception. The server checks the sentence against the scan’s outcome.

## API

All routes stay under `/api/v1/inventory`. Writes send the CSRF header. Error bodies stay `{ code, message }` and include `fields` only for `validation_error`.

| Request | Success |
|---|---|
| `POST /sessions/{id}/finish` | `200`, session in `in_review` |
| `POST /sessions/{id}/resume` | `200`, session in `in_progress` |
| `PUT /sessions/{id}/scans/{scanId}/decision` | `200`, the decision row |
| `GET /sessions/{id}/exceptions.csv` | `200`, `text/csv` file `{reference}-exceptions.csv` |
| `GET /sessions/{id}/audit` | `200`, newest 40 audit rows for this session |

The decision body is `{ "action": "<sentence>", "decision": "approved" | "no_action" | null }`. The response is `{ "scan_id", "action", "decision", "decided_by", "decided_at" }`. `decided_by` is the display name. `decided_at` is an ISO 8601 timestamp. Both are null when `decision` is null.

The CSV columns are `barcode`, `title`, `call_number`, `outcome`, `message`, `action`, `decision`, `decided_by`, `decided_at`. One row per exception primary. `decided_by` is the user’s display name, empty when the decision is empty. `decided_at` is ISO 8601, empty when the decision is empty. A session with no exceptions returns the header row only.

The audit list includes session actions and scan actions for that session. Each item has `action`, `details`, `actor_name`, and `created_at`.

The session list filter accepts `in_review` and labels it “In review.” Scan search `q` matches barcode or title, case-sensitive contains, 1 to 80 characters. The scan list accepts `exceptions=1`, which returns primary scans whose outcome is not `verified`. An `outcome` value and `exceptions=1` together is `422` `invalid_search` with “That search is not valid.”

## Errors

| Case | Response |
|---|---|
| Finish when the status is not `in_progress` | `409` `session_not_scanning`. “Only a scanning session can be finished.” |
| Resume when the status is not `in_review` | `409` `session_not_in_review`. “Only a session in review can return to scanning.” |
| Scan while `in_review` | `409` `session_in_review`. “Return to scanning before recording a barcode.” |
| Decision while not `in_review` | `409` `session_not_in_review`. “Finish the session before reviewing exceptions.” |
| Decision for a missing scan, a verified scan, a duplicate, or another session | `404` `not_found`. “That inventory scan was not found.” |
| Action not one of the two sentences for that outcome | `422` `validation_error` on `action`. |
| Export while `draft` or `in_progress` | `409` `export_not_ready`. “Export is available after scanning is finished.” |

Cancel, missing session, missing department, and permission errors keep the sentences in the scanning spec.

## Audit

| Action | When |
|---|---|
| `inventory.session.finish` | Status becomes `in_review`. Details: `reference`. |
| `inventory.session.resume` | Status returns to `in_progress`. Details: `reference`. |
| `inventory.review.decide` | A decision row is saved. Details: `reference`, `barcode`, `action`, `decision`. `decision` is null when only the preset was saved. |
| `inventory.review.export` | A CSV is downloaded. Details: `reference`, `row_count`. |

`module` is `inventory`. `entity_id` is the session id for finish, resume, and export, and the scan id for a decision.

## Screens

Colors, type, and the staff shell stay on the current tokens: maroon, gold, and `font-display`. The prototype’s separate font files and sidebar are not added. Tap targets already required by the scanning spec stay at least 44px on the short side.

### Session page

`/inventory/[sessionId]` is one page.

The workstation header is the page heading. The list title is not repeated above it.

- Header. Reference and name, a status pill (Draft, In progress, In review, or Cancelled), library, and location. A null location reads “Whole library.” Draft shows Start scanning and Cancel session. `in_progress` shows Finish scanning and Cancel session. `in_review` shows Back to scanning and Cancel session. `cancelled` shows the status text Cancelled and no scanner.
- Stepper. Plan, Scan, Review, Submit, as defined above.
- Progress. “{seen} of {expected_count} expected items seen.” `seen` is the existing counter: verified, withdrawn, damaged, and other exception. The bar is `seen / expected_count`, or empty when the expected count is 0.
- Count cards. Expected, Verified, Not found, Misplaced, Unexpected, Damaged, Withdrawn, from the existing counters. Other exception and Duplicates are table filters, not extra cards.
- Scan panel. Mounted only in `in_progress`. The scanner field, Type barcode, sound, result, and “Checking Koha…” behave as in the scanning spec. There is no shelf menu, damaged checkbox, sample barcode, or simulate control.
- Scan table. Saved scans, 20 per page. Search matches barcode or title. Chips are All, Exceptions, Verified, Misplaced, Unexpected, Not found, Withdrawn, Damaged, Other exception, and Duplicate. Exceptions uses `exceptions=1`. The other outcome chips use the existing `outcome` parameter.
- Review. One row per exception primary. The preset menu, Approve, and No action are enabled only in `in_review`. Elsewhere the same rows are visible and the controls are disabled. Empty copy is “No exceptions to review.”
- Sidebar. The latest 12 scans. The audit list. Other sessions for this department, omitting the current one, each linking to its workstation. No accuracy percentage.

A zero expected count on a draft still shows “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”

### List and create

`/inventory` heading is “Inventory & Stocktaking.” The description is “Plan, scan, and review shelf checks against Koha item records. Item status changes stay in Koha.” The button reads “New stocktake” and links to `/inventory/new`. Search, status, columns, pagination, empty copy, and the Choose a department card stay.

`/inventory/new` keeps Name, Library, and Shelving location code, in a white card with the same maroon primary button. The location hint stays “Leave blank for the whole library. The code must match Koha exactly.”

## Testing

Service tests, with a fake Koha client, cover:

- Finish moves `in_progress` to `in_review` and writes `inventory.session.finish`. Finish from draft, cancelled, or `in_review` returns `session_not_scanning` and leaves the status unchanged.
- Resume moves `in_review` to `in_progress`, keeps decision rows, and writes `inventory.session.resume`. Resume from any other status returns `session_not_in_review`.
- A scan during `in_review` returns `session_in_review` and writes no scan. After resume, a scan is accepted.
- A decision saves for a non-verified primary only, and only during `in_review`. A verified scan, a duplicate, and another session’s scan return `not_found`.
- An action outside that outcome’s two sentences is `422`. Saving a new action clears `decision`, `decided_by`, and `decided_at`.
- Export returns the columns above for `in_review` and `cancelled`. Draft and `in_progress` return `export_not_ready`. Each download writes one `inventory.review.export` row.
- Cancel from `in_review` keeps scans and decisions.
- The session list accepts `in_review` and returns only the caller’s department.
- `exceptions=1` returns primary non-verified scans. Combining it with `outcome` is `invalid_search`.

Route tests cover finish, resume, decision, and export for a librarian, `403` `permission_denied` for a student, and `403` `csrf_failed` on finish, resume, and decision when the CSRF header is missing.

The device-queue tests are unchanged. The browser check confirms: Finish scanning hides the field, Back to scanning shows it again, Approve stays disabled until a preset is chosen, Export downloads the CSV, and a missing department on `/inventory` still shows “Choose a department” without requesting the session list.
