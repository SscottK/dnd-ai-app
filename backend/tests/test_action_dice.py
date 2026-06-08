"""Dice expression parsing and rolling."""

from __future__ import annotations

import unittest

from app.services.action_dice import format_action_roll_message, roll_expression


class ActionDiceTests(unittest.TestCase):
    def test_simple_modifier(self) -> None:
        total, kept, dropped, mod, normalized = roll_expression("2d6+3")
        self.assertEqual(normalized, "2d6+3")
        self.assertEqual(mod, 3)
        self.assertEqual(len(kept), 2)
        self.assertEqual(dropped, [])
        self.assertEqual(total, sum(kept) + 3)

    def test_drop_lowest(self) -> None:
        total, kept, dropped, mod, normalized = roll_expression("4d6dl1")
        self.assertEqual(normalized, "4d6dl1")
        self.assertEqual(len(kept), 3)
        self.assertEqual(len(dropped), 1)
        self.assertEqual(total, sum(kept) + mod)

    def test_keep_highest(self) -> None:
        total, kept, dropped, _mod, normalized = roll_expression("2d20kh1")
        self.assertEqual(normalized, "2d20kh1")
        self.assertEqual(len(kept), 1)
        self.assertEqual(len(dropped), 1)
        self.assertEqual(total, kept[0])

    def test_advantage_on_d20(self) -> None:
        total, rolls, dropped, mod, normalized = roll_expression("d20+5", advantage=True)
        self.assertEqual(normalized, "d20+5")
        self.assertEqual(len(rolls), 2)
        self.assertEqual(dropped, [])
        self.assertEqual(total, max(rolls) + 5)

    def test_format_message_with_bonus(self) -> None:
        message = format_action_roll_message(
            label="Stealth check",
            kept=[14],
            dropped=[],
            modifier=0,
            total=18,
            bonus=4,
        )
        self.assertIn("Stealth check", message)
        self.assertIn("= 18", message)
        self.assertIn("+4", message)


if __name__ == "__main__":
    unittest.main()
