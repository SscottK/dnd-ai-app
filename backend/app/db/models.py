from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, Relationship, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, max_length=50)
    password_hash: str = Field(max_length=255)
    created_at: datetime = Field(default_factory=utc_now)

    conversations: list["Conversation"] = Relationship(back_populates="user")
    characters: list["Character"] = Relationship(back_populates="user")
    owned_campaigns: list["Campaign"] = Relationship(back_populates="owner")
    campaign_memberships: list["CampaignMember"] = Relationship(back_populates="user")


class Conversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(index=True, max_length=200)
    created_at: datetime = Field(default_factory=utc_now)

    user: Optional[User] = Relationship(back_populates="conversations")
    messages: list["Message"] = Relationship(
        back_populates="conversation",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    role: str = Field(max_length=20)
    content: str
    created_at: datetime = Field(default_factory=utc_now)

    conversation: Optional[Conversation] = Relationship(back_populates="messages")


class Campaign(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=200)
    invite_code: str = Field(unique=True, index=True, max_length=12)
    encounter_json: str = Field(default="{}")
    session_active: bool = Field(default=False)
    play_session_json: str = Field(default="{}")
    created_at: datetime = Field(default_factory=utc_now)

    owner: Optional[User] = Relationship(back_populates="owned_campaigns")
    members: list["CampaignMember"] = Relationship(
        back_populates="campaign",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    characters: list["Character"] = Relationship(back_populates="campaign")
    historical_encounters: list["HistoricalEncounter"] = Relationship(
        back_populates="campaign",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class CampaignMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    character_id: int = Field(foreign_key="character.id", index=True)
    joined_at: datetime = Field(default_factory=utc_now)

    campaign: Optional[Campaign] = Relationship(back_populates="members")
    user: Optional[User] = Relationship(back_populates="campaign_memberships")
    character: Optional["Character"] = Relationship(back_populates="membership")


class Character(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    campaign_id: Optional[int] = Field(default=None, foreign_key="campaign.id", index=True)
    name: str = Field(max_length=100)
    class_name: Optional[str] = Field(default=None, max_length=50)
    level: Optional[int] = Field(default=1)
    ac: Optional[int] = Field(default=None)
    hp: Optional[int] = Field(default=None)
    max_hp: Optional[int] = Field(default=None)
    skills: Optional[str] = Field(default=None)
    inventory: Optional[str] = Field(default=None)
    features: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None)
    layout_json: str = Field(default="{}")
    sheet_json: str = Field(default="{}")
    pdf_path: Optional[str] = Field(default=None, max_length=500)
    portrait_path: Optional[str] = Field(default=None, max_length=500)
    portrait_photo_id: Optional[int] = Field(default=None, foreign_key="characterphoto.id")
    dnd_beyond_url: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=utc_now)

    user: Optional[User] = Relationship(back_populates="characters")
    campaign: Optional[Campaign] = Relationship(back_populates="characters")
    membership: Optional[CampaignMember] = Relationship(
        back_populates="character",
        sa_relationship_kwargs={"uselist": False},
    )
    photos: list["CharacterPhoto"] = Relationship(
        back_populates="character",
        sa_relationship_kwargs={
            "foreign_keys": "[CharacterPhoto.character_id]",
            "cascade": "all, delete-orphan",
        },
    )
    portrait_photo: Optional["CharacterPhoto"] = Relationship(
        sa_relationship_kwargs={
            "foreign_keys": "[Character.portrait_photo_id]",
            "primaryjoin": "Character.portrait_photo_id==CharacterPhoto.id",
            "uselist": False,
            "viewonly": True,
        }
    )


class CharacterPhoto(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    character_id: int = Field(foreign_key="character.id", index=True)
    file_path: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=utc_now)

    character: Optional[Character] = Relationship(
        back_populates="photos",
        sa_relationship_kwargs={
            "foreign_keys": "[CharacterPhoto.character_id]",
            "primaryjoin": "CharacterPhoto.character_id==Character.id",
        },
    )


class HistoricalEncounter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id", index=True)
    recorded_at: datetime = Field(default_factory=utc_now)
    round_count: Optional[int] = Field(default=None)
    combat_log_json: str = Field(default="[]")
    defeated_monsters_json: str = Field(default="[]")

    campaign: Optional[Campaign] = Relationship(back_populates="historical_encounters")
