import httpx

from app.services.catalog import CatalogError, search, validate_search
from app.schemas.catalog import SearchParams


class Settings:
    koha_base_url = "http://koha.test"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15
    koha_opac_url = None


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