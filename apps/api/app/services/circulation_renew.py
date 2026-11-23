from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.integrations.koha.circulation import get_circulation_capabilities
from app.integrations.koha.exceptions import KohaConnectionError, KohaError, KohaTimeoutError
from app.models.circulation import CirculationRequest
from app.models.identity import AuditLog
from app.services.circulation_errors import CirculationError, unsupported_write
from app.services.circulation_lookup import validate_scan_value
from app.services.circulation_requests import begin_request, replay_response, store_result

_LOAN_FIELDS = (
    "checkout_id",
    "item_id",
    "patron_id",
    "patron_name",
    "cardnumber",
    "title",
    "author",
    "call_number",
    "item_type_id",
    "item_type_label",
    "library_id",
    "library_name",
    "checkout_date",
    "due_date",
    "renewals_count",
    "external_id",
)


def renewal_preview(client, *, barcode: str | None = None, checkout_id: int | None = None) -> dict:
    caps = get_circulation_capabilities()
    if checkout_id is not None:
        if caps.single_loan is None:
            raise CirculationError(404, "not_found", "That loan was not found.")
        try:
            checkout = client.get_checkout(checkout_id)
        except KohaError:
            raise CirculationError(404, "not_found", "That loan was not found.") from None
    elif barcode is not None:
        trimmed = validate_scan_value(barcode)
        rows = client.search_items(
            {"q": json.dumps({"external_id": trimmed}), "_per_page": 5},
        )
        if not rows:
            raise CirculationError(404, "not_found", "No current loan matches that barcode.")
        item = rows[0]
        item_id = item.get("item_id")
        patron_id = item.get("patron_id")
        checkout = None
        if patron_id is not None and item_id is not None:
            for loan in client.list_checkouts(int(patron_id)):
                if loan.get("item_id") == item_id:
                    checkout = loan
                    break
        if checkout is None:
            raise CirculationError(404, "not_found", "No current loan matches that barcode.")
    else:
        raise CirculationError(422, "validation_error", "That request is not valid.")

    cid = int(checkout["checkout_id"])
    payload = _loan_fields(checkout)
    payload["renewal"] = _renewal_block(client, caps, cid)
    return payload


def submit_renewal(
    db: Session,
    client,
    user_id: uuid.UUID | None,
    *,
    request_id: uuid.UUID,
    checkout_id: int,
) -> dict:
    if checkout_id < 1:
        raise CirculationError(422, "validation_error", "That request is not valid.")
    caps = get_circulation_capabilities()
    if caps.renew is None:
        raise unsupported_write()
    try:
        loan = client.get_checkout(checkout_id)
    except KohaError:
        raise CirculationError(404, "not_found", "That loan was not found.") from None

    previous_due_date = loan.get("due_date")
    patron_id = loan.get("patron_id")
    row = begin_request(
        db,
        request_id=request_id,
        user_id=user_id,
        action="renew",
        patron_id=int(patron_id) if patron_id is not None else None,
    )
    if row.status == "completed":
        return replay_response(row)

    row.result = {"checkout_id": checkout_id, "previous_due_date": previous_due_date}
    db.commit()

    try:
        answer = client.post_renew(checkout_id)
    except (KohaTimeoutError, KohaConnectionError) as exc:
        store_result(
            db,
            row,
            status="unknown",
            result={
                "checkout_id": checkout_id,
                "previous_due_date": previous_due_date,
                "outcome": "unknown",
                "message": "The outcome is unknown. Verify before trying again.",
            },
        )
        _audit_renew(db, user_id, request_id, checkout_id, "unknown")
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
            result={
                "checkout_id": checkout_id,
                "previous_due_date": previous_due_date,
                "outcome": "refused",
                "message": "Koha refused this transaction.",
            },
        )
        _audit_renew(db, user_id, request_id, checkout_id, "refused")
        db.commit()
        raise CirculationError(409, "circulation_refused", "Koha refused this transaction.") from exc

    due_date = answer.get("due_date") if isinstance(answer, dict) else None
    store_result(
        db,
        row,
        status="completed",
        result={
            "checkout_id": checkout_id,
            "previous_due_date": previous_due_date,
            "due_date": due_date,
            "outcome": "confirmed",
        },
    )
    _audit_renew(db, user_id, request_id, checkout_id, "confirmed")
    db.commit()
    return replay_response(row)


def verify_request(db: Session, client, row: CirculationRequest) -> dict:
    try:
        if row.action == "renew":
            payload = _verify_renew(db, client, row)
        elif row.action == "checkout":
            payload = _verify_checkout(db, client, row)
        elif row.action == "checkin":
            payload = _verify_checkin(db, client, row)
        else:
            raise CirculationError(422, "validation_error", "That request is not valid.")
    except KohaTimeoutError as exc:
        raise CirculationError(
            504,
            "circulation_timeout",
            "The outcome is unknown. Verify before trying again.",
            request_id=str(row.id),
        ) from exc
    except KohaError as exc:
        raise CirculationError(
            503,
            "circulation_unavailable",
            "Circulation is unavailable. Try again.",
            request_id=str(row.id),
        ) from exc
    db.commit()
    return payload


def _verify_renew(db: Session, client, row: CirculationRequest) -> dict:
    result = dict(row.result)
    checkout_id = int(result["checkout_id"])
    previous_due_date = result.get("previous_due_date")
    prior_outcome = result.get("outcome")
    checkout = client.get_checkout(checkout_id)
    due_date = checkout.get("due_date")
    if due_date != previous_due_date:
        result.update({"outcome": "confirmed", "due_date": due_date})
    else:
        result.update({"outcome": "not_applied"})
    store_result(db, row, status="completed", result=result)
    if prior_outcome == "unknown" and result.get("outcome") != "unknown":
        _audit_verify_renew(db, row.user_id, row.id, checkout_id, str(result["outcome"]))
    return replay_response(row)


def _verify_checkout(db: Session, client, row: CirculationRequest) -> dict:
    if row.patron_id is None:
        raise CirculationError(422, "validation_error", "That request is not valid.")
    loans = client.list_checkouts(row.patron_id)
    by_item = {loan.get("item_id"): loan for loan in loans if loan.get("item_id") is not None}
    items = row.result.get("items")
    if not isinstance(items, list):
        items = []
    changed: list[dict] = []
    new_items: list[dict] = []
    for line in items:
        if not isinstance(line, dict):
            new_items.append(line)
            continue
        item = dict(line)
        if item.get("outcome") != "unknown":
            new_items.append(item)
            continue
        item_id = item.get("item_id")
        loan = by_item.get(item_id)
        if loan is not None:
            item["outcome"] = "confirmed"
            item["checkout_id"] = loan.get("checkout_id")
            item["due_date"] = loan.get("due_date")
            changed.append({"item_id": item_id, "outcome": "confirmed"})
        else:
            item["outcome"] = "not_applied"
            changed.append({"item_id": item_id, "outcome": "not_applied"})
        new_items.append(item)
    result = dict(row.result)
    result["items"] = new_items
    store_result(db, row, status="completed", result=result)
    if changed:
        _audit_verify_checkout(db, row.user_id, row.id, row.patron_id, changed)
    return replay_response(row)


def _verify_checkin(db: Session, client, row: CirculationRequest) -> dict:
    if row.patron_id is None:
        raise unsupported_write()
    result = dict(row.result)
    item_id = result.get("item_id")
    prior_outcome = result.get("outcome")
    loans = client.list_checkouts(row.patron_id)
    still_out = any(loan.get("item_id") == item_id for loan in loans)
    if still_out:
        result["outcome"] = "not_applied"
    else:
        result["outcome"] = "confirmed"
    store_result(db, row, status="completed", result=result)
    if prior_outcome == "unknown" and result.get("outcome") != "unknown":
        _audit_verify_checkin(db, row.user_id, row.id, int(item_id), str(result["outcome"]))
    return replay_response(row)


def _renewal_block(client, caps, checkout_id: int) -> dict:
    if caps.renewal_preview is None:
        return {"status": "unrecorded"}
    answer = client.allows_renewal(checkout_id)
    if isinstance(answer, dict):
        allowed = bool(answer.get("allowed"))
        message = answer.get("message")
        if message is not None:
            message = str(message)
    else:
        allowed = bool(answer)
        message = None
    return {"status": "known", "allowed": allowed, "message": message}


def _loan_fields(row: dict) -> dict:
    return {key: row.get(key) for key in _LOAN_FIELDS if key in row}


def _audit_renew(db: Session, user_id, request_id: uuid.UUID, checkout_id: int, outcome: str) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.renew",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={"request_id": str(request_id), "checkout_id": checkout_id, "outcome": outcome},
        )
    )


def _audit_verify_renew(db: Session, user_id, request_id: uuid.UUID, checkout_id: int, outcome: str) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.verify",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={"request_id": str(request_id), "checkout_id": checkout_id, "outcome": outcome},
        )
    )


def _audit_verify_checkout(
    db: Session,
    user_id,
    request_id: uuid.UUID,
    patron_id: int,
    items: list[dict],
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.verify",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={
                "request_id": str(request_id),
                "patron_id": patron_id,
                "items": items,
            },
        )
    )


def _audit_verify_checkin(db: Session, user_id, request_id: uuid.UUID, item_id: int, outcome: str) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action="circulation.verify",
            module="circulation",
            entity_type="request",
            entity_id=str(request_id),
            details={"request_id": str(request_id), "item_id": item_id, "outcome": outcome},
        )
    )