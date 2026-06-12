"""Per-user saved encounter templates for quick DM tracker setup."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.api.schemas import (
    SavedEncounterMonsterEntry,
    SavedEncounterTemplateCreate,
    SavedEncounterTemplateRead,
    SavedEncounterTemplateUpdate,
)
from app.db.models import SavedEncounterTemplate


class SavedEncounterTemplateError(ValueError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_monsters(raw: str) -> list[SavedEncounterMonsterEntry]:
    try:
        payload = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise SavedEncounterTemplateError("Invalid template monsters data.") from exc
    if not isinstance(payload, list) or not payload:
        raise SavedEncounterTemplateError("Template must include at least one monster.")
    return [SavedEncounterMonsterEntry.model_validate(item) for item in payload]


def template_to_read(record: SavedEncounterTemplate) -> SavedEncounterTemplateRead:
    return SavedEncounterTemplateRead(
        id=record.id,
        title=record.title,
        notes=record.notes or "",
        monsters=_parse_monsters(record.monsters_json),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def list_templates_for_user(session: Session, user_id: int) -> list[SavedEncounterTemplateRead]:
    rows = session.exec(
        select(SavedEncounterTemplate)
        .where(SavedEncounterTemplate.user_id == user_id)
        .order_by(SavedEncounterTemplate.updated_at.desc())
    ).all()
    return [template_to_read(row) for row in rows]


def get_template_for_user(
    session: Session, user_id: int, template_id: int
) -> SavedEncounterTemplate:
    record = session.get(SavedEncounterTemplate, template_id)
    if record is None or record.user_id != user_id:
        raise SavedEncounterTemplateError("Encounter template not found.")
    return record


def create_template(
    session: Session, user_id: int, data: SavedEncounterTemplateCreate
) -> SavedEncounterTemplateRead:
    now = _utc_now()
    record = SavedEncounterTemplate(
        user_id=user_id,
        title=data.title.strip(),
        notes=(data.notes or "").strip(),
        monsters_json=json.dumps([monster.model_dump() for monster in data.monsters]),
        created_at=now,
        updated_at=now,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return template_to_read(record)


def update_template(
    session: Session,
    user_id: int,
    template_id: int,
    data: SavedEncounterTemplateUpdate,
) -> SavedEncounterTemplateRead:
    record = get_template_for_user(session, user_id, template_id)
    if data.title is not None:
        record.title = data.title.strip()
    if data.notes is not None:
        record.notes = data.notes.strip()
    if data.monsters is not None:
        if not data.monsters:
            raise SavedEncounterTemplateError("Template must include at least one monster.")
        record.monsters_json = json.dumps([monster.model_dump() for monster in data.monsters])
    record.updated_at = _utc_now()
    session.add(record)
    session.commit()
    session.refresh(record)
    return template_to_read(record)


def delete_template(session: Session, user_id: int, template_id: int) -> None:
    record = get_template_for_user(session, user_id, template_id)
    session.delete(record)
    session.commit()
