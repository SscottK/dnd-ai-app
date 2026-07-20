"""Spend class resources when combat actions are used."""

from __future__ import annotations

import re

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, UseActionRequest
from app.db.models import Character
from app.services.action_rules import lookup_combat_action, lookup_spell
from app.services.character_sheet import parse_sheet_json, sheet_to_json
from app.services.weapon_attacks import clean_action_label


def _resource_cost_for_action(
    sheet: dict,
    *,
    action_id: str,
    action_name: str,
) -> dict | None:
    clean_name = clean_action_label(action_name)
    catalog = lookup_combat_action(clean_name) or lookup_spell(clean_name)
    if catalog and catalog.get("resource_cost"):
        return catalog["resource_cost"]

    for entry in sheet.get("combat_actions") or []:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "")
        entry_name = str(entry.get("name") or "")
        if entry_id and entry_id == action_id:
            return entry.get("resource_cost")
        if entry_name.casefold() == clean_name.casefold():
            return entry.get("resource_cost")

    resource_ids = {
        str(entry.get("id") or "")
        for entry in sheet.get("resources") or []
        if isinstance(entry, dict) and entry.get("id")
    }
    action_slug = re.sub(r"[^a-z0-9]+", "-", clean_name.lower()).strip("-")
    if action_slug in resource_ids:
        return {"resource_id": action_slug, "amount": 1}
    return None


def _action_resource_entry(
    sheet: dict,
    *,
    action_id: str,
    action_name: str,
) -> tuple[dict, dict, int] | None:
    resource_cost = _resource_cost_for_action(
        sheet,
        action_id=action_id,
        action_name=action_name,
    )
    if not resource_cost or not resource_cost.get("resource_id"):
        return None

    resource_id = str(resource_cost["resource_id"])
    amount = int(resource_cost.get("amount") or 1)
    for entry in sheet.get("resources") or []:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("id") or "") != resource_id:
            continue
        return entry, resource_cost, amount

    label = resource_id.replace("-", " ").title()
    raise ValueError(f"{label} is not available on this sheet.")


def ensure_action_resource_available(
    session: Session,
    campaign_id: int,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> None:
    """Validate resource cost without mutating the character sheet."""
    if not actor.character_id:
        return

    character = session.get(Character, actor.character_id)
    if character is None or character.campaign_id != campaign_id:
        return

    sheet = parse_sheet_json(
        character.sheet_json,
        class_name=character.class_name,
        level=character.level,
    )
    match = _action_resource_entry(
        sheet,
        action_id=data.action_id,
        action_name=data.action_name,
    )
    if match is None:
        return

    entry, resource_cost, amount = match
    resource_id = str(resource_cost["resource_id"])
    current = entry.get("current")
    if current is None:
        raise ValueError(f"{resource_id.replace('-', ' ').title()} uses are not tracked on this sheet.")
    if int(current) < amount:
        label = str(entry.get("name") or resource_id)
        raise ValueError(f"Not enough {label} ({current} available, {amount} required).")


def spend_action_resource(
    session: Session,
    campaign_id: int,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    if not actor.character_id:
        return []

    character = session.get(Character, actor.character_id)
    if character is None or character.campaign_id != campaign_id:
        return []

    sheet = parse_sheet_json(
        character.sheet_json,
        class_name=character.class_name,
        level=character.level,
    )
    match = _action_resource_entry(
        sheet,
        action_id=data.action_id,
        action_name=data.action_name,
    )
    if match is None:
        return []

    entry, resource_cost, amount = match
    resource_id = str(resource_cost["resource_id"])
    ensure_action_resource_available(session, campaign_id, actor=actor, data=data)
    current = entry.get("current")
    if current is None:
        return []

    entry["current"] = int(current) - amount
    character.sheet_json = sheet_to_json(sheet)
    session.add(character)
    label = str(entry.get("name") or resource_id)
    remaining = entry["current"]
    messages = [f"{actor.name} spends {amount} {label} ({remaining} remaining)."]
    if resource_id == "rage" or label.casefold() == "rage":
        actor.raging = True
        messages.append(f"{actor.name} enters Rage (resistant to Bludgeoning, Piercing, and Slashing).")
    return messages
