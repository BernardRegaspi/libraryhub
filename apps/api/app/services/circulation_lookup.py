from __future__ import annotations

import json
import re

from app.integrations.koha.availability import item_status
from app.integrations.koha.exceptions import KohaError
from app.services.circulation_errors import CirculationError, _INVALID_SCAN
from app.services.patrons import directory_item

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_MAX_SCAN = 64


def validate_scan_value(value: str) -> str:
    trimmed = value.strip()
    if not trimmed or len(trimmed) > _MAX_SCAN or _CONTROL.search(trimmed):
        raise _INVALID_SCAN
    return trimmed


def patron_by_card(client, categories: dict, libraries: dict, cardnumber: str) -> dict:
    trimmed = validate_scan_value(cardnumber)
    rows = client.search_patrons(
        {"q": json.dumps({"cardnumber": trimmed}), "_per_page": 5},
    )
    if not rows:
        raise CirculationError(404, "not_found", "No patron matches that card number.")
    if len(rows) > 1:
        raise CirculationError(409, "ambiguous_card", "More than one patron has that card number.")
    return desk_patron(client, categories, libraries, int(rows[0]["patron_id"]), include_barcode=True)


def desk_patron(
    client,
    categories: dict,
    libraries: dict,
    patron_id: int,
    *,
    include_barcode: bool,
) -> dict:
    row = client.get_patron(patron_id, embed="checkouts+count,overdues+count")
    item = directory_item(row, categories, libraries)
    try:
        balance = client.get_patron_balance(patron_id)
    except KohaError:
        balance = None
    item["balance"] = balance
    return item


def item_by_barcode(
    client,
    categories: dict,
    libraries: dict,
    barcode: str,
    *,
    include_barcode: bool,
) -> dict:
    trimmed = validate_scan_value(barcode)
    rows = client.search_items(
        {"q": json.dumps({"external_id": trimmed}), "_per_page": 5},
    )
    if not rows:
        raise CirculationError(404, "not_found", "No item matches that barcode.")
    if len(rows) > 1:
        raise CirculationError(409, "ambiguous_item", "More than one item has that barcode.")
    row = rows[0]
    status, status_label = item_status(row)
    biblio = row.get("biblio") if isinstance(row.get("biblio"), dict) else {}
    item_type_id = row.get("item_type_id")
    if item_type_id is not None:
        label = categories.get(str(item_type_id))
        item_type_label = label if label is not None else str(item_type_id)
    else:
        item_type_label = None
    item = {
        "item_id": row.get("item_id"),
        "biblio_id": row.get("biblio_id") or biblio.get("biblio_id"),
        "title": biblio.get("title"),
        "author": biblio.get("author"),
        "call_number": row.get("callnumber") or row.get("itemcallnumber"),
        "item_type_id": item_type_id,
        "item_type_label": item_type_label,
        "home_library_id": row.get("home_library_id"),
        "home_library_name": libraries.get(str(row.get("home_library_id")), row.get("home_library_id")),
        "holding_library_id": row.get("holding_library_id"),
        "holding_library_name": libraries.get(
            str(row.get("holding_library_id")),
            row.get("holding_library_id"),
        ),
        "status": status,
        "status_label": status_label,
    }
    if include_barcode:
        item["external_id"] = row.get("external_id")
    return item