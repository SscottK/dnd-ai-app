from fastapi import APIRouter, Query

from app.api.deps import AdminUser, SessionDep
from app.api.schemas import AccessRequestActionResponse, AccessRequestRead
from app.services.access_requests import (
    approve_access_request,
    list_access_requests,
    reject_access_request,
)

router = APIRouter(prefix="/admin", tags=["admin"])


def to_access_request_read(request) -> AccessRequestRead:
    return AccessRequestRead(
        id=request.id,
        username=request.username,
        message=request.message,
        status=request.status,
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
    )


@router.get("/access-requests", response_model=list[AccessRequestRead])
def get_access_requests(
    session: SessionDep,
    _admin: AdminUser,
    status_filter: str | None = Query(default="pending"),
):
    requests = list_access_requests(session, status_filter=status_filter or None)
    return [to_access_request_read(item) for item in requests]


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestActionResponse)
def approve_request(request_id: int, session: SessionDep, admin: AdminUser):
    user, request = approve_access_request(session, request_id=request_id, reviewer=admin)
    return AccessRequestActionResponse(
        request=to_access_request_read(request),
        message=f"Approved — {user.username} can sign in now",
    )


@router.post("/access-requests/{request_id}/reject", response_model=AccessRequestActionResponse)
def reject_request(request_id: int, session: SessionDep, admin: AdminUser):
    request = reject_access_request(session, request_id=request_id, reviewer=admin)
    return AccessRequestActionResponse(
        request=to_access_request_read(request),
        message=f"Rejected access request for {request.username}",
    )
