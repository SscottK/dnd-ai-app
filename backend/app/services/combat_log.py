"""Combat log accumulation, end-combat archival, and party notes distribution."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.api.schemas import CombatLogEntry, EncounterCombatant, EncounterState
from app.db.models import Campaign, CampaignMember, Character, HistoricalEncounter
from app.services.encounter_actions import (
    is_defeated_enemy,
    is_enemy,
    sorted_combatants,
    sorted_combatants_for_display,
)
from app.services.play_session_notes import active_notes_tab, append_text_to_notes_tab


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def append_log(state: EncounterState, message: str, *, kind: str = "event", **fields) -> None:
    entry = CombatLogEntry(
        at=utc_now_iso(),
        message=message,
        kind=kind,
        **{key: value for key, value in fields.items() if value is not None},
    )
    state.combat_log.append(entry)


def is_alive(combatant: EncounterCombatant) -> bool:
    if combatant.hp is None:
        return True
    return combatant.hp > 0


def all_enemies_defeated(state: EncounterState) -> bool:
    enemies = [combatant for combatant in state.combatants if is_enemy(combatant)]
    if not enemies:
        return False
    return all(not is_alive(combatant) for combatant in enemies)


def format_initiative_order(state: EncounterState) -> list[str]:
    lines: list[str] = []
    for index, combatant in enumerate(sorted_combatants_for_display(state), start=1):
        tags: list[str] = []
        if combatant.is_pc:
            tags.append("PC")
        if combatant.is_ally and not combatant.is_pc:
            tags.append("Ally")
        if is_defeated_enemy(combatant):
            tags.append("Defeated")
        tag = f" ({', '.join(tags)})" if tags else ""
        hp = ""
        if combatant.hp is not None and combatant.max_hp is not None:
            hp = f" · HP {combatant.hp}/{combatant.max_hp}"
        elif combatant.hp is not None:
            hp = f" · HP {combatant.hp}"
        lines.append(f"{index}. {combatant.name}{tag} — Init {combatant.initiative}{hp}")
    return lines


def format_log_entries(state: EncounterState) -> list[str]:
    lines: list[str] = []
    for entry in state.combat_log:
        stamp = entry.at[:16].replace("T", " ") if entry.at else ""
        prefix = f"[{stamp}] " if stamp else ""
        if entry.kind == "roll" and entry.dice and entry.result is not None:
            roller = f"{entry.roller_name}: " if entry.roller_name else ""
            bonus = f" {entry.bonus:+d}" if entry.bonus not in (None, 0) else ""
            total = (
                f" = {entry.total}"
                if entry.total is not None and entry.total != entry.result
                else ""
            )
            lines.append(
                f"{prefix}{roller}{entry.dice}: {entry.result}{bonus}{total} — {entry.message}"
            )
        else:
            actor = f"{entry.actor}: " if entry.actor else ""
            lines.append(f"{prefix}{actor}{entry.message}")
    return lines


def build_combat_log_text(state: EncounterState, footer: str) -> str:
    sections = ["COMBAT LOG", ""]
    sections.append(f"Round {state.round} · final initiative order:")
    sections.extend(format_initiative_order(state))
    sections.append("")
    if state.combat_log:
        sections.append("Events & rolls:")
        sections.extend(format_log_entries(state))
        sections.append("")
    sections.append(footer)
    return "\n".join(sections)


def append_combat_log_to_layout(
    layout: dict | None,
    combat_log_text: str,
    *,
    tab_id: str = "notes-session",
) -> dict:
    return append_text_to_notes_tab(layout, tab_id, combat_log_text)


def distribute_combat_log(session: Session, campaign: Campaign, combat_log_text: str) -> int:
    tab_id, _ = active_notes_tab(campaign)
    members = session.exec(
        select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
    ).all()
    updated = 0
    for member in members:
        character = session.get(Character, member.character_id)
        if character is None:
            continue
        try:
            layout = json.loads(character.layout_json or "{}")
        except (json.JSONDecodeError, TypeError, ValueError):
            layout = {}
        character.layout_json = json.dumps(
            append_combat_log_to_layout(layout, combat_log_text, tab_id=tab_id)
        )
        session.add(character)
        updated += 1
    return updated


def log_hp_changes(before: EncounterState, after: EncounterState) -> None:
    before_by_id = {combatant.id: combatant for combatant in before.combatants}
    for combatant in after.combatants:
        previous = before_by_id.get(combatant.id)
        if previous is None:
            continue
        if previous.hp == combatant.hp:
            continue
        old_label = "?" if previous.hp is None else str(previous.hp)
        new_label = "?" if combatant.hp is None else str(combatant.hp)
        revived = (
            is_enemy(combatant)
            and previous.hp is not None
            and previous.hp <= 0
            and combatant.hp is not None
            and combatant.hp > 0
        )
        defeated = is_defeated_enemy(combatant) and (previous.hp is None or previous.hp > 0)
        if revived:
            message = f"{combatant.name} revived — HP {new_label} (returns to initiative order)"
        elif defeated:
            message = f"{combatant.name} defeated — HP 0 (moved to end of tracker)"
        else:
            message = f"{combatant.name} HP {old_label} → {new_label}"
        append_log(
            after,
            message,
            kind="hp",
            actor=combatant.name,
        )


def latest_combat_log_id(session: Session, campaign_id: int) -> int | None:
    record = session.exec(
        select(HistoricalEncounter)
        .where(HistoricalEncounter.campaign_id == campaign_id)
        .order_by(HistoricalEncounter.id.desc())
    ).first()
    return record.id if record else None


def end_combat(
    session: Session,
    campaign: Campaign,
    state: EncounterState,
    *,
    reason: str,
) -> tuple[EncounterState, int, str, int]:
    """Archive combat, distribute notes, and reset the live encounter."""
    if not state.combatants:
        raise ValueError("no_combat")

    footer = (
        "Party defeated all monsters."
        if reason == "victory"
        else "Combat ended by DM."
    )
    combat_log_text = build_combat_log_text(state, footer)

    defeated = [
        {"name": combatant.name, "hp": combatant.hp}
        for combatant in state.combatants
        if is_enemy(combatant) and not is_alive(combatant)
    ]
    record = HistoricalEncounter(
        campaign_id=campaign.id,
        round_count=state.round,
        combat_log_json=json.dumps([entry.model_dump() for entry in state.combat_log]),
        defeated_monsters_json=json.dumps(defeated),
    )
    session.add(record)
    session.flush()

    party_updated = distribute_combat_log(session, campaign, combat_log_text)

    cleared = EncounterState()
    campaign.encounter_json = cleared.model_dump_json()
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    return cleared, record.id, combat_log_text, party_updated
