import httpx

from app.models.catalog import SavedSearch
from app.schemas.catalog import SavedSearchIn, SearchParams
from app.services.catalog import CatalogError, delete_saved, save_search, search
from test_auth import add_user


class KohaSettings:
    koha_base_url = "http://koha.test"
    koha_client_id = "client-id"
    koha_client_secret = "client-secret"
    koha_api_timeout = 15
    koha_opac_url = None


def _empty_biblio_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/oauth/token"):
        return httpx.Response(200, json={"access_token": "token-1", "expires_in": 3600})
    if request.url.path.endswith("/biblios"):
        return httpx.Response(200, json=[], headers={"X-Total-Count": "0"})
    if request.url.path.endswith("/items"):
        return httpx.Response(200, json=[])
    return httpx.Response(404)


def test_saved_search_upsert_cap_and_recent_limit_and_foreign_delete(db):
    primary = add_user(
        db,
        username="cat-lib-1",
        email="cat-lib-1@usant.edu.ph",
        display_name="Catalog Librarian One",
        password="local-secret",
        role_name="Librarian",
        department_code="COLLEGE",
    )
    other = add_user(
        db,
        username="cat-lib-2",
        email="cat-lib-2@usant.edu.ph",
        display_name="Catalog Librarian Two",
        password="local-secret",
        role_name="Librarian",
        department_code="COLLEGE",
    )

    body = SavedSearchIn(label="First label", q="Ada", field="title")
    save_search(db, primary.id, body)
    save_search(db, primary.id, SavedSearchIn(label="Second label", q="Ada", field="title"))

    rows = (
        db.query(SavedSearch)
        .filter_by(user_id=primary.id, kind="saved", query_text="Ada", search_field="title")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].label == "Second label"

    for index in range(31):
        save_search(
            db,
            primary.id,
            SavedSearchIn(label=f"Saved {index}", q=f"query-{index}", field="title"),
        )
    assert db.query(SavedSearch).filter_by(user_id=primary.id, kind="saved").count() == 30

    from app.integrations.koha.client import KohaClient

    client = KohaClient(KohaSettings(), transport=httpx.MockTransport(_empty_biblio_handler))
    for index in range(11):
        search(
            db,
            client,
            KohaSettings(),
            primary.id,
            SearchParams(q=f"recent-{index}", field="title"),
            record_recent=True,
        )
    assert db.query(SavedSearch).filter_by(user_id=primary.id, kind="recent").count() == 10

    saved_id = (
        db.query(SavedSearch)
        .filter_by(user_id=primary.id, kind="saved")
        .order_by(SavedSearch.updated_at.desc())
        .first()
        .id
    )
    try:
        delete_saved(db, other.id, saved_id)
    except CatalogError as exc:
        assert exc.status_code == 404
        assert exc.message == "That saved search was not found."
    else:
        raise AssertionError("expected CatalogError")

    delete_saved(db, primary.id, saved_id)
    assert db.query(SavedSearch).filter_by(id=saved_id).count() == 0