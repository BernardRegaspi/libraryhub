from __future__ import annotations

import json
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.integrations.koha.exceptions import KohaError, KohaNotFound, KohaTimeoutError
from app.integrations.koha.patron_query import build_patron_query, patron_order_by
from app.models.identity import AuditLog
from app.schemas.patrons import PatronSearchParams

_DIRECTORY_FIELDS = (
    "patron_id",
    "firstname",
    "surname",
    "preferred_name",
    "cardnumber",
    "category_id",
    "library_id",
    "expiry_date",
    "expired",
    "restricted",
    "patron_card_lost",
)

_COUNT_FIELDS = ("checkouts_count", "overdues_count")


class PatronError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: list[dict] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = fields
        super().__init__(message)


_SORTS = frozenset({"surname", "firstname", "cardnumber", "category_id", "expiry_date"})
_STATUSES = frozenset({"active", "expired", "restricted"})
_INVALID = PatronError(422, "invalid_search", "That search is not valid.")
_UNAVAILABLE = PatronError(
    503,
    "patrons_unavailable",
    "Patron records are unavailable. Try again.",
)
_TIMEOUT = PatronError(
    504,
    "patrons_timeout",
    "Patron records took too long to respond. Try again.",
)
_NOT_FOUND = PatronError(404, "not_found", "That patron was not found.")


def _lookup_name(key: Any, mapping: dict[str, str]) -> str | None:
    if key is None or key == "":
        return None
    return mapping.get(str(key))


def directory_item(
    row: dict,
    categories: dict[str, str],
    libraries: dict[str, str],
) -> dict:
    item = {field: row.get(field) for field in _DIRECTORY_FIELDS}
    item["category_name"] = _lookup_name(row.get("category_id"), categories)
    item["library_name"] = _lookup_name(row.get("library_id"), libraries)
    for field in _COUNT_FIELDS:
        item[field] = row[field] if field in row else None
    return item


def detail_item(
    row: dict,
    categories: dict[str, str],
    libraries: dict[str, str],
    *,
    sensitive: bool,
) -> dict:
    item = directory_item(row, categories, libraries)
    item["userid"] = row.get("userid")
    item["email"] = row.get("email")
    item["phone"] = row.get("phone")
    item["mobile"] = row.get("mobile")
    item["date_enrolled"] = row.get("date_enrolled")
    if sensitive:
        for field in (
            "date_of_birth",
            "address",
            "address2",
            "city",
            "state",
            "postal_code",
            "country",
            "staff_notes",
        ):
            item[field] = row.get(field)
    return item


def is_overdue(
    due_date: str | None,
    checkin_date: str | None,
    today: date,
) -> bool:
    if not due_date or checkin_date:
        return False
    due = date.fromisoformat(due_date[:10])
    return due < today


def _checkout_title(row: dict) -> Any:
    item = row.get("item")
    if isinstance(item, dict):
        biblio = item.get("biblio")
        if isinstance(biblio, dict) and "title" in biblio:
            return biblio.get("title")
    biblio = row.get("biblio")
    if isinstance(biblio, dict) and "title" in biblio:
        return biblio.get("title")
    return None


def checkout_item(row: dict, *, include_barcode: bool, today: date) -> dict:
    item: dict[str, Any] = {
        "checkout_id": row.get("checkout_id"),
        "item_id": row.get("item_id"),
        "title": _checkout_title(row),
        "checkout_date": row.get("checkout_date"),
        "due_date": row.get("due_date"),
        "renewals_count": row.get("renewals_count"),
        "overdue": is_overdue(row.get("due_date"), row.get("checkin_date"), today),
    }
    if include_barcode and "external_id" in row:
        item["external_id"] = row["external_id"]
    return item


def _hold_title(row: dict) -> Any:
    biblio = row.get("biblio")
    if isinstance(biblio, dict) and "title" in biblio:
        return biblio.get("title")
    return None


def hold_item(row: dict, libraries: dict[str, str]) -> dict:
    pickup_library_id = row.get("pickup_library_id")
    return {
        "hold_id": row.get("hold_id"),
        "status": row.get("status"),
        "hold_date": row.get("hold_date"),
        "waiting_date": row.get("waiting_date"),
        "expiration_date": row.get("expiration_date"),
        "pickup_library_id": pickup_library_id,
        "pickup_library_name": _lookup_name(pickup_library_id, libraries),
        "biblio_id": row.get("biblio_id"),
        "title": _hold_title(row),
    }


def validate_search(params: PatronSearchParams) -> None:
    for ch in params.q:
        if ord(ch) < 32 or ord(ch) == 127:
            raise _INVALID
    q = params.q.strip()
    params.q = q
    if q and len(q) > 80:
        raise _INVALID
    if not (1 <= params.page <= 10000):
        raise _INVALID
    if not (1 <= params.per_page <= 50):
        raise _INVALID
    if params.sort not in _SORTS:
        raise _INVALID
    if params.direction not in ("asc", "desc"):
        raise _INVALID
    status = params.status
    if status is not None and status != "" and status not in _STATUSES:
        raise _INVALID
    if status == "":
        params.status = None


def _parse_total(headers) -> int | None:
    for key in ("X-Total-Count", "x-total-count"):
        raw = headers.get(key)
        if raw is None:
            continue
        digits = "".join(ch for ch in str(raw) if ch.isdigit())
        if digits:
            return int(digits)
    return None


def _has_next(total: int | None, page: int, per_page: int, result_count: int) -> bool:
    if total is not None:
        return page * per_page < total
    return result_count == per_page


def _category_map(client) -> dict[str, str] | None:
    try:
        rows = client.list_patron_categories()
    except KohaError:
        return None
    mapping: dict[str, str] = {}
    for row in rows:
        cat_id = row.get("patron_category_id")
        name = row.get("name")
        if cat_id is not None and name is not None:
            mapping[str(cat_id)] = str(name)
    return mapping


def _library_map(client) -> dict[str, str] | None:
    try:
        return client.library_names()
    except KohaError:
        return None


def _load_label_maps(
    client,
    params: PatronSearchParams,
) -> tuple[dict[str, str], dict[str, str]]:
    categories = _category_map(client)
    libraries = _library_map(client)
    if params.category_id is not None:
        if categories is None:
            raise _UNAVAILABLE
        if params.category_id not in categories:
            raise _INVALID
    if params.library_id is not None:
        if libraries is None:
            raise _UNAVAILABLE
        if params.library_id not in libraries:
            raise _INVALID
    return categories or {}, libraries or {}


def search_patrons(client, params: PatronSearchParams) -> dict:
    validate_search(params)
    categories, libraries = _load_label_maps(client, params)
    query = build_patron_query(
        params.q,
        category_id=params.category_id,
        library_id=params.library_id,
        status=params.status,
    )
    koha_params: dict[str, str] = {
        "_page": str(params.page),
        "_per_page": str(params.per_page),
        "_order_by": patron_order_by(params.sort, params.direction),
    }
    if query is not None:
        koha_params["q"] = json.dumps(query)
    try:
        rows, headers = client.list_patrons(koha_params)
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    total = _parse_total(headers)
    items = [directory_item(row, categories, libraries) for row in rows]
    return {
        "query": params.q,
        "page": params.page,
        "per_page": params.per_page,
        "total": total,
        "sort": params.sort,
        "direction": params.direction,
        "category_id": params.category_id,
        "library_id": params.library_id,
        "status": params.status,
        "has_next": _has_next(total, params.page, params.per_page, len(rows)),
        "items": items,
    }


def patron_options(client) -> dict:
    categories: list[dict] | None
    try:
        rows = client.list_patron_categories()
        categories = [
            {
                "patron_category_id": row["patron_category_id"],
                "name": row["name"],
            }
            for row in rows
            if row.get("patron_category_id") is not None and row.get("name") is not None
        ]
    except KohaError:
        categories = None
    libraries: list[dict] | None
    try:
        names = client.library_names()
        libraries = [{"id": lib_id, "name": name} for lib_id, name in names.items()]
    except KohaError:
        libraries = None
    return {"categories": categories, "libraries": libraries}


def get_patron_detail(
    db: Session,
    client,
    patron_id: int,
    *,
    user_id,
    sensitive: bool,
) -> dict:
    try:
        row = client.get_patron(patron_id)
    except KohaNotFound as exc:
        raise _NOT_FOUND from exc
    except KohaTimeoutError as exc:
        raise _TIMEOUT from exc
    except KohaError as exc:
        raise _UNAVAILABLE from exc
    categories = _category_map(client) or {}
    libraries = _library_map(client) or {}
    item = detail_item(row, categories, libraries, sensitive=sensitive)
    db.add(
        AuditLog(
            user_id=user_id,
            action="patrons.detail",
            module="patrons",
            entity_type="patron",
            entity_id=str(patron_id),
            details={"sensitive": sensitive},
        )
    )
    db.commit()
    return item