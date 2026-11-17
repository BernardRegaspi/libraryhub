import httpx
import pytest

from app.core.config import get_settings
from app.integrations.koha.client import KohaClient
from test_auth import add_user, csrf_headers

PASSWORD = "local-secret"


def _login(client, username: str) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": PASSWORD},
    )
    assert response.status_code == 200


def _patch_koha(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    def factory(settings):
        return KohaClient(settings, transport=httpx.MockTransport(handler))

    monkeypatch.setattr("app.api.routes.catalog.KohaClient", factory)


def _oauth_token_response() -> httpx.Response:
    return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})


def _standard_catalog_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return _oauth_token_response()
    if request.url.path.endswith("/biblios"):
        return httpx.Response(
            200,
            json=[{"biblio_id": 9, "title": "Ada", "author": "Lovelace"}],
            headers={"X-Total-Count": "1"},
        )
    if request.url.path.endswith("/items"):
        return httpx.Response(
            200,
            json=[
                {
                    "biblio_id": 9,
                    "external_id": "SHOULD-NOT-LEAK",
                    "item_type_id": "BK",
                    "home_library_id": "CPL",
                    "holding_library_id": "CPL",
                    "withdrawn": 0,
                    "lost_status": 0,
                    "damaged_status": 0,
                    "not_for_loan_status": 0,
                    "effective_not_for_loan_status": 0,
                    "checked_out_date": None,
                }
            ],
        )
    if request.url.path.endswith("/libraries"):
        return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
    if request.url.path.endswith("/item_types"):
        return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
    if request.url.path == "/api/v1/biblios/9":
        return httpx.Response(200, json={"biblio_id": 9, "title": "Ada"})
    return httpx.Response(404)


def _items_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return _oauth_token_response()
    if request.url.path.endswith("/items"):
        return httpx.Response(
            200,
            json=[
                {
                    "biblio_id": 9,
                    "external_id": "67786",
                    "item_type_id": "BK",
                    "home_library_id": "CPL",
                    "holding_library_id": "CPL",
                    "withdrawn": 0,
                    "lost_status": 0,
                    "damaged_status": 0,
                    "not_for_loan_status": 0,
                    "effective_not_for_loan_status": 0,
                    "checked_out_date": None,
                }
            ],
        )
    if request.url.path.endswith("/libraries"):
        return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
    if request.url.path.endswith("/item_types"):
        return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
    return httpx.Response(404)


def test_catalog_config_requires_session(auth_client):
    response = auth_client.get("/api/v1/catalog/config")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"


def test_catalog_config_for_student(auth_client, db):
    get_settings.cache_clear()
    add_user(
        db,
        username="stud-cfg",
        email="stud-cfg@usant.edu.ph",
        display_name="Student Config",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-cfg")
    response = auth_client.get("/api/v1/catalog/config")
    assert response.status_code == 200
    body = response.json()
    assert body["opac_url"] is None
    assert "keyword" in body["fields"]
    assert body["year_filter"] is False
    get_settings.cache_clear()


def test_catalog_search_hides_barcode(auth_client, db, monkeypatch):
    _patch_koha(monkeypatch, _standard_catalog_handler)
    add_user(
        db,
        username="stud-search",
        email="stud-search@usant.edu.ph",
        display_name="Student Search",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-search")
    response = auth_client.get("/api/v1/catalog/search", params={"q": "Ada", "field": "title"})
    assert response.status_code == 200
    body = response.json()
    assert body["results"][0]["title"] == "Ada"
    assert "SHOULD-NOT-LEAK" not in response.text


def test_catalog_items_barcode_by_role(auth_client, db, monkeypatch):
    _patch_koha(monkeypatch, _items_handler)
    add_user(
        db,
        username="stud-items",
        email="stud-items@usant.edu.ph",
        display_name="Student Items",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    add_user(
        db,
        username="lib-items",
        email="lib-items@usant.edu.ph",
        display_name="Librarian Items",
        password=PASSWORD,
        role_name="Librarian",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-items")
    student = auth_client.get("/api/v1/catalog/biblios/9/items")
    assert student.status_code == 200
    assert "barcode" not in student.json()["copies"][0]

    auth_client.post("/api/v1/auth/logout", headers=csrf_headers(auth_client))
    _login(auth_client, "lib-items")
    librarian = auth_client.get("/api/v1/catalog/biblios/9/items")
    assert librarian.status_code == 200
    assert librarian.json()["copies"][0]["barcode"] == "67786"


def test_catalog_search_rejects_null_byte(auth_client, db):
    add_user(
        db,
        username="stud-valid",
        email="stud-valid@usant.edu.ph",
        display_name="Student Valid",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-valid")
    response = auth_client.get("/api/v1/catalog/search", params={"q": "\x00"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_search"
    assert detail["message"] == "That search is not valid."


def test_catalog_search_connect_error(auth_client, db, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return _oauth_token_response()
        if request.url.path.endswith("/biblios"):
            raise httpx.ConnectError("connection failed")
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    add_user(
        db,
        username="stud-down",
        email="stud-down@usant.edu.ph",
        display_name="Student Down",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-down")
    response = auth_client.get("/api/v1/catalog/search", params={"q": "Ada", "field": "title"})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "catalog_unavailable"
    assert detail["message"] == "The catalog is unavailable. Try again."
    assert "ConnectError" not in response.text


def test_catalog_search_read_timeout(auth_client, db, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return _oauth_token_response()
        if request.url.path.endswith("/biblios"):
            raise httpx.ReadTimeout("read timed out")
        return httpx.Response(404)

    _patch_koha(monkeypatch, handler)
    add_user(
        db,
        username="stud-slow",
        email="stud-slow@usant.edu.ph",
        display_name="Student Slow",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-slow")
    response = auth_client.get("/api/v1/catalog/search", params={"q": "Ada", "field": "title"})
    assert response.status_code == 504
    assert response.json()["detail"]["code"] == "catalog_timeout"


def test_catalog_saved_search_csrf_and_foreign_delete(auth_client, db):
    add_user(
        db,
        username="stud-save-a",
        email="stud-save-a@usant.edu.ph",
        display_name="Student Save A",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    add_user(
        db,
        username="stud-save-b",
        email="stud-save-b@usant.edu.ph",
        display_name="Student Save B",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-save-a")
    rejected = auth_client.post(
        "/api/v1/catalog/saved-searches",
        json={"label": "My Ada", "q": "Ada", "field": "title"},
    )
    assert rejected.status_code == 403
    assert rejected.json()["detail"]["code"] == "csrf_failed"
    created = auth_client.post(
        "/api/v1/catalog/saved-searches",
        json={"label": "My Ada", "q": "Ada", "field": "title"},
        headers=csrf_headers(auth_client),
    )
    assert created.status_code == 201
    saved_id = created.json()["id"]

    auth_client.post("/api/v1/auth/logout", headers=csrf_headers(auth_client))
    _login(auth_client, "stud-save-b")
    foreign = auth_client.delete(
        f"/api/v1/catalog/saved-searches/{saved_id}",
        headers=csrf_headers(auth_client),
    )
    assert foreign.status_code == 404
    detail = foreign.json()["detail"]
    assert detail["code"] == "not_found"
    assert detail["message"] == "That saved search was not found."


def test_catalog_cover_missing_and_present(auth_client, db, monkeypatch):
    add_user(
        db,
        username="stud-cover",
        email="stud-cover@usant.edu.ph",
        display_name="Student Cover",
        password=PASSWORD,
        role_name="Student",
        department_code="COLLEGE",
    )
    _login(auth_client, "stud-cover")

    def no_cover_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return _oauth_token_response()
        if request.url.path == "/api/v1/biblios/9":
            return httpx.Response(200, json={"biblio_id": 9, "title": "Ada"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    _patch_koha(monkeypatch, no_cover_handler)
    missing = auth_client.get("/api/v1/catalog/biblios/9/cover")
    assert missing.status_code == 404

    def cover_handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return _oauth_token_response()
        if request.url.path == "/api/v1/biblios/9":
            return httpx.Response(
                200,
                json={"biblio_id": 9, "title": "Ada", "cover_url": "https://koha.test/cover.jpg"},
            )
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        if request.url.host == "koha.test" and request.url.path == "/cover.jpg":
            return httpx.Response(200, content=b"jpeg", headers={"content-type": "image/jpeg"})
        return httpx.Response(404)

    _patch_koha(monkeypatch, cover_handler)
    found = auth_client.get("/api/v1/catalog/biblios/9/cover")
    assert found.status_code == 200
    assert found.content == b"jpeg"
    assert found.headers["content-type"] == "image/jpeg"
    assert found.headers["cache-control"] == "private, max-age=3600"