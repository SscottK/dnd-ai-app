from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.services.conditions import assert_conditions_valid, normalize_conditions


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
    is_admin: bool = False
    created_at: datetime


class RegistrationStatusResponse(BaseModel):
    registration_open: bool


class AccessRequestCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    message: str = Field(default="", max_length=500)


class AccessRequestRead(BaseModel):
    id: int
    username: str
    message: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_username: str | None = None


class AccessRequestActionResponse(BaseModel):
    request: AccessRequestRead
    message: str


class AccessRequestSummaryResponse(BaseModel):
    access_pending_count: int
    feedback_pending_count: int
    pending_count: int


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=10, max_length=2000)
    page_url: str = Field(default="", max_length=500)


class FeedbackRead(BaseModel):
    id: int
    username: str
    message: str
    page_url: str
    status: str
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_username: str | None = None


class FeedbackActionResponse(BaseModel):
    feedback: FeedbackRead
    message: str


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
    description: str | None = Field(default=None, max_length=500)


class CampaignUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=500)


class CampaignJoin(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)
    character_id: int


class CampaignRead(BaseModel):
    id: int
    name: str
    description: str | None = None
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
    last_combat_log_id: int | None = None
    last_action_log_id: int | None = None
    play_session_notes_tab_id: str | None = None
    play_session_notes_tab_title: str | None = None
    action_log_text: str | None = None


class ActionLogEntry(BaseModel):
    at: str
    message: str
    kind: str = "roll"
    roller_name: str
    character_name: str | None = None
    dice: str | None = None
    expression: str | None = None
    result: int | None = None
    bonus: int | None = None
    total: int | None = None
    rolls: list[int] | None = None
    dropped: list[int] | None = None


class ActionRollRequest(BaseModel):
    expression: str | None = Field(default=None, max_length=48)
    quick_die: str | None = Field(default=None, max_length=8)
    roll_kind: str = Field(default="dice", max_length=16)
    label: str | None = Field(default=None, max_length=80)
    character_id: int | None = Field(default=None, ge=1)
    advantage: bool = False
    disadvantage: bool = False


class ActionRollResponse(BaseModel):
    entry: ActionLogEntry
    log: list[ActionLogEntry] = Field(default_factory=list)


class LatestActionLogResponse(BaseModel):
    action_log_id: int
    action_log_text: str


class DiceRollRequest(BaseModel):
    dice: str = Field(min_length=2, max_length=8)
    result: int = Field(ge=1, le=1000)
    roller_name: str | None = Field(default=None, max_length=120)
    message: str | None = Field(default=None, max_length=200)


class CampaignListResponse(BaseModel):
    campaigns: list[CampaignRead]


class CampaignMemberRead(BaseModel):
    member_id: int
    username: str
    character_id: int
    character_name: str
    class_name: str | None
    level: int | None
    race: str | None = None
    ac: int | None
    hp: int | None
    max_hp: int | None
    speed: int | None = None
    portrait_url: str | None = None
    heroic_inspiration: int | None = None
    i_know_a_guy: int | None = None


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


class CombatLogEntry(BaseModel):
    at: str
    message: str
    kind: str = "event"
    actor: str | None = None
    roller_name: str | None = None
    dice: str | None = None
    result: int | None = None
    bonus: int | None = None
    total: int | None = None


class CombatActionEntry(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    action_type: str = Field(default="action", max_length=32)
    targeting: str = Field(default="one_enemy", max_length=32)
    description: str | None = Field(default=None, max_length=500)
    attack_bonus: int | None = None
    damage_dice: str | None = Field(default=None, max_length=32)


class PartyRosterEntry(BaseModel):
    id: str
    name: str
    character_id: int | None = None


class TeamInitiativeState(BaseModel):
    party_initiative: int = 0
    party_phase_active: bool = False
    completed_this_phase: list[str] = Field(default_factory=list)
    initiative_rolls: dict[str, int] = Field(default_factory=dict)
    eligible_character_ids: list[int] = Field(default_factory=list)
    turn_slot_index: int = 0
    turn_slots: list[str] = Field(default_factory=list)
    party_roster: list[PartyRosterEntry] = Field(default_factory=list)


class EncounterCombatant(BaseModel):
    id: str
    name: str
    initiative: int = 0
    is_pc: bool = False
    is_ally: bool = False
    character_id: int | None = None
    controller_character_id: int | None = None
    portrait_url: str | None = None
    hp: int | None = None
    max_hp: int | None = None
    ac: int | None = None
    speed: int | None = None
    conditions: list[str] = Field(default_factory=list)
    combat_actions: list[CombatActionEntry] = Field(default_factory=list)

    @field_validator("conditions", mode="before")
    @classmethod
    def coerce_conditions(cls, value: list[str] | str | None) -> list[str]:
        return normalize_conditions(value)

    @field_validator("conditions")
    @classmethod
    def validate_conditions(cls, value: list[str]) -> list[str]:
        return assert_conditions_valid(value)


class TurnEconomySnapshot(BaseModel):
    action_used: bool = False
    bonus_action_used: bool = False
    reaction_used: bool = False
    magic_action_used: bool = False
    extra_action_available: bool = False
    attacks_remaining: int = 0
    movement_remaining: int | None = None
    dodging: bool = False
    disengaged: bool = False
    hiding: bool = False
    helping_target_id: str | None = None
    readied_action: str | None = None
    readied_trigger: str | None = None


class EncounterState(BaseModel):
    round: int = 1
    active_index: int = 0
    active_combatant_id: str | None = None
    initiative_mode: str = "individual"
    team: TeamInitiativeState | None = None
    combatants: list[EncounterCombatant] = Field(default_factory=list)
    combat_log: list[CombatLogEntry] = Field(default_factory=list)
    turn_economy: dict[str, TurnEconomySnapshot] = Field(default_factory=dict)


class UseActionRequest(BaseModel):
    combatant_id: str | None = Field(default=None, max_length=64)
    action_id: str = Field(min_length=1, max_length=120)
    action_name: str = Field(min_length=1, max_length=120)
    action_type: str = Field(min_length=1, max_length=32)
    targeting: str = Field(min_length=1, max_length=32)
    target_ids: list[str] = Field(default_factory=list)
    detail: str | None = Field(default=None, max_length=500)
    trigger: str | None = Field(default=None, max_length=200)


class TriggerReadiedRequest(BaseModel):
    combatant_id: str = Field(min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=200)


class CancelReadiedRequest(BaseModel):
    combatant_id: str = Field(min_length=1, max_length=64)


class UseActionResponse(BaseModel):
    encounter: EncounterState
    action_messages: list[str] = Field(default_factory=list)
    combat_ended: bool = False
    combat_log_id: int | None = None
    combat_log_text: str | None = None
    party_updated: int | None = None
    reason: str | None = None


class CombatantActionSheetResponse(BaseModel):
    sheet: dict = Field(default_factory=dict)


class MonsterSearchEntry(BaseModel):
    name: str
    cr: str | None = None
    type: str | None = None
    armor_class: int | None = None
    hp_max: int | None = None
    action_count: int = 0


class MonsterSearchResponse(BaseModel):
    monsters: list[MonsterSearchEntry] = Field(default_factory=list)


class AdjustMovementRequest(BaseModel):
    combatant_id: str | None = Field(default=None, max_length=64)
    delta: int = Field(ge=-1000, le=1000)


class EncounterUpdate(BaseModel):
    round: int | None = Field(default=None, ge=1)
    active_index: int | None = Field(default=None, ge=0)
    active_combatant_id: str | None = None
    initiative_mode: str | None = Field(default=None, max_length=16)
    combatants: list[EncounterCombatant] | None = None
    turn_economy: dict[str, TurnEconomySnapshot] | None = None


class PassCombatRequest(BaseModel):
    target_combatant_id: str = Field(min_length=1, max_length=64)
    combatant_id: str | None = Field(default=None, max_length=64)


class FinishPartySliceRequest(BaseModel):
    combatant_id: str | None = Field(default=None, max_length=64)


class AddRosterTeamRequest(BaseModel):
    roll_character_ids: list[int] = Field(default_factory=list)


class EncounterPatchResponse(BaseModel):
    encounter: EncounterState
    combat_ended: bool = False
    combat_log_id: int | None = None
    combat_log_text: str | None = None
    party_updated: int | None = None
    reason: str | None = None


class InitiativeSubmitRequest(BaseModel):
    initiative: int | None = Field(default=None, ge=-20, le=50)
    auto_roll: bool = False


class InitiativeSubmitResponse(BaseModel):
    encounter: EncounterState
    total: int
    d20_roll: int | None = None
    bonus: int | None = None


class EndCombatResponse(BaseModel):
    encounter: EncounterState
    combat_log_id: int
    combat_log_text: str
    party_updated: int
    reason: str


class LatestCombatLogResponse(BaseModel):
    combat_log_id: int
    combat_log_text: str


class EncounterEnemyInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    count: int = Field(default=1, ge=1, le=12)
    initiative: int = 0
    hp: int | None = Field(default=None, ge=0)
    max_hp: int | None = Field(default=None, ge=0)
    ac: int | None = Field(default=None, ge=0)
    conditions: list[str] = Field(default_factory=list)
    combat_actions: list[CombatActionEntry] = Field(default_factory=list)

    @field_validator("conditions", mode="before")
    @classmethod
    def coerce_enemy_conditions(cls, value: list[str] | str | None) -> list[str]:
        return normalize_conditions(value)

    @field_validator("conditions")
    @classmethod
    def validate_enemy_conditions(cls, value: list[str]) -> list[str]:
        return assert_conditions_valid(value)


class AddEncounterEnemiesRequest(BaseModel):
    enemies: list[EncounterEnemyInput] = Field(min_length=1)


class AddRosterRequest(BaseModel):
    auto_roll: bool = False


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


class NoteTab(BaseModel):
    id: str
    title: str
    content: str = ""
    archived: bool = False


class CampaignNotesDocument(BaseModel):
    tabs: list[NoteTab]
    closed_tabs: list[NoteTab] = Field(default_factory=list, alias="closedTabs")
    active_tab_id: str | None = Field(default=None, alias="activeTabId")

    model_config = {"populate_by_name": True}


class CampaignNotesUpdate(BaseModel):
    tabs: list[NoteTab]
    closed_tabs: list[NoteTab] = Field(default_factory=list, alias="closedTabs")
    active_tab_id: str | None = Field(default=None, alias="activeTabId")

    model_config = {"populate_by_name": True}


class NoteTabCreate(BaseModel):
    title: str = Field(default="New tab", min_length=1, max_length=120)
    content: str = ""


class CampaignNotesSummary(BaseModel):
    campaign_id: int
    campaign_name: str
    tabs: list[NoteTab]
    closed_tabs: list[NoteTab] = Field(default_factory=list, alias="closedTabs")
    active_tab_id: str | None = Field(default=None, alias="activeTabId")
    updated_at: datetime

    model_config = {"populate_by_name": True}


class AllNotesResponse(BaseModel):
    campaigns: list[CampaignNotesSummary]


class UserNoteRead(BaseModel):
    id: int
    title: str
    content: str
    campaign_id: int | None = None
    campaign_name: str | None = None
    created_at: datetime
    updated_at: datetime


class UserNoteCreate(BaseModel):
    title: str = Field(default="New note", min_length=1, max_length=120)
    content: str = ""
    campaign_id: int | None = None


class UserNoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    content: str | None = None
    campaign_id: int | None = None


class NoteCampaignOption(BaseModel):
    id: int
    name: str


class UserNotesPageResponse(BaseModel):
    notes: list[UserNoteRead]
    campaigns: list[NoteCampaignOption]
