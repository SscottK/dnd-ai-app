"""Pass-2 combat: resists, saves, recharge, exhaustion, weapons."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot, UseActionRequest
from app.services.combat_damage import apply_damage_modifiers, parse_damage_type
from app.services.combat_recharge import (
    parse_legendary_uses,
    parse_recharge_threshold,
    roll_recharges_on_turn_start,
)
from app.services.combat_save_effects import looks_like_save_effect, parse_save_effect
from app.services.conditions import get_exhaustion_level
from app.services.monster_catalog import _load_catalog, apply_monster_catalog_to_combatant, lookup_monster
from app.services.turn_actions import _fresh_turn_economy, begin_turn
from app.services.weapon_attacks import lookup_weapon, weapon_profile_from_item


def setup_function() -> None:
    _load_catalog.cache_clear()


def test_parse_damage_type_from_hit_line():
    text = "Melee Attack Roll: +5. Hit: 5 (1d4 + 3) Slashing damage."
    assert parse_damage_type(text) == "slashing"


def test_acid_immunity_zeros_damage():
    target = EncounterCombatant(
        id="m1",
        name="Aboleth Slime Lord",
        srd_name="Aboleth Slime Lord",
        initiative=10,
        hp=100,
        max_hp=100,
    )
    applied = apply_damage_modifiers(20, damage_type="acid", combatant=target)
    assert applied.amount == 0
    assert applied.note and "immune" in applied.note


def test_parse_breath_save_effect():
    text = (
        "Constitution Saving Throw: DC 19, each creature in a 30-foot Cone. "
        "Failure: 54 (12d8) Cold damage. Success: Half damage."
    )
    assert looks_like_save_effect(action_name="Cold Breath (Recharge 6)", detail=text)
    effect = parse_save_effect(text)
    assert effect is not None
    assert effect.ability == "Constitution"
    assert effect.dc == 19
    assert effect.damage_dice == "12d8"
    assert effect.damage_type == "cold"
    assert effect.half_on_success is True


def test_recharge_threshold_parse():
    assert parse_recharge_threshold("Cold Breath (Recharge 6)") == (6, 6)
    assert parse_recharge_threshold("Fire Breath (Recharge 5–6)") == (5, 6)


def test_legendary_uses_from_private_monster():
    monster = lookup_monster("Aarakocra Talon of Syranita")
    assert monster is not None
    uses = parse_legendary_uses(monster)
    assert uses == 3
    combatant = apply_monster_catalog_to_combatant(
        EncounterCombatant(
            id="leg1",
            name="Aarakocra Talon of Syranita",
            srd_name="Aarakocra Talon of Syranita",
            initiative=20,
        )
    )
    assert combatant.legendary_actions_max == 3
    names = {a.name for a in combatant.combat_actions}
    assert not any("legendary action uses" in n.casefold() for n in names)


def test_exhaustion_reduces_speed_budget():
    combatant = EncounterCombatant(
        id="pc1",
        name="Hero",
        initiative=10,
        is_pc=True,
        speed=30,
        conditions=["Exhaustion 2"],
    )
    economy = _fresh_turn_economy(combatant)
    assert economy.movement_remaining == 20
    assert get_exhaustion_level(combatant.conditions) == 2


def test_weapon_catalog_greatsword_is_2d6():
    weapon = lookup_weapon("Greatsword")
    assert weapon is not None
    assert weapon["damage_dice"] == "2d6"
    sheet = {"abilities": {"str": 16, "dex": 10}, "proficiency_bonus": 3}
    bonus, dice = weapon_profile_from_item(sheet, {"name": "Greatsword"})
    assert bonus == 6  # +3 prof +3 str
    assert dice == "2d6+3"


def test_recharge_roll_clears_spent_on_success(monkeypatch):
    state = EncounterState(
        combatants=[
            EncounterCombatant(id="yeti", name="Yeti", initiative=12, hp=50, max_hp=50)
        ]
    )
    economy = TurnEconomySnapshot(spent_recharge_action_ids=["action-breath"])
    state.turn_economy["yeti"] = economy

    monkeypatch.setattr("app.services.combat_recharge.random.randint", lambda a, b: 6)
    messages = roll_recharges_on_turn_start(
        state,
        state.combatants[0],
        {"action-breath": ("Cold Breath (Recharge 6)", None)},
    )
    assert state.turn_economy["yeti"].spent_recharge_action_ids == []
    assert any("recharges" in m for m in messages)


def test_begin_turn_preserves_and_rolls_recharge(monkeypatch):
    combatant = EncounterCombatant(
        id="yeti",
        name="Yeti",
        initiative=12,
        hp=50,
        max_hp=50,
        speed=40,
        combat_actions=[],
    )
    state = EncounterState(combatants=[combatant], active_combatant_id="yeti")
    state.turn_economy["yeti"] = TurnEconomySnapshot(
        spent_recharge_action_ids=["x"],
        action_used=True,
    )
    monkeypatch.setattr(
        "app.services.combat_recharge.roll_recharges_on_turn_start",
        lambda *args, **kwargs: [],
    )
    begin_turn(state, "yeti")
    assert state.turn_economy["yeti"].action_used is False
    assert state.turn_economy["yeti"].movement_remaining == 40
