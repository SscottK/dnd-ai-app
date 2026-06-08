import json
import logging
import re
from pathlib import Path

from pypdf import PdfReader

from app.core.config import settings
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
    "classes": [
      { "name": "Monk", "level": 5, "subclass": "Way of the Open Hand" }
    ],
    "resources": [
      { "id": "focus-points", "name": "Focus Points", "current": 5, "max": 5, "recharge": "short_rest", "source_class": "Monk" }
    ],
    "wild_shapes": [
      { "name": "Wolf", "cr": "1/4", "notes": "" }
    ],
    "combat_actions": [
      { "name": "Flurry of Blows", "action_type": "bonus_action", "targeting": "one_enemy", "description": "Two unarmed strikes", "resource_cost": { "resource_id": "focus-points", "amount": 1 } }
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
- For magic armor/shields ONLY, include ac_bonus as the extra +N (e.g. "+1 Shield" → ac_bonus: 1, total shield +3). Do NOT set ac_bonus on non-magic "Shield" (standard +2 is implicit) or on armor base AC (Chain Mail alone → no ac_bonus; "+1 Chain Mail" → ac_bonus: 1).
- Never set ac_bonus from shield or armor rules text in notes (e.g. "gains +2 bonus to AC", "AC 16") — standard shield/armor AC is implicit; only magic +N in the item name gets ac_bonus.
- Parse the full AC breakdown from the Armor Class section into ac_breakdown AND ac_bonuses.
- Top-level "ac" MUST be the large final total (e.g. 17), NOT a sub-line like armor base 16 alone.
- Every bonus line that is not armor base, DEX, or shield goes in ac_bonuses (e.g. "+1 Armored Bonus (Defense)" → { "name": "Armored Bonus (Defense)", "bonus": 1, "requires_armor": true }).
- Fighting Style: Defense must appear in features AND as an ac_bonus when it affects AC.
- Do NOT put armor base, shield, DEX, unarmored "Base" (10), or ability modifiers in ac_bonuses — only true extras like Defense, magic bonuses, or feats.
- ac_breakdown kinds must be: armor, shield, dex, base, ability, or bonus. Only kind "bonus" rows belong in ac_bonuses.
- Parse character notes/backstory from NOTES, CHARACTER BACKSTORY, and ADDITIONAL NOTES sections into sheet.notes.
- classes: every class on the sheet with name, level, and subclass (if shown). Multiclass = multiple entries.
- resources: every spendable pool or use tracker visible on the sheet (Focus Points for Monk, Sorcery Points, Rage, Wild Shape uses, Channel Divinity, Bardic Inspiration, Lay on Hands pool, spell slots, Heroic Inspiration, etc.) with id (canonical slug: focus-points, wild-shape, rage, channel-divinity, bardic-inspiration, lay-on-hands, sorcery-points), name, current, max, recharge (short_rest|long_rest|turn), source_class.
- Features: passive or narrative class/race/background features (Unarmored Defense, Martial Arts rules text). Mark purely passive features with "passive": true (Extra Attack, Martial Arts, Unarmored Defense). Do NOT put spendable ki options only in features — also list them in combat_actions.
- attacks: every weapon/unarmed attack from WEAPON ATTACKS & CANTRIPS or ACTIONS with name, to_hit bonus, damage dice, action_type (usually action), targeting (usually one_enemy).
- spells: prepared/known spells with name, level (0 for cantrips), action_type, targeting, prepared boolean, short description.
- wild_shapes: every beast form listed on the sheet for Wild Shape (or similar transform features) with name, cr if shown, and notes.
- combat_actions: any ability that uses Action, Bonus Action, Reaction, or Magic action in combat. Use the PRIMARY activation cost (2024: Wild Shape = bonus_action). Include resource_cost when the sheet shows a point cost. Do not duplicate Wild Shape in features if it is already here.
- For features whose description says Bonus Action or Reaction, also add a matching combat_actions entry.
- Use null only when a value truly cannot be found.
- ability keys must be lowercase: str, dex, con, int, wis, cha.
"""

TEXT_PARSE_PROMPT = PARSE_PROMPT + "\n\nCharacter sheet text:\n"


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def _text_layer_has_character_stats(text: str) -> bool:
    upper = text.upper()
    return bool(re.search(r"\b\d{1,2}\b", text)) and bool(
        re.search(r"(HP|HIT POINT|LEVEL|AC|ARMOR CLASS)", upper)
    )


def _looks_like_empty_template(text: str) -> bool:
    """True when the text layer is an unfilled D&D Beyond form shell."""
    if len(text) < 100:
        return False
    upper = text.upper()
    has_labels = "CHARACTER NAME" in upper and "ARMOR" in upper
    return has_labels and not _text_layer_has_character_stats(text)


def _is_image_heavy_pdf(raw_text: str) -> bool:
    """Image exports often have template labels in the text layer but no stat numbers."""
    stripped = raw_text.strip()
    if len(stripped) < 100:
        return True
    return _looks_like_empty_template(stripped)


def _vision_failure_message(*, raw_text: str, vision_error: Exception | None) -> str:
    if not settings.gemini_api_key.strip():
        return (
            "PDF vision parsing is not configured (GEMINI_API_KEY missing in backend .env). "
            "Add your API key and restart the backend, or enter character details manually."
        )
    if _is_image_heavy_pdf(raw_text):
        detail = str(vision_error or "").lower()
        if "503" in detail or "unavailable" in detail or "429" in detail:
            return (
                "This D&D Beyond PDF is image-based and must be read with Gemini vision. "
                "Google's API was temporarily unavailable — wait a minute and try Re-sync again. "
                "Your existing character data was not changed."
            )
        return (
            "This D&D Beyond PDF is image-based — the text layer has no character stats "
            "(only blank sheet labels). The app must read it with Gemini vision, and that step failed. "
            "Confirm GEMINI_API_KEY is set in backend/.env and restart the backend, then try Re-sync again. "
            "Your existing character data was not changed."
        )
    detail = str(vision_error).strip() if vision_error else ""
    if detail:
        logger.warning("Vision parse failure detail: %s", detail)
    return (
        "Could not parse this PDF with vision AI. "
        "Try re-exporting from D&D Beyond or enter details manually."
    )


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

    vision_error: Exception | None = None
    try:
        response = await generate_from_pdf(pdf_bytes, PARSE_PROMPT)
        try:
            data = _parse_json_response(response)
            parsed = _normalize_parsed(data)
            warning = _parse_quality(parsed)
            if warning:
                logger.warning("Low-quality PDF parse for %s", path.name)
            return {**parsed, "parse_warning": warning}
        except Exception as parse_exc:
            vision_error = parse_exc
            logger.warning(
                "Gemini returned a response for %s but JSON normalize failed: %s",
                path.name,
                parse_exc,
            )
    except Exception as api_exc:
        vision_error = api_exc
        logger.warning("Gemini PDF vision parse failed for %s: %s", path.name, api_exc)

    if not raw_text or _is_image_heavy_pdf(raw_text):
        raise ValueError(_vision_failure_message(raw_text=raw_text, vision_error=vision_error))

    if _looks_like_empty_template(raw_text):
        raise ValueError(_vision_failure_message(raw_text=raw_text, vision_error=vision_error))

    try:
        response = await generate_text(TEXT_PARSE_PROMPT + raw_text[:14000])
        data = _parse_json_response(response)
        parsed = _normalize_parsed(data)
        warning = _parse_quality(parsed) or "Parsed from text layer only — please verify all fields."
        return {**parsed, "parse_warning": warning}
    except Exception as text_exc:
        logger.exception("Text fallback parse failed for %s", path.name)
        raise ValueError(
            "Could not parse character sheet from PDF text. Enter details manually."
        ) from text_exc
