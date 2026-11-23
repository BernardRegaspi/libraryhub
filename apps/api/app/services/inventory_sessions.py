from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.integrations.koha.availability import item_status
from app.integrations.koha.exceptions import KohaConnectionError, KohaTimeoutError
from app.integrations.koha.inventory import InventoryCapabilities
from app.models.identity import LibraryDepartment
from app.models.inventory import (
    InventoryAdjustment,
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventorySessionLocation,
    InventorySessionOperator,
    InventoryShelfSearch,
)
from app.services.inventory_audit import write_inventory_audit
from app.services.inventory_errors import (
    InventoryError,
    ambiguous_barcode,
    branch_unmapped,
    invalid_state,
    inventory_unavailable,
    unsupported,
)
from app.services.inventory_rules import expected_condition, keep_for_snapshot

_PER_PAGE = 50
_EXCEPTION_CONDITIONS = frozenset({"not_found", "misplaced", "unexpected", "damaged", "withdrawn"})
_OPEN_ADJUSTMENT_STATUSES = frozenset({"draft", "approved", "failed"})


def create_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    department_id: uuid.UUID,
    name: str,
    description: str | None,
    start_on: date,
    target_on: date | None,
    locations: list[str],
    item_type_id: int | None,
    operator_ids: list[uuid.UUID],
) -> InventorySession:
    department = db.get(LibraryDepartment, department_id)
    if department is None:
        raise InventoryError(404, "not_found", "That department was not found.")
    branch = (department.koha_branchcode or "").strip()
    if not branch:
        raise branch_unmapped()
    session = InventorySession(
        department_id=department_id,
        name=name,
        description=description,
        status="draft",
        home_library_id=branch,
        item_type_id=item_type_id,
        start_on=start_on,
        target_on=target_on,
        created_by=user_id,
    )
    db.add(session)
    db.flush()
    _replace_locations(db, session.id, locations)
    _replace_operators(db, session.id, operator_ids)
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.session_create",
        entity_type="session",
        entity_id=str(session.id),
        details={
            "session_id": str(session.id),
            "department_id": str(department_id),
            "home_library_id": branch,
        },
    )
    db.commit()
    db.refresh(session)
    return session


def update_draft(db: Session, session: InventorySession, changes: dict[str, Any]) -> InventorySession:
    if session.status != "draft":
        raise invalid_state()
    audit_changes: dict[str, dict[str, Any]] = {}
    scalar_fields = ("name", "description", "start_on", "target_on", "item_type_id")
    for field in scalar_fields:
        if field not in changes:
            continue
        before = getattr(session, field)
        after = changes[field]
        if before == after:
            continue
        setattr(session, field, after)
        audit_changes[field] = {"before": before, "after": after}
    if "locations" in changes:
        before = _location_rows(db, session.id)
        after = list(changes["locations"])
        if before != after:
            _replace_locations(db, session.id, after)
            audit_changes["locations"] = {"before": before, "after": after}
    if "operator_ids" in changes:
        before = _operator_rows(db, session.id)
        after = [str(value) for value in changes["operator_ids"]]
        if [str(row) for row in before] != after:
            _replace_operators(db, session.id, changes["operator_ids"])
            audit_changes["operators"] = {"before": [str(row) for row in before], "after": after}
    if audit_changes:
        write_inventory_audit(
            db,
            user_id=None,
            action="inventory.session_update",
            entity_type="session",
            entity_id=str(session.id),
            details=audit_changes,
        )
    db.commit()
    db.refresh(session)
    return session


def start_session(
    db: Session,
    client,
    caps: InventoryCapabilities,
    session_id: uuid.UUID,
) -> InventorySession:
    stmt = (
        select(InventorySession)
        .where(InventorySession.id == session_id)
        .with_for_update()
    )
    session = db.execute(stmt).scalar_one()
    if session.status != "draft":
        raise invalid_state()
    if caps.item_list is None:
        raise unsupported()
    location_rows = db.scalars(
        select(InventorySessionLocation.location).where(
            InventorySessionLocation.session_id == session.id,
        ),
    ).all()
    locations = frozenset(location_rows)
    item_type = str(session.item_type_id) if session.item_type_id is not None else None
    kept: list[dict] = []
    page = 1
    try:
        while True:
            params = {
                caps.item_list.library_param: session.home_library_id,
                "_page": page,
                "_per_page": _PER_PAGE,
            }
            batch = client.get_json(caps.item_list.path, params)
            if not isinstance(batch, list):
                batch = []
            for item in batch:
                if keep_for_snapshot(
                    item,
                    home_library_id=session.home_library_id,
                    locations=locations,
                    item_type_id=item_type,
                ):
                    kept.append(item)
            if len(batch) < _PER_PAGE:
                break
            page += 1
    except (KohaConnectionError, KohaTimeoutError):
        db.rollback()
        raise inventory_unavailable() from None

    seen_barcodes: set[str] = set()
    for item in kept:
        barcode = _koha_barcode(item)
        if barcode in seen_barcodes:
            db.rollback()
            raise ambiguous_barcode()
        seen_barcodes.add(barcode)

    now = datetime.now(timezone.utc)
    session.status = "in_progress"
    session.started_at = now
    session.snapshot_taken_at = now
    session.expected_count = len(kept)
    for item in kept:
        db.add(_expected_row(session, item))
    write_inventory_audit(
        db,
        user_id=None,
        action="inventory.session_start",
        entity_type="session",
        entity_id=str(session.id),
        details={"expected_count": len(kept)},
    )
    db.commit()
    db.refresh(session)
    return session


def complete_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> InventorySession:
    session = db.get(InventorySession, session_id)
    if session is None or session.status != "in_progress":
        raise invalid_state()
    session.status = "completed"
    session.completed_at = datetime.now(timezone.utc)
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.session_complete",
        entity_type="session",
        entity_id=str(session.id),
        details={"session_id": str(session.id)},
    )
    db.commit()
    db.refresh(session)
    return session


def cancel_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> InventorySession:
    session = db.get(InventorySession, session_id)
    if session is None or session.status not in ("draft", "in_progress"):
        raise invalid_state()
    previous = session.status
    session.status = "cancelled"
    session.cancelled_at = datetime.now(timezone.utc)
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.session_cancel",
        entity_type="session",
        entity_id=str(session.id),
        details={"session_id": str(session.id), "previous_status": previous},
    )
    db.commit()
    db.refresh(session)
    return session


def reopen_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
) -> InventorySession:
    session = db.get(InventorySession, session_id)
    if session is None or session.status != "completed":
        raise invalid_state()
    session.status = "in_progress"
    session.reopened_at = datetime.now(timezone.utc)
    session.completed_at = None
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.session_reopen",
        entity_type="session",
        entity_id=str(session.id),
        details={"session_id": str(session.id)},
    )
    db.commit()
    db.refresh(session)
    return session


def list_sessions(
    db: Session,
    *,
    department_id: uuid.UUID,
    status: str,
    q: str,
    page: int,
    per_page: int,
) -> dict[str, Any]:
    stmt = select(InventorySession).where(InventorySession.department_id == department_id)
    if q:
        stmt = stmt.where(InventorySession.name.ilike(f"%{q}%"))
    if status == "active":
        stmt = stmt.where(InventorySession.status == "in_progress")
    elif status == "planned":
        stmt = stmt.where(InventorySession.status == "draft")
    elif status == "review":
        open_adj = (
            select(InventoryAdjustment.id)
            .where(
                InventoryAdjustment.session_id == InventorySession.id,
                InventoryAdjustment.status.in_(_OPEN_ADJUSTMENT_STATUSES),
            )
            .correlate(InventorySession)
            .exists()
        )
        stmt = stmt.where(InventorySession.status == "completed", open_adj)
    elif status == "closed":
        stmt = stmt.where(InventorySession.status.in_(("completed", "cancelled")))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    offset = (page - 1) * per_page
    rows = db.scalars(
        stmt.order_by(InventorySession.created_at.desc()).offset(offset).limit(per_page),
    ).all()
    return {
        "items": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def list_session_items(
    db: Session,
    session: InventorySession,
    *,
    condition: str,
    q: str,
    location: str,
    page: int,
    per_page: int,
    sort: str,
    direction: str,
    include_barcode: bool,
) -> dict[str, Any]:
    from app.services.inventory_exports import export_rows

    rows = export_rows(
        db,
        session_id=session.id,
        kind="filter",
        item_query={
            "condition": condition,
            "q": q,
            "location": location,
            "sort": sort,
            "direction": direction,
        },
        include_barcode=include_barcode,
    )
    total = len(rows)
    offset = (page - 1) * per_page
    page_rows = rows[offset : offset + per_page]
    return {
        "items": page_rows,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


def session_summary(db: Session, session_id: uuid.UUID) -> dict[str, Any]:
    expected_items = db.scalars(
        select(InventoryExpectedItem).where(InventoryExpectedItem.session_id == session_id),
    ).all()
    expected_count = len(expected_items)
    counting_scans = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.counts.is_(True),
        ),
    ).all()
    active_searches = {
        row.expected_item_id
        for row in db.scalars(
            select(InventoryShelfSearch).where(
                InventoryShelfSearch.session_id == session_id,
                InventoryShelfSearch.reversed_at.is_(None),
            ),
        ).all()
    }
    scan_by_expected: dict[uuid.UUID, str] = {}
    scan_by_koha: dict[int, str] = {}
    for scan in counting_scans:
        if scan.expected_item_id is not None:
            scan_by_expected[scan.expected_item_id] = scan.outcome
        if scan.koha_item_id is not None:
            scan_by_koha[scan.koha_item_id] = scan.outcome

    scanned = 0
    unverified = 0
    open_exception_items: set[uuid.UUID] = set()
    for item in expected_items:
        outcome = scan_by_expected.get(item.id) or scan_by_koha.get(item.koha_item_id)
        if outcome is not None:
            scanned += 1
        condition = expected_condition(
            scan_outcome=outcome,
            active_shelf_search=item.id in active_searches,
        )
        if condition == "unverified":
            unverified += 1
        elif condition in _EXCEPTION_CONDITIONS:
            open_exception_items.add(item.id)

    for scan in counting_scans:
        if scan.expected_item_id is None and scan.outcome in _EXCEPTION_CONDITIONS:
            open_exception_items.add(scan.id)

    bar = {name: 0 for name in ("found", "misplaced", "damaged", "withdrawn", "unexpected")}
    for scan in counting_scans:
        if scan.outcome in bar:
            bar[scan.outcome] += 1

    proposals_open = db.scalar(
        select(func.count()).select_from(InventoryAdjustment).where(
            InventoryAdjustment.session_id == session_id,
            InventoryAdjustment.status.in_(_OPEN_ADJUSTMENT_STATUSES),
        ),
    ) or 0

    completion = (scanned / expected_count) if expected_count else 0
    return {
        "expected": expected_count,
        "scanned": scanned,
        "unverified": unverified,
        "open_exceptions": len(open_exception_items),
        "proposals_open": proposals_open,
        "found": bar["found"],
        "misplaced": bar["misplaced"],
        "damaged": bar["damaged"],
        "withdrawn": bar["withdrawn"],
        "unexpected": bar["unexpected"],
        "completion": completion,
    }


def _replace_locations(db: Session, session_id: uuid.UUID, locations: list[str]) -> None:
    db.execute(
        delete(InventorySessionLocation).where(
            InventorySessionLocation.session_id == session_id,
        ),
    )
    for location in locations:
        db.add(InventorySessionLocation(session_id=session_id, location=location))


def _replace_operators(db: Session, session_id: uuid.UUID, operator_ids: list[uuid.UUID]) -> None:
    db.execute(
        delete(InventorySessionOperator).where(
            InventorySessionOperator.session_id == session_id,
        ),
    )
    for operator_id in operator_ids:
        db.add(InventorySessionOperator(session_id=session_id, user_id=operator_id))


def _location_rows(db: Session, session_id: uuid.UUID) -> list[str]:
    return list(
        db.scalars(
            select(InventorySessionLocation.location)
            .where(InventorySessionLocation.session_id == session_id)
            .order_by(InventorySessionLocation.location),
        ).all(),
    )


def _operator_rows(db: Session, session_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(InventorySessionOperator.user_id)
            .where(InventorySessionOperator.session_id == session_id)
            .order_by(InventorySessionOperator.user_id),
        ).all(),
    )


def _koha_item_id(item: dict) -> int:
    for key in ("item_id", "itemnumber"):
        value = item.get(key)
        if value is not None:
            return int(value)
    raise ValueError("Koha item is missing item_id")


def _koha_barcode(item: dict) -> str:
    for key in ("barcode", "external_id"):
        value = item.get(key)
        if value not in (None, ""):
            return str(value)
    return ""


def _expected_row(session: InventorySession, item: dict) -> InventoryExpectedItem:
    status_key = item_status(item)[0]
    if status_key not in ("available", "damaged", "not_for_loan"):
        status_key = "available"
    item_type_id = _optional_int(item.get("item_type_id"))
    return InventoryExpectedItem(
        session_id=session.id,
        koha_item_id=_koha_item_id(item),
        barcode=_koha_barcode(item),
        biblio_id=_optional_int(item.get("biblio_id")),
        title=_optional_str(item.get("title")),
        author=_optional_str(item.get("author")),
        call_number=_optional_str(item.get("call_number")),
        item_type_id=item_type_id,
        item_type_label=_optional_str(item.get("item_type_label")),
        home_library_id=_optional_str(item.get("home_library_id")),
        holding_library_id=_optional_str(item.get("holding_library_id")),
        location=_optional_str(item.get("location")),
        koha_status=status_key,
    )


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)