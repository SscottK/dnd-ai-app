"""Derive armor class and AC bonuses from parsed sheet data."""

from __future__ import annotations

import re
from typing import Any

from app.services.character_sheet import ability_modifier

ARMOR_CATALOG = [
    (re.compile(r"plate armor|^plate$", re.I), 18, 0),
    (re.compile(r"splint(?:\s+armor)?", re.I), 17, 0),
    (re.compile(r"chain\s*mail", re.I), 16, 0),
    (re.compile(r"ring\s*mail", re.I), 14, 0),
    (re.compile(r"half[\s-]?plate", re.I), 15, 2),
    (re.compile(r"breastplate", re.I), 14, 2),
    (re.compile(r"scale\s*mail", re.I), 14, 2),
    (re.compile(r"chain\s*shirt", re.I), 13, 2),
    (re.compile(r"hide(?:\s+armor)?", re.I), 12, 2),
    (re.compile(r"studded\s*leather", re.I), 12, 99),
    (re.compile(r"leather(?:\s+armor)?", re.I), 11, 99),
    (re.compile(r"padded(?:\s+armor)?", re.I), 11, 99),
]

SHIELD_PATTERN = re.compile(r"shield", re.I)
MAGIC_BONUS_PATTERN = re.compile(r"\+\s*(\d+)")

EQUIPPED_PROTECTION_ITEMS = [
    ("ring", re.compile(r"ring of protection", re.I)),
    ("cloak", re.compile(r"cloak of protection", re.I)),
    ("ioun", re.compile(r"ioun stone.*protection|stone of protection", re.I)),
    ("bracers", re.compile(r"bracers of defense", re.I)),
    ("amulet", re.compile(r"amulet of (?:natural )?armor", re.I)),
]


def _strip_magic_suffix(name: str) -> str:
    return re.sub(r"\s*\+\s*\d+\s*", " ", name or "").strip()


def _is_shield_item(item: dict) -> bool:
    name = str(item.get("name") or "")
    return bool(SHIELD_PATTERN.search(_strip_magic_suffix(name)))


def _is_armor_item(item: dict) -> bool:
    label = _strip_magic_suffix(str(item.get("name") or ""))
    return any(pattern.search(label) for pattern, _, _ in ARMOR_CATALOG)


def _item_magic_bonus(item: dict) -> int:
    from app.services.character_sheet import _sanitize_item_ac_bonus

    item = _sanitize_item_ac_bonus(item)
    name = str(item.get("name") or "")
    if _is_shield_item(item) or _is_armor_item(item):
        match = MAGIC_BONUS_PATTERN.search(name)
        return int(match.group(1)) if match else 0
    if item.get("ac_bonus") is not None:
        try:
            return int(item["ac_bonus"])
        except (TypeError, ValueError):
            pass
    for part in (item.get("name"), item.get("notes")):
        if not part:
            continue
        match = MAGIC_BONUS_PATTERN.search(str(part))
        if match:
            return int(match.group(1))
    return 0


def _classify_item(item: dict) -> dict[str, Any] | None:
    name = str(item.get("name") or "").strip()
    if not name:
        return None
    magic = _item_magic_bonus(item)
    label = _strip_magic_suffix(name)
    if SHIELD_PATTERN.search(label):
        return {"kind": "shield", "bonus": 2 + magic, "magic": magic}
    for pattern, base, dex_cap in ARMOR_CATALOG:
        if pattern.search(label):
            return {"kind": "armor", "base": base, "dex_cap": dex_cap, "magic": magic}
    return None


def _equipped_items(sheet: dict) -> list[dict]:
    from app.services.character_sheet import apply_equipped_overrides

    sheet = apply_equipped_overrides(sheet)
    return [item for item in sheet.get("inventory") or [] if item.get("equipped")]


def _feature_text(feature: dict) -> str:
    return f"{feature.get('name') or ''} {feature.get('source') or ''} {feature.get('description') or ''}"


def _is_defense_fighting_style(feature: dict) -> bool:
    name = str(feature.get("name") or "").strip().lower()
    source = str(feature.get("source") or "").strip().lower()
    text = _feature_text(feature).lower()
    if name == "defense":
        return True
    if "fighting style" in name and "defense" in name:
        return True
    if name == "fighting style" and "defense" in text:
        return True
    if "fighting style" in source and "defense" in name:
        return True
    if re.search(r"fighting style.*\bdefense\b|\bdefense\b.*fighting style", text):
        return True
    if re.search(r"armored bonus.*\bdefense\b|\bdefense\b.*armored bonus", text):
        return True
    if re.search(r"\+1.*\bac\b.*wearing armor|wearing armor.*\+1.*\bac\b", text):
        return True
    return False


def _infer_ac_bonuses_from_features(features: list[dict]) -> list[dict]:
    bonuses: list[dict] = []
    for feature in features:
        if _is_defense_fighting_style(feature):
            bonuses.append(
                {"name": "Defense (Fighting Style)", "bonus": 1, "requires_armor": True}
            )
    return bonuses


def _sheet_text_blob(sheet: dict) -> str:
    parts = [sheet.get("notes") or ""]
    for feature in sheet.get("features") or []:
        parts.append(_feature_text(feature))
    for item in sheet.get("inventory") or []:
        parts.append(f"{item.get('name') or ''} {item.get('notes') or ''}")
    return " ".join(parts)


def _infer_ac_bonuses_from_text(sheet: dict) -> list[dict]:
    text = _sheet_text_blob(sheet).lower()
    bonuses: list[dict] = []
    if re.search(r"armored bonus.*\bdefense\b|\bdefense\b.*armored bonus", text):
        bonuses.append(
            {"name": "Armored Bonus (Defense)", "bonus": 1, "requires_armor": True}
        )
    return bonuses


def _ac_bonuses_from_breakdown(breakdown: list[dict]) -> list[dict]:
    bonuses: list[dict] = []
    for row in breakdown:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "bonus").lower()
        if kind in {"armor", "dex", "shield", "base", "ability"}:
            continue
        try:
            bonus = int(row.get("value") or row.get("bonus") or 0)
        except (TypeError, ValueError):
            continue
        if bonus <= 0:
            continue
        bonuses.append(
            {
                "name": str(row.get("label") or row.get("name") or "AC bonus"),
                "bonus": bonus,
                "requires_armor": row.get("requires_armor", True),
            }
        )
    return bonuses


def _dedupe_defense_bonuses(bonuses: list[dict]) -> list[dict]:
    has_defense = False
    cleaned: list[dict] = []
    for entry in bonuses:
        if re.search(r"defense", str(entry.get("name") or ""), re.I):
            if has_defense:
                continue
            has_defense = True
        cleaned.append(entry)
    return cleaned


def _equipped_protection_keys(sheet: dict) -> set[str]:
    keys: set[str] = set()
    for item in _equipped_items(sheet):
        haystack = f"{item.get('name') or ''} {item.get('notes') or ''}"
        for key, pattern in EQUIPPED_PROTECTION_ITEMS:
            if pattern.search(haystack):
                keys.add(key)
    return keys


def _sanitize_ac_bonuses(sheet: dict, bonuses: list[dict]) -> list[dict]:
    equipped = _equipped_items(sheet)
    equipped_protection = _equipped_protection_keys(sheet)
    best_armor = None
    for item in equipped:
        stats = _classify_item(item)
        if stats and stats.get("kind") == "armor":
            score = stats["base"] + stats["magic"]
            best_score = (best_armor["base"] + best_armor["magic"]) if best_armor else -1
            if best_armor is None or score > best_score:
                best_armor = stats

    dex = ability_modifier((sheet.get("abilities") or {}).get("dex")) or 0
    cleaned: list[dict] = []
    for entry in bonuses:
        name = str(entry.get("name") or "").lower()
        try:
            bonus = int(entry.get("bonus") or 0)
        except (TypeError, ValueError):
            continue
        if name.strip() == "base" or (re.search(r"\bbase\b", name) and bonus == 10):
            continue
        if any(
            key in equipped_protection and pattern.search(name)
            for key, pattern in EQUIPPED_PROTECTION_ITEMS
        ):
            continue
        if re.search(r"dex|dexterity|ability", name) and bonus == dex:
            continue
        if re.search(r"shield|buckler", name):
            continue
        if best_armor and re.search(r"dex|dexterity", name):
            continue
        if best_armor and best_armor.get("dex_cap") == 0 and bonus == dex and dex > 0:
            continue
        if (
            best_armor
            and re.search(r"armor|chain mail|plate|mail|breastplate", name)
            and bonus == best_armor.get("base")
        ):
            continue
        cleaned.append(entry)
    return cleaned


def _merge_ac_bonuses(existing: list[dict], inferred: list[dict]) -> list[dict]:
    merged = list(existing)
    for bonus in inferred:
        duplicate = any(
            b.get("name") == bonus.get("name") and b.get("bonus") == bonus.get("bonus")
            for b in merged
        )
        if not duplicate:
            merged.append(bonus)
    return merged


def _has_equipped_armor(sheet: dict) -> bool:
    return any((_classify_item(item) or {}).get("kind") == "armor" for item in _equipped_items(sheet))


def _compute_misc_ac_bonuses(sheet: dict, *, wearing_armor: bool) -> int:
    total = 0
    for item in _equipped_items(sheet):
        haystack = f"{item.get('name') or ''} {item.get('notes') or ''}"
        if re.search(r"ring of protection", haystack, re.I):
            total += 1
        if re.search(r"cloak of protection", haystack, re.I):
            total += 1
        if re.search(r"ioun stone.*protection|stone of protection", haystack, re.I):
            total += 1
        if not wearing_armor and re.search(r"bracers of defense", haystack, re.I):
            total += 2
        if re.search(r"amulet of (?:natural )?armor", haystack, re.I):
            name = str(item.get("name") or "")
            match = MAGIC_BONUS_PATTERN.search(name)
            total += int(match.group(1)) if match else 1
    return total


def _sum_ac_bonuses(sheet: dict, *, wearing_armor: bool) -> int:
    total = 0
    for entry in sheet.get("ac_bonuses") or []:
        if entry.get("requires_armor", True) and not wearing_armor:
            continue
        try:
            total += int(entry.get("bonus") or 0)
        except (TypeError, ValueError):
            continue
    return total


def estimate_equipment_ac(sheet: dict) -> int | None:
    """AC from equipped armor/shields only — no class or magic item flat bonuses."""
    abilities = sheet.get("abilities") or {}
    dex = ability_modifier(abilities.get("dex")) or 0
    best_armor: dict[str, Any] | None = None
    shield_bonus = 0

    for item in _equipped_items(sheet):
        stats = _classify_item(item)
        if not stats:
            continue
        if stats["kind"] == "shield":
            shield_bonus += stats["bonus"]
        elif stats["kind"] == "armor":
            score = stats["base"] + stats["magic"]
            best_score = (best_armor["base"] + best_armor["magic"]) if best_armor else -1
            if best_armor is None or score > best_score:
                best_armor = stats

    if best_armor:
        dex_bonus = 0 if best_armor["dex_cap"] == 0 else min(dex, best_armor["dex_cap"])
        return best_armor["base"] + dex_bonus + best_armor["magic"] + shield_bonus
    if shield_bonus:
        return 10 + dex + shield_bonus
    return None


def enrich_sheet_ac(sheet: dict, parsed_ac: int | None = None) -> dict:
    enriched = dict(sheet)
    existing = list(enriched.get("ac_bonuses") or [])
    inferred = [
        *_ac_bonuses_from_breakdown(enriched.get("ac_breakdown") or []),
        *_infer_ac_bonuses_from_features(enriched.get("features") or []),
        *_infer_ac_bonuses_from_text(enriched),
    ]
    enriched["ac_bonuses"] = _dedupe_defense_bonuses(
        _sanitize_ac_bonuses(enriched, _merge_ac_bonuses(existing, inferred))
    )

    overrides = enriched.get("equipped_overrides") or {}
    if overrides:
        enriched["authoritative_ac"] = None
    elif parsed_ac is not None:
        enriched["authoritative_ac"] = parsed_ac

    wearing_armor = _has_equipped_armor(enriched)
    equipment_ac = estimate_equipment_ac(enriched)
    if parsed_ac is not None and equipment_ac is not None and parsed_ac > equipment_ac:
        covered = (
            equipment_ac
            + _sum_ac_bonuses(enriched, wearing_armor=wearing_armor)
            + _compute_misc_ac_bonuses(enriched, wearing_armor=wearing_armor)
        )
        gap = parsed_ac - covered
        if gap > 0:
            enriched["ac_bonuses"] = _merge_ac_bonuses(
                enriched["ac_bonuses"],
                [{"name": "Sheet AC bonus", "bonus": gap, "requires_armor": wearing_armor}],
            )

    return enriched


def compute_sheet_ac(sheet: dict, parsed_ac: int | None = None) -> int | None:
    enriched = enrich_sheet_ac(sheet, parsed_ac)
    wearing_armor = _has_equipped_armor(enriched)
    equipment_ac = estimate_equipment_ac(enriched)
    bonus_total = _sum_ac_bonuses(enriched, wearing_armor=wearing_armor)
    misc_total = _compute_misc_ac_bonuses(enriched, wearing_armor=wearing_armor)

    if equipment_ac is not None:
        total = equipment_ac + bonus_total + misc_total
        authoritative = enriched.get("authoritative_ac")
        overrides = enriched.get("equipped_overrides") or {}
        if authoritative is not None and wearing_armor and not overrides:
            if authoritative > total or authoritative < total:
                return int(authoritative)
        return total

    abilities = enriched.get("abilities") or {}
    dex = ability_modifier(abilities.get("dex")) or 0
    return 10 + dex
