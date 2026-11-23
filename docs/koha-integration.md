# Koha integration

ULMS reads bibliographic data from Koha over the staff REST API. Koha remains the system of record; ULMS does not mirror the catalog in PostgreSQL.

## Endpoints and authentication

- ULMS calls the staff REST API at `KOHA_BASE_URL` and appends `/api/v1` when the value does not already end with that suffix.
- Authentication is `POST /oauth/token` with `grant_type=client_credentials`, using `KOHA_CLIENT_ID` and `KOHA_CLIENT_SECRET` from configuration.
- The public OPAC origin is `KOHA_OPAC_URL` and may be empty. When empty, the UI does not show OPAC links.
- `KOHA_API_USERNAME` and `KOHA_API_PASSWORD` are not used. Staff username and password are not used.

The browser never calls Koha directly. Tokens and client secrets stay on the API server.

## Search fields and filters

Until a live biblio key check changes the allowlist in `apps/api/app/integrations/koha/allowlist.py`, the default searchable fields are:

| Field | Rule |
|---|---|
| `keyword` | Labeled **Keyword (title or author)**. Koha `q` uses title and author together. |
| `title` | Title search. |
| `author` | Author search. |
| `isbn` | ISBN search. |
| `barcode` | Item barcode lookup. |

Default sorts are title, author, and publication year (`copyright_date` on this Koha host), ascending title by default. `year_filter` is true with `copyright_date` as the biblio year column. `subject` is omitted as a result-set filter until a subject column appears on biblio JSON.

Library name, item type, availability wording, and subject headings on copies are **copy facts** returned from Koha items or MARC on the detail page. Availability and library filter the current five-page biblio window by copy facts; author, publisher, and title prefix filter the biblio `q`. Subject remains omitted.

Item barcodes (`external_id` on copies) require the ULMS permission `catalog.barcode.view`. The API strips barcodes for callers without that permission.

## Live field check

Run from `apps/api`:

```bash
python -m app.scripts.koha_fields
```

The script requests `GET /biblios?_per_page=1` with a bearer token and prints sorted JSON keys from the first record only (no titles, barcodes, or other values).

```
keys: abstract,age_restriction,author,biblio_id,cn_class,cn_item,cn_sort,cn_source,cn_suffix,collection_issn,collection_title,collection_volume,copyright_date,creation_date,ean,edition_statement,framework_id,illustrations,isbn,issn,item_type,lc_control_number,material_size,medium,notes,number,opac_suppressed,pages,part_name,part_number,publication_place,publication_year,publisher,serial,serial_total_issues,series_title,subtitle,timestamp,title,uniform_title,url,volume,volume_date,volume_description
year-field: copyright_date
```

Search fields remain `keyword`, `title`, `author`, `isbn`, and `barcode` because `title`, `author`, and `isbn` are present on the sample record.

## Patrons

Patron records stay in Koha. ULMS does not mirror patrons in PostgreSQL.

The browser calls ULMS only: `/api/v1/patrons` for search, detail, create, and update; `/api/v1/patrons/summary` for the directory counts; `/api/v1/patrons/{id}/checkouts` and `/api/v1/patrons/{id}/holds` for activity; `/api/v1/patrons/{id}/account` for the balance shown on a patron; and `/api/v1/patrons/options` for library and category pick lists. The API server calls the Koha staff REST API at `GET/POST /patrons`, `GET/PUT /patrons/{id}`, `GET /patrons/{id}/account`, `GET /patrons/{id}/checkouts`, `GET /patrons/{id}/holds`, `GET /patron_categories`, and `GET /libraries`. Patron list requests send `x-koha-embed: checkouts+count,overdues+count`, and Koha returns `checkouts_count` and `overdues_count`; loan title enrichment uses `x-koha-embed: item.biblio`.

Status filters do not send Koha’s computed `expired` or `restricted` fields. Expired means `expiry_date` is before today in Asia/Manila. Restricted means `debarred` is today or later. Active means the card is not expired and not restricted. Koha search cannot count patrons by account balance, so the outstanding-fines total stays unavailable. A single patron’s balance comes from `GET /patrons/{id}/account`.

Patron delete, fine payments, extended attributes, password changes, and the public patron routes are unused.

On 2026-11-19 the configured staff host’s OpenAPI document identified Koha `25.06.00`. That text records what the host reported on that date; ULMS does not hardcode a Koha version at runtime.

## Circulation

Circulation transactions stay in Koha. ULMS stores `circulation_requests` and audit rows only. It does not copy open loans into PostgreSQL.

The browser calls ULMS only under `/api/v1/circulation` for capabilities, patron and item lookups, checkout, check-in, renewal, verify, patron-scoped current loans, and history when that capability is recorded. The API server uses the Koha staff REST API entries recorded in `apps/api/app/integrations/koha/circulation.py`.

Current loans use `GET /patrons/{patron_id}/checkouts` with `x-koha-embed: item.biblio`. Checkout uses `POST /checkouts` with `patron_id` and `item_id`. This host answered that route with a parameter error for an empty body and “Item not found” for an unknown item. History uses `GET /checkouts` for open loans and `GET /checkouts?checked_in=1` for returned loans, both with `x-koha-embed: item.biblio,patron`, newest checkout date first. Check-in, renewal, single-loan reads, and renewal preview remain unsupported until the same host answers those routes. `POST /checkins` is not present on this host.

ULMS never sends a Koha override header. Due dates and fines come only from Koha responses.

## Related docs

- `plan/plan.md` — product scope
- `docs/superpowers/specs/2026-11-17-catalog-search-design.md` — catalog search design