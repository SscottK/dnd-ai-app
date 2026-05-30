# app/services/conversations.py
import logging
from typing import List
from app.db.models import Message
from app.core.exceptions import GeminiProxyException

logger = logging.getLogger("app.services.conversations")

def build_prompt_from_db_messages(messages: List[Message]) -> str:
    """
    Transforms list of DB message models into a system-formatted prompt 
    suitable for the Gemini model, maintaining correct conversational structure.
    """
    try:
        formatted_turns = []
        for index, msg in enumerate(messages):
            # Guard against potential corrupted or empty database loads
            role = getattr(msg, "role", None)
            content = getattr(msg, "content", None)

            if not role or not content:
                logger.warning(f"Skipped malformed message record at index {index}")
                continue

            # Map sender format cleanly: 'user' -> 'User', 'assistant' -> 'Assistant'
            role_label = "User" if role == "user" else "Assistant"
            formatted_turns.append(f"{role_label}: {content}")
        
        # Assemble string prompt with clear double-newline separators
        prompt = "\n\n".join(formatted_turns)
        
        # Append a trailing helper to encourage the model to continue the conversation
        prompt += "\n\nAssistant:"
        return prompt

    except Exception as e:
        logger.exception(f"Error compiling conversation prompt from database: {str(e)}")
        raise GeminiProxyException(
            message="Failed to process conversation history for AI model.",
            status_code=500
        )