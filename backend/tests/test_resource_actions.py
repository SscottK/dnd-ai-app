"""Combat resource spend validation."""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock

from app.api.schemas import EncounterCombatant, UseActionRequest
from app.db.models import Character
from app.services.resource_actions import ensure_action_resource_available, spend_action_resource


class ResourceActionTests(unittest.TestCase):
    def _actor_with_rage(self, current: int) -> tuple[EncounterCombatant, Character, MagicMock]:
        character = Character(
            id=1,
            user_id=1,
            campaign_id=1,
            name="Barbarian",
            sheet_json=json.dumps(
                {
                    "resources": [
                        {"id": "rage", "name": "Rage", "current": current, "max": 3},
                    ],
                    "combat_actions": [
                        {
                            "id": "rage",
                            "name": "Rage",
                            "action_type": "bonus_action",
                            "resource_cost": {"resource_id": "rage", "amount": 1},
                        }
                    ],
                }
            ),
        )
        session = MagicMock()
        session.get.return_value = character
        actor = EncounterCombatant(
            id="pc-1",
            name="Barbarian",
            initiative=10,
            is_pc=True,
            character_id=1,
        )
        return actor, character, session

    def test_ensure_rejects_insufficient_resource(self) -> None:
        actor, _, session = self._actor_with_rage(0)
        data = UseActionRequest(
            action_id="rage",
            action_name="Rage",
            action_type="bonus_action",
            targeting="self",
        )
        with self.assertRaises(ValueError):
            ensure_action_resource_available(session, 1, actor=actor, data=data)

    def test_spend_decrements_resource(self) -> None:
        actor, character, session = self._actor_with_rage(2)
        data = UseActionRequest(
            action_id="rage",
            action_name="Rage",
            action_type="bonus_action",
            targeting="self",
        )
        messages = spend_action_resource(session, 1, actor=actor, data=data)
        self.assertEqual(len(messages), 2)
        self.assertTrue(actor.raging)
        sheet = json.loads(character.sheet_json)
        self.assertEqual(sheet["resources"][0]["current"], 1)


if __name__ == "__main__":
    unittest.main()
