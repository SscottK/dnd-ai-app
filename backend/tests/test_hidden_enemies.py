"""Hidden enemy visibility and reveal during combat."""

from __future__ import annotations

import unittest

from app.api.schemas import CombatLogEntry, EncounterCombatant, EncounterState
from app.services.encounter_actions import can_take_turn, reveal_hidden_combatant
from app.services.encounter_sync import encounter_for_viewer


def _hidden_goblin() -> EncounterCombatant:
    return EncounterCombatant(
        id="goblin-1",
        name="Goblin 1",
        srd_name="Goblin",
        initiative=0,
        is_pc=False,
        hidden_from_players=True,
    )


class HiddenEnemyTests(unittest.TestCase):
    def test_hidden_enemies_excluded_from_turn_order(self) -> None:
        goblin = _hidden_goblin()
        self.assertFalse(can_take_turn(goblin))

    def test_players_do_not_see_hidden_enemies(self) -> None:
        state = EncounterState(
            combatants=[
                _hidden_goblin(),
                EncounterCombatant(
                    id="wolf-1",
                    name="Wolf",
                    initiative=12,
                    is_pc=False,
                ),
            ]
        )
        view = encounter_for_viewer(state, is_owner=False)
        self.assertEqual([combatant.name for combatant in view.combatants], ["Wolf"])

    def test_dm_sees_hidden_enemies(self) -> None:
        state = EncounterState(combatants=[_hidden_goblin()])
        view = encounter_for_viewer(state, is_owner=True)
        self.assertEqual(len(view.combatants), 1)
        self.assertTrue(view.combatants[0].hidden_from_players)

    def test_reveal_during_combat_rolls_initiative(self) -> None:
        state = EncounterState(
            round=2,
            combat_log=[CombatLogEntry(at="2026-01-01T00:00:00Z", kind="turn", message="Goblin turn")],
            combatants=[_hidden_goblin()],
        )
        revealed = reveal_hidden_combatant(state, "goblin-1")
        self.assertFalse(revealed.hidden_from_players)
        self.assertGreater(revealed.initiative, 0)
        self.assertTrue(can_take_turn(revealed))


if __name__ == "__main__":
    unittest.main()
