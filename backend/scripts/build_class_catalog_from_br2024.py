#!/usr/bin/env python3
"""Build class_catalog.json from ingested br-2024 rules."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BR_DIR = ROOT / "data" / "br-2024"
OUT_CLASS = ROOT / "data" / "class_catalog.json"
OUT_COMBAT = ROOT / "data" / "combat_catalog_2024.json"

CLASS_NAMES = [
    "Barbarian",
    "Bard",
    "Cleric",
    "Druid",
    "Fighter",
    "Monk",
    "Paladin",
    "Ranger",
    "Rogue",
    "Sorcerer",
    "Warlock",
    "Wizard",
]

# Not standalone turn-menu choices (passive or riders).
_PASSIVE_ACTIONS = frozenset(
    {
        "two extra attacks",
        "three extra attacks",
        "instinctive pounce",
        "tactical shift",
        "font of magic",
        "spell mastery",
        "sorcery incarnate",
    }
)

# Combat actions missing from ingest classifier (pool text marked them passive).
_SUPPLEMENTAL_COMBAT_ACTIONS = [
    {
        "name": "Lay on Hands",
        "action_type": "bonus_action",
        "targeting": "one_ally_or_self",
        "category": "class_feature",
        "source_class": "Paladin",
        "min_level": 1,
        "description": "Bonus Action: touch a creature and spend from your Lay on Hands pool to restore Hit Points.",
        "resource_cost": {"resource_id": "lay-on-hands", "amount": 1},
    },
]

# Resources not emitted by table-column ingest.
_SUPPLEMENTAL_RESOURCES: dict[str, list[dict]] = {
    "Bard": [
        {
            "id": "bardic-inspiration",
            "name": "Bardic Inspiration",
            "min_level": 1,
            "max_formula": "charisma_modifier",
            "recharge": "long_rest",
            "aliases": ["bardic inspiration", "bardic inspiration die"],
        }
    ],
    "Paladin": [
        {
            "id": "lay-on-hands",
            "name": "Lay on Hands",
            "min_level": 1,
            "max_formula": "level_times_5",
            "recharge": "long_rest",
            "aliases": ["lay on hands", "lay on hands pool"],
        }
    ],
    "Fighter": [],
}

_TABLE_RESOURCE_COLUMNS = {
    "spell_slots": ("pact-slots", "Pact Magic Slots", "short_rest"),
}


def _norm(name: str) -> str:
    return str(name or "").strip().casefold()


def _parse_int(value: str) -> int | None:
    raw = str(value or "").strip()
    if not raw or raw in {"—", "-", "–"}:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _resources_from_br(class_name: str, class_payload: dict) -> list[dict]:
    resources: list[dict] = []
    for entry in class_payload.get("resources") or []:
        spec = {
            "id": entry["id"],
            "name": entry["name"],
            "min_level": min(int(k) for k in entry.get("max_by_level", {"1": 1})),
            "max_by_level": {str(k): int(v) for k, v in entry["max_by_level"].items()},
            "recharge": entry.get("recharge") or "long_rest",
        }
        if spec["id"] == "focus-points":
            spec["aliases"] = ["focus points", "focus point", "ki", "ki points", "ki point"]
        resources.append(spec)

    table = class_payload.get("feature_table") or []
    for column, (rid, label, recharge) in _TABLE_RESOURCE_COLUMNS.items():
        if not table or column not in table[0]:
            continue
        max_by_level: dict[str, int] = {}
        for row in table:
            val = _parse_int(row.get(column, ""))
            if val is None:
                continue
            max_by_level[str(row["level"])] = val
        if not max_by_level:
            continue
        resources.append(
            {
                "id": rid,
                "name": label,
                "min_level": min(int(k) for k in max_by_level),
                "max_by_level": max_by_level,
                "recharge": recharge,
            }
        )

    for entry in _SUPPLEMENTAL_RESOURCES.get(class_name) or []:
        resources.append(dict(entry))

    return resources


def _limited_uses_from_br(class_name: str, class_payload: dict) -> list[dict]:
    uses: list[dict] = []
    table = class_payload.get("feature_table") or []

    if class_name == "Fighter":
        second_wind: dict[str, int] = {}
        for row in table:
            val = _parse_int(row.get("second_wind", ""))
            if val is not None:
                second_wind[str(row["level"])] = val
        uses.append(
            {
                "id": "second-wind",
                "name": "Second Wind",
                "min_level": 1,
                "recharge": "short_rest",
                **({"max_by_level": second_wind} if second_wind else {"max": 2}),
            }
        )
        uses.append(
            {
                "id": "action-surge",
                "name": "Action Surge",
                "min_level": 2,
                "max": 1,
                "recharge": "short_rest",
                "max_at_level": {"17": 2},
            }
        )
    return uses


def _actions_by_level(combat_actions: list[dict]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = defaultdict(list)
    for entry in combat_actions:
        name = str(entry.get("name") or "").strip()
        if not name or _norm(name) in _PASSIVE_ACTIONS:
            continue
        level = entry.get("min_level")
        if level is None:
            continue
        key = str(int(level))
        if name not in grouped[key]:
            grouped[key].append(name)
    return dict(sorted(grouped.items(), key=lambda item: int(item[0])))


def main() -> None:
    classes_payload = json.loads((BR_DIR / "classes.json").read_text(encoding="utf-8"))
    combat_payload = json.loads((BR_DIR / "combat_actions.json").read_text(encoding="utf-8"))
    br_classes = classes_payload.get("classes") or {}
    br_combat = list(combat_payload.get("class_features") or [])

    for entry in _SUPPLEMENTAL_COMBAT_ACTIONS:
        if not any(_norm(row.get("name")) == _norm(entry["name"]) for row in br_combat):
            br_combat.append(entry)

    catalog_classes: dict[str, dict] = {}
    for class_name in CLASS_NAMES:
        payload = br_classes.get(class_name) or {}
        class_combat = [row for row in br_combat if row.get("source_class") == class_name]
        resources = _resources_from_br(class_name, payload)
        limited_uses = _limited_uses_from_br(class_name, payload)
        class_entry: dict = {
            "resources": resources,
            "actions_by_level": _actions_by_level(class_combat),
        }
        if limited_uses:
            class_entry["limited_uses"] = limited_uses
        catalog_classes[class_name] = class_entry
        print(
            f"{class_name}: {len(resources)} resources, "
            f"{len(limited_uses)} limited uses, "
            f"{sum(len(v) for v in class_entry['actions_by_level'].values())} actions"
        )

    class_catalog = {
        "_source": "https://www.dndbeyond.com/sources/dnd/br-2024",
        "_edition": "2024",
        "_note": "Generated from br-2024 ingest. Regenerate via build_class_catalog_from_br2024.py",
        "classes": catalog_classes,
    }
    OUT_CLASS.write_text(json.dumps(class_catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    srd_path = ROOT / "data" / "srd-5.2.1" / "combat_actions.json"
    srd = json.loads(srd_path.read_text(encoding="utf-8")) if srd_path.is_file() else {}
    merged = {
        "_source": class_catalog["_source"],
        "_edition": "2024",
        "standard_actions": srd.get("standard_actions") or [],
        "class_features": br_combat,
    }
    OUT_COMBAT.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_CLASS} and {OUT_COMBAT}")


if __name__ == "__main__":
    main()
