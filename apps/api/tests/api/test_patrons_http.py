import httpx
import pytest
from test_auth import add_user, csrf_headers

from app.integrations.koha.client import KohaClient

PASSWORD = "local-secret"


def _login(client, username: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200


def _patch_koha(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    monkeypatch.setattr(
        "app.api.routes.patrons.KohaClient",
        lambda settings: KohaClient(settings, transport=httpx.MockTransport(handler)),
    )


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    if request.method == "GET" and request.url.path.endswith("/patrons"):
        return httpx.Response(
            200,
            json=[
                {
                    "patron_id": 4,
                    "firstname": "Ada",
                    "surname": "Cruz",
                    "cardnumber": "1004",
                    "category_id": "ST",
                    "library_id": "CPL",
                    "email": "ada@usant.edu.ph",
                }
            ],
            headers={"X-Total-Count": "1"},
        )
    if request.url.path.endswith("/patron_categories"):
        return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
    if request.url.path.endswith("/libraries"):
        return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
    return httpx.Response(404)


def test_librarian_search_hides_email(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-librarian",
        email="patron-librarian@usant.edu.ph",
        display_name="Pat Librarian",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-librarian")
    response = auth_client.get("/api/v1/patrons?q=Ada")
    assert response.status_code == 200
    assert response.json()["items"][0]["cardnumber"] == "1004"
    assert "email" not in response.json()["items"][0]


def test_patrons_require_a_session(auth_client):
    response = auth_client.get("/api/v1/patrons")
    assert response.status_code == 401


def test_librarian_detail_hides_staff_notes(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-lib-detail",
        email="patron-lib-detail@usant.edu.ph",
        display_name="Pat Detail",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/patrons/4"):
            return httpx.Response(
                200,
                json={
                    "patron_id": 4,
                    "firstname": "Ada",
                    "surname": "Cruz",
                    "cardnumber": "1004",
                    "category_id": "ST",
                    "library_id": "CPL",
                    "email": "ada@usant.edu.ph",
                    "staff_notes": "Internal only",
                },
            )
        if request.url.path.endswith("/patron_categories"):
            return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    _login(auth_client, "patron-lib-detail")
    response = auth_client.get("/api/v1/patrons/4")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "ada@usant.edu.ph"
    assert "staff_notes" not in body


def test_librarian_cannot_write(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-lib-write",
        email="patron-lib-write@usant.edu.ph",
        display_name="Pat Write",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-lib-write")
    post = auth_client.post(
        "/api/v1/patrons",
        json={"surname": "Cruz", "library_id": "CPL", "category_id": "ST"},
        headers=csrf_headers(auth_client),
    )
    assert post.status_code == 403
    assert post.json()["detail"]["code"] == "permission_denied"
    put = auth_client.put(
        "/api/v1/patrons/4",
        json={"surname": "Cruz"},
        headers=csrf_headers(auth_client),
    )
    assert put.status_code == 403
    assert put.json()["detail"]["code"] == "permission_denied"


def test_student_and_auditor_cannot_list(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-student",
        email="patron-student@usant.edu.ph",
        display_name="Pat Student",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    add_user(
        db,
        username="patron-auditor",
        email="patron-auditor@usant.edu.ph",
        display_name="Pat Auditor",
        password=PASSWORD,
        role_name="Auditor",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-student")
    student = auth_client.get("/api/v1/patrons")
    assert student.status_code == 403
    auth_client.post("/api/v1/auth/logout", headers=csrf_headers(auth_client))
    _login(auth_client, "patron-auditor")
    auditor = auth_client.get("/api/v1/patrons")
    assert auditor.status_code == 403


def test_admin_post_requires_csrf(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-admin",
        email="patron-admin@usant.edu.ph",
        display_name="Pat Admin",
        password=PASSWORD,
        role_name="Library Administrator",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-admin")
    response = auth_client.post(
        "/api/v1/patrons",
        json={"surname": "Cruz", "library_id": "CPL", "category_id": "ST"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "csrf_failed"


def test_admin_can_create(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-admin-create",
        email="patron-admin-create@usant.edu.ph",
        display_name="Pat Admin Create",
        password=PASSWORD,
        role_name="Library Administrator",
        department_code="COLLEGE",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.method == "POST" and request.url.path.endswith("/patrons"):
            return httpx.Response(
                200,
                json={
                    "patron_id": 42,
                    "surname": "Cruz",
                    "library_id": "CPL",
                    "category_id": "ST",
                },
            )
        if request.url.path.endswith("/patron_categories"):
            return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    _login(auth_client, "patron-admin-create")
    response = auth_client.post(
        "/api/v1/patrons",
        json={"surname": "Cruz", "library_id": "CPL", "category_id": "ST"},
        headers=csrf_headers(auth_client),
    )
    assert response.status_code == 200
    assert response.json()["patron_id"] == 42


def test_bad_patron_id_is_not_found(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-bad-id",
        email="patron-bad-id@usant.edu.ph",
        display_name="Pat Bad Id",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _patch_koha(monkeypatch, _handler)
    _login(auth_client, "patron-bad-id")
    response = auth_client.get("/api/v1/patrons/nope")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "not_found"


def test_koha_timeout_is_504(auth_client, db, monkeypatch):
    add_user(
        db,
        username="patron-timeout",
        email="patron-timeout@usant.edu.ph",
        display_name="Pat Timeout",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        raise httpx.TimeoutException("timed out")

    _patch_koha(monkeypatch, handler)
    _login(auth_client, "patron-timeout")
    response = auth_client.get("/api/v1/patrons?q=Ada")
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "patrons_timeout"