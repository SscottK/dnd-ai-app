"""Out-of-combat action log rolls."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from app.api.schemas import ActionRollRequest
from app.services.action_log_roll import perform_action_roll


def _sheet():
    return {
        "abilities": {"dex": 14, "wis": 12},
        "proficiency_bonus": 2,
        "skills": [
            {
                "name": "Stealth",
                "ability": "dex",
                "proficient": True,
                "expertise": False,
            }
        ],
        "saving_throws": [
            {"ability": "dex", "proficient": True},
            {"ability": "wis", "proficient": False},
        ],
    }


class ActionLogRollTests(unittest.TestCase):
    def setUp(self) -> None:
        self.campaign = MagicMock()
        self.campaign.session_active = True
        self.campaign.action_log_json = "[]"

        self.character = MagicMock()
        self.character.id = 7
        self.character.campaign_id = 1
        self.character.name = "Rogue"
        self.character.class_name = "Rogue"
        self.character.level = 5
        self.character.sheet_json = __import__("json").dumps(_sheet())

        self.user = MagicMock()
        self.user.id = 2
        self.user.username = "player1"

        self.membership = MagicMock()
        self.membership.character_id = 7

        self.session = MagicMock()
        self.session.get.side_effect = lambda model, pk: {
            7: self.character,
        }.get(pk)

    def test_skill_roll_uses_sheet_bonus(self) -> None:
        with (
            unittest.mock.patch(
                "app.services.action_log_roll.parse_encounter",
                return_value=MagicMock(combatants=[]),
            ),
            unittest.mock.patch(
                "app.services.action_log_roll.get_campaign_member_for_user",
                return_value=self.membership,
            ),
            unittest.mock.patch(
                "app.services.action_log_roll.parse_sheet_json",
                return_value=_sheet(),
            ),
        ):
            entry = perform_action_roll(
                self.session,
                self.campaign,
                self.user,
                ActionRollRequest(roll_kind="skill", label="Stealth"),
            )

        self.assertEqual(entry.kind, "skill")
        self.assertEqual(entry.bonus, 4)
        self.assertIn("Stealth check", entry.message)

    def test_save_roll_uses_sheet_bonus(self) -> None:
        with (
            unittest.mock.patch(
                "app.services.action_log_roll.parse_encounter",
                return_value=MagicMock(combatants=[]),
            ),
            unittest.mock.patch(
                "app.services.action_log_roll.get_campaign_member_for_user",
                return_value=self.membership,
            ),
            unittest.mock.patch(
                "app.services.action_log_roll.parse_sheet_json",
                return_value=_sheet(),
            ),
        ):
            entry = perform_action_roll(
                self.session,
                self.campaign,
                self.user,
                ActionRollRequest(roll_kind="save", label="dex"),
            )

        self.assertEqual(entry.kind, "save")
        self.assertEqual(entry.bonus, 4)
        self.assertIn("DEX save", entry.message)


if __name__ == "__main__":
    unittest.main()
