"""Resolve attack rolls, damage, and HP changes for combat actions."""

from __future__ import annotations

import re

from dataclasses import dataclass

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.db.models import Character
from app.services.character_sheet import parse_sheet_json
from app.services.combat_dice import format_roll_detail, roll_d20_check, roll_dice_expression
from app.services.combat_log import append_log
from app.services.action_rules import lookup_combat_action, lookup_spell, parse_healing_dice
from app.services.attack_economy import attack_budget_for_actor, use_weapon_attack
from app.services.monster_action_parse import (
    normalize_action_key,
    parse_attack_stats_from_text,
    parse_multiattack_plan,
)
from app.services.monster_catalog import lookup_monster
from app.services.weapon_attacks import (
    clean_action_label,
    extract_damage_dice,
    find_equipped_weapon,
    weapon_profile_from_item,
)

_DIRECT_ATTACK_PREFIXES = ("weapon-", "attack-", "std-attack", "npc-attack")
_SPELL_ATTACK_PREFIX = "spell-"
_MULTI_ATTACK_ACTIONS = {"flurry of blows": 2}


def _helped_by_advantage(state: EncounterState, actor_id: str) -> bool:
    for economy in state.turn_economy.values():
        if economy.helping_target_id == actor_id:
            return True
    return False


def _consume_help_for_actor(state: EncounterState, actor_id: str) -> None:
    for economy in state.turn_economy.values():
        if economy.helping_target_id == actor_id:
            economy.helping_target_id = None


def _target_is_dodging(state: EncounterState, target_id: str) -> bool:
    economy = state.turn_economy.get(target_id)
    return bool(economy and economy.dodging)
_ON_HIT_RIDERS = frozenset({"stunning strike"})
_MELEE_ATTACK_HINTS = ("unarmed", "talon", "fist", "claw", "bite", "slam", "kick")


@dataclass
class AttackProfile:
    attack_bonus: int | None = None
    damage_dice: str | None = None
    damage_type: str | None = None
    damage_packets: list[dict] | None = None


def _packets_from_rows(rows) -> list[dict] | None:
    if not isinstance(rows, list) or not rows:
        return None
    packets: list[dict] = []
    for row in rows:
        if not isinstance(row, dict) or not row.get("dice"):
            continue
        packets.append(
            {
                "dice": str(row["dice"]).replace(" ", ""),
                "type": (str(row["type"]).casefold() if row.get("type") else None),
            }
        )
    return packets or None


def _parse_detail_stats(detail: str | None) -> AttackProfile:
    from app.services.combat_damage import parse_damage_type

    parsed = parse_attack_stats_from_text(detail)
    packets = parsed.damage_packets
    return AttackProfile(
        attack_bonus=parsed.attack_bonus,
        damage_dice=parsed.damage_dice,
        damage_type=(packets[0].get("type") if packets else parse_damage_type(detail)),
        damage_packets=packets,
    )


def _srd_action_profile(monster: dict, action_name: str) -> AttackProfile:
    from app.services.monster_action_parse import enrich_action_row

    clean_name = clean_action_label(action_name)
    clean_key = normalize_action_key(clean_name)
    stat_block = monster.get("stat_block_json") or {}
    for bucket in ("actions", "bonus_actions", "reactions"):
        for row in stat_block.get(bucket) or []:
            if not isinstance(row, dict) or not row.get("name"):
                continue
            row = enrich_action_row(row)
            row_name = str(row["name"])
            if normalize_action_key(row_name) != clean_key:
                continue
            packets = _packets_from_rows(row.get("damage") or [])
            damage_dice = packets[0]["dice"] if packets else None
            description = str(row.get("description") or row.get("desc") or "")
            from app.services.combat_damage import parse_damage_type

            profile = AttackProfile(
                attack_bonus=row.get("attack_bonus"),
                damage_dice=damage_dice,
                damage_type=(
                    packets[0].get("type") if packets else parse_damage_type(description)
                ),
                damage_packets=packets,
            )
            if profile.attack_bonus is None or profile.damage_dice is None or not profile.damage_packets:
                parsed = _parse_detail_stats(description)
                if profile.attack_bonus is None:
                    profile.attack_bonus = parsed.attack_bonus
                if profile.damage_dice is None:
                    profile.damage_dice = parsed.damage_dice
                if profile.damage_type is None:
                    profile.damage_type = parsed.damage_type
                if not profile.damage_packets:
                    profile.damage_packets = parsed.damage_packets
            return profile
    return AttackProfile()


def _delegate_melee_attack_profile(sheet: dict) -> AttackProfile:
    attacks = [row for row in sheet.get("attacks") or [] if isinstance(row, dict)]
    for hint in _MELEE_ATTACK_HINTS:
        for attack in attacks:
            name = str(attack.get("name") or "").casefold()
            if hint not in name:
                continue
            damage = extract_damage_dice(attack.get("damage"))
            bonus = attack.get("to_hit")
            if bonus is not None or damage:
                return AttackProfile(attack_bonus=bonus, damage_dice=damage)
    if attacks:
        first = attacks[0]
        return AttackProfile(
            attack_bonus=first.get("to_hit"),
            damage_dice=extract_damage_dice(first.get("damage")),
        )
    return AttackProfile()


def _spell_catalog_attack_profile(action_name: str) -> AttackProfile:
    catalog = lookup_spell(clean_action_label(action_name))
    if not catalog:
        return AttackProfile()
    damage_dice = None
    for row in catalog.get("damage") or []:
        if isinstance(row, dict) and row.get("dice"):
            damage_dice = extract_damage_dice(str(row["dice"]))
            if damage_dice:
                break
    if not damage_dice:
        damage_dice = extract_damage_dice(str(catalog.get("description") or ""))
    attack_bonus = catalog.get("attack_bonus") or catalog.get("to_hit")
    if attack_bonus is None and damage_dice is None:
        return AttackProfile()
    return AttackProfile(attack_bonus=attack_bonus, damage_dice=damage_dice)


def _catalog_action_profile(action_name: str) -> AttackProfile:
    catalog = lookup_combat_action(clean_action_label(action_name))
    if not catalog:
        return AttackProfile()
    attack_bonus = catalog.get("attack_bonus") or catalog.get("to_hit")
    damage_dice = catalog.get("damage_dice")
    if not damage_dice:
        damage_dice = extract_damage_dice(str(catalog.get("description") or ""))
    if attack_bonus is None and not damage_dice:
        parsed = _parse_detail_stats(str(catalog.get("description") or ""))
        return parsed
    return AttackProfile(attack_bonus=attack_bonus, damage_dice=damage_dice)


def _is_weapon_attack_request(
    action_id: str,
    targeting: str,
    profile: AttackProfile,
) -> bool:
    if targeting != "one_enemy":
        return False
    if action_id.startswith(_DIRECT_ATTACK_PREFIXES) or action_id.startswith("weapon-"):
        return True
    if profile.attack_bonus is not None or profile.damage_dice:
        return True
    return False


def _remaining_weapon_swings(
    state: EncounterState,
    session: Session,
    campaign_id: int,
    actor: EncounterCombatant,
) -> int:
    from app.api.schemas import TurnEconomySnapshot

    economy = state.turn_economy.get(actor.id, TurnEconomySnapshot())
    budget = attack_budget_for_actor(session, campaign_id, actor)
    if economy.attacks_remaining > 0:
        return economy.attacks_remaining
    if not economy.action_used:
        return budget
    if economy.extra_action_available:
        return budget
    return 0


def _spell_action_profile(sheet: dict, action_id: str, action_name: str) -> AttackProfile:
    clean_name = clean_action_label(action_name)
    for spell in sheet.get("spells") or []:
        if not isinstance(spell, dict):
            continue
        spell_id = str(spell.get("id") or f"spell-{spell.get('name')}")
        spell_name = str(spell.get("name") or "")
        if action_id.endswith(spell_id) or spell_name.casefold() == clean_name.casefold():
            damage = extract_damage_dice(spell.get("damage"))
            bonus = spell.get("attack_bonus") or spell.get("to_hit")
            if bonus is not None or damage:
                return AttackProfile(attack_bonus=bonus, damage_dice=damage)
    return AttackProfile()


def _sheet_action_profile(sheet: dict, action_id: str, action_name: str) -> AttackProfile:
    clean_name = clean_action_label(action_name)

    if action_id.startswith(_SPELL_ATTACK_PREFIX):
        spell_profile = _spell_action_profile(sheet, action_id, clean_name)
        if spell_profile.attack_bonus is not None or spell_profile.damage_dice:
            return spell_profile

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


def _multiattack_description(monster: dict | None, detail: str | None) -> str:
    if monster is None:
        return str(detail or "")
    stat_block = monster.get("stat_block_json") or {}
    for row in stat_block.get("actions") or []:
        if not isinstance(row, dict) or not row.get("name"):
            continue
        if "multiattack" in str(row["name"]).casefold():
            return str(row.get("description") or row.get("desc") or detail or "")
    return str(detail or "")


def _multiattack_strikes(
    actor: EncounterCombatant,
    monster: dict | None,
    *,
    detail: str | None,
) -> list[tuple[str, AttackProfile]]:
    description = _multiattack_description(monster, detail)
    strikes: list[tuple[str, AttackProfile]] = []
    plan = parse_multiattack_plan(description)

    def _profile_for(attack_name: str) -> AttackProfile:
        if attack_name == "*":
            return AttackProfile()
        if monster is not None:
            profile = _srd_action_profile(monster, attack_name)
            if profile.attack_bonus is not None or profile.damage_dice:
                return profile
        for entry in actor.combat_actions:
            if normalize_action_key(entry.name) != normalize_action_key(attack_name):
                continue
            profile = AttackProfile(
                attack_bonus=entry.attack_bonus,
                damage_dice=entry.damage_dice,
            )
            if profile.attack_bonus is None and not profile.damage_dice and entry.description:
                profile = _parse_detail_stats(entry.description)
            return profile
        return AttackProfile()

    for attack_name, count in plan:
        if attack_name == "*":
            # Unspecified attacks — fall through to first usable action × count.
            continue
        profile = _profile_for(attack_name)
        if profile.attack_bonus is None and profile.damage_dice is None:
            continue
        strikes.extend((attack_name, profile) for _ in range(max(1, count)))

    if not strikes:
        # "makes N attacks" without names, or named parse failed — use first real attack.
        total = 2
        for attack_name, count in plan:
            if attack_name == "*":
                total = max(1, count)
                break
        for entry in actor.combat_actions:
            if "multiattack" in entry.name.casefold():
                continue
            profile = AttackProfile(
                attack_bonus=entry.attack_bonus,
                damage_dice=entry.damage_dice,
            )
            if profile.attack_bonus is None and not profile.damage_dice and entry.description:
                profile = _parse_detail_stats(entry.description)
            if profile.attack_bonus is None and profile.damage_dice is None:
                continue
            strikes.extend((entry.name, profile) for _ in range(total))
            break

    return strikes


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
        monster = lookup_monster(actor.srd_name or actor.name)
        if monster is not None:
            profile = _srd_action_profile(monster, clean_name)

    if profile.attack_bonus is None and profile.damage_dice is None:
        profile = _catalog_action_profile(clean_name)

    if action_id.startswith(_SPELL_ATTACK_PREFIX) and profile.attack_bonus is None and profile.damage_dice is None:
        profile = _spell_catalog_attack_profile(clean_name)

    if actor.character_id and profile.attack_bonus is None and profile.damage_dice is None:
        character = session.get(Character, actor.character_id)
        if character is not None and character.campaign_id == campaign_id:
            sheet = parse_sheet_json(
                character.sheet_json,
                class_name=character.class_name,
                level=character.level,
            )
            if clean_name.casefold() in _MULTI_ATTACK_ACTIONS:
                profile = _delegate_melee_attack_profile(sheet)
            else:
                profile = _sheet_action_profile(sheet, action_id, clean_name)

    if (
        action_id.startswith(_SPELL_ATTACK_PREFIX)
        and actor.character_id
        and profile.attack_bonus is None
    ):
        character = session.get(Character, actor.character_id)
        if character is not None:
            sheet = parse_sheet_json(
                character.sheet_json,
                class_name=character.class_name,
                level=character.level,
            )
            sab = sheet.get("spell_attack_bonus")
            if sab is not None:
                try:
                    profile.attack_bonus = int(sab)
                except (TypeError, ValueError):
                    pass

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
    clean_name = clean_action_label(action_name).casefold()
    if "multiattack" in clean_name:
        return False
    if clean_name in _ON_HIT_RIDERS:
        return False
    if clean_name in _MULTI_ATTACK_ACTIONS:
        return profile.attack_bonus is not None or bool(profile.damage_dice)
    if profile.attack_bonus is not None or profile.damage_dice:
        return True
    if action_id.startswith(_DIRECT_ATTACK_PREFIXES):
        return True
    if action_id.startswith(_SPELL_ATTACK_PREFIX):
        return True
    return False


def _find_combatant(state: EncounterState, combatant_id: str) -> EncounterCombatant | None:
    return next((entry for entry in state.combatants if entry.id == combatant_id), None)


def _ensure_hp_initialized(combatant: EncounterCombatant) -> None:
    if combatant.hp is None and combatant.max_hp is not None:
        combatant.hp = combatant.max_hp


def _apply_damage(combatant: EncounterCombatant, amount: int) -> int | None:
    from app.services.death_saves import mark_unstable_on_damage_at_zero, reset_death_saves_on_revive

    _ensure_hp_initialized(combatant)
    if combatant.hp is None:
        return None
    before = combatant.hp
    was_at_zero = before <= 0
    combatant.hp = max(0, combatant.hp - amount)
    if was_at_zero and amount > 0:
        mark_unstable_on_damage_at_zero(combatant)
        # Damage at 0 HP while dying also causes death save failures (1, or 2 on crit —
        # auto combat doesn't distinguish crits here; apply 1 failure).
        if not combatant.death_save_stable and combatant.is_pc:
            combatant.death_save_failures = min(3, combatant.death_save_failures + 1)
    if combatant.hp > 0:
        reset_death_saves_on_revive(combatant)
    return before


def _normalize_healing_expression(expression: str, actor_level: int | None) -> str | None:
    if not expression:
        return None
    level = actor_level or 1
    normalized = re.sub(r"your\w*level", str(level), expression, flags=re.IGNORECASE)
    normalized = re.sub(r"your\s+\w+\s+level", str(level), normalized, flags=re.IGNORECASE)
    normalized = normalized.replace(" ", "")
    if not re.fullmatch(r"\d+d\d+(?:[+-]\d+)?", normalized, flags=re.IGNORECASE):
        match = re.search(r"(\d+d\d+)", normalized, flags=re.IGNORECASE)
        if not match:
            return None
        dice = match.group(1)
        modifier_match = re.search(rf"{re.escape(dice)}([+-]\d+)", normalized, flags=re.IGNORECASE)
        if modifier_match:
            return f"{dice}{modifier_match.group(1)}"
        return f"{dice}+{level}" if "level" in expression.lower() else dice
    return normalized


def can_receive_healing(combatant: EncounterCombatant) -> bool:
    if combatant.hp is None or combatant.max_hp is None:
        return True
    return combatant.hp < combatant.max_hp


def action_heals_hp(data: UseActionRequest) -> bool:
    if data.targeting == "self" and will_resolve_self_heal(data):
        return True
    clean_name = clean_action_label(data.action_name)
    catalog = lookup_combat_action(clean_name) or lookup_spell(clean_name)
    return bool(catalog and catalog.get("healing_dice"))


def validate_healing_targets(
    state: EncounterState,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> None:
    if not action_heals_hp(data):
        return
    if data.targeting == "self":
        if not can_receive_healing(actor):
            raise ValueError(f"{actor.name} is already at full hit points.")
        return
    if not data.target_ids:
        return
    by_id = {combatant.id: combatant for combatant in state.combatants}
    target = by_id.get(data.target_ids[0])
    if target is None:
        return
    if not can_receive_healing(target):
        raise ValueError(f"{target.name} is already at full hit points and cannot be healed.")


def _apply_healing(combatant: EncounterCombatant, amount: int) -> int | None:
    _ensure_hp_initialized(combatant)
    if combatant.hp is None:
        return None
    before = combatant.hp
    ceiling = combatant.max_hp if combatant.max_hp is not None else combatant.hp + amount
    combatant.hp = min(ceiling, combatant.hp + amount)
    return before


def will_resolve_self_heal(data: UseActionRequest) -> bool:
    if data.targeting != "self":
        return False
    clean_name = clean_action_label(data.action_name)
    catalog = lookup_combat_action(clean_name) or lookup_spell(clean_name)
    healing_expr = None
    if catalog:
        healing_expr = catalog.get("healing_dice")
        if not healing_expr:
            healing_expr = parse_healing_dice(str(catalog.get("description") or ""))
    if not healing_expr:
        healing_expr = parse_healing_dice(data.detail or "")
    return bool(healing_expr)


def resolve_self_heal(
    session: Session,
    campaign_id: int,
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    if data.targeting != "self":
        return []

    clean_name = clean_action_label(data.action_name)
    catalog = lookup_combat_action(clean_name) or lookup_spell(clean_name)
    healing_expr = None
    if catalog:
        healing_expr = catalog.get("healing_dice")
        if not healing_expr:
            healing_expr = parse_healing_dice(str(catalog.get("description") or ""))
    if not healing_expr:
        healing_expr = parse_healing_dice(data.detail or "")

    if not healing_expr:
        return []

    if not can_receive_healing(actor):
        raise ValueError(f"{actor.name} is already at full hit points.")

    actor_level = None
    if actor.character_id:
        character = session.get(Character, actor.character_id)
        if character is not None and character.campaign_id == campaign_id:
            actor_level = character.level

    normalized = _normalize_healing_expression(str(healing_expr), actor_level)
    if not normalized:
        return []

    total, rolls, modifier, normalized_dice = roll_dice_expression(normalized)
    before = _apply_healing(actor, total)
    clean_name = clean_action_label(data.action_name)
    roll_message = format_roll_detail(
        dice_label=f"{actor.name} uses {clean_name} — healing",
        rolls=rolls,
        modifier=modifier,
        total=total,
    )
    messages = [roll_message]
    append_log(
        state,
        roll_message,
        kind="roll",
        actor=actor.name,
        roller_name=actor.name,
        dice=normalized_dice,
        result=sum(rolls),
        bonus=modifier,
        total=total,
    )

    if before is None:
        hp_message = f"{actor.name} regains {total} hit points."
    else:
        hp_message = f"{actor.name} regains {total} HP ({before} → {actor.hp})"
    messages.append(hp_message)
    append_log(state, hp_message, kind="hp", actor=actor.name)
    return messages


def resolve_attack(
    session: Session | None,
    campaign_id: int,
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    messages: list[str] = []
    if session is not None:
        from app.services.encounter_sync import apply_sheet_defenses_to_combatant

        for combatant in state.combatants:
            apply_sheet_defenses_to_combatant(session, combatant)
    target_ids = list(data.target_ids or [])
    if not target_ids:
        return messages

    clean_name = clean_action_label(data.action_name)

    if len(target_ids) == 1 and "multiattack" in clean_name.casefold():
        target = _find_combatant(state, target_ids[0])
        if target is None:
            return messages
        monster = lookup_monster(actor.srd_name or actor.name)
        strikes = _multiattack_strikes(actor, monster, detail=data.detail)
        if not strikes:
            message = f"{actor.name} uses Multiattack on {target.name} — attack profiles not available."
            messages.append(message)
            append_log(state, message, kind="action", actor=actor.name)
            return messages

        for strike_index, (strike_name, strike_profile) in enumerate(strikes):
            if strike_profile.attack_bonus is None:
                continue
            strike_messages = _resolve_attack_strike(
                state,
                actor=actor,
                target=target,
                clean_name=strike_name,
                profile=strike_profile,
                strike_index=strike_index,
                strike_count=len(strikes),
                detail=data.detail,
            )
            messages.extend(strike_messages)
            if strike_index == 0 and _helped_by_advantage(state, actor.id):
                _consume_help_for_actor(state, actor.id)
        return messages

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

    if (
        len(target_ids) > 1
        and session is not None
        and _is_weapon_attack_request(data.action_id, data.targeting, profile)
    ):
        remaining = _remaining_weapon_swings(state, session, campaign_id, actor)
        if len(target_ids) > remaining:
            raise ValueError(
                f"Not enough attacks remaining ({remaining}) for {len(target_ids)} targets."
            )
        for index, target_id in enumerate(target_ids):
            target = _find_combatant(state, target_id)
            if target is None:
                continue
            swing = data.model_copy(update={"target_ids": [target_id]})
            use_weapon_attack(
                state,
                session,
                campaign_id,
                actor=actor,
                data=swing,
            )
            messages.extend(
                _resolve_attack_strike(
                    state,
                    actor=actor,
                    target=target,
                    clean_name=clean_name,
                    profile=profile,
                    strike_index=index,
                    strike_count=len(target_ids),
                    detail=data.detail,
                )
            )
            if index == 0 and _helped_by_advantage(state, actor.id):
                _consume_help_for_actor(state, actor.id)
        return messages

    if len(target_ids) != 1:
        return messages

    target = _find_combatant(state, target_ids[0])
    if target is None:
        return messages

    if profile.attack_bonus is None:
        message = f"{actor.name} attacks {target.name} with {clean_name} — attack bonus not available."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
        return messages

    strike_count = _MULTI_ATTACK_ACTIONS.get(clean_name.casefold(), 1)
    for strike_index in range(strike_count):
        strike_messages = _resolve_attack_strike(
            state,
            actor=actor,
            target=target,
            clean_name=clean_name,
            profile=profile,
            strike_index=strike_index,
            strike_count=strike_count,
            detail=data.detail,
        )
        messages.extend(strike_messages)
        if strike_index == 0 and _helped_by_advantage(state, actor.id):
            _consume_help_for_actor(state, actor.id)
    return messages


def _resolve_attack_strike(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    target: EncounterCombatant,
    clean_name: str,
    profile: AttackProfile,
    strike_index: int,
    strike_count: int,
    detail: str | None = None,
) -> list[str]:
    messages: list[str] = []
    strike_label = (
        clean_name
        if strike_count == 1
        else f"{clean_name} ({strike_index + 1}/{strike_count})"
    )

    from app.services.condition_attack_mods import (
        attack_advantage_flags,
        is_auto_crit_melee,
    )

    advantage = _helped_by_advantage(state, actor.id)
    disadvantage = _target_is_dodging(state, target.id)
    cond_adv, cond_dis, cond_tags = attack_advantage_flags(
        actor_conditions=actor.conditions,
        target_conditions=target.conditions,
        action_name=clean_name,
        detail=detail,
    )
    if cond_adv:
        advantage = True
    if cond_dis:
        disadvantage = True
    attack_roll, d20_rolls = roll_d20_check(
        advantage=advantage,
        disadvantage=disadvantage,
    )
    from app.services.conditions import get_exhaustion_level

    exhaustion_penalty = 2 * get_exhaustion_level(actor.conditions)
    attack_bonus = int(profile.attack_bonus) - exhaustion_penalty
    attack_total = attack_roll + attack_bonus
    target_ac = target.ac

    roll_tags = []
    if advantage and not disadvantage:
        roll_tags.append("advantage")
    elif disadvantage and not advantage:
        roll_tags.append("disadvantage")
    roll_tags.extend(cond_tags)
    if exhaustion_penalty:
        roll_tags.append(f"exhaustion -{exhaustion_penalty}")
    tag_text = f" ({', '.join(roll_tags)})" if roll_tags else ""
    dice_label = (
        f"{actor.name} attacks {target.name} with {strike_label} — d20{tag_text}"
    )
    if len(d20_rolls) > 1:
        dice_label += f" [{', '.join(str(value) for value in d20_rolls)} → {attack_roll}]"
    roll_message = (
        format_roll_detail(
            dice_label=dice_label,
            rolls=[attack_roll],
            modifier=attack_bonus,
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
        bonus=attack_bonus,
        total=attack_total,
    )

    critical = attack_roll == 20
    if not critical and is_auto_crit_melee(
        target_conditions=target.conditions,
        action_name=clean_name,
        detail=detail,
    ):
        critical = True
    auto_miss = attack_roll == 1
    hit = not auto_miss and (critical or target_ac is None or attack_total >= target_ac)

    if auto_miss:
        message = f"Miss! Natural 1."
        messages.append(message)
        append_log(
            state,
            f"Miss! {actor.name}'s {strike_label} misses {target.name} (natural 1).",
            kind="action",
            actor=actor.name,
        )
        return messages

    if not hit:
        message = f"Miss! Rolled {attack_total} vs AC {target_ac}."
        messages.append(message)
        append_log(
            state,
            f"Miss! {actor.name}'s {strike_label} misses {target.name}.",
            kind="action",
            actor=actor.name,
        )
        return messages

    packets = list(profile.damage_packets or [])
    if not packets and profile.damage_dice:
        packets = [{"dice": profile.damage_dice, "type": profile.damage_type}]
    if not packets:
        message = f"Hit! No damage dice on file for {strike_label}."
        messages.append(message)
        append_log(
            state,
            f"Hit! {actor.name}'s {strike_label} hits {target.name}, but no damage dice are on file.",
            kind="action",
            actor=actor.name,
        )
        return messages

    from app.services.combat_damage import apply_damage_packets

    rolled_packets: list[tuple[int, str | None]] = []
    packet_details: list[str] = []
    for packet in packets:
        dice = str(packet.get("dice") or "")
        dtype = packet.get("type") or profile.damage_type
        damage_total, damage_rolls, damage_mod, normalized = roll_dice_expression(
            dice,
            double_dice=critical,
        )
        rolled_packets.append((damage_total, dtype))
        part = format_roll_detail(
            dice_label=f"{(dtype or 'damage').title()}",
            rolls=damage_rolls,
            modifier=damage_mod,
            total=damage_total,
        )
        packet_details.append(f"{part} [{normalized}]")

    applied = apply_damage_packets(rolled_packets, combatant=target)
    damage_detail = " + ".join(packet_details)
    if critical:
        damage_detail = f"Critical hit! {damage_detail}"
    if applied.note:
        damage_detail = f"{damage_detail} → {applied.amount} ({applied.note})"
    elif len(packets) > 1:
        damage_detail = f"{damage_detail} → {applied.amount} total"
    messages.append(damage_detail)
    append_log(
        state,
        damage_detail,
        kind="roll",
        actor=actor.name,
        roller_name=actor.name,
        dice="+".join(str(p.get("dice") or "") for p in packets),
        result=applied.original,
        bonus=0,
        total=applied.amount,
    )

    hp_before = _apply_damage(target, applied.amount)
    if hp_before is None:
        message = f"{target.name} takes {applied.amount} damage."
        messages.append(message)
        append_log(
            state,
            message,
            kind="hp",
            actor=target.name,
        )
        return messages

    message = (
        f"{target.name} takes {applied.amount} damage ({hp_before} → {target.hp} HP)"
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
