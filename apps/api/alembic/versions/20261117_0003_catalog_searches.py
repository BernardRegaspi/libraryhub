"""Catalog permissions and saved searches.

Revision ID: 20261117_0003
Revises: 20261116_0002
Create Date: 2026-11-17
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261117_0003"
down_revision: Union[str, Sequence[str], None] = "20261116_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)

BARCODE_ROLES = (
    "Super Administrator",
    "Library Administrator",
    "Department Head",
    "Librarian",
)


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'catalog.barcode.view', 'catalog', 'See item barcodes'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'catalog.barcode.view'
            )
        """),
    )

    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM {SCHEMA}.roles r
            CROSS JOIN {SCHEMA}.permissions p
            WHERE r.name = 'Student' AND p.code = 'catalog.view'
            AND NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.role_permissions rp
                WHERE rp.role_id = r.id AND rp.permission_id = p.id
            )
        """),
    )

    for role_name in BARCODE_ROLES:
        bind.execute(
            sa.text(f"""
                INSERT INTO {SCHEMA}.role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM {SCHEMA}.roles r
                CROSS JOIN {SCHEMA}.permissions p
                WHERE r.name = :role_name AND p.code = 'catalog.barcode.view'
                AND NOT EXISTS (
                    SELECT 1 FROM {SCHEMA}.role_permissions rp
                    WHERE rp.role_id = r.id AND rp.permission_id = p.id
                )
            """),
            {"role_name": role_name},
        )

    op.create_table(
        "saved_searches",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("label", sa.String(80), nullable=True),
        sa.Column("query_text", sa.String(200), nullable=False),
        sa.Column("search_field", sa.String(64), nullable=False),
        sa.Column(
            "filters",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("sort_field", sa.String(64), nullable=False),
        sa.Column("sort_direction", sa.String(8), nullable=False),
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
        sa.CheckConstraint(
            "kind in ('recent', 'saved')",
            name="ck_saved_searches_kind",
        ),
        sa.CheckConstraint(
            "sort_direction in ('asc', 'desc')",
            name="ck_saved_searches_sort_direction",
        ),
        sa.CheckConstraint(
            "(kind = 'saved' and label is not null and char_length(label) between 1 and 80) "
            "or (kind = 'recent' and label is null)",
            name="ck_saved_searches_label",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_saved_searches_user_kind_updated",
        "saved_searches",
        ["user_id", "kind", "updated_at"],
        schema=SCHEMA,
    )
    op.create_index(
        "uq_saved_searches_identity",
        "saved_searches",
        [
            "user_id",
            "kind",
            "query_text",
            "search_field",
            "filters",
            "sort_field",
            "sort_direction",
        ],
        unique=True,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("uq_saved_searches_identity", table_name="saved_searches", schema=SCHEMA)
    op.drop_index("ix_saved_searches_user_kind_updated", table_name="saved_searches", schema=SCHEMA)
    op.drop_table("saved_searches", schema=SCHEMA)

    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'catalog.barcode.view'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'catalog.barcode.view'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.roles r, {SCHEMA}.permissions p
            WHERE rp.role_id = r.id AND rp.permission_id = p.id
              AND r.name = 'Student' AND p.code = 'catalog.view'
        """),
    )