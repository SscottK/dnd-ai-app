#!/usr/bin/env python3
"""Helper utilities for SRD 5.2.1 / 2024 combat + spell metadata.

Do not fetch Open5e wotc-srd (2014). Full dataset builds use build_srd_all.py.
"""

from __future__ import annotations

import re

STANDARD_ACTIONS = [
    {
        "name": "Attack",
        "action_type": "action",
        "targeting": "one_enemy",
        "category": "standard",
        "description": "Make one attack roll with a weapon or an Unarmed Strike.",
    },
    {
        "name": "Dash",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
        "description": "Gain extra movement equal to your Speed.",
    },
    {
        "name": "Disengage",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Dodge",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Help",
        "action_type": "action",
        "targeting": "one_ally_or_self",
        "category": "standard",
    },
    {
        "name": "Hide",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Ready",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Search",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Study",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Utilize",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Influence",
        "action_type": "action",
        "targeting": "one_creature",
        "category": "standard",
    },
]


def infer_action_type(text: str) -> str | None:
    from app.services.action_type_inference import infer_primary_action_type

    return infer_primary_action_type("", text)


def infer_targeting(name: str, text: str, *, category: str = "feature") -> str:
    blob = f"{name} {text}".lower()
    if "self only" in blob or "(self only)" in blob:
        return "self"
    if re.search(r"\bon yourself\b", blob) or re.search(r"\byou regain\b", blob):
        return "self"
    if "regain hit points" in blob and "one target" not in blob and "creature you" not in blob:
        return "self"
    if "you gain" in blob and "attack" not in blob and "one target" not in blob:
        return "self"
    if "one ally" in blob or "friendly creature" in blob:
        return "one_ally"
    if "one ally or yourself" in blob or "ally or yourself" in blob:
        return "one_ally_or_self"
    if "each creature" in blob or "all creatures" in blob:
        return "one_creature"
    if "one target" in blob or "melee weapon attack" in blob or "ranged weapon attack" in blob:
        return "one_enemy"
    if "spell attack" in blob and "creature you can see" in blob:
        return "one_enemy"
    if category == "spell":
        if blob.strip().startswith("self") or " range: self" in blob:
            return "self"
    if category in {"feature", "standard"}:
        return "self"
    return "one_enemy"


def infer_spell_targeting(spell: dict) -> str:
    name = str(spell.get("name") or "")
    desc = str(spell.get("desc") or "")
    range_text = str(spell.get("range") or "").lower()
    if range_text == "self":
        return "self"
    if range_text == "touch":
        return "one_ally_or_self"
    if "spell attack" in desc.lower():
        return "one_enemy"
    if "creature you can see" in desc.lower():
        return "one_creature"
    return infer_targeting(name, f"{range_text} {desc}", category="spell")


def infer_spell_action_type(spell: dict) -> str:
    casting = str(spell.get("casting_time") or "").lower()
    if "bonus action" in casting:
        return "bonus_action"
    if "reaction" in casting:
        return "reaction"
    return "action"


def parse_healing_dice(text: str) -> str | None:
    match = re.search(
        r"(?:regain|regains)(?:\s+a\s+number\s+of)?\s+Hit Points equal to (\d+d\d+(?:\s*\+\s*[^.]+)?)",
        text,
        re.I,
    )
    if match:
        return re.sub(r"\s+", "", match.group(1).lower())
    return None
