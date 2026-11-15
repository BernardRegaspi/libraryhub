"""Baseline ULMS schema namespace.

Revision ID: 20251115_0001
Revises:
Create Date: 2025-11-15

"""
from typing import Sequence, Union

from alembic import op

revision: str = "20251115_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS libraryhub")


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS libraryhub CASCADE")