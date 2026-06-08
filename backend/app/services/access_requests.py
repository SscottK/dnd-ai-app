from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.db.models import AccessRequest, User


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_request(
    session: Session,
    *,
    username: str,
    password_hash: str,
    message: str = "",
) -> AccessRequest:
    normalized = username.lower()
    existing_user = session.exec(select(User).where(User.username == normalized)).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already registered",
        )

    pending = session.exec(
        select(AccessRequest).where(
            AccessRequest.username == normalized,
            AccessRequest.status == "pending",
        )
    ).first()
    if pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An access request for that username is already pending",
        )

    request = AccessRequest(
        username=normalized,
        password_hash=password_hash,
        message=message.strip(),
        status="pending",
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


def count_access_requests(session: Session, *, status_filter: str = "pending") -> int:
    statement = select(func.count()).select_from(AccessRequest).where(AccessRequest.status == status_filter)
    return int(session.exec(statement).one())


def list_access_requests(session: Session, *, status_filter: str | None = "pending") -> list[AccessRequest]:
    if status_filter == "reviewed":
        query = (
            select(AccessRequest)
            .where(AccessRequest.status.in_(("approved", "rejected")))
            .order_by(AccessRequest.reviewed_at.desc())
        )
    else:
        query = select(AccessRequest).order_by(AccessRequest.created_at.desc())
        if status_filter:
            query = query.where(AccessRequest.status == status_filter)
    return list(session.exec(query).all())


def approve_access_request(session: Session, *, request_id: int, reviewer: User) -> tuple[User, AccessRequest]:
    request = session.get(AccessRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")
    if request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request is already {request.status}",
        )

    existing_user = session.exec(select(User).where(User.username == request.username)).first()
    if existing_user:
        request.status = "rejected"
        request.reviewed_at = utc_now()
        request.reviewed_by_id = reviewer.id
        session.add(request)
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already registered",
        )

    user = User(
        username=request.username,
        password_hash=request.password_hash,
        is_admin=False,
    )
    session.add(user)

    request.status = "approved"
    request.reviewed_at = utc_now()
    request.reviewed_by_id = reviewer.id
    session.add(request)
    session.commit()
    session.refresh(user)
    session.refresh(request)
    return user, request


def reject_access_request(session: Session, *, request_id: int, reviewer: User) -> AccessRequest:
    request = session.get(AccessRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")
    if request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Request is already {request.status}",
        )

    request.status = "rejected"
    request.reviewed_at = utc_now()
    request.reviewed_by_id = reviewer.id
    session.add(request)
    session.commit()
    session.refresh(request)
    return request
