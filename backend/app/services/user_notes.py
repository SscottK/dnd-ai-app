"""Standalone user notes with optional campaign assignment."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db.models import Campaign, CampaignMember, UserNote


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def list_user_notes(session: Session, user_id: int) -> list[UserNote]:
    return list(
        session.exec(
            select(UserNote)
            .where(UserNote.user_id == user_id)
            .order_by(UserNote.updated_at.desc())
        ).all()
    )


def get_user_note(session: Session, user_id: int, note_id: int) -> UserNote | None:
    note = session.get(UserNote, note_id)
    if note is None or note.user_id != user_id:
        return None
    return note


def user_can_access_campaign(session: Session, user_id: int, campaign_id: int) -> bool:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        return False
    if campaign.owner_id == user_id:
        return True
    membership = session.exec(
        select(CampaignMember).where(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == user_id,
        )
    ).first()
    return membership is not None


def create_user_note(
    session: Session,
    user_id: int,
    *,
    title: str,
    content: str = "",
    campaign_id: int | None = None,
) -> UserNote:
    if campaign_id is not None and not user_can_access_campaign(session, user_id, campaign_id):
        raise ValueError("campaign_access_denied")

    now = utc_now()
    note = UserNote(
        user_id=user_id,
        campaign_id=campaign_id,
        title=title.strip() or "New note",
        content=content,
        created_at=now,
        updated_at=now,
    )
    session.add(note)
    session.flush()
    return note


def update_user_note(
    session: Session,
    user_id: int,
    note_id: int,
    *,
    title: str | None = None,
    content: str | None = None,
    campaign_id: int | None = None,
    assign_campaign: bool = False,
) -> UserNote | None:
    note = get_user_note(session, user_id, note_id)
    if note is None:
        return None

    if title is not None:
        note.title = title.strip() or "New note"
    if content is not None:
        note.content = content
    if assign_campaign:
        if campaign_id is not None and not user_can_access_campaign(session, user_id, campaign_id):
            raise ValueError("campaign_access_denied")
        note.campaign_id = campaign_id

    note.updated_at = utc_now()
    session.add(note)
    session.flush()
    return note


def delete_user_note(session: Session, user_id: int, note_id: int) -> bool:
    note = get_user_note(session, user_id, note_id)
    if note is None:
        return False
    session.delete(note)
    session.flush()
    return True
