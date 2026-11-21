_PAIRS: dict[str, tuple[str, str]] = {
    "not_found": (
        "Search the shelf again",
        "Leave the Koha status unchanged",
    ),
    "misplaced": (
        "Reshelve to the session location",
        "Leave it where it was found",
    ),
    "unexpected": (
        "Check the Koha item record",
        "Reshelve to its home library",
    ),
    "damaged": (
        "Set the book aside for repair",
        "Leave it on the shelf",
    ),
    "withdrawn": (
        "Remove it from the shelf",
        "Leave it on the shelf",
    ),
    "other_exception": (
        "Set the book aside for a librarian",
        "Leave it on the shelf",
    ),
}


def actions_for(outcome: str) -> tuple[str, str] | None:
    return _PAIRS.get(outcome)


def action_allowed(outcome: str, action: str) -> bool:
    pair = _PAIRS.get(outcome)
    return pair is not None and action in pair