"""Concentration (5.5e): maintain a spell, Con save on damage, drop on fail/incapacitated."""

from __future__ import annotations

import re

from app.api.schemas import EncounterCombatant, EncounterState
from app.services.combat_dice import format_roll_detail, roll_d20_check
from app.services.combat_log import append_log
from app.services.conditions import get_exhaustion_level
from app.services.turn_actions import is_incapacitated

_CONCENTRATION_HINT = re.compile(r"\bconcentration\b|\bconcentrating\b", re.IGNORECASE)
_BPS = frozenset({"bludgeoning", "piercing", "slashing"})


def looks_like_concentration(*, action_name: str | None = None, detail: str | None = None, description: str | None = None) -> bool:
    text = " ".join(part for part in (action_name, detail, description) if part)
    if not text:
        return False
    if _CONCENTRATION_HINT.search(text):
        return True
    # Catalog / sheet flag often lives in description as "Concentration"
    return False


def spell_requires_concentration(entry: dict | None) -> bool:
    if not isinstance(entry, dict):
        return False
    if entry.get("concentration") is True:
        return True
    text = " ".join(
        str(entry.get(key) or "")
        for key in ("name", "description", "desc", "duration")
    )
    return bool(_CONCENTRATION_HINT.search(text))


def start_concentration(
    combatant: EncounterCombatant,
    *,
    spell_name: str,
    spell_id: str | None = None,
) -> None:
    combatant.concentrating_on = spell_name
    combatant.concentrating_spell_id = spell_id


def clear_concentration(combatant: EncounterCombatant) -> str | None:
    previous = combatant.concentrating_on
    combatant.concentrating_on = None
    combatant.concentrating_spell_id = None
    return previous


def drop_concentration_if_incapacitated(
    state: EncounterState,
    combatant: EncounterCombatant,
) -> list[str]:
    if not combatant.concentrating_on:
        return []
    if not is_incapacitated(combatant.conditions):
        return []
    name = clear_concentration(combatant)
    message = f"{combatant.name} loses concentration on {name} (incapacitated)."
    append_log(state, message, kind="action", actor=combatant.name)
    return [message]


def _constitution_save_mod(combatant: EncounterCombatant, session=None) -> int:
    from app.services.combat_save_effects import _ability_mod_for_target

    return _ability_mod_for_target(combatant, "Constitution", session=session)


def check_concentration_after_damage(
    state: EncounterState,
    combatant: EncounterCombatant,
    *,
    damage: int,
    session=None,
) -> list[str]:
    """Force a Constitution save to maintain concentration after taking damage."""
    if damage <= 0 or not combatant.concentrating_on:
        return []
    if is_incapacitated(combatant.conditions):
        return drop_concentration_if_incapacitated(state, combatant)

    dc = max(10, damage // 2)
    save_mod = _constitution_save_mod(combatant, session=session)
    exhaustion = get_exhaustion_level(combatant.conditions)
    save_mod -= 2 * exhaustion
    roll, _ = roll_d20_check()
    total = roll + save_mod
    success = total >= dc
    spell = combatant.concentrating_on
    roll_msg = format_roll_detail(
        dice_label=f"{combatant.name} concentration (Con)",
        rolls=[roll],
        modifier=save_mod,
        total=total,
    ) + f" vs DC {dc} — {'maintains' if success else 'breaks'} {spell}"
    messages = [roll_msg]
    append_log(
        state,
        roll_msg,
        kind="roll",
        actor=combatant.name,
        roller_name=combatant.name,
        dice="d20",
        result=roll,
        bonus=save_mod,
        total=total,
    )
    if not success:
        clear_concentration(combatant)
        drop_msg = f"{combatant.name} loses concentration on {spell}."
        messages.append(drop_msg)
        append_log(state, drop_msg, kind="action", actor=combatant.name)
    return messages
