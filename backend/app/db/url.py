from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def normalize_database_url(url: str) -> str:
    """Normalize DATABASE_URL for SQLAlchemy across local SQLite and Render Postgres."""
    if not url:
        return url

    # Render and Heroku use postgres://; SQLAlchemy expects postgresql://
    if url.startswith("postgres://"):
        url = f"postgresql://{url.removeprefix('postgres://')}"

    if not url.startswith("sqlite:///"):
        return url

    db_path = url.removeprefix("sqlite:///")
    if db_path == ":memory:":
        return url

    path = Path(db_path)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()

    return f"sqlite:///{path}"
