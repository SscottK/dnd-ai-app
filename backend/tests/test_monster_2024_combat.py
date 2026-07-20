"""2024 monster action parsing and combat catalog integration."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant
from app.services.combat_resolution import _multiattack_strikes, resolve_attack_profile
from app.services.death_saves import is_dying_pc, roll_death_save
from app.services.monster_action_parse import (
    parse_attack_stats_from_text,
    parse_multiattack_plan,
)
from app.services.monster_catalog import (
    _load_catalog,
    apply_monster_catalog_to_combatant,
    lookup_monster,
    monster_to_combat_actions,
)
from app.api.schemas import EncounterState


def setup_function() -> None:
    _load_catalog.cache_clear()


def test_parse_2024_attack_roll_prose():
    text = (
        "Melee Attack Roll: +5, reach 5 ft. Hit: 5 (1d4 + 3) Slashing damage, "
        "or 10 (3d4 + 3) Slashing damage if the aarakocra moved 30+ feet."
    )
    parsed = parse_attack_stats_from_text(text)
    assert parsed.attack_bonus == 5
    assert parsed.damage_dice == "1d4+3"


def test_parse_legacy_to_hit_still_works():
    parsed = parse_attack_stats_from_text("+4 to hit, Hit: 7 (1d8 + 3) piercing")
    assert parsed.attack_bonus == 4
    assert parsed.damage_dice == "1d8+3"


def test_multiattack_word_count_named():
    plan = parse_multiattack_plan("The wolf makes two Bite attacks.")
    assert plan == [("Bite", 2)]


def test_multiattack_any_combination():
    plan = parse_multiattack_plan(
        "The aarakocra makes two attacks, using Talons and Storm Spear in any combination."
    )
    assert sum(count for _, count in plan) == 2
    names = {name for name, _ in plan}
    assert names == {"Talons", "Storm Spear"}


def test_private_monster_actions_have_attack_stats():
    monster = lookup_monster("Aarakocra Scout")
    assert monster is not None
    actions = monster_to_combat_actions(monster)
    by_name = {a.name: a for a in actions}
    assert "Talons" in by_name
    assert by_name["Talons"].attack_bonus == 5
    assert by_name["Talons"].damage_dice == "1d4+3"


def test_apply_catalog_replaces_fallback_actions():
    combatant = EncounterCombatant(
        id="m1",
        name="Aarakocra Scout",
        srd_name="Aarakocra Scout",
        initiative=12,
        combat_actions=[],
    )
    updated = apply_monster_catalog_to_combatant(combatant)
    names = {a.name for a in updated.combat_actions}
    assert "Talons" in names or "Longbow" in names
    talons = next(a for a in updated.combat_actions if a.name == "Talons")
    assert talons.attack_bonus == 5


def test_multiattack_strikes_from_2024_combination_text():
    monster = lookup_monster("Aarakocra Scout")
    actor = apply_monster_catalog_to_combatant(
        EncounterCombatant(
            id="a1",
            name="Aarakocra Scout",
            srd_name="Aarakocra Scout",
            initiative=14,
        )
    )
    strikes = _multiattack_strikes(
        actor,
        monster,
        detail="The aarakocra makes two attacks, using Talons and Longbow in any combination.",
    )
    assert len(strikes) == 2
    assert all(profile.attack_bonus is not None for _, profile in strikes)


def test_death_save_stable_stops_dying():
    from app.api.schemas import EncounterCombatant as EC

    state = EncounterState(
        combatants=[
            EC(
                id="pc1",
                name="Hero",
                initiative=10,
                is_pc=True,
                character_id=1,
                hp=0,
                max_hp=20,
                death_save_successes=2,
            )
        ]
    )
    actor = state.combatants[0]
    # Force success path by mocking would be ideal; call until stable or use direct set
    actor.death_save_successes = 3
    actor.death_save_stable = True
    actor.death_save_failures = 0
    assert is_dying_pc(actor) is False

    # Unstable again after damage-at-zero marker
    from app.services.death_saves import mark_unstable_on_damage_at_zero

    mark_unstable_on_damage_at_zero(actor)
    assert actor.death_save_stable is False
    assert is_dying_pc(actor) is True
