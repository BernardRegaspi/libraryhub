from __future__ import annotations

import csv
import io
import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.integrations.koha.exceptions import KohaRequestError
from app.integrations.koha.inventory import InventoryCapabilities, ReadCapability
from app.models.identity import AppUser, LibraryDepartment
from app.models.inventory import (
    InventoryAdjustment,
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
)
from app.services.inventory_adjustments import (
    decide_adjustment,
    draft_adjustment,
    submit_adjustment,
)
from app.services.inventory_errors import InventoryError
from app.services.inventory_exports import export_rows, render_export


class FakeKohaClient:
    def __init__(self, *, behavior: str = "ok"):
        self.behavior = behavior
        self.put_calls: list[tuple[str, object]] = []
        self.post_calls: list[tuple[str, object]] = []

    def put_json(self, path: str, body: object, **_kwargs):
        self.put_calls.append((path, body))
        if self.behavior == "error":
            raise KohaRequestError(400, [], "no")
        return {"item_id": 9}, {}

    def post_json(self, path: str, body: object, **_kwargs):
        self.post_calls.append((path, body))
        if self.behavior == "error":
            raise KohaRequestError(400, [], "no")
        return {"item_id": 9}, {}


@pytest.fixture
def drafter(db):
    user = AppUser(
        username=f"draft-{uuid.uuid4().hex[:8]}",
        display_name="Drafter",
        email=f"draft-{uuid.uuid4().hex[:8]}@test.local",
        status="active",
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def approver(db):
    user = AppUser(
        username=f"appr-{uuid.uuid4().hex[:8]}",
        display_name="Approver",
        email=f"appr-{uuid.uuid4().hex[:8]}@test.local",
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
def in_progress_session(db, drafter, mapped_department):
    session = InventorySession(
        department_id=mapped_department.id,
        name="Adj session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        expected_count=1,
        created_by=drafter.id,
    )
    db.add(session)
    db.flush()
    expected = InventoryExpectedItem(
        session_id=session.id,
        koha_item_id=9,
        barcode="BK-9",
        location="STACK-A",
        koha_status="available",
        title="Title nine",
        author="Author nine",
    )
    db.add(expected)
    db.flush()
    db.add(
        InventoryScan(
            session_id=session.id,
            expected_item_id=expected.id,
            koha_item_id=9,
            barcode_submitted="BK-9",
            outcome="found",
            match_basis=None,
            observed_damaged=False,
            counts=True,
            operator_id=drafter.id,
            station_location="STACK-A",
        ),
    )
    db.commit()
    return {"session": session, "expected": expected}


def test_draft_field_not_allowed_raises(db, in_progress_session, drafter):
    session = in_progress_session["session"]
    caps = InventoryCapabilities(update_fields=())
    with pytest.raises(InventoryError) as exc:
        draft_adjustment(
            db,
            caps,
            session_id=session.id,
            user_id=drafter.id,
            koha_item_id=9,
            field="location",
            from_value="STACK-A",
            to_value="STACK-B",
            reason="Move to stack B",
        )
    assert exc.value.code == "field_not_allowed"


def test_draft_approve_submit_and_exports(db, in_progress_session, drafter, approver, mapped_department):
    session = in_progress_session["session"]
    caps_empty = InventoryCapabilities(update_fields=())
    caps_location = InventoryCapabilities(
        update_fields=("location",),
        item_update=ReadCapability("PUT", "/items/{item_id}"),
    )

    adj = draft_adjustment(
        db,
        caps_location,
        session_id=session.id,
        user_id=drafter.id,
        koha_item_id=9,
        field="location",
        from_value="STACK-A",
        to_value="STACK-B",
        reason="Move to stack B",
        expected_item_id=in_progress_session["expected"].id,
    )
    assert adj.status == "draft"

    with pytest.raises(InventoryError) as exc:
        decide_adjustment(
            db,
            adjustment_id=adj.id,
            decision="approved",
            user_id=drafter.id,
            reason="",
        )
    assert exc.value.code == "not_approver"
    db.refresh(adj)
    assert adj.status == "draft"

    decide_adjustment(
        db,
        adjustment_id=adj.id,
        decision="approved",
        user_id=approver.id,
        reason="",
    )
    db.refresh(adj)
    assert adj.status == "approved"

    client_none = FakeKohaClient()
    with pytest.raises(InventoryError) as exc:
        submit_adjustment(
            db,
            client_none,
            caps_empty,
            adj.id,
            approver.id,
        )
    assert exc.value.code == "inventory_unsupported"
    db.refresh(adj)
    assert adj.status == "approved"
    assert client_none.put_calls == []
    assert client_none.post_calls == []

    scan_count_before = db.scalar(select(func.count()).select_from(InventoryScan))
    fail_client = FakeKohaClient(behavior="error")
    submit_adjustment(db, fail_client, caps_location, adj.id, approver.id)
    db.refresh(adj)
    assert adj.status == "failed"
    assert adj.koha_http_status == 400
    scan_count_after = db.scalar(select(func.count()).select_from(InventoryScan))
    assert scan_count_after == scan_count_before

    ok_client = FakeKohaClient(behavior="ok")
    submit_adjustment(db, ok_client, caps_location, adj.id, approver.id)
    db.refresh(adj)
    assert adj.status == "submitted"
    assert ok_client.put_calls
    assert ok_client.put_calls[0][0] == "/items/9"
    assert ok_client.put_calls[0][1] == {"location": "STACK-B"}

    for status, include in (
        ("approved", True),
        ("failed", True),
        ("rejected", False),
        ("submitted", False),
        ("draft", False),
    ):
        extra = InventoryAdjustment(
            session_id=session.id,
            koha_item_id=9,
            field="location",
            from_value="STACK-A",
            to_value="STACK-B",
            reason=f"Reason {status}",
            status=status,
            drafted_by=drafter.id,
        )
        db.add(extra)
    db.commit()

    rows = export_rows(
        db,
        session_id=session.id,
        kind="work_order",
        item_query={},
        include_barcode=True,
    )
    statuses = {row["status"] for row in rows}
    assert "approved" in statuses
    assert "failed" in statuses
    assert "rejected" not in statuses
    assert "submitted" not in statuses


def test_render_export_csv_and_xlsx():
    from openpyxl import load_workbook

    rows = [
        {
            "session_name": "S1",
            "department": "Dept",
            "home_library": "COLLEGE",
            "barcode": "",
            "koha_item_id": 9,
            "title": "T",
            "author": "A",
            "call_number": "C",
            "item_type": "BK",
            "snapshot_location": "STACK-A",
            "live_or_station_location": "STACK-A",
            "condition": "found",
            "koha_status": "available",
            "scanned_at": "",
            "operator_name": "Op",
            "remark": "",
        },
    ]
    csv_bytes, csv_type = render_export(rows, "csv")
    assert csv_type == "text/csv"
    text = csv_bytes.decode("utf-8")
    assert "koha_item_id" in text.splitlines()[0]
    reader = csv.DictReader(io.StringIO(text))
    assert reader.fieldnames is not None
    assert "barcode" in reader.fieldnames
    data = list(reader)
    assert data[0]["barcode"] == ""

    xlsx_bytes, xlsx_type = render_export(rows, "xlsx")
    assert xlsx_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert xlsx_bytes
    wb = load_workbook(io.BytesIO(xlsx_bytes))
    assert wb.sheetnames == ["Inventory"]
    sheet = wb["Inventory"]
    assert sheet.max_row >= 2