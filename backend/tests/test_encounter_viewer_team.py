"""Player/DM encounter redaction in team initiative mode."""

from __future__ import annotations

import unittest

from app.api.schemas import EncounterCombatant, EncounterState, TeamInitiativeState
from app.services.encounter_sync import encounter_for_viewer
from app.services.team_initiative import PARTY_SLOT


def _pc(combatant_id: str, name: str, initiative: int = 14) -> EncounterCombatant:
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


class EncounterViewerTeamTests(unittest.TestCase):
    def _team_combat_state(self) -> EncounterState:
        return EncounterState(
            round=2,
            initiative_mode="team",
            active_combatant_id="hero",
            combat_log=[],
            team=TeamInitiativeState(
                party_initiative=14,
                party_phase_active=True,
                party_roster=[],
                turn_slots=["goblin", PARTY_SLOT, "wolf"],
                turn_slot_index=1,
                initiative_rolls={"hero": 16, "ally": 12},
            ),
            combatants=[
                _enemy("goblin", "Goblin", 18),
                _pc("hero", "Hero", 16),
                _pc("ally", "Ally", 12),
                _enemy("wolf", "Wolf", 8),
            ],
        )

    def test_dm_view_keeps_pc_combatants_and_turn_slots(self) -> None:
        state = self._team_combat_state()
        view = encounter_for_viewer(state, is_owner=True)

        self.assertEqual(len(view.combatants), 4)
        self.assertEqual(view.team.party_initiative, 14)
        self.assertEqual(view.team.turn_slots, ["goblin", PARTY_SLOT, "wolf"])
        self.assertEqual(len(view.team.party_roster), 2)

    def test_player_view_hides_pc_rows_but_keeps_party_tracker_data(self) -> None:
        state = self._team_combat_state()
        view = encounter_for_viewer(state, is_owner=False)

        self.assertEqual([combatant.name for combatant in view.combatants], ["Goblin", "Wolf"])
        self.assertEqual(view.team.party_initiative, 14)
        self.assertEqual(view.team.turn_slots, ["goblin", PARTY_SLOT, "wolf"])
        self.assertEqual(len(view.team.party_roster), 2)
        self.assertEqual(view.team.initiative_rolls, {})


if __name__ == "__main__":
    unittest.main()
