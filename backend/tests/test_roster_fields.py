"""Roster display fields from character sheets."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace

from app.services.character_sheet import roster_fields_from_character, species_from_sheet


class RosterFieldsTests(unittest.TestCase):
    def test_species_from_race_field(self) -> None:
        sheet = {"race": "Elf", "resources": []}
        self.assertEqual(species_from_sheet(sheet), "Elf")

    def test_roster_resources_from_sheet(self) -> None:
        character = SimpleNamespace(
            class_name="Bard",
            level=5,
            sheet_json=json.dumps(
                {
                    "race": "Human",
                    "resources": [
                        {"id": "heroic-inspiration", "name": "Heroic Inspiration", "current": 1},
                        {"id": "i-know-a-guy", "name": "I Know a Guy", "current": 2, "max": 2},
                    ],
                }
            ),
        )
        fields = roster_fields_from_character(character)
        self.assertEqual(fields["race"], "Human")
        self.assertEqual(fields["heroic_inspiration"], 1)
        self.assertEqual(fields["i_know_a_guy"], 2)


if __name__ == "__main__":
    unittest.main()
