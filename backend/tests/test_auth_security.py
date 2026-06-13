from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_user
from app.core.security import create_access_token


def test_get_current_user_rejects_username_mismatch():
    user = MagicMock()
    user.id = 7
    user.username = "new_owner"

    session = MagicMock()
    session.get.return_value = user

    token = create_access_token(user_id=7, username="old_owner")
    credentials = MagicMock()
    credentials.credentials = token

    with pytest.raises(HTTPException) as exc_info:
        get_current_user(credentials=credentials, session=session)

    assert exc_info.value.status_code == 401
    assert "no longer valid" in exc_info.value.detail.lower()


def test_get_current_user_accepts_matching_username():
    user = MagicMock()
    user.id = 7
    user.username = "alice"

    session = MagicMock()
    session.get.return_value = user

    token = create_access_token(user_id=7, username="alice")
    credentials = MagicMock()
    credentials.credentials = token

    result = get_current_user(credentials=credentials, session=session)
    assert result is user
