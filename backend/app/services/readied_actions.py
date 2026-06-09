"""Ready action — store readied effects and resolve DM-triggered reactions."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot
from app.services.combat_log import append_log


class ReadiedActionError(ValueError):
    pass


def _economy(state: EncounterState, combatant_id: str) -> TurnEconomySnapshot:
    return state.turn_economy.setdefault(combatant_id, TurnEconomySnapshot())


def combatants_with_readied(state: EncounterState) -> list[tuple[EncounterCombatant, TurnEconomySnapshot]]:
    rows: list[tuple[EncounterCombatant, TurnEconomySnapshot]] = []
    for combatant in state.combatants:
        economy = state.turn_economy.get(combatant.id)
        if economy and economy.readied_action:
            rows.append((combatant, economy))
    return rows


def trigger_readied_action(
    state: EncounterState,
    *,
    combatant_id: str,
    note: str | None = None,
) -> list[str]:
    combatant = next((entry for entry in state.combatants if entry.id == combatant_id), None)
    if combatant is None:
        raise ReadiedActionError("Combatant not found.")

    economy = state.turn_economy.get(combatant_id)
    if not economy or not economy.readied_action:
        raise ReadiedActionError(f"{combatant.name} has no readied action.")

    if economy.reaction_used:
        raise ReadiedActionError(
            f"{combatant.name} has already used their reaction this round."
        )

    ready_for = economy.readied_action
    trigger = economy.readied_trigger or "the chosen trigger"
    economy.reaction_used = True
    economy.readied_action = None
    economy.readied_trigger = None

    extra = f" ({note.strip()})" if note and note.strip() else ""
    message = (
        f"{combatant.name} uses their readied {ready_for} when {trigger}{extra}."
    )
    append_log(state, message, kind="action", actor=combatant.name)
    return [message]


def cancel_readied_action(state: EncounterState, *, combatant_id: str) -> list[str]:
    combatant = next((entry for entry in state.combatants if entry.id == combatant_id), None)
    if combatant is None:
        raise ReadiedActionError("Combatant not found.")

    economy = state.turn_economy.get(combatant_id)
    if not economy or not economy.readied_action:
        raise ReadiedActionError(f"{combatant.name} has no readied action.")

    ready_for = economy.readied_action
    economy.readied_action = None
    economy.readied_trigger = None
    message = f"{combatant.name} drops their readied {ready_for}."
    append_log(state, message, kind="event", actor=combatant.name)
    return [message]
