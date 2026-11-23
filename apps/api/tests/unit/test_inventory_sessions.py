from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.integrations.koha.exceptions import KohaConnectionError
from app.integrations.koha.inventory import (
    InventoryCapabilities,
    ItemListCapability,
    get_inventory_capabilities,
)
from app.models.identity import AppUser, AuditLog, LibraryDepartment
from app.models.inventory import (
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
)
from app.services.inventory_errors import InventoryError
from app.services.inventory_sessions import create_session, session_summary, start_session


def _item(**overrides):
    base = {
        "item_id": 101,
        "barcode": "BK-101",
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


class FakeKohaClient:
    def __init__(self, pages: list[list[dict] | Exception]):
        self.pages = pages
        self.calls: list[tuple[str, dict]] = []

    def get_json(self, path: str, params: dict):
        self.calls.append((path, params))
        page_num = int(params.get("_page", 1))
        if page_num > len(self.pages):
            return []
        page = self.pages[page_num - 1]
        if isinstance(page, Exception):
            raise page
        return page


@pytest.fixture
def staff_user(db):
    user = AppUser(
        username=f"inv-{uuid.uuid4().hex[:8]}",
        display_name="Inventory Staff",
        email=f"inv-{uuid.uuid4().hex[:8]}@test.local",
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
def unmapped_department(db):
    dept = LibraryDepartment(
        code=f"UNM-{uuid.uuid4().hex[:6]}",
        name="Unmapped",
        koha_branchcode=None,
    )
    db.add(dept)
    db.flush()
    return dept


def _session_count(db) -> int:
    return db.scalar(select(func.count()).select_from(InventorySession)) or 0


def test_create_branch_unmapped_raises_and_inserts_no_session(
    db,
    staff_user,
    unmapped_department,
):
    with pytest.raises(InventoryError) as exc_info:
        create_session(
            db,
            user_id=staff_user.id,
            department_id=unmapped_department.id,
            name="Fall count",
            description=None,
            start_on=date(2026, 11, 1),
            target_on=None,
            locations=[],
            item_type_id=None,
            operator_ids=[],
        )
    assert exc_info.value.code == "branch_unmapped"
    assert _session_count(db) == 0


def test_create_with_branch_is_draft_without_koha(
    db,
    staff_user,
    mapped_department,
):
    client = FakeKohaClient([])
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description="Scope A",
        start_on=date(2026, 11, 1),
        target_on=date(2026, 11, 30),
        locations=["STACK-A"],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    assert session.status == "draft"
    assert session.home_library_id == "COLLEGE"
    assert client.calls == []


def test_start_without_item_list_raises_and_stays_draft(
    db,
    staff_user,
    mapped_department,
):
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    client = FakeKohaClient([[_item()]])
    with pytest.raises(InventoryError) as exc_info:
        start_session(db, client, get_inventory_capabilities(), session.id)
    assert exc_info.value.code == "inventory_unsupported"
    db.expire_all()
    fresh = db.get(InventorySession, session.id)
    assert fresh is not None
    assert fresh.status == "draft"


def test_start_keeps_on_shelf_item_and_audits(db, staff_user, mapped_department):
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    pages = [
        [
            _item(item_id=1, barcode="ON-1"),
            _item(item_id=2, barcode="OUT-1", checked_out_date="2026-11-01"),
        ]
    ]
    client = FakeKohaClient(pages)
    caps = InventoryCapabilities(
        item_list=ItemListCapability("GET", "/items", "home_library_id"),
    )
    started = start_session(db, client, caps, session.id)
    assert started.status == "in_progress"
    assert started.expected_count == 1
    expected_rows = db.scalars(
        select(InventoryExpectedItem).where(InventoryExpectedItem.session_id == session.id),
    ).all()
    assert len(expected_rows) == 1
    assert expected_rows[0].barcode == "ON-1"
    audit = db.scalars(
        select(AuditLog).where(AuditLog.action == "inventory.session_start"),
    ).one()
    assert audit.module == "inventory"
    assert audit.details == {"expected_count": 1}
    assert "barcode" not in (audit.details or {})


def test_start_second_page_connection_error_rolls_back(db, staff_user, mapped_department):
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    page_one = [_item(item_id=i, barcode=f"B{i}") for i in range(1, 51)]
    client = FakeKohaClient([page_one, KohaConnectionError()])
    caps = InventoryCapabilities(
        item_list=ItemListCapability("GET", "/items", "home_library_id"),
    )
    with pytest.raises(InventoryError) as exc_info:
        start_session(db, client, caps, session.id)
    assert exc_info.value.code == "inventory_unavailable"
    db.expire_all()
    fresh = db.get(InventorySession, session.id)
    assert fresh is not None
    assert fresh.status == "draft"
    count = db.scalar(
        select(func.count()).select_from(InventoryExpectedItem).where(
            InventoryExpectedItem.session_id == session.id,
        ),
    )
    assert count == 0


def test_start_ambiguous_barcode_leaves_draft(db, staff_user, mapped_department):
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    client = FakeKohaClient(
        [
            [
                _item(item_id=1, barcode="DUP"),
                _item(item_id=2, barcode="DUP"),
            ]
        ],
    )
    caps = InventoryCapabilities(
        item_list=ItemListCapability("GET", "/items", "home_library_id"),
    )
    with pytest.raises(InventoryError) as exc_info:
        start_session(db, client, caps, session.id)
    assert exc_info.value.code == "ambiguous_barcode"
    db.expire_all()
    fresh = db.get(InventorySession, session.id)
    assert fresh is not None
    assert fresh.status == "draft"


def test_start_again_on_in_progress_raises_invalid_state(db, staff_user, mapped_department):
    session = create_session(
        db,
        user_id=staff_user.id,
        department_id=mapped_department.id,
        name="Fall count",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    db.commit()
    client = FakeKohaClient([[_item()]])
    caps = InventoryCapabilities(
        item_list=ItemListCapability("GET", "/items", "home_library_id"),
    )
    start_session(db, client, caps, session.id)
    with pytest.raises(InventoryError) as exc_info:
        start_session(db, client, caps, session.id)
    assert exc_info.value.code == "invalid_state"


def test_session_summary_counts_completion(db, staff_user, mapped_department):
    session = InventorySession(
        department_id=mapped_department.id,
        name="Summary session",
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
    first = InventoryExpectedItem(
        session_id=session.id,
        koha_item_id=1,
        barcode="A-1",
        koha_status="available",
    )
    second = InventoryExpectedItem(
        session_id=session.id,
        koha_item_id=2,
        barcode="A-2",
        koha_status="available",
    )
    db.add_all([first, second])
    db.flush()
    db.add(
        InventoryScan(
            session_id=session.id,
            expected_item_id=first.id,
            koha_item_id=1,
            barcode_submitted="A-1",
            outcome="found",
            match_basis=None,
            counts=True,
        ),
    )
    db.commit()
    summary = session_summary(db, session.id)
    assert summary["expected"] == 2
    assert summary["scanned"] == 1
    assert summary["unverified"] == 1
    assert summary["completion"] == 0.5