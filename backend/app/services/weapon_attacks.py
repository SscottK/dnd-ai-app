"""Derive weapon attack bonus and damage dice from character sheets + SRD equipment."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_FINESSE_HINT = re.compile(r"finesse|rapier|dagger|scimitar|shortsword|whip", re.IGNORECASE)
_RANGED_HINT = re.compile(r"bow|crossbow|sling|dart|javelin|gun", re.IGNORECASE)
_DAMAGE_DICE_RE = re.compile(r"(\d+d\d+(?:\s*[+-]\s*\d+)?)", re.IGNORECASE)
_EQUIPMENT_PATH = Path(__file__).resolve().parents[2] / "data" / "srd-5.2.1" / "equipment.json"


def ability_modifier(score: int | None) -> int:
    if score is None:
        return 0
    return (int(score) - 10) // 2


def normalize_item_key(name: str | None) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


def clean_action_label(name: str) -> str:
    cleaned = re.sub(r"\s*★\s*$", "", str(name or "").strip())
    if "(" in cleaned:
        cleaned = cleaned.split("(", 1)[0].strip()
    return cleaned


def extract_damage_dice(raw: str | None) -> str | None:
    if not raw:
        return None
    match = _DAMAGE_DICE_RE.search(str(raw))
    return match.group(1).replace(" ", "") if match else None


@lru_cache(maxsize=1)
def _weapon_catalog() -> dict[str, dict]:
    if not _EQUIPMENT_PATH.is_file():
        return {}
    try:
        payload = json.loads(_EQUIPMENT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    equipment = payload.get("equipment") or {}
    by_name: dict[str, dict] = {}
    for row in equipment.get("weapons") or []:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        by_name[str(row["name"]).casefold()] = row
    return by_name


def lookup_weapon(name: str | None) -> dict | None:
    if not name:
        return None
    catalog = _weapon_catalog()
    direct = catalog.get(str(name).casefold())
    if direct:
        return direct
    needle = str(name).casefold()
    for key, row in catalog.items():
        if key in needle or needle in key:
            return row
    return None


def _attack_ability_modifier(item_name: str, abilities: dict, *, finesse: bool | None = None) -> int:
    strength = ability_modifier(abilities.get("str"))
    dexterity = ability_modifier(abilities.get("dex"))
    name = item_name.lower()
    if _RANGED_HINT.search(name) and "thrown" not in name:
        return dexterity
    is_finesse = finesse if finesse is not None else bool(_FINESSE_HINT.search(name))
    if is_finesse:
        return max(strength, dexterity)
    return strength


def default_damage_dice(item_name: str, ability_mod: int) -> str:
    weapon = lookup_weapon(item_name)
    base = None
    if weapon and weapon.get("damage_dice"):
        base = str(weapon["damage_dice"]).replace(" ", "")
    if not base:
        base = "1d6" if re.search(r"dagger|dart|sickle|club|handaxe|light hammer", item_name, re.I) else "1d8"
    if ability_mod > 0:
        return f"{base}+{ability_mod}"
    if ability_mod < 0:
        return f"{base}{ability_mod}"
    return base


def weapon_profile_from_item(sheet: dict, item: dict) -> tuple[int | None, str | None]:
    name = str(item.get("name") or "Weapon")
    abilities = sheet.get("abilities") or {}
    prof = sheet.get("proficiency_bonus")
    catalog = lookup_weapon(name)
    properties = [str(p).casefold() for p in (catalog.get("properties") if catalog else None) or []]
    finesse = any("finesse" in p for p in properties) or bool(_FINESSE_HINT.search(name))
    ability_mod = _attack_ability_modifier(name, abilities, finesse=finesse)

    attack_bonus = item.get("to_hit")
    if attack_bonus is None:
        if prof is None:
            return None, None
        attack_bonus = int(prof) + ability_mod
    else:
        attack_bonus = int(attack_bonus)

    damage_dice = extract_damage_dice(item.get("damage"))
    if not damage_dice and catalog and catalog.get("damage_dice"):
        base = str(catalog["damage_dice"]).replace(" ", "")
        if ability_mod > 0:
            damage_dice = f"{base}+{ability_mod}"
        elif ability_mod < 0:
            damage_dice = f"{base}{ability_mod}"
        else:
            damage_dice = base
    if not damage_dice:
        damage_dice = default_damage_dice(name, ability_mod)

    return attack_bonus, damage_dice


def find_inventory_weapon(sheet: dict, action_id: str, action_name: str) -> dict | None:
    clean_name = clean_action_label(action_name).casefold()
    weapon_key = action_id.removeprefix("weapon-") if action_id.startswith("weapon-") else ""

    for item in sheet.get("inventory") or []:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "")
        item_name = str(item.get("name") or "")
        if weapon_key and (weapon_key == item_id or weapon_key == normalize_item_key(item_name)):
            return item
        if clean_name and clean_name == item_name.casefold():
            return item
        if clean_name and clean_name in item_name.casefold():
            return item
    return None


def find_equipped_weapon(sheet: dict, action_id: str, action_name: str) -> dict | None:
    """Backward-compatible alias — matches any inventory weapon by id/name."""
    return find_inventory_weapon(sheet, action_id, action_name)
