from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    AllNotesResponse,
    CampaignNotesDocument,
    CampaignNotesSummary,
    CampaignNotesUpdate,
    NoteCampaignOption,
    NoteTab,
    NoteTabCreate,
    UserNoteCreate,
    UserNoteRead,
    UserNoteUpdate,
    UserNotesPageResponse,
)
from app.db.models import Campaign, CampaignMember, UserCampaignNotes, UserNote
from app.services.campaign_membership import get_campaign_for_member_or_owner
from app.services.campaign_notes import (
    default_notes_document,
    get_or_create_user_notes,
    get_user_campaign_notes,
    list_user_notes_by_campaign,
    parse_notes_document,
    save_notes_document,
    utc_now,
)
from app.services.user_notes import (
    create_user_note,
    delete_user_note,
    list_user_notes,
    update_user_note,
)

router = APIRouter()


def _tabs_from_doc(doc: dict) -> tuple[list[NoteTab], list[NoteTab], str | None]:
    tabs = [
        NoteTab(
            id=str(tab.get("id") or ""),
            title=str(tab.get("title") or "Notes"),
            content=str(tab.get("content") or ""),
            archived=False,
        )
        for tab in doc.get("tabs") or []
        if isinstance(tab, dict) and tab.get("id")
    ]
    closed = [
        NoteTab(
            id=str(tab.get("id") or ""),
            title=str(tab.get("title") or "Notes"),
            content=str(tab.get("content") or ""),
            archived=True,
        )
        for tab in doc.get("closedTabs") or []
        if isinstance(tab, dict) and tab.get("id")
    ]
    active = doc.get("activeTabId")
    return tabs, closed, str(active) if active else None


def _doc_from_update(data: CampaignNotesUpdate) -> dict:
    return {
        "tabs": [tab.model_dump(exclude={"archived"}) for tab in data.tabs],
        "closedTabs": [tab.model_dump(exclude={"archived"}) for tab in data.closed_tabs],
        "activeTabId": data.active_tab_id,
    }


def _accessible_campaigns(session: SessionDep, user_id: int) -> list[Campaign]:
    memberships = session.exec(
        select(CampaignMember).where(CampaignMember.user_id == user_id)
    ).all()
    owned = session.exec(select(Campaign).where(Campaign.owner_id == user_id)).all()
    campaigns: dict[int, Campaign] = {
        campaign.id: campaign for campaign in owned if campaign.id is not None
    }
    for membership in memberships:
        campaign = session.get(Campaign, membership.campaign_id)
        if campaign and campaign.id is not None:
            campaigns[campaign.id] = campaign
    return sorted(campaigns.values(), key=lambda campaign: campaign.name.lower())


def _note_to_read(session: SessionDep, note: UserNote) -> UserNoteRead:
    campaign_name = None
    if note.campaign_id is not None:
        campaign = session.get(Campaign, note.campaign_id)
        campaign_name = campaign.name if campaign else None
    return UserNoteRead(
        id=note.id,
        title=note.title,
        content=note.content,
        campaign_id=note.campaign_id,
        campaign_name=campaign_name,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _summary_from_row(row: dict) -> CampaignNotesSummary:
    return CampaignNotesSummary(
        campaign_id=row["campaign_id"],
        campaign_name=row["campaign_name"],
        tabs=[NoteTab.model_validate(tab) for tab in row["tabs"]],
        closed_tabs=[NoteTab.model_validate(tab) for tab in row["closed_tabs"]],
        active_tab_id=row.get("active_tab_id"),
        updated_at=row["updated_at"],
    )


@router.get("", response_model=AllNotesResponse)
def list_all_notes(current_user: CurrentUser, session: SessionDep):
    rows = list_user_notes_by_campaign(session, current_user.id)
    session.commit()
    return AllNotesResponse(campaigns=[_summary_from_row(row) for row in rows])


@router.get("/entries", response_model=UserNotesPageResponse)
def list_user_note_entries(current_user: CurrentUser, session: SessionDep):
    notes = list_user_notes(session, current_user.id)
    campaigns = _accessible_campaigns(session, current_user.id)
    session.commit()
    return UserNotesPageResponse(
        notes=[_note_to_read(session, note) for note in notes],
        campaigns=[NoteCampaignOption(id=campaign.id, name=campaign.name) for campaign in campaigns],
    )


@router.post("/entries", response_model=UserNoteRead, status_code=status.HTTP_201_CREATED)
def create_user_note_entry(
    data: UserNoteCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        note = create_user_note(
            session,
            current_user.id,
            title=data.title,
            content=data.content,
            campaign_id=data.campaign_id,
        )
    except ValueError as exc:
        if str(exc) == "campaign_access_denied":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to that campaign",
            ) from exc
        raise
    session.commit()
    session.refresh(note)
    return _note_to_read(session, note)


@router.patch("/entries/{note_id}", response_model=UserNoteRead)
def update_user_note_entry(
    note_id: int,
    data: UserNoteUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    updates = data.model_dump(exclude_unset=True)
    try:
        note = update_user_note(
            session,
            current_user.id,
            note_id,
            title=updates.get("title"),
            content=updates.get("content"),
            campaign_id=updates.get("campaign_id"),
            assign_campaign="campaign_id" in updates,
        )
    except ValueError as exc:
        if str(exc) == "campaign_access_denied":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to that campaign",
            ) from exc
        raise
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    session.commit()
    session.refresh(note)
    return _note_to_read(session, note)


@router.delete("/entries/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_note_entry(note_id: int, current_user: CurrentUser, session: SessionDep):
    deleted = delete_user_note(session, current_user.id, note_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    session.commit()


@router.get("/campaigns/{campaign_id}", response_model=CampaignNotesDocument)
def get_campaign_notes(campaign_id: int, current_user: CurrentUser, session: SessionDep):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    doc = get_or_create_user_notes(session, current_user.id, campaign_id, migrate=True)
    session.commit()
    tabs, closed, active = _tabs_from_doc(doc)
    return CampaignNotesDocument(tabs=tabs, closed_tabs=closed, active_tab_id=active)


@router.put("/campaigns/{campaign_id}", response_model=CampaignNotesDocument)
def save_campaign_notes(
    campaign_id: int,
    data: CampaignNotesUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    doc = _doc_from_update(data)
    save_notes_document(session, current_user.id, campaign_id, doc)
    session.commit()
    tabs, closed, active = _tabs_from_doc(doc)
    return CampaignNotesDocument(tabs=tabs, closed_tabs=closed, active_tab_id=active)


@router.post("/campaigns/{campaign_id}/tabs", response_model=CampaignNotesDocument)
def create_campaign_note_tab(
    campaign_id: int,
    data: NoteTabCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    doc = get_or_create_user_notes(session, current_user.id, campaign_id, migrate=True)
    tab_id = f"notes-{int(utc_now().timestamp() * 1000)}"
    tabs = list(doc.get("tabs") or [])
    tabs.append({"id": tab_id, "title": data.title.strip() or "New tab", "content": data.content})
    doc["tabs"] = tabs
    doc["activeTabId"] = tab_id
    save_notes_document(session, current_user.id, campaign_id, doc)
    session.commit()
    tabs_out, closed, active = _tabs_from_doc(doc)
    return CampaignNotesDocument(tabs=tabs_out, closed_tabs=closed, active_tab_id=active)


@router.delete("/campaigns/{campaign_id}/tabs/{tab_id}", response_model=CampaignNotesDocument)
def delete_campaign_note_tab(
    campaign_id: int,
    tab_id: str,
    current_user: CurrentUser,
    session: SessionDep,
):
    get_campaign_for_member_or_owner(campaign_id, current_user, session)
    record = get_user_campaign_notes(session, current_user.id, campaign_id)
    doc = parse_notes_document(record.notes_json if record else None)
    next_tabs = [tab for tab in doc.get("tabs") or [] if tab.get("id") != tab_id]
    next_closed = [tab for tab in doc.get("closedTabs") or [] if tab.get("id") != tab_id]
    if len(next_tabs) == len(doc.get("tabs") or []) and len(next_closed) == len(
        doc.get("closedTabs") or []
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note tab not found")

    doc["tabs"] = next_tabs
    doc["closedTabs"] = next_closed
    if doc.get("activeTabId") == tab_id:
        doc["activeTabId"] = next_tabs[0]["id"] if next_tabs else None
    if not next_tabs and not next_closed:
        doc = default_notes_document()

    save_notes_document(session, current_user.id, campaign_id, doc)
    session.commit()
    tabs_out, closed, active = _tabs_from_doc(doc)
    return CampaignNotesDocument(tabs=tabs_out, closed_tabs=closed, active_tab_id=active)
