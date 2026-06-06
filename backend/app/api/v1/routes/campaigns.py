import json

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    CampaignCreate,
    CampaignJoin,
    CampaignListResponse,
    CampaignMemberRead,
    CampaignRead,
    CampaignRosterResponse,
    CampaignSessionStatus,
    CampaignSessionUpdate,
    EncounterState,
    EncounterUpdate,
    InitiativeSubmitRequest,
    InitiativeSubmitResponse,
)
from app.db.models import Campaign, CampaignMember, Character, User
from app.services.campaign_membership import (
    get_campaign_for_member_or_owner,
    get_campaign_member_for_user,
    get_joinable_character,
    get_owned_campaign,
    release_member,
)
from app.services.encounter_actions import (
    add_roster_to_encounter,
    advance_turn,
    get_member_character,
    persist_encounter,
    resolve_active_index,
    roll_initiative_for_character,
    sorted_combatants,
    upsert_pc_combatant,
)
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

    campaign = Campaign(
        owner_id=current_user.id,
        name=data.name.strip(),
        invite_code=invite_code,
    )
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    return to_campaign_read(campaign, current_user, current_user, session)


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
    campaign = get_owned_campaign(campaign_id, session)
    if campaign.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can view the roster",
        )

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
        roster.append(
            CampaignMemberRead(
                member_id=member.id,
                username=user.username,
                character_id=character.id,
                character_name=character.name,
                class_name=character.class_name,
                level=character.level,
                ac=character.ac,
                hp=character.hp,
                max_hp=character.max_hp,
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


def parse_encounter(campaign: Campaign) -> EncounterState:
    try:
        raw = json.loads(campaign.encounter_json or "{}")
        return EncounterState.model_validate(raw)
    except (json.JSONDecodeError, ValueError):
        return EncounterState()


@router.get("/{campaign_id}/encounter", response_model=EncounterState)
def get_encounter(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, _ = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    return parse_encounter(campaign)


@router.patch("/{campaign_id}/encounter", response_model=EncounterState)
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
    updates = data.model_dump(exclude_unset=True)
    if "round" in updates and updates["round"] is not None:
        state.round = updates["round"]
    if "active_index" in updates and updates["active_index"] is not None:
        state.active_index = updates["active_index"]
    if "active_combatant_id" in updates:
        state.active_combatant_id = updates["active_combatant_id"]
    if "combatants" in updates and updates["combatants"] is not None:
        state.combatants = updates["combatants"]

    campaign.encounter_json = state.model_dump_json()
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return parse_encounter(campaign)


@router.post("/{campaign_id}/encounter/submit-initiative", response_model=InitiativeSubmitResponse)
def submit_initiative(
    campaign_id: int,
    data: InitiativeSubmitRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    campaign, _ = get_campaign_for_member_or_owner(campaign_id, current_user, session)
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
    state = persist_encounter(session, campaign, state)
    return InitiativeSubmitResponse(
        encounter=state,
        total=total,
        d20_roll=d20_roll,
        bonus=bonus,
    )


@router.post("/{campaign_id}/encounter/next-turn", response_model=EncounterState)
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

    advance_turn(state)
    return persist_encounter(session, campaign, state)


@router.post("/{campaign_id}/encounter/add-roster", response_model=EncounterState)
def add_roster_to_tracker(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    campaign, is_owner = get_campaign_for_member_or_owner(campaign_id, current_user, session)
    if not is_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign owner can add roster to the tracker",
        )
    return add_roster_to_encounter(session, campaign)


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

    return CampaignSessionStatus(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        session_active=campaign.session_active,
        is_owner=is_owner,
        character_id=character_id,
        character_name=character_name,
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

    campaign.session_active = data.session_active
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    return CampaignSessionStatus(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        session_active=campaign.session_active,
        is_owner=True,
        character_id=None,
        character_name=None,
    )
