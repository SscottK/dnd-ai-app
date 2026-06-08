#!/usr/bin/env python3
"""Build partial SRD 5.2.1 data (superseded by build_srd_all.py).

Prefer: python scripts/build_srd_all.py

Build SRD 5.2.1 species, backgrounds, feats, equipment, and glossary JSON.

Species/backgrounds/feats/glossary: parsed from downfallx/dnd-5e-srd-markdown (CC-BY SRD).
Weapons/armor: Open5e API (wotc-srd document, CC-BY 4.0).
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "srd-5.2.1"
LICENSE = (
    "Source: D&D System Reference Document v5.2.1, © Wizards of the Coast LLC, "
    "licensed under CC-BY 4.0."
)
MARKDOWN_SOURCE = (
    "Parsed from downfallx/dnd-5e-srd-markdown (master) — CC-BY 4.0 SRD text conversion."
)
OPEN5E_SOURCE = (
    "Weapons and armor from Open5e API (https://api.open5e.com/, document slug: wotc-srd), CC-BY 4.0."
)

ORIGINS_URL = (
    "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/character-origins.md"
)
FEATS_URL = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/feats.md"
EQUIPMENT_URL = (
    "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/equipment.md"
)
GLOSSARY_URL = (
    "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/rules-glossary.md"
)

BACKGROUND_SKIP = {
    "Ability Scores",
    "Feat",
    "Skill Proficiencies",
    "Tool Proficiency",
    "Equipment",
}
SPECIES_SKIP = {"Creature Type", "Size", "Speed", "Special Traits"}


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "dnd-ai-app/1.0 (SRD extended data build)"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read().decode("utf-8")


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "dnd-ai-app/1.0 (SRD extended data build)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def paginate(base_url: str) -> list[dict]:
    results: list[dict] = []
    url = base_url
    while url:
        payload = fetch_json(url)
        results.extend(payload.get("results") or [])
        url = payload.get("next")
    return results


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "entry"


def extract_section(markdown: str, start_heading: str, end_heading: str | None) -> str:
    start = markdown.find(start_heading)
    if start < 0:
        return ""
    start += len(start_heading)
    if end_heading:
        end = markdown.find(end_heading, start)
        if end < 0:
            return markdown[start:]
        return markdown[start:end]
    return markdown[start:]


def parse_field_lines(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in body.splitlines():
        match = re.match(r"^\*\*(.+?):\*\*\s*(.*)$", line.strip())
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def parse_h4_entries(
    section: str,
    *,
    skip: set[str],
    max_description: int = 2500,
) -> list[dict]:
    entries: list[dict] = []
    if not section.strip():
        return entries

    chunks = re.split(r"\n#### ", section)
    for chunk in chunks[1:]:
        lines = chunk.split("\n", 1)
        name = lines[0].strip()
        if not name or name in skip:
            continue
        body = lines[1].strip() if len(lines) > 1 else ""
        entry = {
            "name": name,
            "slug": slugify(name),
            "description": body[:max_description],
        }
        fields = parse_field_lines(body)
        if fields:
            entry["fields"] = fields
        entries.append(entry)
    return entries


def parse_h3_sections(markdown: str, *, max_description: int = 4000) -> list[dict]:
    entries: list[dict] = []
    chunks = re.split(r"\n### ", markdown)
    for chunk in chunks[1:]:
        lines = chunk.split("\n", 1)
        name = lines[0].strip()
        if not name:
            continue
        body = lines[1].strip() if len(lines) > 1 else ""
        entries.append(
            {
                "name": name,
                "slug": slugify(name),
                "description": body[:max_description],
            }
        )
    return entries


def build_species(origins_md: str) -> list[dict]:
    section = extract_section(
        origins_md,
        "### Species Descriptions",
        None,
    )
    return parse_h4_entries(section, skip=SPECIES_SKIP)


def build_backgrounds(origins_md: str) -> list[dict]:
    section = extract_section(
        origins_md,
        "### Background Descriptions",
        "## Character Species",
    )
    return parse_h4_entries(section, skip=BACKGROUND_SKIP)


def build_feats(feats_md: str) -> list[dict]:
    section = extract_section(feats_md, "## Feat Descriptions", None)
    return parse_h4_entries(section, skip=set())


def build_glossary(glossary_md: str) -> list[dict]:
    section = extract_section(glossary_md, "## Glossary Conventions", None)
    entries = parse_h4_entries(section, skip=set(), max_description=1500)
    for entry in entries:
        tag_match = re.search(r"\[([^\]]+)\]", entry["name"])
        if tag_match:
            entry["tag"] = tag_match.group(1)
            entry["name"] = re.sub(r"\s*\[[^\]]+\]\s*", "", entry["name"]).strip()
            entry["slug"] = slugify(entry["name"])
    return entries


def build_equipment(equipment_md: str) -> dict:
    weapons_raw = paginate(
        "https://api.open5e.com/v1/weapons/?document__slug=wotc-srd&limit=50"
    )
    armor_raw = paginate(
        "https://api.open5e.com/v1/armor/?document__slug=wotc-srd&limit=50"
    )

    weapons = []
    for row in weapons_raw:
        name = row.get("name")
        if not name:
            continue
        weapons.append(
            {
                "name": name,
                "slug": row.get("slug") or slugify(name),
                "category": row.get("category"),
                "cost": row.get("cost"),
                "damage_dice": row.get("damage_dice"),
                "damage_type": row.get("damage_type"),
                "weight": row.get("weight"),
                "properties": row.get("properties") or [],
            }
        )

    armor = []
    for row in armor_raw:
        name = row.get("name")
        if not name:
            continue
        armor.append(
            {
                "name": name,
                "slug": row.get("slug") or slugify(name),
                "category": row.get("category"),
                "cost": row.get("cost"),
                "ac_base": row.get("base_ac"),
                "ac_add_dexmod": row.get("plus_dex_mod"),
                "ac_cap_dexmod": row.get("plus_dex_mod_cap"),
                "strength_requirement": row.get("strength_requirement"),
                "stealth_disadvantage": row.get("stealth_disadvantage"),
                "weight": row.get("weight"),
            }
        )

    rules_sections = parse_h3_sections(equipment_md, max_description=3500)

    return {
        "weapons": sorted(weapons, key=lambda row: row["name"].casefold()),
        "armor": sorted(armor, key=lambda row: row["name"].casefold()),
        "rules_sections": rules_sections,
    }


def write_payload(filename: str, key: str, items: list | dict, *, extra: dict | None = None) -> None:
    payload: dict = {
        "_license": LICENSE,
        "_source_note": MARKDOWN_SOURCE if filename != "equipment.json" else f"{MARKDOWN_SOURCE} {OPEN5E_SOURCE}",
    }
    if extra:
        payload.update(extra)
    payload[key] = items
    path = OUT_DIR / filename
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Fetching SRD markdown sources...")
    origins_md = fetch_text(ORIGINS_URL)
    feats_md = fetch_text(FEATS_URL)
    equipment_md = fetch_text(EQUIPMENT_URL)
    glossary_md = fetch_text(GLOSSARY_URL)

    species = build_species(origins_md)
    backgrounds = build_backgrounds(origins_md)
    feats = build_feats(feats_md)
    glossary = build_glossary(glossary_md)
    equipment = build_equipment(equipment_md)

    write_payload("species.json", "species", species)
    write_payload("backgrounds.json", "backgrounds", backgrounds)
    write_payload("feats.json", "feats", feats)
    write_payload("glossary.json", "glossary", glossary)
    write_payload("equipment.json", "equipment", equipment)

    print(
        f"Wrote {len(species)} species, {len(backgrounds)} backgrounds, "
        f"{len(feats)} feats, {len(glossary)} glossary entries, "
        f"{len(equipment['weapons'])} weapons, {len(equipment['armor'])} armor pieces"
    )


if __name__ == "__main__":
    main()
