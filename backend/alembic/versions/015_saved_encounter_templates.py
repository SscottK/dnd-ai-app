"""saved encounter templates

Revision ID: 015
Revises: 014
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "015"
down_revision: Union[str, Sequence[str], None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "savedencountertemplate" not in inspector.get_table_names():
        op.create_table(
            "savedencountertemplate",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("notes", sa.String(length=2000), nullable=False, server_default=""),
            sa.Column("monsters_json", sa.String(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_savedencountertemplate_user_id"),
            "savedencountertemplate",
            ["user_id"],
            unique=False,
        )


def downgrade() -> None:
    op.drop_index(op.f("ix_savedencountertemplate_user_id"), table_name="savedencountertemplate")
    op.drop_table("savedencountertemplate")
