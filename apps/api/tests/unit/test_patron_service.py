from datetime import date

from app.schemas.patrons import PatronSearchParams
from app.services.patrons import (
    PatronError,
    checkout_item,
    detail_item,
    directory_item,
    get_patron_detail,
    hold_item,
    is_overdue,
    patron_options,
    search_patrons,
    validate_search,
)


ROW = {
    "patron_id": 4,
    "firstname": "Ada",
    "surname": "Cruz",
    "preferred_name": "",
    "cardnumber": "1004",
    "userid": "ada",
    "email": "ada@usant.edu.ph",
    "phone": "555",
    "mobile": "0917",
    "category_id": "ST",
    "library_id": "CPL",
    "date_enrolled": "2020-01-02",
    "expiry_date": "2027-01-02",
    "expired": 0,
    "restricted": 1,
    "patron_card_lost": 0,
    "date_of_birth": "2002-03-04",
    "address": "1 Rizal",
    "address2": "",
    "city": "Iriga",
    "state": "Camarines Sur",
    "postal_code": "4431",
    "country": "PH",
    "staff_notes": "desk note",
    "checkouts_count": 0,
}


def test_directory_hides_contact_and_sensitive_fields():
    item = directory_item(ROW, {"ST": "Student"}, {"CPL": "College Library"})
    assert item["category_name"] == "Student"
    assert item["library_name"] == "College Library"
    assert item["checkouts_count"] == 0
    assert item["overdues_count"] is None
    assert "email" not in item
    assert "date_of_birth" not in item
    assert "staff_notes" not in item


def test_detail_adds_sensitive_fields_only_for_that_permission():
    staff = detail_item(ROW, {"ST": "Student"}, {"CPL": "College Library"}, sensitive=False)
    admin = detail_item(ROW, {"ST": "Student"}, {"CPL": "College Library"}, sensitive=True)
    assert staff["userid"] == "ada"
    assert staff["email"] == "ada@usant.edu.ph"
    assert "date_of_birth" not in staff
    assert admin["date_of_birth"] == "2002-03-04"
    assert admin["staff_notes"] == "desk note"
    assert admin["city"] == "Iriga"


def test_overdue_uses_manila_calendar_date_and_barcode_is_optional():
    assert is_overdue("2026-11-19", None, date(2026, 11, 20)) is True
    assert is_overdue("2026-11-20", None, date(2026, 11, 20)) is False
    assert is_overdue("2026-11-19", "2026-11-19", date(2026, 11, 20)) is False
    hidden = checkout_item(
        {"checkout_id": 1, "item_id": 9, "due_date": "2026-11-19", "external_id": "SECRET", "item": {"biblio": {"title": "Ada"}}},
        include_barcode=False,
        today=date(2026, 11, 20),
    )
    assert hidden["title"] == "Ada"
    assert hidden["overdue"] is True
    assert "external_id" not in hidden
    shown = checkout_item(
        {"checkout_id": 1, "item_id": 9, "due_date": "2026-11-20", "external_id": "100", "renewals_count": 2},
        include_barcode=True,
        today=date(2026, 11, 20),
    )
    assert shown["external_id"] == "100"
    assert shown["title"] is None
    assert hold_item({"hold_id": 3, "status": "W", "biblio_id": 8}, {"CPL": "College"})["title"] is None


class FakePatronClient:
    def __init__(self):
        self.params = None

    def list_patrons(self, params):
        self.params = params
        return [dict(ROW)], {"X-Total-Count": "12"}

    def list_patron_categories(self):
        return [{"patron_category_id": "ST", "name": "Student"}]

    def library_names(self):
        return {"CPL": "College Library"}

    def get_patron(self, patron_id):
        assert patron_id == 4
        return dict(ROW)


def test_search_rejects_a_control_character_and_sends_one_page():
    bad = PatronSearchParams(q="Ada\n")
    try:
        validate_search(bad)
    except PatronError as exc:
        assert exc.code == "invalid_search"
    else:
        raise AssertionError("expected invalid_search")
    client = FakePatronClient()
    payload = search_patrons(
        client,
        PatronSearchParams(q="Ada", page=2, per_page=20, sort="cardnumber", direction="desc"),
    )
    assert client.params["_page"] == "2"
    assert client.params["_per_page"] == "20"
    assert client.params["_order_by"] == "-cardnumber"
    assert payload["total"] == 12
    assert payload["has_next"] is False
    assert payload["items"][0]["cardnumber"] == "1004"
    assert "email" not in payload["items"][0]


def test_options_null_one_list_when_that_call_fails():
    class Partial(FakePatronClient):
        def list_patron_categories(self):
            from app.integrations.koha.exceptions import KohaResponseError

            raise KohaResponseError()

    options = patron_options(Partial())
    assert options["categories"] is None
    assert options["libraries"] == [{"id": "CPL", "name": "College Library"}]


def test_detail_audits_without_field_values(db):
    from app.models.identity import AuditLog

    payload = get_patron_detail(db, FakePatronClient(), 4, user_id=None, sensitive=False)
    assert "staff_notes" not in payload
    row = db.query(AuditLog).filter_by(action="patrons.detail").one()
    assert row.entity_id == "4"
    assert row.details == {"sensitive": False}
    assert "ada@usant.edu.ph" not in str(row.details)