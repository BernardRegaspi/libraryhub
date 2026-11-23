import uuid

import pytest

from app.integrations.koha.circulation import CirculationCapabilities, WriteCapability
from app.integrations.koha.exceptions import KohaTimeoutError
from app.models.circulation import CirculationRequest
from app.services.circulation_errors import CirculationError
from app.services.circulation_renew import renewal_preview, submit_renewal, verify_request


def test_preview_unrecorded_when_capability_unset(monkeypatch):
    monkeypatch.setattr(
        "app.services.circulation_renew.get_circulation_capabilities",
        lambda: CirculationCapabilities(loans_scope="patron"),
    )

    class Client:
        def list_checkouts(self, patron_id: int):
            return [{"checkout_id": 1, "item_id": 2, "due_date": "2026-12-01", "patron_id": patron_id}]

        def search_items(self, params: dict):
            return [{"item_id": 2, "biblio_id": 1, "patron_id": 3}]

    payload = renewal_preview(Client(), barcode="B1")
    assert payload["renewal"] == {"status": "unrecorded"}


class RenewClient:
    def __init__(self, *, timeout: bool = False) -> None:
        self.timeout = timeout
        self.post_calls = 0
        self._due = "2026-12-15"

    def get_checkout(self, checkout_id: int) -> dict:
        return {
            "checkout_id": checkout_id,
            "item_id": 2,
            "patron_id": 5,
            "due_date": "2026-12-01",
        }

    def post_renew(self, checkout_id: int) -> dict:
        self.post_calls += 1
        if self.timeout:
            raise KohaTimeoutError()
        return {"checkout_id": checkout_id, "due_date": self._due}


def test_submit_success_replay_skips_second_post(monkeypatch, db):
    caps = CirculationCapabilities(
        renew=WriteCapability("POST", "/renewals"),
        loans_scope="patron",
        single_loan=WriteCapability("GET", "/checkouts/{id}"),
    )
    monkeypatch.setattr("app.services.circulation_renew.get_circulation_capabilities", lambda: caps)
    client = RenewClient()
    request_id = uuid.uuid4()
    first = submit_renewal(db, client, None, request_id=request_id, checkout_id=1)
    assert client.post_calls == 1
    assert first["previous_due_date"] == "2026-12-01"
    assert first["due_date"] == "2026-12-15"
    second = submit_renewal(db, client, None, request_id=request_id, checkout_id=1)
    assert second == first
    assert client.post_calls == 1


def test_submit_timeout_stores_unknown_and_raises_504(monkeypatch, db):
    caps = CirculationCapabilities(
        renew=WriteCapability("POST", "/renewals"),
        loans_scope="patron",
        single_loan=WriteCapability("GET", "/checkouts/{id}"),
    )
    monkeypatch.setattr("app.services.circulation_renew.get_circulation_capabilities", lambda: caps)
    client = RenewClient(timeout=True)
    request_id = uuid.uuid4()
    with pytest.raises(CirculationError) as exc:
        submit_renewal(db, client, None, request_id=request_id, checkout_id=1)
    assert exc.value.status_code == 504
    assert exc.value.code == "circulation_timeout"
    row = db.get(CirculationRequest, request_id)
    assert row is not None
    assert row.status == "unknown"
    assert row.result["outcome"] == "unknown"


class VerifyRenewClient:
    def __init__(self, due_date: str) -> None:
        self.due_date = due_date

    def get_checkout(self, checkout_id: int) -> dict:
        return {"checkout_id": checkout_id, "due_date": self.due_date}


def test_verify_renew_confirmed_when_due_date_changes(db):
    request_id = uuid.uuid4()
    row = CirculationRequest(
        id=request_id,
        user_id=None,
        action="renew",
        status="unknown",
        patron_id=5,
        result={"checkout_id": 1, "previous_due_date": "2026-12-01", "outcome": "unknown"},
    )
    db.add(row)
    db.flush()
    result = verify_request(db, VerifyRenewClient("2026-12-20"), row)
    assert result["outcome"] == "confirmed"
    assert result["due_date"] == "2026-12-20"


def test_verify_renew_not_applied_when_due_date_unchanged(db):
    request_id = uuid.uuid4()
    row = CirculationRequest(
        id=request_id,
        user_id=None,
        action="renew",
        status="unknown",
        patron_id=5,
        result={"checkout_id": 1, "previous_due_date": "2026-12-01", "outcome": "unknown"},
    )
    db.add(row)
    db.flush()
    result = verify_request(db, VerifyRenewClient("2026-12-01"), row)
    assert result["outcome"] == "not_applied"


def test_verify_checkin_without_patron_raises_unsupported(db):
    request_id = uuid.uuid4()
    row = CirculationRequest(
        id=request_id,
        user_id=None,
        action="checkin",
        status="unknown",
        patron_id=None,
        result={"item_id": 9, "outcome": "unknown"},
    )
    db.add(row)
    db.flush()
    with pytest.raises(CirculationError) as exc:
        verify_request(db, RenewClient(), row)
    assert exc.value.status_code == 501
    assert exc.value.code == "circulation_unsupported"
    db.refresh(row)
    assert row.status == "unknown"