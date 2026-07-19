#!/usr/bin/env python3
"""Extract 2024 DMG magic item entries into a private overlay (not for redistribution).

Requires: pymupdf
Input:  reference/DMG_2024.pdf
Output: backend/data/private-2024/magic_items.json  (gitignored)
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
PDF_PATH = ROOT / "reference" / "DMG_2024.pdf"
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "private-2024"

LICENSE = (
    "Private campaign overlay extracted from a lawfully possessed 2024 Dungeon Master's Guide PDF. "
    "Not redistributed. Fan Content / personal-group use only."
)

_ITEM = re.compile(
    r"^([A-Z][A-Z0-9' \-]{2,60})\n"
    r"((?:Weapon|Armor|Wondrous Item|Potion|Ring|Rod|Staff|Wand|Scroll),"
    r"[^\n]+)\n"
    r"(.*?)(?="
    r"^[A-Z][A-Z0-9' \-]{2,60}\n(?:Weapon|Armor|Wondrous Item|Potion|Ring|Rod|Staff|Wand|Scroll),"
    r"|\Z)",
    re.M | re.S,
)

_RARITY = re.compile(
    r"(Common|Uncommon|Rare|Very Rare|Legendary|Artifact)",
    re.I,
)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _fix_title_case(name: str) -> str:
    cleaned = re.sub(r"\s+", " ", name).strip().title()
    cleaned = re.sub(r"\bOf\b", "of", cleaned)
    cleaned = re.sub(r"\bAnd\b", "and", cleaned)
    cleaned = re.sub(r"\bThe\b", "the", cleaned)
    cleaned = re.sub(r"\bAgainst\b", "against", cleaned)
    return cleaned


def extract_magic_items(doc: fitz.Document) -> list[dict]:
    items: list[dict] = []
    seen: set[str] = set()
    # Treasure / magic items chapters (approx. 2024 DMG layout)
    for page_index in range(230, min(doc.page_count, 340)):
        text = doc.load_page(page_index).get_text("text")
        for match in _ITEM.finditer(text):
            raw_name = match.group(1).strip()
            if raw_name in {"CHAPTER", "TREASURE", "MAGIC ITEMS", "SENTIENT", "ARTIFACTS"}:
                continue
            # Skip obvious OCR fragment headers
            if len(raw_name.split()) == 1 and raw_name in {"AND", "OF", "THE", "A"}:
                continue
            name = _fix_title_case(raw_name)
            key = name.casefold()
            if key in seen:
                continue
            seen.add(key)
            type_line = match.group(2).strip()
            body = re.sub(r"[ \t]+", " ", match.group(3)).strip()
            rarity_match = _RARITY.search(type_line)
            item_type = type_line.split(",", 1)[0].strip()
            items.append(
                {
                    "name": name,
                    "slug": slugify(name),
                    "source": "DMG 2024",
                    "edition": "2024",
                    "type": item_type,
                    "rarity": rarity_match.group(1).title() if rarity_match else None,
                    "type_line": type_line,
                    "requires_attunement": "attunement" in type_line.casefold(),
                    "description": body[:8000],
                    "page": page_index + 1,
                }
            )
    items.sort(key=lambda row: row["name"].casefold())
    return items


def main() -> None:
    if not PDF_PATH.is_file():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    items = extract_magic_items(doc)
    out = OUT_DIR / "magic_items.json"
    out.write_text(
        json.dumps({"_license": LICENSE, "magic_items": items}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {out.name} magic_items={len(items)}")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = {}
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}
    counts = dict(manifest.get("counts") or {})
    counts["magic_items"] = len(items)
    manifest["counts"] = counts
    manifest["dmg_source"] = "reference/DMG_2024.pdf"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Updated manifest.json")


if __name__ == "__main__":
    main()
