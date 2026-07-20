"""Typed damage and resistance/vulnerability/immunity (5.5e)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.api.schemas import EncounterCombatant
from app.services.monster_catalog import lookup_monster

_DAMAGE_TYPES = (
    "acid",
    "bludgeoning",
    "cold",
    "fire",
    "force",
    "lightning",
    "necrotic",
    "piercing",
    "poison",
    "psychic",
    "radiant",
    "slashing",
    "thunder",
)

_HIT_TYPE_RE = re.compile(
    r"hit:\s*[^.]*?\(\s*\d+d\d+(?:\s*[+-]\s*\d+)?\s*\)\s*"
    r"(" + "|".join(_DAMAGE_TYPES) + r")\s+damage",
    re.IGNORECASE,
)
_TYPE_WORD_RE = re.compile(
    r"\b(" + "|".join(_DAMAGE_TYPES) + r")\b",
    re.IGNORECASE,
)


@dataclass
class DamageApplication:
    amount: int
    original: int
    damage_type: str | None = None
    note: str | None = None


def parse_damage_type(text: str | None) -> str | None:
    if not text:
        return None
    hit = _HIT_TYPE_RE.search(text)
    if hit:
        return hit.group(1).casefold()
    # Failure: 54 (12d8) Cold damage
    fail = re.search(
        r"(?:failure|hit):\s*[^.]*?\(\s*\d+d\d+[^.]*?\)\s*"
        r"(" + "|".join(_DAMAGE_TYPES) + r")\s+damage",
        text,
        re.IGNORECASE,
    )
    if fail:
        return fail.group(1).casefold()
    match = _TYPE_WORD_RE.search(text)
    return match.group(1).casefold() if match else None


def _normalize_type_list(values) -> set[str]:
    out: set[str] = set()
    if values is None:
        return out
    rows = values if isinstance(values, list) else [values]
    for entry in rows:
        text = str(entry or "").strip()
        if not text:
            continue
        # "Bludgeoning, Piercing, and Slashing from nonmagical attacks"
        for dtype in _DAMAGE_TYPES:
            if re.search(rf"\b{dtype}\b", text, re.IGNORECASE):
                out.add(dtype)
        if text.casefold() in _DAMAGE_TYPES:
            out.add(text.casefold())
    return out


def monster_damage_modifiers(monster: dict | None) -> dict[str, set[str]]:
    if not monster:
        return {"resistances": set(), "immunities": set(), "vulnerabilities": set()}
    sb = monster.get("stat_block_json") if isinstance(monster.get("stat_block_json"), dict) else {}
    return {
        "resistances": _normalize_type_list(
            sb.get("damage_resistances") or monster.get("damage_resistances")
        ),
        "immunities": _normalize_type_list(
            sb.get("damage_immunities") or monster.get("damage_immunities")
        ),
        "vulnerabilities": _normalize_type_list(
            sb.get("damage_vulnerabilities") or monster.get("damage_vulnerabilities")
        ),
    }


def combatant_damage_modifiers(combatant: EncounterCombatant) -> dict[str, set[str]]:
    if combatant.is_pc or combatant.character_id:
        return {"resistances": set(), "immunities": set(), "vulnerabilities": set()}
    monster = lookup_monster(combatant.srd_name or combatant.name)
    return monster_damage_modifiers(monster)


def apply_damage_modifiers(
    amount: int,
    *,
    damage_type: str | None,
    combatant: EncounterCombatant,
) -> DamageApplication:
    original = max(0, int(amount))
    if original <= 0 or not damage_type:
        return DamageApplication(amount=original, original=original, damage_type=damage_type)

    mods = combatant_damage_modifiers(combatant)
    dtype = damage_type.casefold()
    if dtype in mods["immunities"]:
        return DamageApplication(
            amount=0,
            original=original,
            damage_type=dtype,
            note=f"immune to {dtype}",
        )
    adjusted = original
    note = None
    if dtype in mods["vulnerabilities"]:
        adjusted *= 2
        note = f"vulnerable to {dtype}"
    if dtype in mods["resistances"]:
        adjusted = adjusted // 2
        note = f"resistant to {dtype}" if note is None else f"{note}; resistant to {dtype}"
    return DamageApplication(
        amount=adjusted,
        original=original,
        damage_type=dtype,
        note=note,
    )
