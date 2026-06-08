"""AC calculation tests — shields, armor, and fighting style bonuses."""

from __future__ import annotations

import unittest

from app.services.character_ac import compute_sheet_ac, estimate_equipment_ac


def _fighter_sheet(**overrides):
    sheet = {
        "abilities": {"dex": 10},
        "inventory": [
            {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
            {"name": "Shield", "equipped": True, "id": "shield-1"},
        ],
        "features": [{"name": "Defense", "source": "Fighting Style"}],
        "ac_bonuses": [
            {"name": "Defense (Fighting Style)", "bonus": 1, "requires_armor": True}
        ],
    }
    sheet.update(overrides)
    return sheet


class CharacterAcTests(unittest.TestCase):
    def test_basic_shield_ignores_rules_text_in_notes(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
                {
                    "name": "Shield",
                    "equipped": True,
                    "id": "shield-1",
                    "ac_bonus": 2,
                    "notes": "While you are wielding a shield, you gain a +2 bonus to AC",
                },
            ]
        )

        self.assertEqual(estimate_equipment_ac(sheet), 18)
        self.assertEqual(compute_sheet_ac(sheet), 19)

    def test_magic_shield_uses_name_bonus_only(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
                {"name": "+1 Shield", "equipped": True, "id": "shield-1", "ac_bonus": 1},
            ],
            ac_bonuses=[],
            features=[],
        )

        self.assertEqual(estimate_equipment_ac(sheet), 19)

    def test_non_magic_shield_strips_parsed_ac_bonus(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
                {"name": "Shield", "equipped": True, "id": "shield-1", "ac_bonus": 4},
            ]
        )

        self.assertEqual(estimate_equipment_ac(sheet), 18)

    def test_armor_ignores_rules_text_in_notes(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {
                    "name": "Chain Mail",
                    "equipped": True,
                    "id": "armor-1",
                    "notes": "Includes +1 enhancement from magic",
                },
            ],
            features=[],
            ac_bonuses=[],
        )

        self.assertEqual(estimate_equipment_ac(sheet), 16)
        self.assertEqual(compute_sheet_ac(sheet), 16)

    def test_non_magic_armor_strips_parsed_base_ac_bonus(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1", "ac_bonus": 16},
            ],
            features=[],
            ac_bonuses=[],
        )

        self.assertEqual(estimate_equipment_ac(sheet), 16)

    def test_magic_armor_uses_name_bonus_only(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "+1 Chain Mail", "equipped": True, "id": "armor-1", "ac_bonus": 1},
            ],
            features=[],
            ac_bonuses=[],
        )

        self.assertEqual(estimate_equipment_ac(sheet), 17)

    def test_ring_of_protection_not_double_counted(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
                {"name": "Ring of Protection", "equipped": True, "id": "ring-1"},
            ],
            features=[],
            ac_bonuses=[
                {"name": "Ring of Protection", "bonus": 1, "requires_armor": False}
            ],
        )

        self.assertEqual(compute_sheet_ac(sheet), 17)

    def test_cloak_of_protection_not_double_counted(self) -> None:
        sheet = _fighter_sheet(
            inventory=[
                {"name": "Chain Mail", "equipped": True, "id": "armor-1"},
                {"name": "Cloak of Protection", "equipped": True, "id": "cloak-1"},
            ],
            features=[],
            ac_bonuses=[
                {"name": "Cloak of Protection", "bonus": 1, "requires_armor": False}
            ],
        )

        self.assertEqual(compute_sheet_ac(sheet), 17)


if __name__ == "__main__":
    unittest.main()
