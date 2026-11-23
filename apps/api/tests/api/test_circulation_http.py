import httpx
import pytest

from app.integrations.koha.client import KohaClient
from app.models.identity import Permission, Role, RolePermission
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
        "app.api.routes.circulation.KohaClient",
        lambda settings: KohaClient(settings, transport=httpx.MockTransport(handler)),
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    return httpx.Response(404)


def test_capabilities_require_session(auth_client):
    response = auth_client.get("/api/v1/circulation/capabilities")
    assert response.status_code == 401


def test_checkout_write_requires_csrf_and_permission(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-view-only",
        email="circ-view-only@usant.edu.ph",
        display_name="Circ View",
        password=PASSWORD,
        role_name="Auditor",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-view-only")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={
            "request_id": "00000000-0000-0000-0000-000000000001",
            "patron_id": 1,
            "item_ids": [1],
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_librarian_without_checkout_permission_denied(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-lib-view",
        email="circ-lib-view@usant.edu.ph",
        display_name="Circ Librarian View",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    role = db.query(Role).filter_by(name="Librarian").one()
    perm = db.query(Permission).filter_by(code="circulation.checkout").one()
    link = (
        db.query(RolePermission)
        .filter_by(role_id=role.id, permission_id=perm.id)
        .one()
    )
    db.delete(link)
    db.flush()

    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-lib-view")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={
            "request_id": "00000000-0000-0000-0000-000000000002",
            "patron_id": 1,
            "item_ids": [1],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "permission_denied"


def test_librarian_checkout_unsupported_without_capability(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-lib-write",
        email="circ-lib-write@usant.edu.ph",
        display_name="Circ Librarian Write",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-lib-write")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={
            "request_id": "00000000-0000-0000-0000-000000000003",
            "patron_id": 1,
            "item_ids": [1],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 501
    assert response.json()["detail"]["code"] == "circulation_unsupported"


def test_checkout_without_csrf_is_rejected(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-lib-csrf",
        email="circ-lib-csrf@usant.edu.ph",
        display_name="Circ Librarian CSRF",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-lib-csrf")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={
            "request_id": "00000000-0000-0000-0000-000000000004",
            "patron_id": 1,
            "item_ids": [1],
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "csrf_failed"


def test_checkout_rejects_non_positive_patron(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-lib-patron",
        email="circ-lib-patron@usant.edu.ph",
        display_name="Circ Librarian Patron",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-lib-patron")
    response = auth_client.post(
        "/api/v1/circulation/checkouts",
        json={
            "request_id": "00000000-0000-0000-0000-000000000005",
            "patron_id": 0,
            "item_ids": [1],
        },
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "validation_error"


def test_loan_search_rejects_bad_page(auth_client, db, monkeypatch):
    add_user(
        db,
        username="circ-lib-loans",
        email="circ-lib-loans@usant.edu.ph",
        display_name="Circ Librarian Loans",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "circ-lib-loans")
    response = auth_client.get("/api/v1/circulation/loans", params={"patron_id": "5", "page": "0"})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_search"