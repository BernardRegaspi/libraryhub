from app.integrations.koha.availability import item_status, summarize_copies
from app.integrations.koha.marc import parse_marc
from app.integrations.koha.query import build_biblio_query, escape_like, order_by


def test_like_escapes_wildcards_and_keyword_is_title_or_author():
    assert escape_like("100%_a\\b") == "100\\%\\_a\\\\b"
    assert build_biblio_query("title", "Ada", year_from=None, year_to=None, year_field=None) == {
        "title": {"-like": "%Ada%"}
    }
    assert build_biblio_query("keyword", "Ada", year_from=None, year_to=None, year_field=None) == {
        "-or": [
            {"title": {"-like": "%Ada%"}},
            {"author": {"-like": "%Ada%"}},
        ]
    }
    assert order_by("author", "desc") == "-author"


def test_empty_browse_has_no_clause_and_letter_is_a_prefix():
    assert build_biblio_query(
        "keyword", "", year_from=None, year_to=None, year_field=None
    ) is None
    assert build_biblio_query(
        "keyword", "", year_from=None, year_to=None, year_field=None, letter="M"
    ) == {"title": {"-like": "M%"}}
    assert build_biblio_query(
        "keyword", "Ada", year_from=None, year_to=None, year_field=None,
        letter="A", author="Lovelace", publisher="Murray",
    ) == {
        "-and": [
            {"-or": [
                {"title": {"-like": "%Ada%"}},
                {"author": {"-like": "%Ada%"}},
            ]},
            {"title": {"-like": "A%"}},
            {"author": {"-like": "%Lovelace%"}},
            {"publisher": {"-like": "%Murray%"}},
        ]
    }


def test_year_filter_uses_between_and_comparisons():
    assert build_biblio_query(
        "title", "Ada", year_from=1990, year_to=2000, year_field="copyright_date"
    ) == {
        "-and": [
            {"title": {"-like": "%Ada%"}},
            {"copyright_date": {"-between": [1990, 2000]}},
        ]
    }


def test_status_order_and_summary():
    assert item_status({"withdrawn": 1, "lost_status": 1}) == ("withdrawn", "Withdrawn")
    assert item_status({"withdrawn": 0, "lost_status": 0, "damaged_status": 0,
                        "not_for_loan_status": 0, "effective_not_for_loan_status": 0,
                        "checked_out_date": None, "home_library_id": "CPL",
                        "holding_library_id": "UCL"}) == ("in_transit", "In transit")
    assert item_status({"withdrawn": 0, "lost_status": 0, "damaged_status": 0,
                        "not_for_loan_status": 0, "effective_not_for_loan_status": 0,
                        "checked_out_date": None, "home_library_id": "CPL",
                        "holding_library_id": "CPL"}) == ("available", "Available")
    available = summarize_copies(
        [{"withdrawn": 0, "lost_status": 0, "damaged_status": 0, "not_for_loan_status": 0,
          "effective_not_for_loan_status": 0, "checked_out_date": "2024-01-01",
          "home_library_id": "CPL", "holding_library_id": "CPL"},
         {"withdrawn": 0, "lost_status": 0, "damaged_status": 0, "not_for_loan_status": 0,
          "effective_not_for_loan_status": 0, "checked_out_date": None,
          "home_library_id": "CPL", "holding_library_id": "CPL"}],
        failed=False,
        checked_at="2026-11-17T06:00:00+00:00",
    )
    assert available["status"] == "available"
    assert available["available_count"] == 1
    assert available["copy_count"] == 2
    assert summarize_copies([], failed=False, checked_at="2026-11-17T06:00:00+00:00")["status"] == "no_copies"
    unknown = summarize_copies(None, failed=True, checked_at=None)
    assert unknown == {
        "status": "unknown",
        "label": "Availability unavailable",
        "copy_count": 0,
        "available_count": 0,
        "last_checked": None,
    }


def test_marc_parser_reads_the_detail_fields_and_drops_empty_ones():
    payload = {
        "fields": [
            {"245": {"subfields": [{"a": "Ada "}, {"b": "a biography"}], "ind1": "1", "ind2": "0"}},
            {"100": {"subfields": [{"a": "Lovelace, Ada"}], "ind1": "1", "ind2": " "}},
            {"700": {"subfields": [{"a": "Babbage, Charles"}], "ind1": "1", "ind2": " "}},
            {"250": {"subfields": [{"a": "2nd ed."}], "ind1": " ", "ind2": " "}},
            {"264": {"subfields": [{"a": "London :"}, {"b": "Murray,"}, {"c": "2019."}], "ind1": " ", "ind2": "1"}},
            {"020": {"subfields": [{"a": "9780000000000"}], "ind1": " ", "ind2": " "}},
            {"650": {"subfields": [{"a": "Mathematics"}], "ind1": " ", "ind2": "0"}},
            {"520": {"subfields": [{"a": "A short life."}], "ind1": " ", "ind2": " "}},
            {"999": {"subfields": [{"a": "ignore"}], "ind1": " ", "ind2": " "}},
        ]
    }
    parsed = parse_marc(payload)
    assert parsed["title"] == "Ada a biography"
    assert parsed["authors"] == ["Lovelace, Ada", "Babbage, Charles"]
    assert parsed["edition"] == "2nd ed."
    assert parsed["place"] == "London"
    assert parsed["publisher"] == "Murray"
    assert parsed["year"] == "2019"
    assert parsed["isbns"] == ["9780000000000"]
    assert parsed["subjects"] == ["Mathematics"]
    assert parsed["description"] == "A short life."
