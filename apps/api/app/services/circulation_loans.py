from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.integrations.koha.circulation import get_circulation_capabilities
from app.services.circulation_errors import _INVALID_SEARCH, unsupported_write
from app.services.patrons import is_overdue


def manila_today() -> date:
    return datetime.now(ZoneInfo("Asia/Manila")).date()


def list_loans(
    client,
    *,
    patron_id: int,
    q: str,
    overdue: bool | None,
    page: int,
    per_page: int,
    sort: str,
    direction: str,
    include_barcode: bool,
    today: date | None = None,
) -> dict:
    if patron_id < 1 or page < 1 or page > 10000 or per_page < 1 or per_page > 20:
        raise _INVALID_SEARCH
    if get_circulation_capabilities().loans_scope != "patron":
        raise _INVALID_SEARCH
    rows = client.list_checkouts(patron_id)
    filtered = _filter_loan_rows(rows, q)
    ref_today = today or manila_today()
    if overdue is True:
        filtered = [row for row in filtered if _row_overdue(row, ref_today)]
    elif overdue is False:
        filtered = [row for row in filtered if not _row_overdue(row, ref_today)]
    sorted_rows = _sort_loans(filtered, sort, direction)
    start = (page - 1) * per_page
    page_rows = sorted_rows[start : start + per_page]
    items = [
        _loan_item(row, include_barcode=include_barcode, today=ref_today) for row in page_rows
    ]
    return {
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": len(sorted_rows),
        "has_next": start + per_page < len(sorted_rows),
    }


def list_history(client, **kwargs) -> dict:
    raise unsupported_write()


def get_loan(client, checkout_id: int, *, include_barcode: bool) -> dict:
    if get_circulation_capabilities().single_loan is None:
        raise unsupported_write()
    row = client.get_checkout(checkout_id)
    return _loan_item(row, include_barcode=include_barcode, today=manila_today())


def _title(row: dict):
    item = row.get("item")
    if isinstance(item, dict):
        biblio = item.get("biblio")
        if isinstance(biblio, dict) and biblio.get("title"):
            return biblio.get("title")
    biblio = row.get("biblio")
    if isinstance(biblio, dict):
        return biblio.get("title")
    return row.get("title")


def _row_overdue(row: dict, today: date) -> bool:
    due = row.get("due_date")
    if due is None:
        return False
    if isinstance(due, str) and not due.strip():
        return False
    return is_overdue(str(due), row.get("checkin_date"), today)


def _loan_item(row: dict, *, include_barcode: bool, today: date) -> dict:
    due = row.get("due_date")
    overdue = None if not due else is_overdue(str(due), row.get("checkin_date"), today)
    item = {
        "checkout_id": row.get("checkout_id"),
        "item_id": row.get("item_id"),
        "patron_id": row.get("patron_id"),
        "patron_name": None,
        "cardnumber": row.get("cardnumber") if "cardnumber" in row else None,
        "title": _title(row),
        "author": None,
        "call_number": None,
        "item_type_id": None,
        "item_type_label": None,
        "library_id": None,
        "library_name": None,
        "checkout_date": row.get("checkout_date"),
        "due_date": due,
        "renewals_count": row.get("renewals_count"),
        "overdue": overdue,
    }
    if include_barcode and "external_id" in row:
        item["external_id"] = row.get("external_id")
    return item


def _filter_loan_rows(rows: list[dict], q: str) -> list[dict]:
    text = q.strip().casefold()
    if not text:
        return rows
    matched = []
    for row in rows:
        title = str(_title(row) or "").casefold()
        barcode = str(row.get("external_id") or "").casefold()
        if text in title or text in barcode:
            matched.append(row)
    return matched


def _sort_loans(rows: list[dict], sort: str, direction: str) -> list[dict]:
    reverse = direction == "desc"

    def key(row: dict) -> tuple:
        if sort == "title":
            return (str(_title(row) or ""),)
        if sort == "checkout_date":
            return (str(row.get("checkout_date") or ""),)
        due = row.get("due_date")
        return (0, "") if not due else (1, str(due)[:10])

    return sorted(rows, key=key, reverse=reverse)