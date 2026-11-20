from datetime import date

from app.integrations.koha.exceptions import KohaRequestError, KohaResponseError
from app.schemas.patrons import PatronSearchParams, PatronWrite
from app.services.patrons import (
    PatronError,
    checkout_item,
    create_patron_record,
    detail_item,
    directory_item,
    get_patron_detail,
    hold_item,
    is_overdue,
    patron_checkouts,
    patron_holds,
    patron_balance,
    patron_options,
    patron_summary,
    search_patrons,
    update_patron_record,
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
    assert is_overdue("not-a-date", None, date(2026, 11, 20)) is False
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


def test_activity_failure_is_unavailable_and_success_keeps_an_empty_list():
    class Loans:
        def list_checkouts(self, patron_id):
            raise KohaResponseError()

        def list_holds(self, patron_id):
            return []

        def library_names(self):
            return {}

    assert patron_checkouts(Loans(), 4, include_barcode=False, today=date(2026, 11, 20)) == {
        "status": "unavailable"
    }
    holds = patron_holds(Loans(), 4)
    assert holds == {"status": "ok", "items": []}


def test_patron_holds_keeps_holds_when_library_names_fail():
    hold_row = {
        "hold_id": 5,
        "status": "T",
        "biblio_id": 12,
        "pickup_library_id": "CPL",
    }

    class HoldsClient:
        def list_holds(self, patron_id):
            assert patron_id == 4
            return [hold_row]

        def library_names(self):
            raise KohaResponseError()

    result = patron_holds(HoldsClient(), 4)
    assert result == {
        "status": "ok",
        "items": [
            {
                "hold_id": 5,
                "status": "T",
                "hold_date": None,
                "waiting_date": None,
                "expiration_date": None,
                "pickup_library_id": "CPL",
                "pickup_library_name": None,
                "biblio_id": 12,
                "title": None,
            }
        ],
    }


def test_detail_audits_without_field_values(db):
    from app.models.identity import AuditLog

    detail_q = db.query(AuditLog).filter_by(action="patrons.detail", entity_id="4")
    before = detail_q.count()
    payload = get_patron_detail(db, FakePatronClient(), 4, user_id=None, sensitive=False)
    assert "staff_notes" not in payload
    assert detail_q.count() == before + 1
    row = detail_q.order_by(AuditLog.created_at.desc()).first()
    assert row is not None
    assert row.entity_id == "4"
    assert row.details == {"sensitive": False}
    assert "ada@usant.edu.ph" not in str(row.details)


class WriteClient:
    def __init__(self):
        self.created = None
        self.updated = None
        self.confirm = None

    def list_patron_categories(self):
        return [{"patron_category_id": "ST", "name": "Student"}]

    def library_names(self):
        return {"CPL": "College Library"}

    def create_patron(self, body, *, confirm_duplicate):
        self.created = body
        self.confirm = confirm_duplicate
        return {**ROW, **body, "patron_id": 8}

    def get_patron(self, patron_id):
        return dict(ROW)

    def update_patron(self, patron_id, body):
        self.updated = body
        return body


def test_create_sends_required_fields_and_audits_names(db):
    from app.models.identity import AuditLog

    create_q = db.query(AuditLog).filter_by(action="patrons.create", entity_id="8")
    before = create_q.count()
    client = WriteClient()
    payload = PatronWrite(surname="Cruz", library_id="CPL", category_id="ST", email="ada@usant.edu.ph")
    created = create_patron_record(db, client, payload, user_id=None, sensitive=False)
    assert client.created == {"surname": "Cruz", "library_id": "CPL", "category_id": "ST", "email": "ada@usant.edu.ph"}
    assert client.confirm is False
    assert created["patron_id"] == 8
    assert create_q.count() == before + 1
    audit = create_q.order_by(AuditLog.created_at.desc()).first()
    assert audit is not None
    assert audit.entity_id == "8"
    assert audit.details["fields"] == ["surname", "library_id", "category_id", "email"]
    assert "ada@usant.edu.ph" not in str(audit.details)


def test_sensitive_write_without_permission_does_not_call_koha(db):
    client = WriteClient()
    payload = PatronWrite(surname="Cruz", library_id="CPL", category_id="ST", staff_notes="hidden")
    try:
        create_patron_record(db, client, payload, user_id=None, sensitive=False)
    except PatronError as exc:
        assert exc.status_code == 403
        assert exc.code == "permission_denied"
    else:
        raise AssertionError("expected permission_denied")
    assert client.created is None


def test_update_overlays_and_a_duplicate_does_not_confirm(db):
    from app.models.identity import AuditLog

    update_before = db.query(AuditLog).filter_by(action="patrons.update").count()

    class Duplicate(WriteClient):
        def update_patron(self, patron_id, body):
            self.updated = body
            raise KohaRequestError(409, ["cardnumber"])

    client = Duplicate()
    payload = PatronWrite(cardnumber="999", confirm_duplicate=True)
    try:
        update_patron_record(db, client, 4, payload, user_id=None, sensitive=True)
    except PatronError as exc:
        assert exc.code == "patron_duplicate"
    else:
        raise AssertionError("expected patron_duplicate")
    assert client.updated["surname"] == "Cruz"
    assert client.updated["cardnumber"] == "999"
    assert "confirm_duplicate" not in client.updated
    assert db.query(AuditLog).filter_by(action="patrons.update").count() == update_before


def test_summary_counts_students_and_faculty_inside_the_current_filters():
    class SummaryClient:
        def list_patron_categories(self):
            return [
                {"patron_category_id": "ST", "name": "Student"},
                {"patron_category_id": "FACULTY", "name": "Faculty"},
                {"patron_category_id": "J", "name": "Juvenile"},
            ]

        def list_patrons(self, params):
            raw = params.get("q") or ""
            if '"category_id": "ST"' in raw:
                total = "4"
            elif '"category_id": "FACULTY"' in raw:
                total = "2"
            else:
                total = "10"
            return [], {"X-Total-Count": total}

    result = patron_summary(SummaryClient(), PatronSearchParams(q="Ada"))
    assert result["total"] == 10
    assert result["students"] == 4
    assert result["faculty_staff"] == 2
    assert result["outstanding_fines"] is None


def test_balance_is_unavailable_when_koha_fails():
    class Broken:
        def get_patron_balance(self, patron_id):
            raise KohaResponseError()

    assert patron_balance(Broken(), 4) == {"status": "unavailable"}