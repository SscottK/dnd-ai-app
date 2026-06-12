"""Monster Multiattack resolution."""

from __future__ import annotations

import unittest

from app.api.schemas import CombatActionEntry, EncounterCombatant, EncounterState, UseActionRequest
from app.services.combat_resolution import _multiattack_strikes, resolve_attack


def _wolf_actor() -> EncounterCombatant:
    return EncounterCombatant(
        id="wolf-1",
        name="Wolf",
        srd_name="Wolf",
        initiative=12,
        is_pc=False,
        hp=11,
        max_hp=11,
        ac=13,
        combat_actions=[
            CombatActionEntry(
                id="action-0-multiattack",
                name="Multiattack",
                action_type="action",
                targeting="one_enemy",
                description="The wolf makes two Bite attacks.",
            ),
            CombatActionEntry(
                id="action-1-bite",
                name="Bite",
                action_type="action",
                targeting="one_enemy",
                attack_bonus=4,
                damage_dice="2d4+2",
            ),
        ],
    )


class CombatMultiattackTests(unittest.TestCase):
    def test_multiattack_strikes_from_stat_block_text(self) -> None:
        monster = {
            "stat_block_json": {
                "actions": [
                    {
                        "name": "Multiattack",
                        "description": "The wolf makes two Bite attacks.",
                    },
                    {
                        "name": "Bite",
                        "attack_bonus": 4,
                        "damage": [{"dice": "2d4+2", "type": "piercing"}],
                    },
                ]
            }
        }
        strikes = _multiattack_strikes(_wolf_actor(), monster, detail=None)
        self.assertEqual(len(strikes), 2)
        self.assertEqual(strikes[0][0], "Bite")
        self.assertEqual(strikes[0][1].attack_bonus, 4)

    def test_multiattack_fallback_uses_combatant_actions(self) -> None:
        strikes = _multiattack_strikes(_wolf_actor(), None, detail=None)
        self.assertEqual(len(strikes), 2)
        self.assertEqual(strikes[0][0], "Bite")

    def test_resolve_attack_rolls_multiattack(self) -> None:
        state = EncounterState(
            combatants=[
                _wolf_actor(),
                EncounterCombatant(
                    id="hero-1",
                    name="Hero",
                    initiative=14,
                    is_pc=True,
                    character_id=1,
                    hp=20,
                    max_hp=20,
                    ac=16,
                ),
            ]
        )
        request = UseActionRequest(
            action_id="action-0-multiattack",
            action_name="Multiattack",
            action_type="action",
            targeting="one_enemy",
            target_ids=["hero-1"],
        )
        messages = resolve_attack(
            None,
            1,
            state,
            actor=state.combatants[0],
            data=request,
        )
        self.assertTrue(messages)
        self.assertTrue(any("attacks Hero" in message for message in messages))


if __name__ == "__main__":
    unittest.main()
