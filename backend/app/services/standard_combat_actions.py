"""Resolve standard combat actions (Dash, Dodge, Hide, Disengage) with turn effects."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.services.combat_log import append_log
from app.services.weapon_attacks import clean_action_label


def _effect_key(action_id: str, action_name: str) -> str | None:
    clean = clean_action_label(action_name).casefold()
    aid = action_id.casefold()
    if "dash" in aid or clean == "dash":
        return "dash"
    if "dodge" in aid or clean == "dodge":
        return "dodge"
    if "disengage" in aid or clean == "disengage":
        return "disengage"
    if "hide" in aid or clean == "hide":
        return "hide"
    return None


def is_standard_turn_effect(action_id: str, action_name: str) -> bool:
    return _effect_key(action_id, action_name) is not None


def resolve_standard_combat_effect(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    effect = _effect_key(data.action_id, data.action_name)
    if effect is None:
        return []

    from app.api.schemas import TurnEconomySnapshot

    economy = state.turn_economy.setdefault(actor.id, TurnEconomySnapshot())
    messages: list[str] = []

    if effect == "dash":
        speed = actor.speed if actor.speed is not None else 0
        if economy.movement_remaining is None:
            economy.movement_remaining = speed
        economy.movement_remaining += speed
        message = (
            f"{actor.name} Dashes — +{speed} ft movement "
            f"({economy.movement_remaining} ft remaining)."
        )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "dodge":
        economy.dodging = True
        message = (
            f"{actor.name} takes the Dodge action — attacks against them have "
            "disadvantage until their next turn."
        )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "disengage":
        economy.disengaged = True
        message = (
            f"{actor.name} takes the Disengage action — their movement does not "
            "provoke opportunity attacks this turn."
        )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "hide":
        economy.hiding = True
        message = (
            f"{actor.name} takes the Hide action — attempting to become unseen "
            "(make a Stealth check)."
        )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    return []


def adjust_movement(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    delta: int,
    log: bool = True,
) -> int:
    from app.api.schemas import TurnEconomySnapshot

    economy = state.turn_economy.setdefault(actor.id, TurnEconomySnapshot())
    if economy.movement_remaining is None:
        economy.movement_remaining = actor.speed if actor.speed is not None else 0
    economy.movement_remaining = max(0, economy.movement_remaining + delta)
    if log and delta != 0:
        direction = "spent" if delta < 0 else "gained"
        append_log(
            state,
            f"{actor.name} {direction} {abs(delta)} ft movement "
            f"({economy.movement_remaining} ft remaining).",
            kind="action",
            actor=actor.name,
        )
    return economy.movement_remaining
