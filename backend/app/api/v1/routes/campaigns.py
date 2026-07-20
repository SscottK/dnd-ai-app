import json

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    AddEncounterEnemiesRequest,
    AddEncounterFromTemplateRequest,
    AddRosterRequest,
    AddRosterTeamRequest,
    FinishPartySliceRequest,
    PassCombatRequest,
    TriggerReadiedRequest,
    CampaignCreate,
    CampaignJoin,
    CampaignUpdate,
    CampaignListResponse,
    CampaignMemberRead,
    CampaignRead,
    CampaignRosterResponse,
    CampaignSessionStatus,
    CampaignSessionUpdate,
    DiceRollRequest,
    EndCombatResponse,
    EncounterPatchResponse,
    EncounterState,
    EncounterUpdate,
    AdjustMovementRequest,
    RevealCombatantRequest,
    CancelReadiedRequest,
    CombatantActionSheetResponse,
    MonsterSearchEntry,
    MonsterSearchResponse,
    UseActionRequest,
    UseActionResponse,
    InitiativeSubmitRequest,
    InitiativeSubmitResponse,
    LatestActionLogResponse,
    LatestCombatLogResponse,
    ActionRollRequest,
    ActionRollResponse,
)
from app.db.models import Campaign, CampaignMember, Character, User
from app.services.campaign_membership import (
    get_campaign_for_member_or_owner,
    get_campaign_member_for_user,
    get_joinable_character,
    get_owned_campaign,
    release_member,
)
from app.services.combat_log import (
    all_enemies_defeated,
    all_pcs_defeated,
    append_log,
    end_combat,
    latest_combat_log_id,
    latest_formatted_combat_log,
    log_hp_changes,
)
from app.services.action_log import (
    clear_action_log,
    finalize_session_action_log,
    latest_action_log_id,
    latest_formatted_action_log,
    parse_action_log,
)
from app.services.action_log_roll import ActionRollError, perform_action_roll
from app.services.play_session_notes import (
    active_logs_tab,
    active_notes_tab,
    distribute_play_session_tabs,
    new_play_session_tabs,
    parse_play_session,
    play_session_payload,
)
from app.services.team_initiative import (
    TeamInitiativeError,
    add_roster_with_team_rolls,
    advance_team_turn,
    end_party_phase,
    finish_party_slice,
    is_team_mode,
    pass_combat_to,
    set_initiative_mode,
)
from app.services.encounter_actions import (
    add_enemies_to_encounter,
    add_roster_to_encounter,
    advance_turn,
    ensure_active_combatant,
    get_member_character,
    persist_encounter,
    resolve_active_index,
    roll_initiative_for_character,
    reveal_hidden_combatant,
    sorted_combatants,
    sync_initiative_order_after_setup_change,
    upsert_pc_combatant,
)
from app.services.character_assets import portrait_download_url
from app.services.character_sheet import parse_sheet_json
from app.services.character_sheet import roster_fields_from_character, speed_from_character
from app.services.encounter_sync import (
    encounter_for_viewer,
    enrich_encounter_movement,
    enrich_encounter_pc_stats,
    enrich_encounter_portraits,
    sync_encounter_combatants_to_characters,
)
from app.services.saved_encounter_templates import (
    SavedEncounterTemplateError,
    get_template_for_user,
    template_to_read,
)
from app.services.monster_catalog import (
    apply_monster_catalog_to_combatant,
    effective_initiative_modifier,
    monster_default_initiative,
    monster_to_combat_actions,
    search_monsters,
)
from app.services.action_rules import resolve_rules_for_use
from app.services.combat_resolution import (
    is_resolved_attack,
    resolve_attack,
    resolve_attack_profile,
    resolve_self_heal,
    will_resolve_self_heal,
)
from app.services.attack_economy import use_weapon_attack
from app.services.resource_actions import spend_action_resource
from app.services.standard_combat_actions import (
    adjust_movement,
    is_extra_action_effect,
    is_standard_turn_effect,
    resolve_extra_action_effect,
    resolve_standard_combat_effect,
    skips_action_economy,
)
from app.services.readied_actions import ReadiedActionError, cancel_readied_action, trigger_readied_action
from app.services.turn_actions import ensure_turn_economy, get_active_combatant, use_combat_action
from app.services.invite_codes import generate_invite_code

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def to_campaign_read(
    campaign: Campaign,
    owner: User,
    current_user: User,
    session: SessionDep,
    *,
    my_character_name: str | None = None,
    my_character_id: int | None = None,
) -> CampaignRead:
    is_owner = campaign.owner_id == current_user.id
    member_count = None
    if is_owner and campaign.id is not None:
        member_count = len(
            session.exec(
                select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
            ).all()
        )

    return CampaignRead(
        id=campaign.id,
        name=campaign.name,
        description=campaign.description,
        owner_username=owner.username,
        is_owner=is_owner,
        invite_code=campaign.invite_code if is_owner else None,
        my_character_name=my_character_name,
        my_character_id=my_character_id,
        session_active=campaign.session_active,
        member_count=member_count,
        created_at=campaign.created_at,
    )


@router.get("", response_model=CampaignListResponse)
def list_campaigns(current_user: CurrentUser, session: SessionDep):
    owned = list(
        session.exec(select(Campaign).where(Campaign.owner_id == current_user.id)).all()
    )

    memberships = list(
        session.exec(
            select(CampaignMember).where(CampaignMember.user_id == current_user.id)
        ).all()
    )
    member_campaign_ids = [m.campaign_id for m in memberships]
    membership_by_campaign = {m.campaign_id: m for m in memberships}

    joined = []
    if member_campaign_ids:
        joined = list(
            session.exec(select(Campaign).where(Campaign.id.in_(member_campaign_ids))).all()
        )

    seen_ids: set[int] = set()
    campaigns: list[CampaignRead] = []

    for campaign in owned + joined:
        if campaign.id is None or campaign.id in seen_ids:
            continue
        seen_ids.add(campaign.id)
        owner = session.get(User, campaign.owner_id)
        if owner is None:
            continue

        my_character_name = None
        my_character_id = None
        membership = membership_by_campaign.get(campaign.id)
        if membership:
            character = session.get(Character, membership.character_id)
            if character:
                my_character_name = character.name
                my_character_id = character.id

        campaigns.append(
            to_campaign_read(
                campaign,
                owner,
                current_user,
                session,
                my_character_name=my_character_name,
                my_character_id=my_character_id,
            )
        )

    campaigns.sort(key=lambda c: c.created_at, reverse=True)
    return CampaignListResponse(campaigns=campaigns)


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign(data: CampaignCreate, current_user: CurrentUser, session: SessionDep):
    invite_code = generate_invite_code()
    while session.exec(select(Campaign).where(Campaign.invite_code == invite_code)).first():
        invite_code = generate_invite_code()

    description = (data.description or "").strip() or None
    campaign = Campaign(
        owner_id=current_user.id,
        name=data.name.strip(),
        description=description,
        invite_code=invite_code,
    )
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    return to_campaign_read(campaign, current_user, current_user, session)


@router.patch("/{campaign_id}", response_model=CampaignRead)
def update_campaign(
    campaign_id: int,
    data: CampaignUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign = get_owned_campaign(campaign_id, session)
    if campaign.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can update campaign details",
        )

    if data.description is not None:
        campaign.description = data.description.strip() or None
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    owner = session.get(User, campaign.owner_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign owner not found")

    return to_campaign_read(campaign, owner, current_user, session)


@router.post("/join", response_model=CampaignRead)
def join_campaign(data: CampaignJoin, current_user: CurrentUser, session: SessionDep):
    code = data.invite_code.strip().upper()
    campaign = session.exec(select(Campaign).where(Campaign.invite_code == code)).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code",
        )

    if campaign.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign owners do not join their own campaign as players",
        )

    existing = get_campaign_member_for_user(campaign.id, current_user.id, session)
    if existing is not None:
        owner = session.get(User, campaign.owner_id)
        character = session.get(Character, existing.character_id)
        return to_campaign_read(
            campaign,
            owner,
            current_user,
            session,
            my_character_name=character.name if character else None,
            my_character_id=character.id if character else None,
        )

    character = get_joinable_character(data.character_id, current_user, session)

    character.campaign_id = campaign.id
    session.add(character)
    session.add(
        CampaignMember(
            campaign_id=campaign.id,
            user_id=current_user.id,
            character_id=character.id,
        )
    )
    session.commit()

    owner = session.get(User, campaign.owner_id)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Campaign owner not found",
        )

    return to_campaign_read(
        campaign,
        owner,
        current_user,
        session,
        my_character_name=character.name,
        my_character_id=character.id,
    )


@router.post("/{campaign_id}/leave", status_code=status.HTTP_200_OK)
def leave_campaign(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign = get_owned_campaign(campaign_id, session)
    if campaign.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign owners cannot leave their own campaign",
        )

    member = get_campaign_member_for_user(campaign_id, current_user.id, session)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this campaign",
        )

    release_member(session, member)
    session.commit()
    return {"status": "ok", "message": "Left campaign successfully"}


@router.get("/{campaign_id}/roster", response_model=CampaignRosterResponse)
def get_campaign_roster(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)

    members = list(
        session.exec(
            select(CampaignMember).where(CampaignMember.campaign_id == campaign_id)
        ).all()
    )

    roster: list[CampaignMemberRead] = []
    for member in members:
        user = session.get(User, member.user_id)
        character = session.get(Character, member.character_id)
        if user is None or character is None or member.id is None:
            continue
        extras = roster_fields_from_character(character)
        roster.append(
            CampaignMemberRead(
                member_id=member.id,
                username=user.username,
                character_id=character.id,
                character_name=character.name,
                class_name=character.class_name,
                level=character.level,
                race=extras.get("race"),
                ac=character.ac,
                hp=character.hp,
                max_hp=character.max_hp,
                speed=speed_from_character(character),
                portrait_url=portrait_download_url(character, session),
                heroic_inspiration=extras.get("heroic_inspiration"),
                i_know_a_guy=extras.get("i_know_a_guy"),
            )
        )

    return CampaignRosterResponse(campaign_id=campaign_id, members=roster)


@router.delete("/{campaign_id}/members/{member_id}", status_code=status.HTTP_200_OK)
def kick_member(
    campaign_id: int,
    member_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign = get_owned_campaign(campaign_id, session)
    if campaign.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can remove members",
        )

    member = session.get(CampaignMember, member_id)
    if member is None or member.campaign_id != campaign_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this campaign",
        )

    release_member(session, member)
    session.commit()
    return {"status": "ok", "message": "Member removed from campaign"}


def build_session_status(
    campaign: Campaign,
    *,
    is_owner: bool,
    character_id: int | None,
    character_name: str | None,
    session: SessionDep,
) -> CampaignSessionStatus:
    play_session = parse_play_session(campaign) if campaign.session_active else {}
    tab_id = play_session.get("notes_tab_id")
    tab_title = play_session.get("notes_tab_title")
    logs_tab_id = play_session.get("logs_tab_id")
    logs_tab_title = play_session.get("logs_tab_title")
    return CampaignSessionStatus(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        session_active=campaign.session_active,
        is_owner=is_owner,
        character_id=character_id,
        character_name=character_name,
        last_combat_log_id=latest_combat_log_id(session, campaign.id),
        last_action_log_id=latest_action_log_id(session, campaign.id),
        play_session_notes_tab_id=tab_id,
        play_session_notes_tab_title=tab_title,
        play_session_logs_tab_id=logs_tab_id,
        play_session_logs_tab_title=logs_tab_title,
    )


def parse_encounter(campaign: Campaign) -> EncounterState:
    try:
        raw = json.loads(campaign.encounter_json or "{}")
        return EncounterState.model_validate(raw)
    except (json.JSONDecodeError, ValueError):
        return EncounterState()


def build_encounter_response(
    session: SessionDep,
    campaign: Campaign,
    *,
    is_owner: bool,
    fix_active: bool = False,
) -> EncounterState:
    state = enrich_encounter_pc_stats(
        session,
        enrich_encounter_movement(
            session, enrich_encounter_portraits(session, parse_encounter(campaign))
        ),
    )
    if fix_active:
        sync_initiative_order_after_setup_change(state)
    ensure_turn_economy(state)
    return encounter_for_viewer(state, is_owner=is_owner)


def _victory_response_if_needed(
    session: SessionDep,
    campaign: Campaign,
    state: EncounterState,
    *,
    is_owner: bool,
) -> EncounterPatchResponse | None:
    if not all_enemies_defeated(state):
        return None
    _cleared, combat_log_id, combat_log_text, party_updated = end_combat(
        session, campaign, state, reason="victory"
    )
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
        combat_ended=True,
        combat_log_id=combat_log_id,
        combat_log_text=combat_log_text,
        party_updated=party_updated,
        reason="victory",
    )


def _defeat_response_if_needed(
    session: SessionDep,
    campaign: Campaign,
    state: EncounterState,
    *,
    is_owner: bool,
) -> EncounterPatchResponse | None:
    if not all_pcs_defeated(state):
        return None
    _cleared, combat_log_id, combat_log_text, party_updated = end_combat(
        session, campaign, state, reason="defeat"
    )
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
        combat_ended=True,
        combat_log_id=combat_log_id,
        combat_log_text=combat_log_text,
        party_updated=party_updated,
        reason="defeat",
    )


def _combat_end_response_if_needed(
    session: SessionDep,
    campaign: Campaign,
    state: EncounterState,
    *,
    is_owner: bool,
) -> EncounterPatchResponse | None:
    victory = _victory_response_if_needed(session, campaign, state, is_owner=is_owner)
    if victory:
        return victory
    return _defeat_response_if_needed(session, campaign, state, is_owner=is_owner)


@router.get("/srd-monsters/search", response_model=MonsterSearchResponse)
def search_srd_monsters(
    q: str,
    current_user: CurrentUser,
    limit: int = 12,
):
    del current_user
    matches = search_monsters(q, limit=limit)
    return MonsterSearchResponse(
        monsters=[
            MonsterSearchEntry(
                name=monster["name"],
                cr=monster.get("cr"),
                type=monster.get("type"),
                armor_class=monster.get("armor_class"),
                hp_max=monster.get("hp_max"),
                initiative_modifier=effective_initiative_modifier(monster),
                default_initiative=monster_default_initiative(monster),
                action_count=len(monster_to_combat_actions(monster)),
            )
            for monster in matches
        ]
    )


@router.get("/{campaign_id}/action-logs/latest", response_model=LatestActionLogResponse)
def get_latest_action_log(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    latest = latest_formatted_action_log(session, campaign_id)
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No archived action log for this campaign",
        )
    action_log_id, action_log_text = latest
    return LatestActionLogResponse(
        action_log_id=action_log_id,
        action_log_text=action_log_text,
    )


@router.post("/{campaign_id}/action-log/roll", response_model=ActionRollResponse)
def roll_action_log(
    campaign_id: int,
    data: ActionRollRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, _is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    try:
        entry = perform_action_roll(session, campaign, current_user, data)
    except ActionRollError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return ActionRollResponse(entry=entry, log=parse_action_log(campaign))


@router.get("/{campaign_id}/encounter", response_model=EncounterState)
def get_encounter(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    return build_encounter_response(session, campaign, is_owner=is_owner, fix_active=True)


@router.get("/{campaign_id}/combat-logs/latest", response_model=LatestCombatLogResponse)
def get_latest_combat_log(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    latest = latest_formatted_combat_log(session, campaign_id)
    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No archived combat log for this campaign",
        )
    combat_log_id, combat_log_text = latest
    return LatestCombatLogResponse(
        combat_log_id=combat_log_id,
        combat_log_text=combat_log_text,
    )


@router.get(
    "/{campaign_id}/encounter/combatants/{combatant_id}/action-sheet",
    response_model=CombatantActionSheetResponse,
)
def get_combatant_action_sheet(
    campaign_id: int,
    combatant_id: str,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can load combatant action sheets",
        )

    state = parse_encounter(campaign)
    combatant = next((entry for entry in state.combatants if entry.id == combatant_id), None)
    if combatant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Combatant not found in this encounter",
        )
    if not combatant.character_id:
        enriched = apply_monster_catalog_to_combatant(combatant)
        return CombatantActionSheetResponse(
            sheet={
                "combat_actions": [
                    entry.model_dump(exclude_none=True) for entry in enriched.combat_actions
                ]
            }
        )

    character = session.get(Character, combatant.character_id)
    if character is None or character.campaign_id != campaign_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found for this combatant",
        )
    return CombatantActionSheetResponse(
        sheet=parse_sheet_json(
            character.sheet_json,
            class_name=character.class_name,
            level=character.level,
        )
    )


@router.patch("/{campaign_id}/encounter", response_model=EncounterPatchResponse)
def update_encounter(
    campaign_id: int,
    data: EncounterUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can update initiative",
        )

    state = parse_encounter(campaign)
    before = state.model_copy(deep=True)
    updates = data.model_dump(exclude_unset=True)
    if "round" in updates and updates["round"] is not None:
        state.round = updates["round"]
    if "active_index" in updates and updates["active_index"] is not None:
        state.active_index = updates["active_index"]
    if "active_combatant_id" in updates:
        state.active_combatant_id = updates["active_combatant_id"]
    if data.combatants is not None:
        state.combatants = [
            apply_monster_catalog_to_combatant(combatant) for combatant in data.combatants
        ]
    if data.initiative_mode is not None:
        try:
            set_initiative_mode(state, data.initiative_mode)
        except TeamInitiativeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    log_hp_changes(before, state)
    sync_encounter_combatants_to_characters(session, before, state)
    ensure_active_combatant(state)

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=True
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.post("/{campaign_id}/encounter/submit-initiative", response_model=InitiativeSubmitResponse)
def submit_initiative(
    campaign_id: int,
    data: InitiativeSubmitRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    try:
        _, character = get_member_character(session, campaign_id, current_user.id)
    except ValueError as exc:
        if str(exc) == "not_a_member":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Join this campaign with a character to submit initiative",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        ) from exc

    state = parse_encounter(campaign)
    d20_roll = None
    bonus = None

    if data.auto_roll:
        d20_roll, bonus, total = roll_initiative_for_character(character)
    elif data.initiative is not None:
        total = data.initiative
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide initiative or set auto_roll=true",
        )

    upsert_pc_combatant(state, character, total)
    if is_team_mode(state):
        from app.services.team_initiative import record_pc_initiative_roll

        combatant = next(
            (entry for entry in state.combatants if entry.character_id == character.id),
            None,
        )
        if combatant is not None:
            record_pc_initiative_roll(
                state,
                combatant.id,
                total=total,
                d20_roll=d20_roll if data.auto_roll else None,
                bonus=bonus if data.auto_roll else None,
                roller_name=character.name,
            )
    team_logged_roll = is_team_mode(state) and data.auto_roll and d20_roll is not None
    if data.auto_roll and d20_roll is not None and not team_logged_roll:
        append_log(
            state,
            f"{character.name} rolled initiative",
            kind="roll",
            actor=character.name,
            roller_name=character.name,
            dice="d20",
            result=d20_roll,
            bonus=bonus,
            total=total,
        )
    elif not data.auto_roll:
        append_log(
            state,
            f"{character.name} set initiative to {total}",
            kind="initiative",
            actor=character.name,
        )
    sync_initiative_order_after_setup_change(state)
    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return InitiativeSubmitResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
        total=total,
        d20_roll=d20_roll,
        bonus=bonus,
    )


@router.post("/{campaign_id}/encounter/next-turn", response_model=EncounterPatchResponse)
def next_encounter_turn(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    state = parse_encounter(campaign)
    ordered = sorted_combatants(state)
    if not ordered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No combatants in encounter",
        )

    if not is_owner:
        try:
            _, character = get_member_character(session, campaign_id, current_user.id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the active player or DM can end a turn",
            ) from exc
        active = ordered[resolve_active_index(state)]
        if active.character_id != character.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="It is not your turn",
            )

    if is_team_mode(state):
        if state.team and state.team.party_phase_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use pass combat during a party turn.",
            )
        try:
            advance_team_turn(state)
        except TeamInitiativeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
    else:
        from app.services.death_saves import is_dying_pc, roll_death_save

        ordered = sorted_combatants(state)
        current = ordered[resolve_active_index(state)] if ordered else None
        if current and is_dying_pc(current):
            economy = state.turn_economy.get(current.id)
            if economy is None or not economy.death_save_rolled:
                roll_death_save(state, current)
        advance_turn(state)
        ordered_after = sorted_combatants(state)
        active_after = ordered_after[resolve_active_index(state)] if ordered_after else None
        if active_after:
            append_log(
                state,
                f"Round {state.round} — {active_after.name}'s turn",
                kind="turn",
                actor=active_after.name,
            )
        elif current:
            append_log(
                state,
                f"Turn ended ({current.name})",
                kind="turn",
                actor=current.name,
            )

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=is_owner
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
    )


@router.post("/{campaign_id}/encounter/use-action", response_model=UseActionResponse)
def use_encounter_action(
    campaign_id: int,
    data: UseActionRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    state = parse_encounter(campaign)

    if is_owner:
        if not data.combatant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Specify combatant_id when acting as DM",
            )
        actor = next(
            (combatant for combatant in state.combatants if combatant.id == data.combatant_id),
            None,
        )
        if actor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Combatant not found in this encounter",
            )
    else:
        try:
            _, character = get_member_character(session, campaign_id, current_user.id)
        except ValueError as exc:
            if str(exc) == "not_a_member":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Join this campaign with a character to take actions",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found",
            ) from exc

        actor = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if actor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not in the current encounter",
            )
        if data.combatant_id and data.combatant_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only take actions for your own character",
            )

    before = state.model_copy(deep=True)
    action_messages: list[str] = []

    resolved_type, resolved_targeting, rules_catalog = resolve_rules_for_use(
        action_id=data.action_id,
        action_name=data.action_name,
        action_type=data.action_type,
        targeting=data.targeting,
        detail=data.detail,
    )
    resolved_data = data.model_copy(
        update={"action_type": resolved_type, "targeting": resolved_targeting}
    )

    from app.services.death_saves import is_death_save_request, is_dying_pc, roll_death_save
    from app.services.combat_resolution import validate_healing_targets

    if is_death_save_request(
        action_id=resolved_data.action_id,
        action_name=resolved_data.action_name,
    ):
        if not is_dying_pc(actor):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only a dying character can roll a death saving throw.",
            )
        try:
            action_messages = roll_death_save(state, actor)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        sync_encounter_combatants_to_characters(session, before, state)
        end_response = _combat_end_response_if_needed(
            session, campaign, state, is_owner=is_owner
        )
        if end_response:
            return UseActionResponse(
                encounter=end_response.encounter,
                action_messages=action_messages,
                combat_ended=True,
                combat_log_id=end_response.combat_log_id,
                combat_log_text=end_response.combat_log_text,
                party_updated=end_response.party_updated,
                reason=end_response.reason,
            )
        persist_encounter(session, campaign, state)
        session.refresh(campaign)
        return UseActionResponse(
            encounter=build_encounter_response(session, campaign, is_owner=is_owner),
            action_messages=action_messages,
        )

    if is_dying_pc(actor):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dying characters can only roll a death saving throw.",
        )

    try:
        validate_healing_targets(state, actor, resolved_data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        from app.services.combat_save_effects import looks_like_save_effect, resolve_save_effect

        actor_action = next(
            (
                entry
                for entry in actor.combat_actions
                if entry.id == resolved_data.action_id
                or entry.name.casefold() == resolved_data.action_name.casefold()
            ),
            None,
        )
        save_text = " ".join(
            part
            for part in (
                resolved_data.detail,
                actor_action.description if actor_action else None,
                resolved_data.action_name,
            )
            if part
        )
        will_resolve_save = bool(
            resolved_data.target_ids
            and looks_like_save_effect(
                action_name=resolved_data.action_name,
                detail=save_text,
            )
        )

        profile = resolve_attack_profile(
            session,
            campaign_id,
            actor,
            action_id=resolved_data.action_id,
            action_name=resolved_data.action_name,
            detail=resolved_data.detail,
        )
        will_resolve_attack = bool(
            resolved_data.target_ids
            and not will_resolve_save
            and is_resolved_attack(
                action_id=resolved_data.action_id,
                action_name=resolved_data.action_name,
                targeting=resolved_data.targeting,
                profile=profile,
            )
        )
        standard_effect = is_standard_turn_effect(
            resolved_data.action_id, resolved_data.action_name
        )
        extra_action_effect = is_extra_action_effect(resolved_data.action_name)
        self_heal_effect = will_resolve_self_heal(resolved_data)
        skip_economy = skips_action_economy(resolved_data.action_name)

        from app.services.resource_actions import ensure_action_resource_available

        ensure_action_resource_available(
            session,
            campaign_id,
            actor=actor,
            data=resolved_data,
        )

        log_before = len(state.combat_log)
        if not skip_economy:
            if will_resolve_attack and len(resolved_data.target_ids or []) <= 1:
                use_weapon_attack(
                    state,
                    session,
                    campaign_id,
                    actor=actor,
                    data=resolved_data,
                )
            elif not will_resolve_attack:
                use_combat_action(
                    state,
                    actor=actor,
                    action_id=resolved_data.action_id,
                    action_name=resolved_data.action_name,
                    action_type=resolved_data.action_type,
                    targeting=resolved_data.targeting,
                    target_ids=resolved_data.target_ids,
                    detail=resolved_data.detail,
                    log_usage=not standard_effect and not self_heal_effect,
                )
        if will_resolve_save:
            try:
                action_messages = resolve_save_effect(
                    state,
                    actor=actor,
                    data=resolved_data,
                    description=actor_action.description if actor_action else None,
                    session=session,
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                ) from exc
        elif will_resolve_attack:
            try:
                action_messages = resolve_attack(
                    session,
                    campaign_id,
                    state,
                    actor=actor,
                    data=resolved_data,
                )
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                ) from exc
        elif extra_action_effect:
            action_messages = resolve_extra_action_effect(
                state,
                actor=actor,
                data=resolved_data,
            )
        elif standard_effect:
            action_messages = resolve_standard_combat_effect(
                state,
                actor=actor,
                data=resolved_data,
                session=session,
                campaign_id=campaign_id,
            )
        else:
            action_messages = resolve_self_heal(
                session,
                campaign_id,
                state,
                actor=actor,
                data=resolved_data,
            )
            if not action_messages:
                action_messages = [
                    entry.message for entry in state.combat_log[log_before:] if entry.message
                ]
            if not action_messages:
                action_messages = [f"{actor.name} uses {resolved_data.action_name}."]

        resource_messages = spend_action_resource(
            session,
            campaign_id,
            actor=actor,
            data=resolved_data,
        )
        for message in resource_messages:
            append_log(state, message, kind="action", actor=actor.name)
        if resource_messages:
            action_messages = [*resource_messages, *action_messages]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    sync_encounter_combatants_to_characters(session, before, state)
    ensure_active_combatant(state)

    victory = _combat_end_response_if_needed(session, campaign, state, is_owner=is_owner)
    if victory:
        return UseActionResponse(
            encounter=victory.encounter,
            action_messages=action_messages,
            combat_ended=True,
            combat_log_id=victory.combat_log_id,
            combat_log_text=victory.combat_log_text,
            party_updated=victory.party_updated,
            reason=victory.reason,
        )

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return UseActionResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
        action_messages=action_messages,
    )


@router.post("/{campaign_id}/encounter/adjust-movement", response_model=EncounterState)
def adjust_encounter_movement(
    campaign_id: int,
    data: AdjustMovementRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    state = parse_encounter(campaign)

    if is_owner:
        if not data.combatant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Specify combatant_id when adjusting movement as DM",
            )
        actor = next(
            (combatant for combatant in state.combatants if combatant.id == data.combatant_id),
            None,
        )
        if actor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Combatant not found in this encounter",
            )
    else:
        try:
            _, character = get_member_character(session, campaign_id, current_user.id)
        except ValueError as exc:
            if str(exc) == "not_a_member":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Join this campaign with a character to adjust movement",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found",
            ) from exc

        actor = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if actor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="You are not in the current encounter",
            )
        if data.combatant_id and data.combatant_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only adjust movement for your own character",
            )

        active = get_active_combatant(state)
        if active is None or active.id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You can only adjust movement on your turn",
            )

    ensure_turn_economy(state)
    adjust_movement(state, actor=actor, delta=data.delta)
    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return build_encounter_response(session, campaign, is_owner=is_owner)


@router.post("/{campaign_id}/encounter/trigger-readied", response_model=EncounterPatchResponse)
def trigger_readied(
    campaign_id: int,
    data: TriggerReadiedRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can trigger readied actions",
        )

    state = parse_encounter(campaign)
    try:
        trigger_readied_action(
            state,
            combatant_id=data.combatant_id,
            note=data.note,
        )
    except ReadiedActionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=True
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.post("/{campaign_id}/encounter/cancel-readied", response_model=EncounterPatchResponse)
def cancel_readied(
    campaign_id: int,
    data: CancelReadiedRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can cancel readied actions",
        )

    state = parse_encounter(campaign)
    try:
        cancel_readied_action(state, combatant_id=data.combatant_id)
    except ReadiedActionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.post("/{campaign_id}/encounter/roll", response_model=EncounterState)
def log_dice_roll(
    campaign_id: int,
    data: DiceRollRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    roller_name = current_user.username
    state = parse_encounter(campaign)
    if not state.combatants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat",
        )

    append_log(
        state,
        data.message or f"{roller_name} rolled {data.dice}",
        kind="roll",
        actor=roller_name,
        roller_name=roller_name,
        dice=data.dice.lower(),
        result=data.result,
    )
    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return build_encounter_response(session, campaign, is_owner=is_owner)


@router.post("/{campaign_id}/encounter/end-combat", response_model=EndCombatResponse)
def end_combat_tracker(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can end combat",
        )

    state = parse_encounter(campaign)
    if not state.combatants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No combat to end",
        )

    cleared, combat_log_id, combat_log_text, party_updated = end_combat(
        session, campaign, state, reason="dm"
    )
    return EndCombatResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
        combat_log_id=combat_log_id,
        combat_log_text=combat_log_text,
        party_updated=party_updated,
        reason="dm",
    )


@router.post("/{campaign_id}/encounter/pass-combat", response_model=EncounterPatchResponse)
def pass_combat(
    campaign_id: int,
    data: PassCombatRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    state = parse_encounter(campaign)

    if not is_team_mode(state):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pass combat is only available in team initiative mode.",
        )

    passer_id: str | None = None
    if is_owner:
        passer_id = data.combatant_id or state.active_combatant_id
    else:
        try:
            _, character = get_member_character(session, campaign_id, current_user.id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Join this campaign with a character to pass combat",
            ) from exc
        actor = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if actor is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not in this encounter",
            )
        if state.active_combatant_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="It is not your turn",
            )
        passer_id = actor.id

    try:
        pass_combat_to(
            state,
            target_combatant_id=data.target_combatant_id,
            passer_combatant_id=passer_id,
        )
    except TeamInitiativeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=is_owner
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
    )


@router.post("/{campaign_id}/encounter/finish-party-slice", response_model=EncounterPatchResponse)
def finish_party_turn_slice(
    campaign_id: int,
    current_user: CurrentUser,
    session: SessionDep,
    data: FinishPartySliceRequest = FinishPartySliceRequest(),
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    state = parse_encounter(campaign)

    combatant_id: str | None = None
    if is_owner:
        combatant_id = data.combatant_id or state.active_combatant_id
    else:
        try:
            _, character = get_member_character(session, campaign_id, current_user.id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Join this campaign with a character to end your turn",
            ) from exc
        actor = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if actor is None or state.active_combatant_id != actor.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="It is not your turn",
            )
        combatant_id = actor.id

    try:
        finish_party_slice(state, combatant_id=combatant_id)
    except TeamInitiativeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=is_owner
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=is_owner),
    )


@router.post("/{campaign_id}/encounter/end-party-turn", response_model=EncounterPatchResponse)
def end_party_turn(
    campaign_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can end a party turn early",
        )

    state = parse_encounter(campaign)
    if not is_team_mode(state) or state.team is None or not state.team.party_phase_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active party turn to end.",
        )

    if state.active_combatant_id and state.active_combatant_id not in state.team.completed_this_phase:
        state.team.completed_this_phase.append(state.active_combatant_id)

    end_party_phase(state, reason="dm_early")
    append_log(state, "DM ended the party turn early.", kind="event", actor="DM")

    end_response = _combat_end_response_if_needed(
        session, campaign, state, is_owner=True
    )
    if end_response:
        return end_response

    persist_encounter(session, campaign, state)
    session.refresh(campaign)
    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.post("/{campaign_id}/encounter/add-roster-team", response_model=EncounterState)
def add_roster_team_to_tracker(
    campaign_id: int,
    data: AddRosterTeamRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can add roster to the tracker",
        )
    try:
        add_roster_with_team_rolls(
            session,
            campaign,
            roll_character_ids=data.roll_character_ids,
        )
    except TeamInitiativeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    session.refresh(campaign)
    return build_encounter_response(session, campaign, is_owner=True)


@router.post("/{campaign_id}/encounter/add-roster", response_model=EncounterState)
def add_roster_to_tracker(
    campaign_id: int,
    current_user: CurrentUser,
    session: SessionDep,
    data: AddRosterRequest = AddRosterRequest(),
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can add roster to the tracker",
        )
    auto_roll = bool(data.auto_roll)
    add_roster_to_encounter(session, campaign, auto_roll=auto_roll)
    session.refresh(campaign)
    return build_encounter_response(session, campaign, is_owner=True)


@router.post("/{campaign_id}/encounter/add-enemies", response_model=EncounterState)
def add_enemies_to_tracker(
    campaign_id: int,
    data: AddEncounterEnemiesRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can add enemies to the tracker",
        )
    add_enemies_to_encounter(session, campaign, data.enemies)
    session.refresh(campaign)
    return build_encounter_response(session, campaign, is_owner=True)


@router.post("/{campaign_id}/encounter/reveal-combatant", response_model=EncounterPatchResponse)
def reveal_combatant_to_players(
    campaign_id: int,
    data: RevealCombatantRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can reveal hidden enemies",
        )

    state = parse_encounter(campaign)
    try:
        reveal_hidden_combatant(state, data.combatant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    ensure_active_combatant(state)
    persist_encounter(session, campaign, state)
    session.refresh(campaign)

    end_response = _combat_end_response_if_needed(session, campaign, state, is_owner=True)
    if end_response:
        return end_response

    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.post("/{campaign_id}/encounter/add-from-template", response_model=EncounterPatchResponse)
def add_encounter_from_template(
    campaign_id: int,
    data: AddEncounterFromTemplateRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can add saved encounters to the tracker",
        )

    try:
        record = get_template_for_user(session, current_user.id, data.template_id)
        monsters = template_to_read(record).monsters
    except SavedEncounterTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    add_enemies_to_encounter(session, campaign, monsters)
    session.refresh(campaign)

    state = parse_encounter(campaign)
    end_response = _combat_end_response_if_needed(session, campaign, state, is_owner=True)
    if end_response:
        return end_response

    return EncounterPatchResponse(
        encounter=build_encounter_response(session, campaign, is_owner=True),
    )


@router.get("/{campaign_id}/session", response_model=CampaignSessionStatus)
def get_session_status(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)

    character_id = None
    character_name = None
    membership = get_campaign_member_for_user(campaign_id, current_user.id, session)
    if membership:
        character = session.get(Character, membership.character_id)
        if character:
            character_id = character.id
            character_name = character.name

    return build_session_status(
        campaign,
        is_owner=is_owner,
        character_id=character_id,
        character_name=character_name,
        session=session,
    )


@router.patch("/{campaign_id}/session", response_model=CampaignSessionStatus)
def update_session_status(
    campaign_id: int,
    data: CampaignSessionUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can start or end a session",
        )

    was_active = campaign.session_active
    campaign.session_active = data.session_active

    if data.session_active and not was_active:
        notes_id, notes_title, logs_id, logs_title = new_play_session_tabs()
        campaign.play_session_json = json.dumps(
            play_session_payload(notes_id, notes_title, logs_id, logs_title)
        )
        clear_action_log(campaign)
        session.add(campaign)
        session.commit()
        distribute_play_session_tabs(
            session, campaign, notes_id, notes_title, logs_id, logs_title
        )
        session.refresh(campaign)
    elif not data.session_active and was_active:
        tab_id, tab_title = active_notes_tab(campaign)
        action_log_id, action_log_text, _party_updated = finalize_session_action_log(
            session, campaign
        )
        campaign.play_session_json = "{}"
        session.add(campaign)
        session.commit()
        session.refresh(campaign)
        status = build_session_status(
            campaign,
            is_owner=True,
            character_id=None,
            character_name=None,
            session=session,
        )
        return status.model_copy(
            update={
                "action_log_text": action_log_text or None,
                "last_action_log_id": action_log_id,
                "play_session_notes_tab_id": tab_id,
                "play_session_notes_tab_title": tab_title,
            }
        )
    else:
        session.add(campaign)
        session.commit()
        session.refresh(campaign)

    return build_session_status(
        campaign,
        is_owner=True,
        character_id=None,
        character_name=None,
        session=session,
    )
