"""Inventory permissions and stocktake tables.

Revision ID: 20261123_0006
Revises: 20261120_0005
Create Date: 2026-11-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261123_0006"
down_revision: Union[str, Sequence[str], None] = "20261120_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)

MANAGE_ROLES = (
    "Librarian",
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)
APPROVE_ROLES = (
    "Department Head",
    "Library Administrator",
    "Super Administrator",
)


def upgrade() -> None:
    bind = op.get_bind()

    op.create_table(
        "inventory_sessions",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("department_id", UUID, nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("home_library_id", sa.String(64), nullable=False),
        sa.Column("item_type_id", sa.Integer(), nullable=True),
        sa.Column("start_on", sa.Date(), nullable=False),
        sa.Column("target_on", sa.Date(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reopened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("snapshot_taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_count", sa.Integer(), nullable=True),
        sa.Column("created_by", UUID, nullable=True),
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
            "status in ('draft', 'in_progress', 'completed', 'cancelled')",
            name="ck_inventory_sessions_status",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            [f"{SCHEMA}.library_departments.id"],
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )

    op.create_table(
        "inventory_session_locations",
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("location", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id", "location"),
        schema=SCHEMA,
    )

    op.create_table(
        "inventory_session_operators",
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("session_id", "user_id"),
        schema=SCHEMA,
    )

    op.create_table(
        "inventory_expected_items",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("koha_item_id", sa.Integer(), nullable=False),
        sa.Column("barcode", sa.String(64), nullable=False),
        sa.Column("biblio_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("author", sa.Text(), nullable=True),
        sa.Column("call_number", sa.Text(), nullable=True),
        sa.Column("item_type_id", sa.Integer(), nullable=True),
        sa.Column("item_type_label", sa.Text(), nullable=True),
        sa.Column("home_library_id", sa.String(64), nullable=True),
        sa.Column("holding_library_id", sa.String(64), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("koha_status", sa.String(32), nullable=False),
        sa.CheckConstraint(
            "koha_status in ('available', 'damaged', 'not_for_loan')",
            name="ck_inventory_expected_items_koha_status",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "session_id",
            "koha_item_id",
            name="uq_inventory_expected_items_session_koha_item",
        ),
        sa.UniqueConstraint(
            "session_id",
            "barcode",
            name="uq_inventory_expected_items_session_barcode",
        ),
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
        sa.Column("expected_item_id", UUID, nullable=True),
        sa.Column("koha_item_id", sa.Integer(), nullable=True),
        sa.Column("barcode_submitted", sa.String(64), nullable=False),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("match_basis", sa.String(32), nullable=True),
        sa.Column(
            "observed_damaged",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "counts",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("original_scan_id", UUID, nullable=True),
        sa.Column("operator_id", UUID, nullable=True),
        sa.Column("station_location", sa.String(255), nullable=True),
        sa.Column("live_location", sa.String(255), nullable=True),
        sa.Column("live_home_library_id", sa.String(64), nullable=True),
        sa.Column("live_status", sa.String(64), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("author", sa.Text(), nullable=True),
        sa.Column("call_number", sa.Text(), nullable=True),
        sa.Column("item_type_label", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "outcome in ("
            "'found', 'misplaced', 'unexpected', 'damaged', 'withdrawn', "
            "'invalid', 'duplicate', 'koha_error'"
            ")",
            name="ck_inventory_scans_outcome",
        ),
        sa.CheckConstraint(
            "match_basis is null or match_basis in ('found', 'misplaced')",
            name="ck_inventory_scans_match_basis",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expected_item_id"],
            [f"{SCHEMA}.inventory_expected_items.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["original_scan_id"],
            [f"{SCHEMA}.inventory_scans.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["operator_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_inventory_scans_counting_item",
        "inventory_scans",
        ["session_id", "koha_item_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("counts AND koha_item_id IS NOT NULL"),
    )

    op.create_table(
        "inventory_shelf_searches",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("expected_item_id", UUID, nullable=False),
        sa.Column("batch_id", UUID, nullable=False),
        sa.Column("remark", sa.Text(), nullable=False),
        sa.Column("marked_by", UUID, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("reversed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reversed_by", UUID, nullable=True),
        sa.Column("reverse_remark", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expected_item_id"],
            [f"{SCHEMA}.inventory_expected_items.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["marked_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reversed_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_inventory_shelf_active",
        "inventory_shelf_searches",
        ["expected_item_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("reversed_at IS NULL"),
    )

    op.create_table(
        "inventory_adjustments",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("session_id", UUID, nullable=False),
        sa.Column("koha_item_id", sa.Integer(), nullable=False),
        sa.Column("expected_item_id", UUID, nullable=True),
        sa.Column("scan_id", UUID, nullable=True),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("from_value", sa.Text(), nullable=True),
        sa.Column("to_value", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("drafted_by", UUID, nullable=True),
        sa.Column("decided_by", UUID, nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("koha_http_status", sa.Integer(), nullable=True),
        sa.Column("koha_error", sa.String(500), nullable=True),
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
            "status in ('draft', 'approved', 'rejected', 'submitted', 'failed')",
            name="ck_inventory_adjustments_status",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            [f"{SCHEMA}.inventory_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["expected_item_id"],
            [f"{SCHEMA}.inventory_expected_items.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"],
            [f"{SCHEMA}.inventory_scans.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["drafted_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )

    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'inventory.manage', 'inventory',
                'Run stocktake sessions and scan items'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'inventory.manage'
            )
        """),
    )
    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'inventory.adjustments.approve', 'inventory',
                'Approve, reject, and submit inventory adjustments'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions
                WHERE code = 'inventory.adjustments.approve'
            )
        """),
    )

    for role_name in MANAGE_ROLES:
        bind.execute(
            sa.text(f"""
                INSERT INTO {SCHEMA}.role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM {SCHEMA}.roles r
                CROSS JOIN {SCHEMA}.permissions p
                WHERE r.name = :role_name AND p.code = 'inventory.manage'
                AND NOT EXISTS (
                    SELECT 1 FROM {SCHEMA}.role_permissions rp
                    WHERE rp.role_id = r.id AND rp.permission_id = p.id
                )
            """),
            {"role_name": role_name},
        )

    for role_name in APPROVE_ROLES:
        bind.execute(
            sa.text(f"""
                INSERT INTO {SCHEMA}.role_permissions (role_id, permission_id)
                SELECT r.id, p.id
                FROM {SCHEMA}.roles r
                CROSS JOIN {SCHEMA}.permissions p
                WHERE r.name = :role_name AND p.code = 'inventory.adjustments.approve'
                AND NOT EXISTS (
                    SELECT 1 FROM {SCHEMA}.role_permissions rp
                    WHERE rp.role_id = r.id AND rp.permission_id = p.id
                )
            """),
            {"role_name": role_name},
        )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'inventory.manage'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'inventory.adjustments.approve'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'inventory.manage'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions
            WHERE code = 'inventory.adjustments.approve'
        """),
    )

    op.drop_index(
        "uq_inventory_shelf_active",
        table_name="inventory_shelf_searches",
        schema=SCHEMA,
    )
    op.drop_table("inventory_adjustments", schema=SCHEMA)
    op.drop_table("inventory_shelf_searches", schema=SCHEMA)
    op.drop_index(
        "uq_inventory_scans_counting_item",
        table_name="inventory_scans",
        schema=SCHEMA,
    )
    op.drop_table("inventory_scans", schema=SCHEMA)
    op.drop_table("inventory_expected_items", schema=SCHEMA)
    op.drop_table("inventory_session_operators", schema=SCHEMA)
    op.drop_table("inventory_session_locations", schema=SCHEMA)
    op.drop_table("inventory_sessions", schema=SCHEMA)