#!/usr/bin/env python3
"""Extract 2024 PHB catalogs into a private overlay (not for redistribution).

Requires: pymupdf (`pip install pymupdf`)
Input:  reference/PHB_2024.pdf
Output: backend/data/private-2024/*.json  (gitignored)
"""

from __future__ import annotations

import json
import re
from pathlib import Path

try:
    import fitz
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Install pymupdf: pip install pymupdf") from exc

ROOT = Path(__file__).resolve().parents[2]
PDF_PATH = ROOT / "reference" / "PHB_2024.pdf"
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "private-2024"

SPECIES_NAMES = [
    "Aasimar",
    "Dragonborn",
    "Dwarf",
    "Elf",
    "Gnome",
    "Goliath",
    "Halfling",
    "Human",
    "Orc",
    "Tiefling",
]

LICENSE = (
    "Private campaign overlay extracted from a lawfully possessed 2024 Player's Handbook PDF. "
    "Not redistributed. Fan Content / personal-group use only."
)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def page_text(doc: fitz.Document, page_index: int) -> str:
    return doc.load_page(page_index).get_text("text")


def pages_text(doc: fitz.Document, start: int, end: int) -> str:
    """1-based inclusive page range."""
    chunks = []
    for page_no in range(start, end + 1):
        chunks.append(page_text(doc, page_no - 1))
    return "\n".join(chunks)


def clean_spaces(text: str) -> str:
    text = text.replace("\u00ad", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_species(doc: fitz.Document) -> list[dict]:
    blob = clean_spaces(pages_text(doc, 185, 197))
    species: list[dict] = []
    for name in SPECIES_NAMES:
        pattern = re.compile(
            rf"(?:^|\n){re.escape(name.upper())}\s*\n(.*?)(?=\n(?:{'|'.join(n.upper() for n in SPECIES_NAMES)})\s*\n|\Z)",
            re.S,
        )
        match = pattern.search(blob)
        if not match and name == "Aasimar":
            # Aasimar section may start mid-page without all-caps header alone
            match = re.search(
                r"AASIMAR TRAITS\s*(.*?)(?=\nDRAGONBORN\s*\n|\Z)",
                blob,
                re.S,
            )
            body = ("Aasimar Traits\n" + match.group(1)) if match else ""
        else:
            body = match.group(1).strip() if match else ""
        if not body:
            # fallback: grab from name traits header
            traits = re.search(
                rf"{re.escape(name.upper())} TRAITS\s*(.*?)(?=\n[A-Z][A-Z ]{{2,20}} TRAITS\b|\nFEATS\b|\Z)",
                blob,
                re.S,
            )
            body = traits.group(0).strip() if traits else ""
        if not body:
            continue
        fields = {}
        for label in ("Creature Type", "Size", "Speed"):
            match_field = re.search(
                rf"(?ims)^{re.escape(label)}:\s*(.+?)(?=^(?:Creature Type|Size|Speed):|\nAs an?\b|\nYou\b|\Z)",
                body,
            )
            if match_field:
                fields[label] = re.sub(r"\s*\n\s*", " ", match_field.group(1)).strip()
        entry = {
            "name": name,
            "slug": slugify(name),
            "source": "PHB 2024",
            "edition": "2024",
            "description": body[:12000],
        }
        if fields:
            entry["fields"] = fields
        species.append(entry)
    return species


def extract_backgrounds(doc: fitz.Document) -> list[dict]:
    """2024 PHB background names are often in art headers; pair known order with stat blocks."""
    known_order = [
        "Acolyte",
        "Artisan",
        "Charlatan",
        "Criminal",
        "Entertainer",
        "Farmer",
        "Guard",
        "Guide",
        "Hermit",
        "Merchant",
        "Noble",
        "Sage",
        "Sailor",
        "Scribe",
        "Soldier",
        "Wayfarer",
    ]
    blob = clean_spaces(pages_text(doc, 177, 184))
    blob = re.sub(r"(?i).{0,12}bility Scores:", "Ability Scores:", blob)
    pattern = re.compile(
        r"Ability Scores:\s*([^\n]+)\n"
        r"Feat:\s*([^\n]+)\n"
        r"Skill Proficiencies:\s*([^\n]+)\n"
        r"(?:Tool Proficienc(?:y|ies):\s*(.*?))?"
        r"\nEquipment\s*:\s*(.*?)(?=\nAbility Scores:|\Z)",
        re.S | re.I,
    )
    blocks = list(pattern.finditer(blob))
    backgrounds: list[dict] = []
    for index, name in enumerate(known_order):
        if index >= len(blocks):
            break
        match = blocks[index]
        tool = (match.group(4) or "").strip()
        feat = re.sub(r"\s*\(see chapter 5\)", "", match.group(2), flags=re.I).strip()
        ability = match.group(1).strip()
        skills = match.group(3).strip()
        # Stop before flavor prose ("You grew up…") that follows the equipment line.
        raw_equipment = match.group(5)
        equipment_match = re.match(
            r"(.*?(?:\d+\s*GP|[Bb]\))\s*)(?=\nYou(?:r)?\b|\n[A-Z][a-z]+\s+[a-z]|\Z)",
            raw_equipment,
            re.S,
        )
        equipment = clean_spaces((equipment_match.group(1) if equipment_match else raw_equipment))[:500]
        equipment = re.sub(r"\s+", " ", equipment).strip()
        fields = {
            "Ability Scores": ability,
            "Feat": feat,
            "Skill Proficiencies": skills,
            "Equipment": equipment,
        }
        if tool:
            fields["Tool Proficiency"] = clean_spaces(tool)
        backgrounds.append(
            {
                "name": name,
                "slug": slugify(name),
                "source": "PHB 2024",
                "edition": "2024",
                "ability_scores": ability,
                "feat": feat,
                "skill_proficiencies": skills,
                "tool_proficiency": tool or None,
                "equipment": equipment,
                "fields": fields,
                "description": "",
            }
        )
    return backgrounds


# Common OCR smash-ups → canonical PHB 2024 names (private overlay only).
_NAME_FIXES = {
    "magic initi ate": "Magic Initiate",
    "magic initiate": "Magic Initiate",
    "crossbowexpert": "Crossbow Expert",
    "def ensive duelist": "Defensive Duelist",
    "defensive duelist": "Defensive Duelist",
    "mediu mar mor master": "Medium Armor Master",
    "medium armor master": "Medium Armor Master",
    "antimagicfield": "Antimagic Field",
    "armsofhadar": "Arms of Hadar",
    "boonofenergyresistance": "Boon of Energy Resistance",
    "boonofrecovery": "Boon of Recovery",
    "boonofskill": "Boon of Skill",
    "boonofspeed": "Boon of Speed",
    "boonofirresistibleoffense": "Boon of Irresistible Offense",
}


def _fix_title_case(name: str) -> str:
    """Repair OCR-split ALL CAPS titles like 'ALA R M' or 'A Lert'."""
    raw = re.sub(r"\s+", " ", name).strip()
    tokens = raw.split()
    if not tokens:
        return raw
    single_ratio = sum(1 for tok in tokens if len(tok) == 1) / len(tokens)
    if single_ratio >= 0.3:
        joined = "".join(tokens)
    else:
        merged: list[str] = []
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if len(tok) == 1 and tok.isalpha() and i + 1 < len(tokens):
                merged.append(tok + tokens[i + 1])
                i += 2
                continue
            merged.append(tok)
            i += 1
        joined = " ".join(merged)
    cleaned = joined.title().replace("'S", "'s")
    cleaned = re.sub(r"\bOf\b", "of", cleaned)
    cleaned = re.sub(r"\bAnd\b", "and", cleaned)
    cleaned = re.sub(r"\bThe\b", "the", cleaned)
    key = re.sub(r"\s+", " ", cleaned.casefold())
    compacted = re.sub(r"[^a-z0-9]+", "", key)
    for bad, good in _NAME_FIXES.items():
        if key == bad or compacted == re.sub(r"[^a-z0-9]+", "", bad):
            return good
    return cleaned


def extract_feats(doc: fitz.Document) -> list[dict]:
    blob = clean_spaces(pages_text(doc, 198, 211))
    category = "origin"
    feats: list[dict] = []
    # Split on ALL-CAPS-ish feat titles that precede "Origin Feat" / "General Feat" etc.
    blocks = re.split(
        r"\n(?=[A-Z][A-Z0-9' \-]{2,40}\n(?:Origin Feat|General Feat|Fighting Style Feat|Epic Boon Feat))",
        blob,
    )
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        header = re.match(
            r"([A-Z0-9' \-]{2,40})\n"
            r"(Origin Feat|General Feat|Fighting Style Feat|Epic Boon Feat)[^\n]*\n"
            r"(.*)",
            block,
            re.S,
        )
        if not header:
            continue
        name = _fix_title_case(header.group(1))
        kind = header.group(2)
        body = header.group(3).strip()
        if kind.startswith("Origin"):
            category = "origin"
        elif kind.startswith("General"):
            category = "general"
        elif kind.startswith("Fighting"):
            category = "fighting_style"
        else:
            category = "epic_boon"
        feats.append(
            {
                "name": name,
                "slug": slugify(name),
                "source": "PHB 2024",
                "edition": "2024",
                "category": category,
                "description": body[:8000],
            }
        )
    return feats


def extract_spells(doc: fitz.Document) -> list[dict]:
    """Parse spell entries from the Spells chapter (approx. pages 236–360)."""
    blob = clean_spaces(pages_text(doc, 236, 360))
    # Pattern: NAME\nLevel N School (Classes)\nCasting Time: ...
    pattern = re.compile(
        r"(?:^|\n)([A-Z][A-Z0-9' \-]{2,50})\n"
        r"((?:Cantrip|[A-Za-z]+ Level \d+|Level [I\d]+)[^\n]*)\n"
        r"Casting Time:\s*([^\n]+)\n"
        r"Range:\s*([^\n]+)\n"
        r"Components:\s*([^\n]+)\n"
        r"Duration:\s*([^\n]+)\n"
        r"(.*?)(?=\n[A-Z][A-Z0-9' \-]{2,50}\n(?:Cantrip|Level |[A-Za-z]+ Level )|\Z)",
        re.S,
    )
    spells: list[dict] = []
    seen: set[str] = set()
    for match in pattern.finditer(blob):
        raw_name = match.group(1).strip()
        if raw_name in {"SPELLS", "CHAPTER 7", "USING A SPELL SCROLL"}:
            continue
        name = _fix_title_case(raw_name)
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        level_line = match.group(2).strip()
        level, school, classes = _parse_spell_level_line(level_line)
        casting = _clean_ocr_text(match.group(3), spell_name=name)
        action_type = "action"
        casting_l = casting.lower()
        if "bonus action" in casting_l:
            action_type = "bonus_action"
        elif "reaction" in casting_l:
            action_type = "reaction"
        description = _clean_ocr_text(match.group(7), spell_name=name)
        entry = {
            "name": name,
            "slug": slugify(name),
            "source": "PHB 2024",
            "edition": "2024",
            "level": level,
            "school": school or level_line,
            "casting_time": casting,
            "range": _clean_ocr_text(match.group(4), spell_name=name),
            "components": _clean_ocr_text(match.group(5), spell_name=name),
            "duration": _clean_ocr_text(match.group(6), spell_name=name),
            "action_type": action_type,
            "description": description[:10000],
        }
        if classes:
            entry["classes"] = classes
        spells.append(entry)
    return spells


_OCR_REPLACEMENTS = (
    ("\u00ad", ""),
    ("1O-", "10-"),
    ("2O-", "20-"),
    ("3O-", "30-"),
    ("4O-", "40-"),
    ("5O-", "50-"),
    ("6O-", "60-"),
    ("1O ", "10 "),
    ("2O ", "20 "),
    ("ld4", "1d4"),
    ("ld6", "1d6"),
    ("ld8", "1d8"),
    ("ld10", "1d10"),
    ("ld12", "1d12"),
    ("< reature", "creature"),
    ("creuture", "creature"),
    ("creotur", "creature"),
    ("magir", "magic"),
    ("il uminate", "illuminate"),
    ("fu lly", "fully"),
    ("Level I ", "Level 1 "),
    (" l hour", " 1 hour"),
    ("l minute", "1 minute"),
    ("l hour", "1 hour"),
    ("::,u", "you"),
    ("::,", "you"),
    (",u makes", "you makes"),
)


def _clean_ocr_text(text: str, *, spell_name: str | None = None) -> str:
    cleaned = str(text or "")
    cleaned = cleaned.replace("-\n", "")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    for bad, good in _OCR_REPLACEMENTS:
        cleaned = cleaned.replace(bad, good)
    cleaned = re.sub(r"[·•~<>|]+", "", cleaned)
    cleaned = re.sub(
        r"originating from\s*[^\n]{0,24}?makes",
        "originating from you makes",
        cleaned,
    )
    cleaned = re.sub(r"On a failed[^,\n]{0,30},", "On a failed save,", cleaned)
    cleaned = re.sub(
        r"until the start[~.·•\s]{0,10}it[~.·•\s]{0,8}(?:next\s+)?turn",
        "until the start of its next turn",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"until the starts its turn", "until the start of its next turn", cleaned, flags=re.I)
    if spell_name:
        last = spell_name.strip().split()[-1]
        if last and last[0].isupper():
            cleaned = re.sub(
                rf"(?i)(Invoking)\s+\S+,",
                rf"\1 {last},",
                cleaned,
                count=1,
            )
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r",{2,}", ",", cleaned)
    cleaned = re.sub(r"\.\s*,", ".", cleaned)
    return cleaned.strip()


def _parse_spell_level_line(level_line: str) -> tuple[int | None, str | None, str | None]:
    line = _clean_ocr_text(level_line)
    level: int | None
    if re.search(r"(?i)^cantrip", line):
        level = 0
    else:
        if re.search(r"(?i)Level\s+I\b", line) and not re.search(r"Level\s+\d", line):
            level = 1
        else:
            level_match = re.search(r"(\d+)", line)
            level = int(level_match.group(1)) if level_match else None
    school = None
    classes = None
    school_match = re.search(
        r"(?i)\b(Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation)\b",
        line,
    )
    if school_match:
        school = school_match.group(1).title()
    classes_match = re.search(r"\(([^)]+)\)", line)
    if classes_match:
        classes = classes_match.group(1).strip()
    return level, school, classes


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {path.name}")


def main() -> None:
    if not PDF_PATH.is_file():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)

    species = extract_species(doc)
    backgrounds = extract_backgrounds(doc)
    feats = extract_feats(doc)
    spells = extract_spells(doc)

    write_json(
        OUT_DIR / "species.json",
        {"_license": LICENSE, "species": species},
    )
    write_json(
        OUT_DIR / "backgrounds.json",
        {"_license": LICENSE, "backgrounds": backgrounds},
    )
    write_json(
        OUT_DIR / "feats.json",
        {"_license": LICENSE, "feats": feats},
    )
    write_json(
        OUT_DIR / "spells.json",
        {"_license": LICENSE, "spells": spells},
    )
    manifest = {}
    manifest_path = OUT_DIR / "manifest.json"
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}
    counts = dict(manifest.get("counts") or {})
    counts.update(
        {
            "species": len(species),
            "backgrounds": len(backgrounds),
            "feats": len(feats),
            "spells": len(spells),
        }
    )
    write_json(
        OUT_DIR / "manifest.json",
        {
            **manifest,
            "_license": LICENSE,
            "source": "PHB 2024",
            "counts": counts,
        },
    )
    print(
        f"Extracted species={len(species)} backgrounds={len(backgrounds)} "
        f"feats={len(feats)} spells={len(spells)}"
    )


if __name__ == "__main__":
    main()
