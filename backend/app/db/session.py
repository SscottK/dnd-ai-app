from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.db import models  # noqa: F401

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def resolve_database_url(url: str) -> str:
    if not url.startswith("sqlite:///"):
        return url

    db_path = url.removeprefix("sqlite:///")
    if db_path == ":memory:":
        return url

    path = Path(db_path)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()

    return f"sqlite:///{path}"


database_url = resolve_database_url(settings.database_url)

connect_args: dict = {}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    database_url,
    echo=settings.sql_echo,
    connect_args=connect_args,
    pool_pre_ping=not database_url.startswith("sqlite"),
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
