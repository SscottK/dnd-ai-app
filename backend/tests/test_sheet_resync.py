"""PDF resync merge preserves player edits."""

from __future__ import annotations

import unittest

from app.services.character_sheet import merge_sheet_on_resync, normalize_sheet
from app.services.sheet_enrichment import normalize_classes, prune_sheet_to_class_levels


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

    def test_old_class_resource_not_kept_when_missing_from_new_parse(self) -> None:
        """Level-down re-sync must not keep Action Surge / Focus from the old sheet."""
        old = {
            "resources": [
                {"id": "action-surge", "name": "Action Surge", "current": 1, "max": 1},
                {"id": "second-wind", "name": "Second Wind", "current": 1, "max": 2},
            ],
        }
        new = {
            "resources": [
                {"id": "second-wind", "name": "Second Wind", "current": 2, "max": 2},
            ],
        }
        merged = merge_sheet_on_resync(old, new)
        ids = {entry["id"] for entry in merged["resources"]}
        self.assertEqual(ids, {"second-wind"})
        self.assertEqual(merged["resources"][0]["current"], 1)

    def test_ac_overrides_preserved_when_new_parse_omits_them(self) -> None:
        old = {
            "authoritative_ac": 18,
            "ac_bonuses": [{"name": "Defense", "bonus": 1}],
        }
        new = {}
        merged = merge_sheet_on_resync(old, new)
        self.assertEqual(merged["authoritative_ac"], 18)
        self.assertEqual(merged["ac_bonuses"][0]["bonus"], 1)

    def test_normalize_classes_syncs_single_class_to_top_level(self) -> None:
        classes = normalize_classes(
            {"classes": [{"name": "Fighter", "level": 2}]},
            class_name="Fighter",
            level=1,
        )
        self.assertEqual(classes[0]["level"], 1)

    def test_prune_drops_action_surge_at_level_1(self) -> None:
        sheet = {
            "combat_actions": [
                {"id": "second-wind", "name": "Second Wind", "action_type": "bonus_action"},
                {"id": "action-surge", "name": "Action Surge", "action_type": "action"},
            ],
            "features": [
                {"name": "Second Wind", "description": "..."},
                {"name": "Action Surge (one use)", "description": "..."},
            ],
            "resources": [
                {"id": "second-wind", "name": "Second Wind", "current": 2, "max": 2},
                {"id": "action-surge", "name": "Action Surge", "current": 1, "max": 1},
            ],
        }
        pruned = prune_sheet_to_class_levels(
            sheet, [{"name": "Fighter", "level": 1, "subclass": None}]
        )
        action_names = {str(a["name"]) for a in pruned["combat_actions"]}
        feature_names = {str(f["name"]) for f in pruned["features"]}
        resource_ids = {str(r["id"]) for r in pruned["resources"]}
        self.assertIn("Second Wind", action_names)
        self.assertNotIn("Action Surge", action_names)
        self.assertTrue(all("Action Surge" not in name for name in feature_names))
        self.assertIn("second-wind", resource_ids)
        self.assertNotIn("action-surge", resource_ids)

    def test_level_down_resync_removes_action_surge(self) -> None:
        old = {
            "abilities": {"str": 16, "dex": 14, "con": 14, "int": 10, "wis": 12, "cha": 8},
            "proficiency_bonus": 2,
            "classes": [{"name": "Fighter", "level": 2}],
            "features": [
                {"name": "Second Wind"},
                {"name": "Action Surge"},
                {"name": "Fighting Style"},
            ],
            "combat_actions": [
                {"name": "Second Wind", "action_type": "bonus_action", "targeting": "self"},
                {"name": "Action Surge", "action_type": "action", "targeting": "self"},
            ],
            "resources": [
                {"id": "second-wind", "name": "Second Wind", "current": 1, "max": 2},
                {"id": "action-surge", "name": "Action Surge", "current": 1, "max": 1},
            ],
        }
        new = {
            "abilities": {"str": 16, "dex": 14, "con": 14, "int": 10, "wis": 12, "cha": 8},
            "proficiency_bonus": 2,
            "classes": [{"name": "Fighter", "level": 1}],
            "features": [
                {"name": "Second Wind"},
                {"name": "Fighting Style"},
            ],
            "combat_actions": [
                {"name": "Second Wind", "action_type": "bonus_action", "targeting": "self"},
            ],
            "resources": [
                {"id": "second-wind", "name": "Second Wind", "current": 2, "max": 2},
            ],
        }
        merged = merge_sheet_on_resync(old, new)
        sheet = normalize_sheet(merged, class_name="Fighter", level=1)
        action_names = {str(a.get("name")) for a in sheet.get("combat_actions") or []}
        resource_ids = {str(r.get("id")) for r in sheet.get("resources") or []}
        self.assertIn("Second Wind", action_names)
        self.assertNotIn("Action Surge", action_names)
        self.assertNotIn("action-surge", resource_ids)
        self.assertEqual(sheet["classes"][0]["level"], 1)


if __name__ == "__main__":
    unittest.main()
