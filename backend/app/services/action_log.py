"""Out-of-combat action log for live sessions."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.api.schemas import ActionLogEntry
from app.db.models import Campaign, CampaignMember, Character, SessionActionLog
from app.services.campaign_notes import distribute_text_to_campaign_notes
from app.services.play_session_notes import (
    active_logs_tab,
    append_text_to_notes_tab,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_action_log(campaign: Campaign) -> list[ActionLogEntry]:
    try:
        raw = json.loads(campaign.action_log_json or "[]")
        if not isinstance(raw, list):
            return []
        return [ActionLogEntry.model_validate(entry) for entry in raw]
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def persist_action_log(campaign: Campaign, entries: list[ActionLogEntry]) -> None:
    campaign.action_log_json = json.dumps([entry.model_dump() for entry in entries])


def append_action_log(campaign: Campaign, entry: ActionLogEntry) -> None:
    entries = parse_action_log(campaign)
    entries.append(entry)
    persist_action_log(campaign, entries)


def clear_action_log(campaign: Campaign) -> None:
    campaign.action_log_json = "[]"


def format_action_log_entries(entries: list[ActionLogEntry]) -> list[str]:
    lines: list[str] = []
    for entry in entries:
        stamp = entry.at[:16].replace("T", " ") if entry.at else ""
        prefix = f"[{stamp}] " if stamp else ""
        who = entry.character_name or entry.roller_name
        if entry.kind == "roll" and entry.total is not None:
            roller = f"{who}: " if who else ""
            lines.append(f"{prefix}{roller}{entry.message}")
        else:
            actor = f"{who}: " if who else ""
            lines.append(f"{prefix}{actor}{entry.message}")
    return lines


def build_action_log_text(entries: list[ActionLogEntry]) -> str:
    if not entries:
        return ""
    sections = ["ACTION LOG", ""]
    sections.extend(format_action_log_entries(entries))
    return "\n".join(sections)


def distribute_action_log_to_player_notes(
    session: Session, campaign: Campaign, action_log_text: str
) -> int:
    tab_id, tab_title = active_logs_tab(campaign)
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
            append_text_to_notes_tab(
                layout,
                tab_id,
                action_log_text,
                tab_title=tab_title,
                switch_active=False,
            )
        )
        session.add(character)
        updated += 1
    updated += distribute_text_to_campaign_notes(
        session,
        campaign,
        tab_id,
        action_log_text,
        tab_title=tab_title,
        switch_active=False,
    )
    return updated


def distribute_action_log_entry(
    session: Session, campaign: Campaign, entry: ActionLogEntry
) -> int:
    """Append a single action-log line to the active session logs tab."""
    if not campaign.session_active:
        return 0
    lines = format_action_log_entries([entry])
    if not lines:
        return 0
    text = lines[0]
    tab_id, tab_title = active_logs_tab(campaign)
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
            append_text_to_notes_tab(
                layout,
                tab_id,
                text,
                tab_title=tab_title,
                switch_active=False,
            )
        )
        session.add(character)
        updated += 1
    updated += distribute_text_to_campaign_notes(
        session,
        campaign,
        tab_id,
        text,
        tab_title=tab_title,
        switch_active=False,
    )
    return updated


def archive_session_action_log(
    session: Session, campaign: Campaign, action_log_text: str
) -> SessionActionLog | None:
    if not action_log_text.strip():
        return None
    record = SessionActionLog(
        campaign_id=campaign.id,
        formatted_log_text=action_log_text,
        entry_count=len(parse_action_log(campaign)),
    )
    session.add(record)
    session.flush()
    return record


def latest_action_log_id(session: Session, campaign_id: int) -> int | None:
    record = session.exec(
        select(SessionActionLog)
        .where(SessionActionLog.campaign_id == campaign_id)
        .order_by(SessionActionLog.id.desc())
    ).first()
    return record.id if record else None


def latest_formatted_action_log(session: Session, campaign_id: int) -> tuple[int, str] | None:
    record = session.exec(
        select(SessionActionLog)
        .where(SessionActionLog.campaign_id == campaign_id)
        .order_by(SessionActionLog.id.desc())
    ).first()
    if record is None or record.id is None:
        return None
    text = (getattr(record, "formatted_log_text", None) or "").strip()
    if not text:
        return None
    return record.id, text


def finalize_session_action_log(session: Session, campaign: Campaign) -> tuple[int | None, str, int]:
    """Archive and clear the live action log (entries already on session logs tab)."""
    entries = parse_action_log(campaign)
    action_log_text = build_action_log_text(entries)
    if not action_log_text:
        clear_action_log(campaign)
        return None, "", 0

    record = archive_session_action_log(session, campaign, action_log_text)
    clear_action_log(campaign)
    session.add(campaign)
    return record.id if record else None, action_log_text, 0
