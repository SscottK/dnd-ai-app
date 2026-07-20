"""Typed damage and resistance/vulnerability/immunity (5.5e)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

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

_TYPE_ALT = "|".join(_DAMAGE_TYPES)

_HIT_TYPE_RE = re.compile(
    r"hit:\s*[^.]*?\(\s*\d+d\d+(?:\s*[+-]\s*\d+)?\s*\)\s*"
    r"(" + _TYPE_ALT + r")\s+damage",
    re.IGNORECASE,
)
_TYPE_WORD_RE = re.compile(r"\b(" + _TYPE_ALT + r")\b", re.IGNORECASE)

# "5 (1d4 + 3) Slashing damage" / "4 (1d8) acid"
_PACKET_RE = re.compile(
    r"(?:(?:\d+)\s*)?\(\s*(?P<dice>\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)\s*"
    r"(?P<dtype>" + _TYPE_ALT + r")\s+damage",
    re.IGNORECASE,
)


@dataclass
class DamagePacket:
    dice: str
    damage_type: str | None = None


@dataclass
class DamageApplication:
    amount: int
    original: int
    damage_type: str | None = None
    note: str | None = None


@dataclass
class MultiDamageApplication:
    amount: int
    original: int
    packets: list[DamageApplication] = field(default_factory=list)
    note: str | None = None


def parse_damage_type(text: str | None) -> str | None:
    if not text:
        return None
    hit = _HIT_TYPE_RE.search(text)
    if hit:
        return hit.group(1).casefold()
    fail = re.search(
        r"(?:failure|hit):\s*[^.]*?\(\s*\d+d\d+[^.]*?\)\s*"
        r"(" + _TYPE_ALT + r")\s+damage",
        text,
        re.IGNORECASE,
    )
    if fail:
        return fail.group(1).casefold()
    match = _TYPE_WORD_RE.search(text)
    return match.group(1).casefold() if match else None


def parse_damage_packets(text: str | None) -> list[DamagePacket]:
    """Parse one or more typed dice packets from Hit/Failure prose."""
    if not text:
        return []
    packets: list[DamagePacket] = []
    for match in _PACKET_RE.finditer(text):
        dice = re.sub(r"\s+", "", match.group("dice"))
        dtype = match.group("dtype").casefold()
        packets.append(DamagePacket(dice=dice, damage_type=dtype))
    return packets


def _normalize_type_list(values) -> set[str]:
    out: set[str] = set()
    if values is None:
        return out
    rows = values if isinstance(values, list) else [values]
    for entry in rows:
        text = str(entry or "").strip()
        if not text:
            continue
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


def sheet_damage_modifiers(sheet: dict | None) -> dict[str, set[str]]:
    if not sheet:
        return {"resistances": set(), "immunities": set(), "vulnerabilities": set()}
    return {
        "resistances": _normalize_type_list(sheet.get("damage_resistances")),
        "immunities": _normalize_type_list(sheet.get("damage_immunities")),
        "vulnerabilities": _normalize_type_list(sheet.get("damage_vulnerabilities")),
    }


def combatant_damage_modifiers(combatant: EncounterCombatant) -> dict[str, set[str]]:
    # Prefer values mirrored onto the combatant (PC sheet sync / explicit overrides).
    listed = {
        "resistances": _normalize_type_list(getattr(combatant, "damage_resistances", None)),
        "immunities": _normalize_type_list(getattr(combatant, "damage_immunities", None)),
        "vulnerabilities": _normalize_type_list(getattr(combatant, "damage_vulnerabilities", None)),
    }
    if any(listed.values()):
        return listed
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


def apply_damage_packets(
    packets: list[tuple[int, str | None]],
    *,
    combatant: EncounterCombatant,
) -> MultiDamageApplication:
    """Apply resist/vuln/immune per typed packet, then sum."""
    applied_rows: list[DamageApplication] = []
    total = 0
    original = 0
    notes: list[str] = []
    for amount, dtype in packets:
        row = apply_damage_modifiers(amount, damage_type=dtype, combatant=combatant)
        applied_rows.append(row)
        total += row.amount
        original += row.original
        if row.note:
            label = dtype or "damage"
            notes.append(f"{label}: {row.note}")
    return MultiDamageApplication(
        amount=total,
        original=original,
        packets=applied_rows,
        note="; ".join(notes) if notes else None,
    )
