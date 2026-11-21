"""Inventory sessions and scans.

Revision ID: 20261121_0005
Revises: 20261120_0004
Create Date: 2026-11-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261121_0005"
down_revision: Union[str, Sequence[str], None] = "20261120_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)

def upgrade() -> None:
    op.execute(sa.text(f"CREATE SEQUENCE {SCHEMA}.inventory_session_ref_seq"))

    op.create_table(
        "inventory_sessions",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("reference", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("department_id", UUID, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("home_library_id", sa.String(64), nullable=False),
        sa.Column("home_library_name", sa.String(255), nullable=True),
        sa.Column("location", sa.String(80), nullable=True),
        sa.Column("expected_count", sa.Integer(), nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("started_by", UUID, nullable=True),
        sa.Column("cancelled_by", UUID, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
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
            "status in ('draft', 'in_progress', 'cancelled')",
            name="ck_inventory_sessions_status",
        ),
        sa.CheckConstraint(
            "expected_count >= 0",
            name="ck_inventory_sessions_expected_count",
        ),
        sa.CheckConstraint(
            "char_length(name) between 1 and 120",
            name="ck_inventory_sessions_name",
        ),
        sa.CheckConstraint(
            "location is null or char_length(location) between 1 and 80",
            name="ck_inventory_sessions_location",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            [f"{SCHEMA}.library_departments.id"],
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            [f"{SCHEMA}.app_users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["started_by"],
            [f"{SCHEMA}.app_users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["cancelled_by"],
            [f"{SCHEMA}.app_users.id"],
        ),
        sa.UniqueConstraint("reference", name="uq_inventory_sessions_reference"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_inventory_sessions_department_created",
        "inventory_sessions",
        ["department_id", "created_at"],
        schema=SCHEMA,
    )

    op.create_table(
        "inventory_scans",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("client_scan_id", UUID, nullable=False),
        sa.Column("barcode", sa.String(32), nullable=False),
        sa.Column("koha_item_id", sa.Integer(), nullable=True),
        sa.Column("koha_biblio_id", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        sa.Column("primary_scan_id", UUID, nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("call_number", sa.String(80), nullable=True),
        sa.Column("item_type_id", sa.String(64), nullable=True),
        sa.Column("item_type_label", sa.String(255), nullable=True),
        sa.Column("home_library_id", sa.String(64), nullable=True),
        sa.Column("home_library_name", sa.String(255), nullable=True),
        sa.Column("holding_library_id", sa.String(64), nullable=True),
        sa.Column("holding_library_name", sa.String(255), nullable=True),
        sa.Column("location", sa.String(80), nullable=True),
        sa.Column("koha_status", sa.String(64), nullable=True),
        sa.Column("koha_status_label", sa.String(255), nullable=True),
        sa.Column("scanned_by", UUID, nullable=False),
        sa.Column(
            "scanned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "outcome in ('verified', 'misplaced', 'unexpected', 'not_found', "
            "'duplicate', 'withdrawn', 'damaged', 'other_exception')",
            name="ck_inventory_scans_outcome",
        ),
        sa.CheckConstraint(
            "(is_primary = true and primary_scan_id is null) "
            "or (is_primary = false and primary_scan_id is not null)",
            name="ck_inventory_scans_primary",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["primary_scan_id"],
            [f"{SCHEMA}.inventory_scans.id"],
        ),
        sa.ForeignKeyConstraint(
            ["scanned_by"],
            [f"{SCHEMA}.app_users.id"],
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_inventory_scans_session_client_scan_id",
        "inventory_scans",
        ["session_id", "client_scan_id"],
        unique=True,
        schema=SCHEMA,
    )
    op.create_index(
        "uq_inventory_scans_session_koha_item_primary",
        "inventory_scans",
        ["session_id", "koha_item_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("is_primary AND koha_item_id IS NOT NULL"),
    )
    op.create_index(
        "uq_inventory_scans_session_barcode_primary",
        "inventory_scans",
        ["session_id", "barcode"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("is_primary AND koha_item_id IS NULL"),
    )
    op.create_index(
        "ix_inventory_scans_session_barcode",
        "inventory_scans",
        ["session_id", "barcode"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_inventory_scans_session_scanned_at",
        "inventory_scans",
        ["session_id", "scanned_at"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_inventory_scans_session_scanned_at",
        table_name="inventory_scans",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_inventory_scans_session_barcode",
        table_name="inventory_scans",
        schema=SCHEMA,
    )
    op.drop_index(
        "uq_inventory_scans_session_barcode_primary",
        table_name="inventory_scans",
        schema=SCHEMA,
        postgresql_where=sa.text("is_primary AND koha_item_id IS NULL"),
    )
    op.drop_index(
        "uq_inventory_scans_session_koha_item_primary",
        table_name="inventory_scans",
        schema=SCHEMA,
        postgresql_where=sa.text("is_primary AND koha_item_id IS NOT NULL"),
    )
    op.drop_index(
        "uq_inventory_scans_session_client_scan_id",
        table_name="inventory_scans",
        schema=SCHEMA,
    )
    op.drop_table("inventory_scans", schema=SCHEMA)
    op.drop_index(
        "ix_inventory_sessions_department_created",
        table_name="inventory_sessions",
        schema=SCHEMA,
    )
    op.drop_table("inventory_sessions", schema=SCHEMA)
    op.execute(sa.text(f"DROP SEQUENCE {SCHEMA}.inventory_session_ref_seq"))