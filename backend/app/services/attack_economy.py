"""Extra Attack and multi-swing economy for weapon attacks."""

from __future__ import annotations

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.db.models import Character
from app.services.character_sheet import parse_sheet_json
from app.services.combat_log import append_log
from app.services.turn_actions import validate_target_selection
from app.services.weapon_attacks import clean_action_label


def attacks_per_attack_action(sheet: dict) -> int:
    """How many weapon attack rolls one Attack action allows (Extra Attack, etc.)."""
    total = 1
    for feat in sheet.get("features") or []:
        if not isinstance(feat, dict):
            continue
        name = clean_action_label(str(feat.get("name") or "")).casefold()
        if name == "extra attack":
            total = max(total, 2)
        elif name == "two extra attacks":
            total = max(total, 3)
        elif name == "three extra attacks":
            total = max(total, 4)

    for action in sheet.get("combat_actions") or []:
        if not isinstance(action, dict):
            continue
        name = clean_action_label(str(action.get("name") or "")).casefold()
        if name == "extra attack":
            total = max(total, 2)
        elif name == "two extra attacks":
            total = max(total, 3)
        elif name == "three extra attacks":
            total = max(total, 4)

    return total


def attack_budget_for_actor(
    session: Session,
    campaign_id: int,
    actor: EncounterCombatant,
) -> int:
    if not actor.character_id:
        return 1
    character = session.get(Character, actor.character_id)
    if character is None or character.campaign_id != campaign_id:
        return 1
    sheet = parse_sheet_json(
        character.sheet_json,
        class_name=character.class_name,
        level=character.level,
    )
    return attacks_per_attack_action(sheet)


def use_weapon_attack(
    state: EncounterState,
    session: Session,
    campaign_id: int,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
    log_usage: bool = True,
) -> None:
    """Spend action and/or bonus attack swings from the Extra Attack pool."""
    from app.services.turn_actions import ensure_turn_economy, get_active_combatant, is_incapacitated

    active = get_active_combatant(state)
    if active is None or active.id != actor.id:
        raise ValueError("It is not your turn.")
    if is_incapacitated(actor.conditions):
        raise ValueError("You have the Incapacitated condition and cannot take actions.")

    validate_target_selection(state, actor.id, data.targeting, data.target_ids)

    ensure_turn_economy(state)
    from app.api.schemas import TurnEconomySnapshot

    economy = state.turn_economy.setdefault(actor.id, TurnEconomySnapshot())
    budget = attack_budget_for_actor(session, campaign_id, actor)

    if economy.attacks_remaining > 0:
        economy.attacks_remaining -= 1
    elif not economy.action_used:
        economy.action_used = True
        economy.attacks_remaining = max(0, budget - 1)
    elif economy.extra_action_available:
        economy.extra_action_available = False
        economy.attacks_remaining = max(0, budget - 1)
    else:
        raise ValueError("You have already used your action this turn.")

    if log_usage:
        clean_name = clean_action_label(data.action_name)
        target_name = None
        if data.target_ids:
            match = next((c for c in state.combatants if c.id == data.target_ids[0]), None)
            target_name = match.name if match else "unknown target"
        parts = [f"{actor.name} attacks with {clean_name}"]
        if target_name:
            parts.append(f"targeting {target_name}")
        if economy.attacks_remaining > 0:
            parts.append(f"({economy.attacks_remaining} attack{'s' if economy.attacks_remaining != 1 else ''} left)")
        append_log(state, " — ".join(parts), kind="action", actor=actor.name)
