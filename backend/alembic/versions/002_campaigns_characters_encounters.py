"""campaigns_characters_encounters

Revision ID: 002
Revises: 001
Create Date: 2026-06-06

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, Sequence[str], None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaign",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("invite_code", sa.String(length=12), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_campaign_invite_code"), "campaign", ["invite_code"], unique=True)
    op.create_index(op.f("ix_campaign_owner_id"), "campaign", ["owner_id"], unique=False)

    op.create_table(
        "campaignmember",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaign.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_campaignmember_campaign_id"), "campaignmember", ["campaign_id"], unique=False)
    op.create_index(op.f("ix_campaignmember_user_id"), "campaignmember", ["user_id"], unique=False)

    op.create_table(
        "character",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("class_name", sa.String(length=50), nullable=True),
        sa.Column("level", sa.Integer(), nullable=True),
        sa.Column("ac", sa.Integer(), nullable=True),
        sa.Column("hp", sa.Integer(), nullable=True),
        sa.Column("max_hp", sa.Integer(), nullable=True),
        sa.Column("skills", sa.Text(), nullable=True),
        sa.Column("pdf_url", sa.String(length=500), nullable=True),
        sa.Column("dnd_beyond_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_character_user_id"), "character", ["user_id"], unique=False)

    op.create_table(
        "historicalencounter",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("round_count", sa.Integer(), nullable=True),
        sa.Column("combat_log_json", sa.Text(), nullable=False),
        sa.Column("defeated_monsters_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaign.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_historicalencounter_campaign_id"),
        "historicalencounter",
        ["campaign_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_historicalencounter_campaign_id"), table_name="historicalencounter")
    op.drop_table("historicalencounter")
    op.drop_index(op.f("ix_character_user_id"), table_name="character")
    op.drop_table("character")
    op.drop_index(op.f("ix_campaignmember_user_id"), table_name="campaignmember")
    op.drop_index(op.f("ix_campaignmember_campaign_id"), table_name="campaignmember")
    op.drop_table("campaignmember")
    op.drop_index(op.f("ix_campaign_owner_id"), table_name="campaign")
    op.drop_index(op.f("ix_campaign_invite_code"), table_name="campaign")
    op.drop_table("campaign")
