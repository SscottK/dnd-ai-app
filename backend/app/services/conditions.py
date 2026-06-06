"""D&D 5.5e (2024) condition rules for encounter combatants."""

from __future__ import annotations

import re

CONDITION_OPTIONS = [
    "Blinded",
    "Charmed",
    "Deafened",
    "Exhaustion",
    "Frightened",
    "Grappled",
    "Incapacitated",
    "Invisible",
    "Paralyzed",
    "Petrified",
    "Poisoned",
    "Prone",
    "Restrained",
    "Stunned",
    "Unconscious",
]

_INCAPACITATING = frozenset({"Paralyzed", "Stunned", "Unconscious", "Petrified"})


def normalize_conditions(value: list[str] | str | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(entry).strip() for entry in value if str(entry).strip()]
    text = str(value).strip()
    if not text:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


def get_exhaustion_level(conditions: list[str] | str | None) -> int:
    for entry in normalize_conditions(conditions):
        if not re.match(r"^exhaustion\b", entry, re.IGNORECASE):
            continue
        match = re.match(r"^exhaustion\s*(\d+)?", entry, re.IGNORECASE)
        if not match:
            return 1
        level = int(match.group(1)) if match.group(1) else 1
        return level if level > 0 else 1
    return 0


def _format_exhaustion(level: int) -> str:
    return f"Exhaustion {level}"


def has_condition(conditions: list[str] | str | None, name: str) -> bool:
    lower = name.lower()
    if lower == "exhaustion":
        return get_exhaustion_level(conditions) > 0
    return any(entry.lower() == lower for entry in normalize_conditions(conditions))


def _implies_incapacitated(conditions: list[str] | str | None) -> bool:
    for entry in normalize_conditions(conditions):
        base = entry.split()[0] if entry.split() else entry
        if base in _INCAPACITATING:
            return True
    return False


def _without_exhaustion(conditions: list[str]) -> list[str]:
    return [entry for entry in conditions if not re.match(r"^exhaustion\b", entry, re.IGNORECASE)]


def validate_add_condition(
    conditions: list[str] | str | None, condition_name: str
) -> tuple[bool, list[str], str | None]:
    """Return (ok, next_list, error_message)."""
    listed = normalize_conditions(conditions)
    name = condition_name.strip()
    if not name:
        return False, listed, "Choose a condition."

    if name == "Exhaustion":
        level = get_exhaustion_level(listed)
        if level >= 6:
            return False, listed, "Exhaustion is already level 6 — the creature dies."
        next_list = [*_without_exhaustion(listed), _format_exhaustion(level + 1)]
        return True, next_list, None

    if has_condition(listed, name):
        return (
            False,
            listed,
            f"{name} is already applied. Conditions don't stack with themselves (5.5e Rules Glossary).",
        )

    if name == "Incapacitated" and _implies_incapacitated(listed):
        return (
            False,
            listed,
            "Incapacitated is already in effect via Paralyzed, Stunned, Unconscious, or Petrified.",
        )

    if name == "Prone" and has_condition(listed, "Unconscious"):
        return (
            False,
            listed,
            "Prone is already applied while a creature has the Unconscious condition.",
        )

    if name == "Poisoned" and has_condition(listed, "Petrified"):
        return (
            False,
            listed,
            "Petrified creatures have Immunity to the Poisoned condition.",
        )

    return True, [*listed, name], None


def sanitize_conditions_list(conditions: list[str] | str | None) -> list[str]:
    """Normalize legacy strings and drop redundant implied conditions."""
    listed = normalize_conditions(conditions)
    out: list[str] = []
    exhaustion_level = 0

    for entry in listed:
        if re.match(r"^exhaustion\b", entry, re.IGNORECASE):
            match = re.match(r"^exhaustion\s*(\d+)?", entry, re.IGNORECASE)
            level = int(match.group(1)) if match and match.group(1) else 1
            exhaustion_level = max(exhaustion_level, min(6, max(1, level)))
            continue
        base = entry.split()[0] if entry.split() else entry
        if base in CONDITION_OPTIONS and base not in out:
            out.append(base)

    if exhaustion_level:
        out.append(_format_exhaustion(exhaustion_level))

    if _implies_incapacitated(out) and "Incapacitated" in out:
        out = [entry for entry in out if entry != "Incapacitated"]
    if has_condition(out, "Unconscious") and "Prone" in out:
        out = [entry for entry in out if entry != "Prone"]
    if has_condition(out, "Petrified") and "Poisoned" in out:
        out = [entry for entry in out if entry != "Poisoned"]

    return out


def assert_conditions_valid(conditions: list[str] | str | None) -> list[str]:
    """Raise ValueError when a condition list breaks 5.5e stacking rules."""
    listed = sanitize_conditions_list(conditions)
    bases = [entry for entry in listed if not re.match(r"^exhaustion\b", entry, re.IGNORECASE)]
    if len(bases) != len(set(bases)):
        raise ValueError("Each condition can only be applied once (Exhaustion excepted).")

    exhaustion_level = get_exhaustion_level(listed)
    if exhaustion_level > 6:
        raise ValueError("Exhaustion cannot exceed level 6.")

    for base in bases:
        if base not in CONDITION_OPTIONS:
            raise ValueError(f"Unknown condition: {base}")

    if "Incapacitated" in bases and _implies_incapacitated(bases):
        raise ValueError(
            "Incapacitated is already in effect via Paralyzed, Stunned, Unconscious, or Petrified."
        )
    if "Prone" in bases and has_condition(bases, "Unconscious"):
        raise ValueError("Prone is already applied while a creature has the Unconscious condition.")
    if "Poisoned" in bases and has_condition(bases, "Petrified"):
        raise ValueError("Petrified creatures have Immunity to the Poisoned condition.")

    return listed
