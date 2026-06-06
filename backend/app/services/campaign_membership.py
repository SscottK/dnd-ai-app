from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.db.models import Campaign, CampaignMember, Character, User


def get_owned_campaign(campaign_id: int, session: Session) -> Campaign:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


def get_joinable_character(
    character_id: int,
    user: User,
    session: Session,
) -> Character:
    character = session.get(Character, character_id)
    if character is None or character.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found",
        )
    if character.campaign_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This character is already assigned to a campaign",
        )
    return character


def release_member(session: Session, member: CampaignMember) -> None:
    character = session.get(Character, member.character_id)
    if character is not None:
        character.campaign_id = None
        session.add(character)
    session.delete(member)


def get_campaign_member_for_user(
    campaign_id: int,
    user_id: int,
    session: Session,
) -> CampaignMember | None:
    return session.exec(
        select(CampaignMember).where(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == user_id,
        )
    ).first()


def get_campaign_for_member_or_owner(
    campaign_id: int,
    user: User,
    session: Session,
) -> tuple[Campaign, bool]:
    campaign = get_owned_campaign(campaign_id, session)
    is_owner = campaign.owner_id == user.id
    if not is_owner and get_campaign_member_for_user(campaign_id, user.id, session) is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this campaign",
        )
    return campaign, is_owner
