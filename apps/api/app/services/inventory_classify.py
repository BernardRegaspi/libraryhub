from app.integrations.koha.availability import item_status

_DISPLAY_LABELS = {
    "verified": "Verified",
    "misplaced": "Misplaced",
    "unexpected": "Unexpected",
    "not_found": "Not found",
    "withdrawn": "Withdrawn",
    "damaged": "Damaged",
    "duplicate": "Duplicate",
}

_IN_SCOPE_MESSAGES = {
    "withdrawn": ("withdrawn", "Koha marks this item withdrawn."),
    "lost": ("other_exception", "Koha status: Lost."),
    "damaged": ("damaged", "Koha marks this item damaged."),
    "not_for_loan": ("other_exception", "Koha status: Not for loan."),
    "checked_out": ("other_exception", "Koha status: Checked out."),
    "in_transit": ("other_exception", "Koha status: In transit."),
}


def _blank(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def classify_primary(
    item: dict | None,
    *,
    session_library_id: str,
    session_library_name: str | None,
    session_location: str | None,
) -> tuple[str, str]:
    if item is None:
        return ("not_found", "No Koha item has this barcode.")

    session_lib = session_library_id.strip()
    home_id = item.get("home_library_id")
    if _blank(home_id):
        return ("unexpected", "Home library is not on this Koha item.")
    if str(home_id).strip() != session_lib:
        home_label = item.get("home_library_name") or str(home_id).strip()
        session_label = session_library_name or session_lib
        return ("unexpected", f"Home library is {home_label}, not {session_label}.")

    if session_location is not None:
        session_loc = session_location.strip()
        item_loc = item.get("location")
        if _blank(item_loc) or str(item_loc).strip() != session_loc:
            loc_display = "blank" if _blank(item_loc) else str(item_loc).strip()
            return ("misplaced", f"Shelving location is {loc_display}, not {session_loc}.")

    status, label = item_status(item)
    if status == "available":
        if session_location is not None:
            return ("verified", "On this shelf.")
        return ("verified", "In this library.")

    outcome, message = _IN_SCOPE_MESSAGES[status]
    return (outcome, message)


def display_label(outcome: str, koha_status_label: str | None) -> str:
    if outcome == "other_exception":
        if isinstance(koha_status_label, str) and koha_status_label.strip():
            return koha_status_label.strip()
        return "Other exception"
    return _DISPLAY_LABELS[outcome]


def duplicate_message(primary_outcome: str, koha_status_label: str | None) -> str:
    label = display_label(primary_outcome, koha_status_label)
    return f"Already scanned as {label}."