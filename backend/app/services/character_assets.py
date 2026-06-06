from pathlib import Path

from sqlmodel import Session

from app.db.models import Character
from app.services.character_photos import resolve_portrait_file_path

PORTRAIT_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}


def portrait_download_url(character: Character, session: Session | None = None) -> str | None:
    if character.id is None:
        return None
    file_path = (
        resolve_portrait_file_path(character, session)
        if session is not None
        else character.portrait_path
    )
    if file_path:
        return f"/api/v1/characters/{character.id}/portrait"
    return None


def portrait_media_type(path: Path) -> str:
    return PORTRAIT_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
