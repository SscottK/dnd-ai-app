"""Regression tests for initiative turn reconciliation."""

from __future__ import annotations

import unittest

from app.api.schemas import EncounterCombatant, EncounterState
from app.services.encounter_actions import (
    advance_turn,
    ensure_active_combatant,
    reset_active_to_top_of_initiative,
    sorted_combatants,
)


def _combatant(
    combatant_id: str,
    name: str,
    initiative: int,
    *,
    is_pc: bool = False,
    hp: int = 10,
) -> EncounterCombatant:
    return EncounterCombatant(
        id=combatant_id,
        name=name,
        initiative=initiative,
        is_pc=is_pc,
        hp=hp,
        max_hp=10,
    )


class EncounterTurnTests(unittest.TestCase):
    def test_defeated_active_passes_to_next_in_initiative(self) -> None:
        state = EncounterState(
            round=1,
            active_combatant_id="b",
            active_index=1,
            combatants=[
                _combatant("a", "Alpha", 20, is_pc=True),
                _combatant("b", "Brute", 15, hp=0),
                _combatant("c", "Charlie", 10, is_pc=True),
            ],
        )

        changed = ensure_active_combatant(state)

        self.assertTrue(changed)
        self.assertEqual(state.active_combatant_id, "c")
        self.assertEqual(state.round, 1)

    def test_advance_turn_from_defeated_active(self) -> None:
        state = EncounterState(
            round=1,
            active_combatant_id="b",
            active_index=1,
            combatants=[
                _combatant("a", "Alpha", 20, is_pc=True),
                _combatant("b", "Brute", 15, hp=0),
                _combatant("c", "Charlie", 10, is_pc=True),
            ],
        )

        advance_turn(state)

        self.assertEqual(state.active_combatant_id, "c")

    def test_advance_turn_cycles_living_combatants(self) -> None:
        state = EncounterState(
            round=1,
            active_combatant_id="c",
            active_index=1,
            combatants=[
                _combatant("a", "Alpha", 20, is_pc=True),
                _combatant("c", "Charlie", 10, is_pc=True),
            ],
        )

        advance_turn(state)
        self.assertEqual(state.active_combatant_id, "a")
        self.assertEqual(state.round, 2)

    def test_defeated_enemies_leave_turn_order(self) -> None:
        state = EncounterState(
            combatants=[
                _combatant("a", "Alpha", 20, is_pc=True),
                _combatant("b", "Brute", 15, hp=0),
            ]
        )

        ordered = sorted_combatants(state)

        self.assertEqual([combatant.id for combatant in ordered], ["a"])

    def test_setup_waits_for_pc_initiative_before_activating_enemy(self) -> None:
        state = EncounterState(
            round=1,
            active_combatant_id="goblin",
            active_index=0,
            combatants=[
                _combatant("goblin", "Goblin", 14),
                _combatant("pc", "Hero", 0, is_pc=True),
            ],
        )

        changed = reset_active_to_top_of_initiative(state)

        self.assertTrue(changed)
        self.assertIsNone(state.active_combatant_id)
        self.assertEqual(state.active_index, 0)

    def test_setup_activates_top_initiative_after_all_pcs_roll(self) -> None:
        state = EncounterState(
            round=1,
            combatants=[
                _combatant("goblin", "Goblin", 14),
                _combatant("pc", "Hero", 18, is_pc=True),
            ],
        )

        reset_active_to_top_of_initiative(state)

        self.assertEqual(state.active_combatant_id, "pc")
        self.assertEqual(state.active_index, 0)


if __name__ == "__main__":
    unittest.main()
