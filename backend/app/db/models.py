from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = Field(index=True, max_length=200)
    created_at: datetime = Field(default_factory=utc_now)

    messages: list["Message"] = Relationship(back_populates="conversation")


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    role: str = Field(max_length=20)
    content: str
    created_at: datetime = Field(default_factory=utc_now)

    conversation: Optional[Conversation] = Relationship(back_populates="messages")