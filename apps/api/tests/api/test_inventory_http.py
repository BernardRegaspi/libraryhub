from __future__ import annotations

import uuid
from datetime import date

import httpx
import pytest
from sqlalchemy import func, select

from app.integrations.koha.client import KohaClient
from app.integrations.koha.inventory import InventoryCapabilities
from app.models.identity import LibraryDepartment, Permission, Role, RolePermission
from app.models.inventory import (
    InventoryAdjustment,
    InventoryExpectedItem,
    InventoryScan,
    InventorySession,
)
from app.services.inventory_adjustments import draft_adjustment
from app.services.inventory_sessions import create_session
from tests.api.test_auth import add_user, csrf_headers

try:
    from tests.api.test_auth import PASSWORD
except ImportError:
    PASSWORD = "local-secret"


def _login(client, username: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200


def _patch_koha(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    monkeypatch.setattr(
        "app.api.routes.inventory.KohaClient",
        lambda settings: KohaClient(settings, transport=httpx.MockTransport(handler)),
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    return httpx.Response(404)


def test_capabilities_require_session(auth_client):
    response = auth_client.get("/api/v1/inventory/capabilities")
    assert response.status_code == 401


def test_post_sessions_requires_manage(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-view-only",
        email="inv-view-only@usant.edu.ph",
        display_name="Inv View",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    role = db.query(Role).filter_by(name="Librarian").one()
    perm = db.query(Permission).filter_by(code="inventory.manage").one()
    link = (
        db.query(RolePermission)
        .filter_by(role_id=role.id, permission_id=perm.id)
        .one()
    )
    db.delete(link)
    db.flush()

    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-view-only")
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={
            "name": "Fall count",
            "description": None,
            "start_on": "2026-11-01",
            "target_on": None,
            "locations": [],
            "item_type_id": None,
            "operator_ids": [],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_post_sessions_requires_active_department(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-super",
        email="inv-super@usant.edu.ph",
        display_name="Inv Super",
        password=PASSWORD,
        role_name="Super Administrator",
        department_code=None,
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-super")
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={
            "name": "Fall count",
            "description": None,
            "start_on": "2026-11-01",
            "target_on": None,
            "locations": [],
            "item_type_id": None,
            "operator_ids": [],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "department_required"
    listed = auth_client.get("/api/v1/inventory/sessions?status=all&per_page=20&page=1")
    assert listed.status_code == 200
    assert listed.json()["items"] == []


def test_post_sessions_branch_unmapped(auth_client, db, monkeypatch):
    dept = LibraryDepartment(
        code=f"UNM-{uuid.uuid4().hex[:6]}",
        name="Unmapped",
        koha_branchcode=None,
    )
    db.add(dept)
    db.flush()
    add_user(
        db,
        username="inv-unmapped",
        email="inv-unmapped@usant.edu.ph",
        display_name="Inv Unmapped",
        password=PASSWORD,
        role_name="Super Administrator",
        department_code=None,
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-unmapped")
    switch = auth_client.patch(
        "/api/v1/auth/session",
        json={"active_department_id": str(dept.id)},
        headers=csrf_headers(auth_client),
    )
    assert switch.status_code == 200
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={
            "name": "Fall count",
            "description": None,
            "start_on": "2026-11-01",
            "target_on": None,
            "locations": [],
            "item_type_id": None,
            "operator_ids": [],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "branch_unmapped"


def test_start_without_item_list_is_unsupported(auth_client, db, monkeypatch):
    user = add_user(
        db,
        username="inv-start",
        email="inv-start@usant.edu.ph",
        display_name="Inv Start",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    department.koha_branchcode = "COLLEGE"
    db.flush()
    session = create_session(
        db,
        user_id=user.id,
        department_id=department.id,
        name="Draft session",
        description=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        locations=[],
        item_type_id=None,
        operator_ids=[],
    )
    _patch_koha(monkeypatch, _handler)
    monkeypatch.setattr(
        "app.api.routes.inventory.get_inventory_capabilities",
        lambda: InventoryCapabilities(),
    )
    _login(auth_client, "inv-start")
    response = auth_client.post(
        f"/api/v1/inventory/sessions/{session.id}/start",
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "inventory_unsupported"
    assert response.json()["detail"]["message"] == "This Koha operation is not available."


def test_scan_control_character_invalid_and_no_row(auth_client, db, monkeypatch):
    user = add_user(
        db,
        username="inv-scan",
        email="inv-scan@usant.edu.ph",
        display_name="Inv Scan",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    session_row = InventorySession(
        department_id=department.id,
        name="Scan session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        created_by=user.id,
    )
    db.add(session_row)
    db.flush()
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-scan")
    before = db.scalar(select(func.count()).select_from(InventoryScan)) or 0
    response = auth_client.post(
        f"/api/v1/inventory/sessions/{session_row.id}/scans",
        json={"barcode": "A\u0001", "damaged": False},
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_scan"
    after = db.scalar(select(func.count()).select_from(InventoryScan)) or 0
    assert after == before


def test_approve_by_drafter_is_not_approver(auth_client, db, monkeypatch):
    from app.integrations.koha.inventory import InventoryCapabilities, ReadCapability

    user = add_user(
        db,
        username="inv-drafter",
        email="inv-drafter@usant.edu.ph",
        display_name="Inv Drafter",
        password=PASSWORD,
        role_name="Department Head",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    session_row = InventorySession(
        department_id=department.id,
        name="Adj session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        created_by=user.id,
    )
    db.add(session_row)
    db.flush()
    caps = InventoryCapabilities(update_fields=("location",), item_update=ReadCapability("PUT", "/x"))
    proposal = draft_adjustment(
        db,
        caps,
        session_id=session_row.id,
        user_id=user.id,
        koha_item_id=9,
        field="location",
        to_value="STACK-B",
        reason="Move item",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-drafter")
    response = auth_client.post(
        f"/api/v1/inventory/adjustments/{proposal.id}/approve",
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "not_approver"
    db.expire_all()
    pending = db.get(InventoryAdjustment, proposal.id)
    assert pending is not None
    assert pending.status == "draft"


def test_get_session_other_department_not_found(auth_client, db, monkeypatch):
    user_a = add_user(
        db,
        username="inv-dept-a",
        email="inv-dept-a@usant.edu.ph",
        display_name="Inv A",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    dept_b = LibraryDepartment(
        code=f"GRD-{uuid.uuid4().hex[:6]}",
        name="Graduate",
        koha_branchcode="GRAD",
    )
    db.add(dept_b)
    db.flush()
    session_row = InventorySession(
        department_id=dept_b.id,
        name="Other dept",
        description=None,
        status="draft",
        home_library_id="GRAD",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        created_by=user_a.id,
    )
    db.add(session_row)
    db.flush()
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-dept-a")
    response = auth_client.get(f"/api/v1/inventory/sessions/{session_row.id}")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_scope_options_home_library_id_from_department(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-scope",
        email="inv-scope@usant.edu.ph",
        display_name="Inv Scope",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    department.koha_branchcode = "COLLEGE"
    db.flush()
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-scope")
    response = auth_client.get("/api/v1/inventory/scope-options")
    assert response.status_code == 200
    assert response.json()["home_library_id"] == "COLLEGE"


def test_scope_options_home_library_null_when_branch_blank(auth_client, db, monkeypatch):
    dept = LibraryDepartment(
        code=f"BLN-{uuid.uuid4().hex[:6]}",
        name="Blank branch",
        koha_branchcode=None,
    )
    db.add(dept)
    db.flush()
    add_user(
        db,
        username="inv-scope-blank",
        email="inv-scope-blank@usant.edu.ph",
        display_name="Inv Scope Blank",
        password=PASSWORD,
        role_name="Super Administrator",
        department_code=None,
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-scope-blank")
    switch = auth_client.patch(
        "/api/v1/auth/session",
        json={"active_department_id": str(dept.id)},
        headers=csrf_headers(auth_client),
    )
    assert switch.status_code == 200
    response = auth_client.get("/api/v1/inventory/scope-options")
    assert response.status_code == 200
    assert response.json()["home_library_id"] is None


def test_session_items_include_expected_item_id(auth_client, db, monkeypatch):
    user = add_user(
        db,
        username="inv-items",
        email="inv-items@usant.edu.ph",
        display_name="Inv Items",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    session_row = InventorySession(
        department_id=department.id,
        name="Items session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        created_by=user.id,
        expected_count=1,
    )
    db.add(session_row)
    db.flush()
    expected = InventoryExpectedItem(
        session_id=session_row.id,
        koha_item_id=42,
        barcode="ISBN-42",
        koha_status="available",
        title="Test title",
    )
    db.add(expected)
    db.commit()
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-items")
    response = auth_client.get(f"/api/v1/inventory/sessions/{session_row.id}/items")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) >= 1
    row = next(item for item in items if item.get("koha_item_id") == 42)
    assert row["expected_item_id"] == str(expected.id)


def test_export_csv_omits_internal_item_ids(auth_client, db, monkeypatch):
    user = add_user(
        db,
        username="inv-export",
        email="inv-export@usant.edu.ph",
        display_name="Inv Export",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    department = db.query(LibraryDepartment).filter_by(code="COLLEGE").one()
    session_row = InventorySession(
        department_id=department.id,
        name="Export session",
        description=None,
        status="in_progress",
        home_library_id="COLLEGE",
        item_type_id=None,
        start_on=date(2026, 11, 1),
        target_on=None,
        created_by=user.id,
        expected_count=1,
    )
    db.add(session_row)
    db.flush()
    db.add(
        InventoryExpectedItem(
            session_id=session_row.id,
            koha_item_id=7,
            barcode="ISBN-7",
            koha_status="available",
            title="Export row",
        ),
    )
    db.commit()
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-export")
    response = auth_client.get(
        f"/api/v1/inventory/sessions/{session_row.id}/exports",
        params={"kind": "unverified", "format": "csv"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    header = response.content.decode("utf-8").splitlines()[0]
    columns = {name.strip() for name in header.split(",")}
    assert "expected_item_id" not in columns


def test_write_without_csrf_rejected(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-csrf",
        email="inv-csrf@usant.edu.ph",
        display_name="Inv CSRF",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "inv-csrf")
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={
            "name": "Fall count",
            "description": None,
            "start_on": "2026-11-01",
            "target_on": None,
            "locations": [],
            "item_type_id": None,
            "operator_ids": [],
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "csrf_failed"