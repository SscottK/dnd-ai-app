from fastapi import APIRouter, Query
from sqlmodel import Session

from app.api.deps import AdminUser, SessionDep
from app.db.models import User
from app.api.schemas import (
    AccessRequestActionResponse,
    AccessRequestRead,
    AccessRequestSummaryResponse,
)
from app.services.access_requests import (
    approve_access_request,
    count_access_requests,
    list_access_requests,
    reject_access_request,
)

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
    return AccessRequestSummaryResponse(pending_count=count_access_requests(session))


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
