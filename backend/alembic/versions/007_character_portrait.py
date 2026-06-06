"""character_portrait

Revision ID: 007
Revises: 006
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, Sequence[str], None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("character") as batch_op:
        batch_op.add_column(sa.Column("portrait_path", sa.String(length=500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("character") as batch_op:
        batch_op.drop_column("portrait_path")
