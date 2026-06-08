from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import AdminUser, SessionDep
from app.db.models import User
from app.api.schemas import (
    AccessRequestActionResponse,
    AccessRequestRead,
    AccessRequestSummaryResponse,
    FeedbackActionResponse,
    FeedbackRead,
)
from app.services.access_requests import (
    approve_access_request,
    count_access_requests,
    list_access_requests,
    reject_access_request,
)
from app.services.feedback import count_feedback, list_feedback, mark_feedback_reviewed

router = APIRouter(prefix="/admin", tags=["admin"])


def to_access_request_read(request, session: Session) -> AccessRequestRead:
    reviewed_by_username = None
    if request.reviewed_by_id:
        reviewer = session.get(User, request.reviewed_by_id)
        if reviewer:
            reviewed_by_username = reviewer.username

    return AccessRequestRead(
        id=request.id,
        username=request.username,
        message=request.message,
        status=request.status,
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
        reviewed_by_username=reviewed_by_username,
    )


@router.get("/access-requests/summary", response_model=AccessRequestSummaryResponse)
def get_access_requests_summary(session: SessionDep, _admin: AdminUser):
    access_pending = count_access_requests(session)
    feedback_pending = count_feedback(session)
    return AccessRequestSummaryResponse(
        access_pending_count=access_pending,
        feedback_pending_count=feedback_pending,
        pending_count=access_pending + feedback_pending,
    )


def to_feedback_read(entry, session: Session) -> FeedbackRead:
    user = session.get(User, entry.user_id)
    reviewed_by_username = None
    if entry.reviewed_by_id:
        reviewer = session.get(User, entry.reviewed_by_id)
        if reviewer:
            reviewed_by_username = reviewer.username

    return FeedbackRead(
        id=entry.id,
        username=user.username if user else "unknown",
        message=entry.message,
        page_url=entry.page_url,
        status=entry.status,
        created_at=entry.created_at,
        reviewed_at=entry.reviewed_at,
        reviewed_by_username=reviewed_by_username,
    )


@router.get("/feedback", response_model=list[FeedbackRead])
def get_feedback(
    session: SessionDep,
    _admin: AdminUser,
    status_filter: str | None = Query(default="pending"),
):
    items = list_feedback(session, status_filter=status_filter or None)
    return [to_feedback_read(item, session) for item in items]


@router.post("/feedback/{feedback_id}/review", response_model=FeedbackActionResponse)
def review_feedback(feedback_id: int, session: SessionDep, admin: AdminUser):
    try:
        entry = mark_feedback_reviewed(session, feedback_id=feedback_id, reviewer=admin)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FeedbackActionResponse(
        feedback=to_feedback_read(entry, session),
        message="Feedback marked as reviewed",
    )


@router.get("/access-requests", response_model=list[AccessRequestRead])
def get_access_requests(
    session: SessionDep,
    _admin: AdminUser,
    status_filter: str | None = Query(default="pending"),
):
    requests = list_access_requests(session, status_filter=status_filter or None)
    return [to_access_request_read(item, session) for item in requests]


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestActionResponse)
def approve_request(request_id: int, session: SessionDep, admin: AdminUser):
    user, request = approve_access_request(session, request_id=request_id, reviewer=admin)
    return AccessRequestActionResponse(
        request=to_access_request_read(request, session),
        message=f"Approved — {user.username} can sign in now",
    )


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestActionResponse)
def reject_request(request_id: int, session: SessionDep, admin: AdminUser):
    request = reject_access_request(session, request_id=request_id, reviewer=admin)
    return AccessRequestActionResponse(
        request=to_access_request_read(request, session),
        message=f"Rejected access request for {request.username}",
    )
