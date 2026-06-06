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
from app.services.character_sheet import parse_sheet_json, sheet_to_json, skills_summary
from app.services.encounter_sync import sync_character_combat_stats

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
        inventory=character.inventory,
        features=character.features,
        notes=character.notes,
        layout_json=character.layout_json,
        sheet_json=character.sheet_json,
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


def apply_parsed_to_character(character: Character, parsed: dict) -> None:
    for field in ("name", "class_name", "level", "ac", "hp", "max_hp", "skills"):
        if parsed.get(field) is not None:
            setattr(character, field, parsed[field])
    if parsed.get("sheet_json"):
        character.sheet_json = parsed["sheet_json"]


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

    warning = parsed.pop("parse_warning", None)
    if not parsed.get("name"):
        parsed["name"] = "Unknown Hero"
    if parsed.get("level") is None:
        parsed["level"] = 1

    return CharacterDraft(**parsed, pdf_stored_name=stored_name, parse_warning=warning)


@router.get("/files/{user_id}/{filename}")
def download_character_pdf(user_id: int, filename: str, current_user: CurrentUser):
    if current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = UPLOADS_DIR / str(user_id) / filename
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(path, media_type="application/pdf", filename=filename)


@router.get("/{character_id}", response_model=CharacterRead)
def get_character(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_owned_character(character_id, current_user, session)
    return to_character_read(character, session)


@router.post("/{character_id}/refresh-from-pdf", response_model=CharacterRead)
async def refresh_character_from_pdf(
    character_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    character = get_owned_character(character_id, current_user, session)
    if not character.pdf_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No PDF on file for this character",
        )

    pdf_file = UPLOADS_DIR / character.pdf_path
    if not pdf_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stored PDF not found. Please re-upload.",
        )

    try:
        parsed = await parse_character_from_pdf(pdf_file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not re-parse character sheet from PDF",
        ) from exc

    parsed.pop("parse_warning", None)
    apply_parsed_to_character(character, parsed)
    session.add(character)
    session.commit()
    session.refresh(character)

    if character.campaign_id:
        sync_character_combat_stats(
            session,
            character.campaign_id,
            character.id,
            hp=character.hp,
            max_hp=character.max_hp,
            ac=character.ac,
        )
        session.commit()
        session.refresh(character)

    return to_character_read(character, session)


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
        sheet_json=data.sheet_json or "{}",
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

    if "sheet_json" in updates and updates["sheet_json"] is not None:
        sheet = parse_sheet_json(updates["sheet_json"])
        updates["sheet_json"] = sheet_to_json(sheet)
        if "skills" not in updates:
            updates["skills"] = skills_summary(sheet)

    combat_changed = any(key in updates for key in ("hp", "max_hp", "ac"))

    for field, value in updates.items():
        setattr(character, field, value)

    session.add(character)

    if combat_changed and character.campaign_id:
        sync_character_combat_stats(
            session,
            character.campaign_id,
            character.id,
            hp=character.hp,
            max_hp=character.max_hp,
            ac=character.ac,
        )

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
