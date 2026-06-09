"""Readied (Ready) action trigger and cancel tests."""

from __future__ import annotations

import unittest

from app.api.schemas import EncounterCombatant, EncounterState, TurnEconomySnapshot
from app.services.readied_actions import (
    ReadiedActionError,
    cancel_readied_action,
    trigger_readied_action,
)


def _pc(combatant_id: str, name: str) -> EncounterCombatant:
    return EncounterCombatant(
        id=combatant_id,
        name=name,
        initiative=10,
        is_pc=True,
        character_id=1,
    )


class ReadiedActionTests(unittest.TestCase):
    def test_trigger_spends_reaction_and_clears_ready(self) -> None:
        state = EncounterState(
            combatants=[_pc("hero", "Hero")],
            turn_economy={
                "hero": TurnEconomySnapshot(
                    readied_action="Fire Bolt",
                    readied_trigger="goblin moves",
                ),
            },
        )

        messages = trigger_readied_action(state, combatant_id="hero")
        economy = state.turn_economy["hero"]

        self.assertTrue(economy.reaction_used)
        self.assertIsNone(economy.readied_action)
        self.assertIsNone(economy.readied_trigger)
        self.assertEqual(len(messages), 1)
        self.assertIn("Fire Bolt", messages[0])

    def test_trigger_blocks_without_ready(self) -> None:
        state = EncounterState(combatants=[_pc("hero", "Hero")])
        with self.assertRaises(ReadiedActionError):
            trigger_readied_action(state, combatant_id="hero")

    def test_trigger_blocks_when_reaction_spent(self) -> None:
        state = EncounterState(
            combatants=[_pc("hero", "Hero")],
            turn_economy={
                "hero": TurnEconomySnapshot(
                    reaction_used=True,
                    readied_action="Attack",
                ),
            },
        )
        with self.assertRaises(ReadiedActionError):
            trigger_readied_action(state, combatant_id="hero")

    def test_cancel_clears_without_spending_reaction(self) -> None:
        state = EncounterState(
            combatants=[_pc("hero", "Hero")],
            turn_economy={
                "hero": TurnEconomySnapshot(readied_action="Dodge"),
            },
        )

        cancel_readied_action(state, combatant_id="hero")
        economy = state.turn_economy["hero"]

        self.assertFalse(economy.reaction_used)
        self.assertIsNone(economy.readied_action)


if __name__ == "__main__":
    unittest.main()
