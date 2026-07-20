"""Canonical character sheet schema (2024 rules–aligned).

Single source of truth for sheet_json shape. Used by PDF import, normalization,
enrichment, combat UI, and the future in-app character builder.
"""

from __future__ import annotations

from typing import Any, TypedDict

# --- Enumerations (shared with frontend sheetSchema.js) ---

ACTION_TYPES = frozenset({"action", "bonus_action", "reaction", "magic_action"})
RECHARGE_TYPES = frozenset({"short_rest", "long_rest", "turn", "none"})
DISPLAY_PANES = frozenset({"combat_pane", "turn_actions", "features_tab"})
OPTION_SOURCES = frozenset({"wild_shapes"})
TARGETING = frozenset(
    {
        "self",
        "one_enemy",
        "one_ally",
        "one_creature",
        "one_ally_or_self",
    }
)

ABILITY_KEYS = ("str", "dex", "con", "int", "wis", "cha")

# 2024 canonical resource ids; aliases cover legacy imports (e.g. ki → focus-points).
RESOURCE_ID_ALIASES: dict[str, str] = {
    "ki": "focus-points",
    "ki-points": "focus-points",
    "ki-point": "focus-points",
    "focus": "focus-points",
    "focus-point": "focus-points",
    "wildshape": "wild-shape",
    "wild_shape": "wild-shape",
    "bardic-inspiration-die": "bardic-inspiration",
    "channel-divinity-uses": "channel-divinity",
    "sorcery-point": "sorcery-points",
    "spell-slot-1": "spell-slot-1",
}

CANONICAL_RESOURCE_IDS = frozenset(
    {
        "focus-points",
        "wild-shape",
        "rage",
        "bardic-inspiration",
        "channel-divinity",
        "lay-on-hands",
        "sorcery-points",
        "action-surge",
        "second-wind",
        "superiority-dice",
        "pact-slots",
    }
)


def canonical_resource_id(value: str | None) -> str:
    """Normalize a resource id slug to the 2024 canonical form when known."""
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return RESOURCE_ID_ALIASES.get(slug, slug)


# --- Typed structures (combat-centric subset) ---


class ResourceCost(TypedDict, total=False):
    resource_id: str
    amount: int


class ActionOption(TypedDict, total=False):
    id: str
    name: str
    notes: str


class Resource(TypedDict, total=False):
    """Spendable pool shown on the Combat pane."""

    id: str
    name: str
    current: int | None
    max: int | None
    recharge: str
    source_class: str | None
    display: list[str]


class CombatAction(TypedDict, total=False):
    """Turn-menu choice: class feature, spell, or sheet attack routed to combat."""

    id: str
    name: str
    action_type: str
    targeting: str
    description: str
    source: str | None
    display: list[str]
    resource_cost: ResourceCost
    requires_option: bool
    option_source: str
    options: list[ActionOption]
    attack_bonus: int | None
    damage_dice: str | None
    category: str
    min_level: int


class Feature(TypedDict, total=False):
    """Passive or narrative ability — Features tab; actionable ones also promote to combat_actions."""

    id: str
    name: str
    description: str
    source: str | None
    display: list[str]
    passive: bool
    action_type: str | None


class WildShapeForm(TypedDict, total=False):
    """Beast form option for Wild Shape and similar transform actions."""

    id: str
    name: str
    cr: str | None
    notes: str


class AttackProfile(TypedDict, total=False):
    """Weapon or unarmed strike used by Attack action and delegated features (e.g. Flurry)."""

    id: str
    name: str
    to_hit: int | None
    damage: str
    action_type: str
    targeting: str
    description: str


class ClassEntry(TypedDict, total=False):
    name: str
    level: int
    subclass: str | None


class CharacterSheet(TypedDict, total=False):
    """Normalized sheet_json root (stored on Character.sheet_json)."""

    abilities: dict[str, int | None]
    proficiency_bonus: int | None
    speed: int | None
    initiative_bonus: int | None
    passive_perception: int | None
    hit_dice: str | None
    saving_throws: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    proficiencies: dict[str, list[str]]
    inventory: list[dict[str, Any]]
    equipped_overrides: dict[str, bool]
    features: list[Feature]
    attacks: list[AttackProfile]
    spells: list[dict[str, Any]]
    combat_actions: list[CombatAction]
    resources: list[Resource]
    classes: list[ClassEntry]
    wild_shapes: list[WildShapeForm]
    ac_bonuses: list[dict[str, Any]]
    ac_breakdown: list[dict[str, Any]]
    authoritative_ac: int | None
    damage_resistances: list[str]
    damage_immunities: list[str]
    damage_vulnerabilities: list[str]
    spellcasting_ability: str | None
    spell_save_dc: int | None
    spell_attack_bonus: int | None
    conditions: list[str]
    notes: str


# --- Routing rules (documented contract) ---
#
# | Data            | Primary UI        | Enrichment                         |
# |-----------------|-------------------|------------------------------------|
# | resources       | Combat pane       | merge from sheet + class catalog   |
# | combat_actions  | Turn actions      | merge catalog + promote features   |
# | features        | Features tab      | passive unless also in combat_actions |
# | wild_shapes     | Turn submenu      | attach to requires_option actions  |
# | attacks         | Attack delegation | used by Flurry, Extra Attack, etc. |
# | passives        | Features tab only | Extra Attack, Stunning Strike rider |


def normalize_resource_row(entry: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    name = str(entry.get("name") or "").strip()
    if not name:
        return None
    rid = canonical_resource_id(str(entry.get("id") or name))
    recharge = str(entry.get("recharge") or "long_rest")
    if recharge not in RECHARGE_TYPES:
        recharge = "long_rest"
    display = entry.get("display")
    if not isinstance(display, list):
        display = ["combat_pane"]
    return {
        "id": rid,
        "name": name,
        "current": entry.get("current"),
        "max": entry.get("max"),
        "recharge": recharge,
        "source_class": entry.get("source_class"),
        "display": [pane for pane in display if pane in DISPLAY_PANES] or ["combat_pane"],
    }


def normalize_combat_action_row(entry: dict[str, Any], *, index: int) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    name = str(entry.get("name") or "").strip()
    if not name:
        return None
    action_type = str(entry.get("action_type") or "action")
    if action_type not in ACTION_TYPES:
        action_type = "action"
    targeting = str(entry.get("targeting") or "self")
    if targeting not in TARGETING:
        targeting = "self"
    row: dict[str, Any] = {
        "id": str(entry.get("id") or f"action-{index}"),
        "name": name,
        "action_type": action_type,
        "targeting": targeting,
        "description": str(entry.get("description") or ""),
        "source": entry.get("source"),
        "display": entry.get("display") if isinstance(entry.get("display"), list) else ["turn_actions"],
    }
    resource_cost = entry.get("resource_cost")
    if isinstance(resource_cost, dict) and resource_cost.get("resource_id"):
        row["resource_cost"] = {
            "resource_id": canonical_resource_id(str(resource_cost["resource_id"])),
            "amount": int(resource_cost.get("amount") or 1),
        }
    if entry.get("requires_option"):
        row["requires_option"] = True
        option_source = str(entry.get("option_source") or "wild_shapes")
        if option_source in OPTION_SOURCES:
            row["option_source"] = option_source
    if isinstance(entry.get("options"), list):
        row["options"] = entry["options"]
    for optional in ("attack_bonus", "damage_dice", "category", "min_level"):
        if entry.get(optional) is not None:
            row[optional] = entry[optional]
    return row


def normalize_feature_row(entry: dict[str, Any], *, index: int) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    name = str(entry.get("name") or "").strip()
    if not name:
        return None
    row: dict[str, Any] = {
        "id": str(entry.get("id") or f"feature-{index}"),
        "name": name,
        "description": str(entry.get("description") or ""),
        "source": entry.get("source"),
        "display": entry.get("display") if isinstance(entry.get("display"), list) else ["features_tab"],
    }
    if entry.get("passive") is not None:
        row["passive"] = bool(entry["passive"])
    if entry.get("action_type") in ACTION_TYPES:
        row["action_type"] = entry["action_type"]
    return row


def normalize_wild_shape_row(entry: dict[str, Any], *, index: int) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None
    name = str(entry.get("name") or "").strip()
    if not name:
        return None
    return {
        "id": str(entry.get("id") or f"wild-shape-{index}"),
        "name": name,
        "cr": entry.get("cr"),
        "notes": str(entry.get("notes") or ""),
    }
