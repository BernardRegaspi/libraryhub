from __future__ import annotations

from datetime import date
from typing import Any

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