"""feedback

Revision ID: 014
Revises: 013
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, Sequence[str], None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "feedback" not in inspector.get_table_names():
        op.create_table(
            "feedback",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("message", sa.String(length=2000), nullable=False),
            sa.Column("page_url", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["reviewed_by_id"], ["user.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_feedback_status"), "feedback", ["status"], unique=False)
        op.create_index(op.f("ix_feedback_user_id"), "feedback", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "feedback" in inspector.get_table_names():
        op.drop_index(op.f("ix_feedback_user_id"), table_name="feedback")
        op.drop_index(op.f("ix_feedback_status"), table_name="feedback")
        op.drop_table("feedback")
