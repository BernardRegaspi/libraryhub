import logging
import sys
from typing import Any

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    if root.handlers:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = getattr(record, "request_id", "-")
        return True


def log_extra(request_id: str | None = None, **fields: Any) -> dict[str, Any]:
    extra: dict[str, Any] = dict(fields)
    if request_id:
        extra["request_id"] = request_id
    return extra