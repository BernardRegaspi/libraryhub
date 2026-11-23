from datetime import date

import pytest

from app.services.circulation_errors import CirculationError
from app.services.circulation_loans import get_loan, list_history, list_loans


def test_loans_require_patron_and_null_overdue_when_no_due_date(monkeypatch):
    today = date(2026, 11, 20)

    class Client:
        def list_checkouts(self, patron_id: int):
            return [
                {"checkout_id": 1, "item_id": 2, "due_date": None, "patron_id": patron_id},
                {"checkout_id": 2, "item_id": 3, "due_date": "2026-11-10", "patron_id": patron_id},
            ]

    result = list_loans(
        Client(),
        patron_id=5,
        q="",
        overdue=None,
        page=1,
        per_page=20,
        sort="due_date",
        direction="asc",
        include_barcode=False,
        today=today,
    )
    assert result["items"][0]["overdue"] is None
    assert result["items"][1]["overdue"] is True


def test_include_barcode_gates_external_id_only():
    today = date(2026, 11, 20)
    row = {
        "checkout_id": 1,
        "item_id": 2,
        "patron_id": 9,
        "cardnumber": "C-42",
        "due_date": "2026-12-01",
        "external_id": "BC123",
    }

    class Client:
        def list_checkouts(self, patron_id: int):
            return [row]

    without = list_loans(
        Client(),
        patron_id=1,
        q="",
        overdue=None,
        page=1,
        per_page=20,
        sort="due_date",
        direction="asc",
        include_barcode=False,
        today=today,
    )["items"][0]
    assert "external_id" not in without
    assert without["cardnumber"] == "C-42"

    with_barcode = list_loans(
        Client(),
        patron_id=1,
        q="",
        overdue=None,
        page=1,
        per_page=20,
        sort="due_date",
        direction="asc",
        include_barcode=True,
        today=today,
    )["items"][0]
    assert with_barcode["external_id"] == "BC123"
    assert with_barcode["cardnumber"] == "C-42"


def test_list_history_maps_checked_in_loans():
    today = date(2026, 11, 20)

    class Client:
        def list_checkout_records(self, *, checked_in: bool, page: int, per_page: int):
            assert page == 1
            assert per_page == 20
            if not checked_in:
                return ([], 0)
            return (
                [
                    {
                        "checkout_id": 8,
                        "item_id": 3,
                        "patron_id": 5,
                        "library_id": "CPL",
                        "due_date": "2026-11-01",
                        "checkout_date": "2026-10-01",
                        "checkin_date": "2026-10-20",
                        "item": {
                            "biblio": {"title": "A title"},
                            "callnumber": "123 ADA",
                            "item_type_id": "BK",
                            "external_id": "BC1",
                        },
                        "patron": {"preferred_name": "Ada", "cardnumber": "C-1"},
                    }
                ],
                1,
            )

    result = list_history(
        Client(),
        page=1,
        per_page=20,
        include_barcode=True,
        today=today,
    )
    item = result["items"][0]
    assert item["title"] == "A title"
    assert item["type"] == "checkin"
    assert item["returned_date"] == "2026-10-20"
    assert item["patron_name"] == "Ada"
    assert item["call_number"] == "123 ADA"
    assert item["item_type_id"] == "BK"
    assert item["library_id"] == "CPL"
    assert item["external_id"] == "BC1"
    assert "cardnumber" not in item or item["cardnumber"] is None
    assert result["total"] == 1
    assert result["has_next"] is False


def test_list_history_hides_barcode_and_rejects_bad_page():
    class Client:
        def list_checkout_records(self, *, checked_in: bool, page: int, per_page: int):
            if not checked_in:
                return ([], 0)
            return (
                [
                    {
                        "checkout_id": 1,
                        "item_id": 2,
                        "item": {"external_id": "SECRET", "biblio": {"title": "Hidden"}},
                    }
                ],
                1,
            )

    hidden = list_history(Client(), include_barcode=False, today=date(2026, 11, 20))["items"][0]
    assert "external_id" not in hidden
    with pytest.raises(CirculationError) as exc:
        list_history(Client(), page=0)
    assert exc.value.code == "invalid_search"


def test_list_history_puts_a_new_checkout_ahead_of_returned_loans():
    class Client:
        def list_checkout_records(self, *, checked_in: bool, page: int, per_page: int):
            if checked_in:
                return (
                    [
                        {
                            "checkout_id": 1,
                            "checkout_date": "2026-10-01",
                            "checkin_date": "2026-10-20",
                            "item": {"biblio": {"title": "Returned"}},
                        }
                    ],
                    1,
                )
            return (
                [
                    {
                        "checkout_id": 6,
                        "checkout_date": "2026-11-23",
                        "checkin_date": None,
                        "item": {"biblio": {"title": "Just checked out"}},
                    }
                ],
                1,
            )

    items = list_history(Client(), today=date(2026, 11, 23))["items"]
    assert [row["title"] for row in items] == ["Just checked out", "Returned"]
    assert items[0]["type"] == "checkout"
    assert items[0]["returned_date"] is None
    assert items[1]["type"] == "checkin"


def test_get_loan_default_capabilities_raises_unsupported():
    class Client:
        pass

    with pytest.raises(CirculationError) as exc:
        get_loan(Client(), 1, include_barcode=False)
    assert exc.value.status_code == 501
    assert exc.value.code == "circulation_unsupported"