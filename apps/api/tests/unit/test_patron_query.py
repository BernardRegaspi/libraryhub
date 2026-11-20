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
    assert build_patron_query(
        "Ada Cruz",
        category_id="ST",
        library_id="CPL",
        status="active",
        today="2026-11-20",
    ) == {
        "-and": [
        {"category_id": "ST"},
        {"library_id": "CPL"},
        {
            "-and": [
                {
                    "-or": [
                        {"expiry_date": {">=": "2026-11-20"}},
                        {"expiry_date": None},
                    ]
                },
                {
                    "-or": [
                        {"debarred": None},
                        {"debarred": {"<": "2026-11-20"}},
                    ]
                },
            ]
        },
        {"-or": [
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
        ]},
        ],
    }


def test_status_and_sort():
    assert build_patron_query("", status="expired", today="2026-11-20") == {
        "expiry_date": {"<": "2026-11-20"}
    }
    assert build_patron_query("", status="restricted", today="2026-11-20") == {
        "debarred": {">=": "2026-11-20"}
    }
    assert "expired" not in build_patron_query("", status="active", today="2026-11-20")
    assert patron_order_by("surname", "asc") == "surname"
    assert patron_order_by("expiry_date", "desc") == "-expiry_date"