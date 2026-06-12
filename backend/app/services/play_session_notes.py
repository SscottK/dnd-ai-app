"""Per play-session notes tabs (one new tab each time the DM starts a session)."""

from __future__ import annotations

import copy
import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db.models import Campaign, CampaignMember, Character
from app.services.campaign_notes import distribute_play_session_tab_to_notes


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def play_session_tab_title(when: datetime | None = None) -> str:
    moment = when or utc_now()
    return f"Session — {moment.strftime('%b')} {moment.day}, {moment.year}"


def new_play_session_tab(when: datetime | None = None) -> tuple[str, str]:
    moment = when or utc_now()
    tab_id = f"notes-play-{int(moment.timestamp())}"
    return tab_id, play_session_tab_title(moment)


def parse_play_session(campaign: Campaign) -> dict:
    try:
        data = json.loads(campaign.play_session_json or "{}")
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}


def active_notes_tab(campaign: Campaign) -> tuple[str, str]:
    data = parse_play_session(campaign)
    tab_id = data.get("notes_tab_id")
    tab_title = data.get("notes_tab_title")
    if tab_id and tab_title:
        return str(tab_id), str(tab_title)
    return "notes-session", "Session"


def play_session_payload(tab_id: str, tab_title: str, *, started_at: datetime | None = None) -> dict:
    moment = started_at or utc_now()
    return {
        "notes_tab_id": tab_id,
        "notes_tab_title": tab_title,
        "started_at": moment.replace(microsecond=0).isoformat(),
    }


def _default_player_notes_widget() -> dict:
    return {
        "id": "player-notes-combat",
        "type": "player_notes",
        "x": 16,
        "y": 16,
        "w": 300,
        "h": 280,
        "pinned": False,
        "minimized": False,
        "playerNotesTabs": [
            {"id": "notes-session", "title": "Session", "content": ""},
            {"id": "notes-log", "title": "Log", "content": ""},
            {"id": "notes-character", "title": "Character", "content": ""},
        ],
        "activeNotesTabId": "notes-session",
    }


def add_play_session_tab_to_layout(
    layout: dict | None,
    tab_id: str,
    tab_title: str,
    *,
    widget_type: str = "player_notes",
    tabs_key: str = "playerNotesTabs",
) -> dict:
    merged = copy.deepcopy(layout) if layout else {"widgets": [], "viewport": {}}
    widgets = list(merged.get("widgets") or [])
    notes_widget = next((widget for widget in widgets if widget.get("type") == widget_type), None)

    if notes_widget is None:
        if widget_type != "player_notes":
            return merged
        notes_widget = _default_player_notes_widget()
        widgets.append(notes_widget)

    tabs = list(notes_widget.get(tabs_key) or [])
    if any(tab.get("id") == tab_id for tab in tabs):
        next_tabs = tabs
    else:
        next_tabs = [{"id": tab_id, "title": tab_title, "content": ""}, *tabs]

    for index, widget in enumerate(widgets):
        if widget.get("type") == widget_type:
            widgets[index] = {
                **widget,
                tabs_key: next_tabs,
                "activeNotesTabId": tab_id,
            }
            break

    merged["widgets"] = widgets
    return merged


def append_text_to_notes_tab(
    layout: dict | None,
    tab_id: str,
    text: str,
    *,
    widget_type: str = "player_notes",
    tabs_key: str = "playerNotesTabs",
    switch_active: bool = True,
) -> dict:
    merged = copy.deepcopy(layout) if layout else {"widgets": [], "viewport": {}}
    widgets = list(merged.get("widgets") or [])
    notes_widget = next((widget for widget in widgets if widget.get("type") == widget_type), None)
    if notes_widget is None:
        notes_widget = _default_player_notes_widget()
        widgets.append(notes_widget)

    tabs = list(notes_widget.get(tabs_key) or [])
    target = next((tab for tab in tabs if tab.get("id") == tab_id), None)
    if target is None:
        target = {"id": tab_id, "title": "Session", "content": ""}
        tabs.insert(0, target)

    existing = str(target.get("content") or "").strip()
    separator = "\n\n---\n\n" if existing else ""
    next_target = {
        **target,
        "content": f"{existing}{separator}{text}" if existing else text,
    }
    next_tabs = [next_target if tab.get("id") == tab_id else tab for tab in tabs]
    if not any(tab.get("id") == tab_id for tab in next_tabs):
        next_tabs.insert(0, next_target)

    prior_active = notes_widget.get("activeNotesTabId")
    for index, widget in enumerate(widgets):
        if widget.get("type") == widget_type:
            widgets[index] = {
                **widget,
                tabs_key: next_tabs,
                "activeNotesTabId": tab_id if switch_active else (prior_active or tab_id),
            }
            break

    merged["widgets"] = widgets
    return merged


def distribute_play_session_tabs(session: Session, campaign: Campaign, tab_id: str, tab_title: str) -> int:
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
            add_play_session_tab_to_layout(layout, tab_id, tab_title)
        )
        session.add(character)
        updated += 1
    updated += distribute_play_session_tab_to_notes(session, campaign, tab_id, tab_title)
    return updated
