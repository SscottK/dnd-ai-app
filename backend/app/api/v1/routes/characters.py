import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import desc, select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    CharacterCreate,
    CharacterDraft,
    CharacterListResponse,
    CharacterRead,
    CharacterUpdate,
)
from app.db.models import Campaign, Character
from app.db.session import BACKEND_DIR
from app.services.character_pdf import parse_character_from_pdf

router = APIRouter(prefix="/characters", tags=["characters"])

UPLOADS_DIR = BACKEND_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def pdf_download_url(character: Character) -> str | None:
    if character.pdf_path:
        return f"/api/v1/characters/files/{character.pdf_path}"
    return None


def to_character_read(character: Character, session: SessionDep) -> CharacterRead:
    if character.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Character record is missing an ID",
        )

    campaign_name = None
    if character.campaign_id:
        campaign = session.get(Campaign, character.campaign_id)
        if campaign:
            campaign_name = campaign.name

    return CharacterRead(
        id=character.id,
        name=character.name,
        class_name=character.class_name,
        level=character.level,
        ac=character.ac,
        hp=character.hp,
        max_hp=character.max_hp,
        skills=character.skills,
        campaign_id=character.campaign_id,
        campaign_name=campaign_name,
        pdf_url=pdf_download_url(character),
        dnd_beyond_url=character.dnd_beyond_url,
        created_at=character.created_at,
    )


def get_owned_character(character_id: int, current_user: CurrentUser, session: SessionDep) -> Character:
    character = session.get(Character, character_id)
    if character is None or character.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


@router.get("", response_model=CharacterListResponse)
def list_characters(current_user: CurrentUser, session: SessionDep):
    rows = list(
        session.exec(
            select(Character)
            .where(Character.user_id == current_user.id)
            .order_by(desc(Character.created_at))
        ).all()
    )
    return CharacterListResponse(characters=[to_character_read(row, session) for row in rows])


@router.post("/parse-pdf", response_model=CharacterDraft)
async def parse_pdf_upload(
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a PDF file",
        )

    user_dir = UPLOADS_DIR / str(current_user.id)
    user_dir.mkdir(exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.pdf"
    dest = user_dir / stored_name

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF must be under 10MB",
        )

    dest.write_bytes(content)

    try:
        parsed = await parse_character_from_pdf(dest)
    except ValueError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not parse character sheet from PDF",
        ) from exc

    return CharacterDraft(**parsed, pdf_stored_name=stored_name)


@router.get("/files/{user_id}/{filename}")
def download_character_pdf(user_id: int, filename: str, current_user: CurrentUser):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = UPLOADS_DIR / str(user_id) / filename
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(path, media_type="application/pdf", filename=filename)


@router.post("", response_model=CharacterRead, status_code=status.HTTP_201_CREATED)
def create_character(data: CharacterCreate, current_user: CurrentUser, session: SessionDep):
    pdf_path = None
    if data.pdf_stored_name:
        stored = UPLOADS_DIR / str(current_user.id) / data.pdf_stored_name
        if not stored.exists():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded PDF not found. Please upload again.",
            )
        pdf_path = f"{current_user.id}/{data.pdf_stored_name}"

    character = Character(
        user_id=current_user.id,
        name=data.name.strip(),
        class_name=data.class_name,
        level=data.level,
        ac=data.ac,
        hp=data.hp,
        max_hp=data.max_hp,
        skills=data.skills,
        pdf_path=pdf_path,
        dnd_beyond_url=data.dnd_beyond_url,
    )
    session.add(character)
    session.commit()
    session.refresh(character)
    return to_character_read(character, session)


@router.patch("/{character_id}", response_model=CharacterRead)
def update_character(
    character_id: int,
    data: CharacterUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    character = get_owned_character(character_id, current_user, session)
    updates = data.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        updates["name"] = updates["name"].strip()

    for field, value in updates.items():
        setattr(character, field, value)

    session.add(character)
    session.commit()
    session.refresh(character)
    return to_character_read(character, session)


@router.delete("/{character_id}", status_code=status.HTTP_200_OK)
def delete_character(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_owned_character(character_id, current_user, session)

    if character.campaign_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Leave the campaign before deleting this character",
        )

    if character.pdf_path:
        pdf_file = UPLOADS_DIR / character.pdf_path
        pdf_file.unlink(missing_ok=True)

    session.delete(character)
    session.commit()
    return {"status": "ok", "message": f"Character {character_id} deleted."}
