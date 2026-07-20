import json
import random
import uuid
from sqlmodel import Session, select

from app.api.schemas import EncounterCombatant, EncounterState
from app.db.models import Campaign, CampaignMember, Character
from app.services.conditions import sanitize_conditions_list
from app.services.encounter_sync import parse_encounter
from app.services.character_sheet import speed_from_character
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
    from app.services.character_sheet import computed_initiative_bonus

    return computed_initiative_bonus(sheet)

def new_combatant_id() -> str:
    return f"c-{uuid.uuid4().hex[:12]}"


def _append_combat_log(state: EncounterState, message: str, *, kind: str = "event", **fields) -> None:
    from app.services.combat_log import append_log

    append_log(state, message, kind=kind, **fields)


def is_enemy(combatant: EncounterCombatant) -> bool:
    return not combatant.is_pc and not combatant.is_ally


def is_defeated_enemy(combatant: EncounterCombatant) -> bool:
    """Enemies at 0 HP are out of the fight — no death saves, revival restores initiative slot."""
    return is_enemy(combatant) and combatant.hp is not None and combatant.hp <= 0


def can_take_turn(combatant: EncounterCombatant) -> bool:
    if combatant.hidden_from_players:
        return False
    return not is_defeated_enemy(combatant)


def sorted_combatants(state: EncounterState) -> list[EncounterCombatant]:
    """Combatants eligible for turns, highest initiative first."""
    living = [combatant for combatant in state.combatants if can_take_turn(combatant)]
    return sorted(living, key=lambda combatant: (-combatant.initiative, combatant.id))


def pcs_awaiting_initiative(state: EncounterState) -> list[EncounterCombatant]:
    """Roster PCs still at initiative 0 during pre-combat setup."""
    return [
        combatant
        for combatant in state.combatants
        if combatant.is_pc and can_take_turn(combatant) and combatant.initiative == 0
    ]


def sorted_combatants_for_display(state: EncounterState) -> list[EncounterCombatant]:
    """Tracker order: living combatants by initiative, defeated enemies grayed at the end."""
    living = [combatant for combatant in state.combatants if can_take_turn(combatant)]
    defeated = [combatant for combatant in state.combatants if is_defeated_enemy(combatant)]
    key = lambda combatant: combatant.initiative
    return sorted(living, key=key, reverse=True) + sorted(defeated, key=key, reverse=True)


def _initiative_search_order(state: EncounterState, *, after_combatant_id: str | None) -> list[EncounterCombatant]:
    """Living combatants in initiative order, starting after a reference id (wraps)."""
    ordered = sorted_combatants(state)
    if not ordered:
        return []
    if not after_combatant_id:
        return ordered

    all_sorted = sorted(state.combatants, key=lambda combatant: combatant.initiative, reverse=True)
    old_idx = next(
        (index for index, combatant in enumerate(all_sorted) if combatant.id == after_combatant_id),
        -1,
    )
    if old_idx < 0:
        return ordered

    seen: set[str] = set()
    rotated: list[EncounterCombatant] = []
    for candidate in all_sorted[old_idx + 1 :] + all_sorted[:old_idx]:
        if not can_take_turn(candidate) or candidate.id in seen:
            continue
        seen.add(candidate.id)
        rotated.append(candidate)
    return rotated or ordered


def resolve_active_index(state: EncounterState) -> int:
    ordered = sorted_combatants(state)
    if not ordered:
        return 0
    if state.active_combatant_id:
        for index, combatant in enumerate(ordered):
            if combatant.id == state.active_combatant_id:
                return index
        next_candidates = _initiative_search_order(
            state, after_combatant_id=state.active_combatant_id
        )
        if next_candidates:
            next_id = next_candidates[0].id
            for index, combatant in enumerate(ordered):
                if combatant.id == next_id:
                    return index
    return min(state.active_index, len(ordered) - 1)


def advance_turn(state: EncounterState) -> None:
    from app.services.turn_actions import begin_turn

    ordered = sorted_combatants(state)
    if not ordered:
        return

    if state.active_combatant_id:
        active = next(
            (combatant for combatant in state.combatants if combatant.id == state.active_combatant_id),
            None,
        )
        if active is None or not can_take_turn(active):
            next_candidates = _initiative_search_order(
                state, after_combatant_id=state.active_combatant_id
            )
            if next_candidates:
                for index, combatant in enumerate(ordered):
                    if combatant.id == next_candidates[0].id:
                        state.active_combatant_id = combatant.id
                        state.active_index = index
                        begin_turn(state, combatant.id)
                        return

    current_index = resolve_active_index(state)
    next_index = (current_index + 1) % len(ordered)
    if next_index == 0:
        state.round += 1
    state.active_index = next_index
    state.active_combatant_id = ordered[next_index].id
    begin_turn(state, ordered[next_index].id)


def reset_active_to_top_of_initiative(state: EncounterState) -> bool:
    """Set the active turn to the highest-initiative living combatant."""
    from app.services.turn_actions import begin_turn, ensure_turn_economy

    if pcs_awaiting_initiative(state):
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            state.active_index = 0
            return True
        return False

    ordered = sorted_combatants(state)
    if not ordered:
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            state.active_index = 0
            return True
        return False

    top = ordered[0]
    if state.active_combatant_id == top.id:
        state.active_index = 0
        ensure_turn_economy(state)
        return False

    state.active_combatant_id = top.id
    state.active_index = 0
    begin_turn(state, top.id)
    return True


def combat_has_started(state: EncounterState) -> bool:
    if state.round > 1:
        return True
    return any(entry.kind == "turn" for entry in state.combat_log)


def sync_initiative_order_after_setup_change(state: EncounterState) -> bool:
    """Keep active turn at the top of order while assembling initiative; preserve mid-combat."""
    from app.services.team_initiative import activate_current_team_slot, is_team_mode, refresh_turn_slots

    if combat_has_started(state):
        return reconcile_active_combatant(state, advance_past_defeated=False)
    if is_team_mode(state):
        refresh_turn_slots(state)
        if activate_current_team_slot(state):
            return True
        return reset_active_to_top_of_initiative(state)
    return reset_active_to_top_of_initiative(state)


def _reconcile_active_team(state: EncounterState, *, advance_past_defeated: bool) -> bool:
    """Align team-mode active combatant with the current turn slot without rogue turn jumps."""
    from app.services.team_initiative import (
        PARTY_SLOT,
        advance_team_turn,
        ensure_team_state,
        refresh_turn_slots,
        start_party_phase,
    )
    from app.services.turn_actions import begin_turn, ensure_turn_economy

    team = ensure_team_state(state)
    refresh_turn_slots(state)

    if team.party_phase_active:
        if state.active_combatant_id:
            active = next(
                (combatant for combatant in state.combatants if combatant.id == state.active_combatant_id),
                None,
            )
            if active and can_take_turn(active):
                ensure_turn_economy(state)
                return False
        if not state.active_combatant_id:
            return start_party_phase(state)
        return False

    if not team.turn_slots:
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            return True
        return False

    expected_slot = team.turn_slots[team.turn_slot_index]
    if expected_slot == PARTY_SLOT:
        return start_party_phase(state)

    active = (
        next(
            (combatant for combatant in state.combatants if combatant.id == state.active_combatant_id),
            None,
        )
        if state.active_combatant_id
        else None
    )

    if state.active_combatant_id == expected_slot:
        if active and can_take_turn(active):
            ensure_turn_economy(state)
            return False
        if advance_past_defeated and active and not can_take_turn(active):
            advance_team_turn(state)
            return True
        return False

    if not advance_past_defeated:
        return False

    target = next((combatant for combatant in state.combatants if combatant.id == expected_slot), None)
    if target and can_take_turn(target):
        state.active_combatant_id = expected_slot
        begin_turn(state, expected_slot)
        return True
    return False


def _reconcile_active_individual(state: EncounterState, *, advance_past_defeated: bool) -> bool:
    from app.services.turn_actions import begin_turn, ensure_turn_economy

    ordered = sorted_combatants(state)
    if not ordered:
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            state.active_index = 0
            return True
        return False

    if state.active_combatant_id:
        active = next(
            (combatant for combatant in state.combatants if combatant.id == state.active_combatant_id),
            None,
        )
        if active and can_take_turn(active):
            for index, combatant in enumerate(ordered):
                if combatant.id == active.id:
                    if state.active_index != index:
                        state.active_index = index
                        return True
                    ensure_turn_economy(state)
                    return False

        if advance_past_defeated:
            next_candidates = _initiative_search_order(
                state, after_combatant_id=state.active_combatant_id
            )
            for candidate in next_candidates:
                for index, combatant in enumerate(ordered):
                    if combatant.id == candidate.id:
                        if state.active_combatant_id == candidate.id and state.active_index == index:
                            ensure_turn_economy(state)
                            return False
                        state.active_combatant_id = candidate.id
                        state.active_index = index
                        begin_turn(state, candidate.id)
                        return True

        ensure_turn_economy(state)
        return False

    if combat_has_started(state):
        return False

    if state.active_combatant_id == ordered[0].id and state.active_index == 0:
        ensure_turn_economy(state)
        return False

    state.active_combatant_id = ordered[0].id
    state.active_index = 0
    begin_turn(state, ordered[0].id)
    return True


def reconcile_active_combatant(state: EncounterState, *, advance_past_defeated: bool = False) -> bool:
    """Repair active turn pointers. Only advances past defeated actives when explicitly allowed."""
    from app.services.team_initiative import is_team_mode

    if is_team_mode(state) and combat_has_started(state):
        return _reconcile_active_team(state, advance_past_defeated=advance_past_defeated)
    return _reconcile_active_individual(state, advance_past_defeated=advance_past_defeated)


def ensure_active_combatant(state: EncounterState) -> bool:
    """Mutating saves: advance past a defeated active combatant when the tracker is edited."""
    return reconcile_active_combatant(state, advance_past_defeated=True)


def upsert_pc_combatant(state: EncounterState, character: Character, initiative: int) -> None:
    from app.services.encounter_sync import defenses_from_character

    defenses = defenses_from_character(character)
    for combatant in state.combatants:
        if combatant.character_id == character.id:
            combatant.initiative = initiative
            combatant.name = character.name
            combatant.is_pc = True
            if character.hp is not None:
                combatant.hp = character.hp
            if character.max_hp is not None:
                combatant.max_hp = character.max_hp
            if combatant.hp is None and combatant.max_hp is not None:
                combatant.hp = combatant.max_hp
            if character.ac is not None:
                combatant.ac = character.ac
            combatant.speed = speed_from_character(character)
            combatant.damage_resistances = defenses["damage_resistances"]
            combatant.damage_immunities = defenses["damage_immunities"]
            combatant.damage_vulnerabilities = defenses["damage_vulnerabilities"]
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
            speed=speed_from_character(character),
            conditions=[],
            damage_resistances=defenses["damage_resistances"],
            damage_immunities=defenses["damage_immunities"],
            damage_vulnerabilities=defenses["damage_vulnerabilities"],
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


def roll_npc_initiative(combatant: EncounterCombatant) -> tuple[int, int, int]:
    from app.services.monster_catalog import effective_initiative_modifier, lookup_monster

    monster = lookup_monster(combatant.srd_name or combatant.name)
    bonus = effective_initiative_modifier(monster) if monster else 0
    d20 = random.randint(1, 20)
    return d20, bonus, d20 + bonus


def reveal_hidden_combatant(state: EncounterState, combatant_id: str) -> EncounterCombatant:
    """Reveal a hidden enemy to players and roll initiative when combat is underway."""
    combatant = next(
        (entry for entry in state.combatants if entry.id == combatant_id),
        None,
    )
    if combatant is None:
        raise ValueError("Combatant not found")
    if combatant.is_pc or combatant.is_ally:
        raise ValueError("Only hidden enemies can be revealed")
    if not combatant.hidden_from_players:
        raise ValueError("Combatant is already visible to players")
    if not combat_has_started(state):
        raise ValueError("Combat has not started — edit visibility on the tracker instead")

    d20, bonus, total = roll_npc_initiative(combatant)
    updated = combatant.model_copy(update={"hidden_from_players": False, "initiative": total})
    state.combatants = [
        updated if entry.id == combatant_id else entry for entry in state.combatants
    ]
    _append_combat_log(
        state,
        f"{updated.name} revealed — initiative {total} (d20 {d20}{'+' if bonus >= 0 else ''}{bonus})",
        kind="roll",
        actor=updated.name,
        roller_name="DM",
        dice="d20",
        result=d20,
        bonus=bonus,
        total=total,
    )
    sync_initiative_order_after_setup_change(state)
    return updated


def add_enemies_to_encounter(
    session: Session, campaign: Campaign, enemies: list
) -> EncounterState:
    from app.services.encounter_combatants import build_npc_combatant_from_enemy

    state = parse_encounter(campaign)
    for enemy in enemies:
        count = max(1, min(int(getattr(enemy, "count", 1) or 1), 12))
        for index in range(count):
            state.combatants.append(build_npc_combatant_from_enemy(enemy, index=index, count=count))
    sync_initiative_order_after_setup_change(state)
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
    sync_initiative_order_after_setup_change(state)
    return persist_encounter(session, campaign, state)
