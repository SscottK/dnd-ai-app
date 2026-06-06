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
