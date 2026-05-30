from fastapi import APIRouter

from app.api.schemas import HealthResponse
from app.core.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def api_health():
    return HealthResponse(status="ok", app_name=settings.app_name)