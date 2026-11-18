import httpx
import pytest

import app.services.catalog as catalog_module
from app.services.catalog import CatalogError, search, validate_search
from app.schemas.catalog import SearchParams


class Settings:
    koha_base_url = "http://koha.test"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15
    koha_opac_url = None


def test_empty_query_is_valid_and_a_bad_letter_is_not():
    params = SearchParams(q="  ")
    validate_search(params)
    assert params.q == ""
    bad = SearchParams(q="", letter="99")
    try:
        validate_search(bad)
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.message == "That search is not valid."
    else:
        raise AssertionError("expected CatalogError")
    letter = SearchParams(q="", letter="m", author="  ", availability="any")
    validate_search(letter)
    assert letter.letter == "M"
    assert letter.author is None
    assert letter.availability is None


def test_per_page_one_is_invalid():
    try:
        validate_search(SearchParams(q="", per_page=1))
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.code == "invalid_search"
    else:
        raise AssertionError("expected CatalogError")


def test_invalid_control_character_is_rejected():
    try:
        validate_search(SearchParams(q="bad\x00"))
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.code == "invalid_search"
        assert exc.message == "That search is not valid."
    else:
        raise AssertionError("expected CatalogError")


def test_title_search_requests_one_page_and_strips_barcode(db):
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            assert request.url.params["_page"] == "1"
            assert request.url.params["_per_page"] == "10"
            assert request.url.params["_order_by"] == "title"
            assert '"title"' in request.url.params["q"]
            assert "Ada" in request.url.params["q"]
            return httpx.Response(
                200,
                json=[{"biblio_id": 9, "title": "Ada", "author": "Lovelace"}],
                headers={"X-Total-Count": "1"},
            )
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[{
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
            }])
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="Ada", field="title", per_page=10),
        record_recent=False,
    )
    assert payload["total"] == 1
    assert payload["results"][0]["title"] == "Ada"
    assert payload["results"][0]["item_type"] == "Book"
    assert "SHOULD-NOT-LEAK" not in str(payload)
    assert seen.count("/api/v1/biblios") == 1


def test_empty_browse_omits_q_and_does_not_record_recent(db):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            seen["params"] = dict(request.url.params)
            return httpx.Response(200, json=[{"biblio_id": 1, "title": "Ada"}], headers={"X-Total-Count": "1"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/libraries") or request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    user_id = __import__("uuid").uuid4()
    payload = search(db, client, Settings(), user_id, SearchParams(q=""), record_recent=True)
    assert "q" not in seen["params"]
    assert payload["query"] == ""
    assert payload["letter"] is None
    SavedSearch = __import__("app.models.catalog", fromlist=["SavedSearch"]).SavedSearch
    assert db.query(SavedSearch).filter_by(user_id=user_id).count() == 0


def test_letter_and_keyword_are_both_in_the_koha_query(db):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            seen["q"] = request.url.params["q"]
            return httpx.Response(200, json=[], headers={"X-Total-Count": "0"})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/libraries") or request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    search(
        db, client, Settings(), None,
        SearchParams(q="Ada", field="keyword", letter="M"),
        record_recent=False,
    )
    assert "M%" in seen["q"]
    assert "%Ada%" in seen["q"]


def test_barcode_search_ignores_letter_and_library(db):
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/items"):
            assert request.url.params["external_id"] == "BC-1"
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="BC-1", field="barcode", letter="Z", library="CPL"),
        record_recent=False,
    )
    assert payload["results"] == []
    assert not any(path.endswith("/biblios") for path in paths)


def test_barcode_search_non_dict_biblio_is_empty_page(db):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
        if request.url.path.endswith("/items"):
            return httpx.Response(200, json=[{
                "biblio_id": 42,
                "external_id": "BC-001",
            }])
        if request.url.path == "/api/v1/biblios/42":
            return httpx.Response(200, json="unexpected")
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="BC-001", field="barcode"),
        record_recent=False,
    )
    assert payload["total"] == 0
    assert payload["has_next"] is False
    assert payload["results"] == []


def _copy(biblio_id: int, checked_out: bool) -> dict:
    return {
        "biblio_id": biblio_id,
        "external_id": f"BC-{biblio_id}",
        "item_type_id": "BK",
        "home_library_id": "CPL",
        "holding_library_id": "CPL",
        "withdrawn": 0,
        "lost_status": 0,
        "damaged_status": 0,
        "not_for_loan_status": 0,
        "effective_not_for_loan_status": 0,
        "checked_out_date": "2024-01-01" if checked_out else None,
    }


def _window_handler(seen_pages: list) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            page = int(request.url.params["_page"])
            seen_pages.append(request.url.params["_page"])
            return httpx.Response(
                200,
                json=[{"biblio_id": page, "title": f"Title {page}"}],
                headers={"X-Total-Count": "6"},
            )
        if request.url.path.endswith("/items"):
            return httpx.Response(
                200,
                json=[_copy(i, checked_out=i % 2 == 0) for i in range(1, 7)],
            )
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[{"item_type_id": "BK", "description": "Book"}])
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def test_available_filter_returns_the_whole_five_page_window(db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        catalog_module,
        "_PER_PAGE_VALUES",
        catalog_module._PER_PAGE_VALUES | {1},
    )
    seen_pages = []
    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=_window_handler(seen_pages))
    payload = search(
        db, client, Settings(), None,
        SearchParams(q="", per_page=1, availability="available"),
        record_recent=False,
    )
    assert [hit["biblio_id"] for hit in payload["results"]] == [1, 3, 5]
    assert payload["total"] is None
    assert payload["has_next"] is True
    assert seen_pages == ["1", "2", "3", "4", "5"]


def test_unknown_library_is_invalid(db):
    biblios_requested = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth/token"):
            return httpx.Response(200, json={"access_token": "t", "expires_in": 3600})
        if request.url.path.endswith("/biblios"):
            biblios_requested.append(True)
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/libraries"):
            return httpx.Response(200, json=[{"library_id": "CPL", "name": "College Library"}])
        if request.url.path.endswith("/item_types"):
            return httpx.Response(200, json=[])
        return httpx.Response(404)

    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=httpx.MockTransport(handler))
    try:
        search(
            db, client, Settings(), None,
            SearchParams(q="", library="NOPE"),
            record_recent=False,
        )
    except CatalogError as exc:
        assert exc.status_code == 422
        assert exc.code == "invalid_search"
    else:
        raise AssertionError("expected CatalogError")
    assert not biblios_requested


def test_second_window_starts_at_koha_page_six(db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        catalog_module,
        "_PER_PAGE_VALUES",
        catalog_module._PER_PAGE_VALUES | {1},
    )
    seen_pages = []
    from app.integrations.koha.client import KohaClient
    client = KohaClient(Settings(), transport=_window_handler(seen_pages))
    search(
        db, client, Settings(), None,
        SearchParams(q="", per_page=1, availability="available", page=2),
        record_recent=False,
    )
    assert seen_pages[0] == "6"