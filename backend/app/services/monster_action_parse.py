"""Parse 2024 monster action prose into attack bonuses, damage, and Multiattack plans.

Private MM overlays store actions as name + description (Attack Roll / Hit lines)
rather than SRD-structured attack_bonus + damage[]. Combat resolution and catalog
conversion both use these helpers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_WORD_COUNTS: dict[str, int] = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}

# 2024: "Melee Attack Roll: +5," / legacy: "+5 to hit"
_ATTACK_BONUS_RE = re.compile(
    r"(?:(?:melee|ranged|melee or ranged)\s+)?attack\s+roll:\s*\+(\d+)"
    r"|\+(\d+)\s+to\s+hit",
    re.IGNORECASE,
)

# Prefer parenthetical dice on Hit lines: "Hit: 5 (1d4 + 3) Slashing"
_HIT_DICE_RE = re.compile(
    r"hit:\s*\d+\s*\(\s*(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)",
    re.IGNORECASE,
)
_FALLBACK_DICE_RE = re.compile(r"(\d+d\d+(?:\s*[+-]\s*\d+)?)", re.IGNORECASE)

# "two Bite attacks" / "3 Claw attacks"
_NAMED_ATTACKS_RE = re.compile(
    r"(?P<count>\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
    r"\s+(?P<name>[A-Za-z][A-Za-z0-9'’\s/-]*?)\s+attacks?\b",
    re.IGNORECASE,
)

# "makes two attacks, using Talons and Storm Spear in any combination"
_ANY_COMBINATION_RE = re.compile(
    r"makes\s+(?P<count>\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
    r"\s+attacks?\b.*?(?:using|with)\s+(?P<names>.+?)(?:\s+in\s+any\s+combination)?[.]",
    re.IGNORECASE | re.DOTALL,
)

# "makes two attacks" without naming (fallback count)
_MAKES_N_ATTACKS_RE = re.compile(
    r"makes\s+(?P<count>\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+attacks?\b",
    re.IGNORECASE,
)


def _parse_count(raw: str) -> int:
    text = str(raw or "").strip().casefold()
    if text.isdigit():
        return max(1, int(text))
    return max(1, _WORD_COUNTS.get(text, 1))


def normalize_action_key(name: str) -> str:
    return re.sub(r"['’]", "'", str(name or "").strip()).casefold()


@dataclass
class ParsedAttackStats:
    attack_bonus: int | None = None
    damage_dice: str | None = None


def parse_attack_stats_from_text(text: str | None) -> ParsedAttackStats:
    """Extract attack bonus and primary Hit damage dice from action prose."""
    if not text:
        return ParsedAttackStats()
    attack_bonus = None
    match = _ATTACK_BONUS_RE.search(text)
    if match:
        attack_bonus = int(match.group(1) or match.group(2))

    damage_dice = None
    hit = _HIT_DICE_RE.search(text)
    if hit:
        damage_dice = re.sub(r"\s+", "", hit.group(1))
    else:
        # Avoid grabbing recharge dice like (5–6); prefer first XdY[+N] after "Hit"
        hit_idx = text.casefold().find("hit:")
        search_from = text[hit_idx:] if hit_idx >= 0 else text
        fallback = _FALLBACK_DICE_RE.search(search_from)
        if fallback:
            damage_dice = re.sub(r"\s+", "", fallback.group(1))

    return ParsedAttackStats(attack_bonus=attack_bonus, damage_dice=damage_dice)


def enrich_action_row(row: dict) -> dict:
    """Return a shallow copy with attack_bonus / damage filled from prose when missing."""
    if not isinstance(row, dict):
        return row
    next_row = dict(row)
    description = str(next_row.get("description") or next_row.get("desc") or "")
    parsed = parse_attack_stats_from_text(description)

    if next_row.get("attack_bonus") is None and parsed.attack_bonus is not None:
        next_row["attack_bonus"] = parsed.attack_bonus

    damage_rows = next_row.get("damage")
    has_dice = (
        isinstance(damage_rows, list)
        and damage_rows
        and isinstance(damage_rows[0], dict)
        and damage_rows[0].get("dice")
    )
    if not has_dice and parsed.damage_dice:
        next_row["damage"] = [{"dice": parsed.damage_dice, "type": None}]

    return next_row


def parse_multiattack_plan(description: str | None) -> list[tuple[str, int]]:
    """Return ordered (attack_name, count) pairs from Multiattack text.

    Supports digit and word counts, named repeats, and “any combination” lists.
    """
    text = str(description or "").strip()
    if not text:
        return []

    # Prefer explicit "N Name attacks"
    named: list[tuple[str, int]] = []
    for match in _NAMED_ATTACKS_RE.finditer(text):
        name = match.group("name").strip(" .,")
        # Skip generic filler captured as a name
        if name.casefold() in {"melee", "ranged", "weapon", "spell"}:
            continue
        named.append((name, _parse_count(match.group("count"))))
    if named:
        return named

    combo = _ANY_COMBINATION_RE.search(text)
    if combo:
        count = _parse_count(combo.group("count"))
        names_blob = combo.group("names")
        names_blob = re.sub(r"\s+in\s+any\s+combination.*$", "", names_blob, flags=re.I)
        parts = re.split(r"\s*(?:,|\band\b|\bor\b)\s*", names_blob, flags=re.I)
        names = [p.strip(" .,") for p in parts if p.strip(" .,")]
        if names:
            # Round-robin assignment across listed attacks.
            plan: list[tuple[str, int]] = []
            tallies = {name: 0 for name in names}
            for index in range(count):
                tallies[names[index % len(names)]] += 1
            for name in names:
                if tallies[name]:
                    plan.append((name, tallies[name]))
            return plan

    makes = _MAKES_N_ATTACKS_RE.search(text)
    if makes:
        return [("*", _parse_count(makes.group("count")))]

    return []


def deep_merge_monster(base: dict, overlay: dict) -> dict:
    """Merge private overlay onto SRD monster without wiping structured attacks."""
    merged = dict(base)
    for key, value in overlay.items():
        if key == "stat_block_json" and isinstance(value, dict):
            base_sb = base.get("stat_block_json") if isinstance(base.get("stat_block_json"), dict) else {}
            overlay_sb = value
            sb = dict(base_sb)
            for sb_key, sb_val in overlay_sb.items():
                if sb_key in {"actions", "bonus_actions", "reactions", "legendary_actions", "traits"}:
                    # Prefer overlay lists when present and non-empty; else keep base.
                    if isinstance(sb_val, list) and sb_val:
                        sb[sb_key] = sb_val
                    elif sb_key not in sb:
                        sb[sb_key] = sb_val
                elif sb_val is not None:
                    sb[sb_key] = sb_val
            # If overlay actions lack structured attack fields, enrich from prose
            # and, when names match, carry SRD attack_bonus/damage forward.
            sb = _merge_action_buckets(base_sb, sb)
            merged["stat_block_json"] = sb
        elif value is not None:
            merged[key] = value
    return merged


def _index_actions_by_name(rows: list | None) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in rows or []:
        if isinstance(row, dict) and row.get("name"):
            out[normalize_action_key(str(row["name"]))] = row
    return out


def _merge_action_buckets(base_sb: dict, overlay_sb: dict) -> dict:
    result = dict(overlay_sb)
    for bucket in ("actions", "bonus_actions", "reactions", "legendary_actions"):
        overlay_rows = overlay_sb.get(bucket)
        if not isinstance(overlay_rows, list) or not overlay_rows:
            continue
        base_index = _index_actions_by_name(base_sb.get(bucket) if isinstance(base_sb, dict) else None)
        merged_rows: list[dict] = []
        for row in overlay_rows:
            if not isinstance(row, dict):
                continue
            enriched = enrich_action_row(row)
            key = normalize_action_key(str(enriched.get("name") or ""))
            base_row = base_index.get(key)
            if base_row:
                if enriched.get("attack_bonus") is None and base_row.get("attack_bonus") is not None:
                    enriched["attack_bonus"] = base_row.get("attack_bonus")
                overlay_damage = enriched.get("damage")
                base_damage = base_row.get("damage")
                if (not overlay_damage) and base_damage:
                    enriched["damage"] = base_damage
            merged_rows.append(enriched)
        result[bucket] = merged_rows
    return result
