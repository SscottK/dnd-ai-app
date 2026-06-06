"""Resolve attack rolls, damage, and HP changes for combat actions."""

from __future__ import annotations

import re

from dataclasses import dataclass

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.db.models import Character
from app.services.character_sheet import parse_sheet_json
from app.services.combat_dice import format_roll_detail, roll_d20, roll_dice_expression
from app.services.combat_log import append_log
from app.services.monster_catalog import lookup_monster
from app.services.weapon_attacks import (
    clean_action_label,
    extract_damage_dice,
    find_equipped_weapon,
    weapon_profile_from_item,
)

_ATTACK_ID_PREFIXES = ("weapon-", "attack-", "action-", "std-attack", "npc-attack", "spell-")
_TO_HIT_RE = re.compile(r"\+(\d+)\s+to\s+hit", re.IGNORECASE)
_DAMAGE_DICE_RE = re.compile(r"(\d+d\d+(?:[+-]\d+)?)", re.IGNORECASE)


@dataclass
class AttackProfile:
    attack_bonus: int | None = None
    damage_dice: str | None = None


def _parse_detail_stats(detail: str | None) -> AttackProfile:
    if not detail:
        return AttackProfile()
    attack_bonus = None
    damage_dice = None
    hit_match = _TO_HIT_RE.search(detail)
    if hit_match:
        attack_bonus = int(hit_match.group(1))
    dice_match = _DAMAGE_DICE_RE.search(detail)
    if dice_match:
        damage_dice = dice_match.group(1).replace(" ", "")
    return AttackProfile(attack_bonus=attack_bonus, damage_dice=damage_dice)


def _srd_action_profile(monster: dict, action_name: str) -> AttackProfile:
    clean_name = clean_action_label(action_name)
    stat_block = monster.get("stat_block_json") or {}
    for bucket in ("actions", "bonus_actions", "reactions"):
        for row in stat_block.get(bucket) or []:
            if not isinstance(row, dict) or not row.get("name"):
                continue
            row_name = str(row["name"])
            if row_name != clean_name and row_name.casefold() != clean_name.casefold():
                continue
            damage_dice = None
            damage_rows = row.get("damage") or []
            if isinstance(damage_rows, list) and damage_rows:
                first = damage_rows[0]
                if isinstance(first, dict) and first.get("dice"):
                    damage_dice = str(first["dice"]).replace(" ", "")
            description = str(row.get("description") or row.get("desc") or "")
            profile = AttackProfile(
                attack_bonus=row.get("attack_bonus"),
                damage_dice=damage_dice,
            )
            if profile.attack_bonus is None:
                profile = _parse_detail_stats(description)
                if profile.damage_dice is None:
                    profile.damage_dice = damage_dice
            return profile
    return AttackProfile()


def _sheet_action_profile(sheet: dict, action_id: str, action_name: str) -> AttackProfile:
    clean_name = clean_action_label(action_name)

    for attack in sheet.get("attacks") or []:
        if not isinstance(attack, dict):
            continue
        attack_name = str(attack.get("name") or "")
        attack_key = str(attack.get("id") or f"attack-{attack_name}")
        if action_id.endswith(attack_key) or attack_name.casefold() == clean_name.casefold():
            damage = extract_damage_dice(attack.get("damage"))
            bonus = attack.get("to_hit")
            if bonus is None and damage is None:
                continue
            return AttackProfile(attack_bonus=bonus, damage_dice=damage)

    item = find_equipped_weapon(sheet, action_id, action_name)
    if item is not None:
        bonus, damage = weapon_profile_from_item(sheet, item)
        return AttackProfile(attack_bonus=bonus, damage_dice=damage)

    return AttackProfile()


def _combatant_action_profile(actor: EncounterCombatant, action_id: str) -> AttackProfile:
    for entry in actor.combat_actions:
        if entry.id == action_id:
            profile = AttackProfile(
                attack_bonus=entry.attack_bonus,
                damage_dice=entry.damage_dice,
            )
            if profile.attack_bonus is None and entry.description:
                parsed = _parse_detail_stats(entry.description)
                profile.attack_bonus = parsed.attack_bonus
                profile.damage_dice = profile.damage_dice or parsed.damage_dice
            return profile
    return AttackProfile()


def resolve_attack_profile(
    session: Session,
    campaign_id: int,
    actor: EncounterCombatant,
    *,
    action_id: str,
    action_name: str,
    detail: str | None,
) -> AttackProfile:
    clean_name = clean_action_label(action_name)
    profile = _combatant_action_profile(actor, action_id)
    if profile.attack_bonus is None and profile.damage_dice is None:
        profile = _parse_detail_stats(detail)

    if profile.attack_bonus is None and profile.damage_dice is None:
        monster = lookup_monster(actor.name)
        if monster is not None:
            profile = _srd_action_profile(monster, clean_name)

    if actor.character_id and profile.attack_bonus is None and profile.damage_dice is None:
        character = session.get(Character, actor.character_id)
        if character is not None and character.campaign_id == campaign_id:
            profile = _sheet_action_profile(
                parse_sheet_json(character.sheet_json),
                action_id,
                clean_name,
            )

    if profile.attack_bonus is None and profile.damage_dice is None:
        profile = _parse_detail_stats(detail)

    if profile.attack_bonus is None and action_id in {"std-attack", "npc-attack"}:
        profile.attack_bonus = 0
        profile.damage_dice = profile.damage_dice or "1d4"

    return profile


def is_resolved_attack(
    *,
    action_id: str,
    action_name: str,
    targeting: str,
    profile: AttackProfile,
) -> bool:
    if action_id.startswith(("equip-", "unequip-")):
        return False
    if targeting != "one_enemy":
        return False
    if "multiattack" in action_name.casefold():
        return False
    if profile.attack_bonus is not None or profile.damage_dice:
        return True
    if action_id.startswith(_ATTACK_ID_PREFIXES):
        return True
    return "attack" in action_name.casefold()


def _find_combatant(state: EncounterState, combatant_id: str) -> EncounterCombatant | None:
    return next((entry for entry in state.combatants if entry.id == combatant_id), None)


def _ensure_hp_initialized(combatant: EncounterCombatant) -> None:
    if combatant.hp is None and combatant.max_hp is not None:
        combatant.hp = combatant.max_hp


def _apply_damage(combatant: EncounterCombatant, amount: int) -> int | None:
    _ensure_hp_initialized(combatant)
    if combatant.hp is None:
        return None
    before = combatant.hp
    combatant.hp = max(0, combatant.hp - amount)
    return before


def resolve_attack(
    session: Session,
    campaign_id: int,
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    messages: list[str] = []
    if len(data.target_ids) != 1:
        return messages

    target = _find_combatant(state, data.target_ids[0])
    if target is None:
        return messages

    clean_name = clean_action_label(data.action_name)
    profile = resolve_attack_profile(
        session,
        campaign_id,
        actor,
        action_id=data.action_id,
        action_name=clean_name,
        detail=data.detail,
    )
    if not is_resolved_attack(
        action_id=data.action_id,
        action_name=clean_name,
        targeting=data.targeting,
        profile=profile,
    ):
        return messages

    if profile.attack_bonus is None:
        message = f"{actor.name} attacks {target.name} with {clean_name} — attack bonus not available."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    attack_roll = roll_d20()
    attack_total = attack_roll + int(profile.attack_bonus)
    target_ac = target.ac

    roll_message = (
        format_roll_detail(
            dice_label=f"{actor.name} attacks {target.name} with {clean_name} — d20",
            rolls=[attack_roll],
            modifier=int(profile.attack_bonus),
            total=attack_total,
        )
        + (f" vs AC {target_ac}" if target_ac is not None else "")
    )
    messages.append(roll_message)
    append_log(
        state,
        roll_message,
        kind="roll",
        actor=actor.name,
        roller_name=actor.name,
        dice="d20",
        result=attack_roll,
        bonus=int(profile.attack_bonus),
        total=attack_total,
    )

    critical = attack_roll == 20
    auto_miss = attack_roll == 1
    hit = not auto_miss and (critical or target_ac is None or attack_total >= target_ac)

    if auto_miss:
        message = f"Miss! Natural 1."
        messages.append(message)
        append_log(
            state,
            f"Miss! {actor.name}'s {clean_name} misses {target.name} (natural 1).",
            kind="action",
            actor=actor.name,
        )
        return messages

    if not hit:
        message = f"Miss! Rolled {attack_total} vs AC {target_ac}."
        messages.append(message)
        append_log(
            state,
            f"Miss! {actor.name}'s {clean_name} misses {target.name}.",
            kind="action",
            actor=actor.name,
        )
        return messages

    if not profile.damage_dice:
        message = f"Hit! No damage dice on file for {clean_name}."
        messages.append(message)
        append_log(
            state,
            f"Hit! {actor.name}'s {clean_name} hits {target.name}, but no damage dice are on file.",
            kind="action",
            actor=actor.name,
        )
        return messages

    damage_total, damage_rolls, damage_mod, normalized = roll_dice_expression(
        profile.damage_dice,
        double_dice=critical,
    )
    damage_detail = format_roll_detail(
        dice_label="Damage",
        rolls=damage_rolls,
        modifier=damage_mod,
        total=damage_total,
    )
    if critical:
        damage_detail = f"Critical hit! {damage_detail}"
    messages.append(damage_detail)
    append_log(
        state,
        damage_detail,
        kind="roll",
        actor=actor.name,
        roller_name=actor.name,
        dice=normalized,
        result=sum(damage_rolls),
        bonus=damage_mod,
        total=damage_total,
    )

    hp_before = _apply_damage(target, damage_total)
    if hp_before is None:
        message = f"{target.name} takes {damage_total} damage."
        messages.append(message)
        append_log(
            state,
            message,
            kind="hp",
            actor=target.name,
        )
        return messages

    message = (
        f"{target.name} takes {damage_total} damage ({hp_before} → {target.hp} HP)"
        + (" — defeated!" if target.hp == 0 else "")
    )
    messages.append(message)
    append_log(
        state,
        message,
        kind="hp",
        actor=target.name,
    )
    return messages
