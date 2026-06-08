# app/services/conversations.py
import logging
from typing import List

from app.core.exceptions import GeminiProxyException
from app.db.models import Message
from app.services.rules_prompt import build_prompt_from_db_messages as _build_prompt_from_db_messages

logger = logging.getLogger("app.services.conversations")

# Re-export for any legacy imports
from app.services.rules_prompt import RULES_SYSTEM_PROMPT  # noqa: E402, F401


def build_prompt_from_db_messages(messages: List[Message]) -> str:
    try:
        return _build_prompt_from_db_messages(messages)
    except Exception as e:
        logger.exception("Error compiling conversation prompt from database: %s", str(e))
        raise GeminiProxyException(
            message="Failed to process conversation history for AI model.",
            status_code=500,
        ) from e