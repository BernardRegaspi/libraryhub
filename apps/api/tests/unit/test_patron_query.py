from app.integrations.koha.patron_query import build_patron_query, patron_order_by


def test_empty_browse_and_one_word():
    assert build_patron_query("  ") is None
    assert build_patron_query("Ada%") == {
        "-or": [
            {"surname": {"-like": "%Ada\\%%"}},
            {"firstname": {"-like": "%Ada\\%%"}},
            {"preferred_name": {"-like": "%Ada\\%%"}},
            {"cardnumber": {"-like": "%Ada\\%%"}},
            {"userid": {"-like": "%Ada\\%%"}},
        ]
    }


def test_two_words_require_each_name_word_or_the_whole_identifier():
    assert build_patron_query("Ada Cruz", category_id="ST", library_id="CPL", status="active") == {
        "category_id": "ST",
        "library_id": "CPL",
        "expired": 0,
        "restricted": 0,
        "-or": [
            {"-and": [
                {"-or": [
                    {"surname": {"-like": "%Ada%"}},
                    {"firstname": {"-like": "%Ada%"}},
                    {"preferred_name": {"-like": "%Ada%"}},
                ]},
                {"-or": [
                    {"surname": {"-like": "%Cruz%"}},
                    {"firstname": {"-like": "%Cruz%"}},
                    {"preferred_name": {"-like": "%Cruz%"}},
                ]},
            ]},
            {"cardnumber": {"-like": "%Ada Cruz%"}},
            {"userid": {"-like": "%Ada Cruz%"}},
        ],
    }


def test_status_and_sort():
    assert build_patron_query("", status="expired") == {"expired": 1}
    assert build_patron_query("", status="restricted") == {"restricted": 1}
    assert patron_order_by("surname", "asc") == "surname"
    assert patron_order_by("expiry_date", "desc") == "-expiry_date"