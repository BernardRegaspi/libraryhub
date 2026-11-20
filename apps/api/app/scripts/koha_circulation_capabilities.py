import json
import urllib.error
import urllib.request

from app.core.config import get_settings

_TAGS = ("checkouts", "checkins", "renewals")


def main() -> None:
    settings = get_settings()
    if not settings.koha_base_url:
        print("Koha is not configured")
        raise SystemExit(2)
    base = settings.koha_base_url.rstrip("/")
    if not base.endswith("/api/v1"):
        base = f"{base}/api/v1"
    url = f"{base}/.well-known/openapi"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            document = json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
        print(type(exc).__name__)
        raise SystemExit(2) from exc
    paths = document.get("paths", {})
    for path, operations in sorted(paths.items()):
        if not isinstance(operations, dict):
            continue
        lowered = path.lower()
        if not any(tag in lowered for tag in _TAGS):
            continue
        for method, detail in operations.items():
            if method.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                continue
            print(f"{method.upper()} {path}")


if __name__ == "__main__":
    main()