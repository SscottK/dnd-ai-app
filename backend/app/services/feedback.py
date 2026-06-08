from sqlmodel import Session, func, select

from app.db.models import Feedback, User, utc_now


def create_feedback(
    session: Session,
    *,
    user: User,
    message: str,
    page_url: str = "",
) -> Feedback:
    entry = Feedback(
        user_id=user.id,
        message=message.strip(),
        page_url=(page_url or "").strip()[:500],
        status="pending",
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


def count_feedback(session: Session, *, status_filter: str = "pending") -> int:
    statement = select(func.count()).select_from(Feedback).where(Feedback.status == status_filter)
    return int(session.exec(statement).one())


def list_feedback(session: Session, *, status_filter: str | None = "pending") -> list[Feedback]:
    if status_filter == "reviewed":
        query = (
            select(Feedback)
            .where(Feedback.status == "reviewed")
            .order_by(Feedback.reviewed_at.desc())
        )
    else:
        query = select(Feedback).order_by(Feedback.created_at.desc())
        if status_filter:
            query = query.where(Feedback.status == status_filter)
    return list(session.exec(query).all())


def mark_feedback_reviewed(session: Session, *, feedback_id: int, reviewer: User) -> Feedback:
    entry = session.get(Feedback, feedback_id)
    if entry is None:
        raise ValueError("Feedback not found")
    if entry.status != "pending":
        raise ValueError("Feedback already reviewed")

    entry.status = "reviewed"
    entry.reviewed_at = utc_now()
    entry.reviewed_by_id = reviewer.id
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry
