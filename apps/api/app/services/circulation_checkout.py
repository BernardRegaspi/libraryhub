from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.integrations.koha.circulation import get_circulation_capabilities
from app.integrations.koha.exceptions import KohaError, KohaTimeoutError
from app.models.identity import AuditLog
from app.services.circulation_errors import CirculationError, unsupported_write
from app.services.circulation_requests import (
    begin_request,
    replay_response,
    store_result,
    touch_updated,
)


def submit_checkout(
    db: Session,
    client,
    user_id: uuid.UUID | None,
    *,
    request_id: uuid.UUID,
    patron_id: int,
    item_ids: list[int],
) -> dict:
    if not item_ids or len(item_ids) > 20 or len(set(item_ids)) != len(item_ids):
        raise CirculationError(422, "validation_error", "That request is not valid.")
    if any(item_id < 1 for item_id in item_ids):
        raise CirculationError(422, "validation_error", "That request is not valid.")
    caps = get_circulation_capabilities()
    if caps.checkout is None:
        raise unsupported_write()
    try:
        client.get_patron(patron_id)
    except KohaError:
        raise CirculationError(404, "not_found", "That patron was not found.") from None
    row = begin_request(
        db,
        request_id=request_id,
        user_id=user_id,
        action="checkout",
        patron_id=patron_id,
    )
    if row.status == "completed":
        return replay_response(row)
    db.commit()
    outcomes: list[dict] = []
    request_unknown = False
    for item_id in item_ids:
        touch_updated(row)
        db.flush()
        try:
            answer = client.post_checkout(patron_id, item_id)
            outcomes.append(
                {
                    "item_id": item_id,
                    "outcome": "confirmed",
                    "checkout_id": answer.get("checkout_id"),
                    "due_date": answer.get("due_date"),
                },
            )
        except KohaTimeoutError:
            outcomes.append({"item_id": item_id, "outcome": "unknown"})
            request_unknown = True
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
        except KohaError as exc:
            outcomes.append(
                {
                    "item_id": item_id,
                    "outcome": "refused",
                    "message": _refusal_message(exc),
                },
            )
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
        except RuntimeError:
            outcomes.append({"item_id": item_id, "outcome": "refused", "message": "Koha refused this transaction."})
            outcomes.extend({"item_id": late, "outcome": "unsent"} for late in item_ids[len(outcomes) :])
            break
    status = "unknown" if request_unknown else "completed"
    result = {"items": outcomes}
    store_result(db, row, status=status, result=result)
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.checkout",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={
                "request_id": str(request_id),
                "patron_id": patron_id,
                "items": [{"item_id": line["item_id"], "outcome": line["outcome"]} for line in outcomes if line["outcome"] != "unsent"],
            },
        ),
    )
    db.commit()
    return replay_response(row)


def _refusal_message(exc: KohaError) -> str:
    text = getattr(exc, "koha_message", None)
    if (
        isinstance(text, str)
        and text
        and len(text) < 200
        and "\n" not in text
        and "<" not in text
    ):
        return text
    return "Koha refused this transaction."