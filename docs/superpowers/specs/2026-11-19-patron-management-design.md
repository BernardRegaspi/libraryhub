# Staff patron management

Date: 2026-11-19
Status: pending review

## Purpose

Authorized staff search and open Koha patron records, and Super Administrators and Library Administrators create and update those records. Koha remains the patron authority. ULMS stores permissions and audit rows. It does not store a copy of the patron.

The student portal stays the current placeholder. Student sign-in, account linking, and self-service wait for a later pilot.

The page follows the Patron Management layout in `plan/prototype2.html` and the staff shell’s existing components.

## Decisions

- Audience for search and detail is a signed-in user with `patrons.view`: Librarian, Department Head, Library Administrator, and Super Administrator.
- Create and update require `patrons.create` and `patrons.update`. Those permissions, plus `patrons.sensitive.view`, belong to Super Administrator and Library Administrator only.
- Date of birth, primary address, and staff notes require `patrons.sensitive.view`. The directory never includes them.
- Search matches surname, first name, preferred name, card number, and userid. Card number is shown on the directory. Userid is shown on the detail page. Neither field is labeled as a student number.
- Patrons who share a name stay separate rows. The module has no merge action.
- Library scope is every Koha library, with an optional library filter. ULMS department assignments do not hide patrons while `library_departments.koha_branchcode` is unset. This module does not fill those branch codes.
- Delete, suspend, fines, extended attributes, password changes, and the public Koha patron routes are unused.
- Loans and holds are read-only. Checkout and hold placement stay in later modules.
- The browser never calls Koha. Client id, client secret, and bearer token stay on the API server and out of logs.

## Koha capabilities

Recorded on 2026-11-19 from the configured staff host’s OpenAPI document. The document identifies Koha `25.06.00`. The API client already authenticates with `POST /api/v1/oauth/token` and `grant_type=client_credentials`.

| Operation | Koha permission named by the spec | Use |
|---|---|---|
| `GET /patrons` | `borrowers` / `list_borrowers` | Directory. Supports `q`, field filters, `_page`, `_per_page`, `_order_by`, and `X-Total-Count`. |
| `GET /patrons/{patron_id}` | `list_borrowers` or `edit_borrowers` | Detail. |
| `POST /patrons` | `borrowers` / `edit_borrowers` | Create. Required body properties are `surname`, `library_id`, and `category_id`. |
| `PUT /patrons/{patron_id}` | `borrowers` / `edit_borrowers` | Update, after a server-side merge. |
| `GET /patrons/{patron_id}/checkouts` | circulate or `view_checkout_history` | Current loans. |
| `GET /patrons/{patron_id}/holds` | `edit_borrowers` and `view_holds_history` | Holds. |
| `GET /patron_categories` | `parameters` / `manage_patron_categories` | Category labels and the category filter. |
| `GET /libraries` | already used by the catalog client | Library labels and the library filter. |

`DELETE /patrons/{patron_id}` exists on this host and is unused. `POST /patrons` accepts `x-confirm-not-duplicate`. ULMS sends that header only after an administrator confirms a duplicate.

Patron list objects on this host include `patron_id`, `firstname`, `surname`, `preferred_name`, `cardnumber`, `userid`, `email`, `phone`, `mobile`, `category_id`, `library_id`, `date_enrolled`, `expiry_date`, `date_of_birth`, address fields, `staff_notes`, `expired`, `restricted`, and `patron_card_lost`. `checkouts_count` and `overdues_count` are embed fields, requested with `x-koha-embed`. Counts that are absent in the JSON stay unavailable. A present `0` is zero.

On the day of this check the host had 17608 patrons, 15 categories, and 6 libraries (`CPL`, `UCL`, `GL`, `GradeL`, `JL`, `SL`). Two libraries are both named College Library. Checkout and hold lists were empty. The UI treats an empty list as empty. It does not assume those totals.

Category names, library names, and status labels come from Koha responses. They are not hardcoded.

## Architecture

```text
Browser (staff shell, session cookie)
  -> Next.js /api/v1 rewrite
    -> FastAPI /api/v1/patrons
      -> patron service (permission, allowlist, query, audit)
        -> existing Koha client (OAuth client credentials)
        -> existing audit_logs table
```

| Piece | Owns |
|---|---|
| Koha client | Token, timeouts, patron list, one patron, create, update, checkouts, holds, categories, libraries. No ULMS rules. |
| Patron service | Query building, pagination, field stripping, create/update overlay, audit. |
| Patron routes | `/api/v1/patrons`, validation, session, CSRF on writes. |
| `/patrons` and `/patrons/[id]` | Directory, detail, and admin forms. |
| Student page | Stays the current placeholder. No patron API for `student.view`. |

Category and library label lists may be cached in the Koha client process for 10 minutes, the same way library names already are. Patron pages, loans, and holds are never cached.

Logs include the path template, HTTP status, and duration. They omit the query string, patron fields, the Authorization header, and the token.

## Permissions

A new Alembic revision adds three permissions and grants them to Super Administrator and Library Administrator only.

| Code | Who receives it | Allows |
|---|---|---|
| `patrons.view` | Unchanged: Librarian, Department Head, Library Administrator, Super Administrator | Search, directory, detail contact fields, loans, holds. |
| `patrons.sensitive.view` | Super Administrator, Library Administrator | Date of birth, primary address, and staff notes on detail, create, and update. |
| `patrons.create` | Super Administrator, Library Administrator | Create a patron. |
| `patrons.update` | Super Administrator, Library Administrator | Update a patron. |

Student and Auditor receive none of these. A missing permission is `403` `permission_denied` with no patron fields in the body. Hiding a button is not the authorization check.

`catalog.barcode.view` still controls item barcodes on loan rows. Holding `patrons.view` does not grant it.

## HTTP API

All routes sit under `/api/v1/patrons`. They require a valid session and `patrons.view` unless a row below names a write permission. Writes require the existing CSRF check. Error bodies use `detail.code` and `detail.message`. Write validation may also include `detail.fields`, a list of `{ name, message }`.

| Method | Path | Permission | Behavior |
|---|---|---|---|
| `GET` | `/` | `patrons.view` | One page of patrons. |
| `GET` | `/options` | `patrons.view` | Category and library choices for the filters. Registered before `/{patron_id}`. |
| `GET` | `/{patron_id}` | `patrons.view` | One patron, stripped to the caller’s field set. |
| `GET` | `/{patron_id}/checkouts` | `patrons.view` | That patron’s loans. |
| `GET` | `/{patron_id}/holds` | `patrons.view` | That patron’s holds. |
| `POST` | `/` | `patrons.create` | Create. |
| `PUT` | `/{patron_id}` | `patrons.update` | Update the allowlisted fields. |

`patron_id` is a positive integer. Any other path value is `404` `not_found`.

### Search request

| Parameter | Rule |
|---|---|
| `q` | Optional. Trimmed. Empty browses the first page. A non-empty value is 1–80 characters. Reject C0 and DEL control characters. |
| `category_id` | Optional. Sent to Koha only when it is one of the category ids Koha returned. When the category list cannot be loaded and this parameter is present, the response is `503` `patrons_unavailable`. |
| `library_id` | Optional. Sent to Koha only when it is one of the library ids Koha returned. When the library list cannot be loaded and this parameter is present, the response is `503` `patrons_unavailable`. |
| `status` | Optional. `active`, `expired`, or `restricted`. |
| `page` | Integer from 1 through 10000. Default 1. |
| `per_page` | Integer from 1 through 50. Default 20. The page requests 20. |
| `sort` | `surname`, `firstname`, `cardnumber`, `category_id`, or `expiry_date`. Default `surname`. |
| `direction` | `asc` or `desc`. Default `asc`. |

An out-of-range parameter is `422` `invalid_search` with the message “That search is not valid.”

The service builds one Koha `q` object. An empty `q` adds no text clause. Like-patterns reuse `escape_like` from the catalog query helper. Words are the trimmed text split on whitespace. A single word becomes an `-or` of `surname`, `firstname`, `preferred_name`, `cardnumber`, and `userid`, each `-like` with surrounding wildcards. Several words become an `-or` of two branches: an `-and` that requires every word to match `surname`, `firstname`, or `preferred_name`, and an `-or` of `cardnumber` and `userid` against the whole trimmed string. Category and library are exact keys on the same object. `active` adds `expired` 0 and `restricted` 0. `expired` adds `expired` 1. `restricted` adds `restricted` 1. Card lost is a badge, not a status filter. A patron may carry more than one flag and appears under each matching filter.

Koha receives `_page`, `_per_page`, and `_order_by`. Descending sorts prefix the field with `-`. The list request also sends `x-koha-embed: checkouts_count,overdues_count`. `total` is the integer `X-Total-Count` header when present, otherwise null. `has_next` is true when `total` says another page exists, or, when `total` is null, when the page is full.

### Directory item

Each item contains `patron_id`, `firstname`, `surname`, `preferred_name`, `cardnumber`, `category_id`, `category_name`, `library_id`, `library_name`, `expiry_date`, `expired`, `restricted`, `patron_card_lost`, `checkouts_count`, and `overdues_count`.

`category_name` and `library_name` are null when the label cache has no entry. The UI then shows the id. `checkouts_count` and `overdues_count` are JSON `null` when Koha omits the keys. A returned number, including `0`, is shown as that number.

The directory item omits email, phone, userid, date of birth, address, and staff notes.

### Options

`GET /options` returns `{ categories: [{ id, name }], libraries: [{ id, name }] }`. A failure to load one list sets that list to null and still returns the other. The directory request does not fail because options failed.

### Detail

`GET /{patron_id}` returns the directory fields plus `userid`, `email`, `phone`, `mobile`, and `date_enrolled`. When the caller has `patrons.sensitive.view`, it also returns `date_of_birth`, `address`, `address2`, `city`, `state`, `postal_code`, `country`, and `staff_notes`. Callers without that permission do not receive those keys.

Opening this route writes one audit row.

### Loans

`GET /{patron_id}/checkouts` returns `{ status: "ok", items: [...] }` or `{ status: "unavailable" }`.

An ok item contains `checkout_id`, `item_id`, `title`, `checkout_date`, `due_date`, `renewals_count`, and `overdue`. `title` is null when the item embed has no title. `external_id` is included only when the caller has `catalog.barcode.view`.

The title is taken from the embedded item biblio title. The request asks Koha for that embed. A missing title stays null.

`overdue` is true when `due_date` is present, the checkout has no check-in date, and the calendar date of `due_date` in `Asia/Manila` is before today’s date in `Asia/Manila`.

An empty `items` array is an empty loan list. A Koha error, including a permission failure on the checkout route, sets `status` to `unavailable` and omits `items`. The patron detail response is unchanged.

### Holds

`GET /{patron_id}/holds` returns `{ status: "ok", items: [...] }` or `{ status: "unavailable" }`.

An ok item contains `hold_id`, `status`, `hold_date`, `waiting_date`, `expiration_date`, `pickup_library_id`, `pickup_library_name`, `biblio_id`, and `title`. `title` is null when the biblio embed has no title. `pickup_library_name` is null when the library cache has no entry.

The same unavailable rule used for loans applies here. Past holds are not requested. The Koha `old` flag is left off.

### Create and update

The write body accepts only:

| Field | Rule |
|---|---|
| `surname` | Required on create. On update, present values cannot be blank. Maximum 255 characters. |
| `firstname`, `preferred_name`, `cardnumber`, `userid` | Optional. Maximum 255 characters. Blank clears the field on update. |
| `email` | Optional. Blank, or one address with a single `@` and no spaces. Maximum 255 characters. |
| `phone`, `mobile` | Optional. Maximum 64 characters. |
| `library_id` | Required on create. Must be a library id Koha returned. |
| `category_id` | Required on create. Must be a category id Koha returned. |
| `expiry_date`, `date_of_birth` | Optional. `YYYY-MM-DD`, or blank to clear on update. |
| `address`, `address2`, `city`, `state`, `postal_code`, `country` | Optional. Maximum 255 characters. |
| `staff_notes` | Optional. Maximum 1024 characters. |
| `confirm_duplicate` | Optional boolean on create. Default false. Ignored on update. |

`date_of_birth`, the address fields, and `staff_notes` require `patrons.sensitive.view`. A write that includes any of them without that permission is `403` `permission_denied`, and Koha is not called.

Unknown fields are rejected with `422` `validation_error`.

Create sends only the allowlisted Koha properties. Update loads the current patron, overlays the allowlisted keys present in the request, and `PUT`s that merged object. Keys absent from the request stay as Koha returned them. The browser cannot replace the Koha record with a partial object.

On create, `confirm_duplicate: false` omits `x-confirm-not-duplicate`, and `true` sends that header. The OpenAPI document attaches the header to `POST /patrons` only, so update never sends it. A Koha `409` on create becomes `409` `patron_duplicate`. The client sets `confirm_duplicate: true` only after the administrator confirms that dialog. A Koha `409` on update also becomes `409` `patron_duplicate`, and the dialog asks for a different card number or userid.

There is no suspend flag and no delete route.

A successful write returns the same detail object `GET /{patron_id}` would return for that caller, and writes one audit row.

## Audit

The existing `audit_logs` table records:

| Action | When | `details` |
|---|---|---|
| `patrons.detail` | A detail response is returned | `{ "sensitive": true }` or `{ "sensitive": false }` |
| `patrons.create` | Koha accepts the create | `{ "fields": ["surname", ...] }` listing Koha properties that were sent, excluding `confirm_duplicate` |
| `patrons.update` | Koha accepts the update | `{ "fields": [...] }` listing keys that changed |

`module` is `patrons`. `entity_type` is `patron`. `entity_id` is the Koha patron id. The row stores the staff user id. Field values are not stored. Search requests are not audited. A Koha failure writes no success row.

## Web UI

`/patrons` keeps the `patrons.view` gate. The page uses `ModuleFrame` with `hideModuleSentence`. The eyebrow is Library. The title is Patron Management. The description is “Search Koha patron records by name, card number, or userid. People who share a name stay separate records. Records are never merged.”

Super Administrator and Library Administrator see an Add patron button. The search guidance is “Name, card number, or userid”. Category, library, and status selects sit with the search, plus a reset control that clears the text and the filters. The Koha total is one summary line. The prototype’s four stat cards are omitted because student, faculty, and fines totals are outside this module.

The table columns are Patron, Category, Library, On loan, Overdue, Expiry, and Status. Patron shows initials and the display name, with the card number on the second line. The display name is `preferred_name` when that value is not blank, otherwise `firstname` and `surname` joined by a space with blanks skipped. When that result is blank, the name is the card number, then `Patron` plus the patron id. Initials are the first character of the first two words of the display name. A single word uses its first two characters. Category and the status flags are badges. A patron can show Expired, Restricted, and Card lost together. When none of those flags is set, the badge is Active. The Library column is hidden below the `md` breakpoint. On loan and Overdue show the embedded counts, or the word Unavailable when the value is null.

A row opens `/patrons/[id]`. The row menu contains View, and Edit when the caller has `patrons.update`. The query, filters, sort, and page are in the URL. The search box waits 300ms after typing before it changes the URL. Pagination uses the existing pagination component.

`/patrons/[id]` shows initials, the display name, category, library, and status badges, then three summaries counted from the loan and hold responses: loan items, overdue loan items, and hold items. An unavailable section shows Unavailable in its summary. Personal information and library account are two sections. Loans and holds are tables. A null title is shown as “Title unavailable” together with the Koha item id or biblio id. Edit and Add patron open one dialog. The dialog lists the allowlisted fields. Sensitive fields appear in that dialog only for `patrons.sensitive.view`. Save asks for confirmation, then disables the button until the request finishes. A duplicate response on create leaves the dialog open and asks the administrator to confirm before sending `confirm_duplicate: true`. A duplicate response on update leaves the dialog open and asks for a different card number or userid.

The first load uses skeletons. An empty directory says no patrons matched and keeps the search text. A failed directory or detail request shows the error message and a retry that repeats the current URL. A null category or library list shows that filter as unavailable. A loan or hold section that is `unavailable` has its own retry. On a narrow screen the filters stack and the extra columns collapse.

The student route and its placeholder copy stay as they are.

## Errors

| Situation | Result |
|---|---|
| Koha is not configured, the connection fails, authentication fails, or the body is unexpected | `503` `patrons_unavailable`. “Patron records are unavailable. Try again.” |
| Koha exceeds the timeout | `504` `patrons_timeout`. “Patron records took too long to respond. Try again.” |
| The patron id is unknown to Koha | `404` `not_found`. “That patron was not found.” |
| The session lacks the route’s permission | `403` `permission_denied`. |
| Create or update is missing a valid CSRF header | Existing `403` `csrf_failed`. |
| Search parameters are outside the allowlist | `422` `invalid_search`. “That search is not valid.” |
| A write field fails ULMS validation | `422` `validation_error` with `detail.fields`. |
| Koha rejects the write | `422` `patron_rejected`. “Koha did not accept the patron record.” Koha property paths that name an allowlisted field are copied into `detail.fields`. |
| Koha returns `409` on create or update | `409` `patron_duplicate`. |

The response never includes the Koha body, a token, or a credential. An empty search page, loan list, or hold list is `200` with an empty collection. A missing route or a `403` from Koha on the patron list or detail becomes `patrons_unavailable`. The same Koha failure on loans or holds becomes that section’s `unavailable` status. The UI does not substitute sample patrons.

## Testing

Automated tests never call the live Koha host.

API unit tests, with a fake Koha transport, cover:

- Name words, the whole-string card number and userid match, `escape_like`, category, library, status, sort, page, and page size.
- Directory field stripping. Librarian detail includes contact fields and excludes sensitive fields. Admin detail includes sensitive fields.
- Loan `external_id` only when `catalog.barcode.view` is held.
- Update overlay: the merged body changes allowlisted keys and keeps every other key from the Koha `GET`.
- Create with `confirm_duplicate: false` omits the Koha confirm header. `true` sends it. Update never sends the header.
- A failed loan or hold call becomes `unavailable`. A missing embed count stays null. An empty list stays empty.

API route tests, with the existing session fixtures, cover:

- Librarian and Department Head can search and open a detail. Create, update, and sensitive fields return `403`.
- Super Administrator and Library Administrator can create and update.
- Student and Auditor receive `403` on every patron route.
- A write without the CSRF header returns `csrf_failed`.
- Koha connection, timeout, and unknown-patron responses map to `patrons_unavailable`, `patrons_timeout`, and `not_found`.
- Detail, create, and update each write one audit row whose details contain no field values.
- The migration grants the three new permissions to Super Administrator and Library Administrator only.

Web tests use `node --test` for the patron URL parser, the display name, the status badges, and the Manila overdue check. Page states are exercised in the browser during implementation. This app has no component test runner.

## Student pilot boundary

This MVP adds no student patron route and no link table. A staff session cannot act as a student by supplying a patron id.

When a later pilot is approved, ULMS adds `patron_links` in PostgreSQL. The row stores the ULMS user id, the Koha patron id, the identifier type and value used for the match, a status of `pending_review`, `linked`, `rejected`, or `correction_requested`, and the staff user who reviewed it. A user has at most one `linked` row. A Koha patron has at most one `linked` row. Koha remains the patron record.

The pilot starts after the institution names one stable identifier. One exact match on that identifier can be linked. Several matches, or a match on the name alone, stay `pending_review`. That workflow does not create a second Koha patron for an ambiguous match. Correcting a link is an administrator action on the link row and an audit entry.

Student requests, once enabled, load the Koha patron id from the signed-in user’s `linked` row. A patron id in the query or body is ignored. The student can read their own profile, status, loans, and holds, and can submit a correction request. Contact updates wait until the institution names the allowed fields and Koha accepts those fields.

## Out of scope

- Patron delete, merge, and suspend.
- Fines, account balances, and payments.
- Checkout, check-in, renewal, and placing or cancelling holds.
- Extended patron attributes and a university student-number label.
- Filling `koha_branchcode` or filtering patrons by ULMS department.
- Student sign-in, `patron_links`, and the student self-service portal.
