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
    character_id: int


class CampaignRead(BaseModel):
    id: int
    name: str
    owner_username: str
    is_owner: bool
    invite_code: str | None = None
    my_character_name: str | None = None
    my_character_id: int | None = None
    session_active: bool = False
    member_count: int | None = None
    created_at: datetime


class CampaignSessionUpdate(BaseModel):
    session_active: bool


class CampaignSessionStatus(BaseModel):
    campaign_id: int
    campaign_name: str
    session_active: bool
    is_owner: bool
    character_id: int | None = None
    character_name: str | None = None


class CampaignListResponse(BaseModel):
    campaigns: list[CampaignRead]


class CampaignMemberRead(BaseModel):
    member_id: int
    username: str
    character_id: int
    character_name: str
    class_name: str | None
    level: int | None
    ac: int | None
    hp: int | None
    max_hp: int | None
    portrait_url: str | None = None


class CampaignRosterResponse(BaseModel):
    campaign_id: int
    members: list[CampaignMemberRead]


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    class_name: str | None = Field(default=None, max_length=50)
    level: int | None = Field(default=1, ge=1, le=30)
    ac: int | None = Field(default=None, ge=0)
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    skills: str | None = None
    sheet_json: str | None = None
    dnd_beyond_url: str | None = Field(default=None, max_length=500)
    pdf_stored_name: str | None = Field(default=None, max_length=200)


class CharacterUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    class_name: str | None = Field(default=None, max_length=50)
    level: int | None = Field(default=None, ge=1, le=30)
    ac: int | None = Field(default=None, ge=0)
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    skills: str | None = None
    inventory: str | None = None
    features: str | None = None
    notes: str | None = None
    layout_json: str | None = None
    sheet_json: str | None = None
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
    inventory: str | None = None
    features: str | None = None
    notes: str | None = None
    layout_json: str | None = None
    sheet_json: str | None = None
    campaign_id: int | None
    campaign_name: str | None
    pdf_url: str | None
    portrait_url: str | None = None
    portrait_photo_id: int | None = None
    dnd_beyond_url: str | None
    created_at: datetime


class CharacterPhotoRead(BaseModel):
    id: int
    character_id: int
    url: str
    created_at: datetime
    is_portrait: bool = False


class CharacterPhotoListResponse(BaseModel):
    photos: list[CharacterPhotoRead]
    portrait_photo_id: int | None = None


class SetPortraitRequest(BaseModel):
    photo_id: int = Field(ge=1)


class EncounterCombatant(BaseModel):
    id: str
    name: str
    initiative: int = 0
    is_pc: bool = False
    is_ally: bool = False
    character_id: int | None = None
    portrait_url: str | None = None
    hp: int | None = None
    max_hp: int | None = None
    ac: int | None = None
    conditions: str | None = None


class EncounterState(BaseModel):
    round: int = 1
    active_index: int = 0
    active_combatant_id: str | None = None
    combatants: list[EncounterCombatant] = Field(default_factory=list)


class EncounterUpdate(BaseModel):
    round: int | None = Field(default=None, ge=1)
    active_index: int | None = Field(default=None, ge=0)
    active_combatant_id: str | None = None
    combatants: list[EncounterCombatant] | None = None


class InitiativeSubmitRequest(BaseModel):
    initiative: int | None = Field(default=None, ge=-20, le=50)
    auto_roll: bool = False


class InitiativeSubmitResponse(BaseModel):
    encounter: EncounterState
    total: int
    d20_roll: int | None = None
    bonus: int | None = None


class EncounterEnemyInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    count: int = Field(default=1, ge=1, le=12)
    initiative: int = 0
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    ac: int | None = Field(default=None, ge=0)
    conditions: str | None = Field(default=None, max_length=200)


class AddEncounterEnemiesRequest(BaseModel):
    enemies: list[EncounterEnemyInput] = Field(min_length=1)


class CharacterListResponse(BaseModel):
    characters: list[CharacterRead]


class CharacterDraft(BaseModel):
    name: str
    class_name: str | None = None
    level: int | None = 1
    ac: int | None = None
    hp: int | None = None
    max_hp: int | None = None
    skills: str | None = None
    sheet_json: str | None = None
    pdf_stored_name: str | None = None
    parse_warning: str | None = None
