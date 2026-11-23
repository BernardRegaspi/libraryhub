from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.inventory import (
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventoryShelfSearch,
)
from app.services.inventory_audit import write_inventory_audit
from app.services.inventory_errors import invalid_scan, invalid_state, not_unverified
from app.services.inventory_rules import expected_condition

_MAX_REMARK = 2000


def mark_not_found(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    expected_item_ids: list[uuid.UUID],
    remark: str,
) -> list[InventoryShelfSearch]:
    remark_clean = remark.strip()
    if not remark_clean or len(remark_clean) > _MAX_REMARK:
        raise invalid_scan()

    session = db.get(InventorySession, session_id)
    if session is None or session.status != "in_progress":
        raise invalid_state()

    if not expected_item_ids:
        raise not_unverified()

    unique_ids = list(dict.fromkeys(expected_item_ids))
    items = list(
        db.scalars(
            select(InventoryExpectedItem).where(
                InventoryExpectedItem.session_id == session_id,
                InventoryExpectedItem.id.in_(unique_ids),
            ),
        ).all(),
    )
    if len(items) != len(unique_ids):
        raise not_unverified()

    scan_outcomes = _counting_outcomes_by_expected(db, session_id)
    active_searches = _active_shelf_searches(db, session_id)

    for item in items:
        condition = expected_condition(
            scan_outcome=scan_outcomes.get(item.id),
            active_shelf_search=item.id in active_searches,
        )
        if condition != "unverified":
            raise not_unverified()

    batch_id = uuid.uuid4()
    rows: list[InventoryShelfSearch] = []
    for item in items:
        row = InventoryShelfSearch(
            session_id=session_id,
            expected_item_id=item.id,
            batch_id=batch_id,
            remark=remark_clean,
            marked_by=user_id,
        )
        db.add(row)
        rows.append(row)

    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.not_found",
        entity_type="session",
        entity_id=str(session_id),
        details={
            "batch_id": str(batch_id),
            "expected_item_ids": [str(item.id) for item in items],
        },
    )
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def reverse_not_found(
    db: Session,
    *,
    session_id: uuid.UUID,
    search_id: uuid.UUID,
    user_id: uuid.UUID,
    remark: str,
) -> InventoryShelfSearch:
    remark_clean = remark.strip()
    if not remark_clean or len(remark_clean) > _MAX_REMARK:
        raise invalid_scan()

    session = db.get(InventorySession, session_id)
    if session is None or session.status != "in_progress":
        raise invalid_state()

    search = db.scalar(
        select(InventoryShelfSearch).where(
            InventoryShelfSearch.id == search_id,
            InventoryShelfSearch.session_id == session_id,
        ),
    )
    if search is None or search.reversed_at is not None:
        raise invalid_state()

    search.reversed_at = datetime.now(timezone.utc)
    search.reversed_by = user_id
    search.reverse_remark = remark_clean

    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.not_found_reverse",
        entity_type="shelf_search",
        entity_id=str(search.id),
        details={
            "search_id": str(search.id),
            "expected_item_id": str(search.expected_item_id),
        },
    )
    db.commit()
    db.refresh(search)
    return search


def _counting_outcomes_by_expected(
    db: Session,
    session_id: uuid.UUID,
) -> dict[uuid.UUID, str]:
    scans = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.counts.is_(True),
        ),
    ).all()
    by_expected: dict[uuid.UUID, str] = {}
    by_koha: dict[int, str] = {}
    for scan in scans:
        if scan.expected_item_id is not None:
            by_expected[scan.expected_item_id] = scan.outcome
        if scan.koha_item_id is not None:
            by_koha[scan.koha_item_id] = scan.outcome

    expected_items = db.scalars(
        select(InventoryExpectedItem).where(InventoryExpectedItem.session_id == session_id),
    ).all()
    outcomes: dict[uuid.UUID, str] = {}
    for item in expected_items:
        outcome = by_expected.get(item.id) or by_koha.get(item.koha_item_id)
        if outcome is not None:
            outcomes[item.id] = outcome
    return outcomes


def _active_shelf_searches(db: Session, session_id: uuid.UUID) -> set[uuid.UUID]:
    return {
        row.expected_item_id
        for row in db.scalars(
            select(InventoryShelfSearch).where(
                InventoryShelfSearch.session_id == session_id,
                InventoryShelfSearch.reversed_at.is_(None),
            ),
        ).all()
    }