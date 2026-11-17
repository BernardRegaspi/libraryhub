from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.integrations.koha.allowlist import (
    DEFAULT_FIELDS,
    DEFAULT_SORTS,
    SUBJECT_FIELD,
    YEAR_FIELD,
    YEAR_FILTER,
)
from app.integrations.koha.availability import item_status, summarize_copies
from app.integrations.koha.exceptions import KohaNotFound
from app.integrations.koha.marc import parse_marc
from app.integrations.koha.query import build_biblio_query, order_by
from app.models.catalog import SavedSearch
from app.schemas.catalog import SavedSearchIn, SearchParams

class CatalogError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


_BIBLIO_NOT_FOUND = CatalogError(404, "not_found", "That record was not found.")
_SAVED_NOT_FOUND = CatalogError(404, "not_found", "That saved search was not found.")
_INVALID = CatalogError(422, "invalid_search", "That search is not valid.")
_AVAILABILITY_NOTICE = (
    "Availability can change after this time. This is not a reservation."
)
_COVER_KEYS = ("cover_url", "cover_image_url", "image_url")
_PER_PAGE_VALUES = frozenset({10, 20, 40})
_RECENT_CAP = 10
_SAVED_CAP = 30


def opac_url(settings) -> str | None:
    raw = settings.koha_opac_url
    if not raw or not str(raw).strip():
        return None
    text = str(raw).strip()
    if text.endswith("/"):
        return text[:-1]
    return text


def config_payload(settings) -> dict:
    fields = list(DEFAULT_FIELDS)
    if SUBJECT_FIELD:
        fields = [*fields, "subject"]
    return {
        "fields": fields,
        "sorts": list(DEFAULT_SORTS),
        "year_filter": YEAR_FILTER,
        "opac_url": opac_url(settings),
    }


def validate_search(params: SearchParams) -> None:
    q = params.q.strip()
    params.q = q

    if not (1 <= len(q) <= 200):
        raise _INVALID
    if params.field == "barcode" and len(q) > 32:
        raise _INVALID
    for ch in q:
        if ord(ch) < 32 or ord(ch) == 127:
            raise _INVALID
    if params.field not in DEFAULT_FIELDS:
        raise _INVALID
    if params.page < 1:
        raise _INVALID
    if params.per_page not in _PER_PAGE_VALUES:
        raise _INVALID
    if params.sort not in DEFAULT_SORTS:
        raise _INVALID
    if params.direction not in ("asc", "desc"):
        raise _INVALID
    if not YEAR_FILTER and (params.year_from is not None or params.year_to is not None):
        raise _INVALID
    for year in (params.year_from, params.year_to):
        if year is not None and not (1000 <= year <= 2100):
            raise _INVALID
    if (
        params.year_from is not None
        and params.year_to is not None
        and params.year_from > params.year_to
    ):
        raise _INVALID


def _filters(params: SearchParams) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if params.year_from is not None:
        payload["year_from"] = params.year_from
    if params.year_to is not None:
        payload["year_to"] = params.year_to
    return payload


def _blank(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _biblio_id(row: dict) -> int | None:
    raw = row.get("biblio_id", row.get("id"))
    if raw is None:
        return None
    return int(raw)


def _publication_year(row: dict) -> int | str | None:
    for key in ("publication_year", "copyright_date", "copyrightdate"):
        raw = row.get(key)
        if raw in (None, ""):
            continue
        if isinstance(raw, int):
            return raw
        if isinstance(raw, str):
            stripped = raw.strip()
            if stripped:
                return stripped
    return None


def _http_cover(row: dict) -> str | None:
    for key in _COVER_KEYS:
        value = row.get(key)
        if isinstance(value, str) and (
            value.startswith("http://") or value.startswith("https://")
        ):
            return value
    return None


def _has_cover(biblio: dict, items: list[dict]) -> bool:
    if _http_cover(biblio):
        return True
    return any(_http_cover(item) for item in items)


def _parse_total(headers) -> int | None:
    raw = headers.get("X-Total-Count")
    if raw is None:
        return None
    text = str(raw).strip()
    if text.isdigit():
        return int(text)
    return None


def _has_next(total: int | None, page: int, per_page: int, result_count: int) -> bool:
    if total is not None:
        return page * per_page < total
    return result_count == per_page


def _search_shell(params: SearchParams, *, page: int, total: int | None, has_next: bool) -> dict:
    return {
        "query": params.q,
        "page": page,
        "per_page": params.per_page,
        "total": total,
        "sort": params.sort,
        "direction": params.direction,
        "has_next": has_next,
        "results": [],
    }


def _group_items(items: list[dict] | None) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    if not items:
        return grouped
    for item in items:
        biblio_id = item.get("biblio_id")
        if biblio_id is not None:
            grouped[int(biblio_id)].append(item)
    return grouped


def _map_hit(
    biblio: dict,
    *,
    items: list[dict],
    type_labels: dict[str, str],
    checked_at: str | None,
    items_failed: bool,
) -> dict:
    biblio_items = items
    first = biblio_items[0] if biblio_items else None
    item_type = None
    if first is not None:
        type_id = first.get("item_type_id")
        if type_id is not None:
            item_type = type_labels.get(str(type_id), str(type_id))
    availability = summarize_copies(
        biblio_items,
        failed=items_failed,
        checked_at=checked_at,
    )
    return {
        "biblio_id": _biblio_id(biblio),
        "title": _blank(biblio.get("title")),
        "author": _blank(biblio.get("author")),
        "edition": _blank(biblio.get("edition")),
        "isbn": _blank(biblio.get("isbn")),
        "publication_year": _publication_year(biblio),
        "item_type": _blank(item_type),
        "availability": availability,
        "has_cover": _has_cover(biblio, biblio_items),
    }


def _record_recent(db: Session, user_id: uuid.UUID, params: SearchParams) -> None:
    now = datetime.now(timezone.utc)
    filters = _filters(params)
    stmt = (
        insert(SavedSearch)
        .values(
            user_id=user_id,
            kind="recent",
            label=None,
            query_text=params.q,
            search_field=params.field,
            filters=filters,
            sort_field=params.sort,
            sort_direction=params.direction,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[
                "user_id",
                "kind",
                "query_text",
                "search_field",
                "filters",
                "sort_field",
                "sort_direction",
            ],
            set_={"updated_at": now},
        )
    )
    db.execute(stmt)
    while (
        db.query(SavedSearch)
        .filter_by(user_id=user_id, kind="recent")
        .count()
        > _RECENT_CAP
    ):
        oldest = (
            db.query(SavedSearch)
            .filter_by(user_id=user_id, kind="recent")
            .order_by(SavedSearch.updated_at.asc())
            .first()
        )
        if oldest is None:
            break
        db.delete(oldest)
    db.flush()


def search(
    db: Session,
    client,
    settings,
    user_id: uuid.UUID | None,
    params: SearchParams,
    *,
    record_recent: bool = True,
) -> dict:
    validate_search(params)
    if params.field == "barcode":
        body, _headers = client.get_json(
            "/items",
            {"external_id": params.q, "_per_page": 1},
        )
        rows = body if isinstance(body, list) else []
        if not rows:
            shell = _search_shell(params, page=1, total=0, has_next=False)
            if record_recent and user_id is not None:
                _record_recent(db, user_id, params)
            return shell
        biblio_id = _biblio_id(rows[0])
        if biblio_id is None:
            shell = _search_shell(params, page=1, total=0, has_next=False)
            if record_recent and user_id is not None:
                _record_recent(db, user_id, params)
            return shell
        biblio_body, _biblio_headers = client.get_json(f"/biblios/{biblio_id}")
        if not isinstance(biblio_body, dict):
            shell = _search_shell(params, page=1, total=0, has_next=False)
            if record_recent and user_id is not None:
                _record_recent(db, user_id, params)
            return shell
        biblios = [biblio_body]
        total = 1
        has_next = False
        page = 1
    else:
        query = build_biblio_query(
            params.field,
            params.q,
            year_from=params.year_from,
            year_to=params.year_to,
            year_field=YEAR_FIELD,
        )
        body, headers = client.get_json(
            "/biblios",
            {
                "_page": params.page,
                "_per_page": params.per_page,
                "_order_by": order_by(params.sort, params.direction),
                "q": json.dumps(query),
            },
        )
        biblios = [row for row in body if isinstance(row, dict)] if isinstance(body, list) else []
        total = _parse_total(headers)
        has_next = _has_next(total, params.page, params.per_page, len(biblios))
        page = params.page

    biblio_ids = [bid for row in biblios if (bid := _biblio_id(row)) is not None]
    items, checked_at = client.list_items_for_biblios(biblio_ids)
    items_failed = items is None
    if items is None:
        items = []
    grouped = _group_items(items)
    type_labels = client.item_type_labels()

    results = [
        _map_hit(
            row,
            items=grouped.get(_biblio_id(row) or -1, []),
            type_labels=type_labels,
            checked_at=checked_at,
            items_failed=items_failed,
        )
        for row in biblios
        if _biblio_id(row) is not None
    ]
    payload = {
        "query": params.q,
        "page": page,
        "per_page": params.per_page,
        "total": total,
        "sort": params.sort,
        "direction": params.direction,
        "has_next": has_next,
        "results": results,
    }
    if record_recent and user_id is not None:
        _record_recent(db, user_id, params)
    return payload


def _json_or_marc(value: Any, marc: dict, marc_key: str) -> Any:
    cleaned = _blank(value)
    if cleaned is not None:
        return cleaned
    return marc.get(marc_key)


def biblio_detail(client, biblio_id: int) -> dict:
    try:
        json_body, _headers = client.get_json(f"/biblios/{biblio_id}")
    except KohaNotFound as exc:
        raise _BIBLIO_NOT_FOUND from exc
    if not isinstance(json_body, dict):
        raise _BIBLIO_NOT_FOUND
    try:
        marc_body, _marc_headers = client.get_json(
            f"/biblios/{biblio_id}",
            accept="application/marc-in-json",
        )
    except KohaNotFound as exc:
        raise _BIBLIO_NOT_FOUND from exc
    marc = parse_marc(marc_body) if isinstance(marc_body, dict) else {}
    authors = marc.get("authors") or []
    title = _json_or_marc(json_body.get("title"), marc, "title")
    author = _blank(json_body.get("author"))
    if author is None and authors:
        author = authors[0]
    edition = _json_or_marc(json_body.get("edition"), marc, "edition")
    place = _json_or_marc(json_body.get("place"), marc, "place")
    publisher = _json_or_marc(json_body.get("publisher"), marc, "publisher")
    year = _blank(json_body.get("publication_year"))
    if year is None:
        year = _blank(json_body.get("copyright_date"))
    if year is None:
        year = _blank(json_body.get("copyrightdate"))
    if year is None:
        year = marc.get("year") or None
    isbn = _blank(json_body.get("isbn"))
    isbns = [isbn] if isbn else list(marc.get("isbns") or [])
    detail = {
        "biblio_id": biblio_id,
        "title": title,
        "author": author,
        "contributors": authors,
        "edition": edition,
        "place": place,
        "publisher": publisher,
        "year": year,
        "isbns": isbns,
        "subjects": list(marc.get("subjects") or []),
        "description": marc.get("description"),
    }
    return {key: value for key, value in detail.items() if value not in (None, [], "")}


def _map_copy(
    item: dict,
    *,
    type_labels: dict[str, str],
    library_names: dict[str, str],
    include_barcode: bool,
) -> dict:
    status, status_label = item_status(item)
    home_id = item.get("home_library_id")
    holding_id = item.get("holding_library_id")
    home_key = str(home_id) if home_id is not None else ""
    holding_key = str(holding_id) if holding_id is not None else ""
    copy = {
        "call_number": _blank(item.get("callnumber")),
        "copy_number": item.get("copy_number"),
        "item_type_id": item.get("item_type_id"),
        "item_type_label": type_labels.get(str(item.get("item_type_id")), None)
        if item.get("item_type_id") is not None
        else None,
        "home_library_id": home_id,
        "home_library_name": library_names.get(home_key, home_key or None),
        "holding_library_id": holding_id,
        "holding_library_name": library_names.get(holding_key, holding_key or None),
        "location": _blank(item.get("location")),
        "status": status,
        "status_label": status_label,
    }
    if copy["item_type_label"] is None and item.get("item_type_id") is not None:
        copy["item_type_label"] = str(item["item_type_id"])
    if include_barcode:
        copy["barcode"] = _blank(item.get("external_id"))
    return copy


def biblio_items(client, biblio_id: int, *, include_barcode: bool) -> dict:
    items, checked_at = client.list_items_for_biblios([biblio_id])
    if items is None:
        return {
            "copies": [],
            "last_checked": None,
            "notice": _AVAILABILITY_NOTICE,
        }
    type_labels = client.item_type_labels()
    library_names = client.library_names()
    copies = [
        _map_copy(
            item,
            type_labels=type_labels,
            library_names=library_names,
            include_barcode=include_barcode,
        )
        for item in items
    ]
    return {
        "copies": copies,
        "last_checked": checked_at,
        "notice": _AVAILABILITY_NOTICE,
    }


def cover_bytes(client, biblio_id: int) -> tuple[bytes, str]:
    try:
        json_body, _headers = client.get_json(f"/biblios/{biblio_id}")
    except KohaNotFound as exc:
        raise _BIBLIO_NOT_FOUND from exc
    items, _checked_at = client.list_items_for_biblios([biblio_id])
    if items is None:
        items = []
    url = _http_cover(json_body if isinstance(json_body, dict) else {})
    if url is None:
        for item in items:
            url = _http_cover(item)
            if url:
                break
    if url is None:
        raise _BIBLIO_NOT_FOUND
    return client.get_bytes(url)


def _row_payload(row: SavedSearch) -> dict:
    filters = row.filters or {}
    return {
        "id": row.id,
        "label": row.label,
        "q": row.query_text,
        "field": row.search_field,
        "sort": row.sort_field,
        "direction": row.sort_direction,
        "year_from": filters.get("year_from"),
        "year_to": filters.get("year_to"),
        "updated_at": row.updated_at.isoformat(),
    }


def list_recent(db: Session, user_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(SavedSearch)
        .filter_by(user_id=user_id, kind="recent")
        .order_by(SavedSearch.updated_at.desc())
        .all()
    )
    return [_row_payload(row) for row in rows]


def list_saved(db: Session, user_id: uuid.UUID) -> list[dict]:
    rows = (
        db.query(SavedSearch)
        .filter_by(user_id=user_id, kind="saved")
        .order_by(SavedSearch.updated_at.desc())
        .all()
    )
    return [_row_payload(row) for row in rows]


def save_search(db: Session, user_id: uuid.UUID, body: SavedSearchIn) -> dict:
    label = body.label.strip()
    if not (1 <= len(label) <= 80):
        raise _INVALID
    params = SearchParams(
        q=body.q,
        field=body.field,
        sort=body.sort,
        direction=body.direction,
        year_from=body.year_from,
        year_to=body.year_to,
    )
    validate_search(params)
    now = datetime.now(timezone.utc)
    filters = _filters(params)
    stmt = (
        insert(SavedSearch)
        .values(
            user_id=user_id,
            kind="saved",
            label=label,
            query_text=params.q,
            search_field=params.field,
            filters=filters,
            sort_field=params.sort,
            sort_direction=params.direction,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            index_elements=[
                "user_id",
                "kind",
                "query_text",
                "search_field",
                "filters",
                "sort_field",
                "sort_direction",
            ],
            set_={"label": label, "updated_at": now},
        )
        .returning(SavedSearch.id)
    )
    row_id = db.execute(stmt).scalar_one()
    db.flush()
    while (
        db.query(SavedSearch)
        .filter_by(user_id=user_id, kind="saved")
        .count()
        > _SAVED_CAP
    ):
        oldest = (
            db.query(SavedSearch)
            .filter_by(user_id=user_id, kind="saved")
            .order_by(SavedSearch.updated_at.asc())
            .first()
        )
        if oldest is None:
            break
        db.delete(oldest)
    row = db.query(SavedSearch).filter_by(id=row_id).one()
    db.flush()
    return _row_payload(row)


def delete_saved(db: Session, user_id: uuid.UUID, search_id: uuid.UUID) -> None:
    deleted = (
        db.query(SavedSearch)
        .filter_by(id=search_id, user_id=user_id, kind="saved")
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise _SAVED_NOT_FOUND
    db.flush()