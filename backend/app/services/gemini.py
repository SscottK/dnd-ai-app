import base64
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("app.services.gemini")

GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)


async def generate_content(parts: list[dict[str, Any]]) -> str:
    payload = {"contents": [{"parts": parts}]}

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GEMINI_URL,
            json=payload,
            params={"key": settings.gemini_api_key},
            timeout=60,
        )
        if resp.status_code != 200:
            logger.error("Gemini API error %s: %s", resp.status_code, resp.text[:500])
            resp.raise_for_status()

        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def generate_text(prompt: str) -> str:
    return await generate_content([{"text": prompt}])


async def generate_from_pdf(pdf_bytes: bytes, prompt: str) -> str:
    encoded = base64.b64encode(pdf_bytes).decode("ascii")
    parts = [
        {"inline_data": {"mime_type": "application/pdf", "data": encoded}},
        {"text": prompt},
    ]
    return await generate_content(parts)
