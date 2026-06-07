"""Class-agnostic sheet enrichment: resources, combat actions, and UI routing."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.schemas.character_sheet import canonical_resource_id
from app.services.action_rules import enrich_sheet_actions, lookup_combat_action
from app.services.action_type_inference import infer_primary_action_type

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_RESOURCE_POOL_HINTS = re.compile(
    r"pool of|points you have|number of (?:ki|sorcery|rage)|replenish(?:es)? when you",
    re.IGNORECASE,
)
_KI_SPEND_ACTIONS = frozenset(
    {"flurry of blows", "patient defense", "step of the wind", "stunning strike"}
)
_RESOURCE_ONLY_NAMES = frozenset(
    {
        "ki",
        "focus points",
        "focus point",
        "sorcery points",
        "metamagic",
        "channel divinity",
        "bardic inspiration",
    }
)
_PASSIVE_FEATURE_NAMES = frozenset(
    {
        "martial arts",
        "unarmored defense",
        "unarmored movement",
        "ki-empowered strikes",
        "stillness of mind",
        "purity of body",
        "open hand technique",
        "extra attack",
        "slow fall",
        "deflect attacks",
        "deflect missiles",
        "weapon mastery",
        "two extra attacks",
        "three extra attacks",
    }
)
_PASSIVE_FEATURE_HINTS = re.compile(
    r"unarmored defense|defense while|passive|always active|while you are|"
    r"you gain proficiency|hit point maximum|speed increases|language|"
    r"attack twice|instead of once,?\s+whenever you take the attack action|"
    r"when you take the attack action on your turn,?\s+you can attack twice",
    re.IGNORECASE,
)


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


@lru_cache(maxsize=1)
def _load_class_catalog() -> dict:
    path = _DATA_DIR / "class_catalog.json"
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload.get("classes") or {}


def _casefold_name(value: str) -> str:
    return str(value or "").strip().casefold()


_WEAPON_ATTACK_HINTS = re.compile(
    r"unarmed|talon|bite|claw|fist|slam|kick|punch|hoof|horn|rapier|sword|axe|bow|dagger|mace",
    re.IGNORECASE,
)


def _is_real_attack_row(raw: dict, sheet: dict) -> bool:
    """PDF imports often put class features in attacks[] — keep weapon strikes only."""
    name = str(raw.get("name") or "").strip()
    if not name:
        return False

    key = _casefold_name(name)
    if key in _PASSIVE_FEATURE_NAMES or key in _RESOURCE_ONLY_NAMES:
        return False

    combat_names = {
        _casefold_name(entry.get("name"))
        for entry in sheet.get("combat_actions") or []
        if isinstance(entry, dict) and entry.get("name")
    }
    if key in combat_names:
        return False

    catalog = lookup_combat_action(name)
    if catalog:
        if catalog.get("category") == "class_feature":
            return False
        if catalog.get("healing_dice") or catalog.get("resource_cost") or catalog.get("effect"):
            return False
        if (
            catalog.get("targeting") == "self"
            and raw.get("to_hit") is None
            and not raw.get("damage")
            and not raw.get("damage_dice")
        ):
            return False

    if raw.get("to_hit") is not None or raw.get("damage") or raw.get("damage_dice"):
        return not (catalog and catalog.get("healing_dice"))

    return bool(_WEAPON_ATTACK_HINTS.search(name))


def sanitize_attacks(sheet: dict) -> dict:
    """Move mislabeled attacks[] rows into combat_actions."""
    next_sheet = dict(sheet)
    attacks = next_sheet.get("attacks") or []
    promoted = [dict(entry) for entry in next_sheet.get("combat_actions") or [] if isinstance(entry, dict)]
    promoted_names = {_casefold_name(entry.get("name")) for entry in promoted if entry.get("name")}

    kept: list[dict] = []
    for row in attacks:
        if not isinstance(row, dict):
            continue
        if _is_real_attack_row(row, next_sheet):
            kept.append(row)
            continue

        name = str(row.get("name") or "").strip()
        if not name:
            continue
        key = _casefold_name(name)
        if key in promoted_names:
            continue

        catalog = lookup_combat_action(name)
        action_type = (
            (catalog or {}).get("action_type")
            or infer_primary_action_type(name, str(row.get("description") or ""))
            or "action"
        )
        promoted.append(
            {
                "id": row.get("id") or f"promoted-{_slugify(name)}",
                "name": name,
                "action_type": action_type,
                "targeting": (catalog or {}).get("targeting") or "self",
                "description": str(
                    row.get("description") or (catalog or {}).get("description") or ""
                )[:500],
                "source": "import",
                "display": ["turn_actions"],
            }
        )
        promoted_names.add(key)

    next_sheet["attacks"] = kept
    next_sheet["combat_actions"] = promoted
    return next_sheet


def _ability_modifier(score: int | None) -> int:
    if score is None:
        return 0
    return (int(score) - 10) // 2


def _resolve_max_for_resource(
    spec: dict,
    *,
    level: int,
    sheet: dict,
) -> int:
    if spec.get("max_by_level"):
        table = {int(k): int(v) for k, v in spec["max_by_level"].items()}
        best = 0
        for threshold, value in sorted(table.items()):
            if level >= threshold:
                best = value
        return best

    formula = str(spec.get("max_formula") or "").strip()
    if formula == "level":
        return max(0, level)
    if formula == "level_times_5":
        return max(0, level * 5)
    if formula == "charisma_modifier":
        cha = (sheet.get("abilities") or {}).get("cha")
        return max(1, _ability_modifier(cha))
    if formula == "warlock_pact_slots":
        if level >= 11:
            return 3
        if level >= 2:
            return 2
        return 1

    if spec.get("max_at_level"):
        best = 0
        table = {int(k): int(v) for k, v in spec["max_at_level"].items()}
        for threshold, value in sorted(table.items()):
            if level >= threshold:
                best = value
        if best:
            return best

    return int(spec.get("max") or 0)


def normalize_classes(
    sheet: dict,
    *,
    class_name: str | None = None,
    level: int | None = None,
) -> list[dict]:
    classes: list[dict] = []
    raw = sheet.get("classes")
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()
            if not name:
                continue
            try:
                cls_level = int(entry.get("level") or 0)
            except (TypeError, ValueError):
                cls_level = 0
            classes.append(
                {
                    "name": name,
                    "level": cls_level,
                    "subclass": str(entry.get("subclass") or "").strip() or None,
                }
            )

    if not classes and class_name:
        try:
            cls_level = int(level or 1)
        except (TypeError, ValueError):
            cls_level = 1
        classes.append({"name": class_name.strip(), "level": cls_level, "subclass": None})

    return classes


def _existing_resource_ids(resources: list[dict]) -> set[str]:
    ids: set[str] = set()
    for entry in resources:
        if not isinstance(entry, dict):
            continue
        rid = str(entry.get("id") or _slugify(entry.get("name") or ""))
        if rid:
            ids.add(rid)
    return ids


def _normalize_resource_row(entry: dict, *, source_class: str) -> dict | None:
    if not isinstance(entry, dict):
        return None
    name = str(entry.get("name") or "").strip()
    if not name:
        return None
    rid = canonical_resource_id(str(entry.get("id") or _slugify(name)))
    try:
        current = int(entry.get("current") if entry.get("current") is not None else entry.get("max"))
    except (TypeError, ValueError):
        current = None
    try:
        max_val = int(entry.get("max") if entry.get("max") is not None else current)
    except (TypeError, ValueError):
        max_val = None
    return {
        "id": rid,
        "name": name,
        "current": current,
        "max": max_val,
        "recharge": str(entry.get("recharge") or "long_rest"),
        "source_class": str(entry.get("source_class") or source_class),
        "display": ["combat_pane"],
    }


def enrich_resources(sheet: dict, classes: list[dict]) -> list[dict]:
    catalog = _load_class_catalog()
    resources: list[dict] = []

    parsed = sheet.get("resources")
    if isinstance(parsed, list):
        for entry in parsed:
            normalized = _normalize_resource_row(entry, source_class=str(entry.get("source_class") or ""))
            if normalized:
                resources.append(normalized)

    known_ids = _existing_resource_ids(resources)

    for cls in classes:
        name = cls.get("name") or ""
        level = int(cls.get("level") or 0)
        class_spec = catalog.get(name) or {}
        for spec in class_spec.get("resources") or []:
            if level < int(spec.get("min_level") or 1):
                continue
            rid = canonical_resource_id(str(spec.get("id") or _slugify(spec.get("name") or "")))
            if rid in known_ids:
                continue
            max_val = _resolve_max_for_resource(spec, level=level, sheet=sheet)
            if max_val <= 0:
                continue
            resources.append(
                {
                    "id": rid,
                    "name": str(spec.get("name") or rid),
                    "current": max_val,
                    "max": max_val,
                    "recharge": str(spec.get("recharge") or "long_rest"),
                    "source_class": name,
                    "display": ["combat_pane"],
                }
            )
            known_ids.add(rid)

        for spec in class_spec.get("limited_uses") or []:
            if level < int(spec.get("min_level") or 1):
                continue
            rid = str(spec.get("id") or _slugify(spec.get("name") or ""))
            if rid in known_ids:
                continue
            max_val = _resolve_max_for_resource(spec, level=level, sheet=sheet)
            if max_val <= 0:
                max_val = int(spec.get("max") or 1)
            resources.append(
                {
                    "id": rid,
                    "name": str(spec.get("name") or rid),
                    "current": max_val,
                    "max": max_val,
                    "recharge": str(spec.get("recharge") or "short_rest"),
                    "source_class": name,
                    "display": ["combat_pane"],
                }
            )
            known_ids.add(rid)

    # Map parsed resource-like feature names (e.g. "Ki Points 3/3") into trackers.
    for feat in sheet.get("features") or []:
        if not isinstance(feat, dict):
            continue
        text = f"{feat.get('name') or ''} {feat.get('description') or ''}"
        for cls in classes:
            class_spec = catalog.get(cls.get("name") or "") or {}
            for spec in class_spec.get("resources") or []:
                aliases = [str(spec.get("name") or "")]
                aliases.extend(spec.get("aliases") or [])
                if not any(_casefold_name(alias) in _casefold_name(text) for alias in aliases):
                    continue
                rid = str(spec.get("id") or _slugify(spec.get("name") or ""))
                if rid in known_ids:
                    continue
                max_val = _resolve_max_for_resource(
                    spec,
                    level=int(cls.get("level") or 0),
                    sheet=sheet,
                )
                match = re.search(r"(\d+)\s*/\s*(\d+)", text)
                if match:
                    current, max_val = int(match.group(1)), int(match.group(2))
                else:
                    current = max_val
                resources.append(
                    {
                        "id": rid,
                        "name": str(spec.get("name") or rid),
                        "current": current,
                        "max": max_val,
                        "recharge": str(spec.get("recharge") or "long_rest"),
                        "source_class": cls.get("name"),
                        "display": ["combat_pane"],
                    }
                )
                known_ids.add(rid)

    return resources


def _should_keep_combat_action(entry: dict) -> bool:
    name = _casefold_name(entry.get("name"))
    if name in _RESOURCE_ONLY_NAMES or name in _PASSIVE_FEATURE_NAMES:
        return False
    return bool(entry.get("name"))


def _is_passive_feature(name: str, description: str) -> bool:
    text = f"{name} {description}"
    if _casefold_name(name) in _PASSIVE_FEATURE_NAMES:
        return True
    if _casefold_name(name) in _RESOURCE_ONLY_NAMES:
        return True
    if _casefold_name(name) in _KI_SPEND_ACTIONS:
        return False
    if _RESOURCE_POOL_HINTS.search(description) and _casefold_name(name) in {"ki", "sorcery points", "rage"}:
        return True
    if infer_primary_action_type(name, description):
        return False
    return bool(_PASSIVE_FEATURE_HINTS.search(text))


def _action_row_from_feature(feat: dict, *, source: str = "feature") -> dict | None:
    name = str(feat.get("name") or "").strip()
    if not name:
        return None
    description = str(feat.get("description") or "")
    if _is_passive_feature(name, description):
        return None

    catalog = lookup_combat_action(name)
    action_type = (
        feat.get("action_type")
        or (catalog or {}).get("action_type")
        or infer_primary_action_type(name, description)
    )
    if not action_type:
        return None

    row = {
        "id": feat.get("id") or f"{source}-{_slugify(name)}",
        "name": name,
        "action_type": action_type,
        "targeting": feat.get("targeting") or (catalog or {}).get("targeting") or "self",
        "description": description[:500],
        "source": feat.get("source") or source,
        "display": ["turn_actions"],
    }
    if catalog and catalog.get("resource_cost"):
        row["resource_cost"] = catalog["resource_cost"]
    return row


def promote_actionable_features(sheet: dict) -> list[dict]:
    existing = {_casefold_name(a.get("name")) for a in sheet.get("combat_actions") or [] if isinstance(a, dict)}
    promoted: list[dict] = list(sheet.get("combat_actions") or [])

    for feat in sheet.get("features") or []:
        if not isinstance(feat, dict):
            continue
        name_key = _casefold_name(feat.get("name"))
        if name_key in existing:
            continue
        row = _action_row_from_feature(feat, source="feature")
        if row:
            promoted.append(row)
            existing.add(name_key)

    return promoted


def merge_catalog_combat_actions(sheet: dict, classes: list[dict]) -> list[dict]:
    catalog = _load_class_catalog()
    actions: list[dict] = list(sheet.get("combat_actions") or [])
    existing = {_casefold_name(a.get("name")) for a in actions if isinstance(a, dict)}

    for cls in classes:
        class_name = cls.get("name") or ""
        level = int(cls.get("level") or 0)
        class_spec = catalog.get(class_name) or {}
        by_level = class_spec.get("actions_by_level") or {}
        for threshold, names in by_level.items():
            if level < int(threshold):
                continue
            for action_name in names:
                key = _casefold_name(action_name)
                if key in existing:
                    continue
                catalog_entry = lookup_combat_action(action_name)
                if not catalog_entry:
                    continue
                resource_cost = catalog_entry.get("resource_cost")
                if not resource_cost:
                    for spec in class_spec.get("limited_uses") or []:
                        if _casefold_name(spec.get("name")) == key:
                            resource_cost = {
                                "resource_id": str(spec.get("id") or _slugify(action_name)),
                                "amount": 1,
                            }
                            break
                actions.append(
                    {
                        "id": f"class-{_slugify(class_name)}-{_slugify(action_name)}",
                        "name": action_name,
                        "action_type": catalog_entry.get("action_type") or "action",
                        "targeting": catalog_entry.get("targeting") or "self",
                        "description": str(catalog_entry.get("description") or "")[:500],
                        "source": class_name,
                        "display": ["turn_actions"],
                        **({"resource_cost": resource_cost} if resource_cost else {}),
                    }
                )
                existing.add(key)

    return actions


def tag_features_for_display(sheet: dict, combat_actions: list[dict]) -> list[dict]:
    combat_names = {_casefold_name(a.get("name")) for a in combat_actions if isinstance(a, dict)}
    tagged = []
    for feat in sheet.get("features") or []:
        if not isinstance(feat, dict):
            continue
        entry = dict(feat)
        name = str(entry.get("name") or "")
        description = str(entry.get("description") or "")
        if _casefold_name(name) in combat_names and infer_primary_action_type(name, description):
            entry["display"] = ["features_tab", "turn_actions"]
        elif _is_passive_feature(name, description):
            entry["display"] = ["features_tab"]
        else:
            entry["display"] = ["features_tab"]
        tagged.append(entry)
    return tagged


_OPTION_ACTION_NAMES = frozenset({"wild shape", "combat wild shape"})


def attach_action_options(sheet: dict) -> dict:
    wild_shapes = sheet.get("wild_shapes") or []
    if not isinstance(wild_shapes, list) or not wild_shapes:
        return sheet

    next_sheet = dict(sheet)
    actions = []
    for entry in next_sheet.get("combat_actions") or []:
        if not isinstance(entry, dict):
            continue
        row = dict(entry)
        if _casefold_name(row.get("name")) in _OPTION_ACTION_NAMES:
            row["requires_option"] = True
            row["option_source"] = "wild_shapes"
            row["options"] = [
                {
                    "id": str(option.get("id") or _slugify(option.get("name") or "form")),
                    "name": str(option.get("name") or "Beast form"),
                    "notes": str(option.get("notes") or option.get("cr") or ""),
                }
                for option in wild_shapes
                if isinstance(option, dict) and option.get("name")
            ]
        actions.append(row)
    next_sheet["combat_actions"] = actions
    return next_sheet


def enrich_sheet_pipeline(
    sheet: dict,
    *,
    class_name: str | None = None,
    level: int | None = None,
) -> dict[str, Any]:
    """Normalize any parsed sheet into combat-ready structures for all classes."""
    next_sheet = sanitize_attacks(dict(sheet))
    classes = normalize_classes(next_sheet, class_name=class_name, level=level)
    next_sheet["classes"] = classes
    next_sheet["resources"] = enrich_resources(next_sheet, classes)
    combat_actions = merge_catalog_combat_actions(next_sheet, classes)
    promoted = promote_actionable_features({**next_sheet, "combat_actions": combat_actions})
    next_sheet["combat_actions"] = [entry for entry in promoted if _should_keep_combat_action(entry)]
    next_sheet["features"] = tag_features_for_display(next_sheet, next_sheet["combat_actions"])
    next_sheet = attach_action_options(next_sheet)
    enriched = enrich_sheet_actions(next_sheet)
    return _apply_catalog_options(enriched)


def _apply_catalog_options(sheet: dict) -> dict:
    wild_shapes = sheet.get("wild_shapes") or []
    actions = []
    for entry in sheet.get("combat_actions") or []:
        if not isinstance(entry, dict):
            continue
        row = dict(entry)
        catalog = lookup_combat_action(str(row.get("name") or ""))
        if catalog and catalog.get("requires_option") and wild_shapes:
            row["requires_option"] = True
            row["option_source"] = catalog.get("option_source") or "wild_shapes"
            if not row.get("options"):
                row["options"] = [
                    {
                        "id": str(option.get("id") or _slugify(option.get("name") or "form")),
                        "name": str(option.get("name") or "Beast form"),
                        "notes": str(option.get("notes") or option.get("cr") or ""),
                    }
                    for option in wild_shapes
                    if isinstance(option, dict) and option.get("name")
                ]
        actions.append(row)
    sheet = dict(sheet)
    sheet["combat_actions"] = actions
    return sheet
