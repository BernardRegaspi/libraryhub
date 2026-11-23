import logging

import httpx

from app.integrations.koha.client import KohaClient, api_root
from app.integrations.koha.exceptions import (
    KohaAuthError,
    KohaRequestError,
    KohaResponseError,
    KohaTimeoutError,
)


class Settings:
    koha_base_url = "http://koha.test/"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15


def test_api_root_appends_v1_once():
    assert api_root("http://koha.test/") == "http://koha.test/api/v1"
    assert api_root("http://koha.test/api/v1") == "http://koha.test/api/v1"


def test_token_is_reused_and_absent_from_logs(caplog):
    posts = {"token": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            posts["token"] += 1
            assert b"grant_type=client_credentials" in request.content
            assert b"client_id=client-id" in request.content
            assert b"client_secret=client-secret" in request.content
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        assert request.headers["Authorization"] == "Bearer token-1"
        return httpx.Response(200, json=[{"biblio_id": 1}], headers={"X-Total-Count": "4"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    with caplog.at_level(logging.INFO, logger="app.integrations.koha"):
        first, headers = client.get_json("/biblios", {"_per_page": 1})
        second, _headers = client.get_json("/biblios", {"_per_page": 1})
    assert first == second == [{"biblio_id": 1}]
    assert headers["X-Total-Count"] == "4"
    assert posts["token"] == 1
    assert "client-secret" not in caplog.text
    assert "token-1" not in caplog.text
    assert "/biblios" in caplog.text


def test_second_401_raises_auth_error_without_body():
    calls = {"token": 0, "biblios": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            calls["token"] += 1
            return httpx.Response(200, json={"access_token": f"token-{calls['token']}", "expires_in": 3600})
        calls["biblios"] += 1
        return httpx.Response(401, json={"error": "secret-body"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.get_json("/biblios")
    except KohaAuthError as exc:
        assert "secret-body" not in str(exc)
    else:
        raise AssertionError("expected KohaAuthError")
    assert calls["token"] == 2
    assert calls["biblios"] == 2


def test_list_items_bulk_non_list_returns_empty_without_fallback():
    calls = {"items": 0, "per_biblio": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/items"):
            calls["items"] += 1
            return httpx.Response(200, json={"unexpected": "shape"})
        if "/biblios/" in request.url.path and request.url.path.endswith("/items"):
            calls["per_biblio"] += 1
            return httpx.Response(200, json=[])
        raise AssertionError(f"unexpected path {request.url.path}")

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    items, checked_at = client.list_items_for_biblios([1, 2])
    assert items == []
    assert checked_at
    assert calls["items"] == 1
    assert calls["per_biblio"] == 0


def test_list_items_timeout_returns_unknown_without_fallback():
    calls = {"per_biblio": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/items") and "/biblios/" not in request.url.path:
            raise httpx.ReadTimeout("slow")
        if request.url.path.endswith("/items"):
            calls["per_biblio"] += 1
            return httpx.Response(200, json=[])
        raise AssertionError(f"unexpected path {request.url.path}")

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    items, checked_at = client.list_items_for_biblios([9])
    assert items is None
    assert checked_at is None
    assert calls["per_biblio"] == 0


def test_patron_write_keeps_error_field_names_and_hides_the_body():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.method == "POST" and request.url.path.endswith("/patrons"):
            assert request.headers.get("x-confirm-not-duplicate") == "1"
            assert "secret-name" not in request.content.decode()
            return httpx.Response(
                409,
                json={"errors": [{"message": "secret-name already exists", "path": "/body/cardnumber"}]},
            )
        if request.method == "PUT":
            return httpx.Response(400, json={"errors": [{"path": "/body/surname"}]})
        raise AssertionError(request.method + " " + request.url.path)

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.create_patron({"surname": "Cruz", "library_id": "CPL", "category_id": "ST"}, confirm_duplicate=True)
    except KohaRequestError as exc:
        assert exc.status_code == 409
        assert exc.fields == ["cardnumber"]
        assert "secret-name" not in str(exc)
    else:
        raise AssertionError("expected KohaRequestError")
    try:
        client.update_patron(4, {"surname": "Cruz"})
    except KohaRequestError as exc:
        assert exc.status_code == 400
        assert exc.fields == ["surname"]
        assert "x-confirm-not-duplicate" not in str(exc)
    else:
        raise AssertionError("expected KohaRequestError")


def test_patron_reads_send_embeds_and_a_plain_500_stays_a_response_error():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        seen.append((request.method, request.url.path, request.headers.get("x-koha-embed")))
        if request.url.path.endswith("/patrons") and request.method == "GET":
            return httpx.Response(200, json=[{"patron_id": 4}], headers={"X-Total-Count": "1"})
        if request.url.path.endswith("/checkouts"):
            return httpx.Response(200, json=[{"checkout_id": 1}])
        if request.url.path.endswith("/holds"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/patron_categories"):
            return httpx.Response(200, json=[{"patron_category_id": "ST", "name": "Student"}])
        return httpx.Response(500, json={"error": "secret-body"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    rows, headers = client.list_patrons({"_per_page": "1"})
    assert rows == [{"patron_id": 4}]
    assert headers["X-Total-Count"] == "1"
    assert client.list_checkouts(4) == [{"checkout_id": 1}]
    assert client.list_holds(4) == []
    assert client.list_patron_categories()[0]["patron_category_id"] == "ST"
    try:
        client.get_patron(4)
    except KohaResponseError as exc:
        assert type(exc) is KohaResponseError
        assert "secret-body" not in str(exc)
    else:
        raise AssertionError("expected KohaResponseError")
    embeds = {path: embed for _method, path, embed in seen}
    assert embeds["/api/v1/patrons"] == "checkouts+count,overdues+count"
    assert embeds["/api/v1/patrons/4/checkouts"] == "item.biblio"
    assert embeds["/api/v1/patrons/4/holds"] == "biblio"


def test_search_patrons_and_items_reject_non_list_bodies():
    seen: list[tuple[str, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        seen.append((request.url.path, request.headers.get("x-koha-embed")))
        if request.url.path.endswith("/patrons"):
            return httpx.Response(200, json={"unexpected": "shape"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json={"unexpected": "shape"})
        raise AssertionError(request.url.path)

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.search_patrons({"q": '{"cardnumber": "C1"}', "_per_page": 5})
    except KohaResponseError:
        pass
    else:
        raise AssertionError("expected KohaResponseError from search_patrons")
    try:
        client.search_items({"q": '{"external_id": "B-1"}', "_per_page": 5})
    except KohaResponseError:
        pass
    else:
        raise AssertionError("expected KohaResponseError from search_items")
    embeds = {path: embed for path, embed in seen}
    assert embeds["/api/v1/items"] == "biblio"
    assert embeds["/api/v1/patrons"] is None


def test_get_patron_passes_embed_only_when_requested():
    seen: list[tuple[str, str | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/patrons/4"):
            seen.append((request.url.path, request.headers.get("x-koha-embed")))
            return httpx.Response(200, json={"patron_id": 4, "surname": "Doe"})
        raise AssertionError(request.url.path)

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    assert client.get_patron(4)["patron_id"] == 4
    assert client.get_patron(4, embed="checkouts+count,overdues+count")["patron_id"] == 4
    assert seen == [
        ("/api/v1/patrons/4", None),
        ("/api/v1/patrons/4", "checkouts+count,overdues+count"),
    ]


def test_timeout_is_typed():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        raise httpx.ReadTimeout("slow")

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        client.get_json("/biblios")
    except KohaTimeoutError:
        pass
    else:
        raise AssertionError("expected KohaTimeoutError")


def test_list_open_checkouts_omits_checked_in_filter():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        assert "checked_in" not in request.url.params
        assert request.headers.get("x-koha-embed") == "item.biblio,patron"
        return httpx.Response(200, json=[{"checkout_id": 6}], headers={"X-Total-Count": "1"})

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    rows, total = client.list_checkout_records(checked_in=False, page=1, per_page=20)
    assert rows == [{"checkout_id": 6}]
    assert total == 1


def test_list_checked_in_checkouts_sends_filter_and_embed():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        assert request.url.params["checked_in"] == "1"
        assert request.url.params["_page"] == "1"
        assert request.url.params["_per_page"] == "20"
        assert request.headers.get("x-koha-embed") == "item.biblio,patron"
        return httpx.Response(
            200,
            json=[{"checkout_id": 1}],
            headers={"X-Total-Count": "4"},
        )

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    rows, total = client.list_checked_in_checkouts(page=1, per_page=20)
    assert rows == [{"checkout_id": 1}]
    assert total == 4


def test_post_checkout_sends_patron_and_item():
    seen: list[tuple[str, bytes]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        seen.append((request.url.path, request.content))
        if request.url.path.endswith("/checkouts"):
            return httpx.Response(
                201,
                json={"checkout_id": 9, "due_date": "2026-12-04", "item_id": 3, "patron_id": 5},
            )
        raise AssertionError(request.url.path)

    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    body = client.post_checkout(5, 3)
    assert body["checkout_id"] == 9
    assert body["due_date"] == "2026-12-04"
    assert seen == [("/api/v1/checkouts", b'{"patron_id": 5, "item_id": 3}')]
