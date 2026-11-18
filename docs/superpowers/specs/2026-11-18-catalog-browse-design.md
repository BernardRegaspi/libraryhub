# Catalog browse page

Date: 2026-11-18
Status: approved

## Purpose

Signed-in staff and students open Catalog on the live Koha collection and narrow it by search, letter, copy filters, and publication year. Koha remains the authority for bibliographic records, items, and availability. The ULMS does not copy the catalog.

This spec changes the Catalog page described in `docs/superpowers/specs/2026-11-17-catalog-search-design.md`. Record detail, cover proxying, barcode permission, and the saved-search table stay as that spec defines them. The marketing site is unchanged.

## Decisions

- `/catalog` loads page 1 of titles with no typed query. Sort is title ascending.
- A letter is a title-prefix constraint on the same search request. ALL clears only the letter.
- The alphabet is A–Z and ALL. Titles that start with a number or symbol appear when no letter is selected.
- The search card follows the layout in `plan/prototype2.html`: icon field, selects on one row, an advanced panel, and a footer. Dropdowns are the app’s shadcn Select.
- Advanced search contains author, publisher, and publication year. Availability and library are selects on the top row.
- Availability and library match copy facts. Koha cannot page titles by those facts, so those two filters use a bounded biblio window and omit the total.
- Recent and saved searches stay in the API. This page does not list, save, or delete them.
- The active color is the ULMS maroon `#7d1519`. The Libib screenshot is a layout reference. Its teal is not used.

## Page

The module header stays in the staff shell. The eyebrow is Library. The title is Catalog. The description is “Browse and search the university catalog. Records come from Koha.” The Open Koha OPAC action renders only when config provides `opac_url`.

Below the header, one column fills the content width. Recent searches and saved searches are not rendered.

1. Search card.
2. Toolbar: the heading Catalog, the total when it is a number, and Cover / List.
3. Alphabet.
4. The current page of books.
5. Pager.

Cover is the default. List keeps the current row: title, author, edition, ISBN, item type, publication year, and availability, each omitted when null. Switching Cover and List does not change the page.

Desktop shows five covers in a row, a tablet three or four, and a phone two. The toolbar wraps. The alphabet scrolls horizontally.

## Search card

The card matches the prototype: white surface, 16px padding, icon in the query field, controls in one row from the large breakpoint up, and a footer with the count on the left and Advanced search on the right.

The query placeholder is “Search by title, author, ISBN, or keyword…”. The query runs on Enter and when the field blurs. Changing a select runs the search immediately. There is no separate Search button.

Selects, in order:

| Select | Options |
|---|---|
| Field | Keyword, Title, Author, ISBN, Barcode |
| Availability | Any availability, Available now, All copies on loan |
| Library | Any library, then Koha library names |
| Sort | Title A–Z, Title Z–A, Author A–Z, Author Z–A |

Each select is `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem` from `apps/web/components/ui/select.tsx`. `SelectContent` sets `alignItemWithTrigger` to false. The trigger receives a height class so it matches the query input. The menu is the component’s portaled popup, so opening it does not add space inside the card.

Advanced search is closed on arrival. Opening it shows four fields in one row on a wide screen, stacked on a narrow screen:

- Author contains
- Publisher
- Year from
- Year to

Year from and Year to render only when `year_filter` is true. It is true in the current allowlist, with `copyright_date` as the year column. Author and publisher run on Enter and on blur. Labels use the prototype’s uppercase muted style.

The footer count is “{total} records found” when `total` is a number. When `total` is null, that text is omitted. The gap from the query row to the advanced divider is 12px.

The library select loads `GET /catalog/libraries`. If that request fails, the select stays on Any library and is disabled. The rest of the page still loads.

## Alphabet and books

The strip lists A through Z and then ALL. ALL is the state with no `letter`. The selected value uses maroon. Every letter stays enabled. Choosing a letter with no matches shows the empty state. The strip scrolls horizontally when it overflows.

When sort is title, the current page is split into consecutive groups that share a first letter. Each group has that letter as a heading and a light divider. *The Hobbit* is under T. A title whose first character is not A–Z stays in sort order and has no letter heading. Author sort is one grid with no letter headings. A selected letter produces one heading, that letter.

A cover card shows the cover, the title clamped to two lines, and the author. The whole card links to `/catalog/{biblioId}` with the current search query string. A missing `has_cover` renders a muted 3:4 block and does not request `/cover`. A cover image uses `object-fit: cover`. Hover shifts the card up slightly and adds a light shadow.

The toolbar count uses the same `total` as the search footer. A null total omits the number. The empty sentence is “No records matched this search.” Loading replaces the grid with “Loading the catalog.” and does not clear the form.

## Pager

The pager uses the shadcn components `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, and `PaginationEllipsis`, added at `apps/web/components/ui/pagination.tsx`.

When `total` is a number, the page count is `ceil(total / per_page)`. Seven or fewer pages are all shown. More than seven pages show the first page, an ellipsis, the current page with its immediate neighbors, an ellipsis, and the last page. Near the start, the pager shows pages 1–4, an ellipsis, and the last page. Near the end, it shows page 1, an ellipsis, and the last four pages. Previous is disabled on page 1. Next is disabled on the last page.

When `total` is null, the pager renders Previous and Next only. Previous is disabled on page 1. Next is disabled when `has_next` is false.

Changing the query, field, letter, sort, direction, year, author, publisher, availability, or library sets `page` to 1. Page size stays 10, 20, or 40, default 20, and this page does not add a page-size control.

## Search request

`GET /api/v1/catalog/search` remains the only biblio query. `q` may be empty. An empty browse sends Koha `_page`, `_per_page`, and `_order_by` and omits Koha `q`.

New parameters:

| Parameter | Rule |
|---|---|
| `letter` | Optional. One of A–Z, case-insensitive, stored uppercase. Absent means ALL. |
| `author` | Optional. Trimmed, 1–200 characters, no C0 or DEL controls. Author contains this text. |
| `publisher` | Optional. Same length and character rules. Publisher contains this text. |
| `availability` | Omitted or `any`, `available`, or `on_loan`. |
| `library` | Omitted, or a library id returned by `GET /catalog/libraries`. |

`q`, `field`, `page`, `per_page`, `sort`, `direction`, `year_from`, and `year_to` keep their current rules, except `q` may be empty. A non-empty `q` is still 1–200 characters with the same control-character rejection. Barcode still rejects a value longer than 32 characters. `sort` on this page is `title` or `author`. The API still accepts `copyright_date` for other clients. The page parser rewrites `copyright_date` to title ascending so the sort control always matches the request.

A letter becomes `{title: {-like: "A%"}}` after the usual like-escaping. Author and publisher use surrounding wildcards, `%<text>%`. The biblio `q` object is an `-and` of whichever of these exist: the current field clause, the letter clause, the author clause, the publisher clause, and the year clause. Keyword remains title or author. The field clause is omitted when `q` is empty.

Barcode search sends `external_id` and loads that biblio, as it does today. Letter, author, publisher, year, availability, and library are not applied.

Available now keeps a record whose `available_count` is greater than 0. All copies on loan keeps a record whose `copy_count` is greater than 0 and whose `available_count` is 0. A library keeps a record that has a copy with that `home_library_id`. Any availability and an empty library skip this step.

When either item filter is active, ULMS page 1 reads Koha pages 1 through 5, ULMS page 2 reads Koha pages 6 through 10, and each later ULMS page reads the next five Koha pages. Reading stops early when a Koha page is short. Every record that passes the copy filter in that window is returned, in that order. One ULMS page therefore holds at most five Koha pages of matches, which may be fewer or more than `per_page`. The window does not stop at `per_page`, because the next ULMS page starts after these five Koha pages and would otherwise skip the rest. `total` is null. `has_next` is true when another biblio page exists after the window: with `X-Total-Count`, the last Koha page read is below the last page; without it, the last Koha page read returned `per_page` biblios. Item filters that are both inactive keep the current one-page Koha read, including `X-Total-Count`.

The response keeps its current fields and adds `letter`, `author`, `publisher`, `availability`, and `library`. An unused letter, author, publisher, or library is null. `availability` is null when it is `any` or omitted.

A recent-search row is written only when `q` is non-empty. Letter-only, author-only, publisher-only, and empty browses write nothing. Saved-search routes are unchanged and are not called by this page.

`GET /api/v1/catalog/libraries` requires `catalog.view` and returns `[{ "id", "name" }]`, sorted by name, from the Koha library list cached for 10 minutes. College Library is one such name when Koha returns it. ULMS departments are not this list. A Koha failure uses the existing catalog unavailable and timeout responses.

An unknown `library` id, a bad `availability`, a bad `letter`, or an author or publisher that fails the length rules returns 422 `invalid_search` with “That search is not valid.”

## Failures

The existing catalog messages stay: unavailable, timeout, invalid search, missing permission, and not found. The OPAC link in a failure panel appears only when `opac_url` is set, opens in a new tab, and says the destination is the Koha OPAC. Retry repeats the current URL. A failed search leaves the URL as submitted.

## Components

| Piece | Owns |
|---|---|
| `catalog-browser.tsx` | URL state, config, libraries, and search queries. |
| `catalog-search-card.tsx` | Query, selects, advanced fields, footer count. |
| `catalog-alphabet.tsx` | A–Z and ALL. |
| `catalog-results.tsx` | Letter groups, cover cards, list rows, empty and loading lines. |
| `catalog-pagination.tsx` | Numbered pager, or Previous and Next when `total` is null. |
| `lib/catalog/search-params.ts` | Parse and serialize the new parameters. |
| Catalog service and `koha/query.py` | Query composition, the five-page item-filter window, recent-search rule. |
| `GET /catalog/libraries` | Library id and name list. |

`apps/web/components/ui/pagination.tsx` is the shadcn pagination component. No other module’s layout changes.

## Tests

Pytest, with the existing Koha mock transport:

- An empty `q` requests `/biblios` with page, page size, and order, and without `q`.
- `letter=M` sends title `-like` `M%`.
- A keyword plus a letter sends both clauses under `-and`.
- Author and publisher send contains clauses and respect the 200-character limit.
- A barcode search ignores letter, author, publisher, year, availability, and library.
- Available now and a library id keep only matching hits, read at most five Koha pages for one ULMS page, and return every match in that window.
- That response has `total: null`. `has_next` is true only when another biblio page exists after the window.
- An unknown library id returns 422.
- An empty `q` does not write a recent-search row. A non-empty `q` still does.

`lib/catalog/search-params.test.ts` covers `letter`, `author`, `publisher`, `availability`, and `library`, including a `copyright_date` sort becoming title ascending.

The browser check, after the API is running, covers the first page, a letter, a keyword combined with a letter, author and publisher, Cover and List, the record link and the back link, the empty state, and a narrow viewport.

## Out of scope

- A “#” bucket, call-number search, and subject search.
- Filing titles under a letter after dropping a leading article.
- Disabling letters that have no books before they are selected.
- Showing, saving, or deleting recent and saved searches on this page.
- Filling `library_departments.koha_branchcode`, or listing ULMS departments in the library select.
- A local bibliographic index, a page-size control, and a year sort in the sort select.
- Changes to record detail, circulation, or the marketing site.
