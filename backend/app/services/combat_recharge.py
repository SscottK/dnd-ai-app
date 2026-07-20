"""Legendary action and Recharge trackers for monster combat."""

from __future__ import annotations

import random
import re

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot
from app.services.combat_log import append_log

_LEGENDARY_USES_RE = re.compile(
    r"legendary\s+action\s+uses?\s*:\s*(\d+)",
    re.IGNORECASE,
)
_RECHARGE_RE = re.compile(
    r"\(recharge\s+(\d+)(?:\s*[–\-]\s*(\d+))?\)",
    re.IGNORECASE,
)


def parse_legendary_uses(monster_or_actions) -> int | None:
    """Read Legendary Action Uses from legendary action rows or monster stat block."""
    rows = monster_or_actions
    if isinstance(monster_or_actions, dict):
        sb = monster_or_actions.get("stat_block_json") or {}
        rows = sb.get("legendary_actions") or []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        blob = f"{row.get('name') or ''} {row.get('description') or ''}"
        match = _LEGENDARY_USES_RE.search(blob)
        if match:
            return max(1, int(match.group(1)))
    return None


def parse_recharge_threshold(action_name: str | None, description: str | None = None) -> tuple[int, int] | None:
    """Return (min, max) inclusive d6 values that restore the action, e.g. (5, 6) or (6, 6)."""
    blob = f"{action_name or ''} {description or ''}"
    match = _RECHARGE_RE.search(blob)
    if not match:
        return None
    low = int(match.group(1))
    high = int(match.group(2) or match.group(1))
    return (min(low, high), max(low, high))


def is_legendary_action(*, action_id: str | None, action_name: str | None) -> bool:
    aid = str(action_id or "").casefold()
    name = str(action_name or "").casefold()
    if aid.startswith("legendary-"):
        return True
    if "(legendary)" in name:
        return True
    if name.startswith("legendary action uses"):
        return False
    return False


def is_legendary_uses_header(action_name: str | None) -> bool:
    return "legendary action uses" in str(action_name or "").casefold()


def ensure_legendary_budget(state: EncounterState, combatant: EncounterCombatant) -> None:
    economy = state.turn_economy.setdefault(combatant.id, TurnEconomySnapshot())
    max_uses = combatant.legendary_actions_max
    if max_uses is None:
        return
    if economy.legendary_uses_remaining is None:
        economy.legendary_uses_remaining = max_uses


def refresh_legendary_on_turn_start(state: EncounterState, combatant: EncounterCombatant) -> None:
    if combatant.legendary_actions_max is None:
        return
    economy = state.turn_economy.setdefault(combatant.id, TurnEconomySnapshot())
    economy.legendary_uses_remaining = combatant.legendary_actions_max


def spend_legendary_use(state: EncounterState, combatant: EncounterCombatant) -> None:
    ensure_legendary_budget(state, combatant)
    economy = state.turn_economy[combatant.id]
    remaining = economy.legendary_uses_remaining
    if remaining is None or remaining <= 0:
        raise ValueError(f"{combatant.name} has no legendary actions remaining.")
    economy.legendary_uses_remaining = remaining - 1


def mark_recharge_spent(state: EncounterState, combatant_id: str, action_id: str) -> None:
    economy = state.turn_economy.setdefault(combatant_id, TurnEconomySnapshot())
    if action_id not in economy.spent_recharge_action_ids:
        economy.spent_recharge_action_ids.append(action_id)


def assert_recharge_available(
    state: EncounterState,
    combatant: EncounterCombatant,
    *,
    action_id: str,
    action_name: str,
    description: str | None = None,
) -> None:
    threshold = parse_recharge_threshold(action_name, description)
    if threshold is None:
        return
    economy = state.turn_economy.setdefault(combatant.id, TurnEconomySnapshot())
    if action_id in economy.spent_recharge_action_ids:
        raise ValueError(f"{action_name} is spent and has not recharged yet.")


def roll_recharges_on_turn_start(
    state: EncounterState,
    combatant: EncounterCombatant,
    action_lookup: dict[str, tuple[str, str | None]],
) -> list[str]:
    """Roll d6 for each spent recharge action. action_lookup: id -> (name, description)."""
    economy = state.turn_economy.setdefault(combatant.id, TurnEconomySnapshot())
    if not economy.spent_recharge_action_ids:
        return []
    messages: list[str] = []
    still_spent: list[str] = []
    for action_id in list(economy.spent_recharge_action_ids):
        name, description = action_lookup.get(action_id, (action_id, None))
        threshold = parse_recharge_threshold(name, description)
        if threshold is None:
            still_spent.append(action_id)
            continue
        low, high = threshold
        roll = random.randint(1, 6)
        if low <= roll <= high:
            msg = f"{combatant.name}'s {name} recharges (rolled {roll})."
            messages.append(msg)
            append_log(state, msg, kind="event", actor=combatant.name)
        else:
            still_spent.append(action_id)
            msg = f"{combatant.name}'s {name} does not recharge (rolled {roll}; need {low}-{high})."
            messages.append(msg)
            append_log(state, msg, kind="event", actor=combatant.name)
    economy.spent_recharge_action_ids = still_spent
    return messages
