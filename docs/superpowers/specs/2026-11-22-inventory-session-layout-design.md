# Inventory session layout

Date: 2026-11-22
Status: approved

## Purpose

The inventory session page takes the composition of `plan/inventory.html`: a session card, a four-step stepper, a labeled progress bar, seven KPI cards, a wide main column, and a sidebar. The page uses the shared KPI card already used on Patrons.

This spec replaces the session-page layout in `docs/superpowers/specs/2026-11-21-inventory-workstation-design.md`. Statuses, decisions, the API, errors, audit, the scan queue, and Koha rules stay in that spec and in `docs/superpowers/specs/2026-11-21-inventory-scanning-design.md`. Where this spec and the workstation spec disagree about the session page layout, this spec wins.

## Decisions

- The page is still `/inventory/[sessionId]`. The list and the create form do not change.
- The staff shell stays. This page does not draw the prototype sidebar or top bar.
- The session card holds the heading, the status pill, the library line, the action buttons, the stepper, and the progress bar.
- The stepper labels are Plan, Scan, Review, and Submit. Plan is `draft`, Scan is `in_progress`, and Review is `in_review`. Submit is a label for the export action. It is not a status and it is not a button.
- Export exceptions stays a separate button. It is enabled in `in_review` and `cancelled`, and disabled in `draft` and `in_progress`.
- The seven counts use the shared KPI card. The numbers come from the existing counters.
- The scan table lists saved scans only. The barcode field is mounted only in `in_progress`.
- The sidebar holds Recent scans, Audit trail, and Other sessions. It has no accuracy percentage and no stocktake-history statistics.

## Out of scope

- Koha item writes.
- Rows for books that were never scanned.
- A shelf dropdown, a damaged checkbox, sample barcodes, and Simulate scans.
- A new API field, route, or status.
- Changes to `/inventory` or `/inventory/new`.
- A visual change to the four patron KPI cards.

## Page

`/inventory/[sessionId]` remains one page. Back to sessions stays above the card. The heading is the reference, a middle dot, and the session name. The list title is not repeated.

### Session card

The card shows the heading, a status pill, and one meta line. The pill reads Draft, In progress, In review, or Cancelled. The meta line is the library name and the location, separated by a middle dot. A null location reads “Whole library.”

The action buttons sit on the card:

| Status | Buttons |
|---|---|
| `draft` | Start scanning, Cancel session, Export exceptions disabled |
| `in_progress` | Finish scanning, Cancel session, Export exceptions disabled |
| `in_review` | Back to scanning, Cancel session, Export exceptions enabled |
| `cancelled` | The status text Cancelled, Export exceptions enabled |

The stepper sits inside the card. The current step uses a gold circle and a bold label. A completed step uses a maroon circle with a check. A later step uses a muted circle and its number. During `in_review`, Plan and Scan are completed, Review is current, and Submit stays a later step. On `cancelled`, every step uses the muted circle. None is current and none is checked.

Progress sits under the stepper. The label is “Scan progress”. The text is “{seen} of {expected_count} expected items seen · {n} scans”. `{seen}` is the existing counter: verified, withdrawn, damaged, and other exception. `{n}` is every saved scan row: those four, plus misplaced, unexpected, not found, and duplicates. One scan reads “1 scan”. The bar is `seen / expected_count`. The bar is empty when `expected_count` is 0.

### KPI cards

`KpiCard` moves from `apps/web/components/patrons/patron-kpis.tsx` to `apps/web/components/kpi-card.tsx`. Patrons and inventory both render it. Its props stay label, value, hint, icon, tone, and loading. The tones stay maroon, gold, blue, and red. The card stays a shadcn `Card` with an uppercase label, a `font-display` number, a hint, and a tinted Hugeicons chip.

The patron page passes the same four cards it passes today. Its labels, hints, icons, tones, and grid do not change.

The inventory row is `grid-cols-2`, `md:grid-cols-4`, and `xl:grid-cols-7`, with the same gap as the patron row. Each card uses one distinct icon from `@hugeicons/core-free-icons`. No new icon package is added.

| Label | Hint | Tone | Value |
|---|---|---|---|
| Expected | in this session | maroon | `expected_count` |
| Verified | matched the shelf | gold | `verified` |
| Not found | no Koha record | red | `not_found` |
| Misplaced | wrong shelf | blue | `misplaced` |
| Unexpected | outside this scope | maroon | `unexpected` |
| Damaged | needs repair | red | `damaged` |
| Withdrawn | found on the shelf | gold | `withdrawn` |

Other exception and Duplicates stay table filters. They are not cards.

### Columns

From the `lg` breakpoint, the main column takes two thirds and the sidebar takes one third. Below `lg`, the sidebar stacks under the main column. The page does not scroll sideways.

The main column, from top to bottom:

- The barcode card, only in `in_progress`. Its heading is “Scan barcodes”. The field, Type barcode, sound, result, and “Checking Koha…” stay as they are. SessionView owns this card.
- On a draft whose `expected_count` is 0, the sentence “Koha returned no items for this library and location. You can still start and record unexpected barcodes.”
- Scans. The heading is “Scans”. The description is “Saved barcodes compared with Koha item records.” Search, chips, page size, and empty copy “No scans yet.” stay as they are.
- Exception review. The heading is “Exception review”. Rows, the preset menu, Approve, No action, and the saved-choice line stay as they are. Empty copy stays “No exceptions to review.” There is no control that writes to Koha.

The sidebar headings are Recent scans, Audit trail, and Other sessions. Recent scans still shows the latest 12 scans, barcode and outcome label. Audit trail still shows the newest 40 rows. Other sessions still shows the first five other sessions for the department, each linking to its workstation. Empty copy stays “No scans yet.”, “No audit entries yet.”, and “No other sessions.” The recent-scans error reads “Recent scans could not be loaded.”

## Components

SessionView loads the session, the scan list, the exception list, and the three sidebar queries. It owns the scan queue and the session actions: start, finish, resume, cancel, and export. The section files receive data and callbacks. They do not load the session.

| File | Renders |
|---|---|
| `apps/web/components/kpi-card.tsx` | The shared KPI card |
| `apps/web/components/inventory/session-card.tsx` | Heading, pill, meta line, action buttons |
| `apps/web/components/inventory/session-stepper.tsx` | Plan, Scan, Review, Submit |
| `apps/web/components/inventory/session-progress.tsx` | Progress label, text, and bar |
| `apps/web/components/inventory/inventory-kpis.tsx` | The seven inventory cards |
| `apps/web/components/inventory/scans-panel.tsx` | Saved scans, search, and chips |
| `apps/web/components/inventory/exception-review.tsx` | Exception rows. A row still saves its own decision |
| `apps/web/components/inventory/session-sidebar.tsx` | Recent scans, Audit trail, Other sessions |
| `apps/web/components/inventory/session-view.tsx` | Composes the sections and owns the barcode card |

## Testing

No API test is added. The existing inventory service and route tests stay as they are. The existing web unit tests stay as they are.

The patron directory still shows its four KPI cards.

The browser check covers draft, `in_progress`, `in_review`, and `cancelled` on the session page:

- The stepper, progress text, seven KPI cards, and sidebar are present.
- The barcode field is present only in `in_progress`.
- Approve stays disabled until a preset is chosen, and only during review.
- Export exceptions downloads `{reference}-exceptions.csv` in `in_review` and `cancelled`, and stays disabled before that.
- At `lg` and wider, the sidebar sits beside the main column. Below `lg`, it stacks, and the page does not scroll sideways.
