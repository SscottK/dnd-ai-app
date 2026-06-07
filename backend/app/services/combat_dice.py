"""Dice rolling for combat resolution."""

from __future__ import annotations

import random
import re

_DICE_EXPR = re.compile(
    r"^(?P<count>\d+)d(?P<sides>\d+)(?P<mod>[+-]\d+)?$",
    re.IGNORECASE,
)


def roll_d20() -> int:
    return random.randint(1, 20)


def roll_d20_check(
    *,
    advantage: bool = False,
    disadvantage: bool = False,
) -> tuple[int, list[int]]:
    """Roll d20 with optional advantage/disadvantage (they cancel if both)."""
    if advantage and disadvantage:
        advantage = False
        disadvantage = False
    if advantage:
        rolls = [roll_d20(), roll_d20()]
        return max(rolls), rolls
    if disadvantage:
        rolls = [roll_d20(), roll_d20()]
        return min(rolls), rolls
    roll = roll_d20()
    return roll, [roll]


def roll_die(sides: int) -> int:
    return random.randint(1, max(1, int(sides)))


def normalize_dice_expression(expression: str) -> str:
    return re.sub(r"\s+", "", str(expression or "").strip().lower())


def roll_dice_expression(expression: str, *, double_dice: bool = False) -> tuple[int, list[int], int, str]:
    """
    Roll a dice expression like 1d6+2 or 2d6-1.
    Returns (total, individual_rolls, modifier, normalized_expression).
    """
    normalized = normalize_dice_expression(expression)
    if not normalized:
        raise ValueError("Missing damage dice expression.")

    match = _DICE_EXPR.match(normalized)
    if not match:
        raise ValueError(f"Could not parse damage dice: {expression}")

    count = int(match.group("count"))
    sides = int(match.group("sides"))
    mod = int(match.group("mod") or 0)
    if double_dice:
        count *= 2

    rolls = [roll_die(sides) for _ in range(count)]
    total = sum(rolls) + mod
    return total, rolls, mod, normalized


def format_roll_detail(
    *,
    dice_label: str,
    rolls: list[int],
    modifier: int,
    total: int,
) -> str:
    mod_text = f" {modifier:+d}" if modifier else ""
    if len(rolls) == 1:
        body = f"{rolls[0]}{mod_text}"
    else:
        body = f"{'+'.join(str(value) for value in rolls)}{mod_text}"
    return f"{dice_label}: {body} = {total}"
