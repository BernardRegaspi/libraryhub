"""Circulation permissions and circulation_requests.

Revision ID: 20261120_0005
Revises: 20261120_0004
Create Date: 2026-11-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261120_0005"
down_revision: Union[str, Sequence[str], None] = "20261120_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)

WRITE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)

def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "circulation_requests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("patron_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.CheckConstraint(
            "action in ('checkout', 'checkin', 'renew')",
            name="ck_circulation_requests_action",
        ),
        sa.CheckConstraint(
            "status in ('in_progress', 'completed', 'unknown')",
            name="ck_circulation_requests_status",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )

    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'circulation.checkout', 'circulation',
                'Submit a Koha checkout'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'circulation.checkout'
            )
        """),
    )
    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'circulation.checkin', 'circulation',
                'Submit a Koha check-in'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'circulation.checkin'
            )
        """),
    )
    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'circulation.renew', 'circulation',
                'Submit a Koha renewal'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'circulation.renew'
            )
        """),
    )

    for role_name in WRITE_ROLES:
        for code in (
            "circulation.checkout",
            "circulation.checkin",
            "circulation.renew",
        ):
            bind.execute(
                sa.text(f"""
                    INSERT INTO {SCHEMA}.role_permissions (role_id, permission_id)
                    SELECT r.id, p.id
                    FROM {SCHEMA}.roles r
                    CROSS JOIN {SCHEMA}.permissions p
                    WHERE r.name = :role_name AND p.code = '{code}'
                    AND NOT EXISTS (
                        SELECT 1 FROM {SCHEMA}.role_permissions rp
                        WHERE rp.role_id = r.id AND rp.permission_id = p.id
                    )
                """),
                {"role_name": role_name},
            )


def downgrade() -> None:
    op.drop_table("circulation_requests", schema=SCHEMA)

    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'circulation.checkout'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'circulation.checkin'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'circulation.renew'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'circulation.checkout'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'circulation.checkin'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'circulation.renew'
        """),
    )