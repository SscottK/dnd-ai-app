import json
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
        "features": [],
        "conditions": [],
        "notes": "",
    }


def _ensure_item_ids(items: list[dict]) -> list[dict]:
    result = []
    for index, item in enumerate(items):
        entry = dict(item)
        if not entry.get("id"):
            entry["id"] = f"item-{index}"
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

    if isinstance(sheet.get("features"), list):
        base["features"] = _ensure_item_ids(sheet["features"])

    if isinstance(sheet.get("conditions"), list):
        base["conditions"] = list(sheet["conditions"])

    return base


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
