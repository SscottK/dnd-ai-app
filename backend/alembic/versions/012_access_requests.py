"""access_requests

Revision ID: 012
Revises: 011
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, Sequence[str], None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {col["name"] for col in inspector.get_columns("user")}
    if "is_admin" not in user_columns:
        op.add_column(
            "user",
            sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    if "accessrequest" not in inspector.get_table_names():
        op.create_table(
            "accessrequest",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("username", sa.String(length=50), nullable=False),
            sa.Column("password_hash", sa.String(length=255), nullable=False),
            sa.Column("message", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["reviewed_by_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_accessrequest_status"), "accessrequest", ["status"], unique=False)
        op.create_index(op.f("ix_accessrequest_username"), "accessrequest", ["username"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "accessrequest" in inspector.get_table_names():
        op.drop_index(op.f("ix_accessrequest_username"), table_name="accessrequest")
        op.drop_index(op.f("ix_accessrequest_status"), table_name="accessrequest")
        op.drop_table("accessrequest")

    user_columns = {col["name"] for col in inspector.get_columns("user")}
    if "is_admin" in user_columns:
        op.drop_column("user", "is_admin")
