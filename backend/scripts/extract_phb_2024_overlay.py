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
        species.append(
            {
                "name": name,
                "slug": slugify(name),
                "source": "PHB 2024",
                "edition": "2024",
                "description": body[:12000],
            }
        )
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
        backgrounds.append(
            {
                "name": name,
                "slug": slugify(name),
                "source": "PHB 2024",
                "edition": "2024",
                "ability_scores": match.group(1).strip(),
                "feat": re.sub(r"\s*\(see chapter 5\)", "", match.group(2), flags=re.I).strip(),
                "skill_proficiencies": match.group(3).strip(),
                "tool_proficiency": tool or None,
                "equipment": clean_spaces(match.group(5))[:2000],
                "description": clean_spaces(match.group(0))[:6000],
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
        r"(Cantrip|\w+ Level \d+|Level \d+)[^\n]*\n"
        r"Casting Time:\s*([^\n]+)\n"
        r"Range:\s*([^\n]+)\n"
        r"Components:\s*([^\n]+)\n"
        r"Duration:\s*([^\n]+)\n"
        r"(.*?)(?=\n[A-Z][A-Z0-9' \-]{2,50}\n(?:Cantrip|Level |\w+ Level )|\Z)",
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
        if level_line.lower().startswith("cantrip"):
            level = 0
        else:
            level_match = re.search(r"(\d+)", level_line)
            level = int(level_match.group(1)) if level_match else None
        casting = match.group(3).strip()
        action_type = "action"
        casting_l = casting.lower()
        if "bonus action" in casting_l:
            action_type = "bonus_action"
        elif "reaction" in casting_l:
            action_type = "reaction"
        spells.append(
            {
                "name": name,
                "slug": slugify(name),
                "source": "PHB 2024",
                "edition": "2024",
                "level": level,
                "school": level_line,
                "casting_time": casting,
                "range": match.group(4).strip(),
                "components": match.group(5).strip(),
                "duration": match.group(6).strip(),
                "action_type": action_type,
                "description": clean_spaces(match.group(7))[:10000],
            }
        )
    return spells


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
    write_json(
        OUT_DIR / "manifest.json",
        {
            "_license": LICENSE,
            "source": "PHB 2024",
            "counts": {
                "species": len(species),
                "backgrounds": len(backgrounds),
                "feats": len(feats),
                "spells": len(spells),
            },
        },
    )
    print(
        f"Extracted species={len(species)} backgrounds={len(backgrounds)} "
        f"feats={len(feats)} spells={len(spells)}"
    )


if __name__ == "__main__":
    main()
