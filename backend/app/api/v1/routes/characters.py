from fastapi import APIRouter, HTTPException, status
from sqlmodel import desc, select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    CharacterCreate,
    CharacterListResponse,
    CharacterRead,
    CharacterUpdate,
)
from app.db.models import Character

router = APIRouter(prefix="/characters", tags=["characters"])


def to_character_read(character: Character) -> CharacterRead:
    if character.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Character record is missing an ID",
        )

    return CharacterRead(
        id=character.id,
        name=character.name,
        class_name=character.class_name,
        level=character.level,
        ac=character.ac,
        hp=character.hp,
        max_hp=character.max_hp,
        skills=character.skills,
        pdf_url=character.pdf_url,
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
    return CharacterListResponse(characters=[to_character_read(row) for row in rows])


@router.post("", response_model=CharacterRead, status_code=status.HTTP_201_CREATED)
def create_character(data: CharacterCreate, current_user: CurrentUser, session: SessionDep):
    character = Character(
        user_id=current_user.id,
        name=data.name.strip(),
        class_name=data.class_name,
        level=data.level,
        ac=data.ac,
        hp=data.hp,
        max_hp=data.max_hp,
        skills=data.skills,
        pdf_url=data.pdf_url,
        dnd_beyond_url=data.dnd_beyond_url,
    )
    session.add(character)
    session.commit()
    session.refresh(character)
    return to_character_read(character)


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
    return to_character_read(character)


@router.delete("/{character_id}", status_code=status.HTTP_200_OK)
def delete_character(character_id: int, current_user: CurrentUser, session: SessionDep):
    character = get_owned_character(character_id, current_user, session)
    session.delete(character)
    session.commit()
    return {"status": "ok", "message": f"Character {character_id} deleted."}
