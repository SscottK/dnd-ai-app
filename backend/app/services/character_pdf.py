import json
import logging
import re
from pathlib import Path

from pypdf import PdfReader

from app.services.gemini import generate_from_pdf, generate_text

logger = logging.getLogger("app.character_pdf")

PARSE_PROMPT = """You are a D&D 5e character sheet parser. Read this character sheet PDF and extract the player's stats.

Return ONLY valid JSON with this exact shape (no markdown, no commentary):
{
  "name": "string",
  "class_name": "string or null",
  "level": 1,
  "ac": null,
  "hp": null,
  "max_hp": null,
  "skills": "comma-separated proficient or notable skills, or null"
}

Rules:
- Use the CHARACTER NAME field for name (not player name).
- class_name should include subclass if visible (e.g. "Fighter 5 / Champion").
- level is the character's total level as an integer.
- ac is armor class as an integer.
- hp is current hit points; max_hp is maximum hit points.
- Use null only when a value truly cannot be found on the sheet.
"""

TEXT_PARSE_PROMPT = """You are a D&D 5e character sheet parser. Extract character stats from the text below.

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

Character sheet text:
"""


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _looks_like_empty_template(text: str) -> bool:
    """D&D Beyond PDFs often export labels only, without filled values."""
    if len(text) < 100:
        return True
    upper = text.upper()
    has_labels = "CHARACTER NAME" in upper and "ARMOR" in upper
    # Real sheets usually have digits near HP/level; template-only sheets rarely do.
    has_values = bool(re.search(r"\b\d{1,2}\b", text)) and bool(
        re.search(r"(HP|HIT POINT|LEVEL|AC|ARMOR CLASS)", upper)
    )
    return has_labels and not has_values


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


def _normalize_parsed(data: dict) -> dict:
    name = str(data.get("name") or "").strip()
    if not name or name.lower() in {"unknown", "unknown hero", "character name"}:
        name = ""

    class_name = data.get("class_name")
    if class_name:
        class_name = str(class_name).strip() or None

    return {
        "name": name[:100] if name else "",
        "class_name": class_name,
        "level": int(data["level"]) if data.get("level") is not None else None,
        "ac": int(data["ac"]) if data.get("ac") is not None else None,
        "hp": int(data["hp"]) if data.get("hp") is not None else None,
        "max_hp": int(data["max_hp"]) if data.get("max_hp") is not None else None,
        "skills": (str(data["skills"]).strip() if data.get("skills") else None),
    }


def _parse_quality(parsed: dict) -> str | None:
    filled = sum(
        1
        for key in ("name", "class_name", "ac", "hp", "max_hp")
        if parsed.get(key) not in (None, "", 0)
    )
    if filled >= 3:
        return None
    if filled == 0:
        return (
            "Could not read stats from this PDF. "
            "Try exporting again from D&D Beyond, or enter details manually."
        )
    return (
        "Only partial data was read — please review and fill in missing fields before saving."
    )


async def parse_character_from_pdf(path: Path) -> dict:
    pdf_bytes = path.read_bytes()
    raw_text = extract_pdf_text(path)

    logger.info(
        "Parsing PDF %s (%d bytes, %d chars extracted text)",
        path.name,
        len(pdf_bytes),
        len(raw_text),
    )

    # Prefer Gemini vision on the PDF — required for D&D Beyond exports.
    try:
        response = await generate_from_pdf(pdf_bytes, PARSE_PROMPT)
        data = _parse_json_response(response)
        parsed = _normalize_parsed(data)
        warning = _parse_quality(parsed)
        if warning:
            logger.warning("Low-quality PDF parse for %s: %s", path.name, parsed)
        return {**parsed, "parse_warning": warning}
    except Exception as vision_exc:
        logger.warning("Gemini PDF vision parse failed: %s", vision_exc)

    if not raw_text:
        raise ValueError(
            "Could not read this PDF. Try a D&D Beyond export or enter details manually."
        )

    if _looks_like_empty_template(raw_text):
        raise ValueError(
            "This PDF looks like a blank D&D Beyond template with no readable character data. "
            "Re-export from D&D Beyond or enter details manually."
        )

    # Fallback: text-only parse for PDFs with embedded text values
    try:
        response = await generate_text(TEXT_PARSE_PROMPT + raw_text[:14000])
        data = _parse_json_response(response)
        parsed = _normalize_parsed(data)
        warning = _parse_quality(parsed) or "Parsed from text layer only — please verify all fields."
        return {**parsed, "parse_warning": warning}
    except Exception as text_exc:
        logger.exception("Text fallback parse failed")
        raise ValueError(
            "Could not parse character sheet. Enter details manually."
        ) from text_exc
