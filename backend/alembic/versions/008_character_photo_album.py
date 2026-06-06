"""character_photo_album

Revision ID: 008
Revises: 007
Create Date: 2026-06-06

"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, Sequence[str], None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    table_names = set(inspector.get_table_names())

    if "characterphoto" not in table_names:
        op.create_table(
            "characterphoto",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("character_id", sa.Integer(), nullable=False),
            sa.Column("file_path", sa.String(length=500), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["character_id"], ["character.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_characterphoto_character_id"), "characterphoto", ["character_id"], unique=False
        )

    character_columns = {column["name"] for column in inspector.get_columns("character")}
    if "portrait_photo_id" not in character_columns:
        op.add_column("character", sa.Column("portrait_photo_id", sa.Integer(), nullable=True))

    rows = conn.execute(
        sa.text("SELECT id, portrait_path FROM character WHERE portrait_path IS NOT NULL")
    ).fetchall()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for character_id, portrait_path in rows:
        already = conn.execute(
            sa.text("SELECT portrait_photo_id FROM character WHERE id = :character_id"),
            {"character_id": character_id},
        ).scalar()
        if already is not None:
            continue

        result = conn.execute(
            sa.text(
                "INSERT INTO characterphoto (character_id, file_path, created_at) "
                "VALUES (:character_id, :file_path, :created_at)"
            ),
            {
                "character_id": character_id,
                "file_path": portrait_path,
                "created_at": now,
            },
        )
        photo_id = result.lastrowid
        conn.execute(
            sa.text("UPDATE character SET portrait_photo_id = :photo_id WHERE id = :character_id"),
            {"photo_id": photo_id, "character_id": character_id},
        )


def downgrade() -> None:
    with op.batch_alter_table("character") as batch_op:
        batch_op.drop_constraint("fk_character_portrait_photo_id", type_="foreignkey")
        batch_op.drop_column("portrait_photo_id")

    op.drop_index(op.f("ix_characterphoto_character_id"), table_name="characterphoto")
    op.drop_table("characterphoto")
