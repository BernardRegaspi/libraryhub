import uuid

import httpx
import pytest
from test_auth import add_user, csrf_headers

from app.integrations.koha.client import KohaClient

PASSWORD = "local-secret"

_KOHA_ITEM = {
    "item_id": 9,
    "biblio_id": 3,
    "external_id": "BC-1",
    "home_library_id": "CPL",
    "holding_library_id": "CPL",
    "location": "GEN",
    "callnumber": "QA76",
    "item_type_id": "BK",
    "withdrawn": 0,
    "lost_status": 0,
    "damaged_status": 0,
    "not_for_loan_status": 0,
    "effective_not_for_loan_status": 0,
    "checked_out_date": None,
    "biblio": {"title": "Ada", "author": "Cruz"},
}


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


def _default_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    if request.url.path.endswith("/libraries"):
        return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
    if request.url.path.endswith("/item_types"):
        return httpx.Response(404)
    if request.url.path.endswith("/items"):
        params = dict(request.url.params)
        if "q" in params:
            return httpx.Response(200, json=[], headers={"X-Total-Count": "42"})
        if params.get("external_id") == "BC-1":
            return httpx.Response(200, json=[_KOHA_ITEM])
        return httpx.Response(200, json=[])
    return httpx.Response(404)


def _add_librarian(db, username: str) -> None:
    add_user(
        db,
        username=username,
        email=f"{username}@usant.edu.ph",
        display_name="Inv Librarian",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )


def test_librarian_create_session(auth_client, db, monkeypatch):
    _add_librarian(db, "inv-http-create")
    _patch_koha(monkeypatch, _default_handler)
    _login(auth_client, "inv-http-create")
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL", "location": "GEN"},
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["expected_count"] == 42


def test_create_session_requires_csrf(auth_client, db, monkeypatch):
    _add_librarian(db, "inv-http-csrf")
    _patch_koha(monkeypatch, _default_handler)
    _login(auth_client, "inv-http-csrf")
    response = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL", "location": "GEN"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "csrf_failed"


def test_student_and_auditor_denied(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-http-student",
        email="inv-http-student@usant.edu.ph",
        display_name="Inv Student",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    add_user(
        db,
        username="inv-http-auditor",
        email="inv-http-auditor@usant.edu.ph",
        display_name="Inv Auditor",
        password=PASSWORD,
        role_name="Auditor",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _default_handler)
    _login(auth_client, "inv-http-student")
    student = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL"},
        headers=csrf_headers(auth_client),
    )
    assert student.status_code == 403
    assert student.json()["detail"]["code"] == "permission_denied"
    assert student.json()["detail"]["message"] == "You do not have access to inventory."
    auth_client.post("/api/v1/auth/logout", headers=csrf_headers(auth_client))
    _login(auth_client, "inv-http-auditor")
    auditor = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL"},
        headers=csrf_headers(auth_client),
    )
    assert auditor.status_code == 403
    assert auditor.json()["detail"]["code"] == "permission_denied"
    assert auditor.json()["detail"]["message"] == "You do not have access to inventory."


def test_start_and_scan_verified(auth_client, db, monkeypatch):
    _add_librarian(db, "inv-http-scan")
    _patch_koha(monkeypatch, _default_handler)
    _login(auth_client, "inv-http-scan")
    created = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL", "location": "GEN"},
        headers=csrf_headers(auth_client),
    )
    session_id = created.json()["id"]
    start = auth_client.post(
        f"/api/v1/inventory/sessions/{session_id}/start",
        headers=csrf_headers(auth_client),
    )
    assert start.status_code == 200
    client_scan_id = str(uuid.uuid4())
    scan = auth_client.post(
        f"/api/v1/inventory/sessions/{session_id}/scans",
        json={"client_scan_id": client_scan_id, "barcode": "BC-1"},
        headers=csrf_headers(auth_client),
    )
    assert scan.status_code == 200
    assert scan.json()["scan"]["outcome"] == "verified"
    assert scan.json()["scan"]["title"] == "Ada"
    first_id = scan.json()["scan"]["id"]
    again = auth_client.post(
        f"/api/v1/inventory/sessions/{session_id}/scans",
        json={"client_scan_id": client_scan_id, "barcode": "BC-1"},
        headers=csrf_headers(auth_client),
    )
    assert again.status_code == 200
    assert again.json()["scan"]["id"] == first_id


def test_scan_timeout_leaves_no_scan(auth_client, db, monkeypatch):
    _add_librarian(db, "inv-http-timeout")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(404)
        if request.url.path.endswith("/items"):
            params = dict(request.url.params)
            if "q" in params:
                return httpx.Response(200, json=[], headers={"X-Total-Count": "42"})
            if "external_id" in params:
                raise httpx.TimeoutException("timed out")
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    _login(auth_client, "inv-http-timeout")
    created = auth_client.post(
        "/api/v1/inventory/sessions",
        json={"name": "Shelf A", "home_library_id": "CPL", "location": "GEN"},
        headers=csrf_headers(auth_client),
    )
    session_id = created.json()["id"]
    auth_client.post(
        f"/api/v1/inventory/sessions/{session_id}/start",
        headers=csrf_headers(auth_client),
    )
    scan = auth_client.post(
        f"/api/v1/inventory/sessions/{session_id}/scans",
        json={"client_scan_id": str(uuid.uuid4()), "barcode": "BC-1"},
        headers=csrf_headers(auth_client),
    )
    assert scan.status_code == 504
    listed = auth_client.get(f"/api/v1/inventory/sessions/{session_id}/scans")
    assert listed.status_code == 200
    assert listed.json()["total"] == 0


def test_super_admin_list_sessions_requires_department(auth_client, db, monkeypatch):
    add_user(
        db,
        username="inv-http-super",
        email="inv-http-super@usant.edu.ph",
        display_name="Inv Super",
        password=PASSWORD,
        role_name="Super Administrator",
        department_code=None,
    )
    _patch_koha(monkeypatch, _default_handler)
    _login(auth_client, "inv-http-super")
    response = auth_client.get("/api/v1/inventory/sessions")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "department_required"