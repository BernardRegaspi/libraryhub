import json

import pytest

from app.integrations.koha.exceptions import KohaError
from app.services.circulation_errors import CirculationError
from app.services.circulation_lookup import (
    desk_patron,
    item_by_barcode,
    patron_by_card,
    validate_scan_value,
)


class FakeClient:
    def __init__(
        self,
        patrons: list[dict] | None = None,
        items: list[dict] | None = None,
        *,
        balance_error: bool = False,
    ) -> None:
        self._patrons = patrons or []
        self._items = items or []
        self._balance_error = balance_error
        self.last_patron_search: dict | None = None
        self.last_item_search: dict | None = None
        self.last_patron_embed: str | None = None

    def search_patrons(self, params: dict) -> list[dict]:
        self.last_patron_search = params
        q = params.get("q")
        if not isinstance(q, str):
            return []
        query = json.loads(q)
        card = query.get("cardnumber")
        if not isinstance(card, str):
            return []
        return [row for row in self._patrons if row.get("cardnumber") == card]

    def search_items(self, params: dict) -> list[dict]:
        self.last_item_search = params
        q = params.get("q")
        if not isinstance(q, str):
            return []
        query = json.loads(q)
        barcode = query.get("external_id")
        if not isinstance(barcode, str):
            return []
        return [row for row in self._items if row.get("external_id") == barcode]

    def get_patron(self, patron_id: int, *, embed: str | None = None) -> dict:
        self.last_patron_embed = embed
        for row in self._patrons:
            if row.get("patron_id") == patron_id:
                return row
        raise KohaError()

    def get_patron_balance(self, patron_id: int):
        if self._balance_error:
            raise KohaError()
        return 12.5


def test_validate_scan_rejects_control_chars():
    with pytest.raises(CirculationError) as exc:
        validate_scan_value("ab\x01c")
    assert exc.value.code == "invalid_scan"
    assert exc.value.message == "That scan is not valid."


def test_patron_by_card_zero_and_many():
    client = FakeClient(
        patrons=[
            {
                "patron_id": 1,
                "cardnumber": "C1",
                "surname": "A",
                "library_id": "CPL",
                "category_id": "ST",
            },
        ],
    )
    with pytest.raises(CirculationError) as none_exc:
        patron_by_card(client, {}, {}, "MISSING")
    assert none_exc.value.code == "not_found"
    assert none_exc.value.message == "No patron matches that card number."
    client_many = FakeClient(
        patrons=[
            {"patron_id": 1, "cardnumber": "DUP", "surname": "A", "library_id": "CPL", "category_id": "ST"},
            {"patron_id": 2, "cardnumber": "DUP", "surname": "B", "library_id": "CPL", "category_id": "ST"},
        ],
    )
    with pytest.raises(CirculationError) as amb_exc:
        patron_by_card(client_many, {}, {}, "DUP")
    assert amb_exc.value.code == "ambiguous_card"
    assert amb_exc.value.message == "More than one patron has that card number."


def test_patron_by_card_exact_hit_and_trimmed_query():
    client = FakeClient(
        patrons=[
            {"patron_id": 1, "cardnumber": "C1", "surname": "A", "library_id": "CPL", "category_id": "ST"},
            {"patron_id": 2, "cardnumber": "C10", "surname": "B", "library_id": "CPL", "category_id": "ST"},
        ],
    )
    patron = patron_by_card(client, {}, {"CPL": "College"}, "C1\r")
    assert patron["patron_id"] == 1
    assert client.last_patron_search is not None
    assert "cardnumber" not in client.last_patron_search
    q = json.loads(client.last_patron_search["q"])
    assert q == {"cardnumber": "C1"}
    assert q["cardnumber"] != "C1\r"
    patron_by_card(client, {}, {}, "C1 ")
    q2 = json.loads(client.last_patron_search["q"])
    assert q2["cardnumber"] == "C1"
    with pytest.raises(CirculationError) as short_exc:
        patron_by_card(client, {}, {}, "C")
    assert short_exc.value.message == "No patron matches that card number."


def test_item_by_barcode_strips_external_id_without_permission():
    client = FakeClient(
        items=[
            {
                "item_id": 7,
                "biblio_id": 3,
                "external_id": "B-1",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
                "item_type_id": "BK",
            },
        ],
    )
    item = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=False)
    assert "external_id" not in item
    item2 = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=True)
    assert item2["external_id"] == "B-1"


def test_item_by_barcode_not_found_and_ambiguous():
    client = FakeClient(items=[])
    with pytest.raises(CirculationError) as none_exc:
        item_by_barcode(client, {}, {}, "MISSING", include_barcode=True)
    assert none_exc.value.code == "not_found"
    assert none_exc.value.message == "No item matches that barcode."
    client_many = FakeClient(
        items=[
            {"item_id": 1, "external_id": "DUP", "home_library_id": "CPL", "holding_library_id": "CPL"},
            {"item_id": 2, "external_id": "DUP", "home_library_id": "CPL", "holding_library_id": "CPL"},
        ],
    )
    with pytest.raises(CirculationError) as amb_exc:
        item_by_barcode(client_many, {}, {}, "DUP", include_barcode=True)
    assert amb_exc.value.code == "ambiguous_item"
    assert amb_exc.value.message == "More than one item has that barcode."


def test_item_by_barcode_uses_item_type_id_and_embedded_biblio():
    client = FakeClient(
        items=[
            {
                "item_id": 7,
                "biblio_id": 3,
                "external_id": "B-1",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
                "item_type_id": "BK",
                "biblio": {"biblio_id": 3, "title": "Ada", "author": "Byron"},
            },
        ],
    )
    item = item_by_barcode(client, {"BK": "Book"}, {"CPL": "College"}, "B-1", include_barcode=True)
    assert item["item_type_id"] == "BK"
    assert item["item_type_label"] == "Book"
    assert item["title"] == "Ada"
    q = json.loads(client.last_item_search["q"])
    assert q == {"external_id": "B-1"}


def test_item_by_barcode_missing_item_type_label_falls_back_to_id():
    client = FakeClient(
        items=[
            {
                "item_id": 8,
                "external_id": "B-2",
                "item_type_id": 42,
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
            },
        ],
    )
    item = item_by_barcode(client, {}, {"CPL": "College"}, "B-2", include_barcode=False)
    assert item["item_type_label"] == "42"


def test_item_by_barcode_null_item_type_label_when_id_missing():
    client = FakeClient(
        items=[
            {
                "item_id": 9,
                "external_id": "B-3",
                "home_library_id": "CPL",
                "holding_library_id": "CPL",
            },
        ],
    )
    item = item_by_barcode(client, {}, {"CPL": "College"}, "B-3", include_barcode=False)
    assert item["item_type_id"] is None
    assert item["item_type_label"] is None


def test_desk_patron_keeps_cardnumber_and_null_balance_on_koha_error():
    client = FakeClient(
        patrons=[
            {
                "patron_id": 4,
                "cardnumber": "C9",
                "surname": "Doe",
                "library_id": "CPL",
                "category_id": "ST",
                "checkouts_count": 2,
                "overdues_count": 0,
            },
        ],
        balance_error=True,
    )
    item = desk_patron(client, {}, {"CPL": "College"}, 4, include_barcode=False)
    assert item["cardnumber"] == "C9"
    assert item["balance"] is None
    assert client.last_patron_embed == "checkouts+count,overdues+count"