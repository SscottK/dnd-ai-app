"""action_logs_and_campaign_notes

Revision ID: 010
Revises: 009
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, Sequence[str], None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    campaign_columns = {column["name"] for column in inspector.get_columns("campaign")}
    if "action_log_json" not in campaign_columns:
        op.add_column(
            "campaign",
            sa.Column("action_log_json", sa.Text(), nullable=False, server_default="[]"),
        )

    historical_columns = {column["name"] for column in inspector.get_columns("historicalencounter")}
    if "formatted_log_text" not in historical_columns:
        op.add_column(
            "historicalencounter",
            sa.Column("formatted_log_text", sa.Text(), nullable=False, server_default=""),
        )

    if "sessionactionlog" not in inspector.get_table_names():
        op.create_table(
            "sessionactionlog",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("campaign_id", sa.Integer(), nullable=False),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
            sa.Column("formatted_log_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("entry_count", sa.Integer(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["campaign_id"], ["campaign.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_sessionactionlog_campaign_id"),
            "sessionactionlog",
            ["campaign_id"],
            unique=False,
        )

    if "usercampaignnotes" not in inspector.get_table_names():
        op.create_table(
            "usercampaignnotes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("campaign_id", sa.Integer(), nullable=False),
            sa.Column("notes_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["campaign_id"], ["campaign.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_usercampaignnotes_campaign_id"),
            "usercampaignnotes",
            ["campaign_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_usercampaignnotes_user_id"),
            "usercampaignnotes",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            "ix_usercampaignnotes_user_campaign",
            "usercampaignnotes",
            ["user_id", "campaign_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_usercampaignnotes_user_campaign", table_name="usercampaignnotes")
    op.drop_index(op.f("ix_usercampaignnotes_user_id"), table_name="usercampaignnotes")
    op.drop_index(op.f("ix_usercampaignnotes_campaign_id"), table_name="usercampaignnotes")
    op.drop_table("usercampaignnotes")

    op.drop_index(op.f("ix_sessionactionlog_campaign_id"), table_name="sessionactionlog")
    op.drop_table("sessionactionlog")

    op.drop_column("historicalencounter", "formatted_log_text")
    op.drop_column("campaign", "action_log_json")
