"""campaign_character_membership

Revision ID: 003
Revises: 002
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, Sequence[str], None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("character") as batch_op:
        batch_op.add_column(sa.Column("campaign_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_character_campaign_id", "campaign", ["campaign_id"], ["id"])
        batch_op.create_index("ix_character_campaign_id", ["campaign_id"], unique=False)
        batch_op.alter_column("pdf_url", new_column_name="pdf_path")

    with op.batch_alter_table("campaignmember") as batch_op:
        batch_op.add_column(sa.Column("character_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_campaignmember_character_id", "character", ["character_id"], ["id"]
        )
        batch_op.create_index("ix_campaignmember_character_id", ["character_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("campaignmember") as batch_op:
        batch_op.drop_index("ix_campaignmember_character_id")
        batch_op.drop_constraint("fk_campaignmember_character_id", type_="foreignkey")
        batch_op.drop_column("character_id")

    with op.batch_alter_table("character") as batch_op:
        batch_op.alter_column("pdf_path", new_column_name="pdf_url")
        batch_op.drop_index("ix_character_campaign_id")
        batch_op.drop_constraint("fk_character_campaign_id", type_="foreignkey")
        batch_op.drop_column("campaign_id")
