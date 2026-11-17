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

Library name, item type, availability wording, and subject headings on copies are **copy facts** returned from Koha items or MARC on the detail page. They are not filters that narrow the result set (except publication year once a year column is confirmed on the biblio object).

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

## Related docs

- `plan/plan.md` — product scope
- `docs/superpowers/specs/2026-11-17-catalog-search-design.md` — catalog search design