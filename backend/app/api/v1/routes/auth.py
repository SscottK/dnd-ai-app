from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.api.schemas import AuthStatusResponse, LoginRequest, TokenResponse
from app.core.config import settings
from app.core.security import create_access_token, verify_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

bearer_scheme = HTTPBearer()


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> dict:
    token = credentials.credentials
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return payload


@router.get("/health")
def auth_health():
    return {"status": "ok"}


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest):
    if data.password != settings.shared_app_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    access_token = create_access_token(subject="shared-user")
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=AuthStatusResponse)
def me(_: Annotated[dict, Depends(require_auth)]):
    return AuthStatusResponse(authenticated=True)