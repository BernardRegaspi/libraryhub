from __future__ import annotations


class CirculationError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        request_id: str | None = None,
        items: list[dict] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.request_id = request_id
        self.items = items
        super().__init__(message)


def unsupported_write() -> CirculationError:
    return CirculationError(
        501,
        "circulation_unsupported",
        "This Koha operation is not available.",
    )


_PERMISSION_DENIED = CirculationError(
    403,
    "permission_denied",
    "You do not have permission for this action.",
)

_UNAVAILABLE = CirculationError(
    503,
    "circulation_unavailable",
    "Circulation is unavailable. Try again.",
)

_TIMEOUT = CirculationError(
    504,
    "circulation_timeout",
    "The outcome is unknown. Verify before trying again.",
)

_NOT_FOUND = CirculationError(404, "not_found", "That patron was not found.")

_INVALID_SCAN = CirculationError(422, "invalid_scan", "That scan is not valid.")

_INVALID_SEARCH = CirculationError(422, "invalid_search", "That search is not valid.")