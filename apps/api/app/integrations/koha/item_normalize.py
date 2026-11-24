from __future__ import annotations

from typing import Any


def _optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


def normalize_koha_item(item: dict) -> dict:
    """Flatten Koha item JSON (with optional embedded biblio) for ULMS inventory."""
    out = dict(item)
    biblio = out.get("biblio")
    if isinstance(biblio, dict):
        if not out.get("title"):
            out["title"] = biblio.get("title")
        if not out.get("author"):
            out["author"] = biblio.get("author")
        if out.get("biblio_id") in (None, ""):
            out["biblio_id"] = biblio.get("biblio_id")

    call = (
        out.get("call_number")
        or out.get("callnumber")
        or out.get("itemcallnumber")
    )
    if call not in (None, ""):
        out["call_number"] = call

    item_type = out.get("item_type")
    if isinstance(item_type, dict) and not out.get("item_type_label"):
        label = item_type.get("description") or item_type.get("name")
        if label not in (None, ""):
            out["item_type_label"] = str(label)

    if not out.get("external_id") and out.get("barcode") not in (None, ""):
        out["external_id"] = out.get("barcode")
    if not out.get("barcode") and out.get("external_id") not in (None, ""):
        out["barcode"] = out.get("external_id")

    return out


def koha_item_barcode(item: dict) -> str:
    normalized = normalize_koha_item(item)
    for key in ("barcode", "external_id"):
        value = _optional_str(normalized.get(key))
        if value:
            return value
    return ""