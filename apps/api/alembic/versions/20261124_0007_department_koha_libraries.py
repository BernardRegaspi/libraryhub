"""Map library departments to the Koha libraries that hold their copies.

Revision ID: 20261124_0007
Revises: 20261123_0006
Create Date: 2026-11-24

College copies on this Koha host use library id UCL. CPL shares the
display name College Library and has no items.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20261124_0007"
down_revision: Union[str, Sequence[str], None] = "20261123_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BRANCHES = (
    ("COLLEGE", "UCL"),
    ("GRADE", "GradeL"),
    ("GRADUATE", "GL"),
    ("JHS", "JL"),
    ("SHS", "SL"),
)


def upgrade() -> None:
    for code, branch in _BRANCHES:
        op.execute(
            sa.text(
                "UPDATE library_departments "
                "SET koha_branchcode = :branch "
                "WHERE code = :code "
                "AND (koha_branchcode IS NULL OR btrim(koha_branchcode) = '')"
            ).bindparams(code=code, branch=branch)
        )


def downgrade() -> None:
    for code, branch in _BRANCHES:
        op.execute(
            sa.text(
                "UPDATE library_departments "
                "SET koha_branchcode = NULL "
                "WHERE code = :code AND koha_branchcode = :branch"
            ).bindparams(code=code, branch=branch)
        )
