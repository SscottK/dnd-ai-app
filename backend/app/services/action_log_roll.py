"""Execute and record out-of-combat rolls."""

from __future__ import annotations

from sqlmodel import Session

from app.api.schemas import ActionLogEntry, ActionRollRequest
from app.db.models import Campaign, Character, User
from app.services.action_dice import format_action_roll_message, roll_expression
from app.services.action_log import append_action_log, parse_action_log, utc_now_iso
from app.services.campaign_membership import get_campaign_member_for_user
from app.services.character_sheet import computed_save_bonus, computed_skill_bonus, parse_sheet_json
from app.services.encounter_sync import parse_encounter


class ActionRollError(ValueError):
    pass


def _character_for_roll(
    session: Session,
    campaign: Campaign,
    user: User,
    character_id: int | None,
) -> Character | None:
    if character_id is None:
        membership = get_campaign_member_for_user(campaign.id, user.id, session)
        if membership is None:
            return None
        return session.get(Character, membership.character_id)

    character = session.get(Character, character_id)
    if character is None or character.campaign_id != campaign.id:
        raise ActionRollError("Character not found in this campaign.")

    membership = get_campaign_member_for_user(campaign.id, user.id, session)
    if membership is None:
        raise ActionRollError("You are not a member of this campaign.")
    if membership.character_id != character.id and campaign.owner_id != user.id:
        raise ActionRollError("You can only roll for your own character.")
    return character


def perform_action_roll(
    session: Session,
    campaign: Campaign,
    user: User,
    data: ActionRollRequest,
) -> ActionLogEntry:
    if not campaign.session_active:
        raise ActionRollError("Start a live session before logging rolls.")

    encounter = parse_encounter(campaign)
    if encounter.combatants:
        raise ActionRollError("Combat is active — use the combat log for rolls.")

    character = _character_for_roll(session, campaign, user, data.character_id)
    character_name = character.name if character else None
    sheet = (
        parse_sheet_json(
            character.sheet_json,
            class_name=character.class_name,
            level=character.level,
        )
        if character
        else {}
    )

    roll_kind = (data.roll_kind or "dice").strip().lower()
    advantage = bool(data.advantage)
    disadvantage = bool(data.disadvantage)

    if roll_kind == "skill":
        label = (data.label or "").strip()
        if not label:
            raise ActionRollError("Choose a skill to roll.")
        bonus = computed_skill_bonus(sheet, label)
        total, rolls, dropped, _mod, expression = roll_expression(
            "d20",
            advantage=advantage,
            disadvantage=disadvantage,
        )
        total_with_bonus = total + bonus
        message = format_action_roll_message(
            label=f"{label} check",
            kept=rolls,
            dropped=dropped,
            modifier=0,
            total=total_with_bonus,
            bonus=bonus,
        )
        entry = ActionLogEntry(
            at=utc_now_iso(),
            message=message,
            kind="skill",
            roller_name=user.username,
            character_name=character_name,
            dice="d20",
            expression=expression,
            result=rolls[0] if len(rolls) == 1 else max(rolls) if rolls else total,
            bonus=bonus,
            total=total_with_bonus,
            rolls=rolls,
            dropped=dropped or None,
        )
    elif roll_kind == "save":
        ability = (data.label or "").strip().lower()
        if ability not in {"str", "dex", "con", "int", "wis", "cha"}:
            raise ActionRollError("Choose a valid saving throw.")
        bonus = computed_save_bonus(sheet, ability)
        label = f"{ability.upper()} save"
        total, rolls, dropped, _mod, expression = roll_expression(
            "d20",
            advantage=advantage,
            disadvantage=disadvantage,
        )
        total_with_bonus = total + bonus
        message = format_action_roll_message(
            label=label,
            kept=rolls,
            dropped=dropped,
            modifier=0,
            total=total_with_bonus,
            bonus=bonus,
        )
        entry = ActionLogEntry(
            at=utc_now_iso(),
            message=message,
            kind="save",
            roller_name=user.username,
            character_name=character_name,
            dice="d20",
            expression=expression,
            result=rolls[0] if len(rolls) == 1 else max(rolls) if rolls else total,
            bonus=bonus,
            total=total_with_bonus,
            rolls=rolls,
            dropped=dropped or None,
        )
    else:
        expression = (data.expression or data.quick_die or "").strip()
        if not expression:
            raise ActionRollError("Enter dice to roll.")
        total, kept, dropped, mod, normalized = roll_expression(
            expression,
            advantage=advantage,
            disadvantage=disadvantage,
        )
        dice_label = normalized
        message = format_action_roll_message(
            label=dice_label,
            kept=kept,
            dropped=dropped,
            modifier=mod,
            total=total,
        )
        entry = ActionLogEntry(
            at=utc_now_iso(),
            message=message,
            kind="roll",
            roller_name=user.username,
            character_name=character_name,
            dice=dice_label,
            expression=normalized,
            result=kept[0] if len(kept) == 1 else None,
            bonus=mod or None,
            total=total,
            rolls=kept,
            dropped=dropped or None,
        )

    append_action_log(campaign, entry)
    return entry
