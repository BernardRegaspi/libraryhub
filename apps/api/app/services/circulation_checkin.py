from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.integrations.koha.circulation import get_circulation_capabilities
from app.integrations.koha.exceptions import KohaError, KohaTimeoutError
from app.models.identity import AuditLog
from app.services.circulation_errors import CirculationError, unsupported_write
from app.services.circulation_requests import begin_request, replay_response, store_result


class CirculationConfirmation(Exception):
    pass


def submit_checkin(
    db: Session,
    client,
    user_id: uuid.UUID | None,
    *,
    request_id: uuid.UUID,
    item_id: int,
    confirm: bool,
) -> dict:
    if item_id < 1:
        raise CirculationError(422, "validation_error", "That request is not valid.")
    caps = get_circulation_capabilities()
    if caps.checkin is None:
        raise unsupported_write()
    try:
        client.get_item(item_id)
    except KohaError:
        raise CirculationError(404, "not_found", "That item was not found.") from None
    row = begin_request(
        db,
        request_id=request_id,
        user_id=user_id,
        action="checkin",
        patron_id=None,
    )
    if row.status == "completed":
        return replay_response(row)
    db.commit()
    send_confirm = bool(caps.checkin_confirmation and confirm)
    try:
        answer = client.post_checkin(item_id, confirm=send_confirm)
    except CirculationConfirmation as exc:
        if caps.checkin_confirmation and not confirm:
            store_result(
                db,
                row,
                status="completed",
                result={"outcome": "confirmation_required", "item_id": item_id, "message": str(exc)},
            )
            _audit(db, user_id, request_id, item_id, "confirmation_required")
            db.commit()
            raise CirculationError(
                409,
                "circulation_confirmation",
                str(exc),
                request_id=str(request_id),
            ) from exc
        store_result(
            db,
            row,
            status="completed",
            result={"outcome": "refused", "item_id": item_id, "message": "Koha refused this transaction."},
        )
        _audit(db, user_id, request_id, item_id, "refused")
        db.commit()
        raise CirculationError(409, "circulation_refused", "Koha refused this transaction.") from exc
    except KohaTimeoutError as exc:
        store_result(
            db,
            row,
            status="unknown",
            result={
                "outcome": "unknown",
                "item_id": item_id,
                "message": "The outcome is unknown. Verify before trying again.",
            },
        )
        _audit(db, user_id, request_id, item_id, "unknown")
        db.commit()
        raise CirculationError(
            504,
            "circulation_timeout",
            "The outcome is unknown. Verify before trying again.",
            request_id=str(request_id),
        ) from exc
    except KohaError as exc:
        store_result(
            db,
            row,
            status="completed",
            result={"outcome": "refused", "item_id": item_id, "message": "Koha refused this transaction."},
        )
        _audit(db, user_id, request_id, item_id, "refused")
        db.commit()
        raise CirculationError(409, "circulation_refused", "Koha refused this transaction.") from exc
    patron = answer.get("patron") if isinstance(answer, dict) else None
    result = {
        "item_id": item_id,
        "title": answer.get("title") if isinstance(answer, dict) else None,
        "author": answer.get("author") if isinstance(answer, dict) else None,
        "previous_due_date": answer.get("previous_due_date") if isinstance(answer, dict) else None,
        "returned_date": answer.get("returned_date") if isinstance(answer, dict) else None,
        "charge_text": answer.get("charge_text") if isinstance(answer, dict) else None,
        "patron": patron if isinstance(patron, dict) else None,
        "outcome": "confirmed",
    }
    if isinstance(answer, dict) and answer.get("patron_id") is not None:
        row.patron_id = answer.get("patron_id")
    store_result(db, row, status="completed", result=result)
    _audit(db, user_id, request_id, item_id, "confirmed")
    db.commit()
    return replay_response(row)


def _audit(db: Session, user_id, request_id, item_id: int, outcome: str) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.checkin",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={"request_id": str(request_id), "item_id": item_id, "outcome": outcome},
        )
    )