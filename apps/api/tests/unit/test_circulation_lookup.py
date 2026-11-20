import pytest

from app.services.circulation_errors import CirculationError
from app.services.circulation_lookup import item_by_barcode, patron_by_card, validate_scan_value


class FakeClient:
    def __init__(self, patrons: list[dict] | None = None, items: list[dict] | None = None) -> None:
        self._patrons = patrons or []
        self._items = items or []

    def search_patrons(self, params: dict) -> list[dict]:
        card = params.get("cardnumber")
        return [row for row in self._patrons if row.get("cardnumber") == card]

    def search_items(self, params: dict) -> list[dict]:
        barcode = params.get("external_id")
        return [row for row in self._items if row.get("external_id") == barcode]


def test_validate_scan_rejects_control_chars():
    with pytest.raises(CirculationError) as exc:
        validate_scan_value("ab\x01c")
    assert exc.value.code == "invalid_scan"


def test_patron_by_card_zero_and_many():
    client = FakeClient(patrons=[{"patron_id": 1, "cardnumber": "C1", "surname": "A", "library_id": "CPL", "category_id": "ST"}])
    with pytest.raises(CirculationError) as none_exc:
        patron_by_card(client, {}, {}, "MISSING")
    assert none_exc.value.code == "not_found"
    client_many = FakeClient(
        patrons=[
            {"patron_id": 1, "cardnumber": "DUP", "surname": "A", "library_id": "CPL", "category_id": "ST"},
            {"patron_id": 2, "cardnumber": "DUP", "surname": "B", "library_id": "CPL", "category_id": "ST"},
        ],
    )
    with pytest.raises(CirculationError) as amb_exc:
        patron_by_card(client_many, {}, {}, "DUP")
    assert amb_exc.value.code == "ambiguous_card"


def test_item_by_barcode_strips_external_id_without_permission():
    client = FakeClient(
        items=[
            {
                "item_id": 7,
                "biblio_id": 3,
                "external_id": "B-1",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
                "itype": "BK",
            },
        ],
    )
    item = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=False)
    assert "external_id" not in item
    item2 = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=True)
    assert item2["external_id"] == "B-1"