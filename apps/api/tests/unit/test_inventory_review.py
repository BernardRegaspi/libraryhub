from app.services.inventory_review import action_allowed, actions_for


def test_actions_for_each_exception_outcome():
    assert actions_for("not_found") == (
        "Search the shelf again",
        "Leave the Koha status unchanged",
    )
    assert actions_for("misplaced") == (
        "Reshelve to the session location",
        "Leave it where it was found",
    )
    assert actions_for("unexpected") == (
        "Check the Koha item record",
        "Reshelve to its home library",
    )
    assert actions_for("damaged") == (
        "Set the book aside for repair",
        "Leave it on the shelf",
    )
    assert actions_for("withdrawn") == (
        "Remove it from the shelf",
        "Leave it on the shelf",
    )
    assert actions_for("other_exception") == (
        "Set the book aside for a librarian",
        "Leave it on the shelf",
    )


def test_verified_and_duplicate_have_no_actions():
    assert actions_for("verified") is None
    assert actions_for("duplicate") is None
    assert action_allowed("verified", "Leave it on the shelf") is False


def test_leave_it_on_the_shelf_is_limited_to_three_outcomes():
    assert action_allowed("damaged", "Leave it on the shelf") is True
    assert action_allowed("withdrawn", "Leave it on the shelf") is True
    assert action_allowed("other_exception", "Leave it on the shelf") is True
    assert action_allowed("not_found", "Leave it on the shelf") is False
    assert action_allowed("damaged", "Search the shelf again") is False