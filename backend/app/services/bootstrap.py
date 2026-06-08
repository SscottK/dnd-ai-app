import logging

from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import User
from app.db.session import engine

logger = logging.getLogger("app.bootstrap")


def bootstrap_admin_user() -> None:
    if not settings.bootstrap_admin_username:
        return

    username = settings.bootstrap_admin_username.lower()

    with Session(engine) as session:
        existing_users = session.exec(select(User)).first()
        if existing_users is None:
            if not settings.bootstrap_admin_password:
                logger.warning(
                    "Skipping bootstrap account creation — set BOOTSTRAP_ADMIN_PASSWORD for first deploy"
                )
                return

            admin = User(
                username=username,
                password_hash=hash_password(settings.bootstrap_admin_password),
                is_admin=True,
            )
            session.add(admin)
            session.commit()
            logger.info("Bootstrap admin account created for %s", settings.bootstrap_admin_username)
            return

        admin = session.exec(select(User).where(User.username == username)).first()
        if admin is not None and not admin.is_admin:
            admin.is_admin = True
            session.add(admin)
            session.commit()
            logger.info("Promoted %s to admin", settings.bootstrap_admin_username)
