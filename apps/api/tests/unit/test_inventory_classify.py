from app.services.inventory_classify import classify_primary, display_label, duplicate_message

_AVAILABLE = {
    "withdrawn": 0,
    "lost_status": 0,
    "damaged_status": 0,
    "not_for_loan_status": 0,
    "effective_not_for_loan_status": 0,
    "checked_out_date": None,
    "home_library_id": "CPL",
    "holding_library_id": "CPL",
    "location": "GEN",
}


def test_place_is_decided_before_condition():
    withdrawn = {**_AVAILABLE, "withdrawn": 1, "home_library_id": "UCL", "location": "OTHER"}
    assert classify_primary(
        withdrawn,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    ) == ("unexpected", "Home library is UCL, not College Library.")
    assert classify_primary(
        None,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    ) == ("not_found", "No Koha item has this barcode.")
    assert classify_primary(
        {**_AVAILABLE, "home_library_id": None},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    )[0] == "unexpected"
    misplaced = classify_primary(
        {**_AVAILABLE, "location": ""},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    )
    assert misplaced == ("misplaced", "Shelving location is blank, not GEN.")
    whole = classify_primary(
        {**_AVAILABLE, "holding_library_id": "UCL", "location": "OTHER"},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    )
    assert whole[0] == "other_exception"
    assert "In transit" in whole[1]


def test_in_scope_status_order_and_labels():
    assert classify_primary(
        {**_AVAILABLE, "withdrawn": 1, "lost_status": 1},
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    )[0] == "withdrawn"
    assert classify_primary(
        _AVAILABLE,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location="GEN",
    ) == ("verified", "On this shelf.")
    assert classify_primary(
        _AVAILABLE,
        session_library_id="CPL",
        session_library_name="College Library",
        session_location=None,
    ) == ("verified", "In this library.")
    assert display_label("other_exception", "Lost") == "Lost"
    assert display_label("verified", "Available") == "Verified"
    assert duplicate_message("verified", "Available") == "Already scanned as Verified."