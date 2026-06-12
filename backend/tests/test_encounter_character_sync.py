"""Encounter ↔ character HP/AC/conditions sync."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock

from app.api.schemas import EncounterCombatant, EncounterState
from app.db.models import Campaign, Character
from app.services.encounter_sync import (
    sync_character_combat_stats,
    sync_encounter_combatants_to_characters,
)


def _pc_combatant(**overrides) -> EncounterCombatant:
    base = dict(
        id="pc-1",
        name="Hero",
        initiative=12,
        is_pc=True,
        character_id=1,
        hp=10,
        max_hp=10,
        ac=16,
        conditions=[],
    )
    base.update(overrides)
    return EncounterCombatant(**base)


class EncounterCharacterSyncTests(unittest.TestCase):
    def test_encounter_changes_push_to_character_and_sheet(self) -> None:
        character = Character(
            id=1,
            user_id=1,
            name="Hero",
            hp=10,
            max_hp=10,
            ac=16,
            sheet_json=json.dumps({"conditions": []}),
        )
        session = MagicMock()
        session.get.return_value = character

        before = EncounterState(combatants=[_pc_combatant()])
        after = EncounterState(
            combatants=[_pc_combatant(hp=4, ac=17, conditions=["Poisoned"])]
        )

        sync_encounter_combatants_to_characters(session, before, after)

        self.assertEqual(character.hp, 4)
        self.assertEqual(character.ac, 17)
        sheet = json.loads(character.sheet_json)
        self.assertEqual(sheet["conditions"], ["Poisoned"])
        session.add.assert_called_with(character)

    def test_unchanged_combatant_skips_character_write(self) -> None:
        character = Character(
            id=1,
            user_id=1,
            name="Hero",
            hp=10,
            max_hp=10,
            ac=16,
            sheet_json="{}",
        )
        session = MagicMock()
        session.get.return_value = character

        combatant = _pc_combatant()
        state = EncounterState(combatants=[combatant])
        sync_encounter_combatants_to_characters(session, state, state)

        session.add.assert_not_called()

    def test_character_sheet_edit_syncs_to_encounter(self) -> None:
        campaign = Campaign(
            id=1,
            name="Test",
            owner_id=1,
            invite_code="TESTCODE12",
            encounter_json=json.dumps(
            EncounterState(
                combatants=[_pc_combatant(hp=10, max_hp=10, ac=16, conditions=[])]
            ).model_dump()
            ),
        )
        session = MagicMock()
        session.get.return_value = campaign

        sync_character_combat_stats(
            session,
            campaign_id=1,
            character_id=1,
            hp=3,
            max_hp=10,
            ac=18,
            conditions=["Grappled"],
        )

        state = EncounterState.model_validate(json.loads(campaign.encounter_json))
        combatant = state.combatants[0]
        self.assertEqual(combatant.hp, 3)
        self.assertEqual(combatant.ac, 18)
        self.assertEqual(combatant.conditions, ["Grappled"])
        session.add.assert_called_with(campaign)


if __name__ == "__main__":
    unittest.main()
