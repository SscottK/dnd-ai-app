"""campaign_play_session_json

Revision ID: 009
Revises: 008
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: Union[str, Sequence[str], None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("campaign") as batch_op:
        batch_op.add_column(
            sa.Column("play_session_json", sa.Text(), nullable=False, server_default="{}")
        )


def downgrade() -> None:
    with op.batch_alter_table("campaign") as batch_op:
        batch_op.drop_column("play_session_json")
