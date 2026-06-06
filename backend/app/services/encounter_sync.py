import json
import logging

from sqlmodel import Session

from app.api.schemas import EncounterState
from app.db.models import Campaign

logger = logging.getLogger("app.encounter_sync")


def parse_encounter(campaign: Campaign) -> EncounterState:
    try:
        raw = json.loads(campaign.encounter_json or "{}")
        return EncounterState.model_validate(raw)
    except (json.JSONDecodeError, ValueError):
        return EncounterState()


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
