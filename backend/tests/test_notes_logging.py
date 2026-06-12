"""Notes distribution helpers for combat and action logs."""

from __future__ import annotations

import json
import unittest

from app.api.schemas import ActionLogEntry, CombatLogEntry, EncounterCombatant, EncounterState
from app.services.action_log import build_action_log_text
from app.services.combat_log import (
    COMBAT_LOG_TAB_ID,
    append_combat_log_to_layout,
    build_combat_log_text,
)
from app.services.play_session_notes import append_text_to_notes_tab


class NotesLoggingTests(unittest.TestCase):
    def test_combat_log_appends_to_notes_log_tab_without_switching_active(self) -> None:
        layout = {
            "widgets": [
                {
                    "type": "player_notes",
                    "playerNotesTabs": [
                        {"id": "notes-session", "title": "Session", "content": "Prep"},
                        {"id": COMBAT_LOG_TAB_ID, "title": "Log", "content": ""},
                    ],
                    "activeNotesTabId": "notes-session",
                }
            ]
        }
        updated = append_combat_log_to_layout(layout, "Round 3 ended.")
        widget = updated["widgets"][0]
        log_tab = next(tab for tab in widget["playerNotesTabs"] if tab["id"] == COMBAT_LOG_TAB_ID)
        self.assertIn("Round 3 ended.", log_tab["content"])
        self.assertEqual(widget["activeNotesTabId"], "notes-session")

    def test_action_log_appends_to_play_session_tab(self) -> None:
        layout = {"widgets": []}
        updated = append_text_to_notes_tab(
            layout,
            "notes-play-99",
            "Stealth check: 18",
            switch_active=False,
        )
        widget = next(w for w in updated["widgets"] if w["type"] == "player_notes")
        tab = next(t for t in widget["playerNotesTabs"] if t["id"] == "notes-play-99")
        self.assertEqual(tab["content"], "Stealth check: 18")

    def test_build_combat_log_text_includes_order_and_events(self) -> None:
        state = EncounterState(
            round=2,
            combatants=[
                EncounterCombatant(id="g1", name="Goblin", initiative=18, is_pc=False, hp=4, max_hp=7),
                EncounterCombatant(
                    id="p1", name="Hero", initiative=14, is_pc=True, character_id=1, hp=10, max_hp=10
                ),
            ],
            combat_log=[
                CombatLogEntry(at="2026-06-05T12:00:00Z", message="Hero hits Goblin", kind="event", actor="Hero"),
            ],
        )
        text = build_combat_log_text(state, "Victory — all enemies defeated.")
        self.assertIn("COMBAT LOG", text)
        self.assertIn("Goblin", text)
        self.assertIn("Hero hits Goblin", text)
        self.assertIn("Victory — all enemies defeated.", text)

    def test_build_action_log_text_formats_entries(self) -> None:
        entries = [
            ActionLogEntry(
                at="2026-06-05T12:00:00Z",
                message="Stealth 18",
                kind="roll",
                roller_name="Rogue",
                character_name="Rogue",
                total=18,
            )
        ]
        text = build_action_log_text(entries)
        self.assertIn("ACTION LOG", text)
        self.assertIn("Stealth 18", text)

    def test_sequential_combat_log_appends_with_separator(self) -> None:
        layout = append_combat_log_to_layout(None, "First fight")
        updated = append_combat_log_to_layout(layout, "Second fight")
        widget = updated["widgets"][0]
        log_tab = next(tab for tab in widget["playerNotesTabs"] if tab["id"] == COMBAT_LOG_TAB_ID)
        self.assertIn("First fight", log_tab["content"])
        self.assertIn("Second fight", log_tab["content"])
        self.assertIn("---", log_tab["content"])


if __name__ == "__main__":
    unittest.main()
