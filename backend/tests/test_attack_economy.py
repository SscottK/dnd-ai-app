"""Extra Attack economy and multi-target weapon resolution."""

from __future__ import annotations

import json
import unittest

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot, UseActionRequest
from app.db.models import Campaign, Character
from app.services.attack_economy import attack_budget_for_actor, attacks_per_attack_action
from app.services.combat_resolution import resolve_attack


class AttackEconomyTests(unittest.TestCase):
    def test_attacks_per_attack_action_counts_extra_attack(self) -> None:
        sheet = {
            "features": [{"name": "Extra Attack", "passive": True}],
            "attacks": [{"name": "Longsword", "to_hit": 5, "damage": "1d8+3"}],
        }
        self.assertEqual(attacks_per_attack_action(sheet), 2)

    def test_multi_target_weapon_attack_consumes_both_swings(self) -> None:
        campaign = Campaign(id=1, name="Test", owner_id=1, invite_code="abc")
        character = Character(
            id=1,
            campaign_id=1,
            user_id=2,
            name="Fighter",
            class_name="Fighter",
            level=5,
            sheet_json=json.dumps(
                {
                    "features": [{"name": "Extra Attack", "passive": True}],
                    "attacks": [
                        {
                            "id": "attack-longsword",
                            "name": "Longsword",
                            "to_hit": 5,
                            "damage": "1d8+3",
                        }
                    ],
                    "abilities": {"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 10},
                    "proficiency_bonus": 3,
                }
            ),
        )

        class _Session:
            def get(self, _model, pk):
                return character if pk == 1 else None

        actor = EncounterCombatant(
            id="pc-1",
            name="Fighter",
            initiative=15,
            is_pc=True,
            character_id=1,
            hp=30,
            max_hp=30,
            ac=16,
        )
        goblin_a = EncounterCombatant(
            id="gob-1",
            name="Goblin A",
            initiative=10,
            is_pc=False,
            hp=10,
            max_hp=10,
            ac=13,
        )
        goblin_b = EncounterCombatant(
            id="gob-2",
            name="Goblin B",
            initiative=8,
            is_pc=False,
            hp=10,
            max_hp=10,
            ac=13,
        )
        state = EncounterState(
            active_combatant_id="pc-1",
            combatants=[actor, goblin_a, goblin_b],
            turn_economy={"pc-1": TurnEconomySnapshot()},
        )

        self.assertEqual(attack_budget_for_actor(_Session(), 1, actor), 2)

        request = UseActionRequest(
            action_id="attack-longsword",
            action_name="Longsword",
            action_type="action",
            targeting="one_enemy",
            target_ids=["gob-1", "gob-2"],
        )
        messages = resolve_attack(_Session(), 1, state, actor=actor, data=request)
        self.assertTrue(messages)
        economy = state.turn_economy["pc-1"]
        self.assertTrue(economy.action_used)
        self.assertEqual(economy.attacks_remaining, 0)


if __name__ == "__main__":
    unittest.main()
