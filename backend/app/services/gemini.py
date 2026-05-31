import httpx
import logging
from app.core.config import settings

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.5-flash:generateContent"
)


async def generate_text(prompt: str) -> str:
    payload = {"contents": [{"parts": [{"text": prompt}]}]}

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                GEMINI_URL,
                json=payload,
                params={"key": settings.gemini_api_key},
                timeout=30,
            )
            resp.raise_for_status()

        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception:
        logging.exception("Gemini call failed")
        raise