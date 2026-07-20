"""Combat pass 4: Rage, multi-target saves, PC spell DC, concentration."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.services.combat_damage import apply_damage_modifiers
from app.services.combat_save_effects import looks_like_save_effect, parse_save_effect, resolve_save_effect
from app.services.concentration import (
    check_concentration_after_damage,
    clear_concentration,
    start_concentration,
)
from app.services.resource_actions import spend_action_resource
from app.services.turn_actions import filter_valid_targets, validate_target_selection


def test_raging_grants_bps_resistance():
    target = EncounterCombatant(
        id="barb",
        name="Barbarian",
        initiative=10,
        is_pc=True,
        raging=True,
    )
    applied = apply_damage_modifiers(20, damage_type="slashing", combatant=target)
    assert applied.amount == 10


def test_spend_rage_sets_raging_flag():
    character = MagicMock()
    character.campaign_id = 1
    character.sheet_json = json.dumps(
        {
            "resources": [{"id": "rage", "name": "Rage", "current": 2, "max": 2}],
            "combat_actions": [
                {
                    "id": "rage",
                    "name": "Rage",
                    "action_type": "bonus_action",
                    "resource_cost": {"resource_id": "rage", "amount": 1},
                }
            ],
        }
    )
    character.class_name = "Barbarian"
    character.level = 3
    session = MagicMock()
    session.get.return_value = character
    actor = EncounterCombatant(id="pc1", name="Barbarian", initiative=12, is_pc=True, character_id=1)
    data = UseActionRequest(
        action_id="rage",
        action_name="Rage",
        action_type="bonus_action",
        targeting="self",
        target_ids=[],
    )
    messages = spend_action_resource(session, 1, actor=actor, data=data)
    assert actor.raging is True
    assert any("Rage" in m for m in messages)


def test_parse_save_with_sheet_fallback_dc():
    text = "Each creature in a 20-foot-radius sphere must make a Dexterity saving throw."
    assert looks_like_save_effect(action_name="Fireball", detail=text)
    effect = parse_save_effect(text, fallback_dc=15)
    assert effect is not None
    assert effect.dc == 15
    assert effect.ability == "Dexterity"


def test_multi_target_validation():
    state = EncounterState(
        combatants=[
            EncounterCombatant(id="a", name="Dragon", initiative=20, is_pc=False, hp=100, max_hp=100),
            EncounterCombatant(id="p1", name="Hero", initiative=15, is_pc=True, hp=20, max_hp=20),
            EncounterCombatant(id="p2", name="Cleric", initiative=10, is_pc=True, hp=18, max_hp=18),
        ]
    )
    validate_target_selection(state, "a", "many_creatures", ["p1", "p2"])
    allowed = filter_valid_targets(state, "a", "many_creatures")
    assert {c.id for c in allowed} == {"p1", "p2"}


def test_concentration_breaks_on_failed_save():
    state = EncounterState(
        combatants=[
            EncounterCombatant(
                id="wiz",
                name="Wizard",
                initiative=12,
                is_pc=True,
                concentrating_on="Bless",
            )
        ]
    )
    combatant = state.combatants[0]
    # Force low roll by monkeypatching - use high damage so DC is high and mod alone won't pass easily
    # With damage 50, DC = 25; mod 0 fails on any roll < 25
    from app.services.combat_dice import roll_d20_check
    import app.services.concentration as conc

    original = roll_d20_check
    conc.roll_d20_check = lambda **kwargs: (1, [1])
    try:
        messages = check_concentration_after_damage(state, combatant, damage=50)
    finally:
        conc.roll_d20_check = original
    assert combatant.concentrating_on is None
    assert any("loses concentration" in m for m in messages)


def test_start_and_clear_concentration():
    c = EncounterCombatant(id="w", name="Wiz", initiative=10, is_pc=True)
    start_concentration(c, spell_name="Haste", spell_id="spell-haste")
    assert c.concentrating_on == "Haste"
    assert clear_concentration(c) == "Haste"
    assert c.concentrating_on is None
