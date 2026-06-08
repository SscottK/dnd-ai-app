"""Add optional campaign description.

Revision ID: 013_campaign_description
Revises: 012_access_requests
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "campaign",
        sa.Column("description", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("campaign", "description")
