"""Infer combat action economy from feature text — primary activation, not incidental mentions."""

from __future__ import annotations

import re

_PRIMARY_ACTION = re.compile(
    r"(?:^|[.!?]\s+|\n)\s*(?:as an action|you can use your action|"
    r"you use an action|takes? an action|costs? (?:one |an )?action)",
    re.IGNORECASE,
)
_PRIMARY_BONUS = re.compile(
    r"(?:^|[.!?]\s+|\n)\s*(?:as a bonus action|you can use (?:a )?bonus action|"
    r"you use (?:a )?bonus action|costs? (?:one |a )?bonus action)",
    re.IGNORECASE,
)
_PRIMARY_REACTION = re.compile(
    r"(?:^|[.!?]\s+|\n)\s*(?:as a reaction|you can use (?:a )?reaction|"
    r"you use (?:a )?reaction|costs? (?:one |a )?reaction)",
    re.IGNORECASE,
)
_TRAILING_ECONOMY = re.compile(
    r"\(\s*\d+\s*/\s*[^)]*\s*[•·]\s*(\d+)\s*(Action|Bonus Action|Reaction)s?\s*\)",
    re.IGNORECASE,
)

# Authoritative names where SRD/Open5e text inference is unreliable.
_ACTION_TYPE_OVERRIDES: dict[str, str] = {
    "wild shape": "action",
    "combat wild shape": "bonus_action",
    "end wild shape": "bonus_action",
    "cunning action": "bonus_action",
    "second wind": "bonus_action",
    "action surge": "action",
    "rage": "bonus_action",
    "flurry of blows": "bonus_action",
    "patient defense": "bonus_action",
    "step of the wind": "bonus_action",
}


def override_action_type(name: str) -> str | None:
    return _ACTION_TYPE_OVERRIDES.get(str(name or "").strip().casefold())


def infer_primary_action_type(name: str = "", description: str = "") -> str | None:
    """Return action, bonus_action, or reaction from how the feature is activated."""
    override = override_action_type(name)
    if override:
        return override

    text = str(description or "").strip()
    if not text:
        return None

    trailer = _TRAILING_ECONOMY.search(text)
    if trailer:
        economy = trailer.group(2).casefold()
        if "bonus" in economy:
            return "bonus_action"
        if "reaction" in economy:
            return "reaction"
        return "action"

    matches: list[tuple[int, str]] = []
    for pattern, economy in (
        (_PRIMARY_ACTION, "action"),
        (_PRIMARY_BONUS, "bonus_action"),
        (_PRIMARY_REACTION, "reaction"),
    ):
        found = pattern.search(text)
        if found:
            matches.append((found.start(), economy))

    if matches:
        matches.sort(key=lambda item: item[0])
        return matches[0][1]

    lowered = f"{name} {text}".lower()
    bonus_idx = lowered.find("bonus action")
    action_match = re.search(r"\baction\b", lowered)
    reaction_idx = lowered.find("reaction")

    indices: list[tuple[int, str]] = []
    if bonus_idx >= 0:
        indices.append((bonus_idx, "bonus_action"))
    if action_match:
        indices.append((action_match.start(), "action"))
    if reaction_idx >= 0:
        indices.append((reaction_idx, "reaction"))

    if not indices:
        return None

    indices.sort(key=lambda item: item[0])
    first_economy = indices[0][1]

    # Wild Shape-style text: primary "as an action" should beat later "bonus action to revert".
    if _PRIMARY_ACTION.search(text):
        return "action"
    if first_economy == "bonus_action" and _PRIMARY_ACTION.search(text[: bonus_idx if bonus_idx >= 0 else len(text)]):
        return "action"

    return first_economy
