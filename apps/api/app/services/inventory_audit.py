from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.identity import AuditLog
from app.models.inventory import InventoryAdjustment, InventoryScan, InventoryShelfSearch


def write_inventory_audit(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any] | None,
) -> None:
    clean: dict[str, Any] | None = None
    if details is not None:
        clean = {key: value for key, value in details.items() if key != "barcode"}
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            module="inventory",
            entity_type=entity_type,
            entity_id=entity_id,
            details=clean,
        ),
    )


def list_session_audit(
    db: Session,
    session_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None,
    action: str | None,
    page: int,
    per_page: int,
) -> dict[str, Any]:
    session_key = str(session_id)
    scan_ids = [
        str(row)
        for row in db.scalars(
            select(InventoryScan.id).where(InventoryScan.session_id == session_id),
        ).all()
    ]
    adjustment_ids = [
        str(row)
        for row in db.scalars(
            select(InventoryAdjustment.id).where(InventoryAdjustment.session_id == session_id),
        ).all()
    ]
    search_ids = [
        str(row)
        for row in db.scalars(
            select(InventoryShelfSearch.id).where(InventoryShelfSearch.session_id == session_id),
        ).all()
    ]
    scope: list = [(AuditLog.entity_type == "session") & (AuditLog.entity_id == session_key)]
    if scan_ids:
        scope.append((AuditLog.entity_type == "scan") & (AuditLog.entity_id.in_(scan_ids)))
    if adjustment_ids:
        scope.append(
            (AuditLog.entity_type == "adjustment") & (AuditLog.entity_id.in_(adjustment_ids)),
        )
    if search_ids:
        scope.append(
            (AuditLog.entity_type == "shelf_search") & (AuditLog.entity_id.in_(search_ids)),
        )

    stmt = select(AuditLog).where(AuditLog.module == "inventory", or_(*scope))
    if actor_id is not None:
        stmt = stmt.where(AuditLog.user_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    offset = (page - 1) * per_page
    rows = db.scalars(
        stmt.order_by(AuditLog.created_at.desc()).offset(offset).limit(per_page),
    ).all()
    return {
        "items": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
    }