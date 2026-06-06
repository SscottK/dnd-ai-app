import json
import logging
import re
from pathlib import Path

from pypdf import PdfReader

from app.services.gemini import generate_text

logger = logging.getLogger("app.character_pdf")

PARSE_PROMPT = """You are a D&D 5e character sheet parser. Extract character stats from the text below.

Return ONLY valid JSON with this exact shape (no markdown, no commentary):
{
  "name": "string",
  "class_name": "string or null",
  "level": 1,
  "ac": null,
  "hp": null,
  "max_hp": null,
  "skills": "comma-separated notable skills or null"
}

Use null for unknown numeric fields. If HP current and max are both present, set both.

Character sheet text:
"""


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _parse_json_response(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError("Could not parse character data from PDF") from None


async def parse_character_from_pdf(path: Path) -> dict:
    raw_text = extract_pdf_text(path)
    if not raw_text:
        raise ValueError("Could not extract text from PDF. Try a text-based export, not a scan.")

    prompt = PARSE_PROMPT + raw_text[:14000]
    response = await generate_text(prompt)
    data = _parse_json_response(response)

    return {
        "name": str(data.get("name") or "Unknown Hero").strip()[:100],
        "class_name": (data.get("class_name") or None),
        "level": int(data["level"]) if data.get("level") is not None else 1,
        "ac": int(data["ac"]) if data.get("ac") is not None else None,
        "hp": int(data["hp"]) if data.get("hp") is not None else None,
        "max_hp": int(data["max_hp"]) if data.get("max_hp") is not None else None,
        "skills": (str(data["skills"]).strip() if data.get("skills") else None),
    }
