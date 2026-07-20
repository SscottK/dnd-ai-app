"""Save-based combat effects (breath weapons, etc.) for 5.5e."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.services.combat_damage import apply_damage_modifiers, parse_damage_type
from app.services.combat_dice import format_roll_detail, roll_d20_check, roll_dice_expression
from app.services.combat_log import append_log
from app.services.conditions import get_exhaustion_level
from app.services.monster_action_parse import parse_attack_stats_from_text

_SAVE_RE = re.compile(
    r"(?P<ability>Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)"
    r"\s+Saving Throw:\s*DC\s*(?P<dc>\d+)",
    re.IGNORECASE,
)
_FAILURE_DICE_RE = re.compile(
    r"failure:\s*(?:\d+\s*)?\(\s*(?P<dice>\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\)",
    re.IGNORECASE,
)
_SUCCESS_HALF_RE = re.compile(r"success:\s*half", re.IGNORECASE)
_ABILITY_KEYS = {
    "strength": "str",
    "dexterity": "dex",
    "constitution": "con",
    "intelligence": "int",
    "wisdom": "wis",
    "charisma": "cha",
}


@dataclass
class SaveEffect:
    ability: str
    dc: int
    damage_dice: str | None = None
    damage_type: str | None = None
    half_on_success: bool = False


def looks_like_save_effect(*, action_name: str, detail: str | None, description: str | None = None) -> bool:
    text = " ".join(part for part in (action_name, detail, description) if part)
    if not text:
        return False
    if re.search(r"attack\s+roll:", text, re.IGNORECASE):
        return False
    if re.search(r"\+\d+\s+to\s+hit", text, re.IGNORECASE):
        return False
    return bool(_SAVE_RE.search(text))


def parse_save_effect(text: str | None) -> SaveEffect | None:
    if not text:
        return None
    match = _SAVE_RE.search(text)
    if not match:
        return None
    ability = match.group("ability").capitalize()
    dc = int(match.group("dc"))
    damage_dice = None
    fail = _FAILURE_DICE_RE.search(text)
    if fail:
        damage_dice = re.sub(r"\s+", "", fail.group("dice"))
    else:
        # Fallback: first parenthetical dice after Failure
        parsed = parse_attack_stats_from_text(text)
        # Prefer failure section
        fail_idx = text.casefold().find("failure:")
        if fail_idx >= 0:
            from app.services.monster_action_parse import parse_attack_stats_from_text as _p

            # reuse hit parser on failure chunk by rewriting
            chunk = "Hit: " + text[fail_idx + len("failure:") :]
            damage_dice = _p(chunk).damage_dice
        if not damage_dice:
            damage_dice = parsed.damage_dice
    return SaveEffect(
        ability=ability,
        dc=dc,
        damage_dice=damage_dice,
        damage_type=parse_damage_type(text),
        half_on_success=bool(_SUCCESS_HALF_RE.search(text)),
    )


def _ability_mod_for_target(
    target: EncounterCombatant,
    ability: str,
    *,
    session=None,
) -> int:
    key = _ABILITY_KEYS.get(ability.casefold())
    if not key:
        return 0

    if (target.is_pc or target.character_id) and session is not None and target.character_id:
        from app.db.models import Character
        from app.services.character_sheet import computed_save_bonus, parse_sheet_json

        character = session.get(Character, target.character_id)
        if character is not None:
            sheet = parse_sheet_json(
                character.sheet_json,
                class_name=character.class_name,
                level=character.level,
            )
            return computed_save_bonus(sheet, key)

    # Prefer monster printed save if available
    from app.services.monster_catalog import lookup_monster

    monster = lookup_monster(target.srd_name or target.name) if not target.is_pc else None
    if monster:
        sb = monster.get("stat_block_json") or {}
        saves = sb.get("saving_throws") or {}
        if isinstance(saves, dict) and saves.get(key) is not None:
            try:
                return int(saves[key])
            except (TypeError, ValueError):
                pass
        scores = sb.get("ability_scores") or {}
        if scores.get(key) is not None:
            try:
                return (int(scores[key]) - 10) // 2
            except (TypeError, ValueError):
                pass
    return 0


def resolve_save_effect(
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
    description: str | None = None,
    session=None,
) -> list[str]:
    from app.services.combat_resolution import _apply_damage, _find_combatant
    from app.services.encounter_sync import apply_sheet_defenses_to_combatant

    text = " ".join(part for part in (data.detail, description, data.action_name) if part)
    effect = parse_save_effect(text)
    if effect is None:
        return []

    messages: list[str] = [
        f"{actor.name} uses {data.action_name} — {effect.ability} save DC {effect.dc}."
    ]
    append_log(state, messages[0], kind="action", actor=actor.name)

    targets = [_find_combatant(state, tid) for tid in (data.target_ids or [])]
    targets = [t for t in targets if t is not None]
    if not targets:
        messages.append("No valid targets.")
        return messages

    for target in targets:
        if session is not None:
            apply_sheet_defenses_to_combatant(session, target)
        save_mod = _ability_mod_for_target(target, effect.ability, session=session)
        exhaustion = get_exhaustion_level(target.conditions)
        save_mod -= 2 * exhaustion
        roll, _ = roll_d20_check()
        total = roll + save_mod
        success = total >= effect.dc
        roll_msg = format_roll_detail(
            dice_label=f"{target.name} {effect.ability} save",
            rolls=[roll],
            modifier=save_mod,
            total=total,
        ) + f" vs DC {effect.dc} — {'success' if success else 'failure'}"
        messages.append(roll_msg)
        append_log(
            state,
            roll_msg,
            kind="roll",
            actor=target.name,
            roller_name=target.name,
            dice="d20",
            result=roll,
            bonus=save_mod,
            total=total,
        )

        if not effect.damage_dice:
            continue
        if success and not effect.half_on_success:
            continue

        damage_total, damage_rolls, damage_mod, normalized = roll_dice_expression(effect.damage_dice)
        if success and effect.half_on_success:
            damage_total = damage_total // 2

        applied = apply_damage_modifiers(
            damage_total,
            damage_type=effect.damage_type,
            combatant=target,
        )
        detail = format_roll_detail(
            dice_label=f"Damage vs {target.name}",
            rolls=damage_rolls,
            modifier=damage_mod,
            total=damage_total,
        )
        if applied.note:
            detail += f" → {applied.amount} ({applied.note})"
        elif success and effect.half_on_success:
            detail += f" → {applied.amount} (half on success)"
        messages.append(detail)
        append_log(
            state,
            detail,
            kind="roll",
            actor=actor.name,
            dice=normalized,
            result=sum(damage_rolls),
            bonus=damage_mod,
            total=applied.amount,
        )
        before = _apply_damage(target, applied.amount)
        if before is not None:
            hp_msg = (
                f"{target.name} takes {applied.amount} damage ({before} → {target.hp})"
                + (" — defeated!" if target.hp == 0 else "")
            )
            messages.append(hp_msg)
            append_log(state, hp_msg, kind="hp", actor=target.name)

    return messages
