"""Server-backed campaign notes (tabs + archive) per user."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db.models import Campaign, CampaignMember, Character, UserCampaignNotes


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def default_notes_document() -> dict:
    return {
        "tabs": [
            {"id": "notes-session", "title": "Session", "content": ""},
            {"id": "notes-character", "title": "Character", "content": ""},
        ],
        "closedTabs": [],
        "activeTabId": "notes-session",
    }


def parse_notes_document(raw: str | None) -> dict:
    try:
        data = json.loads(raw or "{}")
        if not isinstance(data, dict):
            return default_notes_document()
    except (json.JSONDecodeError, TypeError, ValueError):
        return default_notes_document()

    tabs = data.get("tabs")
    closed = data.get("closedTabs")
    active = data.get("activeTabId")
    doc = default_notes_document()
    if isinstance(tabs, list) and tabs:
        doc["tabs"] = tabs
    if isinstance(closed, list):
        doc["closedTabs"] = closed
    if active:
        doc["activeTabId"] = str(active)
    return doc


def serialize_notes_document(doc: dict) -> str:
    return json.dumps(doc)


def get_user_campaign_notes(
    session: Session, user_id: int, campaign_id: int
) -> UserCampaignNotes | None:
    return session.exec(
        select(UserCampaignNotes).where(
            UserCampaignNotes.user_id == user_id,
            UserCampaignNotes.campaign_id == campaign_id,
        )
    ).first()


def save_notes_document(
    session: Session, user_id: int, campaign_id: int, doc: dict
) -> UserCampaignNotes:
    record = get_user_campaign_notes(session, user_id, campaign_id)
    payload = serialize_notes_document(doc)
    if record is None:
        record = UserCampaignNotes(
            user_id=user_id,
            campaign_id=campaign_id,
            notes_json=payload,
            updated_at=utc_now(),
        )
    else:
        record.notes_json = payload
        record.updated_at = utc_now()
    session.add(record)
    session.flush()
    return record


def _extract_player_notes_from_layout(layout: dict | None) -> dict | None:
    if not layout:
        return None
    widget = next(
        (item for item in layout.get("widgets") or [] if item.get("type") == "player_notes"),
        None,
    )
    if not widget:
        return None
    tabs = widget.get("playerNotesTabs")
    if not isinstance(tabs, list) or not tabs:
        return None
    return {
        "tabs": tabs,
        "closedTabs": list(widget.get("closedNotesTabs") or []),
        "activeTabId": widget.get("activeNotesTabId") or tabs[0].get("id"),
    }


def migrate_player_notes_from_character(
    session: Session, user_id: int, campaign_id: int
) -> UserCampaignNotes | None:
    membership = session.exec(
        select(CampaignMember).where(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == user_id,
        )
    ).first()
    if membership is None:
        return None
    character = session.get(Character, membership.character_id)
    if character is None:
        return None
    try:
        layout = json.loads(character.layout_json or "{}")
    except (json.JSONDecodeError, TypeError, ValueError):
        layout = {}
    doc = _extract_player_notes_from_layout(layout)
    if doc is None:
        return None
    return save_notes_document(session, user_id, campaign_id, doc)


def get_or_create_user_notes(
    session: Session, user_id: int, campaign_id: int, *, migrate: bool = True
) -> dict:
    record = get_user_campaign_notes(session, user_id, campaign_id)
    if record is not None:
        return parse_notes_document(record.notes_json)

    if migrate:
        migrated = migrate_player_notes_from_character(session, user_id, campaign_id)
        if migrated is not None:
            return parse_notes_document(migrated.notes_json)

    doc = default_notes_document()
    save_notes_document(session, user_id, campaign_id, doc)
    return doc


def append_text_to_notes_doc(
    doc: dict, tab_id: str, text: str, *, tab_title: str = "Session"
) -> dict:
    merged = dict(doc)
    tabs = list(merged.get("tabs") or [])
    target = next((tab for tab in tabs if tab.get("id") == tab_id), None)
    if target is None:
        target = {"id": tab_id, "title": tab_title, "content": ""}
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

    merged["tabs"] = next_tabs
    merged["activeTabId"] = tab_id
    return merged


def add_play_session_tab_to_doc(doc: dict, tab_id: str, tab_title: str) -> dict:
    merged = dict(doc)
    tabs = list(merged.get("tabs") or [])
    if any(tab.get("id") == tab_id for tab in tabs):
        merged["activeTabId"] = tab_id
        return merged
    merged["tabs"] = [{"id": tab_id, "title": tab_title, "content": ""}, *tabs]
    merged["activeTabId"] = tab_id
    return merged


def campaign_participant_user_ids(session: Session, campaign: Campaign) -> list[int]:
    user_ids = {campaign.owner_id}
    members = session.exec(
        select(CampaignMember).where(CampaignMember.campaign_id == campaign.id)
    ).all()
    for member in members:
        user_ids.add(member.user_id)
    return sorted(user_ids)


def distribute_text_to_campaign_notes(
    session: Session,
    campaign: Campaign,
    tab_id: str,
    text: str,
    *,
    tab_title: str = "Session",
) -> int:
    updated = 0
    for user_id in campaign_participant_user_ids(session, campaign):
        doc = get_or_create_user_notes(session, user_id, campaign.id, migrate=True)
        next_doc = append_text_to_notes_doc(doc, tab_id, text, tab_title=tab_title)
        save_notes_document(session, user_id, campaign.id, next_doc)
        updated += 1
    return updated


def distribute_play_session_tab_to_notes(
    session: Session, campaign: Campaign, tab_id: str, tab_title: str
) -> int:
    updated = 0
    for user_id in campaign_participant_user_ids(session, campaign):
        doc = get_or_create_user_notes(session, user_id, campaign.id, migrate=True)
        next_doc = add_play_session_tab_to_doc(doc, tab_id, tab_title)
        save_notes_document(session, user_id, campaign.id, next_doc)
        updated += 1
    return updated


def list_user_notes_by_campaign(session: Session, user_id: int) -> list[dict]:
    memberships = session.exec(
        select(CampaignMember).where(CampaignMember.user_id == user_id)
    ).all()
    owned = session.exec(select(Campaign).where(Campaign.owner_id == user_id)).all()

    campaign_ids: dict[int, Campaign] = {campaign.id: campaign for campaign in owned if campaign.id}
    for membership in memberships:
        campaign = session.get(Campaign, membership.campaign_id)
        if campaign and campaign.id:
            campaign_ids[campaign.id] = campaign

    summaries: list[dict] = []
    for campaign_id, campaign in sorted(campaign_ids.items(), key=lambda item: item[1].name.lower()):
        doc = get_or_create_user_notes(session, user_id, campaign_id, migrate=True)
        tabs = [
            {**tab, "archived": False}
            for tab in doc.get("tabs") or []
            if isinstance(tab, dict)
        ]
        closed = [
            {**tab, "archived": True}
            for tab in doc.get("closedTabs") or []
            if isinstance(tab, dict)
        ]
        record = get_user_campaign_notes(session, user_id, campaign_id)
        summaries.append(
            {
                "campaign_id": campaign_id,
                "campaign_name": campaign.name,
                "tabs": tabs,
                "closed_tabs": closed,
                "active_tab_id": doc.get("activeTabId"),
                "updated_at": record.updated_at if record else utc_now(),
            }
        )
    return summaries
