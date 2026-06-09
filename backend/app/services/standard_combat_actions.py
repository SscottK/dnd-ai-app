"""Resolve standard combat actions (Dash, Dodge, Hide, Disengage) with turn effects."""

from __future__ import annotations

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.db.models import Character
from app.services.action_rules import lookup_combat_action
from app.services.character_sheet import parse_sheet_json, skill_bonus
from app.services.combat_dice import format_roll_detail, roll_d20
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
    if "help" in aid or clean == "help":
        return "help"
    if "ready" in aid or clean == "ready":
        return "ready"
    if "search" in aid or clean == "search":
        return "search"
    if "study" in aid or clean == "study":
        return "study"
    if "utilize" in aid or clean == "utilize":
        return "utilize"
    if "influence" in aid or clean == "influence":
        return "influence"
    return None


def is_standard_turn_effect(action_id: str, action_name: str) -> bool:
    return _effect_key(action_id, action_name) is not None


def action_catalog_effect(action_name: str) -> str | None:
    catalog = lookup_combat_action(clean_action_label(action_name))
    if not catalog:
        return None
    return catalog.get("effect")


def skips_action_economy(action_name: str) -> bool:
    return action_catalog_effect(action_name) == "extra_action"


def is_extra_action_effect(action_name: str) -> bool:
    return skips_action_economy(action_name)


def resolve_extra_action_effect(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    if not is_extra_action_effect(data.action_name):
        return []

    from app.api.schemas import TurnEconomySnapshot

    economy = state.turn_economy.setdefault(actor.id, TurnEconomySnapshot())
    economy.extra_action_available = True
    clean = clean_action_label(data.action_name)
    message = (
        f"{actor.name} uses {clean} — you can take one additional action this turn."
    )
    append_log(state, message, kind="action", actor=actor.name)
    return [message]


def _actor_skill_sheet(
    session: Session | None,
    campaign_id: int | None,
    actor: EncounterCombatant,
) -> dict | None:
    if session is None or campaign_id is None or not actor.character_id:
        return None
    character = session.get(Character, actor.character_id)
    if character is None or character.campaign_id != campaign_id:
        return None
    return parse_sheet_json(
        character.sheet_json,
        class_name=character.class_name,
        level=character.level,
    )


def resolve_standard_combat_effect(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
    session: Session | None = None,
    campaign_id: int | None = None,
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
        sheet = _actor_skill_sheet(session, campaign_id, actor)
        stealth_mod = skill_bonus(sheet, "Stealth") if sheet else None
        if stealth_mod is not None:
            d20_roll = roll_d20()
            total = d20_roll + stealth_mod
            roll_message = format_roll_detail(
                dice_label=f"{actor.name} Hide — Stealth",
                rolls=[d20_roll],
                modifier=stealth_mod,
                total=total,
            )
            messages.append(roll_message)
            append_log(
                state,
                roll_message,
                kind="roll",
                actor=actor.name,
                roller_name=actor.name,
                dice="d20",
                result=d20_roll,
                bonus=stealth_mod,
                total=total,
            )
            message = f"{actor.name} attempts to Hide (Stealth {total})."
        else:
            message = (
                f"{actor.name} takes the Hide action — attempting to become unseen "
                "(Stealth bonus not on sheet)."
            )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "help":
        if len(data.target_ids) != 1:
            raise ValueError("Select exactly one ally to Help.")
        target = next((c for c in state.combatants if c.id == data.target_ids[0]), None)
        target_name = target.name if target else "ally"
        economy.helping_target_id = data.target_ids[0]
        message = (
            f"{actor.name} Helps {target_name} — the next D20 test they make "
            "before your next turn has advantage."
        )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "ready":
        ready_for = (data.detail or "an action").strip()[:120]
        trigger = (data.trigger or "").strip()[:120] or None
        economy.readied_action = ready_for
        economy.readied_trigger = trigger
        if trigger:
            message = (
                f"{actor.name} readies {ready_for} — reacts when {trigger} "
                "(before their next turn)."
            )
        else:
            message = (
                f"{actor.name} readies {ready_for} — DM will resolve the trigger "
                "before their next turn."
            )
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "search":
        message = f"{actor.name} takes the Search action — making a Perception or Investigation check."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "study":
        message = f"{actor.name} takes the Study action — making an Arcana, History, or other lore check."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "utilize":
        message = f"{actor.name} takes the Utilize action — interacting with an object or device."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    if effect == "influence":
        if len(data.target_ids) != 1:
            raise ValueError("Select a creature to Influence.")
        target = next((c for c in state.combatants if c.id == data.target_ids[0]), None)
        target_name = target.name if target else "creature"
        message = f"{actor.name} attempts to Influence {target_name}."
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
