from datetime import date

from app.services.patrons import checkout_item, detail_item, directory_item, hold_item, is_overdue


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