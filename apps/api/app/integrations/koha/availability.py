_LABELS = {
    "withdrawn": "Withdrawn",
    "lost": "Lost",
    "damaged": "Damaged",
    "not_for_loan": "Not for loan",
    "checked_out": "Checked out",
    "in_transit": "In transit",
    "available": "Available",
}

_SEVERITY = (
    "withdrawn",
    "lost",
    "damaged",
    "not_for_loan",
    "checked_out",
    "in_transit",
)


def _flag(item: dict, key: str) -> int:
    value = item.get(key)
    if value in (None, ""):
        return 0
    return int(value)


def item_status(item: dict) -> tuple[str, str]:
    if _flag(item, "withdrawn") > 0:
        status = "withdrawn"
    elif _flag(item, "lost_status") > 0:
        status = "lost"
    elif _flag(item, "damaged_status") > 0:
        status = "damaged"
    elif _flag(item, "not_for_loan_status") > 0 or _flag(item, "effective_not_for_loan_status") > 0:
        status = "not_for_loan"
    elif item.get("checked_out_date"):
        status = "checked_out"
    else:
        home = item.get("home_library_id")
        holding = item.get("holding_library_id")
        if isinstance(home, str) and isinstance(holding, str) and home and holding and home != holding:
            status = "in_transit"
        else:
            status = "available"
    return status, _LABELS[status]


def summarize_copies(
    items: list[dict] | None,
    *,
    failed: bool,
    checked_at: str | None,
) -> dict:
    if failed:
        return {
            "status": "unknown",
            "label": "Availability unavailable",
            "copy_count": 0,
            "available_count": 0,
            "last_checked": None,
        }
    copies = items or []
    if not copies:
        return {
            "status": "no_copies",
            "label": "No copies",
            "copy_count": 0,
            "available_count": 0,
            "last_checked": checked_at,
        }
    statuses = [item_status(item)[0] for item in copies]
    available_count = sum(1 for status in statuses if status == "available")
    if available_count:
        status = "available"
    else:
        status = next(name for name in _SEVERITY if name in statuses)
    return {
        "status": status,
        "label": _LABELS[status],
        "copy_count": len(copies),
        "available_count": available_count,
        "last_checked": checked_at,
    }
