from datetime import datetime

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class GenerateResponse(BaseModel):
    text: str


class ChatMessage(BaseModel):
    role: str
    text: str = Field(default="")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class ChatResponseChunk(BaseModel):
    token: str


class HealthResponse(BaseModel):
    status: str
    app_name: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime


class AuthStatusResponse(BaseModel):
    authenticated: bool
    user: UserRead | None = None


class ConversationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConversationRead(BaseModel):
    id: int
    title: str
    created_at: datetime


class ConversationListResponse(BaseModel):
    conversations: list[ConversationRead]


class MessageCreate(BaseModel):
    content: str = Field(min_length=1)


class MessageRead(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    created_at: datetime


class ConversationDetailResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    messages: list[MessageRead]


class SendMessageResponse(BaseModel):
    user_message: MessageRead
    assistant_message: MessageRead


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class CampaignJoin(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class CampaignRead(BaseModel):
    id: int
    name: str
    owner_username: str
    is_owner: bool
    invite_code: str | None = None
    created_at: datetime


class CampaignListResponse(BaseModel):
    campaigns: list[CampaignRead]


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    class_name: str | None = Field(default=None, max_length=50)
    level: int | None = Field(default=1, ge=1, le=30)
    ac: int | None = Field(default=None, ge=0)
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    skills: str | None = None
    pdf_url: str | None = Field(default=None, max_length=500)
    dnd_beyond_url: str | None = Field(default=None, max_length=500)


class CharacterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    class_name: str | None = Field(default=None, max_length=50)
    level: int | None = Field(default=None, ge=1, le=30)
    ac: int | None = Field(default=None, ge=0)
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    skills: str | None = None
    pdf_url: str | None = Field(default=None, max_length=500)
    dnd_beyond_url: str | None = Field(default=None, max_length=500)


class CharacterRead(BaseModel):
    id: int
    name: str
    class_name: str | None
    level: int | None
    ac: int | None
    hp: int | None
    max_hp: int | None
    skills: str | None
    pdf_url: str | None
    dnd_beyond_url: str | None
    created_at: datetime


class CharacterListResponse(BaseModel):
    characters: list[CharacterRead]
