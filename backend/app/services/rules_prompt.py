"""Shared Rule Wizard prompt assembly with optional SRD grounding."""

from __future__ import annotations

from app.api.schemas import ChatMessage
from app.db.models import Message
from app.services.srd_grounding import build_srd_context

RULES_SYSTEM_PROMPT = """You are a Dungeons & Dragons 5.5e (2024 rules revision) rules assistant for Quest Terminal.
Answer concisely with accurate 5.5e mechanics. Cite rule names when helpful.
If unsure or the provided SRD excerpt does not cover the question, say so — do not invent rules.
Stay focused on rules lookups — not running a live campaign narrative.
"""


def _latest_user_text_from_messages(messages: list[ChatMessage] | list[Message]) -> str | None:
    for message in reversed(messages):
        role = getattr(message, "role", None)
        if role != "user":
            continue
        text = getattr(message, "text", None) or getattr(message, "content", None)
        if text:
            return str(text).strip()
    return None


def build_rules_system_prompt(*, messages: list[ChatMessage] | list[Message] | None = None) -> str:
    prompt = RULES_SYSTEM_PROMPT.strip()
    user_query = _latest_user_text_from_messages(messages) if messages else None
    if user_query:
        context = build_srd_context(user_query)
        if context:
            prompt += (
                "\n\n=== SRD 5.2.1 Reference (CC-BY 4.0) ===\n"
                f"{context}\n\n"
                "Prefer the reference above for factual answers. "
                "If it does not answer the question, say the SRD excerpt you have does not cover it."
            )
    return prompt


def build_prompt_from_chat_messages(messages: list[ChatMessage]) -> str:
    lines = [build_rules_system_prompt(messages=messages)]
    for message in messages:
        role = "User" if message.role == "user" else "Assistant"
        lines.append(f"{role}: {message.text}")
    lines.append("Assistant:")
    return "\n".join(lines)


def build_prompt_from_db_messages(messages: list[Message]) -> str:
    lines = [build_rules_system_prompt(messages=messages)]
    for message in messages:
        role_label = "User" if message.role == "user" else "Assistant"
        lines.append(f"{role_label}: {message.content}")
    lines.append("Assistant:")
    return "\n".join(lines)
