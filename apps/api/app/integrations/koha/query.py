def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _like(field: str, text: str) -> dict:
    return {field: {"-like": f"%{escape_like(text)}%"}}


def _prefix(field: str, letter: str) -> dict:
    return {field: {"-like": f"{escape_like(letter)}%"}}


def build_biblio_query(
    field: str,
    text: str,
    *,
    year_from: int | None,
    year_to: int | None,
    year_field: str | None,
    letter: str | None = None,
    author: str | None = None,
    publisher: str | None = None,
) -> dict | None:
    clauses: list[dict] = []
    if text:
        if field == "keyword":
            clauses.append({"-or": [_like("title", text), _like("author", text)]})
        else:
            clauses.append(_like(field, text))
    if letter:
        clauses.append(_prefix("title", letter))
    if author:
        clauses.append(_like("author", author))
    if publisher:
        clauses.append(_like("publisher", publisher))
    if year_field is not None and (year_from is not None or year_to is not None):
        if year_from is not None and year_to is not None:
            clauses.append({year_field: {"-between": [year_from, year_to]}})
        elif year_from is not None:
            clauses.append({year_field: {">=": year_from}})
        else:
            clauses.append({year_field: {"<=": year_to}})
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"-and": clauses}


def order_by(sort: str, direction: str) -> str:
    if direction == "desc":
        return f"-{sort}"
    return sort
