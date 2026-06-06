# app/services/conversations.py
import logging
from typing import List
from app.db.models import Message
from app.core.exceptions import GeminiProxyException

logger = logging.getLogger("app.services.conversations")

RULES_SYSTEM_PROMPT = """You are a Dungeons & Dragons 5.5e (2024 rules revision) rules assistant.
Answer concisely with accurate 5.5e mechanics. Cite rule names when helpful.
If unsure, say so. Do not invent homebrew unless asked.
Stay focused on rules lookups — not running a live campaign narrative.

"""

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
        
        prompt = RULES_SYSTEM_PROMPT + "\n\n".join(formatted_turns)
        prompt += "\n\nAssistant:"
        return prompt

    except Exception as e:
        logger.exception(f"Error compiling conversation prompt from database: {str(e)}")
        raise GeminiProxyException(
            message="Failed to process conversation history for AI model.",
            status_code=500
        )