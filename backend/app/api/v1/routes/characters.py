import json
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
    CharacterPhotoListResponse,
    CharacterPhotoRead,
    CharacterRead,
    CharacterUpdate,
    SetPortraitRequest,
)
from app.db.models import Campaign, Character, CharacterPhoto
from app.db.session import BACKEND_DIR
from app.services.campaign_membership import get_campaign_member_for_user
from app.services.character_assets import portrait_download_url, portrait_media_type
from app.services.character_ac import compute_sheet_ac, enrich_sheet_ac
from app.services.character_pdf import parse_character_from_pdf
from app.services.character_sheet import (
    merge_sheet_on_resync,
    normalize_sheet,
    parse_sheet_json,
    sheet_to_json,
    skills_summary,
)
from app.services.character_photos import (
    add_photo_to_album,
    clear_portrait_selection,
    delete_album_photo,
    delete_all_character_photos,
    list_character_photos,
    photo_download_url,
    resolve_portrait_file_path,
    set_portrait_photo,
)
from app.services.encounter_sync import sync_character_combat_stats

router = APIRouter(prefix="/characters", tags=["characters"])

UPLOADS_DIR = BACKEND_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
MAX_PDF_BYTES = 10 * 1024 * 1024


def pdf_download_url(character: Character) -> str | None:
    if character.pdf_path:
        return f"/api/v1/characters/files/{character.pdf_path}"
    return None


def can_view_character_portrait(character: Character, user_id: int, session: SessionDep) -> bool:
    if character.user_id == user_id:
        return True
    if character.campaign_id is None:
        return False
    campaign = session.get(Campaign, character.campaign_id)
    if campaign is not None and campaign.owner_id == user_id:
        return True
    return get_campaign_member_for_user(character.campaign_id, user_id, session) is not None


def can_view_character_sheet(character: Character, user_id: int, session: SessionDep) -> bool:
    """Owner always; campaign DM may view party member sheets."""
    if character.user_id == user_id:
        return True
    if character.campaign_id is None:
        return False
    campaign = session.get(Campaign, character.campaign_id)
    return campaign is not None and campaign.owner_id == user_id


def get_viewable_character(
    character_id: int, current_user: CurrentUser, session: SessionDep
) -> Character:
    character = session.get(Character, character_id)
    if character is None or not can_view_character_sheet(character, current_user.id, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


def photo_to_read(photo: CharacterPhoto, character: Character) -> CharacterPhotoRead:
    return CharacterPhotoRead(
        id=photo.id,
        character_id=photo.character_id,
        url=photo_download_url(character.id, photo.id),
        created_at=photo.created_at,
        is_portrait=character.portrait_photo_id == photo.id,
    )


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
        sheet_json=sheet_to_json(
            parse_sheet_json(
                character.sheet_json,
                class_name=character.class_name,
                level=character.level,
            )
        ),
        campaign_id=character.campaign_id,
        campaign_name=campaign_name,
        pdf_url=pdf_download_url(character),
        portrait_url=portrait_download_url(character, session),
        portrait_photo_id=character.portrait_photo_id,
        dnd_beyond_url=character.dnd_beyond_url,
        created_at=character.created_at,
    )


def get_owned_character(character_id: int, current_user: CurrentUser, session: SessionDep) -> Character:
    character = session.get(Character, character_id)
    if character is None or character.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


def delete_stored_pdf(character: Character) -> None:
    if not character.pdf_path:
        return
    (UPLOADS_DIR / character.pdf_path).unlink(missing_ok=True)


async def read_and_store_pdf(current_user: CurrentUser, file: UploadFile) -> tuple[Path, str]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a PDF file",
        )

    content = await file.read()
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PDF must be under 10MB",
        )

    user_dir = UPLOADS_DIR / str(current_user.id)
    user_dir.mkdir(exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.pdf"
    dest = user_dir / stored_name
    dest.write_bytes(content)
    return dest, stored_name


async def parse_and_apply_pdf(character: Character, pdf_file: Path, session: SessionDep) -> str | None:
    try:
        parsed = await parse_character_from_pdf(pdf_file)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not parse character sheet from PDF",
        ) from exc

    warning = parsed.pop("parse_warning", None)
    apply_parsed_to_character(character, parsed)
    session.add(character)
    session.commit()
    session.refresh(character)

    if character.campaign_id:
        sheet = parse_sheet_json(
            character.sheet_json,
            class_name=character.class_name,
            level=character.level,
        )
        sync_character_combat_stats(
            session,
            character.campaign_id,
            character.id,
            hp=character.hp,
            max_hp=character.max_hp,
            ac=character.ac,
            conditions=sheet.get("conditions"),
        )
        session.commit()
        session.refresh(character)

    return warning


def apply_parsed_to_character(character: Character, parsed: dict) -> None:
    for field in ("name", "class_name", "level", "hp", "max_hp", "skills"):
        if parsed.get(field) is not None:
            setattr(character, field, parsed[field])

    if parsed.get("sheet_json"):
        try:
            old_sheet = json.loads(character.sheet_json or "{}")
        except (json.JSONDecodeError, TypeError, ValueError):
            old_sheet = {}
        try:
            new_sheet = json.loads(parsed["sheet_json"])
        except (json.JSONDecodeError, TypeError, ValueError):
            new_sheet = {}

        merged_sheet = merge_sheet_on_resync(old_sheet, new_sheet)
        parsed_ac = int(parsed["ac"]) if parsed.get("ac") is not None else None
        enriched_sheet = normalize_sheet(
            {
                "sheet": merged_sheet,
                "class_name": parsed.get("class_name") or character.class_name,
                "level": parsed.get("level") if parsed.get("level") is not None else character.level,
            }
        )
        enriched_sheet = enrich_sheet_ac(enriched_sheet, parsed_ac)
        character.sheet_json = json.dumps(enriched_sheet)
        computed_ac = compute_sheet_ac(enriched_sheet, parsed_ac)
        if computed_ac is not None:
            character.ac = computed_ac
        elif parsed.get("ac") is not None:
            character.ac = parsed["ac"]
    elif parsed.get("ac") is not None:
        character.ac = parsed["ac"]


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
    try:
        dest, stored_name = await read_and_store_pdf(current_user, file)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not store PDF upload",
        ) from exc

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


@router.get("/{character_id}/photos", response_model=CharacterPhotoListResponse)
def list_character_photo_album(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_owned_character(character_id, current_user, session)
    photos = list_character_photos(session, character.id)
    return CharacterPhotoListResponse(
        photos=[photo_to_read(photo, character) for photo in photos],
        portrait_photo_id=character.portrait_photo_id,
    )


@router.post("/{character_id}/photos", response_model=CharacterPhotoListResponse)
async def upload_character_photo(
    character_id: int,
    current_user: CurrentUser,
    session: SessionDep,
    file: UploadFile = File(...),
):
    character = get_owned_character(character_id, current_user, session)
    await add_photo_to_album(session, character, current_user.id, file)
    session.commit()
    session.refresh(character)
    photos = list_character_photos(session, character.id)
    return CharacterPhotoListResponse(
        photos=[photo_to_read(photo, character) for photo in photos],
        portrait_photo_id=character.portrait_photo_id,
    )


@router.get("/{character_id}/photos/{photo_id}")
def get_character_photo(
    character_id: int,
    photo_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    character = get_owned_character(character_id, current_user, session)
    photo = session.get(CharacterPhoto, photo_id)
    if photo is None or photo.character_id != character.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    path = UPLOADS_DIR / photo.file_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo file missing")

    return FileResponse(path, media_type=portrait_media_type(path))


@router.delete("/{character_id}/photos/{photo_id}", response_model=CharacterPhotoListResponse)
def delete_character_photo(
    character_id: int,
    photo_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    character = get_owned_character(character_id, current_user, session)
    delete_album_photo(session, character, photo_id)
    session.commit()
    session.refresh(character)
    photos = list_character_photos(session, character.id)
    return CharacterPhotoListResponse(
        photos=[photo_to_read(photo, character) for photo in photos],
        portrait_photo_id=character.portrait_photo_id,
    )


@router.get("/{character_id}/portrait")
def get_character_portrait(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = session.get(Character, character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")

    file_path = resolve_portrait_file_path(character, session)
    if not file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portrait not found")

    if not can_view_character_portrait(character, current_user.id, session):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = UPLOADS_DIR / file_path
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portrait file missing")

    return FileResponse(path, media_type=portrait_media_type(path))


@router.put("/{character_id}/portrait", response_model=CharacterRead)
def select_character_portrait(
    character_id: int,
    data: SetPortraitRequest,
    current_user: CurrentUser,
    session: SessionDep,
):
    character = get_owned_character(character_id, current_user, session)
    photo = session.get(CharacterPhoto, data.photo_id)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    set_portrait_photo(session, character, photo)
    session.commit()
    session.refresh(character)
    return to_character_read(character, session)


@router.post("/{character_id}/portrait", response_model=CharacterRead)
async def upload_character_portrait(
    character_id: int,
    current_user: CurrentUser,
    session: SessionDep,
    file: UploadFile = File(...),
):
    """Legacy upload — adds to album and sets as active portrait."""
    character = get_owned_character(character_id, current_user, session)
    photo = await add_photo_to_album(session, character, current_user.id, file)
    set_portrait_photo(session, character, photo)
    session.commit()
    session.refresh(character)
    return to_character_read(character, session)


@router.delete("/{character_id}/portrait", response_model=CharacterRead)
def clear_character_portrait(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_owned_character(character_id, current_user, session)
    clear_portrait_selection(session, character)
    session.commit()
    session.refresh(character)
    return to_character_read(character, session)


@router.get("/{character_id}", response_model=CharacterRead)
def get_character(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_viewable_character(character_id, current_user, session)
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

    warning = await parse_and_apply_pdf(character, pdf_file, session)
    result = to_character_read(character, session)
    if warning:
        return result.model_copy(update={"parse_warning": warning})
    return result


@router.post("/{character_id}/upload-pdf", response_model=CharacterRead)
async def upload_character_pdf(
    character_id: int,
    current_user: CurrentUser,
    session: SessionDep,
    file: UploadFile = File(...),
):
    """Replace the stored PDF, re-parse, and refresh the digital sheet."""
    character = get_owned_character(character_id, current_user, session)
    dest, stored_name = await read_and_store_pdf(current_user, file)

    try:
        await parse_character_from_pdf(dest)
    except ValueError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not parse character sheet from PDF",
        ) from exc

    try:
        delete_stored_pdf(character)
        character.pdf_path = f"{current_user.id}/{stored_name}"
        warning = await parse_and_apply_pdf(character, dest, session)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not replace character PDF",
        ) from exc

    result = to_character_read(character, session)
    if warning:
        return result.model_copy(update={"parse_warning": warning})
    return result


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

    sheet = parse_sheet_json(
        data.sheet_json or "{}",
        class_name=data.class_name,
        level=data.level,
    )
    parsed_ac = sheet.get("authoritative_ac")
    enriched = enrich_sheet_ac(sheet, parsed_ac)
    computed_ac = compute_sheet_ac(enriched, parsed_ac)
    skills_line = data.skills or skills_summary(enriched)

    character = Character(
        user_id=current_user.id,
        name=data.name.strip(),
        class_name=data.class_name,
        level=data.level,
        ac=computed_ac if computed_ac is not None else data.ac,
        hp=data.hp,
        max_hp=data.max_hp,
        skills=skills_line,
        sheet_json=sheet_to_json(enriched),
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
        sheet = parse_sheet_json(
            updates["sheet_json"],
            class_name=updates.get("class_name") or character.class_name,
            level=updates.get("level") if updates.get("level") is not None else character.level,
        )
        parsed_ac = sheet.get("authoritative_ac")
        enriched = enrich_sheet_ac(sheet, parsed_ac)
        updates["sheet_json"] = sheet_to_json(enriched)
        computed_ac = compute_sheet_ac(enriched, parsed_ac)
        if computed_ac is not None:
            updates["ac"] = computed_ac
        if "skills" not in updates:
            updates["skills"] = skills_summary(enriched)

    combat_changed = any(key in updates for key in ("hp", "max_hp", "ac", "sheet_json"))

    for field, value in updates.items():
        setattr(character, field, value)

    session.add(character)

    if combat_changed and character.campaign_id:
        sheet = parse_sheet_json(
            character.sheet_json,
            class_name=character.class_name,
            level=character.level,
        )
        sync_character_combat_stats(
            session,
            character.campaign_id,
            character.id,
            hp=character.hp,
            max_hp=character.max_hp,
            ac=character.ac,
            conditions=sheet.get("conditions"),
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

    delete_stored_pdf(character)
    delete_all_character_photos(session, character)

    session.delete(character)
    session.commit()
    return {"status": "ok", "message": f"Character {character_id} deleted."}
