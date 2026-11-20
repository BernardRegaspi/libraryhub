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


def build_patron_query(
    text: str,
    *,
    category_id: str | None = None,
    library_id: str | None = None,
    status: str | None = None,
) -> dict | None:
    query: dict = {}
    if category_id:
        query["category_id"] = category_id
    if library_id:
        query["library_id"] = library_id
    if status == "active":
        query["expired"] = 0
        query["restricted"] = 0
    elif status == "expired":
        query["expired"] = 1
    elif status == "restricted":
        query["restricted"] = 1
    clause = _text_clause(text)
    if clause:
        query.update(clause)
    return query or None


def patron_order_by(sort: str, direction: str) -> str:
    if direction == "desc":
        return f"-{sort}"
    return sort