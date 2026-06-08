from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.db import models  # noqa: F401
from app.db.url import normalize_database_url

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

database_url = normalize_database_url(settings.database_url)

connect_args: dict = {}
engine_kwargs: dict = {
    "echo": settings.sql_echo,
    "pool_pre_ping": True,
}

if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine_kwargs["connect_args"] = connect_args
else:
    engine_kwargs.update(
        {
            "pool_size": 5,
            "max_overflow": 10,
        }
    )

engine = create_engine(database_url, **engine_kwargs)


def create_db_and_tables() -> None:
    """Legacy helper for tests; production uses Alembic migrations."""
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
