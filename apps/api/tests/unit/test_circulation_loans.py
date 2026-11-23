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


def test_list_history_raises_circulation_unsupported():
    with pytest.raises(CirculationError) as exc:
        list_history(object())
    assert exc.value.status_code == 501
    assert exc.value.code == "circulation_unsupported"
    assert exc.value.message == "This Koha operation is not available."


def test_get_loan_default_capabilities_raises_unsupported():
    class Client:
        pass

    with pytest.raises(CirculationError) as exc:
        get_loan(Client(), 1, include_barcode=False)
    assert exc.value.status_code == 501
    assert exc.value.code == "circulation_unsupported"