def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _like(field: str, text: str) -> dict:
    return {field: {"-like": f"%{escape_like(text)}%"}}


def build_biblio_query(
    field: str,
    text: str,
    *,
    year_from: int | None,
    year_to: int | None,
    year_field: str | None,
) -> dict:
    if field == "keyword":
        clause: dict = {"-or": [_like("title", text), _like("author", text)]}
    else:
        clause = _like(field, text)
    if year_field is None or (year_from is None and year_to is None):
        return clause
    if year_from is not None and year_to is not None:
        year_clause = {year_field: {"-between": [year_from, year_to]}}
    elif year_from is not None:
        year_clause = {year_field: {">=": year_from}}
    else:
        year_clause = {year_field: {"<=": year_to}}
    return {"-and": [clause, year_clause]}


def order_by(sort: str, direction: str) -> str:
    if direction == "desc":
        return f"-{sort}"
    return sort
