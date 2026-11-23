from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy.orm import Session

from app.integrations.koha.exceptions import KohaConnectionError, KohaRequestError, KohaTimeoutError
from app.integrations.koha.inventory import InventoryCapabilities
from app.models.inventory import InventoryAdjustment, InventorySession
from app.services.inventory_audit import write_inventory_audit
from app.services.inventory_errors import (
    field_not_allowed,
    invalid_state,
    not_approver,
    not_submittable,
    unsupported,
)

_MAX_REASON = 2000
_HTML_TAG = re.compile(r"<[^>]+>")


def draft_adjustment(
    db: Session,
    caps: InventoryCapabilities,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    koha_item_id: int,
    field: str,
    to_value: str,
    reason: str,
    from_value: str | None = None,
    expected_item_id: uuid.UUID | None = None,
    scan_id: uuid.UUID | None = None,
) -> InventoryAdjustment:
    _validate_reason(reason)
    if field not in caps.update_fields:
        raise field_not_allowed()
    session = _load_adjustable_session(db, session_id)
    row = InventoryAdjustment(
        session_id=session.id,
        koha_item_id=koha_item_id,
        expected_item_id=expected_item_id,
        scan_id=scan_id,
        field=field,
        from_value=from_value,
        to_value=to_value,
        reason=reason.strip(),
        status="draft",
        drafted_by=user_id,
    )
    db.add(row)
    db.flush()
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.adjustment_draft",
        entity_type="adjustment",
        entity_id=str(row.id),
        details={
            "adjustment_id": str(row.id),
            "field": field,
            "before": from_value,
            "after": to_value,
        },
    )
    db.commit()
    db.refresh(row)
    return row


def update_draft_adjustment(
    db: Session,
    caps: InventoryCapabilities,
    *,
    adjustment_id: uuid.UUID,
    user_id: uuid.UUID,
    field: str,
    to_value: str,
    reason: str,
    from_value: str | None = None,
) -> InventoryAdjustment:
    _validate_reason(reason)
    if field not in caps.update_fields:
        raise field_not_allowed()
    row = db.get(InventoryAdjustment, adjustment_id)
    if row is None or row.status != "draft":
        raise not_submittable()
    row.field = field
    row.from_value = from_value
    row.to_value = to_value
    row.reason = reason.strip()
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.adjustment_draft",
        entity_type="adjustment",
        entity_id=str(row.id),
        details={
            "adjustment_id": str(row.id),
            "field": field,
            "before": from_value,
            "after": to_value,
        },
    )
    db.commit()
    db.refresh(row)
    return row


def decide_adjustment(
    db: Session,
    *,
    adjustment_id: uuid.UUID,
    decision: Literal["approved", "rejected"],
    user_id: uuid.UUID,
    reason: str,
) -> InventoryAdjustment:
    row = db.get(InventoryAdjustment, adjustment_id)
    if row is None or row.status != "draft":
        raise not_submittable()
    if row.drafted_by is not None and user_id == row.drafted_by:
        raise not_approver()
    now = datetime.now(UTC)
    row.decided_by = user_id
    row.decided_at = now
    if decision == "approved":
        row.status = "approved"
    else:
        row.status = "rejected"
    audit_details: dict[str, object] = {
        "adjustment_id": str(row.id),
        "decision": decision,
        "decider": str(user_id),
    }
    if decision == "rejected" and reason.strip():
        audit_details["reason"] = reason.strip()
    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.adjustment_decide",
        entity_type="adjustment",
        entity_id=str(row.id),
        details=audit_details,
    )
    db.commit()
    db.refresh(row)
    return row


def submit_adjustment(
    db: Session,
    client,
    caps: InventoryCapabilities,
    adjustment_id: uuid.UUID,
    user_id: uuid.UUID,
) -> InventoryAdjustment:
    row = db.get(InventoryAdjustment, adjustment_id)
    if row is None or row.status not in ("approved", "failed"):
        raise not_submittable()
    if caps.item_update is None:
        raise unsupported()

    path = caps.item_update.path.replace("{item_id}", str(row.koha_item_id))
    body = {row.field: row.to_value}
    method = caps.item_update.method.upper()
    try:
        if method == "PUT":
            client.put_json(path, body)
        elif method == "POST":
            client.post_json(path, body)
        else:
            raise unsupported()
        row.status = "submitted"
        row.koha_http_status = 200
        row.koha_error = None
        row.submitted_at = datetime.now(UTC)
        http_status: int | None = 200
    except KohaRequestError as exc:
        row.status = "failed"
        row.koha_http_status = exc.status_code
        row.koha_error = _sanitize_koha_message(exc.koha_message)
        http_status = exc.status_code
    except (KohaTimeoutError, KohaConnectionError):
        row.status = "failed"
        row.koha_http_status = None
        row.koha_error = None
        http_status = None

    write_inventory_audit(
        db,
        user_id=user_id,
        action="inventory.adjustment_submit",
        entity_type="adjustment",
        entity_id=str(row.id),
        details={
            "adjustment_id": str(row.id),
            "status": row.status,
            "koha_http_status": http_status,
        },
    )
    db.commit()
    db.refresh(row)
    return row


def _validate_reason(reason: str) -> None:
    clean = reason.strip()
    if not clean or len(clean) > _MAX_REASON:
        raise invalid_state()


def _load_adjustable_session(db: Session, session_id: uuid.UUID) -> InventorySession:
    session = db.get(InventorySession, session_id)
    if session is None or session.status not in ("in_progress", "completed"):
        raise invalid_state()
    return session


def _sanitize_koha_message(message: str | None) -> str | None:
    if not isinstance(message, str) or not message:
        return None
    text = _HTML_TAG.sub("", message).strip()
    if not text:
        return None
    if len(text) > 500:
        return text[:500]
    return text