"""Team initiative mode tests."""

from __future__ import annotations

import unittest

from app.api.schemas import EncounterCombatant, EncounterState, TeamInitiativeState
from app.services.team_initiative import (
    PARTY_SLOT,
    compute_party_initiative,
    pass_combat_to,
    rebuild_turn_slots,
    set_initiative_mode,
    start_party_phase,
)


def _pc(combatant_id: str, name: str, initiative: int = 0) -> EncounterCombatant:
    return EncounterCombatant(
        id=combatant_id,
        name=name,
        initiative=initiative,
        is_pc=True,
        character_id=1,
    )


def _enemy(combatant_id: str, name: str, initiative: int) -> EncounterCombatant:
    return EncounterCombatant(
        id=combatant_id,
        name=name,
        initiative=initiative,
        is_pc=False,
    )


class TeamInitiativeTests(unittest.TestCase):
    def test_compute_party_initiative_floors_average(self) -> None:
        self.assertEqual(compute_party_initiative({"a": 18, "b": 11}), 14)

    def test_turn_slots_include_party_between_enemies(self) -> None:
        state = EncounterState(
            initiative_mode="team",
            team=TeamInitiativeState(party_initiative=12),
            combatants=[
                _enemy("goblin", "Goblin", 16),
                _pc("hero", "Hero", 18),
                _enemy("wolf", "Wolf", 8),
            ],
        )
        slots = rebuild_turn_slots(state)
        self.assertEqual(slots[0], "goblin")
        self.assertIn(PARTY_SLOT, slots)
        self.assertEqual(slots[-1], "wolf")

    def test_pass_combat_marks_complete_and_switches_active(self) -> None:
        state = EncounterState(
            initiative_mode="team",
            team=TeamInitiativeState(
                party_phase_active=True,
                initiative_rolls={"a": 15, "b": 10},
            ),
            active_combatant_id="a",
            combatants=[_pc("a", "Alpha", 15), _pc("b", "Bravo", 10)],
        )

        pass_combat_to(state, target_combatant_id="b", passer_combatant_id="a")

        self.assertEqual(state.active_combatant_id, "b")
        self.assertIn("a", state.team.completed_this_phase)
        self.assertTrue(state.team.party_phase_active)

    def test_set_mode_requires_pre_combat(self) -> None:
        state = EncounterState(
            round=2,
            combatants=[_pc("a", "Alpha", 10)],
        )
        with self.assertRaises(Exception):
            set_initiative_mode(state, "team")

    def test_start_party_phase_picks_highest_roller(self) -> None:
        state = EncounterState(
            initiative_mode="team",
            team=TeamInitiativeState(initiative_rolls={"a": 12, "b": 19}),
            combatants=[_pc("a", "Alpha", 12), _pc("b", "Bravo", 19)],
        )
        start_party_phase(state)
        self.assertTrue(state.team.party_phase_active)
        self.assertEqual(state.active_combatant_id, "b")


if __name__ == "__main__":
    unittest.main()
