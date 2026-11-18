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
