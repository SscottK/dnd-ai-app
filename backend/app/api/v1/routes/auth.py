from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    AccessRequestCreate,
    AccessRequestRead,
    AuthStatusResponse,
    LoginRequest,
    RegisterRequest,
    RegistrationStatusResponse,
    TokenResponse,
    UserRead,
)
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.services.access_requests import create_access_request

router = APIRouter(prefix="/auth", tags=["auth"])


def to_user_read(user: User) -> UserRead:
    if user.id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User record is missing an ID",
        )

    return UserRead(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )


def to_access_request_read(request) -> AccessRequestRead:
    return AccessRequestRead(
        id=request.id,
        username=request.username,
        message=request.message,
        status=request.status,
        created_at=request.created_at,
        reviewed_at=request.reviewed_at,
    )


@router.get("/health")
def auth_health():
    return {"status": "ok"}


@router.get("/registration-status", response_model=RegistrationStatusResponse)
def registration_status():
    return RegistrationStatusResponse(registration_open=settings.registration_open)


@router.post("/access-request", response_model=AccessRequestRead, status_code=status.HTTP_201_CREATED)
def request_access(data: AccessRequestCreate, session: SessionDep):
    if settings.registration_open:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration is open — create an account directly instead",
        )

    request = create_access_request(
        session,
        username=data.username,
        password_hash=hash_password(data.password),
        message=data.message,
    )
    return to_access_request_read(request)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, session: SessionDep):
    if not settings.registration_open:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is closed. Submit an access request instead.",
        )

    username = data.username.lower()
    existing = session.exec(select(User).where(User.username == username)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username is already taken",
        )

    user = User(
        username=username,
        password_hash=hash_password(data.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    access_token = create_access_token(user_id=user.id, username=user.username)
    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, session: SessionDep):
    user = session.exec(
        select(User).where(User.username == data.username.lower())
    ).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    access_token = create_access_token(user_id=user.id, username=user.username)
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=AuthStatusResponse)
def me(current_user: CurrentUser):
    return AuthStatusResponse(authenticated=True, user=to_user_read(current_user))
