import json
import logging

from sqlmodel import Session

from app.api.schemas import EncounterCombatant, EncounterState
from app.db.models import Campaign, Character
from app.services.character_assets import portrait_download_url
from app.services.character_sheet import parse_sheet_json, sheet_to_json
from app.services.conditions import normalize_conditions, sanitize_conditions_list

logger = logging.getLogger("app.encounter_sync")


def parse_encounter(campaign: Campaign) -> EncounterState:
    try:
        raw = json.loads(campaign.encounter_json or "{}")
        return EncounterState.model_validate(raw)
    except (json.JSONDecodeError, ValueError):
        return EncounterState()


def enrich_encounter_portraits(session: Session, state: EncounterState) -> EncounterState:
    enriched = state.model_copy(deep=True)
    for combatant in enriched.combatants:
        if combatant.character_id is None:
            combatant.portrait_url = None
            continue
        character = session.get(Character, combatant.character_id)
        combatant.portrait_url = (
            portrait_download_url(character, session) if character is not None else None
        )
    return enriched


def encounter_for_viewer(state: EncounterState, *, is_owner: bool) -> EncounterState:
    """Hide enemy AC from players; allies and PCs remain visible."""
    if is_owner:
        return state
    redacted = state.model_copy(deep=True)
    for combatant in redacted.combatants:
        if not combatant.is_pc and not combatant.is_ally:
            combatant.ac = None
    return redacted


def sync_character_combat_stats(
    session: Session,
    campaign_id: int,
    character_id: int,
    *,
    hp: int | None,
    max_hp: int | None,
    ac: int | None,
) -> None:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        return

    state = parse_encounter(campaign)
    updated = False
    for combatant in state.combatants:
        if combatant.character_id == character_id:
            if hp is not None:
                combatant.hp = hp
            if max_hp is not None:
                combatant.max_hp = max_hp
            if ac is not None:
                combatant.ac = ac
            updated = True

    if not updated:
        return

    campaign.encounter_json = state.model_dump_json()
    session.add(campaign)
    logger.info(
        "Synced character %s combat stats to campaign %s encounter",
        character_id,
        campaign_id,
    )


def _pc_combatant_changed(
    before: EncounterCombatant | None, after: EncounterCombatant
) -> bool:
    if before is None:
        return True
    return (
        before.hp != after.hp
        or before.max_hp != after.max_hp
        or before.ac != after.ac
        or normalize_conditions(before.conditions) != normalize_conditions(after.conditions)
    )


def sync_encounter_combatants_to_characters(
    session: Session,
    before: EncounterState,
    after: EncounterState,
) -> None:
    """Push PC combatant HP/AC/conditions from encounter into character records."""
    before_by_char = {
        c.character_id: c
        for c in before.combatants
        if c.character_id is not None and c.is_pc
    }

    for combatant in after.combatants:
        if not combatant.is_pc or combatant.character_id is None:
            continue
        if not _pc_combatant_changed(before_by_char.get(combatant.character_id), combatant):
            continue

        character = session.get(Character, combatant.character_id)
        if character is None:
            continue

        if combatant.hp is not None:
            character.hp = combatant.hp
        if combatant.max_hp is not None:
            character.max_hp = combatant.max_hp
        if combatant.ac is not None:
            character.ac = combatant.ac

        sheet = parse_sheet_json(character.sheet_json)
        sheet["conditions"] = sanitize_conditions_list(combatant.conditions)
        character.sheet_json = sheet_to_json(sheet)
        session.add(character)
        logger.info(
            "Synced encounter combat stats to character %s from campaign encounter",
            combatant.character_id,
        )
