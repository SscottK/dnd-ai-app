"""PDF resync merge preserves player edits."""

from __future__ import annotations

import unittest

from app.services.character_sheet import merge_sheet_on_resync


class SheetResyncTests(unittest.TestCase):
    def test_resource_current_survives_resync(self) -> None:
        old = {
            "resources": [{"id": "rage", "name": "Rage", "current": 1, "max": 3}],
        }
        new = {
            "resources": [{"id": "rage", "name": "Rage", "current": 3, "max": 3}],
        }
        merged = merge_sheet_on_resync(old, new)
        self.assertEqual(merged["resources"][0]["current"], 1)

    def test_old_resource_rows_preserved_when_missing_from_new_parse(self) -> None:
        old = {
            "resources": [{"id": "focus", "name": "Focus Points", "current": 4, "max": 7}],
        }
        new = {"resources": []}
        merged = merge_sheet_on_resync(old, new)
        self.assertEqual(len(merged["resources"]), 1)
        self.assertEqual(merged["resources"][0]["id"], "focus")

    def test_ac_overrides_preserved_when_new_parse_omits_them(self) -> None:
        old = {
            "authoritative_ac": 18,
            "ac_bonuses": [{"name": "Defense", "bonus": 1}],
        }
        new = {}
        merged = merge_sheet_on_resync(old, new)
        self.assertEqual(merged["authoritative_ac"], 18)
        self.assertEqual(merged["ac_bonuses"][0]["bonus"], 1)


if __name__ == "__main__":
    unittest.main()
