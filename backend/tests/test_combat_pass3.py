"""Combat pass 3: multi-type damage, PC resists, conditions, saves."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant
from app.services.combat_damage import (
    apply_damage_modifiers,
    apply_damage_packets,
    parse_damage_packets,
)
from app.services.combat_save_effects import _ability_mod_for_target
from app.services.condition_attack_mods import attack_advantage_flags, is_auto_crit_melee
from app.services.monster_action_parse import parse_attack_stats_from_text


def test_parse_multi_type_damage_packets():
    text = (
        "Melee Attack Roll: +9. Hit: 17 (2d10 + 6) Piercing damage plus 4 (1d8) Acid damage."
    )
    packets = parse_damage_packets(text)
    assert len(packets) == 2
    assert packets[0].dice == "2d10+6"
    assert packets[0].damage_type == "piercing"
    assert packets[1].dice == "1d8"
    assert packets[1].damage_type == "acid"

    parsed = parse_attack_stats_from_text(text)
    assert parsed.damage_packets is not None
    assert len(parsed.damage_packets) == 2


def test_apply_packets_respects_per_type_immunity():
    target = EncounterCombatant(
        id="t1",
        name="Hero",
        initiative=10,
        is_pc=True,
        damage_immunities=["acid"],
        damage_resistances=["piercing"],
    )
    applied = apply_damage_packets(
        [(10, "piercing"), (8, "acid")],
        combatant=target,
    )
    assert applied.amount == 5  # piercing halved, acid zeroed
    assert applied.original == 18


def test_pc_sheet_resist_on_combatant():
    target = EncounterCombatant(
        id="pc1",
        name="Dragonborn",
        initiative=12,
        is_pc=True,
        character_id=1,
        damage_resistances=["Fire"],
    )
    applied = apply_damage_modifiers(20, damage_type="fire", combatant=target)
    assert applied.amount == 10
    assert applied.note and "resistant" in applied.note


def test_condition_attack_flags_blinded_and_prone():
    adv, dis, tags = attack_advantage_flags(
        actor_conditions=["Blinded"],
        target_conditions=["Prone"],
        action_name="Longsword",
        detail="Melee Attack Roll: +5.",
    )
    assert adv is True
    assert dis is True
    assert any("blinded" in t for t in tags)
    assert any("prone" in t for t in tags)

    adv_r, dis_r, _ = attack_advantage_flags(
        actor_conditions=[],
        target_conditions=["Prone"],
        action_name="Longbow",
        detail="Ranged Attack Roll: +5.",
    )
    assert adv_r is False
    assert dis_r is True


def test_auto_crit_vs_unconscious_melee():
    assert is_auto_crit_melee(
        target_conditions=["Unconscious"],
        action_name="Mace",
        detail="Melee Attack Roll: +4.",
    )
    assert not is_auto_crit_melee(
        target_conditions=["Unconscious"],
        action_name="Longbow",
        detail="Ranged Attack Roll: +4.",
    )


def test_pc_save_mod_uses_sheet(monkeypatch):
    class FakeCharacter:
        sheet_json = (
            '{"abilities":{"dex":16},"proficiency_bonus":3,'
            '"saving_throws":[{"ability":"dex","proficient":true,"bonus":null}]}'
        )
        class_name = "Rogue"
        level = 5

    class FakeSession:
        def get(self, model, pk):
            return FakeCharacter()

    target = EncounterCombatant(
        id="pc1",
        name="Rogue",
        initiative=14,
        is_pc=True,
        character_id=99,
    )
    mod = _ability_mod_for_target(target, "Dexterity", session=FakeSession())
    assert mod == 6  # +3 dex +3 prof
