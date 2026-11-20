import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.circulation import CirculationRequest
from app.models.identity import AppUser
from app.services.circulation_errors import CirculationError
from app.services.circulation_requests import (
    begin_request,
    load_request,
    mark_stale_unknown,
    replay_response,
    store_result,
)


def test_begin_request_inserts_once_and_replay_completed(db):
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
    first = begin_request(
        db,
        request_id=request_id,
        user_id=admin_id,
        action="checkout",
        patron_id=9,
    )
    db.commit()
    with pytest.raises(CirculationError) as exc:
        begin_request(
            db,
            request_id=request_id,
            user_id=admin_id,
            action="checkout",
            patron_id=9,
        )
    assert exc.value.code == "still_processing"
    assert exc.value.status_code == 409
    store_result(
        db,
        first,
        status="completed",
        result={
            "items": [
                {
                    "item_id": 1,
                    "outcome": "confirmed",
                    "checkout_id": 3,
                    "due_date": "2026-12-01",
                },
            ],
        },
    )
    db.commit()
    replay_row = begin_request(
        db,
        request_id=request_id,
        user_id=admin_id,
        action="checkout",
        patron_id=9,
    )
    assert replay_row.status == "completed"
    payload = replay_response(replay_row)
    assert payload["request_id"] == str(request_id)
    assert payload["items"][0]["outcome"] == "confirmed"
    assert "barcode" not in payload["items"][0]
    assert "patron_name" not in payload


def test_in_progress_raises_still_processing(db):
    request_id = uuid.uuid4()
    begin_request(db, request_id=request_id, user_id=None, action="checkin", patron_id=None)
    db.commit()
    with pytest.raises(CirculationError) as exc:
        begin_request(db, request_id=request_id, user_id=None, action="checkin", patron_id=None)
    assert exc.value.code == "still_processing"
    assert exc.value.status_code == 409


def test_stale_in_progress_becomes_unknown(db):
    request_id = uuid.uuid4()
    row = begin_request(
        db,
        request_id=request_id,
        user_id=None,
        action="renew",
        patron_id=5,
    )
    row.updated_at = datetime.now(timezone.utc) - timedelta(seconds=120)
    db.flush()
    mark_stale_unknown(db, row, timeout_seconds=15.0)
    assert row.status == "unknown"