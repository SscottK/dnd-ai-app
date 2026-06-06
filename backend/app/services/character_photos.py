import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.db.models import Character, CharacterPhoto
from app.db.session import BACKEND_DIR

UPLOADS_DIR = BACKEND_DIR / "uploads"
PORTRAIT_MAX_BYTES = 4 * 1024 * 1024
PORTRAIT_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_ALBUM_PHOTOS = 24


def photo_download_url(character_id: int, photo_id: int) -> str:
    return f"/api/v1/characters/{character_id}/photos/{photo_id}"


def resolve_portrait_file_path(character: Character, session: Session) -> str | None:
    if character.portrait_photo_id is not None:
        photo = session.get(CharacterPhoto, character.portrait_photo_id)
        if photo is not None:
            return photo.file_path
    return character.portrait_path


async def read_valid_photo_upload(file: UploadFile) -> tuple[bytes, str]:
    if not file.content_type or file.content_type not in PORTRAIT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload a JPEG, PNG, WebP, or GIF image",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(raw) > PORTRAIT_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must be 4 MB or smaller",
        )
    return raw, PORTRAIT_EXTENSIONS[file.content_type]


def store_photo_file(user_id: int, raw: bytes, ext: str) -> str:
    stored_name = f"photos/{uuid.uuid4().hex}{ext}"
    dest_dir = UPLOADS_DIR / str(user_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / stored_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    return f"{user_id}/{stored_name}"


def remove_photo_file(file_path: str | None) -> None:
    if not file_path:
        return
    (UPLOADS_DIR / file_path).unlink(missing_ok=True)


def list_character_photos(session: Session, character_id: int) -> list[CharacterPhoto]:
    return list(
        session.exec(
            select(CharacterPhoto)
            .where(CharacterPhoto.character_id == character_id)
            .order_by(CharacterPhoto.created_at.desc())
        ).all()
    )


def sync_portrait_path(character: Character, session: Session) -> None:
    character.portrait_path = resolve_portrait_file_path(character, session)


def set_portrait_photo(session: Session, character: Character, photo: CharacterPhoto) -> None:
    if photo.character_id != character.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Photo not in album")
    character.portrait_photo_id = photo.id
    character.portrait_path = photo.file_path
    session.add(character)


def clear_portrait_selection(session: Session, character: Character) -> None:
    character.portrait_photo_id = None
    character.portrait_path = None
    session.add(character)


async def add_photo_to_album(
    session: Session, character: Character, user_id: int, file: UploadFile
) -> CharacterPhoto:
    existing = list_character_photos(session, character.id)
    if len(existing) >= MAX_ALBUM_PHOTOS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Album limit reached ({MAX_ALBUM_PHOTOS} photos)",
        )

    raw, ext = await read_valid_photo_upload(file)
    photo = CharacterPhoto(
        character_id=character.id,
        file_path=store_photo_file(user_id, raw, ext),
        created_at=datetime.now(timezone.utc),
    )
    session.add(photo)
    session.flush()

    if character.portrait_photo_id is None:
        set_portrait_photo(session, character, photo)

    return photo


def delete_album_photo(session: Session, character: Character, photo_id: int) -> None:
    photo = session.get(CharacterPhoto, photo_id)
    if photo is None or photo.character_id != character.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    if character.portrait_photo_id == photo.id:
        clear_portrait_selection(session, character)
        session.flush()

    remove_photo_file(photo.file_path)
    session.delete(photo)


def delete_all_character_photos(session: Session, character: Character) -> None:
    clear_portrait_selection(session, character)
    session.flush()
    for photo in list_character_photos(session, character.id):
        remove_photo_file(photo.file_path)
        session.delete(photo)
