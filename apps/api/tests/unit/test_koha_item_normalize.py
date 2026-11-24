from app.integrations.koha.item_normalize import koha_item_barcode, normalize_koha_item


def test_normalize_item_uses_embedded_biblio():
    raw = {
        "item_id": 61405,
        "external_id": "61405",
        "biblio": {"title": "Test title", "author": "Test author"},
        "callnumber": "QA76",
    }
    row = normalize_koha_item(raw)
    assert row["title"] == "Test title"
    assert row["author"] == "Test author"
    assert row["call_number"] == "QA76"
    assert koha_item_barcode(row) == "61405"