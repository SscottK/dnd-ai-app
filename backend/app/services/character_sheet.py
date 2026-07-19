import json
import re
from typing import Any

from app.schemas.character_sheet import (
    normalize_combat_action_row,
    normalize_feature_row,
    normalize_resource_row,
    normalize_wild_shape_row,
)
from app.services.sheet_enrichment import enrich_sheet_pipeline

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
        "race": None,
        "species": None,
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
        "resources": [],
        "classes": [],
        "wild_shapes": [],
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


def _resource_merge_key(entry: dict[str, Any]) -> str:
    return str(entry.get("id") or entry.get("name") or "").strip().casefold()


def merge_sheet_on_resync(old_sheet: dict[str, Any], new_sheet: dict[str, Any]) -> dict[str, Any]:
    merged = dict(new_sheet)
    old_overrides = dict(old_sheet.get("equipped_overrides") or {})
    new_overrides = dict(new_sheet.get("equipped_overrides") or {})
    merged["equipped_overrides"] = {**new_overrides, **old_overrides}

    old_notes = str(old_sheet.get("notes") or "").strip()
    new_notes = str(new_sheet.get("notes") or "").strip()
    if old_notes and not new_notes:
        merged["notes"] = old_notes

    old_conditions = old_sheet.get("conditions") or []
    new_conditions = new_sheet.get("conditions") or []
    if old_conditions and not new_conditions:
        merged["conditions"] = list(old_conditions)

    old_resources = {
        _resource_merge_key(entry): entry
        for entry in (old_sheet.get("resources") or [])
        if _resource_merge_key(entry)
    }
    resources: list[dict[str, Any]] = []
    seen_resource_keys: set[str] = set()
    for entry in new_sheet.get("resources") or []:
        merged_entry = dict(entry)
        key = _resource_merge_key(entry)
        seen_resource_keys.add(key)
        old_entry = old_resources.get(key)
        if old_entry is not None and old_entry.get("current") is not None:
            merged_entry["current"] = old_entry["current"]
        resources.append(merged_entry)
    for key, old_entry in old_resources.items():
        if key in seen_resource_keys:
            continue
        resources.append(dict(old_entry))
    if resources:
        merged["resources"] = resources

    if old_sheet.get("authoritative_ac") and not new_sheet.get("authoritative_ac"):
        merged["authoritative_ac"] = old_sheet["authoritative_ac"]
    if old_sheet.get("ac_bonuses") and not new_sheet.get("ac_bonuses"):
        merged["ac_bonuses"] = list(old_sheet["ac_bonuses"])
    if old_sheet.get("ac_breakdown") and not new_sheet.get("ac_breakdown"):
        merged["ac_breakdown"] = old_sheet["ac_breakdown"]

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


_ARMOR_BASE_AC = {
    "chain mail": 16,
    "chain shirt": 13,
    "plate": 18,
    "splint": 17,
    "ring mail": 14,
    "half plate": 15,
    "breastplate": 14,
    "scale mail": 14,
    "hide": 12,
    "studded leather": 12,
    "leather": 11,
    "padded": 11,
}


def _sanitize_item_ac_bonus(item: dict) -> dict:
    """ac_bonus is magical +N only — not standard shield/armor AC baked into rules."""
    entry = dict(item)
    bonus = entry.get("ac_bonus")
    if bonus is None:
        return entry
    try:
        bonus = int(bonus)
    except (TypeError, ValueError):
        entry.pop("ac_bonus", None)
        return entry

    name = str(entry.get("name") or "")
    lowered = re.sub(r"\s*\+\s*\d+\s*", " ", name, flags=re.I).strip().lower()
    has_magic_suffix = bool(re.search(r"\+\s*\d+", name))

    if "shield" in lowered and not has_magic_suffix:
        entry.pop("ac_bonus", None)
        return entry

    for label in _ARMOR_BASE_AC:
        if label in lowered and not has_magic_suffix:
            entry.pop("ac_bonus", None)
            return entry

    entry["ac_bonus"] = bonus
    return entry


def _ensure_item_ids(items: list[dict]) -> list[dict]:
    result = []
    for index, item in enumerate(items):
        entry = _sanitize_item_ac_bonus(dict(item))
        if not entry.get("id"):
            entry["id"] = f"item-{index}"
        result.append(entry)
    return result


def normalize_sheet(
    raw: dict | None,
    *,
    class_name: str | None = None,
    level: int | None = None,
) -> dict[str, Any]:
    base = empty_sheet()
    if not raw:
        return base

    sheet = raw.get("sheet") if isinstance(raw.get("sheet"), dict) else raw
    top_class = class_name or raw.get("class_name")
    top_level = level if level is not None else raw.get("level")

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
        "race",
        "species",
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
        base["features"] = [
            row
            for index, entry in enumerate(sheet["features"])
            if (row := normalize_feature_row(entry, index=index))
        ]

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
            row
            for index, entry in enumerate(sheet["combat_actions"])
            if (row := normalize_combat_action_row(entry, index=index))
        ]

    if isinstance(sheet.get("wild_shapes"), list):
        base["wild_shapes"] = [
            row
            for index, entry in enumerate(sheet["wild_shapes"])
            if (row := normalize_wild_shape_row(entry, index=index))
        ]

    if isinstance(sheet.get("resources"), list):
        base["resources"] = [
            row
            for index, entry in enumerate(sheet["resources"])
            if (row := normalize_resource_row(entry))
        ]

    if isinstance(sheet.get("classes"), list):
        base["classes"] = [
            {
                "name": str(entry.get("name") or ""),
                "level": int(entry.get("level") or 0),
                "subclass": entry.get("subclass"),
            }
            for entry in sheet["classes"]
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

    if isinstance(sheet.get("weapon_mastery"), list):
        base["weapon_mastery"] = [
            str(name).strip() for name in sheet["weapon_mastery"] if str(name).strip()
        ]

    if isinstance(sheet.get("level_history"), list):
        # Preserve reversible level-up snapshots (do not deep-normalize nested sheets).
        base["level_history"] = [
            entry for entry in sheet["level_history"] if isinstance(entry, dict)
        ][-10:]

    equipped = apply_equipped_overrides(base)
    enriched = enrich_sheet_pipeline(
        equipped,
        class_name=str(top_class).strip() if top_class else None,
        level=int(top_level) if top_level is not None else None,
    )
    # Enrichment builds a new dict; re-attach history / mastery so they survive save.
    if "level_history" in base:
        enriched["level_history"] = base["level_history"]
    if "weapon_mastery" in base:
        enriched["weapon_mastery"] = base["weapon_mastery"]
    return enriched


def sheet_to_json(sheet: dict) -> str:
    return json.dumps(normalize_sheet(sheet))


def parse_sheet_json(
    text: str | None,
    *,
    class_name: str | None = None,
    level: int | None = None,
) -> dict[str, Any]:
    if not text:
        return empty_sheet()
    try:
        return normalize_sheet(
            json.loads(text),
            class_name=class_name,
            level=level,
        )
    except (json.JSONDecodeError, TypeError, ValueError):
        return empty_sheet()


def effective_speed_from_sheet(sheet: dict[str, Any]) -> int | None:
    raw = sheet.get("speed")
    if raw is None:
        return None
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return None


def speed_from_character(character: Any) -> int | None:
    return effective_speed_from_sheet(parse_sheet_json(character.sheet_json))


def species_from_sheet(sheet: dict[str, Any]) -> str | None:
    for key in ("race", "species"):
        value = sheet.get(key)
        if value and str(value).strip():
            return str(value).strip()
    for feature in sheet.get("features") or []:
        if not isinstance(feature, dict):
            continue
        source = str(feature.get("source") or "").lower()
        if "species" in source or source == "race":
            name = str(feature.get("name") or "").strip()
            if name:
                return name
    return None


def _resource_current(sheet: dict[str, Any], *needles: str) -> int | None:
    for row in sheet.get("resources") or []:
        if not isinstance(row, dict):
            continue
        hay = f"{row.get('id') or ''} {row.get('name') or ''}".lower()
        if not any(needle in hay for needle in needles):
            continue
        for key in ("current", "max"):
            if row.get(key) is None:
                continue
            try:
                return int(row[key])
            except (TypeError, ValueError):
                continue
    return None


def roster_fields_from_character(character: Any) -> dict[str, Any]:
    sheet = parse_sheet_json(
        character.sheet_json,
        class_name=getattr(character, "class_name", None),
        level=getattr(character, "level", None),
    )
    return {
        "race": species_from_sheet(sheet),
        "heroic_inspiration": _resource_current(
            sheet, "heroic-inspiration", "heroic inspiration"
        ),
        "i_know_a_guy": _resource_current(sheet, "i-know-a-guy", "i know a guy", "know a guy"),
    }


def _proficiency_bonus(sheet: dict) -> int:
    raw = sheet.get("proficiency_bonus")
    try:
        if raw is not None:
            return int(raw)
    except (TypeError, ValueError):
        pass
    # Fall back from character level when PB missing (2024 table).
    level = None
    classes = sheet.get("classes") or []
    if isinstance(classes, list) and classes:
        try:
            level = sum(int(entry.get("level") or 0) for entry in classes if isinstance(entry, dict))
        except (TypeError, ValueError):
            level = None
    if not level:
        try:
            level = int(sheet.get("level") or 0) or None
        except (TypeError, ValueError):
            level = None
    if not level:
        return 0
    if level >= 17:
        return 6
    if level >= 13:
        return 5
    if level >= 9:
        return 4
    if level >= 5:
        return 3
    return 2


def sheet_has_alert_feat(sheet: dict) -> bool:
    """True when the 2024 Alert feat (Initiative Proficiency) is on the sheet."""
    needles = ("alert",)
    bags: list[str] = []
    for feature in sheet.get("features") or []:
        if isinstance(feature, dict):
            bags.append(str(feature.get("name") or ""))
            bags.append(str(feature.get("source") or ""))
        else:
            bags.append(str(feature))
    for feat in sheet.get("feats") or []:
        if isinstance(feat, dict):
            bags.append(str(feat.get("name") or ""))
        else:
            bags.append(str(feat))
    background = sheet.get("background")
    if isinstance(background, dict):
        bags.append(str(background.get("feat") or ""))
        bags.append(str(background.get("name") or ""))
    elif isinstance(background, str):
        bags.append(background)
    feat_field = sheet.get("feat") or sheet.get("origin_feat")
    if feat_field:
        bags.append(str(feat_field))
    return any(any(n in text.casefold() for n in needles) for text in bags if text)


def computed_initiative_bonus(sheet: dict) -> int:
    """2024 initiative modifier: Dex mod, plus PB when Alert is present.

    If the sheet stores a higher explicit bonus (magic items, etc.), keep the higher value.
    """
    abilities = sheet.get("abilities") or {}
    dex_mod = ability_modifier(abilities.get("dex")) or 0
    total = int(dex_mod)
    if sheet_has_alert_feat(sheet):
        total += _proficiency_bonus(sheet)
    explicit = sheet.get("initiative_bonus")
    if explicit is not None:
        try:
            explicit_i = int(explicit)
            if explicit_i > total:
                return explicit_i
        except (TypeError, ValueError):
            pass
    return total


def computed_skill_bonus(sheet: dict, skill_name: str) -> int:
    target = str(skill_name or "").strip().casefold()
    for row in sheet.get("skills") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("name") or "").strip().casefold() != target:
            continue
        explicit = row.get("bonus")
        if explicit is not None:
            try:
                return int(explicit)
            except (TypeError, ValueError):
                pass
        ability = str(row.get("ability") or "").lower()
        mod = ability_modifier((sheet.get("abilities") or {}).get(ability)) or 0
        prof = _proficiency_bonus(sheet)
        total = mod
        if row.get("proficient"):
            total += prof
        if row.get("expertise"):
            total += prof
        return total
    return 0


def computed_save_bonus(sheet: dict, ability: str) -> int:
    ability_key = str(ability or "").lower()
    for row in sheet.get("saving_throws") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("ability") or "").lower() != ability_key:
            continue
        explicit = row.get("bonus")
        if explicit is not None:
            try:
                return int(explicit)
            except (TypeError, ValueError):
                pass
        mod = ability_modifier((sheet.get("abilities") or {}).get(ability_key)) or 0
        prof = _proficiency_bonus(sheet) if row.get("proficient") else 0
        return mod + prof
    mod = ability_modifier((sheet.get("abilities") or {}).get(ability_key)) or 0
    return mod


def skill_bonus(sheet: dict, skill_name: str) -> int | None:
    """Look up a skill's total bonus from the sheet, if present."""
    target = str(skill_name or "").strip().casefold()
    for row in sheet.get("skills") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("name") or "").strip().casefold() != target:
            continue
        bonus = row.get("bonus")
        if bonus is None:
            return None
        try:
            return int(bonus)
        except (TypeError, ValueError):
            return None
    return None


def skills_summary(sheet: dict) -> str | None:
    names = [
        skill["name"]
        for skill in sheet.get("skills", [])
        if skill.get("proficient") or skill.get("expertise")
    ]
    return ", ".join(names) if names else None
