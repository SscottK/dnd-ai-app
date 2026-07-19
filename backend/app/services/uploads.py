"""Persistent uploads directory (PDFs, portraits).

On Render with a disk at /var/data, files live under /var/data/uploads so they
survive redeploys. Locally defaults to backend/uploads/.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from app.db.session import BACKEND_DIR


@lru_cache
def get_uploads_dir() -> Path:
    override = os.environ.get("UPLOADS_DIR", "").strip()
    if override:
        path = Path(override)
    elif Path("/var/data").is_dir():
        path = Path("/var/data/uploads")
    else:
        path = BACKEND_DIR / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    return path
