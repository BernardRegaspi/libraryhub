"""Patron permissions for administrators.

Revision ID: 20261120_0004
Revises: 20261117_0003
Create Date: 2026-11-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261120_0004"
down_revision: Union[str, Sequence[str], None] = "20261117_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "libraryhub"

ADMIN_ROLES = (
    "Super Administrator",
    "Library Administrator",
)


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'patrons.sensitive.view', 'patrons',
                'View date of birth, address, and staff notes'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'patrons.sensitive.view'
            )
        """),
    )
    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'patrons.create', 'patrons', 'Create a Koha patron'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'patrons.create'
            )
        """),
    )
    bind.execute(
        sa.text(f"""
            INSERT INTO {SCHEMA}.permissions (id, code, module, description)
            SELECT gen_random_uuid(), 'patrons.update', 'patrons', 'Update a Koha patron'
            WHERE NOT EXISTS (
                SELECT 1 FROM {SCHEMA}.permissions WHERE code = 'patrons.update'
            )
        """),
    )

    for role_name in ADMIN_ROLES:
        for code in (
            "patrons.sensitive.view",
            "patrons.create",
            "patrons.update",
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
    bind = op.get_bind()

    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'patrons.sensitive.view'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'patrons.create'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.role_permissions rp
            USING {SCHEMA}.permissions p
            WHERE rp.permission_id = p.id AND p.code = 'patrons.update'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'patrons.sensitive.view'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'patrons.create'
        """),
    )
    bind.execute(
        sa.text(f"""
            DELETE FROM {SCHEMA}.permissions WHERE code = 'patrons.update'
        """),
    )