_VALID_OUTCOMES = frozenset(
    {
        "verified",
        "misplaced",
        "unexpected",
        "not_found",
        "withdrawn",
        "damaged",
        "other_exception",
        "duplicate",
    }
)

_COUNT_KEYS = (
    "verified",
    "misplaced",
    "unexpected",
    "not_found",
    "withdrawn",
    "damaged",
    "other_exception",
)


def summarize_scans(outcomes: list[str], *, expected_count: int) -> dict[str, int]:
    counts = dict.fromkeys(_COUNT_KEYS, 0)
    duplicates = 0

    for outcome in outcomes:
        if outcome not in _VALID_OUTCOMES:
            raise ValueError(f"unknown inventory scan outcome: {outcome!r}")
        if outcome == "duplicate":
            duplicates += 1
        else:
            counts[outcome] += 1

    seen = (
        counts["verified"]
        + counts["withdrawn"]
        + counts["damaged"]
        + counts["other_exception"]
    )
    needs_a_look = len(outcomes) - duplicates - counts["verified"]
    remaining = max(0, expected_count - seen)

    return {
        "expected_count": expected_count,
        "seen": seen,
        **counts,
        "needs_a_look": needs_a_look,
        "duplicates": duplicates,
        "remaining": remaining,
    }