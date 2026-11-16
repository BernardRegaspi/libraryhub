"""Identity tables, sessions, and reference roles.

Revision ID: 20261116_0002
Revises: 20251115_0001
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261116_0002"
down_revision: Union[str, Sequence[str], None] = "20251115_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"
UUID = postgresql.UUID(as_uuid=True)


PERMISSIONS = [
    ("dashboard.view", "dashboard", "Open the dashboard"),
    ("catalog.view", "catalog", "Open the catalog"),
    ("patrons.view", "patrons", "Open patron lookup"),
    ("circulation.view", "circulation", "Open the circulation desk"),
    ("holds.view", "holds", "Open holds"),
    ("inventory.view", "inventory", "Open inventory"),
    ("notifications.view", "notifications", "Open notifications"),
    ("announcements.view", "announcements", "Open announcements"),
    ("reports.view", "reports", "Open reports"),
    ("departments.view", "departments", "Open departments"),
    ("staff.view", "staff", "Open staff and roles"),
    ("audit.view", "audit", "Open the audit log"),
    ("integrations.view", "integrations", "Open Koha integration"),
    ("student.view", "student", "Open the student portal"),
]

STAFF = [code for code, _, _ in PERMISSIONS if code != "student.view"]
HEAD = [code for code in STAFF if code not in {"staff.view", "audit.view", "integrations.view"}]
LIBRARIAN = [
    "dashboard.view",
    "catalog.view",
    "patrons.view",
    "circulation.view",
    "holds.view",
    "inventory.view",
    "notifications.view",
]
GRANTS = {
    "Super Administrator": STAFF,
    "Library Administrator": STAFF,
    "Department Head": HEAD,
    "Librarian": LIBRARIAN,
    "Auditor": ["dashboard.view", "reports.view", "audit.view"],
    "Student": ["student.view"],
}

DEPARTMENTS = [
    ("COLLEGE", "College Library"),
    ("JHS", "Junior High School Library"),
    ("SHS", "Senior High School Library"),
    ("GRADE", "Grade School Library"),
    ("GRADUATE", "Graduate School Library"),
]

ROLES = [
    "Super Administrator",
    "Library Administrator",
    "Department Head",
    "Librarian",
    "Student",
    "Auditor",
]


def upgrade() -> None:
    op.create_table(
        "library_departments",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("koha_branchcode", sa.String(64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("code"),
        schema=SCHEMA,
    )
    op.create_table(
        "app_users",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
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
            "status in ('active', 'suspended')",
            name="ck_app_users_status",
        ),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
        schema=SCHEMA,
    )
    op.create_table(
        "roles",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system_role", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("name"),
        schema=SCHEMA,
    )
    op.create_table(
        "permissions",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(128), nullable=False),
        sa.Column("module", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.UniqueConstraint("code"),
        schema=SCHEMA,
    )
    op.create_table(
        "auth_identities",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("provider_subject", sa.String(255), nullable=False),
        sa.Column("koha_borrowernumber", sa.String(64), nullable=True),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "user_credentials",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id"),
        schema=SCHEMA,
    )
    op.create_table(
        "user_sessions",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(64), nullable=False),
        sa.Column("active_department_id", UUID, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idle_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["active_department_id"],
            [f"{SCHEMA}.library_departments.id"],
        ),
        sa.UniqueConstraint("token_hash"),
        schema=SCHEMA,
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", UUID, primary_key=True, nullable=False),
        sa.Column("permission_id", UUID, primary_key=True, nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"],
            [f"{SCHEMA}.roles.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["permission_id"],
            [f"{SCHEMA}.permissions.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "user_role_assignments",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("role_id", UUID, nullable=False),
        sa.Column("department_id", UUID, nullable=True),
        sa.Column("assigned_by", UUID, nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            [f"{SCHEMA}.roles.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            [f"{SCHEMA}.library_departments.id"],
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )
    op.create_table(
        "audit_logs",
        sa.Column(
            "id",
            UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID, nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("module", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", sa.String(128), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            [f"{SCHEMA}.app_users.id"],
            ondelete="SET NULL",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_audit_logs_action_created",
        "audit_logs",
        ["action", "created_at"],
        schema=SCHEMA,
    )

    departments = sa.table(
        "library_departments",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("koha_branchcode", sa.String),
        sa.column("is_active", sa.Boolean),
        schema=SCHEMA,
    )
    op.bulk_insert(
        departments,
        [
            {
                "code": code,
                "name": name,
                "koha_branchcode": None,
                "is_active": True,
            }
            for code, name in DEPARTMENTS
        ],
    )

    roles = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("is_system_role", sa.Boolean),
        schema=SCHEMA,
    )
    op.bulk_insert(
        roles,
        [{"name": name, "description": None, "is_system_role": True} for name in ROLES],
    )

    permissions = sa.table(
        "permissions",
        sa.column("code", sa.String),
        sa.column("module", sa.String),
        sa.column("description", sa.Text),
        schema=SCHEMA,
    )
    op.bulk_insert(
        permissions,
        [{"code": code, "module": module, "description": desc} for code, module, desc in PERMISSIONS],
    )

    bind = op.get_bind()
    role_rows = bind.execute(
        sa.text(f"SELECT id, name FROM {SCHEMA}.roles"),
    ).mappings()
    role_ids = {row["name"]: row["id"] for row in role_rows}
    perm_rows = bind.execute(
        sa.text(f"SELECT id, code FROM {SCHEMA}.permissions"),
    ).mappings()
    perm_ids = {row["code"]: row["id"] for row in perm_rows}

    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", UUID),
        sa.column("permission_id", UUID),
        schema=SCHEMA,
    )
    grant_rows: list[dict[str, object]] = []
    for role_name, codes in GRANTS.items():
        role_id = role_ids[role_name]
        for code in codes:
            grant_rows.append({"role_id": role_id, "permission_id": perm_ids[code]})
    op.bulk_insert(role_permissions, grant_rows)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs", schema=SCHEMA)
    op.drop_table("audit_logs", schema=SCHEMA)
    op.drop_table("user_role_assignments", schema=SCHEMA)
    op.drop_table("role_permissions", schema=SCHEMA)
    op.drop_table("user_sessions", schema=SCHEMA)
    op.drop_table("user_credentials", schema=SCHEMA)
    op.drop_table("auth_identities", schema=SCHEMA)
    op.drop_table("permissions", schema=SCHEMA)
    op.drop_table("roles", schema=SCHEMA)
    op.drop_table("app_users", schema=SCHEMA)
    op.drop_table("library_departments", schema=SCHEMA)