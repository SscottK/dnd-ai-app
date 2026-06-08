#!/usr/bin/env python3
"""Build complete SRD 5.2.1 JSON dataset for Quest Terminal.

Run from backend/:  python scripts/build_srd_all.py

Sources (all CC-BY 4.0):
- cocoajamworld/srd-5.2.1 — monsters, conditions
- Open5e API (wotc-srd) — spells, weapons, armor, combat class features
- downfallx/dnd-5e-srd-markdown — 2024 SRD text for classes, magic items, gear, animals, rules
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = BACKEND_ROOT / "data" / "srd-5.2.1"
MARKDOWN_BASE = "https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master"
COCOAJAM_BASE = "https://raw.githubusercontent.com/cocoajamworld/srd-5.2.1/main/data"

LICENSE = (
    "Source: D&D System Reference Document v5.2.1, © Wizards of the Coast LLC, "
    "licensed under CC-BY 4.0."
)

BACKGROUND_SKIP = {
    "Ability Scores",
    "Feat",
    "Skill Proficiencies",
    "Tool Proficiency",
    "Equipment",
}
SPECIES_SKIP = {"Creature Type", "Size", "Speed", "Special Traits"}
MAGIC_ITEM_SKIP = {"Spells Cast from Items", "Charges", "Spells", "Conflict"}

RULES_DOCUMENTS = [
    ("playing-the-game.md", "playing-the-game", "Playing the Game"),
    ("character-creation.md", "character-creation", "Character Creation"),
    ("gameplay-toolbox.md", "gameplay-toolbox", "Gameplay Toolbox"),
    ("monsters.md", "monsters-overview", "Monsters Overview"),
]

GEAR_SECTIONS = [
    ("## Adventuring Gear", "## Mounts and Vehicles"),
    ("## Tools", "## Adventuring Gear"),
]


def _load_rules_builder():
    path = BACKEND_ROOT / "scripts" / "build_srd_rules_data.py"
    spec = importlib.util.spec_from_file_location("build_srd_rules_data", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load build_srd_rules_data.py")
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(BACKEND_ROOT))
    spec.loader.exec_module(module)
    return module


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "dnd-ai-app/1.0 (SRD complete build)"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read().decode("utf-8")


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "dnd-ai-app/1.0 (SRD complete build)"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "entry"


def write_json(filename: str, payload: dict) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / filename
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


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
    max_description: int = 8000,
    strip_price: bool = False,
) -> list[dict]:
    entries: list[dict] = []
    if not section.strip():
        return entries

    for chunk in re.split(r"\n#### ", section)[1:]:
        lines = chunk.split("\n", 1)
        raw_name = lines[0].strip()
        if not raw_name or raw_name in skip:
            continue

        name = raw_name
        cost = None
        if strip_price:
            match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", raw_name)
            if match:
                name = match.group(1).strip()
                cost = match.group(2).strip()

        body = lines[1].strip() if len(lines) > 1 else ""
        entry: dict = {
            "name": name,
            "slug": slugify(name),
            "description": body[:max_description],
        }
        if cost:
            entry["cost"] = cost
        fields = parse_field_lines(body)
        if fields:
            entry["fields"] = fields
        entries.append(entry)
    return entries


def parse_h2_sections(markdown: str, *, max_content: int = 16000) -> list[dict]:
    sections: list[dict] = []
    for chunk in re.split(r"\n## ", markdown)[1:]:
        lines = chunk.split("\n", 1)
        name = lines[0].strip()
        if not name:
            continue
        content = lines[1].strip() if len(lines) > 1 else ""
        sections.append(
            {
                "name": name,
                "slug": slugify(name),
                "content": content[:max_content],
            }
        )
    return sections


def parse_h3_sections(markdown: str, *, max_description: int = 8000) -> list[dict]:
    sections: list[dict] = []
    for chunk in re.split(r"\n### ", markdown)[1:]:
        lines = chunk.split("\n", 1)
        name = lines[0].strip()
        if not name:
            continue
        body = lines[1].strip() if len(lines) > 1 else ""
        sections.append({"name": name, "slug": slugify(name), "description": body[:max_description]})
    return sections


def build_monsters_and_conditions() -> tuple[int, int]:
    monsters = fetch_json(f"{COCOAJAM_BASE}/monsters.json")
    conditions = fetch_json(f"{COCOAJAM_BASE}/conditions.json")
    write_json("monsters.json", monsters)
    write_json("conditions.json", conditions)
    return len(monsters.get("monsters") or []), len(conditions.get("conditions") or [])


def build_spells_and_combat(rules_mod) -> tuple[int, int, int]:
    classes = rules_mod.paginate("https://api.open5e.com/v1/classes/?document__slug=wotc-srd&limit=50")
    class_features: list[dict] = []
    seen: set[str] = set()
    for class_entry in classes:
        for feature in rules_mod.parse_class_features(class_entry):
            key = feature["name"].casefold()
            if key in seen:
                continue
            seen.add(key)
            class_features.append(feature)

    combat_payload = {
        "_license": LICENSE,
        "_source_note": "Open5e wotc-srd classes + SRD 5.2.1 standard actions",
        "standard_actions": rules_mod.STANDARD_ACTIONS,
        "class_features": sorted(class_features, key=lambda row: row["name"].casefold()),
    }
    write_json("combat_actions.json", combat_payload)

    spells_raw = rules_mod.paginate("https://api.open5e.com/v1/spells/?document__slug=wotc-srd&limit=100")
    spells = []
    for spell in spells_raw:
        name = spell.get("name")
        if not name:
            continue
        spells.append(
            {
                "name": name,
                "slug": spell.get("slug"),
                "level": spell.get("spell_level"),
                "school": spell.get("school"),
                "action_type": rules_mod.infer_spell_action_type(spell),
                "targeting": rules_mod.infer_spell_targeting(spell),
                "range": spell.get("range"),
                "casting_time": spell.get("casting_time"),
                "components": spell.get("components"),
                "duration": spell.get("duration"),
                "ritual": spell.get("ritual"),
                "concentration": spell.get("concentration"),
                "description": spell.get("desc") or "",
            }
        )
    write_json(
        "spells.json",
        {
            "_license": LICENSE,
            "_source_note": "Open5e wotc-srd spells (full descriptions)",
            "spells": sorted(spells, key=lambda row: row["name"].casefold()),
        },
    )
    return len(spells), len(rules_mod.STANDARD_ACTIONS), len(class_features)


def build_origins_and_feats(markdown: dict[str, str]) -> dict[str, int]:
    origins_md = markdown["character-origins.md"]
    species = parse_h4_entries(
        extract_section(origins_md, "### Species Descriptions", None),
        skip=SPECIES_SKIP,
    )
    backgrounds = parse_h4_entries(
        extract_section(origins_md, "### Background Descriptions", "## Character Species"),
        skip=BACKGROUND_SKIP,
    )
    feats = parse_h4_entries(
        extract_section(markdown["feats.md"], "## Feat Descriptions", None),
        skip=set(),
    )
    glossary_entries = parse_h4_entries(
        extract_section(markdown["rules-glossary.md"], "## Glossary Conventions", None),
        skip=set(),
        max_description=4000,
    )
    for entry in glossary_entries:
        tag_match = re.search(r"\[([^\]]+)\]", entry["name"])
        if tag_match:
            entry["tag"] = tag_match.group(1)
            entry["name"] = re.sub(r"\s*\[[^\]]+\]\s*", "", entry["name"]).strip()
            entry["slug"] = slugify(entry["name"])

    write_json("species.json", {"_license": LICENSE, "species": species})
    write_json("backgrounds.json", {"_license": LICENSE, "backgrounds": backgrounds})
    write_json("feats.json", {"_license": LICENSE, "feats": feats})
    write_json("glossary.json", {"_license": LICENSE, "glossary": glossary_entries})
    return {
        "species": len(species),
        "backgrounds": len(backgrounds),
        "feats": len(feats),
        "glossary": len(glossary_entries),
    }


def build_classes(classes_md: str) -> int:
    classes = parse_h2_sections(classes_md, max_content=120000)
    write_json(
        "classes.json",
        {
            "_license": LICENSE,
            "_source_note": "downfallx/dnd-5e-srd-markdown classes.md",
            "classes": classes,
        },
    )
    return len(classes)


def build_magic_items(magic_items_md: str) -> int:
    items = parse_h4_entries(magic_items_md, skip=MAGIC_ITEM_SKIP, max_description=12000)
    write_json(
        "magic_items.json",
        {
            "_license": LICENSE,
            "_source_note": "downfallx/dnd-5e-srd-markdown magic-items.md",
            "magic_items": items,
        },
    )
    return len(items)


def build_animals(animals_md: str) -> int:
    animals = parse_h2_sections(animals_md, max_content=20000)
    write_json(
        "animals.json",
        {
            "_license": LICENSE,
            "_source_note": "downfallx/dnd-5e-srd-markdown animals.md",
            "animals": animals,
        },
    )
    return len(animals)


def build_equipment_bundle(equipment_md: str, rules_mod) -> dict[str, int]:
    weapons_raw = rules_mod.paginate("https://api.open5e.com/v1/weapons/?document__slug=wotc-srd&limit=50")
    armor_raw = rules_mod.paginate("https://api.open5e.com/v1/armor/?document__slug=wotc-srd&limit=50")

    weapons = [
        {
            "name": row["name"],
            "slug": row.get("slug") or slugify(row["name"]),
            "category": row.get("category"),
            "cost": row.get("cost"),
            "damage_dice": row.get("damage_dice"),
            "damage_type": row.get("damage_type"),
            "weight": row.get("weight"),
            "properties": row.get("properties") or [],
        }
        for row in weapons_raw
        if row.get("name")
    ]
    armor = [
        {
            "name": row["name"],
            "slug": row.get("slug") or slugify(row["name"]),
            "category": row.get("category"),
            "cost": row.get("cost"),
            "ac_base": row.get("base_ac"),
            "ac_add_dexmod": row.get("plus_dex_mod"),
            "ac_cap_dexmod": row.get("plus_dex_mod_cap"),
            "strength_requirement": row.get("strength_requirement"),
            "stealth_disadvantage": row.get("stealth_disadvantage"),
            "weight": row.get("weight"),
        }
        for row in armor_raw
        if row.get("name")
    ]

    gear: list[dict] = []
    for start, end in GEAR_SECTIONS:
        section = extract_section(equipment_md, start, end)
        gear.extend(parse_h4_entries(section, skip=set(), strip_price=True, max_description=4000))

    chapters = parse_h2_sections(equipment_md, max_content=20000)
    subsection_rules = parse_h3_sections(equipment_md, max_description=8000)

    write_json(
        "equipment.json",
        {
            "_license": LICENSE,
            "_source_note": "Open5e weapons/armor + downfallx equipment.md gear and rules",
            "equipment": {
                "weapons": sorted(weapons, key=lambda row: row["name"].casefold()),
                "armor": sorted(armor, key=lambda row: row["name"].casefold()),
                "gear": sorted(gear, key=lambda row: row["name"].casefold()),
                "chapters": chapters,
                "subsections": subsection_rules,
            },
        },
    )
    return {
        "weapons": len(weapons),
        "armor": len(armor),
        "gear": len(gear),
        "equipment_chapters": len(chapters),
    }


def build_rules_documents(markdown: dict[str, str]) -> int:
    documents = []
    section_count = 0
    for filename, doc_id, title in RULES_DOCUMENTS:
        content = markdown.get(filename, "")
        sections = parse_h2_sections(content, max_content=24000)
        section_count += len(sections)
        documents.append({"id": doc_id, "title": title, "source_file": filename, "sections": sections})

    write_json(
        "rules_documents.json",
        {
            "_license": LICENSE,
            "_source_note": "downfallx/dnd-5e-srd-markdown rules chapters",
            "documents": documents,
        },
    )
    return section_count


def build_manifest(counts: dict[str, int]) -> None:
    write_json(
        "manifest.json",
        {
            "_license": LICENSE,
            "_edition": "5.2.1",
            "counts": counts,
            "files": sorted({* (p.name for p in OUT_DIR.glob("*.json")), "manifest.json"}),
        },
    )


def main() -> None:
    print("Building complete SRD 5.2.1 dataset...")
    rules_mod = _load_rules_builder()

    counts: dict[str, int] = {}

    print("  monsters + conditions (cocoajamworld)...")
    counts["monsters"], counts["conditions"] = build_monsters_and_conditions()

    print("  spells + combat actions (Open5e)...")
    counts["spells"], counts["standard_actions"], counts["class_features"] = build_spells_and_combat(rules_mod)

    print("  fetching markdown sources...")
    markdown_files = [
        "character-origins.md",
        "feats.md",
        "rules-glossary.md",
        "equipment.md",
        "classes.md",
        "magic-items.md",
        "animals.md",
        *{name for name, _, _ in RULES_DOCUMENTS},
    ]
    markdown = {name: fetch_text(f"{MARKDOWN_BASE}/{name}") for name in sorted(set(markdown_files))}

    print("  species, backgrounds, feats, glossary...")
    counts.update(build_origins_and_feats(markdown))

    print("  classes...")
    counts["classes"] = build_classes(markdown["classes.md"])

    print("  magic items...")
    counts["magic_items"] = build_magic_items(markdown["magic-items.md"])

    print("  animals...")
    counts["animals"] = build_animals(markdown["animals.md"])

    print("  equipment (weapons, armor, gear, chapters)...")
    counts.update(build_equipment_bundle(markdown["equipment.md"], rules_mod))

    print("  rules documents...")
    counts["rules_sections"] = build_rules_documents(markdown) + counts.get("equipment_chapters", 0)

    build_manifest(counts)

    print("\nSRD 5.2.1 build complete:")
    for key, value in sorted(counts.items()):
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
