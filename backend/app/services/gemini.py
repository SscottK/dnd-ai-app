import asyncio
import base64
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger("app.services.gemini")

def _primary_model() -> str:
    return settings.gemini_model.strip() or "gemini-3.5-flash"


def _fallback_model() -> str:
    return settings.gemini_model_fallback.strip() or "gemini-2.5-flash-lite"
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_MAX_ATTEMPTS = 4


def _gemini_url(model: str) -> str:
    return (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )


def _extract_response_text(data: dict) -> str:
    """Collect visible text from Gemini candidates (handles thinking-model part layouts)."""
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    texts = [part["text"] for part in parts if isinstance(part, dict) and part.get("text")]
    if not texts:
        raise KeyError("parts")
    return texts[-1]


async def generate_content(
    parts: list[dict[str, Any]],
    *,
    model: str | None = None,
) -> str:
    model = model or _primary_model()
    payload = {"contents": [{"parts": parts}]}
    last_error: Exception | None = None

    async with httpx.AsyncClient() as client:
        for attempt in range(1, _MAX_ATTEMPTS + 1):
            resp = await client.post(
                _gemini_url(model),
                json=payload,
                params={"key": settings.gemini_api_key},
                timeout=120,
            )
            if resp.status_code == 200:
                return _extract_response_text(resp.json())

            logger.error("Gemini API error %s: %s", resp.status_code, resp.text[:500])
            if resp.status_code not in _RETRYABLE_STATUS or attempt == _MAX_ATTEMPTS:
                resp.raise_for_status()

            delay = min(2**attempt, 12)
            logger.warning(
                "Gemini unavailable (HTTP %s), retrying in %ss (%s/%s)",
                resp.status_code,
                delay,
                attempt,
                _MAX_ATTEMPTS,
            )
            last_error = httpx.HTTPStatusError(
                f"Gemini HTTP {resp.status_code}",
                request=resp.request,
                response=resp,
            )
            await asyncio.sleep(delay)

    if last_error:
        raise last_error
    raise RuntimeError("Gemini request failed without a response")


async def generate_text(prompt: str) -> str:
    return await generate_content([{"text": prompt}])


async def generate_from_pdf(pdf_bytes: bytes, prompt: str) -> str:
    encoded = base64.b64encode(pdf_bytes).decode("ascii")
    parts = [
        {"inline_data": {"mime_type": "application/pdf", "data": encoded}},
        {"text": prompt},
    ]
    primary = _primary_model()
    fallback = _fallback_model()
    try:
        return await generate_content(parts, model=primary)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code not in _RETRYABLE_STATUS or fallback == primary:
            raise
        logger.warning(
            "Primary PDF model %s unavailable, trying fallback %s",
            primary,
            fallback,
        )
        return await generate_content(parts, model=fallback)
