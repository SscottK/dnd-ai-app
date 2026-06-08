"""user_notes

Revision ID: 011
Revises: 010
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, Sequence[str], None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "usernote" in inspector.get_table_names():
        return

    op.create_table(
        "usernote",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaign.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_usernote_campaign_id"), "usernote", ["campaign_id"], unique=False)
    op.create_index(op.f("ix_usernote_user_id"), "usernote", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_usernote_user_id"), table_name="usernote")
    op.drop_index(op.f("ix_usernote_campaign_id"), table_name="usernote")
    op.drop_table("usernote")
