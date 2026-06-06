import json
import re
from typing import Any

ABILITY_KEYS = ("str", "dex", "con", "int", "wis", "cha")

SKILL_NAMES = [
    ("Athletics", "str"),
    ("Acrobatics", "dex"),
    ("Sleight of Hand", "dex"),
    ("Stealth", "dex"),
    ("Arcana", "int"),
    ("History", "int"),
    ("Investigation", "int"),
    ("Nature", "int"),
    ("Religion", "int"),
    ("Animal Handling", "wis"),
    ("Insight", "wis"),
    ("Medicine", "wis"),
    ("Perception", "wis"),
    ("Survival", "wis"),
    ("Deception", "cha"),
    ("Intimidation", "cha"),
    ("Performance", "cha"),
    ("Persuasion", "cha"),
]


def ability_modifier(score: int | None) -> int | None:
    if score is None:
        return None
    return (score - 10) // 2


def empty_sheet() -> dict[str, Any]:
    return {
        "abilities": {key: None for key in ABILITY_KEYS},
        "proficiency_bonus": None,
        "speed": None,
        "initiative_bonus": None,
        "passive_perception": None,
        "hit_dice": None,
        "saving_throws": [
            {"ability": key, "proficient": False, "bonus": None} for key in ABILITY_KEYS
        ],
        "skills": [
            {
                "name": name,
                "ability": abbr,
                "proficient": False,
                "expertise": False,
                "bonus": None,
            }
            for name, abbr in SKILL_NAMES
        ],
        "proficiencies": {
            "armor": [],
            "weapons": [],
            "tools": [],
            "languages": [],
        },
        "inventory": [],
        "equipped_overrides": {},
        "features": [],
        "attacks": [],
        "spells": [],
        "combat_actions": [],
        "ac_bonuses": [],
        "ac_breakdown": [],
        "authoritative_ac": None,
        "conditions": [],
        "notes": "",
    }


def normalize_item_key(name: str | None) -> str:
    return re.sub(r"\s+", " ", str(name or "").strip().lower())


def apply_equipped_overrides(sheet: dict[str, Any]) -> dict[str, Any]:
    overrides = sheet.get("equipped_overrides") or {}
    if not overrides:
        return sheet

    merged = dict(sheet)
    inventory = []
    for item in sheet.get("inventory") or []:
        entry = dict(item)
        key = normalize_item_key(entry.get("name"))
        if key in overrides:
            entry["equipped"] = bool(overrides[key])
        inventory.append(entry)
    merged["inventory"] = inventory
    return merged


def merge_sheet_on_resync(old_sheet: dict[str, Any], new_sheet: dict[str, Any]) -> dict[str, Any]:
    merged = dict(new_sheet)
    old_overrides = dict(old_sheet.get("equipped_overrides") or {})
    new_overrides = dict(new_sheet.get("equipped_overrides") or {})
    merged["equipped_overrides"] = {**new_overrides, **old_overrides}

    old_notes = str(old_sheet.get("notes") or "").strip()
    new_notes = str(new_sheet.get("notes") or "").strip()
    if old_notes and not new_notes:
        merged["notes"] = old_notes

    old_inventory = old_sheet.get("inventory") or []
    new_inventory = _ensure_item_ids(new_sheet.get("inventory") or [])
    old_by_name = {normalize_item_key(item.get("name")): item for item in old_inventory}
    overrides = merged["equipped_overrides"]

    inventory = []
    for item in new_inventory:
        entry = dict(item)
        key = normalize_item_key(entry.get("name"))
        old_item = old_by_name.get(key)
        if key in overrides:
            entry["equipped"] = bool(overrides[key])
        elif old_item is not None and "equipped" in old_item:
            entry["equipped"] = bool(old_item.get("equipped"))
        inventory.append(entry)

    merged["inventory"] = inventory
    return apply_equipped_overrides(merged)


def _ensure_item_ids(items: list[dict]) -> list[dict]:
    result = []
    for index, item in enumerate(items):
        entry = dict(item)
        if not entry.get("id"):
            entry["id"] = f"item-{index}"
        if entry.get("ac_bonus") is not None:
            try:
                entry["ac_bonus"] = int(entry["ac_bonus"])
            except (TypeError, ValueError):
                entry.pop("ac_bonus", None)
        result.append(entry)
    return result


def normalize_sheet(raw: dict | None) -> dict[str, Any]:
    base = empty_sheet()
    if not raw:
        return base

    sheet = raw.get("sheet") if isinstance(raw.get("sheet"), dict) else raw

    if isinstance(sheet.get("abilities"), dict):
        for key in ABILITY_KEYS:
            val = sheet["abilities"].get(key)
            base["abilities"][key] = int(val) if val is not None else None

    for field in (
        "proficiency_bonus",
        "speed",
        "initiative_bonus",
        "passive_perception",
        "hit_dice",
        "notes",
    ):
        if sheet.get(field) is not None:
            base[field] = sheet[field]

    if isinstance(sheet.get("saving_throws"), list):
        by_ability = {row.get("ability"): row for row in sheet["saving_throws"]}
        base["saving_throws"] = [
            {
                "ability": key,
                "proficient": bool(by_ability.get(key, {}).get("proficient")),
                "bonus": by_ability.get(key, {}).get("bonus"),
            }
            for key in ABILITY_KEYS
        ]

    if isinstance(sheet.get("skills"), list) and sheet["skills"]:
        by_name = {row.get("name"): row for row in sheet["skills"]}
        merged = []
        for name, abbr in SKILL_NAMES:
            row = by_name.get(name, {})
            merged.append(
                {
                    "name": name,
                    "ability": abbr,
                    "proficient": bool(row.get("proficient")),
                    "expertise": bool(row.get("expertise")),
                    "bonus": row.get("bonus"),
                }
            )
        base["skills"] = merged

    if isinstance(sheet.get("proficiencies"), dict):
        for key in ("armor", "weapons", "tools", "languages"):
            vals = sheet["proficiencies"].get(key)
            base["proficiencies"][key] = list(vals) if isinstance(vals, list) else []

    if isinstance(sheet.get("inventory"), list):
        base["inventory"] = _ensure_item_ids(sheet["inventory"])

    if isinstance(sheet.get("equipped_overrides"), dict):
        base["equipped_overrides"] = {
            normalize_item_key(key): bool(value)
            for key, value in sheet["equipped_overrides"].items()
        }

    if isinstance(sheet.get("features"), list):
        base["features"] = _ensure_item_ids(sheet["features"])

    if isinstance(sheet.get("attacks"), list):
        base["attacks"] = [
            {
                "id": str(entry.get("id") or f"attack-{index}"),
                "name": str(entry.get("name") or "Attack"),
                "to_hit": entry.get("to_hit"),
                "damage": str(entry.get("damage") or ""),
                "action_type": str(entry.get("action_type") or "action"),
                "targeting": str(entry.get("targeting") or "one_enemy"),
                "description": str(entry.get("description") or ""),
            }
            for index, entry in enumerate(sheet["attacks"])
            if isinstance(entry, dict) and entry.get("name")
        ]

    if isinstance(sheet.get("spells"), list):
        base["spells"] = [
            {
                "id": str(entry.get("id") or f"spell-{index}"),
                "name": str(entry.get("name") or "Spell"),
                "level": entry.get("level"),
                "action_type": str(entry.get("action_type") or "action"),
                "targeting": str(entry.get("targeting") or "one_enemy"),
                "prepared": bool(entry.get("prepared", True)),
                "description": str(entry.get("description") or ""),
            }
            for index, entry in enumerate(sheet["spells"])
            if isinstance(entry, dict) and entry.get("name")
        ]

    if isinstance(sheet.get("combat_actions"), list):
        base["combat_actions"] = [
            {
                "id": str(entry.get("id") or f"action-{index}"),
                "name": str(entry.get("name") or "Action"),
                "action_type": str(entry.get("action_type") or "action"),
                "targeting": str(entry.get("targeting") or "self"),
                "description": str(entry.get("description") or ""),
                "attack_bonus": entry.get("attack_bonus"),
                "damage_dice": entry.get("damage_dice"),
            }
            for index, entry in enumerate(sheet["combat_actions"])
            if isinstance(entry, dict) and entry.get("name")
        ]

    if isinstance(sheet.get("ac_bonuses"), list):
        base["ac_bonuses"] = [
            {
                "name": str(entry.get("name") or "AC bonus"),
                "bonus": int(entry["bonus"]) if entry.get("bonus") is not None else 0,
                "requires_armor": bool(entry.get("requires_armor", True)),
            }
            for entry in sheet["ac_bonuses"]
            if isinstance(entry, dict)
        ]

    if isinstance(sheet.get("ac_breakdown"), list):
        base["ac_breakdown"] = [
            {
                "label": str(entry.get("label") or entry.get("name") or "AC line"),
                "value": int(entry.get("value") or entry.get("bonus") or 0),
                "kind": str(entry.get("kind") or "bonus"),
                "requires_armor": bool(entry.get("requires_armor", True)),
            }
            for entry in sheet["ac_breakdown"]
            if isinstance(entry, dict)
        ]

    if sheet.get("authoritative_ac") is not None:
        try:
            base["authoritative_ac"] = int(sheet["authoritative_ac"])
        except (TypeError, ValueError):
            pass

    if isinstance(sheet.get("conditions"), list):
        base["conditions"] = list(sheet["conditions"])

    return apply_equipped_overrides(base)


def sheet_to_json(sheet: dict) -> str:
    return json.dumps(normalize_sheet(sheet))


def parse_sheet_json(text: str | None) -> dict[str, Any]:
    if not text:
        return empty_sheet()
    try:
        return normalize_sheet(json.loads(text))
    except (json.JSONDecodeError, TypeError, ValueError):
        return empty_sheet()


def skills_summary(sheet: dict) -> str | None:
    names = [
        skill["name"]
        for skill in sheet.get("skills", [])
        if skill.get("proficient") or skill.get("expertise")
    ]
    return ", ".join(names) if names else None
