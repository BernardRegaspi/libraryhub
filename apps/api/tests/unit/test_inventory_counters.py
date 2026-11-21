from app.services.inventory_counters import summarize_scans


def test_duplicates_do_not_increase_verified_and_remaining_floors_at_zero():
    totals = summarize_scans(
        ["verified", "duplicate", "withdrawn", "not_found"],
        expected_count=1,
    )
    assert totals["verified"] == 1
    assert totals["duplicates"] == 1
    assert totals["withdrawn"] == 1
    assert totals["seen"] == 2
    assert totals["needs_a_look"] == 2
    assert totals["remaining"] == 0
    assert totals["not_found"] == 1


def test_zero_expected_count_keeps_remaining_at_zero():
    totals = summarize_scans([], expected_count=0)
    assert totals["expected_count"] == 0
    assert totals["seen"] == 0
    assert totals["remaining"] == 0