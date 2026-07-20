"""SRD 5.2.1 combat action and spell rules — targeting, action type, and catalog lookup."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_SRD_DIR = _DATA_DIR / "srd-5.2.1"
_BR2024_COMBAT = _DATA_DIR / "combat_catalog_2024.json"

_SELF_HINTS = re.compile(
    r"self only|\(self only\)|on yourself|you regain|regain hit points|"
    r"heal yourself|restore hit points to yourself|you gain (?!.*attack)|"
    r"protect yourself|teleport yourself",
    re.IGNORECASE,
)
_ALLY_HINTS = re.compile(r"one ally|friendly creature|ally or yourself", re.IGNORECASE)
_AREA_HINTS = re.compile(
    r"each creature|all creatures|creatures within|in a \d+-foot|radius|cone|line|cube|sphere",
    re.IGNORECASE,
)
_ATTACK_HINTS = re.compile(
    r"one target|melee weapon attack|ranged weapon attack|spell attack|make an attack",
    re.IGNORECASE,
)
_BONUS_ACTION_HINT = re.compile(r"bonus action", re.IGNORECASE)
_REACTION_HINT = re.compile(r"reaction", re.IGNORECASE)
_ACTION_HINT = re.compile(r"\baction\b", re.IGNORECASE)
_HEALING_DICE_RE = re.compile(
    r"(?:regain|regains)(?:\s+a\s+number\s+of)?\s+Hit Points equal to (\d+d\d+(?:\s*(?:\+|plus)\s*[^.\n]+)?)",
    re.IGNORECASE,
)
_PASSIVE_TURN_ACTION_NAMES = frozenset(
    {
        "extra attack",
        "martial arts",
        "unarmored defense",
        "unarmored movement",
        "ki-empowered strikes",
        "open hand technique",
        "slow fall",
        "deflect attacks",
        "deflect missiles",  # 2014 name kept as alias
        "stillness of mind",
        "purity of body",
    }
)


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _merge_combat_catalog_entries(by_name: dict[str, dict], payload: dict) -> None:
    for bucket in ("standard_actions", "class_features"):
        for entry in payload.get(bucket) or []:
            if not isinstance(entry, dict) or not entry.get("name"):
                continue
            key = str(entry["name"]).casefold()
            previous = by_name.get(key)
            if previous:
                merged = dict(previous)
                merged.update(entry)
                for field in ("healing_dice", "resource_cost", "requires_option", "option_source"):
                    if not merged.get(field) and previous.get(field):
                        merged[field] = previous[field]
                if not merged.get("healing_dice"):
                    healing = parse_healing_dice(
                        str(merged.get("description") or previous.get("description") or "")
                    )
                    if healing:
                        merged["healing_dice"] = healing
                by_name[key] = merged
            else:
                row = dict(entry)
                if not row.get("healing_dice"):
                    healing = parse_healing_dice(str(row.get("description") or ""))
                    if healing:
                        row["healing_dice"] = healing
                by_name[key] = row


@lru_cache(maxsize=1)
def _load_combat_catalog() -> dict[str, dict]:
    by_name: dict[str, dict] = {}

    srd_path = _SRD_DIR / "combat_actions.json"
    if srd_path.is_file():
        with srd_path.open(encoding="utf-8") as handle:
            _merge_combat_catalog_entries(by_name, json.load(handle))

    if _BR2024_COMBAT.is_file():
        with _BR2024_COMBAT.open(encoding="utf-8") as handle:
            _merge_combat_catalog_entries(by_name, json.load(handle))

    return by_name


@lru_cache(maxsize=1)
def _load_spell_catalog() -> dict[str, dict]:
    from app.services.srd_catalog import list_entries

    by_name: dict[str, dict] = {}
    for entry in list_entries("spells"):
        if not isinstance(entry, dict) or not entry.get("name"):
            continue
        by_name[str(entry["name"]).casefold()] = entry
        slug = entry.get("slug")
        if slug:
            by_name[str(slug).casefold()] = entry
    return by_name


def lookup_combat_action(name: str) -> dict | None:
    normalized = str(name or "").strip().casefold()
    if not normalized:
        return None
    return _load_combat_catalog().get(normalized)


def lookup_spell(name: str) -> dict | None:
    normalized = str(name or "").strip().casefold()
    if not normalized:
        return None
    catalog = _load_spell_catalog()
    direct = catalog.get(normalized)
    if direct is not None:
        return direct
    base = re.sub(r"\s*\(l\d+\)\s*$", "", normalized, flags=re.IGNORECASE).strip()
    return catalog.get(base)


def infer_action_type(name: str = "", description: str = "") -> str | None:
    from app.services.action_type_inference import infer_primary_action_type

    return infer_primary_action_type(name, description)


def infer_targeting(
    name: str = "",
    description: str = "",
    *,
    category: str = "action",
    range_text: str = "",
) -> str:
    valid = {
        "self",
        "one_enemy",
        "one_ally",
        "one_creature",
        "one_ally_or_self",
    }
    text = f"{name} {description} {range_text}".strip()
    lowered = text.lower()

    if range_text.casefold() == "self":
        return "self"
    if range_text.casefold() == "touch":
        return "one_ally_or_self"

    if _SELF_HINTS.search(text) and not _AREA_HINTS.search(text):
        return "self"
    if "one ally or yourself" in lowered or "ally or yourself" in lowered:
        return "one_ally_or_self"
    if _ALLY_HINTS.search(text):
        return "one_ally"
    if _AREA_HINTS.search(text):
        return "one_creature"
    if _ATTACK_HINTS.search(text):
        return "one_enemy"
    if re.search(r"\+\d+\s+to\s+hit|to hit", text, re.IGNORECASE):
        return "one_enemy"

    if category in {"feature", "class_feature", "combat", "standard"}:
        return "self"
    if category == "spell":
        if "creature you can see" in lowered:
            return "one_creature"
        return "one_enemy"
    if category in {"weapon", "attack"}:
        return "one_enemy"
    return "self"


def parse_healing_dice(description: str) -> str | None:
    text = description or ""
    match = _HEALING_DICE_RE.search(text)
    if not match:
        return None
    expr = match.group(1).lower()
    expr = re.sub(r"\s+plus\s+your\s+(\w+\s+)?level", r"+your\1level", expr, flags=re.IGNORECASE)
    return re.sub(r"\s+", "", expr)


def _is_passive_turn_action(name: str) -> bool:
    return str(name or "").strip().casefold() in _PASSIVE_TURN_ACTION_NAMES


def enrich_action_entry(
    entry: dict,
    *,
    category: str = "action",
) -> dict:
    """Apply SRD catalog + inference to a sheet combat action row."""
    if not isinstance(entry, dict):
        return entry

    name = str(entry.get("name") or "").strip()
    description = str(entry.get("description") or entry.get("detail") or "")
    range_text = str(entry.get("range") or "")

    if category == "feature" and _is_passive_turn_action(name):
        return dict(entry)

    from app.services.action_type_inference import override_action_type

    catalog = lookup_combat_action(name) or lookup_spell(name)
    enriched = dict(entry)
    type_override = override_action_type(name)

    inferred_targeting = infer_targeting(
        name,
        description,
        category=category,
        range_text=range_text,
    )

    if type_override:
        enriched["action_type"] = type_override
    elif catalog:
        if catalog.get("action_type"):
            enriched["action_type"] = catalog["action_type"]
        if catalog.get("targeting"):
            enriched["targeting"] = catalog["targeting"]
        if catalog.get("healing_dice") and not enriched.get("healing_dice"):
            enriched["healing_dice"] = catalog["healing_dice"]
        if catalog.get("resource_cost") and not enriched.get("resource_cost"):
            enriched["resource_cost"] = catalog["resource_cost"]
        if catalog.get("requires_option"):
            enriched["requires_option"] = True
        if catalog.get("option_source"):
            enriched["option_source"] = catalog["option_source"]
        if catalog.get("description") and not description:
            enriched["description"] = catalog["description"]
    else:
        if not enriched.get("action_type"):
            inferred = infer_action_type(name, description)
            if inferred:
                enriched["action_type"] = inferred

    current_targeting = str(enriched.get("targeting") or "").strip()
    if catalog and catalog.get("targeting"):
        enriched["targeting"] = catalog["targeting"]
    elif category in {"feature", "class_feature", "combat", "spell"} and (
        not current_targeting or current_targeting == "one_enemy"
    ):
        enriched["targeting"] = inferred_targeting
    elif not current_targeting:
        enriched["targeting"] = inferred_targeting

    if not enriched.get("healing_dice"):
        healing = parse_healing_dice(description)
        if healing:
            enriched["healing_dice"] = healing

    return enriched


def enrich_sheet_actions(sheet: dict) -> dict:
    """Normalize combat-relevant sheet rows using SRD rules."""
    if not isinstance(sheet, dict):
        return sheet

    next_sheet = dict(sheet)

    if isinstance(next_sheet.get("attacks"), list):
        next_sheet["attacks"] = [
            enrich_action_entry(entry, category="attack")
            for entry in next_sheet["attacks"]
            if isinstance(entry, dict)
        ]

    if isinstance(next_sheet.get("spells"), list):
        next_sheet["spells"] = [
            enrich_action_entry(entry, category="spell")
            for entry in next_sheet["spells"]
            if isinstance(entry, dict)
        ]

    if isinstance(next_sheet.get("combat_actions"), list):
        next_sheet["combat_actions"] = [
            enrich_action_entry(entry, category="combat")
            for entry in next_sheet["combat_actions"]
            if isinstance(entry, dict)
        ]

    combat_names = {
        str(entry.get("name") or "").strip().casefold()
        for entry in next_sheet.get("combat_actions") or []
        if isinstance(entry, dict) and entry.get("name")
    }

    if isinstance(next_sheet.get("features"), list):
        features = []
        for entry in next_sheet["features"]:
            if not isinstance(entry, dict):
                continue
            enriched = enrich_action_entry(entry, category="feature")
            name_key = str(enriched.get("name") or "").strip().casefold()
            if name_key in combat_names or _is_passive_turn_action(enriched.get("name")):
                enriched = dict(enriched)
                enriched.pop("action_type", None)
                enriched.pop("targeting", None)
            features.append(enriched)
        next_sheet["features"] = features

    return next_sheet


_VALID_TARGETING = frozenset(
    {"self", "one_enemy", "one_ally", "one_creature", "one_ally_or_self"}
)


def _category_from_action_id(action_id: str) -> str:
    if action_id.startswith("weapon-"):
        return "weapon"
    if action_id.startswith(("attack-", "action-", "bonus-", "reaction-", "legendary-", "npc-")):
        return "attack"
    if action_id.startswith("spell-"):
        return "spell"
    if action_id.startswith("std-"):
        return "standard"
    if action_id.startswith(("equip-", "unequip-", "equip-item", "unequip-item")):
        return "equipment"
    if action_id.startswith(("feat-", "feature-", "trait-")):
        return "feature"
    return "combat"


def resolve_rules_for_use(
    *,
    action_id: str,
    action_name: str,
    action_type: str,
    targeting: str,
    detail: str | None = None,
) -> tuple[str, str, dict | None]:
    """Reconcile client-submitted action metadata with SRD catalog."""
    category = _category_from_action_id(action_id)
    if category in {"weapon", "attack"}:
        catalog = lookup_combat_action(action_name)
    elif category == "spell":
        catalog = lookup_spell(action_name)
    else:
        catalog = lookup_combat_action(action_name) or lookup_spell(action_name)

    resolved_type = action_type
    resolved_targeting = targeting

    if catalog:
        if catalog.get("action_type"):
            resolved_type = str(catalog["action_type"])
        if catalog.get("targeting"):
            resolved_targeting = str(catalog["targeting"])
    elif targeting not in _VALID_TARGETING:
        resolved_targeting = infer_targeting(
            action_name,
            detail or "",
            category=category,
        )
    elif targeting == "one_enemy" and category in {"feature", "combat", "standard"}:
        inferred_targeting = infer_targeting(
            action_name,
            detail or "",
            category=category,
        )
        if inferred_targeting != "one_enemy":
            resolved_targeting = inferred_targeting
    elif targeting == "one_enemy" and category in {"weapon", "attack"}:
        resolved_targeting = "one_enemy"

    return resolved_type, resolved_targeting, catalog
