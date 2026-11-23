from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.identity import AuditLog


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