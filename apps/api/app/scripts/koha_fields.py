from app.core.config import get_settings
from app.integrations.koha.client import KohaClient
from app.integrations.koha.exceptions import KohaError, KohaResponseError

_YEAR_KEYS = ("copyright_date", "publication_year", "copyrightdate")
_CORE_KEYS = ("title", "author", "isbn")


def main() -> None:
    settings = get_settings()
    if not settings.koha_base_url or not settings.koha_client_id:
        print("Koha is not configured")
        raise SystemExit(2)

    client = KohaClient(settings)
    try:
        body, _headers = client.get_json("/biblios", {"_per_page": "1"})
    except KohaError as exc:
        print(type(exc).__name__)
        raise SystemExit(2) from exc

    if not isinstance(body, list) or not body or not isinstance(body[0], dict):
        print(KohaResponseError.__name__)
        raise SystemExit(2)

    first = body[0]
    keys = sorted(first.keys())
    print(f"keys: {','.join(keys)}")

    for field in _CORE_KEYS:
        if field not in first:
            print(f"{field}-missing")

    for name in _YEAR_KEYS:
        if name in first:
            print(f"year-field: {name}")
            break

    for key in keys:
        if "subject" in key:
            print(f"subject-field: {key}")
            break


if __name__ == "__main__":
    main()