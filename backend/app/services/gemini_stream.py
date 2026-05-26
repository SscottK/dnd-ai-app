import asyncio
from app.api.schemas import ChatMessage
from app.services.gemini import generate_text


def build_prompt_from_messages(messages: list[ChatMessage]) -> str:
    lines = []

    for message in messages:
        role = "User" if message.role == "user" else "Assistant"
        lines.append(f"{role}: {message.text}")

    lines.append("Assistant:")
    return "\n".join(lines)


async def gemini_stream(messages: list[ChatMessage]):
    prompt = build_prompt_from_messages(messages)
    full_text = await generate_text(prompt)

    for word in full_text.split():
        yield f"{word} "
        await asyncio.sleep(0.03)