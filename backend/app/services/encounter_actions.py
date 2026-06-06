import json
import random
import uuid
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.api.schemas import CombatLogEntry, EncounterCombatant, EncounterState
from app.db.models import Campaign, CampaignMember, Character
from app.services.conditions import sanitize_conditions_list
from app.services.encounter_sync import parse_encounter
from app.services.monster_catalog import apply_monster_catalog_to_combatant


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


def _append_combat_log(state: EncounterState, message: str, *, kind: str = "event", **fields) -> None:
    state.combat_log.append(
        CombatLogEntry(
            at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            message=message,
            kind=kind,
            **{key: value for key, value in fields.items() if value is not None},
        )
    )


def is_enemy(combatant: EncounterCombatant) -> bool:
    return not combatant.is_pc and not combatant.is_ally


def is_defeated_enemy(combatant: EncounterCombatant) -> bool:
    """Enemies at 0 HP are out of the fight — no death saves, revival restores initiative slot."""
    return is_enemy(combatant) and combatant.hp is not None and combatant.hp <= 0


def can_take_turn(combatant: EncounterCombatant) -> bool:
    return not is_defeated_enemy(combatant)


def sorted_combatants(state: EncounterState) -> list[EncounterCombatant]:
    """Combatants eligible for turns, highest initiative first."""
    living = [combatant for combatant in state.combatants if can_take_turn(combatant)]
    return sorted(living, key=lambda combatant: combatant.initiative, reverse=True)


def sorted_combatants_for_display(state: EncounterState) -> list[EncounterCombatant]:
    """Tracker order: living combatants by initiative, defeated enemies grayed at the end."""
    living = [combatant for combatant in state.combatants if can_take_turn(combatant)]
    defeated = [combatant for combatant in state.combatants if is_defeated_enemy(combatant)]
    key = lambda combatant: combatant.initiative
    return sorted(living, key=key, reverse=True) + sorted(defeated, key=key, reverse=True)


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
    from app.services.turn_actions import begin_turn

    begin_turn(state, ordered[next_index].id)


def ensure_active_combatant(state: EncounterState) -> bool:
    """Point active turn at a living combatant when missing or stale. Returns True if state changed."""
    from app.services.turn_actions import begin_turn, ensure_turn_economy

    ordered = sorted_combatants(state)
    if not ordered:
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            return True
        return False

    if state.active_combatant_id:
        for index, combatant in enumerate(ordered):
            if combatant.id == state.active_combatant_id:
                state.active_index = index
                ensure_turn_economy(state)
                return False

    state.active_combatant_id = ordered[0].id
    state.active_index = 0
    begin_turn(state, ordered[0].id)
    return True


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
            conditions=[],
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


def add_enemies_to_encounter(
    session: Session, campaign: Campaign, enemies: list
) -> EncounterState:
    state = parse_encounter(campaign)
    for enemy in enemies:
        count = max(1, min(int(getattr(enemy, "count", 1) or 1), 12))
        base_name = getattr(enemy, "name", "Creature")
        for index in range(count):
            label = base_name if count == 1 else f"{base_name} {index + 1}"
            raw_actions = getattr(enemy, "combat_actions", None) or []
            combatant = EncounterCombatant(
                id=new_combatant_id(),
                name=label,
                initiative=int(getattr(enemy, "initiative", 0) or 0),
                is_pc=False,
                is_ally=False,
                character_id=None,
                hp=getattr(enemy, "hp", None),
                max_hp=getattr(enemy, "max_hp", None) or getattr(enemy, "hp", None),
                ac=getattr(enemy, "ac", None),
                conditions=sanitize_conditions_list(getattr(enemy, "conditions", None)),
                combat_actions=list(raw_actions),
            )
            state.combatants.append(apply_monster_catalog_to_combatant(combatant))
    return persist_encounter(session, campaign, state)


def add_roster_to_encounter(
    session: Session, campaign: Campaign, *, auto_roll: bool = False
) -> EncounterState:
    state = parse_encounter(campaign)
    members = session.exec(
        select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
    ).all()
    for member in members:
        character = session.get(Character, member.character_id)
        if character is None:
            continue
        if auto_roll:
            d20_roll, bonus, total = roll_initiative_for_character(character)
            upsert_pc_combatant(state, character, total)
            _append_combat_log(
                state,
                f"{character.name} initiative rolled by DM",
                kind="roll",
                actor=character.name,
                roller_name="DM",
                dice="d20",
                result=d20_roll,
                bonus=bonus,
                total=total,
            )
            continue

        existing = next(
            (combatant for combatant in state.combatants if combatant.character_id == character.id),
            None,
        )
        if existing is None:
            upsert_pc_combatant(state, character, initiative=0)
    return persist_encounter(session, campaign, state)
