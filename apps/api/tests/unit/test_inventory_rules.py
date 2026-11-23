from app.services.inventory_rules import (
    classify_scan,
    expected_condition,
    keep_for_snapshot,
)


def _item(**overrides):
    base = {
        "home_library_id": "COLLEGE",
        "holding_library_id": "COLLEGE",
        "location": "STACK-A",
        "item_type_id": "BK",
        "withdrawn": 0,
        "lost_status": 0,
        "damaged_status": 0,
        "not_for_loan_status": 0,
        "checked_out_date": None,
    }
    base.update(overrides)
    return base


def test_shelf_filter_keeps_on_shelf_copies_only():
    locs = frozenset({"STACK-A"})
    assert keep_for_snapshot(_item(), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert keep_for_snapshot(_item(not_for_loan_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert keep_for_snapshot(_item(damaged_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(checked_out_date="2026-11-01"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(holding_library_id="OTHER"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(lost_status=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(withdrawn=1), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(location=""), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(location="STACK-B"), home_library_id="COLLEGE", locations=locs, item_type_id=None)
    assert not keep_for_snapshot(_item(item_type_id="AV"), home_library_id="COLLEGE", locations=locs, item_type_id="BK")
    assert keep_for_snapshot(_item(location=""), home_library_id="COLLEGE", locations=frozenset(), item_type_id=None)


def test_classify_order():
    common = dict(
        session_home_library_id="COLLEGE",
        session_locations=frozenset({"STACK-A"}),
        station_location="STACK-A",
        snapshot_location="STACK-A",
        on_expected_list=True,
        existing_counts=False,
        koha_failed=False,
        damaged=False,
    )
    assert classify_scan(matches=[], **common).outcome == "invalid"
    assert classify_scan(matches=[_item(), _item()], **common).outcome == "invalid"
    failed = classify_scan(matches=[], koha_failed=True, **{k: v for k, v in common.items() if k != "koha_failed"})
    assert failed.outcome == "koha_error" and failed.counts is False
    dup = classify_scan(matches=[_item()], existing_counts=True, **{k: v for k, v in common.items() if k != "existing_counts"})
    assert dup.outcome == "duplicate" and dup.counts is False
    withdrawn = classify_scan(matches=[_item(withdrawn=1)], on_expected_list=False, **{k: v for k, v in common.items() if k != "on_expected_list"})
    assert withdrawn.outcome == "withdrawn" and withdrawn.counts is True
    unexpected = classify_scan(matches=[_item(home_library_id="OTHER")], on_expected_list=False, **{k: v for k, v in common.items() if k != "on_expected_list"})
    assert unexpected.outcome == "unexpected"
    damaged = classify_scan(matches=[_item()], damaged=True, **{k: v for k, v in common.items() if k != "damaged"})
    assert damaged.outcome == "damaged" and damaged.match_basis == "found"
    misplaced = classify_scan(matches=[_item()], station_location="STACK-B", **{k: v for k, v in common.items() if k != "station_location"})
    assert misplaced.outcome == "misplaced"
    found = classify_scan(matches=[_item()], **common)
    assert found.outcome == "found" and found.counts is True


def test_expected_condition_priority():
    assert expected_condition(scan_outcome="found", active_shelf_search=True) == "found"
    assert expected_condition(scan_outcome=None, active_shelf_search=True) == "not_found"
    assert expected_condition(scan_outcome=None, active_shelf_search=False) == "unverified"
    assert expected_condition(scan_outcome="damaged", active_shelf_search=False) == "damaged"