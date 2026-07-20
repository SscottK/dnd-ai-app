"""D&D 5.5e turn action economy and targeting validation."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot
from app.services.conditions import has_condition, normalize_conditions
from app.services.encounter_actions import (
    can_take_turn,
    is_defeated_enemy,
    resolve_active_index,
    sorted_combatants,
)
from app.services.combat_log import append_log

_INCAPACITATING = frozenset({"Paralyzed", "Stunned", "Unconscious", "Petrified"})

VALID_ACTION_TYPES = frozenset({"action", "bonus_action", "reaction", "magic_action"})
VALID_TARGETING = frozenset(
    {"self", "one_enemy", "one_ally", "one_creature", "one_ally_or_self"}
)


def is_incapacitated(conditions: list[str] | str | None) -> bool:
    listed = normalize_conditions(conditions)
    if has_condition(listed, "Incapacitated"):
        return True
    return any(
        (entry.split()[0] if entry.split() else entry) in _INCAPACITATING for entry in listed
    )


def is_ally(combatant: EncounterCombatant) -> bool:
    return combatant.is_pc or combatant.is_ally


def _same_team(left: EncounterCombatant, right: EncounterCombatant) -> bool:
    return is_ally(left) == is_ally(right)


def _opposing_team(left: EncounterCombatant, right: EncounterCombatant) -> bool:
    return is_ally(left) != is_ally(right)


def _actor_combatant(state: EncounterState, actor_id: str) -> EncounterCombatant | None:
    return next((combatant for combatant in state.combatants if combatant.id == actor_id), None)


def get_active_combatant(state: EncounterState) -> EncounterCombatant | None:
    ordered = sorted_combatants(state)
    if not ordered:
        return None
    index = resolve_active_index(state)
    return ordered[index] if 0 <= index < len(ordered) else ordered[0]


def _fresh_turn_economy(combatant: EncounterCombatant) -> TurnEconomySnapshot:
    from app.services.conditions import get_exhaustion_level

    speed = combatant.speed
    if speed is not None:
        speed = max(0, int(speed) - 5 * get_exhaustion_level(combatant.conditions))
    economy = TurnEconomySnapshot(
        movement_remaining=speed if speed is not None else None,
    )
    if combatant.legendary_actions_max is not None:
        economy.legendary_uses_remaining = combatant.legendary_actions_max
    return economy


def ensure_turn_economy(state: EncounterState) -> None:
    active = get_active_combatant(state)
    if active is None:
        return
    economy = state.turn_economy.get(active.id)
    if economy is None:
        state.turn_economy[active.id] = _fresh_turn_economy(active)
        return
    if economy.movement_remaining is None and active.speed is not None:
        from app.services.conditions import get_exhaustion_level

        economy.movement_remaining = max(
            0, int(active.speed) - 5 * get_exhaustion_level(active.conditions)
        )


def begin_turn(state: EncounterState, combatant_id: str) -> None:
    """Fresh action economy when a combatant's turn starts."""
    from app.services.combat_recharge import (
        refresh_legendary_on_turn_start,
        roll_recharges_on_turn_start,
    )

    combatant = _actor_combatant(state, combatant_id)
    if combatant is None:
        state.turn_economy[combatant_id] = TurnEconomySnapshot()
        return
    prior = state.turn_economy.get(combatant_id)
    spent = list(prior.spent_recharge_action_ids) if prior else []
    state.turn_economy[combatant_id] = _fresh_turn_economy(combatant)
    state.turn_economy[combatant_id].spent_recharge_action_ids = spent
    refresh_legendary_on_turn_start(state, combatant)
    action_lookup = {
        str(entry.id or ""): (entry.name, entry.description)
        for entry in combatant.combat_actions
        if entry.id
    }
    roll_recharges_on_turn_start(state, combatant, action_lookup)


def _living_targets(state: EncounterState) -> list[EncounterCombatant]:
    return [
        combatant
        for combatant in state.combatants
        if can_take_turn(combatant) or not is_defeated_enemy(combatant)
    ]


def filter_valid_targets(
    state: EncounterState,
    actor_id: str,
    targeting: str,
) -> list[EncounterCombatant]:
    living = _living_targets(state)
    actor = _actor_combatant(state, actor_id)
    if targeting == "self":
        return [combatant for combatant in living if combatant.id == actor_id]
    if targeting == "one_enemy":
        if actor is None:
            return []
        return [
            combatant
            for combatant in living
            if combatant.id != actor_id and _opposing_team(actor, combatant)
        ]
    if targeting == "one_ally":
        if actor is None:
            return []
        return [
            combatant
            for combatant in living
            if combatant.id != actor_id and _same_team(actor, combatant)
        ]
    if targeting == "one_ally_or_self":
        if actor is None:
            return [combatant for combatant in living if combatant.id == actor_id]
        return [
            combatant
            for combatant in living
            if combatant.id == actor_id or _same_team(actor, combatant)
        ]
    if targeting == "one_creature":
        return [combatant for combatant in living if combatant.id != actor_id]
    return []


def validate_target_selection(
    state: EncounterState,
    actor_id: str,
    targeting: str,
    target_ids: list[str],
) -> None:
    if targeting == "self":
        if target_ids:
            raise ValueError("This action does not require a target.")
        return

    if len(target_ids) != 1:
        raise ValueError("Select exactly one target for this action.")

    allowed_ids = {combatant.id for combatant in filter_valid_targets(state, actor_id, targeting)}
    if target_ids[0] not in allowed_ids:
        raise ValueError("That target is not valid for this action.")


def _economy_field(action_type: str) -> str:
    if action_type == "action":
        return "action_used"
    if action_type == "bonus_action":
        return "bonus_action_used"
    if action_type == "reaction":
        return "reaction_used"
    if action_type == "magic_action":
        return "magic_action_used"
    raise ValueError("Invalid action type.")


def use_combat_action(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    action_id: str,
    action_name: str,
    action_type: str,
    targeting: str,
    target_ids: list[str],
    detail: str | None,
    log_usage: bool = True,
) -> None:
    from app.services.combat_recharge import (
        assert_recharge_available,
        is_legendary_action,
        mark_recharge_spent,
        parse_recharge_threshold,
        spend_legendary_use,
    )

    if action_type not in VALID_ACTION_TYPES:
        raise ValueError("Invalid action type.")
    if targeting not in VALID_TARGETING:
        raise ValueError("Invalid targeting mode.")

    legendary = is_legendary_action(action_id=action_id, action_name=action_name)
    active = get_active_combatant(state)
    if legendary:
        if active is not None and active.id == actor.id:
            raise ValueError(
                "Legendary actions are taken after another creature's turn, not during your own."
            )
    elif action_type != "reaction":
        if active is None or active.id != actor.id:
            raise ValueError("It is not your turn.")

    if is_incapacitated(actor.conditions):
        raise ValueError("You have the Incapacitated condition and cannot take actions.")

    validate_target_selection(state, actor.id, targeting, target_ids)

    ensure_turn_economy(state)
    economy = state.turn_economy.setdefault(actor.id, TurnEconomySnapshot())
    assert_recharge_available(
        state,
        actor,
        action_id=action_id,
        action_name=action_name,
        description=detail,
    )

    if legendary:
        spend_legendary_use(state, actor)
    else:
        field = _economy_field(action_type)
        if action_type == "action" and economy.action_used:
            if economy.extra_action_available:
                economy.extra_action_available = False
            else:
                raise ValueError("You have already used your action this turn.")
        elif getattr(economy, field):
            label = action_type.replace("_", " ")
            raise ValueError(f"You have already used your {label} this turn.")
        else:
            setattr(economy, field, True)

    if parse_recharge_threshold(action_name, detail):
        mark_recharge_spent(state, actor.id, action_id)

    target_name = None
    if target_ids:
        match = next((c for c in state.combatants if c.id == target_ids[0]), None)
        target_name = match.name if match else "unknown target"

    if log_usage:
        parts = [f"{actor.name} uses {action_name}"]
        if detail:
            parts[0] = f"{actor.name} uses {action_name} ({detail})"
        if target_name:
            parts.append(f"targeting {target_name}")
        append_log(state, " — ".join(parts), kind="action", actor=actor.name)
