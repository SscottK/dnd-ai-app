"""Team (group) initiative — party slots on averaged PC rolls with in-phase pass combat."""

from __future__ import annotations

import math
from sqlmodel import Session, select

from app.api.schemas import EncounterCombatant, EncounterState, TeamInitiativeState
from app.db.models import Campaign, CampaignMember, Character
from app.services.encounter_actions import (
    can_take_turn,
    combat_has_started,
    is_enemy,
    new_combatant_id,
    persist_encounter,
    roll_initiative_for_character,
    upsert_pc_combatant,
)
from app.services.encounter_sync import parse_encounter
from app.services.monster_catalog import apply_monster_catalog_to_combatant


PARTY_SLOT = "__party__"


class TeamInitiativeError(ValueError):
    pass


def is_team_mode(state: EncounterState) -> bool:
    return (state.initiative_mode or "individual") == "team"


def ensure_team_state(state: EncounterState) -> TeamInitiativeState:
    if state.team is None:
        state.team = TeamInitiativeState()
    return state.team


def party_pc_combatants(state: EncounterState) -> list[EncounterCombatant]:
    return [combatant for combatant in state.combatants if combatant.is_pc and can_take_turn(combatant)]


def party_group_combatant_ids(state: EncounterState) -> list[str]:
    """PCs in the party group (allies are acted on during a PC slice, not separate passes)."""
    return [combatant.id for combatant in party_pc_combatants(state)]


def compute_party_initiative(rolls: dict[str, int]) -> int:
    if not rolls:
        return 0
    return math.floor(sum(rolls.values()) / len(rolls))


def rebuild_turn_slots(state: EncounterState) -> list[str]:
    """Ordered turn slots: enemy/ally combatant ids and PARTY_SLOT."""
    if not is_team_mode(state):
        from app.services.encounter_actions import sorted_combatants

        return [combatant.id for combatant in sorted_combatants(state)]

    team = ensure_team_state(state)
    entries: list[tuple[int, str, str]] = []

    for combatant in state.combatants:
        if not can_take_turn(combatant):
            continue
        if combatant.is_pc:
            continue
        if combatant.is_ally and combatant.controller_character_id:
            continue
        entries.append((combatant.initiative, combatant.id, combatant.id))

    if party_pc_combatants(state):
        entries.append((team.party_initiative, PARTY_SLOT, PARTY_SLOT))

    entries.sort(key=lambda row: (-row[0], row[1]))
    return [row[2] for row in entries]


def refresh_turn_slots(state: EncounterState) -> None:
    team = ensure_team_state(state)
    team.turn_slots = rebuild_turn_slots(state)
    if team.turn_slot_index >= len(team.turn_slots):
        team.turn_slot_index = 0


def _append_combat_log(state: EncounterState, message: str, **fields) -> None:
    from app.services.combat_log import append_log

    append_log(state, message, **fields)


def record_pc_initiative_roll(
    state: EncounterState,
    combatant_id: str,
    *,
    total: int,
    d20_roll: int | None = None,
    bonus: int | None = None,
    roller_name: str = "DM",
) -> None:
    team = ensure_team_state(state)
    team.initiative_rolls[combatant_id] = total
    combatant = next((c for c in state.combatants if c.id == combatant_id), None)
    if combatant:
        combatant.initiative = total
    team.party_initiative = compute_party_initiative(team.initiative_rolls)
    refresh_turn_slots(state)
    if d20_roll is not None and combatant:
        _append_combat_log(
            state,
            f"{combatant.name} rolled initiative",
            kind="roll",
            actor=combatant.name,
            roller_name=roller_name,
            dice="d20",
            result=d20_roll,
            bonus=bonus,
            total=total,
        )


def add_roster_with_team_rolls(
    session: Session,
    campaign: Campaign,
    *,
    roll_character_ids: list[int],
) -> EncounterState:
    state = parse_encounter(campaign)
    if not is_team_mode(state):
        raise TeamInitiativeError("Switch to team initiative mode first.")

    team = ensure_team_state(state)
    roll_ids = set(roll_character_ids)
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
            existing = next(
                (combatant for combatant in state.combatants if combatant.character_id == character.id),
                None,
            )
        if existing is None:
            continue

        if character.id in roll_ids:
            d20_roll, bonus, total = roll_initiative_for_character(character)
            record_pc_initiative_roll(
                state,
                existing.id,
                total=total,
                d20_roll=d20_roll,
                bonus=bonus,
            )
        elif existing.initiative == 0 and existing.id not in team.initiative_rolls:
            existing.initiative = 0

    team.eligible_character_ids = list(roll_ids)
    team.party_initiative = compute_party_initiative(team.initiative_rolls)
    refresh_turn_slots(state)

    if not combat_has_started(state):
        state.active_combatant_id = None
        state.active_index = 0
        team.party_phase_active = False
        team.completed_this_phase = []

    return persist_encounter(session, campaign, state)


def _first_party_actor_id(state: EncounterState) -> str | None:
    team = state.team
    if team is None:
        return None
    if team.initiative_rolls:
        return max(team.initiative_rolls.items(), key=lambda item: item[1])[0]
    pcs = [combatant for combatant in party_pc_combatants(state) if combatant.initiative > 0]
    if pcs:
        return max(pcs, key=lambda combatant: combatant.initiative).id
    pcs = party_pc_combatants(state)
    return pcs[0].id if pcs else None


def start_party_phase(state: EncounterState) -> bool:
    team = ensure_team_state(state)
    if team.party_phase_active:
        return False
    actor_id = _first_party_actor_id(state)
    if not actor_id:
        return False

    from app.services.turn_actions import begin_turn

    team.party_phase_active = True
    team.completed_this_phase = []
    state.active_combatant_id = actor_id
    begin_turn(state, actor_id)
    actor = next((c for c in state.combatants if c.id == actor_id), None)
    if actor:
        _append_combat_log(
            state,
            f"Party turn begins — {actor.name} acts first",
            kind="turn",
            actor=actor.name,
        )
    return True


def end_party_phase(state: EncounterState, *, reason: str = "complete") -> bool:
    team = state.team
    if team is None or not team.party_phase_active:
        return False

    from app.services.turn_actions import begin_turn

    team.party_phase_active = False
    team.completed_this_phase = []
    team.turn_slot_index = (team.turn_slot_index + 1) % max(len(team.turn_slots), 1)
    refresh_turn_slots(state)

    if not team.turn_slots:
        state.active_combatant_id = None
        return True

    if team.turn_slot_index >= len(team.turn_slots):
        team.turn_slot_index = 0
        state.round += 1

    next_slot = team.turn_slots[team.turn_slot_index]
    if next_slot == PARTY_SLOT:
        return start_party_phase(state)

    state.active_combatant_id = next_slot
    begin_turn(state, next_slot)
    actor = next((c for c in state.combatants if c.id == next_slot), None)
    if actor:
        _append_combat_log(
            state,
            f"Round {state.round} — {actor.name}'s turn",
            kind="turn",
            actor=actor.name,
        )
    return True


def pass_combat_to(
    state: EncounterState,
    *,
    target_combatant_id: str,
    passer_combatant_id: str | None = None,
) -> None:
    if not is_team_mode(state) or state.team is None or not state.team.party_phase_active:
        raise TeamInitiativeError("Pass combat is only available during a party turn.")

    team = state.team
    party_ids = party_group_combatant_ids(state)
    if target_combatant_id not in party_ids:
        raise TeamInitiativeError("Pass combat to another party member.")

    active_id = state.active_combatant_id
    if passer_combatant_id and active_id != passer_combatant_id:
        raise TeamInitiativeError("It is not your turn to pass combat.")

    if active_id and active_id not in team.completed_this_phase:
        team.completed_this_phase.append(active_id)

    if target_combatant_id in team.completed_this_phase:
        raise TeamInitiativeError("That party member has already acted this party turn.")

    from app.services.turn_actions import begin_turn

    state.active_combatant_id = target_combatant_id
    begin_turn(state, target_combatant_id)
    target = next((c for c in state.combatants if c.id == target_combatant_id), None)
    if target:
        _append_combat_log(
            state,
            f"Party slice passed to {target.name}",
            kind="event",
            actor=target.name,
        )


def finish_party_slice(state: EncounterState, *, combatant_id: str | None = None) -> None:
    if not is_team_mode(state) or state.team is None or not state.team.party_phase_active:
        raise TeamInitiativeError("No active party turn.")

    active_id = state.active_combatant_id
    if combatant_id and active_id != combatant_id:
        raise TeamInitiativeError("It is not your turn.")

    if not active_id:
        raise TeamInitiativeError("No active combatant.")

    team = state.team
    if active_id not in team.completed_this_phase:
        team.completed_this_phase.append(active_id)

    party_ids = party_group_combatant_ids(state)
    if len(team.completed_this_phase) >= len(party_ids):
        end_party_phase(state)


def advance_team_turn(state: EncounterState) -> None:
    """Advance initiative in team mode when not inside a party phase."""
    team = ensure_team_state(state)
    refresh_turn_slots(state)

    if not team.turn_slots:
        state.active_combatant_id = None
        return

    if team.party_phase_active:
        raise TeamInitiativeError("Finish the party turn with pass combat or end party slice.")

    if state.active_combatant_id is None and team.turn_slots:
        slot = team.turn_slots[team.turn_slot_index]
        if slot == PARTY_SLOT:
            start_party_phase(state)
            return
        from app.services.turn_actions import begin_turn

        state.active_combatant_id = slot
        begin_turn(state, slot)
        actor = next((c for c in state.combatants if c.id == slot), None)
        if actor:
            _append_combat_log(
                state,
                f"Round {state.round} — {actor.name}'s turn",
                kind="turn",
                actor=actor.name,
            )
        return

    team.turn_slot_index = (team.turn_slot_index + 1) % len(team.turn_slots)
    if team.turn_slot_index == 0:
        state.round += 1

    slot = team.turn_slots[team.turn_slot_index]
    if slot == PARTY_SLOT:
        start_party_phase(state)
        return

    from app.services.turn_actions import begin_turn

    state.active_combatant_id = slot
    begin_turn(state, slot)
    actor = next((c for c in state.combatants if c.id == slot), None)
    if actor:
        _append_combat_log(
            state,
            f"Round {state.round} — {actor.name}'s turn",
            kind="turn",
            actor=actor.name,
        )


def activate_current_team_slot(state: EncounterState) -> bool:
    """During setup, align active combatant with current turn slot."""
    if not is_team_mode(state) or combat_has_started(state):
        return False

    team = ensure_team_state(state)
    refresh_turn_slots(state)
    if not team.turn_slots:
        if state.active_combatant_id is not None:
            state.active_combatant_id = None
            return True
        return False

    if team.party_phase_active:
        return False

    slot = team.turn_slots[team.turn_slot_index] if team.turn_slots else None
    if slot == PARTY_SLOT:
        return start_party_phase(state)

    if slot and state.active_combatant_id != slot:
        from app.services.turn_actions import begin_turn

        state.active_combatant_id = slot
        begin_turn(state, slot)
        return True
    return False


def set_initiative_mode(state: EncounterState, mode: str) -> None:
    if mode not in ("individual", "team"):
        raise TeamInitiativeError("initiative_mode must be individual or team.")
    if combat_has_started(state):
        raise TeamInitiativeError("Cannot change initiative mode after combat has started.")
    state.initiative_mode = mode
    if mode == "team":
        ensure_team_state(state)
        refresh_turn_slots(state)
    else:
        state.team = None
