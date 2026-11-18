import re

_TRAILING = " :;,."


def _groups(payload: dict) -> dict[str, list]:
    grouped: dict[str, list] = {}
    for field in payload.get("fields") or []:
        if not isinstance(field, dict) or len(field) != 1:
            continue
        tag, body = next(iter(field.items()))
        grouped.setdefault(str(tag), []).append(body)
    return grouped


def _subfields(body: object) -> list[tuple[str, str]]:
    if not isinstance(body, dict):
        return []
    pairs: list[tuple[str, str]] = []
    for sub in body.get("subfields") or []:
        if not isinstance(sub, dict):
            continue
        for code, value in sub.items():
            if isinstance(value, str) and value.strip():
                pairs.append((str(code), value.strip()))
    return pairs


def _values(grouped: dict[str, list], tag: str, code: str) -> list[str]:
    found: list[str] = []
    for body in grouped.get(tag, []):
        for sub_code, value in _subfields(body):
            if sub_code == code:
                found.append(value)
    return found


def _first(grouped: dict[str, list], tag: str, code: str) -> str:
    values = _values(grouped, tag, code)
    return values[0] if values else ""


def _clean_publication(value: str) -> str:
    return value.strip().rstrip(_TRAILING).strip()


def _year(value: str) -> str:
    match = re.search(r"(\d{4})", value)
    if match:
        return match.group(1)
    return _clean_publication(value)


def parse_marc(payload: dict) -> dict:
    grouped = _groups(payload)
    title_parts: list[str] = []
    for body in grouped.get("245", []):
        title_parts.extend(value for code, value in _subfields(body) if code in {"a", "b"})
    authors = _values(grouped, "100", "a") + _values(grouped, "700", "a")
    publication_tag = "264" if grouped.get("264") else "260"
    parsed = {
        "title": " ".join(title_parts),
        "authors": authors,
        "edition": _first(grouped, "250", "a"),
        "place": _clean_publication(_first(grouped, publication_tag, "a")),
        "publisher": _clean_publication(_first(grouped, publication_tag, "b")),
        "year": _year(_first(grouped, publication_tag, "c")) if _first(grouped, publication_tag, "c") else "",
        "isbns": _values(grouped, "020", "a"),
        "subjects": _values(grouped, "650", "a") + _values(grouped, "600", "a"),
        "description": _first(grouped, "520", "a"),
    }
    return {key: value for key, value in parsed.items() if value not in ("", [])}
