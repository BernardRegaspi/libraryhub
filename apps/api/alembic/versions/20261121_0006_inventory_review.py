"""Inventory review decisions and in_review session status.

Revision ID: 20261121_0006
Revises: 20261121_0005
Create Date: 2026-11-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261121_0006"
down_revision: Union[str, Sequence[str], None] = "20261121_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.drop_constraint(
        "ck_inventory_sessions_status",
        "inventory_sessions",
        schema=SCHEMA,
        type_="check",
    )
    op.create_check_constraint(
        "ck_inventory_sessions_status",
        "inventory_sessions",
        "status in ('draft', 'in_progress', 'in_review', 'cancelled')",
        schema=SCHEMA,
    )

    op.create_table(
        "inventory_review_decisions",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("scan_id", UUID, nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("decision", sa.String(32), nullable=True),
        sa.Column("decided_by", UUID, nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(decision is null and decided_by is null and decided_at is null) "
            "or (decision in ('approved', 'no_action') "
            "and decided_by is not null and decided_at is not null)",
            name="ck_inventory_review_decisions_decision",
        ),
        sa.CheckConstraint(
            "char_length(action) between 1 and 80",
            name="ck_inventory_review_decisions_action",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"],
            [f"{SCHEMA}.inventory_scans.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("scan_id", name="uq_inventory_review_decisions_scan_id"),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("inventory_review_decisions", schema=SCHEMA)

    op.drop_constraint(
        "ck_inventory_sessions_status",
        "inventory_sessions",
        schema=SCHEMA,
        type_="check",
    )
    op.create_check_constraint(
        "ck_inventory_sessions_status",
        "inventory_sessions",
        "status in ('draft', 'in_progress', 'cancelled')",
        schema=SCHEMA,
    )