import json
import logging
import re
from pathlib import Path

from pypdf import PdfReader

from app.services.character_ac import compute_sheet_ac, enrich_sheet_ac
from app.services.character_sheet import normalize_sheet, sheet_to_json, skills_summary
from app.services.gemini import generate_from_pdf, generate_text

logger = logging.getLogger("app.character_pdf")

PARSE_PROMPT = """You are a D&D 5.5e character sheet parser. Read this D&D Beyond character sheet PDF.

Return ONLY valid JSON (no markdown, no commentary) with this shape:
{
  "name": "string",
  "class_name": "string or null",
  "level": 1,
  "ac": null,
  "hp": null,
  "max_hp": null,
  "sheet": {
    "abilities": { "str": 16, "dex": 14, "con": 14, "int": 8, "wis": 12, "cha": 12 },
    "proficiency_bonus": 2,
    "speed": 30,
    "initiative_bonus": 2,
    "passive_perception": 13,
    "hit_dice": "1d10",
    "saving_throws": [
      { "ability": "str", "proficient": true, "bonus": 5 }
    ],
    "skills": [
      { "name": "Athletics", "ability": "str", "proficient": true, "expertise": false, "bonus": 5 }
    ],
    "proficiencies": {
      "armor": ["Heavy", "Light", "Medium", "Shields"],
      "weapons": ["Martial", "Simple"],
      "tools": ["Thieves' Tools"],
      "languages": ["Common", "Elvish"]
    },
    "inventory": [
      { "name": "Chain Mail +1", "qty": 1, "weight": 55, "equipped": true, "ac_bonus": 1, "notes": "" }
    ],
    "features": [
      { "name": "Defense", "description": "+1 AC while wearing armor", "source": "Fighting Style" }
    ],
    "attacks": [
      { "name": "Longsword", "to_hit": 5, "damage": "1d8+3 slashing", "action_type": "action", "targeting": "one_enemy" }
    ],
    "spells": [
      { "name": "Fire Bolt", "level": 0, "action_type": "action", "targeting": "one_enemy", "prepared": true, "description": "Ranged spell attack" }
    ],
    "combat_actions": [
      { "name": "Second Wind", "action_type": "bonus_action", "targeting": "self", "description": "Regain hit points" }
    ],
    "ac_breakdown": [
      { "label": "Chain Mail", "value": 16, "kind": "armor" },
      { "label": "Armored Bonus (Defense)", "value": 1, "kind": "bonus" }
    ],
    "ac_bonuses": [
      { "name": "Armored Bonus (Defense)", "bonus": 1, "requires_armor": true }
    ],
    "conditions": [],
    "notes": ""
  }
}

Rules:
- Use CHARACTER NAME for name (not player name).
- Include ALL 18 skills with correct proficient/expertise flags and bonuses when visible.
- Include all six saving throws.
- Inventory: list gear with qty, weight if shown, equipped=true for worn/wielded items.
- For magic armor/shields, include ac_bonus (e.g. +1 plate → ac_bonus: 1) and keep +N in the name when shown.
- Parse the full AC breakdown from the Armor Class section into ac_breakdown AND ac_bonuses.
- Top-level "ac" MUST be the large final total (e.g. 17), NOT a sub-line like armor base 16 alone.
- Every bonus line that is not armor base, DEX, or shield goes in ac_bonuses (e.g. "+1 Armored Bonus (Defense)" → { "name": "Armored Bonus (Defense)", "bonus": 1, "requires_armor": true }).
- Fighting Style: Defense must appear in features AND as an ac_bonus when it affects AC.
- Do NOT put armor base, shield, DEX, unarmored "Base" (10), or ability modifiers in ac_bonuses — only true extras like Defense, magic bonuses, or feats.
- ac_breakdown kinds must be: armor, shield, dex, base, ability, or bonus. Only kind "bonus" rows belong in ac_bonuses.
- Parse character notes/backstory from NOTES, CHARACTER BACKSTORY, and ADDITIONAL NOTES sections into sheet.notes.
- Features: class/race/background features with short descriptions.
- attacks: every weapon attack from ACTIONS or ATTACKS sections with name, to_hit bonus, damage dice, action_type (usually action), targeting (usually one_enemy).
- spells: prepared/known spells with name, level (0 for cantrips), action_type, targeting, prepared boolean, short description.
- combat_actions: class features and abilities that cost an Action, Bonus Action, or Reaction (Second Wind, Action Surge, Channel Divinity, etc.) with action_type and targeting.
- For features that clearly use a Bonus Action or Reaction in their text, duplicate them in combat_actions with the correct action_type.
- Use null only when a value truly cannot be found.
- ability keys must be lowercase: str, dex, con, int, wis, cha.
"""

TEXT_PARSE_PROMPT = PARSE_PROMPT + "\n\nCharacter sheet text:\n"


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _looks_like_empty_template(text: str) -> bool:
    if len(text) < 100:
        return True
    upper = text.upper()
    has_labels = "CHARACTER NAME" in upper and "ARMOR" in upper
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

    sheet = normalize_sheet(data)
    parsed_ac = int(data["ac"]) if data.get("ac") is not None else None
    sheet = enrich_sheet_ac(sheet, parsed_ac)
    computed_ac = compute_sheet_ac(sheet, parsed_ac)
    if parsed_ac is not None and computed_ac is not None:
        final_ac = parsed_ac
    else:
        final_ac = computed_ac if computed_ac is not None else parsed_ac
    skills = skills_summary(sheet)

    return {
        "name": name[:100] if name else "",
        "class_name": class_name,
        "level": int(data["level"]) if data.get("level") is not None else None,
        "ac": final_ac,
        "hp": int(data["hp"]) if data.get("hp") is not None else None,
        "max_hp": int(data["max_hp"]) if data.get("max_hp") is not None else None,
        "skills": skills,
        "sheet_json": sheet_to_json(sheet),
    }


def _parse_quality(parsed: dict) -> str | None:
    filled = sum(
        1
        for key in ("name", "class_name", "ac", "hp", "max_hp")
        if parsed.get(key) not in (None, "", 0)
    )
    sheet = json.loads(parsed.get("sheet_json") or "{}")
    ability_count = sum(1 for v in sheet.get("abilities", {}).values() if v)
    if filled >= 3 and ability_count >= 3:
        return None
    if filled == 0:
        return (
            "Could not read stats from this PDF. "
            "Try exporting again from D&D Beyond, or enter details manually."
        )
    return (
        "Only partial data was read — use Full Sheet → Re-sync from PDF after reviewing."
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

    try:
        response = await generate_from_pdf(pdf_bytes, PARSE_PROMPT)
        data = _parse_json_response(response)
        parsed = _normalize_parsed(data)
        warning = _parse_quality(parsed)
        if warning:
            logger.warning("Low-quality PDF parse for %s", path.name)
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
