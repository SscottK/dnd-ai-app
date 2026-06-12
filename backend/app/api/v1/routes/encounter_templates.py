from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    SavedEncounterTemplateCreate,
    SavedEncounterTemplateListResponse,
    SavedEncounterTemplateRead,
    SavedEncounterTemplateUpdate,
)
from app.services.saved_encounter_templates import (
    SavedEncounterTemplateError,
    create_template,
    delete_template,
    get_template_for_user,
    list_templates_for_user,
    template_to_read,
    update_template,
)

router = APIRouter(prefix="/encounter-templates", tags=["encounter-templates"])


@router.get("", response_model=SavedEncounterTemplateListResponse)
def list_my_encounter_templates(current_user: CurrentUser, session: SessionDep):
    return SavedEncounterTemplateListResponse(
        templates=list_templates_for_user(session, current_user.id)
    )


@router.post("", response_model=SavedEncounterTemplateRead, status_code=status.HTTP_201_CREATED)
def create_encounter_template(
    data: SavedEncounterTemplateCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        return create_template(session, current_user.id, data)
    except SavedEncounterTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{template_id}", response_model=SavedEncounterTemplateRead)
def get_encounter_template(
    template_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        record = get_template_for_user(session, current_user.id, template_id)
        return template_to_read(record)
    except SavedEncounterTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{template_id}", response_model=SavedEncounterTemplateRead)
def patch_encounter_template(
    template_id: int,
    data: SavedEncounterTemplateUpdate,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        return update_template(session, current_user.id, template_id, data)
    except SavedEncounterTemplateError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(exc).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_encounter_template(
    template_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        delete_template(session, current_user.id, template_id)
    except SavedEncounterTemplateError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
