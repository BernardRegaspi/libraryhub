from __future__ import annotations

import json
import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.integrations.koha.exceptions import KohaTimeoutError
from app.models.identity import AppUser, AuditLog, LibraryDepartment
from app.models.inventory import (
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
    InventorySessionLocation,
)
from app.services.inventory_errors import InventoryError
from app.services.inventory_scans import set_damage, submit_scan
from app.services.inventory_sessions import session_summary


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
    def __init__(self, catalog: dict[str, list[dict]], *, timeout_barcodes: frozenset[str] | None = None):
        self.catalog = catalog
        self.timeout_barcodes = timeout_barcodes or frozenset()
        self._timeout_seen: set[str] = set()
        self.calls: list[dict] = []

    def search_items(self, params: dict) -> list[dict]:
        self.calls.append(params)
        q = params.get("q")
        if not isinstance(q, str):
            return []
        barcode = json.loads(q).get("external_id")
        if not isinstance(barcode, str):
            return []
        if barcode in self.timeout_barcodes and barcode not in self._timeout_seen:
            self._timeout_seen.add(barcode)
            raise KohaTimeoutError()
        return list(self.catalog.get(barcode, []))


@pytest.fixture
def staff_user(db):
    user = AppUser(
        username=f"scan-{uuid.uuid4().hex[:8]}",
        display_name="Scan Staff",
        email=f"scan-{uuid.uuid4().hex[:8]}@test.local",
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
def in_progress_session(db, staff_user, mapped_department):
    session = InventorySession(
        department_id=mapped_department.id,
        name="Scan session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        expected_count=2,
        created_by=staff_user.id,
    )
    db.add(session)
    db.flush()
    db.add(InventorySessionLocation(session_id=session.id, location="STACK-A"))
    db.add(InventorySessionLocation(session_id=session.id, location="STACK-B"))
    db.add(
        InventoryExpectedItem(
            session_id=session.id,
            koha_item_id=1,
            barcode="AAA",
            location="STACK-A",
            koha_status="available",
        ),
    )
    db.add(
        InventoryExpectedItem(
            session_id=session.id,
            koha_item_id=2,
            barcode="BBB",
            location="STACK-A",
            koha_status="available",
        ),
    )
    db.commit()
    return session


@pytest.fixture
def in_progress_session_stack_a_only(db, staff_user, mapped_department):
    session = InventorySession(
        department_id=mapped_department.id,
        name="Single-location scan session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        expected_count=1,
        created_by=staff_user.id,
    )
    db.add(session)
    db.flush()
    db.add(InventorySessionLocation(session_id=session.id, location="STACK-A"))
    db.add(
        InventoryExpectedItem(
            session_id=session.id,
            koha_item_id=1,
            barcode="AAA",
            location="STACK-A",
            koha_status="available",
        ),
    )
    db.commit()
    return session


def _scan_count(db, session_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(InventoryScan)
            .where(InventoryScan.session_id == session_id),
        )
        or 0
    )


def _expected_count(db, session_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(InventoryExpectedItem)
            .where(InventoryExpectedItem.session_id == session_id),
        )
        or 0
    )


def test_submit_scan_flow_and_damage(db, staff_user, in_progress_session):
    session_id = in_progress_session.id
    client = FakeKohaClient(
        {
            "AAA": [_item(item_id=1, external_id="AAA")],
            "BBB": [_item(item_id=2, external_id="BBB")],
            "UNX": [_item(item_id=3, external_id="UNX", home_library_id="OTHER")],
            "WTH": [_item(item_id=4, external_id="WTH", withdrawn=1)],
        },
        timeout_barcodes=frozenset({"AAA"}),
    )

    with pytest.raises(InventoryError) as exc_info:
        submit_scan(
            db,
            client,
            session_id=session_id,
            user_id=staff_user.id,
            barcode="A\u0001",
            station_location="STACK-A",
            damaged=False,
        )
    assert exc_info.value.code == "invalid_scan"
    assert _scan_count(db, session_id) == 0

    ghost = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="NOPE",
        station_location="STACK-A",
        damaged=False,
    )
    assert ghost["outcome"] == "invalid"
    assert ghost["counts"] is False

    timeout_first = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="AAA",
        station_location="STACK-A",
        damaged=False,
    )
    assert timeout_first["outcome"] == "koha_error"
    assert _expected_count(db, session_id) == 2
    first_aaa = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="AAA",
        station_location="STACK-A",
        damaged=False,
    )
    assert first_aaa["outcome"] == "found"
    assert first_aaa["counts"] is True
    assert session_summary(db, session_id)["completion"] == 0.5

    dup_aaa = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="AAA",
        station_location="STACK-A",
        damaged=False,
    )
    assert dup_aaa["outcome"] == "duplicate"
    assert dup_aaa["counts"] is False
    original_id = db.scalars(
        select(InventoryScan.id).where(
            InventoryScan.session_id == session_id,
            InventoryScan.barcode_submitted == "AAA",
            InventoryScan.outcome == "found",
        ),
    ).one()
    dup_row = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.outcome == "duplicate",
        ),
    ).one()
    assert dup_row.original_scan_id == original_id
    assert session_summary(db, session_id)["completion"] == 0.5

    misplaced = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="BBB",
        station_location="STACK-B",
        damaged=False,
    )
    assert misplaced["outcome"] == "misplaced"
    assert misplaced["counts"] is True

    unexpected = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="UNX",
        station_location="STACK-A",
        damaged=False,
    )
    assert unexpected["outcome"] == "unexpected"
    assert _expected_count(db, session_id) == 2

    withdrawn = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="WTH",
        station_location="STACK-A",
        damaged=False,
    )
    assert withdrawn["outcome"] == "withdrawn"
    assert _expected_count(db, session_id) == 2

    found_scan_id = db.scalars(
        select(InventoryScan.id).where(
            InventoryScan.session_id == session_id,
            InventoryScan.outcome == "found",
        ),
    ).one()
    damage_found = set_damage(
        db,
        session_id=session_id,
        scan_id=found_scan_id,
        user_id=staff_user.id,
        damaged=True,
        remark="Torn spine",
    )
    assert damage_found["outcome"] == "damaged"
    assert damage_found["match_basis"] == "found"
    damage_audit = db.scalars(
        select(AuditLog).where(
            AuditLog.action == "inventory.damage",
            AuditLog.entity_id == str(found_scan_id),
        ),
    ).one()
    assert damage_audit is not None
    assert "before" in damage_audit.details
    assert "after" in damage_audit.details
    assert "barcode" not in (damage_audit.details or {})

    unexpected_scan_id = db.scalars(
        select(InventoryScan.id).where(
            InventoryScan.session_id == session_id,
            InventoryScan.outcome == "unexpected",
        ),
    ).one()
    damage_unexpected = set_damage(
        db,
        session_id=session_id,
        scan_id=unexpected_scan_id,
        user_id=staff_user.id,
        damaged=True,
        remark="Cover torn",
    )
    assert damage_unexpected["outcome"] == "unexpected"
    assert damage_unexpected["observed_damaged"] is True


def test_submit_scan_completed_session_raises(db, staff_user, in_progress_session):
    in_progress_session.status = "completed"
    db.commit()
    client = FakeKohaClient({"AAA": [_item(item_id=1, external_id="AAA")]})
    with pytest.raises(InventoryError) as exc_info:
        submit_scan(
            db,
            client,
            session_id=in_progress_session.id,
            user_id=staff_user.id,
            barcode="AAA",
            station_location="STACK-A",
            damaged=False,
        )
    assert exc_info.value.code == "invalid_state"


def test_submit_scan_committed_duplicate_is_single_counter(db, staff_user, in_progress_session):
    session_id = in_progress_session.id
    client = FakeKohaClient(
        {
            "NEW": [_item(item_id=99, external_id="NEW", title="New copy")],
        },
    )
    first = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="NEW",
        station_location="STACK-A",
        damaged=False,
    )
    assert first["counts"] is True
    db.commit()
    second = submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="NEW",
        station_location="STACK-A",
        damaged=False,
    )
    assert second["outcome"] == "duplicate"
    counting = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.koha_item_id == 99,
            InventoryScan.counts.is_(True),
        ),
    ).all()
    assert len(counting) == 1


def test_submit_scan_rejects_station_location_outside_session(
    db,
    staff_user,
    in_progress_session_stack_a_only,
):
    session_id = in_progress_session_stack_a_only.id
    client = FakeKohaClient({"AAA": [_item(item_id=1, external_id="AAA")]})

    with pytest.raises(InventoryError) as exc_info:
        submit_scan(
            db,
            client,
            session_id=session_id,
            user_id=staff_user.id,
            barcode="AAA",
            station_location=None,
            damaged=False,
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "invalid_state"
    assert _scan_count(db, session_id) == 0

    with pytest.raises(InventoryError) as exc_info:
        submit_scan(
            db,
            client,
            session_id=session_id,
            user_id=staff_user.id,
            barcode="AAA",
            station_location="",
            damaged=False,
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "invalid_state"
    assert _scan_count(db, session_id) == 0

    with pytest.raises(InventoryError) as exc_info:
        submit_scan(
            db,
            client,
            session_id=session_id,
            user_id=staff_user.id,
            barcode="AAA",
            station_location="STACK-B",
            damaged=False,
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.code == "invalid_state"
    assert _scan_count(db, session_id) == 0
    assert client.calls == []


@pytest.fixture
def found_scan_row(db, staff_user, in_progress_session_stack_a_only):
    session_id = in_progress_session_stack_a_only.id
    client = FakeKohaClient({"AAA": [_item(item_id=1, external_id="AAA")]})
    submit_scan(
        db,
        client,
        session_id=session_id,
        user_id=staff_user.id,
        barcode="AAA",
        station_location="STACK-A",
        damaged=False,
    )
    scan = db.scalars(
        select(InventoryScan).where(
            InventoryScan.session_id == session_id,
            InventoryScan.outcome == "found",
        ),
    ).one()
    return scan


def test_set_damage_rejects_empty_or_overlong_remark(db, staff_user, found_scan_row):
    session_id = found_scan_row.session_id
    scan_id = found_scan_row.id

    with pytest.raises(InventoryError) as exc_info:
        set_damage(
            db,
            session_id=session_id,
            scan_id=scan_id,
            user_id=staff_user.id,
            damaged=True,
            remark="",
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "invalid_scan"
    db.expire(found_scan_row)
    assert found_scan_row.outcome == "found"

    with pytest.raises(InventoryError) as exc_info:
        set_damage(
            db,
            session_id=session_id,
            scan_id=scan_id,
            user_id=staff_user.id,
            damaged=True,
            remark="x" * 2001,
        )
    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "invalid_scan"
    db.expire(found_scan_row)
    assert found_scan_row.outcome == "found"