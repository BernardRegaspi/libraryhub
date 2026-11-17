import json
import logging
import time
from datetime import datetime, timezone

import httpx

from app.integrations.koha.exceptions import (
    KohaAuthError,
    KohaConnectionError,
    KohaError,
    KohaNotFound,
    KohaResponseError,
    KohaTimeoutError,
)

logger = logging.getLogger("app.integrations.koha")
_CACHE_SECONDS = 600


def api_root(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/api/v1"):
        return base
    return f"{base}/api/v1"


class KohaClient:
    def __init__(self, settings, transport: httpx.BaseTransport | None = None) -> None:
        self._settings = settings
        self._transport = transport
        self._token: str | None = None
        self._token_deadline = 0.0
        self._libraries: tuple[float, dict[str, str]] | None = None
        self._item_types: tuple[float, dict[str, str]] | None = None

    def _http(self) -> httpx.Client:
        return httpx.Client(transport=self._transport, timeout=self._settings.koha_api_timeout)

    def _log(self, path: str, status: int, started: float) -> None:
        duration_ms = int((time.perf_counter() - started) * 1000)
        logger.info("%s %s %sms", path, status, duration_ms)

    def _send(self, client: httpx.Client, method: str, url: str, path: str, **kwargs) -> httpx.Response:
        started = time.perf_counter()
        try:
            response = client.request(method, url, **kwargs)
        except httpx.TimeoutException as exc:
            raise KohaTimeoutError from exc
        except httpx.TransportError as exc:
            raise KohaConnectionError from exc
        self._log(path, response.status_code, started)
        return response

    def _fetch_token(self, client: httpx.Client) -> None:
        response = self._send(
            client,
            "POST",
            f"{api_root(self._settings.koha_base_url)}/oauth/token",
            "/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self._settings.koha_client_id,
                "client_secret": self._settings.koha_client_secret,
            },
        )
        if response.status_code >= 400:
            raise KohaAuthError
        body = response.json()
        expires_in = int(body.get("expires_in") or 60)
        self._token = str(body["access_token"])
        self._token_deadline = time.monotonic() + max(expires_in - 30, 1)

    def _bearer(self, client: httpx.Client) -> str:
        if self._token is None or time.monotonic() >= self._token_deadline:
            self._fetch_token(client)
        return self._token or ""

    def get_json(
        self,
        path: str,
        params: dict | None = None,
        accept: str = "application/json",
        *,
        _retry: bool = True,
    ) -> tuple[object, httpx.Headers]:
        with self._http() as client:
            token = self._bearer(client)
            response = self._send(
                client,
                "GET",
                f"{api_root(self._settings.koha_base_url)}{path}",
                path,
                params=params,
                headers={"Authorization": f"Bearer {token}", "Accept": accept},
            )
        if response.status_code == 401 and _retry:
            self._token = None
            return self.get_json(path, params, accept, _retry=False)
        return self._interpret(response)

    def get_bytes(self, url: str) -> tuple[bytes, str]:
        with self._http() as client:
            token = self._bearer(client)
            response = self._send(
                client,
                "GET",
                url,
                "/cover",
                headers={"Authorization": f"Bearer {token}"},
            )
        if response.status_code == 401:
            self._token = None
            with self._http() as client:
                token = self._bearer(client)
                response = self._send(
                    client,
                    "GET",
                    url,
                    "/cover",
                    headers={"Authorization": f"Bearer {token}"},
                )
        body, _headers = self._interpret(response)
        content_type = response.headers.get("content-type", "application/octet-stream")
        if isinstance(body, bytes):
            return body, content_type
        return response.content, content_type

    def list_items_for_biblios(self, biblio_ids: list[int]) -> tuple[list[dict] | None, str | None]:
        checked_at = datetime.now(timezone.utc).isoformat()
        if not biblio_ids:
            return [], checked_at
        try:
            body, _headers = self.get_json(
                "/items",
                {
                    "q": json.dumps({"biblio_id": {"-in": biblio_ids}}),
                    "_per_page": max(len(biblio_ids) * 20, 20),
                },
            )
            if isinstance(body, list):
                return [row for row in body if isinstance(row, dict)], checked_at
        except KohaResponseError:
            pass
        items: list[dict] = []
        any_ok = False
        for biblio_id in biblio_ids:
            try:
                body, _headers = self.get_json(f"/biblios/{biblio_id}/items")
            except KohaError:
                continue
            any_ok = True
            if isinstance(body, list):
                items.extend(row for row in body if isinstance(row, dict))
        if not any_ok:
            return None, None
        return items, checked_at

    def library_names(self) -> dict[str, str]:
        return self._cached_names(
            "_libraries",
            "/libraries",
            "library_id",
            "name",
        )

    def item_type_labels(self) -> dict[str, str]:
        return self._cached_names(
            "_item_types",
            "/item_types",
            "item_type_id",
            "description",
        )

    def _cached_names(self, slot: str, path: str, id_key: str, label_key: str) -> dict[str, str]:
        cached = getattr(self, slot)
        now = time.monotonic()
        if cached is not None and cached[0] > now:
            return cached[1]
        try:
            body, _headers = self.get_json(path)
        except KohaError:
            return {}
        names: dict[str, str] = {}
        if isinstance(body, list):
            for row in body:
                if isinstance(row, dict) and row.get(id_key) and row.get(label_key):
                    names[str(row[id_key])] = str(row[label_key])
        setattr(self, slot, (now + _CACHE_SECONDS, names))
        return names

    def _interpret(self, response: httpx.Response) -> tuple[object, httpx.Headers]:
        if response.status_code == 404:
            raise KohaNotFound
        if response.status_code == 401:
            raise KohaAuthError
        if response.status_code >= 400:
            raise KohaResponseError
        content_type = response.headers.get("content-type", "")
        if "json" in content_type or "marc-in-json" in content_type:
            return response.json(), response.headers
        return response.content, response.headers
