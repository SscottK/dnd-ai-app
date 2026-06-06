from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.db import models  # noqa: F401

connect_args: dict = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    echo=settings.sql_echo,
    connect_args=connect_args,
    pool_pre_ping=not settings.database_url.startswith("sqlite"),
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
