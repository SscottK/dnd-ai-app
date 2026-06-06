from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    CampaignCreate,
    CampaignJoin,
    CampaignListResponse,
    CampaignRead,
)
from app.db.models import Campaign, CampaignMember, User
from app.services.invite_codes import generate_invite_code

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def to_campaign_read(campaign: Campaign, owner: User, current_user: User) -> CampaignRead:
    is_owner = campaign.owner_id == current_user.id
    return CampaignRead(
        id=campaign.id,
        name=campaign.name,
        owner_username=owner.username,
        is_owner=is_owner,
        invite_code=campaign.invite_code if is_owner else None,
        created_at=campaign.created_at,
    )


@router.get("", response_model=CampaignListResponse)
def list_campaigns(current_user: CurrentUser, session: SessionDep):
    owned = list(
        session.exec(select(Campaign).where(Campaign.owner_id == current_user.id)).all()
    )

    member_campaign_ids = session.exec(
        select(CampaignMember.campaign_id).where(CampaignMember.user_id == current_user.id)
    ).all()
    joined = []
    if member_campaign_ids:
        joined = list(
            session.exec(
                select(Campaign).where(Campaign.id.in_(member_campaign_ids))
            ).all()
        )

    seen_ids: set[int] = set()
    campaigns: list[CampaignRead] = []

    for campaign in owned + joined:
        if campaign.id is None or campaign.id in seen_ids:
            continue
        seen_ids.add(campaign.id)
        owner = session.get(User, campaign.owner_id)
        if owner is None:
            continue
        campaigns.append(to_campaign_read(campaign, owner, current_user))

    campaigns.sort(key=lambda c: c.created_at, reverse=True)
    return CampaignListResponse(campaigns=campaigns)


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign(data: CampaignCreate, current_user: CurrentUser, session: SessionDep):
    invite_code = generate_invite_code()
    while session.exec(select(Campaign).where(Campaign.invite_code == invite_code)).first():
        invite_code = generate_invite_code()

    campaign = Campaign(
        owner_id=current_user.id,
        name=data.name.strip(),
        invite_code=invite_code,
    )
    session.add(campaign)
    session.commit()
    session.refresh(campaign)

    return to_campaign_read(campaign, current_user, current_user)


@router.post("/join", response_model=CampaignRead)
def join_campaign(data: CampaignJoin, current_user: CurrentUser, session: SessionDep):
    code = data.invite_code.strip().upper()
    campaign = session.exec(select(Campaign).where(Campaign.invite_code == code)).first()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code",
        )

    if campaign.owner_id == current_user.id:
        owner = current_user
        return to_campaign_read(campaign, owner, current_user)

    existing = session.exec(
        select(CampaignMember).where(
            CampaignMember.campaign_id == campaign.id,
            CampaignMember.user_id == current_user.id,
        )
    ).first()
    if existing is None:
        session.add(CampaignMember(campaign_id=campaign.id, user_id=current_user.id))
        session.commit()

    owner = session.get(User, campaign.owner_id)
    if owner is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Campaign owner not found")

    return to_campaign_read(campaign, owner, current_user)
