"""Death saving throws for player characters at 0 HP."""

from __future__ import annotations

import random

from app.api.schemas import EncounterCombatant, EncounterState
from app.services.combat_log import append_log

DEATH_SAVE_ACTION_ID = "std-death-save"
DEATH_SAVE_ACTION_NAME = "Death Saving Throw"


def is_dying_pc(combatant: EncounterCombatant) -> bool:
    return bool(combatant.is_pc and combatant.hp is not None and combatant.hp <= 0)


def reset_death_saves_on_revive(combatant: EncounterCombatant) -> None:
    if combatant.hp is not None and combatant.hp > 0:
        combatant.death_save_failures = 0
        combatant.death_save_successes = 0


def roll_death_save(state: EncounterState, combatant: EncounterCombatant) -> list[str]:
    if not is_dying_pc(combatant):
        return []

    roll = random.randint(1, 20)
    messages: list[str] = []

    if roll == 1:
        combatant.death_save_failures = min(3, combatant.death_save_failures + 2)
        message = (
            f"{combatant.name} rolls a 1 on a death save — 2 failures "
            f"({combatant.death_save_failures}/3)."
        )
    elif roll == 20:
        combatant.hp = 1
        combatant.death_save_failures = 0
        combatant.death_save_successes = 0
        message = f"{combatant.name} rolls a 20 on a death save — regains 1 HP!"
    elif roll >= 10:
        combatant.death_save_successes += 1
        message = (
            f"{combatant.name} death save success ({combatant.death_save_successes}/3) — rolled {roll}."
        )
    else:
        combatant.death_save_failures += 1
        message = (
            f"{combatant.name} death save failure ({combatant.death_save_failures}/3) — rolled {roll}."
        )

    append_log(
        state,
        message,
        kind="roll",
        actor=combatant.name,
        roller_name=combatant.name,
        dice="d20",
        result=roll,
        total=roll,
    )
    messages.append(message)

    if combatant.death_save_failures >= 3:
        dead = f"{combatant.name} dies (3 death save failures)."
        append_log(state, dead, kind="event", actor=combatant.name)
        messages.append(dead)
    elif combatant.death_save_successes >= 3:
        combatant.death_save_successes = 0
        combatant.death_save_failures = 0
        stable = f"{combatant.name} stabilizes (3 successes) but remains at 0 HP."
        append_log(state, stable, kind="event", actor=combatant.name)
        messages.append(stable)

    economy = state.turn_economy.get(combatant.id)
    if economy is not None:
        economy.death_save_rolled = True

    return messages


def is_death_save_request(*, action_id: str | None, action_name: str | None) -> bool:
    clean_id = str(action_id or "").strip().lower()
    clean_name = str(action_name or "").strip().casefold()
    return clean_id == DEATH_SAVE_ACTION_ID or clean_name == DEATH_SAVE_ACTION_NAME.casefold()
