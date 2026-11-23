from __future__ import annotations

import json
import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.identity import AppUser, AuditLog, LibraryDepartment
from app.models.inventory import (
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventorySessionLocation,
    InventoryShelfSearch,
)
from app.services.inventory_errors import InventoryError
from app.services.inventory_rules import expected_condition
from app.services.inventory_shelf import mark_not_found, reverse_not_found


def _item(**overrides):
    base = {
        "item_id": 101,
        "external_id": "BK-101",
        "home_library_id": "COLLEGE",
        "holding_library_id": "COLLEGE",
        "location": "STACK-A",
        "item_type_id": "BK",
        "withdrawn": 0,
        "lost_status": 0,
        "damaged_status": 0,
        "not_for_loan_status": 0,
        "checked_out_date": None,
        "title": "Sample title",
    }
    base.update(overrides)
    return base


class FakeKohaClient:
    def __init__(self, catalog: dict[str, list[dict]]):
        self.catalog = catalog

    def search_items(self, params: dict) -> list[dict]:
        q = params.get("q")
        if not isinstance(q, str):
            return []
        barcode = json.loads(q).get("external_id")
        if not isinstance(barcode, str):
            return []
        return list(self.catalog.get(barcode, []))


@pytest.fixture
def staff_user(db):
    user = AppUser(
        username=f"shelf-{uuid.uuid4().hex[:8]}",
        display_name="Shelf Staff",
        email=f"shelf-{uuid.uuid4().hex[:8]}@test.local",
        status="active",
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def mapped_department(db):
    dept = LibraryDepartment(
        code=f"COL-{uuid.uuid4().hex[:6]}",
        name="College Library",
        koha_branchcode="COLLEGE",
    )
    db.add(dept)
    db.flush()
    return dept


@pytest.fixture
def three_item_session(db, staff_user, mapped_department):
    session = InventorySession(
        department_id=mapped_department.id,
        name="Shelf session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        expected_count=3,
        created_by=staff_user.id,
    )
    db.add(session)
    db.flush()
    db.add(InventorySessionLocation(session_id=session.id, location="STACK-A"))
    items = []
    for idx, barcode in enumerate(("AAA", "BBB", "CCC"), start=1):
        row = InventoryExpectedItem(
            session_id=session.id,
            koha_item_id=idx,
            barcode=barcode,
            location="STACK-A",
            koha_status="available",
        )
        db.add(row)
        items.append(row)
    db.commit()
    return {"session": session, "items": items}


def _condition_map(db, session_id: uuid.UUID) -> dict[uuid.UUID, str]:
    expected_items = db.scalars(
        select(InventoryExpectedItem).where(InventoryExpectedItem.session_id == session_id),
    ).all()
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

    conditions: dict[uuid.UUID, str] = {}
    for item in expected_items:
        outcome = scan_by_expected.get(item.id) or scan_by_koha.get(item.koha_item_id)
        conditions[item.id] = expected_condition(
            scan_outcome=outcome,
            active_shelf_search=item.id in active_searches,
        )
    return conditions


def _shelf_search_count(db, session_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(InventoryShelfSearch)
            .where(InventoryShelfSearch.session_id == session_id),
        )
        or 0
    )


def test_not_found_marks_and_reverse(db, staff_user, three_item_session):
    from app.services.inventory_scans import submit_scan

    session = three_item_session["session"]
    items = three_item_session["items"]
    session_id = session.id
    item_a, item_b, item_c = items

    rows = mark_not_found(
        db,
        session_id=session_id,
        user_id=staff_user.id,
        expected_item_ids=[item_a.id, item_b.id],
        remark="Shelf B empty",
    )
    assert len(rows) == 2
    assert rows[0].batch_id == rows[1].batch_id
    assert rows[0].remark == "Shelf B empty"
    conditions = _condition_map(db, session_id)
    assert conditions[item_a.id] == "not_found"
    assert conditions[item_b.id] == "not_found"
    assert conditions[item_c.id] == "unverified"

    client = FakeKohaClient({"CCC": [_item(item_id=3, external_id="CCC")]})
    submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="CCC",
        station_location="STACK-A",
        damaged=False,
    )
    before_rows = _shelf_search_count(db, session_id)
    with pytest.raises(InventoryError) as exc_info:
        mark_not_found(
            db,
            session_id=session_id,
            user_id=staff_user.id,
            expected_item_ids=[item_a.id, item_b.id, item_c.id],
            remark="Again",
        )
    assert exc_info.value.code == "not_unverified"
    assert _shelf_search_count(db, session_id) == before_rows

    client_a = FakeKohaClient({"AAA": [_item(item_id=1, external_id="AAA")]})
    submit_scan(
        db,
        client_a,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="AAA",
        station_location="STACK-A",
        damaged=False,
    )
    active_a = db.scalar(
        select(InventoryShelfSearch).where(
            InventoryShelfSearch.expected_item_id == item_a.id,
            InventoryShelfSearch.reversed_at.is_(None),
        ),
    )
    assert active_a is not None
    conditions = _condition_map(db, session_id)
    assert conditions[item_a.id] == "found"

    search_b = db.scalar(
        select(InventoryShelfSearch).where(
            InventoryShelfSearch.expected_item_id == item_b.id,
            InventoryShelfSearch.reversed_at.is_(None),
        ),
    )
    assert search_b is not None
    reversed_b = reverse_not_found(
        db,
        session_id=session_id,
        search_id=search_b.id,
        user_id=staff_user.id,
        remark="Located on shelf",
    )
    assert reversed_b.reversed_at is not None
    assert reversed_b.reverse_remark == "Located on shelf"
    conditions = _condition_map(db, session_id)
    assert conditions[item_b.id] == "unverified"

    reversed_a = reverse_not_found(
        db,
        session_id=session_id,
        search_id=active_a.id,
        user_id=staff_user.id,
        remark="Clear mark",
    )
    assert reversed_a.reversed_at is not None
    conditions = _condition_map(db, session_id)
    assert conditions[item_a.id] == "found"
    scan_a = db.scalar(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.koha_item_id == 1,
            InventoryScan.counts.is_(True),
        ),
    )
    assert scan_a is not None
    assert scan_a.outcome == "found"

    audit = db.scalar(
        select(AuditLog).where(AuditLog.action == "inventory.not_found"),
    )
    assert audit is not None
    assert "barcode" not in (audit.details or {})
    assert audit.details["batch_id"] == str(rows[0].batch_id)
    assert set(audit.details["expected_item_ids"]) == {str(item_a.id), str(item_b.id)}


def test_mark_not_found_completed_session_raises(db, staff_user, three_item_session):
    session = three_item_session["session"]
    item_a = three_item_session["items"][0]
    session.status = "completed"
    db.commit()

    with pytest.raises(InventoryError) as exc_info:
        mark_not_found(
            db,
            session_id=session.id,
            user_id=staff_user.id,
            expected_item_ids=[item_a.id],
            remark="Too late",
        )
    assert exc_info.value.code == "invalid_state"
    assert _shelf_search_count(db, session.id) == 0