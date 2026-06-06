from fastapi import APIRouter, HTTPException, status
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    AuthStatusResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User

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
        created_at=user.created_at,
    )


@router.get("/health")
def auth_health():
    return {"status": "ok"}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, session: SessionDep):
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
