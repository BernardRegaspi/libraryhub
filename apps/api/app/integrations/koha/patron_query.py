from app.integrations.koha.query import escape_like

_NAME_FIELDS = ("surname", "firstname", "preferred_name")
_ONE_WORD_FIELDS = _NAME_FIELDS + ("cardnumber", "userid")


def _like(field: str, text: str) -> dict:
    return {field: {"-like": f"%{escape_like(text)}%"}}


def _text_clause(text: str) -> dict | None:
    stripped = text.strip()
    words = stripped.split()
    if not words:
        return None
    if len(words) == 1:
        return {"-or": [_like(field, words[0]) for field in _ONE_WORD_FIELDS]}
    names = {
        "-and": [
            {"-or": [_like(field, word) for field in _NAME_FIELDS]}
            for word in words
        ]
    }
    return {"-or": [names, _like("cardnumber", stripped), _like("userid", stripped)]}


def _status_clause(status: str, today: str) -> dict:
    # Koha computes `expired` and `restricted` for the response. Those names
    # are not searchable. Expiry is `expiry_date`; a current restriction is
    # a `debarred` date on or after today.
    not_expired = {
        "-or": [
            {"expiry_date": {">=": today}},
            {"expiry_date": None},
        ]
    }
    not_restricted = {
        "-or": [
            {"debarred": None},
            {"debarred": {"<": today}},
        ]
    }
    if status == "expired":
        return {"expiry_date": {"<": today}}
    if status == "restricted":
        return {"debarred": {">=": today}}
    return {"-and": [not_expired, not_restricted]}


def build_patron_query(
    text: str,
    *,
    category_id: str | None = None,
    library_id: str | None = None,
    status: str | None = None,
    today: str | None = None,
) -> dict | None:
    parts: list[dict] = []
    if category_id:
        parts.append({"category_id": category_id})
    if library_id:
        parts.append({"library_id": library_id})
    if status:
        parts.append(_status_clause(status, today or ""))
    clause = _text_clause(text)
    if clause:
        parts.append(clause)
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return {"-and": parts}


def patron_order_by(sort: str, direction: str) -> str:
    if direction == "desc":
        return f"-{sort}"
    return sort