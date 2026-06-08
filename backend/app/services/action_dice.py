"""Dice rolling for out-of-combat action log entries."""

from __future__ import annotations

import re

from app.services.combat_dice import roll_d20_check, roll_die

_DICE_EXPR = re.compile(
    r"^(?:(?P<count>\d+)|)d(?P<sides>\d+)"
    r"(?:(?P<keep_drop>[kd][hl])(?P<keep_count>\d+))?"
    r"(?P<mod>[+-]\d+)?$",
    re.IGNORECASE,
)


def normalize_roll_expression(expression: str) -> str:
    return re.sub(r"\s+", "", str(expression or "").strip().lower())


def roll_expression(
    expression: str,
    *,
    advantage: bool = False,
    disadvantage: bool = False,
) -> tuple[int, list[int], list[int], int, str]:
    """
    Roll a dice expression.

    Supports: d20, 2d6+3, 4d6dl1 (drop lowest 1), 2d20kh1 (keep highest 1), 2d20kl1.
    Returns (total, kept_rolls, dropped_rolls, modifier, normalized_expression).
    """
    normalized = normalize_roll_expression(expression)
    if not normalized:
        raise ValueError("Enter a dice expression like 2d6+3 or 4d6dl1.")

    match = _DICE_EXPR.match(normalized)
    if not match:
        raise ValueError(f"Could not parse dice expression: {expression}")

    count = int(match.group("count") or 1)
    sides = int(match.group("sides"))
    if count < 1 or count > 40 or sides < 2 or sides > 100:
        raise ValueError("Dice count must be 1–40 and sides 2–100.")

    mod = int(match.group("mod") or 0)
    keep_drop = (match.group("keep_drop") or "").lower()
    keep_count = int(match.group("keep_count") or 0)

    if sides == 20 and count == 1 and not keep_drop:
        total, rolls = roll_d20_check(advantage=advantage, disadvantage=disadvantage)
        return total + mod, rolls, [], mod, normalized

    if advantage or disadvantage:
        if advantage and disadvantage:
            advantage = False
            disadvantage = False
        if advantage or disadvantage:
            total, rolls = roll_d20_check(advantage=advantage, disadvantage=disadvantage)
            return total + mod, rolls, [], mod, normalized

    rolls = [roll_die(sides) for _ in range(count)]
    kept = list(rolls)
    dropped: list[int] = []

    if keep_drop in {"dl", "kd"} and keep_count > 0:
        drop_n = min(keep_count, len(kept) - 1)
        for _ in range(drop_n):
            lowest = min(kept)
            kept.remove(lowest)
            dropped.append(lowest)
    elif keep_drop in {"kh", "k"} and keep_count > 0:
        keep_n = min(keep_count, len(kept))
        sorted_desc = sorted(kept, reverse=True)
        kept = sorted_desc[:keep_n]
        dropped = sorted_desc[keep_n:]
    elif keep_drop in {"kl", "l"} and keep_count > 0:
        keep_n = min(keep_count, len(kept))
        sorted_asc = sorted(kept)
        kept = sorted_asc[:keep_n]
        dropped = sorted_asc[keep_n:]

    total = sum(kept) + mod
    return total, kept, dropped, mod, normalized


def format_action_roll_message(
    *,
    label: str,
    kept: list[int],
    dropped: list[int],
    modifier: int,
    total: int,
    bonus: int | None = None,
) -> str:
    mod_parts: list[str] = []
    if len(kept) == 1:
        mod_parts.append(str(kept[0]))
    elif kept:
        mod_parts.append("+".join(str(value) for value in kept))
    if dropped:
        mod_parts.append(f"drop [{', '.join(str(value) for value in dropped)}]")
    if bonus not in (None, 0):
        mod_parts.append(f"{bonus:+d}")
    elif modifier:
        mod_parts.append(f"{modifier:+d}")
    body = " ".join(mod_parts) if mod_parts else str(total)
    return f"{label}: {body} = {total}"
