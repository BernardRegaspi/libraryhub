import uuid

import pytest

from app.integrations.koha.circulation import CirculationCapabilities, WriteCapability
from app.services.circulation_checkin import CirculationConfirmation, submit_checkin
from app.services.circulation_errors import CirculationError


class CheckinClient:
    def __init__(self, need_confirm: bool) -> None:
        self.need_confirm = need_confirm
        self.confirm_sent = False

    def get_item(self, item_id: int) -> dict:
        return {
            "item_id": item_id,
            "biblio_id": 1,
            "external_id": "X1",
            "home_library_id": "CPL",
            "holding_library_id": "CPL",
            "itype": "BK",
        }

    def post_checkin(self, item_id: int, *, confirm: bool) -> dict:
        self.confirm_sent = confirm
        if self.need_confirm and not confirm:
            raise CirculationConfirmation("Please confirm")
        return {"item_id": item_id, "title": "Title"}


def test_checkin_confirmation_only_when_capability_set(monkeypatch, db):
    caps_off = CirculationCapabilities(
        checkin=WriteCapability("POST", "/checkins"),
        checkin_confirmation=False,
    )
    monkeypatch.setattr("app.services.circulation_checkin.get_circulation_capabilities", lambda: caps_off)
    client = CheckinClient(need_confirm=True)
    with pytest.raises(CirculationError):
        submit_checkin(db, client, None, request_id=uuid.uuid4(), item_id=9, confirm=False)
    assert client.confirm_sent is False
    caps_on = CirculationCapabilities(
        checkin=WriteCapability("POST", "/checkins"),
        checkin_confirmation=True,
    )
    monkeypatch.setattr("app.services.circulation_checkin.get_circulation_capabilities", lambda: caps_on)
    client2 = CheckinClient(need_confirm=True)
    result = submit_checkin(db, client2, None, request_id=uuid.uuid4(), item_id=9, confirm=True)
    assert client2.confirm_sent is True
    assert result["item_id"] == 9