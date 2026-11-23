import uuid

from app.integrations.koha.circulation import CirculationCapabilities, WriteCapability
from app.models.identity import AppUser
from app.services.circulation_checkout import submit_checkout


class CheckoutClient:
    def __init__(self) -> None:
        self.calls: list[int] = []
        self._patron = {"patron_id": 5, "surname": "A", "firstname": "B", "library_id": "CPL", "category_id": "ST"}

    def get_patron(self, patron_id: int) -> dict:
        return self._patron

    def get_patron_balance(self, patron_id: int):
        return 0

    def post_checkout(self, patron_id: int, item_id: int) -> dict:
        self.calls.append(item_id)
        if item_id == 2:
            raise RuntimeError("refused")
        return {"checkout_id": item_id + 10, "due_date": "2026-12-04"}


def test_checkout_stops_on_refusal_and_replays(monkeypatch, db):
    caps = CirculationCapabilities(
        checkout=WriteCapability("POST", "/checkouts"),
        loans_scope="patron",
    )
    monkeypatch.setattr("app.services.circulation_checkout.get_circulation_capabilities", lambda: caps)
    client = CheckoutClient()
    request_id = uuid.uuid4()
    admin_id = uuid.uuid4()
    db.add(
        AppUser(
            id=admin_id,
            username=f"admin-{admin_id.hex[:12]}",
            display_name="Admin",
            email=f"{admin_id}@example.test",
            status="active",
        )
    )
    db.flush()
    result = submit_checkout(
        db,
        client,
        admin_id,
        request_id=request_id,
        patron_id=5,
        item_ids=[1, 2, 3],
    )
    assert client.calls == [1, 2]
    assert result["items"][0]["outcome"] == "confirmed"
    assert result["items"][1]["outcome"] == "refused"
    assert result["items"][2]["outcome"] == "unsent"
    again = submit_checkout(
        db,
        client,
        admin_id,
        request_id=request_id,
        patron_id=5,
        item_ids=[1, 2, 3],
    )
    assert again == result
    assert len(client.calls) == 2