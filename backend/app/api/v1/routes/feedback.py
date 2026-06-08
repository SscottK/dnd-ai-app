from fastapi import APIRouter, status

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import FeedbackCreate, FeedbackRead
from app.db.models import User
from app.services.feedback import create_feedback

router = APIRouter(prefix="/feedback", tags=["feedback"])


def to_feedback_read(entry, session_user: User | None = None, *, reviewer_username: str | None = None) -> FeedbackRead:
    username = session_user.username if session_user else "unknown"
    return FeedbackRead(
        id=entry.id,
        username=username,
        message=entry.message,
        page_url=entry.page_url,
        status=entry.status,
        created_at=entry.created_at,
        reviewed_at=entry.reviewed_at,
        reviewed_by_username=reviewer_username,
    )


@router.post("", response_model=FeedbackRead, status_code=status.HTTP_201_CREATED)
def submit_feedback(data: FeedbackCreate, session: SessionDep, user: CurrentUser):
    entry = create_feedback(
        session,
        user=user,
        message=data.message,
        page_url=data.page_url,
    )
    return to_feedback_read(entry, user)
