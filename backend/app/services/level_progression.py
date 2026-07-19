"""Character level-up progression helpers (5.5e / 2024).

Applies HP, hit dice, proficiency bonus, catalog unlocks, BR feature-table
choices, and stores reversible snapshots on the sheet.
"""

from __future__ import annotations

import copy
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from app.services.level_choices import (
    apply_choices_to_sheet,
    auto_features_at_level,
    choices_at_level,
    validate_choices,
)
from app.services.sheet_enrichment import _load_class_catalog, enrich_sheet_pipeline

HIT_DIE_BY_CLASS: dict[str, int] = {
    "Barbarian": 12,
    "Fighter": 10,
    "Paladin": 10,
    "Ranger": 10,
    "Bard": 8,
    "Cleric": 8,
    "Druid": 8,
    "Monk": 8,
    "Rogue": 8,
    "Warlock": 8,
    "Sorcerer": 6,
    "Wizard": 6,
}

_HIT_DICE_RE = re.compile(r"(\d+)\s*d\s*(\d+)", re.IGNORECASE)
MAX_LEVEL_HISTORY = 10


def proficiency_bonus_for_level(level: int) -> int:
    level = max(1, int(level))
    return ((level - 1) // 4) + 2


def hit_die_for_class(class_name: str | None) -> int:
    if not class_name:
        return 8
    return HIT_DIE_BY_CLASS.get(str(class_name).strip(), 8)


def average_hp_gain(hit_die: int, con_mod: int) -> int:
    avg = (hit_die // 2) + 1
    return max(1, avg + int(con_mod))


def con_modifier(sheet: dict) -> int:
    score = (sheet.get("abilities") or {}).get("con")
    try:
        return (int(score) - 10) // 2
    except (TypeError, ValueError):
        return 0


def bump_hit_dice(hit_dice: str | None, class_name: str | None) -> str:
    die = hit_die_for_class(class_name)
    if hit_dice:
        match = _HIT_DICE_RE.search(str(hit_dice))
        if match:
            count = int(match.group(1)) + 1
            sides = int(match.group(2))
            return f"{count}d{sides}"
    return f"2d{die}"


def primary_class_name(sheet: dict, fallback: str | None) -> str | None:
    classes = sheet.get("classes")
    if isinstance(classes, list) and classes:
        first = classes[0]
        if isinstance(first, dict) and first.get("name"):
            return str(first["name"]).strip()
    return (fallback or "").strip() or None


def unlocks_at_level(class_name: str | None, new_level: int) -> list[dict[str, str]]:
    """Combat-catalog unlocks newly available exactly at new_level."""
    if not class_name:
        return []
    catalog = _load_class_catalog()
    spec = catalog.get(class_name) or {}
    unlocks: list[dict[str, str]] = []

    actions = (spec.get("actions_by_level") or {}).get(str(new_level)) or []
    for name in actions:
        unlocks.append(
            {
                "kind": "feature",
                "name": str(name),
                "detail": f"Unlocked at {class_name} level {new_level}.",
            }
        )

    for bucket in ("resources", "limited_uses"):
        for entry in spec.get(bucket) or []:
            if int(entry.get("min_level") or 1) != int(new_level):
                continue
            unlocks.append(
                {
                    "kind": "resource",
                    "name": str(entry.get("name") or entry.get("id") or "Resource"),
                    "detail": f"New limited-use tracker at {class_name} level {new_level}.",
                }
            )
    return unlocks


def _set_class_levels(sheet: dict, class_name: str | None, new_level: int) -> None:
    classes = sheet.get("classes")
    if isinstance(classes, list) and classes:
        for entry in classes:
            if not isinstance(entry, dict):
                continue
            if class_name and str(entry.get("name") or "").strip().casefold() == class_name.casefold():
                entry["level"] = new_level
                return
        if isinstance(classes[0], dict):
            classes[0]["level"] = new_level
            return
    if class_name:
        sheet["classes"] = [{"name": class_name, "level": new_level, "subclass": None}]


def _merge_feature_unlocks(sheet: dict, unlocks: list[dict[str, str]], class_name: str, new_level: int) -> None:
    features = list(sheet.get("features") or [])
    existing = {
        str(entry.get("name") or "").strip().casefold()
        for entry in features
        if isinstance(entry, dict)
    }
    for unlock in unlocks:
        if unlock.get("kind") != "feature":
            continue
        name = str(unlock.get("name") or "").strip()
        if not name or name.casefold() in existing:
            continue
        features.append(
            {
                "name": name,
                "source": f"{class_name} {new_level}",
                "description": unlock.get("detail")
                or f"Unlocked at {class_name} level {new_level}.",
                "display": ["features_tab"],
            }
        )
        existing.add(name.casefold())
    sheet["features"] = features


def _refresh_resource_caps(sheet: dict, class_name: str | None, new_level: int) -> None:
    if not class_name:
        return
    catalog = _load_class_catalog()
    spec = catalog.get(class_name) or {}
    by_id: dict[str, dict] = {}
    for bucket in ("resources", "limited_uses"):
        for entry in spec.get(bucket) or []:
            rid = str(entry.get("id") or "").strip()
            if rid:
                by_id[rid] = entry

    resources = sheet.get("resources") or []
    if not isinstance(resources, list):
        return
    from app.services.sheet_enrichment import _resolve_max_for_resource

    for row in resources:
        if not isinstance(row, dict):
            continue
        rid = str(row.get("id") or "").strip()
        entry = by_id.get(rid)
        if not entry:
            continue
        if new_level < int(entry.get("min_level") or 1):
            continue
        new_max = _resolve_max_for_resource(entry, level=new_level, sheet=sheet)
        if new_max <= 0:
            new_max = int(entry.get("max") or row.get("max") or 1)
        try:
            old_max = int(row.get("max") or 0)
            old_current = int(row.get("current") or 0)
        except (TypeError, ValueError):
            old_max, old_current = 0, 0
        row["max"] = new_max
        if old_current >= old_max:
            row["current"] = new_max
        else:
            row["current"] = min(old_current, new_max)


def _sheet_without_history(sheet: dict) -> dict:
    cleaned = copy.deepcopy(sheet)
    cleaned.pop("level_history", None)
    return cleaned


def _push_history(sheet: dict, entry: dict[str, Any]) -> None:
    history = list(sheet.get("level_history") or [])
    history.append(entry)
    sheet["level_history"] = history[-MAX_LEVEL_HISTORY:]


def level_history_summary(sheet: dict) -> list[dict[str, Any]]:
    rows = []
    for entry in sheet.get("level_history") or []:
        if not isinstance(entry, dict):
            continue
        rows.append(
            {
                "id": entry.get("id"),
                "at": entry.get("at"),
                "from_level": entry.get("from_level"),
                "to_level": entry.get("to_level"),
                "hp_gain": entry.get("hp_gain"),
                "class_name": entry.get("class_name"),
                "choices_summary": entry.get("choices_summary") or [],
            }
        )
    return rows


def preview_level_up(
    *,
    sheet: dict,
    class_name: str | None,
    current_level: int,
) -> dict[str, Any]:
    new_level = int(current_level) + 1
    cls = primary_class_name(sheet, class_name)
    die = hit_die_for_class(cls)
    con_mod = con_modifier(sheet)
    avg = average_hp_gain(die, con_mod)
    old_pb = proficiency_bonus_for_level(current_level)
    new_pb = proficiency_bonus_for_level(new_level)
    catalog_unlocks = unlocks_at_level(cls, new_level)
    auto_feats = auto_features_at_level(cls, new_level)
    # Prefer richer BR auto features; still include catalog resources/features.
    seen = {u["name"].casefold() for u in auto_feats}
    unlocks = list(auto_feats)
    for unlock in catalog_unlocks:
        key = str(unlock.get("name") or "").casefold()
        if key and key not in seen:
            unlocks.append(unlock)
            seen.add(key)

    required_choices = choices_at_level(cls, new_level, sheet)
    history = level_history_summary(sheet)
    return {
        "current_level": current_level,
        "new_level": new_level,
        "class_name": cls,
        "hit_die": die,
        "con_modifier": con_mod,
        "average_hp_gain": avg,
        "roll_hp_min": max(1, 1 + con_mod),
        "roll_hp_max": max(1, die + con_mod),
        "proficiency_bonus": {"from": old_pb, "to": new_pb},
        "hit_dice_next": bump_hit_dice(sheet.get("hit_dice"), cls),
        "unlocks": unlocks,
        "required_choices": required_choices,
        "at_level_cap": new_level > 20,
        "can_revert": bool(history),
        "last_level_up": history[-1] if history else None,
    }


def apply_level_up(
    *,
    sheet: dict,
    class_name: str | None,
    current_level: int,
    current_hp: int | None,
    current_max_hp: int | None,
    current_ac: int | None = None,
    current_skills: str | None = None,
    hp_gain: int,
    heal_current: bool = True,
    choices: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return updated character fields + sheet dict after leveling once."""
    if current_level >= 20:
        raise ValueError("Character is already at level 20")
    if hp_gain < 1:
        raise ValueError("HP gain must be at least 1")

    new_level = int(current_level) + 1
    cls = primary_class_name(sheet, class_name)
    required = choices_at_level(cls, new_level, sheet)
    validated = validate_choices(required, choices)

    snapshot = {
        "level": current_level,
        "class_name": class_name,
        "hp": current_hp,
        "max_hp": current_max_hp,
        "ac": current_ac,
        "skills": current_skills,
        "sheet": _sheet_without_history(sheet),
    }

    next_sheet = dict(sheet)
    existing_history = list(sheet.get("level_history") or [])
    next_sheet["level_history"] = existing_history

    _set_class_levels(next_sheet, cls, new_level)
    next_sheet["proficiency_bonus"] = proficiency_bonus_for_level(new_level)
    next_sheet["hit_dice"] = bump_hit_dice(next_sheet.get("hit_dice"), cls)

    catalog_unlocks = unlocks_at_level(cls, new_level)
    auto_feats = auto_features_at_level(cls, new_level)
    unlocks = list(auto_feats)
    seen = {u["name"].casefold() for u in unlocks}
    for unlock in catalog_unlocks:
        key = str(unlock.get("name") or "").casefold()
        if key and key not in seen:
            unlocks.append(unlock)
            seen.add(key)

    _merge_feature_unlocks(next_sheet, unlocks, cls or "Class", new_level)
    choice_unlocks = apply_choices_to_sheet(
        next_sheet,
        class_name=cls,
        new_level=new_level,
        choices=validated,
        required=required,
    )

    enriched = enrich_sheet_pipeline(next_sheet, class_name=cls, level=new_level)
    _refresh_resource_caps(enriched, cls, new_level)
    enriched = enrich_sheet_pipeline(enriched, class_name=cls, level=new_level)
    _refresh_resource_caps(enriched, cls, new_level)

    try:
        max_hp = int(current_max_hp or 0) + int(hp_gain)
    except (TypeError, ValueError):
        max_hp = int(hp_gain)
    max_hp = max(1, max_hp)

    try:
        hp = int(current_hp) if current_hp is not None else max_hp
    except (TypeError, ValueError):
        hp = max_hp
    if heal_current:
        hp = min(max_hp, hp + int(hp_gain))
    else:
        hp = min(hp, max_hp)

    history_entry = {
        "id": str(uuid.uuid4()),
        "at": datetime.now(timezone.utc).isoformat(),
        "from_level": current_level,
        "to_level": new_level,
        "class_name": cls,
        "hp_gain": int(hp_gain),
        "choices": validated,
        "choices_summary": choice_unlocks,
        "snapshot": snapshot,
    }
    _push_history(enriched, history_entry)

    return {
        "level": new_level,
        "class_name": cls,
        "hp": hp,
        "max_hp": max_hp,
        "sheet": enriched,
        "unlocks": unlocks + choice_unlocks,
        "choices_applied": choice_unlocks,
        "proficiency_bonus": enriched.get("proficiency_bonus"),
        "hit_dice": enriched.get("hit_dice"),
        "history_entry_id": history_entry["id"],
    }


def revert_level_up(
    *,
    sheet: dict,
    snapshot_id: str | None = None,
) -> dict[str, Any]:
    """Restore the sheet/character fields from a level-up snapshot."""
    history = list(sheet.get("level_history") or [])
    if not history:
        raise ValueError("No level-up history to revert")

    index = len(history) - 1
    if snapshot_id:
        found = None
        for i, entry in enumerate(history):
            if isinstance(entry, dict) and str(entry.get("id")) == str(snapshot_id):
                found = i
                break
        if found is None:
            raise ValueError("Level-up snapshot not found")
        # Only allow reverting the latest entry for safety (linear undo).
        if found != len(history) - 1:
            raise ValueError("Only the most recent level-up can be reverted")
        index = found

    entry = history[index]
    if not isinstance(entry, dict) or not isinstance(entry.get("snapshot"), dict):
        raise ValueError("Level-up snapshot is corrupt")

    snap = entry["snapshot"]
    restored_sheet = copy.deepcopy(snap.get("sheet") or {})
    if not isinstance(restored_sheet, dict):
        raise ValueError("Level-up snapshot sheet is corrupt")
    restored_sheet["level_history"] = history[:index]

    return {
        "level": snap.get("level"),
        "class_name": snap.get("class_name"),
        "hp": snap.get("hp"),
        "max_hp": snap.get("max_hp"),
        "ac": snap.get("ac"),
        "skills": snap.get("skills"),
        "sheet": restored_sheet,
        "reverted": {
            "id": entry.get("id"),
            "from_level": entry.get("from_level"),
            "to_level": entry.get("to_level"),
        },
    }
