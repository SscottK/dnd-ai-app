import logging

from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import User
from app.db.session import engine

logger = logging.getLogger("app.bootstrap")


def bootstrap_admin_user() -> None:
    if not settings.bootstrap_admin_username or not settings.bootstrap_admin_password:
        return

    with Session(engine) as session:
        existing_users = session.exec(select(User)).first()
        if existing_users is not None:
            return

        admin = User(
            username=settings.bootstrap_admin_username.lower(),
            password_hash=hash_password(settings.bootstrap_admin_password),
        )
        session.add(admin)
        session.commit()
        logger.info("Bootstrap account created for %s", settings.bootstrap_admin_username)
