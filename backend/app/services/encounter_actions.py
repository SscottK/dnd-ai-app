import json
import random
import uuid

from sqlmodel import Session, select

from app.api.schemas import EncounterCombatant, EncounterState
from app.db.models import Campaign, CampaignMember, Character
from app.services.encounter_sync import parse_encounter


def ability_modifier(score: int | None) -> int:
    if score is None:
        return 0
    return (int(score) - 10) // 2


def initiative_bonus_from_character(character: Character) -> int:
    try:
        sheet = json.loads(character.sheet_json or "{}")
    except (json.JSONDecodeError, TypeError, ValueError):
        sheet = {}
    bonus = sheet.get("initiative_bonus")
    if bonus is not None:
        return int(bonus)
    abilities = sheet.get("abilities") or {}
    return ability_modifier(abilities.get("dex"))


def new_combatant_id() -> str:
    return f"c-{uuid.uuid4().hex[:12]}"


def sorted_combatants(state: EncounterState) -> list[EncounterCombatant]:
    return sorted(state.combatants, key=lambda combatant: combatant.initiative, reverse=True)


def resolve_active_index(state: EncounterState) -> int:
    ordered = sorted_combatants(state)
    if not ordered:
        return 0
    if state.active_combatant_id:
        for index, combatant in enumerate(ordered):
            if combatant.id == state.active_combatant_id:
                return index
    return min(state.active_index, len(ordered) - 1)


def advance_turn(state: EncounterState) -> None:
    ordered = sorted_combatants(state)
    if not ordered:
        return
    current_index = resolve_active_index(state)
    next_index = (current_index + 1) % len(ordered)
    if next_index == 0:
        state.round += 1
    state.active_index = next_index
    state.active_combatant_id = ordered[next_index].id


def upsert_pc_combatant(state: EncounterState, character: Character, initiative: int) -> None:
    for combatant in state.combatants:
        if combatant.character_id == character.id:
            combatant.initiative = initiative
            combatant.name = character.name
            combatant.is_pc = True
            combatant.hp = character.hp
            combatant.max_hp = character.max_hp
            combatant.ac = character.ac
            return

    state.combatants.append(
        EncounterCombatant(
            id=new_combatant_id(),
            name=character.name,
            initiative=initiative,
            is_pc=True,
            character_id=character.id,
            hp=character.hp,
            max_hp=character.max_hp,
            ac=character.ac,
            conditions="",
        )
    )


def get_member_character(
    session: Session, campaign_id: int, user_id: int
) -> tuple[CampaignMember, Character]:
    membership = session.exec(
        select(CampaignMember).where(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == user_id,
        )
    ).first()
    if membership is None:
        raise ValueError("not_a_member")
    character = session.get(Character, membership.character_id)
    if character is None:
        raise ValueError("character_missing")
    return membership, character


def persist_encounter(session: Session, campaign: Campaign, state: EncounterState) -> EncounterState:
    campaign.encounter_json = state.model_dump_json()
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return parse_encounter(campaign)


def roll_initiative_for_character(character: Character) -> tuple[int, int, int]:
    bonus = initiative_bonus_from_character(character)
    d20 = random.randint(1, 20)
    return d20, bonus, d20 + bonus


def add_roster_to_encounter(session: Session, campaign: Campaign) -> EncounterState:
    state = parse_encounter(campaign)
    members = session.exec(
        select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
    ).all()
    for member in members:
        character = session.get(Character, member.character_id)
        if character is None:
            continue
        existing = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if existing is None:
            upsert_pc_combatant(state, character, initiative=0)
    return persist_encounter(session, campaign, state)
