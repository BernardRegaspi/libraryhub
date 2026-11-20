from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.circulation import CirculationRequest
from app.services.circulation_errors import CirculationError


def begin_request(
    db: Session,
    *,
    request_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    patron_id: int | None,
    timeout_seconds: float = 15.0,
) -> CirculationRequest:
    existing = load_request(db, request_id)
    if existing is not None:
        mark_stale_unknown(db, existing, timeout_seconds=timeout_seconds)
        db.flush()
        if existing.status == "completed":
            if _confirmation_required(existing):
                raise CirculationError(
                    409,
                    "circulation_confirmation",
                    _replay_message(existing),
                    request_id=str(request_id),
                    items=existing.result.get("items"),
                )
            return existing
        if existing.status == "unknown":
            raise CirculationError(
                409,
                "outcome_unknown",
                "The outcome is unknown. Verify before trying again.",
                request_id=str(request_id),
                items=existing.result.get("items"),
            )
        if user_id is None:
            raise CirculationError(
                409,
                "still_processing",
                "That transaction is still in progress.",
                request_id=str(request_id),
                items=existing.result.get("items"),
            )
        return existing
    row = CirculationRequest(
        id=request_id,
        user_id=user_id,
        action=action,
        status="in_progress",
        patron_id=patron_id,
        result={"items": []} if action == "checkout" else {},
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raced = load_request(db, request_id)
        if raced is None:
            raise
        return begin_request(
            db,
            request_id=request_id,
            user_id=user_id,
            action=action,
            patron_id=patron_id,
            timeout_seconds=timeout_seconds,
        )
    return row


def load_request(db: Session, request_id: uuid.UUID) -> CirculationRequest | None:
    return db.get(CirculationRequest, request_id)


def mark_stale_unknown(db: Session, row: CirculationRequest, *, timeout_seconds: float) -> None:
    if row.status != "in_progress":
        return
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=timeout_seconds + 30.0)
    updated = row.updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    if updated < cutoff:
        row.status = "unknown"
        db.flush()


def store_result(db: Session, row: CirculationRequest, *, status: str, result: dict) -> None:
    row.status = status
    row.result = result
    row.updated_at = datetime.now(timezone.utc)
    db.flush()


def touch_updated(row: CirculationRequest) -> None:
    row.updated_at = datetime.now(timezone.utc)


def replay_response(row: CirculationRequest) -> dict:
    base = {"request_id": str(row.id), "status": row.status}
    base.update(row.result)
    return base


def _confirmation_required(row: CirculationRequest) -> bool:
    items = row.result.get("items")
    if isinstance(items, list):
        return any(item.get("outcome") == "confirmation_required" for item in items if isinstance(item, dict))
    return row.result.get("outcome") == "confirmation_required"


def _replay_message(row: CirculationRequest) -> str:
    if _confirmation_required(row):
        return row.result.get("message") or "Koha requires confirmation."
    return "That transaction is still in progress."