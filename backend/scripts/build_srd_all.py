#!/usr/bin/env python3
"""Build complete SRD 5.2.1 JSON dataset for Quest Terminal.

Run from backend/:  python scripts/build_srd_all.py

Sources (all CC-BY 4.0):
- cocoajamworld/srd-5.2.1 — monsters, conditions
- downfallx/dnd-5e-srd-markdown — 2024 SRD text (spells, classes, equipment, magic items, gear, animals, rules)
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


def _extract_html_table(section: str, marker: str) -> str:
    start = section.find(marker)
    if start < 0:
        return ""
    table_start = section.find("<table>", start)
    if table_start < 0:
        return ""
    table_end = section.find("</table>", table_start)
    if table_end < 0:
        return ""
    return section[table_start : table_end + len("</table>")]


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _parse_html_table_rows(table_html: str) -> list[tuple[str, list[str]]]:
    rows: list[tuple[str, list[str]]] = []
    for match in re.finditer(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.IGNORECASE | re.DOTALL):
        row_html = match.group(1)
        if re.search(r"<th[^>]*\s+colspan", row_html, flags=re.IGNORECASE):
            category = _strip_html(row_html)
            if category:
                rows.append(("category", [category]))
            continue
        cells = [_strip_html(cell) for cell in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.IGNORECASE | re.DOTALL)]
        if cells:
            rows.append(("data", cells))
    return rows


def _parse_damage_cell(damage: str) -> tuple[str | None, str | None]:
    match = re.match(r"^(\d+d\d+)\s+(.+)$", damage.strip(), flags=re.IGNORECASE)
    if not match:
        return None, None
    return match.group(1), match.group(2).strip().lower()


def _parse_ac_fields(ac_text: str) -> dict:
    ac_text = ac_text.strip()
    if ac_text.startswith("+"):
        return {"ac_base": int(ac_text.replace("+", "").strip()), "category": "Shield"}
    match = re.match(r"^(\d+)(?:\s*\+\s*Dex(?:terity)?(?:\s+modifier)?(?:\s*\(max\s*(\d+)\))?)?", ac_text, flags=re.IGNORECASE)
    if not match:
        return {"ac_text": ac_text}
    result: dict = {"ac_base": int(match.group(1))}
    if "dex" in ac_text.casefold():
        result["ac_add_dexmod"] = True
    if match.group(2):
        result["ac_cap_dexmod"] = int(match.group(2))
    return result


def parse_weapons_from_markdown(equipment_md: str) -> list[dict]:
    section = extract_section(equipment_md, "## Weapons", "## Armor")
    table_html = _extract_html_table(section, "**Weapons**")
    weapons: list[dict] = []
    category = "Weapon"
    for row_type, cells in _parse_html_table_rows(table_html):
        if row_type == "category":
            category = cells[0]
            continue
        if len(cells) < 6:
            continue
        name, damage, properties, mastery, weight, cost = cells[:6]
        damage_dice, damage_type = _parse_damage_cell(damage)
        props = [part.strip() for part in properties.split(",") if part.strip() and part.strip() != "—"]
        weapons.append(
            {
                "name": name,
                "slug": slugify(name),
                "category": category,
                "cost": cost,
                "damage_dice": damage_dice,
                "damage_type": damage_type,
                "weight": weight,
                "properties": props,
                "mastery": mastery if mastery != "—" else None,
            }
        )
    return weapons


def parse_armor_from_markdown(equipment_md: str) -> list[dict]:
    section = extract_section(equipment_md, "## Armor", "## Tools")
    table_html = _extract_html_table(section, "**Armor**")
    armor: list[dict] = []
    category = "Armor"
    for row_type, cells in _parse_html_table_rows(table_html):
        if row_type == "category":
            category = cells[0]
            continue
        if len(cells) < 6:
            continue
        name, ac_text, strength, stealth, weight, cost = cells[:6]
        entry: dict = {
            "name": name,
            "slug": slugify(name),
            "category": category,
            "cost": cost,
            "weight": weight,
            **_parse_ac_fields(ac_text),
        }
        if strength and strength != "—":
            str_match = re.search(r"(\d+)", strength)
            if str_match:
                entry["strength_requirement"] = int(str_match.group(1))
        if stealth and stealth != "—":
            entry["stealth_disadvantage"] = True
        armor.append(entry)
    return armor


def _parse_spell_subtitle(line: str) -> dict:
    cleaned = line.strip().strip("_").strip()
    cantrip_match = re.match(r"^(\w+)\s+Cantrip\s*\((.+)\)\s*$", cleaned, flags=re.IGNORECASE)
    if cantrip_match:
        return {
            "level": 0,
            "school": cantrip_match.group(1),
            "classes": cantrip_match.group(2).strip(),
        }
    level_match = re.match(r"^Level\s+(\d+)\s+(\w+)\s*\((.+)\)\s*$", cleaned, flags=re.IGNORECASE)
    if level_match:
        return {
            "level": int(level_match.group(1)),
            "school": level_match.group(2),
            "classes": level_match.group(3).strip(),
        }
    return {}


def _parse_spell_fields(body: str) -> tuple[dict[str, str], str]:
    fields: dict[str, str] = {}
    description_lines: list[str] = []
    in_description = False
    for line in body.splitlines():
        if in_description:
            description_lines.append(line)
            continue
        match = re.match(r"^\*\*(.+?):\*\*\s*(.*)$", line.strip())
        if match:
            fields[match.group(1)] = match.group(2).strip()
            continue
        if not line.strip():
            if fields:
                in_description = True
            continue
        description_lines.append(line)
    return fields, "\n".join(description_lines).strip()


def _spell_flags(fields: dict[str, str]) -> tuple[str, str]:
    casting = fields.get("Casting Time", "")
    duration = fields.get("Duration", "")
    ritual = "yes" if re.search(r"\britual\b", casting, flags=re.IGNORECASE) else "no"
    concentration = "yes" if re.search(r"\bconcentration\b", duration, flags=re.IGNORECASE) else "no"
    return ritual, concentration


def parse_spells_from_markdown(spells_md: str, rules_mod) -> list[dict]:
    if "## Spell Descriptions" not in spells_md:
        return []
    section = spells_md.split("## Spell Descriptions", 1)[1]
    spells: list[dict] = []
    for chunk in re.split(r"\n#### ", section)[1:]:
        lines = chunk.split("\n", 1)
        name = lines[0].strip()
        if not name:
            continue
        raw_body = lines[1].strip() if len(lines) > 1 else ""
        subtitle = ""
        body = raw_body
        for line in raw_body.splitlines():
            stripped = line.strip()
            if stripped.startswith("_") and stripped.endswith("_"):
                subtitle = stripped
                body = "\n".join(raw_body.splitlines()[1:]).strip()
                break
            if stripped:
                break
        meta = _parse_spell_subtitle(subtitle)
        if "level" not in meta:
            continue
        fields, description = _parse_spell_fields(body)
        ritual, concentration = _spell_flags(fields)
        spell_stub = {
            "name": name,
            "desc": description,
            "range": fields.get("Range", ""),
            "casting_time": fields.get("Casting Time", ""),
        }
        spells.append(
            {
                "name": name,
                "slug": slugify(name),
                "level": meta["level"],
                "school": meta.get("school"),
                "classes": meta.get("classes"),
                "action_type": rules_mod.infer_spell_action_type(spell_stub),
                "targeting": rules_mod.infer_spell_targeting(spell_stub),
                "range": fields.get("Range"),
                "casting_time": fields.get("Casting Time"),
                "components": fields.get("Components"),
                "duration": fields.get("Duration"),
                "ritual": ritual,
                "concentration": concentration,
                "description": description,
            }
        )
    return spells


_SKIP_CLASS_FEATURE_NAMES = {
    "Ability Score Improvement",
    "Epic Boon",
    "—",
    "-",
}


def parse_class_features_from_markdown(classes_md: str, rules_mod) -> list[dict]:
    features: list[dict] = []
    seen: set[str] = set()
    for chunk in re.split(r"\n## ", classes_md)[1:]:
        lines = chunk.split("\n", 1)
        class_name = lines[0].strip()
        if not class_name or class_name.startswith("Contents"):
            continue
        body = lines[1] if len(lines) > 1 else ""
        current_subclass: str | None = None
        for section in re.split(r"\n### ", body)[1:]:
            section_lines = section.split("\n", 1)
            section_title = section_lines[0].strip()
            section_body = section_lines[1] if len(section_lines) > 1 else ""
            if "Spell List" in section_title or section_title.startswith("Becoming a"):
                continue
            if "Subclass:" in section_title:
                current_subclass = section_title.split("Subclass:", 1)[1].strip()
            elif section_title.endswith("Class Features"):
                current_subclass = None
            for feat_chunk in re.split(r"\n#### ", section_body)[1:]:
                feat_lines = feat_chunk.split("\n", 1)
                header = feat_lines[0].strip()
                feat_body = feat_lines[1].strip() if len(feat_lines) > 1 else ""
                level_match = re.match(r"Level\s+(\d+):\s*(.+)", header, flags=re.IGNORECASE)
                if not level_match:
                    continue
                feat_name = level_match.group(2).strip()
                if feat_name in _SKIP_CLASS_FEATURE_NAMES:
                    continue
                action_type = rules_mod.infer_action_type(feat_body)
                if action_type is None:
                    continue
                key = feat_name.casefold()
                if key in seen:
                    continue
                seen.add(key)
                entry = {
                    "name": feat_name,
                    "action_type": action_type,
                    "targeting": rules_mod.infer_targeting(feat_name, feat_body, category="feature"),
                    "category": "class_feature",
                    "source_class": class_name,
                    "description": feat_body[:500],
                    "min_level": int(level_match.group(1)),
                }
                if current_subclass:
                    entry["source_subclass"] = current_subclass
                healing = rules_mod.parse_healing_dice(feat_body)
                if healing:
                    entry["healing_dice"] = healing
                features.append(entry)
    return features


def build_monsters_and_conditions() -> tuple[int, int]:
    monsters = fetch_json(f"{COCOAJAM_BASE}/monsters.json")
    conditions = fetch_json(f"{COCOAJAM_BASE}/conditions.json")
    monsters["_license"] = LICENSE
    monsters["_source_note"] = "cocoajamworld/srd-5.2.1"
    conditions["_license"] = LICENSE
    conditions["_source_note"] = "cocoajamworld/srd-5.2.1"
    write_json("monsters.json", monsters)
    write_json("conditions.json", conditions)
    return len(monsters.get("monsters") or []), len(conditions.get("conditions") or [])


def build_spells_and_combat(rules_mod, *, spells_md: str, classes_md: str) -> tuple[int, int, int]:
    class_features = parse_class_features_from_markdown(classes_md, rules_mod)
    combat_payload = {
        "_license": LICENSE,
        "_source_note": "downfallx/dnd-5e-srd-markdown classes.md + SRD 5.2.1 standard actions",
        "standard_actions": rules_mod.STANDARD_ACTIONS,
        "class_features": sorted(class_features, key=lambda row: row["name"].casefold()),
    }
    write_json("combat_actions.json", combat_payload)

    spells = parse_spells_from_markdown(spells_md, rules_mod)
    write_json(
        "spells.json",
        {
            "_license": LICENSE,
            "_source_note": "downfallx/dnd-5e-srd-markdown spells.md (SRD 5.2 / 2024 rules)",
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


def build_equipment_bundle(equipment_md: str) -> dict[str, int]:
    weapons = parse_weapons_from_markdown(equipment_md)
    armor = parse_armor_from_markdown(equipment_md)

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
            "_source_note": "downfallx/dnd-5e-srd-markdown equipment.md (weapons, armor, gear, rules)",
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

    print("  fetching markdown sources...")
    markdown_files = [
        "character-origins.md",
        "feats.md",
        "rules-glossary.md",
        "equipment.md",
        "classes.md",
        "magic-items.md",
        "animals.md",
        "spells.md",
        *{name for name, _, _ in RULES_DOCUMENTS},
    ]
    markdown = {name: fetch_text(f"{MARKDOWN_BASE}/{name}") for name in sorted(set(markdown_files))}

    print("  spells + combat actions (2024 markdown)...")
    counts["spells"], counts["standard_actions"], counts["class_features"] = build_spells_and_combat(
        rules_mod,
        spells_md=markdown["spells.md"],
        classes_md=markdown["classes.md"],
    )

    print("  species, backgrounds, feats, glossary...")
    counts.update(build_origins_and_feats(markdown))

    print("  classes...")
    counts["classes"] = build_classes(markdown["classes.md"])

    print("  magic items...")
    counts["magic_items"] = build_magic_items(markdown["magic-items.md"])

    print("  animals...")
    counts["animals"] = build_animals(markdown["animals.md"])

    print("  equipment (weapons, armor, gear, chapters)...")
    counts.update(build_equipment_bundle(markdown["equipment.md"]))

    print("  rules documents...")
    counts["rules_sections"] = build_rules_documents(markdown) + counts.get("equipment_chapters", 0)

    build_manifest(counts)

    print("\nSRD 5.2.1 build complete:")
    for key, value in sorted(counts.items()):
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
