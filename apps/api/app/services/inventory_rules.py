from __future__ import annotations

from dataclasses import dataclass

from app.integrations.koha.availability import item_status

_ON_SHELF_STATUSES = frozenset({"available", "damaged", "not_for_loan"})
_COUNTING_OUTCOMES = frozenset({"found", "misplaced", "damaged", "withdrawn"})


@dataclass(frozen=True)
class ScanDecision:
    outcome: str
    match_basis: str | None
    observed_damaged: bool
    counts: bool


def keep_for_snapshot(
    item: dict,
    *,
    home_library_id: str,
    locations: frozenset[str],
    item_type_id: str | None,
) -> bool:
    if str(item.get("home_library_id") or "") != home_library_id:
        return False
    if locations:
        location = item.get("location")
        if not isinstance(location, str) or not location or location not in locations:
            return False
    if item_type_id is not None and str(item.get("item_type_id")) != item_type_id:
        return False
    return item_status(item)[0] in _ON_SHELF_STATUSES


def _location_rule_matches(
    item: dict,
    *,
    snapshot_location: str | None,
    station_location: str | None,
) -> bool:
    if station_location is not None and station_location != snapshot_location:
        return True
    location = item.get("location")
    return isinstance(location, str) and bool(location) and location != snapshot_location


def classify_scan(
    matches: list[dict],
    *,
    koha_failed: bool,
    existing_counts: bool,
    on_expected_list: bool,
    snapshot_location: str | None,
    session_home_library_id: str,
    session_locations: frozenset[str],
    station_location: str | None,
    damaged: bool,
) -> ScanDecision:
    if koha_failed:
        return ScanDecision("koha_error", None, False, False)
    if len(matches) != 1:
        return ScanDecision("invalid", None, False, False)
    if existing_counts:
        return ScanDecision("duplicate", None, False, False)

    item = matches[0]
    live_status = item_status(item)[0]
    live_home = str(item.get("home_library_id") or "")
    live_location = item.get("location")
    in_session_locations = not session_locations or (
        isinstance(live_location, str) and live_location in session_locations
    )

    if (
        live_status == "withdrawn"
        and live_home == session_home_library_id
        and in_session_locations
    ):
        return ScanDecision("withdrawn", None, damaged, True)

    if not on_expected_list:
        return ScanDecision("unexpected", None, damaged, True)

    location_mismatch = _location_rule_matches(
        item,
        snapshot_location=snapshot_location,
        station_location=station_location,
    )

    if damaged:
        basis = "misplaced" if location_mismatch else "found"
        return ScanDecision("damaged", basis, True, True)

    if location_mismatch:
        return ScanDecision("misplaced", None, False, True)

    return ScanDecision("found", None, False, True)


def expected_condition(*, scan_outcome: str | None, active_shelf_search: bool) -> str:
    if scan_outcome in _COUNTING_OUTCOMES:
        return scan_outcome
    if active_shelf_search:
        return "not_found"
    return "unverified"