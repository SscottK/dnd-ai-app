import logging
import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.core.config import settings
from app.db.session import engine
from app.db.url import BACKEND_DIR, normalize_database_url

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    """Apply Alembic migrations up to head."""
    database_url = normalize_database_url(settings.database_url)
    backend_dir = Path(BACKEND_DIR)
    backend_str = str(backend_dir)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)

    original_cwd = os.getcwd()
    try:
        os.chdir(backend_str)
        alembic_cfg = Config(str(backend_dir / "alembic.ini"))
        alembic_cfg.set_main_option("sqlalchemy.url", database_url)

        inspector = inspect(engine)
        has_user = inspector.has_table("user")
        current_rev = None
        if inspector.has_table("alembic_version"):
            with engine.connect() as conn:
                row = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                current_rev = row[0] if row else None

        if has_user and not current_rev:
            logger.warning(
                "Existing database without Alembic history; stamping revision 009 before upgrade"
            )
            command.stamp(alembic_cfg, "009")

        logger.info("Running database migrations")
        command.upgrade(alembic_cfg, "head")
    finally:
        os.chdir(original_cwd)
