"""Derive weapon attack bonus and damage dice from character sheets."""

from __future__ import annotations

import re

_FINESSE_HINT = re.compile(r"finesse|rapier|dagger|scimitar|shortsword|whip", re.IGNORECASE)
_RANGED_HINT = re.compile(r"bow|crossbow|sling|dart|javelin|gun", re.IGNORECASE)
_LIGHT_HINT = re.compile(r"dagger|dart|sickle|club|handaxe|light hammer", re.IGNORECASE)
_DAMAGE_DICE_RE = re.compile(r"(\d+d\d+(?:[+-]\d+)?)", re.IGNORECASE)


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


def _attack_ability_modifier(item_name: str, abilities: dict) -> int:
    strength = ability_modifier(abilities.get("str"))
    dexterity = ability_modifier(abilities.get("dex"))
    name = item_name.lower()
    if _RANGED_HINT.search(name):
        return dexterity
    if _FINESSE_HINT.search(name):
        return max(strength, dexterity)
    return strength


def default_damage_dice(item_name: str, ability_mod: int) -> str:
    sides = 6 if _LIGHT_HINT.search(item_name) else 8
    if ability_mod > 0:
        return f"1d{sides}+{ability_mod}"
    if ability_mod < 0:
        return f"1d{sides}{ability_mod}"
    return f"1d{sides}"


def weapon_profile_from_item(sheet: dict, item: dict) -> tuple[int | None, str | None]:
    if not item.get("equipped"):
        return None, None

    name = str(item.get("name") or "Weapon")
    abilities = sheet.get("abilities") or {}
    prof = sheet.get("proficiency_bonus")
    ability_mod = _attack_ability_modifier(name, abilities)

    attack_bonus = item.get("to_hit")
    if attack_bonus is None:
        if prof is None:
            return None, None
        attack_bonus = int(prof) + ability_mod
    else:
        attack_bonus = int(attack_bonus)

    damage_dice = extract_damage_dice(item.get("damage"))
    if not damage_dice:
        damage_dice = default_damage_dice(name, ability_mod)

    return attack_bonus, damage_dice


def find_equipped_weapon(sheet: dict, action_id: str, action_name: str) -> dict | None:
    clean_name = clean_action_label(action_name).casefold()
    weapon_key = action_id.removeprefix("weapon-") if action_id.startswith("weapon-") else ""

    for item in sheet.get("inventory") or []:
        if not isinstance(item, dict) or not item.get("equipped"):
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
