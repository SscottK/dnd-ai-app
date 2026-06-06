"""Equip and unequip actions during combat."""

from __future__ import annotations

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState, UseActionRequest
from app.db.models import Character
from app.services.character_sheet import parse_sheet_json, sheet_to_json
from app.services.combat_log import append_log
from app.services.weapon_attacks import normalize_item_key


def is_equipment_action(action_id: str) -> bool:
    return action_id.startswith(("equip-", "unequip-"))


def _find_inventory_item(sheet: dict, item_key: str) -> dict | None:
    normalized = normalize_item_key(item_key)
    for entry in sheet.get("inventory") or []:
        if not isinstance(entry, dict):
            continue
        entry_id = str(entry.get("id") or "")
        entry_name = str(entry.get("name") or "")
        if entry_id == item_key or normalize_item_key(entry_name) == normalized:
            return entry
    return None


def resolve_equipment_action(
    session: Session,
    campaign_id: int,
    state: EncounterState,
    *,
    actor: EncounterCombatant,
    data: UseActionRequest,
) -> list[str]:
    if not actor.character_id:
        raise ValueError("Only characters with a sheet can change equipment.")

    character = session.get(Character, actor.character_id)
    if character is None or character.campaign_id != campaign_id:
        raise ValueError("Character not found for this combatant.")

    item_key = data.action_id.split("-", 1)[1] if "-" in data.action_id else ""
    if not item_key:
        raise ValueError("Invalid equipment action.")

    sheet = parse_sheet_json(character.sheet_json)
    item = _find_inventory_item(sheet, item_key)
    if item is None:
        raise ValueError("That item is not on your character sheet.")

    item_name = str(item.get("name") or "item")
    messages: list[str] = []

    if data.action_id.startswith("unequip-"):
        if not item.get("equipped"):
            raise ValueError(f"{item_name} is not equipped.")
        item["equipped"] = False
        message = f"{actor.name} stows {item_name}."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)
    else:
        if item.get("equipped"):
            raise ValueError(f"{item_name} is already equipped.")
        item["equipped"] = True
        message = f"{actor.name} equips {item_name}."
        messages.append(message)
        append_log(state, message, kind="action", actor=actor.name)

    character.sheet_json = sheet_to_json(sheet)
    session.add(character)
    return messages
