"""SRD 5.2.1 (2024 rules) monster lookup for initiative tracker combat actions.

Private overlay at data/private-2024/monsters.json overrides SRD entries by name
when present (gitignored; local extracts only).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

from app.api.schemas import CombatActionEntry, EncounterCombatant

_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "srd-5.2.1" / "monsters.json"
_DEFAULT_PRIVATE_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "private-2024" / "monsters.json"
)


def _private_monsters_path() -> Path:
    import os

    override = os.environ.get("PRIVATE_2024_DIR", "").strip()
    if override:
        return Path(override) / "monsters.json"
    return _DEFAULT_PRIVATE_PATH


_BONUS_ACTION_HINT = re.compile(r"bonus action", re.IGNORECASE)
_NUMBER_SUFFIX = re.compile(r"^(?P<base>.+?)\s+\d+$")


def _normalize_lookup_name(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(name or "").strip())
    match = _NUMBER_SUFFIX.match(cleaned)
    if match:
        return match.group("base").strip()
    return cleaned


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _cr_numeric(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("½", "1/2").replace("¼", "1/4").replace("⅛", "1/8")
    if "/" in text:
        num, den = text.split("/", 1)
        try:
            return float(num) / float(den)
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None


def proficiency_bonus_for_cr(cr) -> int:
    """2024 Monster Manual proficiency bonus by Challenge Rating."""
    numeric = _cr_numeric(cr)
    if numeric is None:
        return 2
    if numeric <= 4:
        return 2
    if numeric <= 8:
        return 3
    if numeric <= 12:
        return 4
    if numeric <= 16:
        return 5
    if numeric <= 20:
        return 6
    if numeric <= 24:
        return 7
    if numeric <= 28:
        return 8
    return 9


def _dexterity_modifier(monster: dict) -> int | None:
    scores = (monster.get("stat_block_json") or {}).get("ability_scores") or {}
    dex = scores.get("dex")
    if dex is None:
        return None
    return (int(dex) - 10) // 2


def effective_initiative_modifier(monster: dict) -> int:
    """2024 initiative: prefer printed Initiative line; else Dex mod + PB."""
    if monster.get("initiative_printed") and monster.get("initiative_modifier") is not None:
        return int(monster["initiative_modifier"])
    dex = _dexterity_modifier(monster)
    if dex is not None:
        pb = monster.get("proficiency_bonus")
        if pb is None:
            pb = proficiency_bonus_for_cr(monster.get("cr") or monster.get("cr_numeric"))
        return int(dex) + int(pb)
    if monster.get("initiative_modifier") is not None:
        return int(monster["initiative_modifier"])
    return 0


@lru_cache(maxsize=1)
def _load_catalog() -> tuple[dict[str, dict], dict[str, dict]]:
    by_name: dict[str, dict] = {}
    by_slug: dict[str, dict] = {}

    def _ingest(payload: dict) -> None:
        for monster in payload.get("monsters") or []:
            if not isinstance(monster, dict) or not monster.get("name"):
                continue
            key = monster["name"].casefold()
            existing = by_name.get(key) or {}
            merged = {**existing, **monster}
            by_name[key] = merged
            monster_id = str(merged.get("id") or "")
            if monster_id.startswith("srd:"):
                by_slug[monster_id[4:]] = merged
            if monster_id.startswith("private:"):
                by_slug[monster_id[8:]] = merged
            by_slug[_slugify(merged["name"])] = merged

    if _DATA_PATH.is_file():
        with _DATA_PATH.open(encoding="utf-8") as handle:
            _ingest(json.load(handle))
    private_path = _private_monsters_path()
    if private_path.is_file():
        with private_path.open(encoding="utf-8") as handle:
            _ingest(json.load(handle))

    return by_name, by_slug


def lookup_monster(name: str) -> dict | None:
    """Find a monster by combatant label, display name, or slug."""
    normalized = _normalize_lookup_name(name)
    if not normalized:
        return None

    by_name, by_slug = _load_catalog()
    direct = by_name.get(normalized.casefold())
    if direct is not None:
        return direct

    slug = _slugify(normalized)
    return by_slug.get(slug)


def search_monsters(query: str, *, limit: int = 12) -> list[dict]:
    needle = str(query or "").strip().casefold()
    if not needle:
        return []

    by_name, _ = _load_catalog()
    matches = [
        monster
        for key, monster in sorted(by_name.items())
        if needle in key or needle in _slugify(monster.get("name", ""))
    ]
    return matches[: max(1, min(limit, 50))]


def _infer_targeting(description: str, name: str) -> str:
    from app.services.action_rules import infer_targeting

    return infer_targeting(name, description, category="attack")


def _format_damage(action: dict) -> str | None:
    damage_rows = action.get("damage") or []
    if not isinstance(damage_rows, list) or not damage_rows:
        return None
    parts = []
    for row in damage_rows:
        if not isinstance(row, dict):
            continue
        dice = row.get("dice")
        dtype = row.get("type")
        if dice and dtype:
            parts.append(f"{dice} {dtype}")
        elif dice:
            parts.append(str(dice))
    return ", ".join(parts) if parts else None


def _action_entries(
    rows: list | None,
    *,
    action_type: str,
    prefix: str,
) -> list[CombatActionEntry]:
    entries: list[CombatActionEntry] = []
    for index, row in enumerate(rows or []):
        if not isinstance(row, dict) or not row.get("name"):
            continue
        name = str(row["name"]).strip()
        description = str(row.get("description") or row.get("desc") or "").strip()
        attack_bonus = row.get("attack_bonus")
        damage = _format_damage(row)
        detail_parts = []
        if attack_bonus is not None:
            detail_parts.append(f"+{attack_bonus} to hit")
        if damage:
            detail_parts.append(damage)
        if description and not detail_parts:
            detail_parts.append(description)
        elif description and len(description) <= 160:
            detail_parts.append(description)

        damage_dice = None
        damage_rows = row.get("damage") or []
        if isinstance(damage_rows, list) and damage_rows:
            first = damage_rows[0]
            if isinstance(first, dict) and first.get("dice"):
                damage_dice = str(first["dice"]).replace(" ", "")

        entries.append(
            CombatActionEntry(
                id=f"{prefix}-{index}-{_slugify(name)}",
                name=name,
                action_type=action_type,
                targeting=_infer_targeting(description, name),
                description=description or None,
                attack_bonus=int(attack_bonus) if attack_bonus is not None else None,
                damage_dice=damage_dice,
            )
        )
    return entries


def _trait_bonus_actions(traits: list | None) -> list[CombatActionEntry]:
    entries: list[CombatActionEntry] = []
    for index, trait in enumerate(traits or []):
        if not isinstance(trait, dict) or not trait.get("name"):
            continue
        description = str(trait.get("description") or trait.get("desc") or "")
        if not _BONUS_ACTION_HINT.search(description):
            continue
        name = str(trait["name"]).strip()
        entries.append(
            CombatActionEntry(
                id=f"trait-bonus-{index}-{_slugify(name)}",
                name=name,
                action_type="bonus_action",
                targeting="self",
                description=description or None,
            )
        )
    return entries


def monster_to_combat_actions(monster: dict) -> list[CombatActionEntry]:
    stat_block = monster.get("stat_block_json") or {}
    if not isinstance(stat_block, dict):
        return []

    entries: list[CombatActionEntry] = []
    entries.extend(_action_entries(stat_block.get("actions"), action_type="action", prefix="action"))
    entries.extend(
        _action_entries(stat_block.get("bonus_actions"), action_type="bonus_action", prefix="bonus")
    )
    entries.extend(
        _action_entries(stat_block.get("reactions"), action_type="reaction", prefix="reaction")
    )
    entries.extend(_trait_bonus_actions(stat_block.get("traits")))

    legendary = _action_entries(
        stat_block.get("legendary_actions"),
        action_type="action",
        prefix="legendary",
    )
    for entry in legendary:
        name = entry.name
        if not name.lower().startswith("legendary"):
            name = f"{name} (Legendary)"
        entries.append(entry.model_copy(update={"name": name}))

    return entries


def monster_walk_speed(monster: dict) -> int | None:
    speed = (monster.get("stat_block_json") or {}).get("speed")
    if isinstance(speed, dict):
        walk = speed.get("walk")
        if walk is not None:
            return int(walk)
    if isinstance(speed, (int, float)):
        return int(speed)
    return None


def monster_default_initiative(monster: dict) -> int:
    return 10 + effective_initiative_modifier(monster)


def apply_monster_catalog_to_combatant(combatant: EncounterCombatant) -> EncounterCombatant:
    """Fill NPC stats and combat actions from the SRD when missing."""
    if combatant.is_pc or combatant.character_id:
        return combatant

    lookup_name = combatant.srd_name or combatant.name
    monster = lookup_monster(lookup_name)
    if monster is None:
        return combatant

    updated = combatant.model_copy(deep=True)
    if not updated.srd_name and monster.get("name"):
        updated.srd_name = str(monster["name"])
    srd_actions = monster_to_combat_actions(monster)
    if srd_actions:
        updated.combat_actions = srd_actions

    if updated.hp is None and monster.get("hp_max") is not None:
        updated.hp = int(monster["hp_max"])
    if updated.max_hp is None and monster.get("hp_max") is not None:
        updated.max_hp = int(monster["hp_max"])
    if updated.ac is None and monster.get("armor_class") is not None:
        updated.ac = int(monster["armor_class"])
    if updated.initiative == 0 and not updated.hidden_from_players:
        updated.initiative = monster_default_initiative(monster)
    if updated.speed is None:
        walk = monster_walk_speed(monster)
        if walk is not None:
            updated.speed = walk

    return updated
