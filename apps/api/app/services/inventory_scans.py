from __future__ import annotations

import json
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.integrations.koha.availability import item_status
from app.integrations.koha.exceptions import KohaConnectionError, KohaTimeoutError
from app.models.inventory import (
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventorySessionLocation,
)
from app.services.inventory_audit import write_inventory_audit
from app.services.inventory_errors import invalid_scan, invalid_state
from app.services.inventory_rules import classify_scan

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_MAX_SCAN = 64
_MAX_REMARK = 2000


def submit_scan(
    db: Session,
    client,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    barcode: str,
    station_location: str | None,
    damaged: bool,
) -> dict[str, Any]:
    trimmed = _validate_barcode(barcode)
    session = db.get(InventorySession, session_id)
    if session is None:
        raise invalid_state()
    if session.status != "in_progress":
        raise invalid_state()

    location_rows = list(
        db.scalars(
            select(InventorySessionLocation.location).where(
                InventorySessionLocation.session_id == session_id,
            ),
        ).all(),
    )
    session_locations = frozenset(location_rows)
    if location_rows:
        if station_location is None or station_location not in session_locations:
            raise invalid_state()

    matches: list[dict] = []
    koha_failed = False
    try:
        matches = client.search_items(
            {"q": json.dumps({"external_id": trimmed}), "_per_page": 5},
        )
        if not isinstance(matches, list):
            matches = []
    except (KohaTimeoutError, KohaConnectionError):
        koha_failed = True
        matches = []

    expected_by_barcode = db.scalar(
        select(InventoryExpectedItem).where(
            InventoryExpectedItem.session_id == session_id,
            InventoryExpectedItem.barcode == trimmed,
        ),
    )
    koha_item_id = _koha_item_id(matches[0]) if len(matches) == 1 else None
    expected_by_item = None
    if koha_item_id is not None:
        expected_by_item = db.scalar(
            select(InventoryExpectedItem).where(
                InventoryExpectedItem.session_id == session_id,
                InventoryExpectedItem.koha_item_id == koha_item_id,
            ),
        )
    expected = expected_by_item or expected_by_barcode
    on_expected_list = expected is not None

    existing_counts = _has_counting_scan(db, session_id, koha_item_id)
    snapshot_location = expected.location if expected is not None else None

    decision = classify_scan(
        matches,
        koha_failed=koha_failed,
        existing_counts=existing_counts,
        on_expected_list=on_expected_list,
        snapshot_location=snapshot_location,
        session_home_library_id=session.home_library_id,
        session_locations=session_locations,
        station_location=station_location,
        damaged=damaged,
    )

    original_scan_id = None
    if decision.outcome == "duplicate" and koha_item_id is not None:
        original_scan_id = db.scalar(
            select(InventoryScan.id).where(
                InventoryScan.session_id == session_id,
                InventoryScan.koha_item_id == koha_item_id,
                InventoryScan.counts.is_(True),
            ),
        )

    scan = _build_scan_row(
        session_id=session_id,
        user_id=user_id,
        trimmed=trimmed,
        station_location=station_location,
        expected=expected,
        matches=matches,
        decision=decision,
        original_scan_id=original_scan_id,
    )

    if decision.counts and koha_item_id is not None:
        nested = db.begin_nested()
        try:
            db.add(scan)
            db.flush()
        except IntegrityError:
            nested.rollback()
            existing_counts = True
            decision = classify_scan(
                matches,
                koha_failed=koha_failed,
                existing_counts=existing_counts,
                on_expected_list=on_expected_list,
                snapshot_location=snapshot_location,
                session_home_library_id=session.home_library_id,
                session_locations=session_locations,
                station_location=station_location,
                damaged=damaged,
            )
            original_scan_id = db.scalar(
                select(InventoryScan.id).where(
                    InventoryScan.session_id == session_id,
                    InventoryScan.koha_item_id == koha_item_id,
                    InventoryScan.counts.is_(True),
                ),
            )
            scan = _build_scan_row(
                session_id=session_id,
                user_id=user_id,
                trimmed=trimmed,
                station_location=station_location,
                expected=expected,
                matches=matches,
                decision=decision,
                original_scan_id=original_scan_id,
            )
            db.add(scan)
            db.flush()
    else:
        db.add(scan)
        db.flush()

    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.scan",
        entity_type="scan",
        entity_id=str(scan.id),
        details={
            "scan_id": str(scan.id),
            "koha_item_id": koha_item_id,
            "outcome": scan.outcome,
            "counts": scan.counts,
        },
    )
    db.commit()
    db.refresh(scan)
    return _scan_payload(scan)


def set_damage(
    db: Session,
    *,
    session_id: uuid.UUID,
    scan_id: uuid.UUID,
    user_id: uuid.UUID,
    damaged: bool,
    remark: str,
) -> dict[str, Any]:
    remark_clean = remark.strip()
    if not remark_clean or len(remark_clean) > _MAX_REMARK:
        raise invalid_scan()

    session = db.get(InventorySession, session_id)
    if session is None or session.status != "in_progress":
        raise invalid_state()

    scan = db.scalar(
        select(InventoryScan).where(
            InventoryScan.id == scan_id,
            InventoryScan.session_id == session_id,
        ),
    )
    if scan is None:
        raise invalid_state()

    before = {"outcome": scan.outcome, "observed_damaged": scan.observed_damaged}
    if scan.outcome in ("found", "misplaced"):
        if damaged:
            scan.match_basis = scan.outcome
            scan.outcome = "damaged"
            scan.observed_damaged = True
        else:
            restore = scan.match_basis or "found"
            scan.outcome = restore
            scan.match_basis = None
            scan.observed_damaged = False
    elif scan.outcome in ("unexpected", "withdrawn", "damaged"):
        if damaged:
            scan.observed_damaged = True
        else:
            scan.observed_damaged = False
            if scan.outcome == "damaged" and scan.match_basis:
                scan.outcome = scan.match_basis
                scan.match_basis = None
    else:
        raise invalid_state()

    after = {"outcome": scan.outcome, "observed_damaged": scan.observed_damaged}
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.damage",
        entity_type="scan",
        entity_id=str(scan.id),
        details={"before": before, "after": after},
    )
    db.commit()
    db.refresh(scan)
    return _scan_payload(scan)


def _validate_barcode(value: str) -> str:
    trimmed = value.strip()
    if not trimmed or len(trimmed) > _MAX_SCAN or _CONTROL.search(trimmed):
        raise invalid_scan()
    return trimmed


def _has_counting_scan(
    db: Session,
    session_id: uuid.UUID,
    koha_item_id: int | None,
) -> bool:
    if koha_item_id is None:
        return False
    return db.scalar(
        select(InventoryScan.id).where(
            InventoryScan.session_id == session_id,
            InventoryScan.koha_item_id == koha_item_id,
            InventoryScan.counts.is_(True),
        ),
    ) is not None


def _koha_item_id(item: dict) -> int | None:
    for key in ("item_id", "itemnumber"):
        value = item.get(key)
        if value is not None:
            return int(value)
    return None


def _optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


def _build_scan_row(
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    trimmed: str,
    station_location: str | None,
    expected: InventoryExpectedItem | None,
    matches: list[dict],
    decision,
    original_scan_id: uuid.UUID | None,
) -> InventoryScan:
    item = matches[0] if len(matches) == 1 else None
    koha_item_id = _koha_item_id(item) if item is not None else None
    live_status = None
    if item is not None:
        live_status = item_status(item)[0]

    return InventoryScan(
        session_id=session_id,
        expected_item_id=expected.id if expected is not None else None,
        koha_item_id=koha_item_id,
        barcode_submitted=trimmed,
        outcome=decision.outcome,
        match_basis=decision.match_basis,
        observed_damaged=decision.observed_damaged,
        counts=decision.counts,
        original_scan_id=original_scan_id,
        operator_id=user_id,
        station_location=station_location,
        live_location=_optional_str(item.get("location")) if item else None,
        live_home_library_id=_optional_str(item.get("home_library_id")) if item else None,
        live_status=live_status,
        title=_optional_str(item.get("title")) if item else None,
        author=_optional_str(item.get("author")) if item else None,
        call_number=_optional_str(item.get("callnumber") or item.get("call_number"))
        if item
        else None,
        item_type_label=_optional_str(item.get("item_type_label")) if item else None,
    )


def _scan_payload(scan: InventoryScan) -> dict[str, Any]:
    return {
        "outcome": scan.outcome,
        "match_basis": scan.match_basis,
        "observed_damaged": scan.observed_damaged,
        "counts": scan.counts,
        "koha_item_id": scan.koha_item_id,
        "title": scan.title,
        "live_status": scan.live_status,
        "station_location": scan.station_location,
        "live_location": scan.live_location,
        "barcode_submitted": scan.barcode_submitted,
    }