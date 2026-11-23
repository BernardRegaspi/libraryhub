class KohaError(Exception):
    def __init__(self) -> None:
        super().__init__("Koha request failed")


class KohaConnectionError(KohaError):
    pass


class KohaTimeoutError(KohaError):
    pass


class KohaNotFound(KohaError):
    pass


class KohaAuthError(KohaError):
    pass


class KohaResponseError(KohaError):
    pass


class KohaRequestError(KohaResponseError):
    def __init__(self, status_code: int, fields: list[str], message: str | None = None) -> None:
        super().__init__()
        self.status_code = status_code
        self.fields = fields
        self.koha_message = message
