"""character_sheet_encounter

Revision ID: 004
Revises: 003
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, Sequence[str], None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("character") as batch_op:
        batch_op.add_column(sa.Column("inventory", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("features", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("notes", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("layout_json", sa.Text(), nullable=False, server_default="{}")
        )

    with op.batch_alter_table("campaign") as batch_op:
        batch_op.add_column(
            sa.Column("encounter_json", sa.Text(), nullable=False, server_default="{}")
        )


def downgrade() -> None:
    with op.batch_alter_table("campaign") as batch_op:
        batch_op.drop_column("encounter_json")

    with op.batch_alter_table("character") as batch_op:
        batch_op.drop_column("layout_json")
        batch_op.drop_column("notes")
        batch_op.drop_column("features")
        batch_op.drop_column("inventory")
