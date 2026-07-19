#!/usr/bin/env python3
"""Extract 2024-format monster stat blocks into a private overlay (not for redistribution).

Requires: pymupdf (`pip install pymupdf`)
Input:  reference/MM_2024.pdf  (local lawfully possessed PDF — currently Dragonix Expanded MM)
Output: backend/data/private-2024/monsters.json  (gitignored)
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
PDF_PATH = ROOT / "reference" / "MM_2024.pdf"
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "private-2024"

LICENSE = (
    "Private campaign overlay extracted from a lawfully possessed Monster Manual PDF "
    "(2024-format stat blocks). Not redistributed. Fan Content / personal-group use only."
)

_BLOCK = re.compile(
    r"^([A-Z][^\n]{1,80})\n"
    r"((?:Tiny|Small|Medium|Large|Huge|Gargantuan)[^\n]+)\n"
    r"AC\s+(\d+)\s*\n?\s*Initiative\s*\+(\d+)\s*\((\d+)\)\n"
    r"HP\s+(\d+)\s*\(([^)]+)\)\n"
    r"Speed\s+([^\n]+)\n"
    r"(.*?)(?="
    r"^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b"
    r"|^[A-Z][^\n]{1,80}\n(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b"
    r"|\Z)",
    re.M | re.S | re.I,
)

_CR = re.compile(r"^CR\s+([0-9/½¼⅛]+)\s*\(XP\s*([\d,]+);\s*PB\s*\+(\d+)\)", re.M | re.I)
_SIZE_TYPE = re.compile(
    r"^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([^,]+),\s*(.+)$",
    re.I,
)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_speed(raw: str) -> dict:
    speed: dict[str, int] = {}
    for mode, feet in re.findall(
        r"(?i)(?:^|,\s*)(?:(walk|fly|swim|burrow|climb)\s+)?(\d+)\s*ft\.?",
        raw,
    ):
        key = (mode or "walk").lower()
        speed[key] = int(feet)
    if "walk" not in speed:
        first = re.search(r"(\d+)\s*ft", raw, re.I)
        if first:
            speed["walk"] = int(first.group(1))
    return speed


def _parse_abilities(text: str) -> tuple[dict[str, int], dict[str, int]]:
    scores: dict[str, int] = {}
    saves: dict[str, int] = {}
    for ability in ("Str", "Dex", "Con", "Int", "Wis", "Cha"):
        match = re.search(
            rf"{ability}\s+(\d+)\s*\n\s*([+-]?\d+)\s*\n\s*([+-]?\d+)",
            text,
            re.I,
        )
        if not match:
            continue
        key = ability.lower()
        score = int(match.group(1))
        mod = int(match.group(2))
        save = int(match.group(3))
        scores[key] = score
        if save != mod:
            saves[key] = save
    return scores, saves


def _parse_skill_map(line: str) -> dict[str, int]:
    skills: dict[str, int] = {}
    for name, bonus in re.findall(r"([A-Za-z][A-Za-z '/]+?)\s+([+-]\d+)", line):
        skills[name.strip().lower()] = int(bonus)
    return skills


def _parse_senses(line: str) -> dict:
    senses: dict = {}
    for mode in ("darkvision", "blindsight", "tremorsense", "truesight"):
        match = re.search(rf"{mode}\s+(\d+)\s*ft", line, re.I)
        if match:
            senses[mode] = int(match.group(1))
    passive = re.search(r"Passive Perception\s+(\d+)", line, re.I)
    if passive:
        senses["passive_perception"] = int(passive.group(1))
    return senses


def _parse_csv_line(line: str) -> list[str]:
    return [part.strip() for part in re.split(r",|;", line) if part.strip()]


def _parse_named_abilities(section: str) -> list[dict]:
    if not section.strip():
        return []
    entries: list[dict] = []
    pattern = re.compile(
        r"(?m)^([A-Z][^.\n]{0,80})\.\s*(.*?)(?=^[A-Z][^.\n]{0,80}\.\s*|\Z)",
        re.S,
    )
    for match in pattern.finditer(section.strip()):
        name = re.sub(r"\s+", " ", match.group(1)).strip()
        description = re.sub(r"\s*\n\s*", " ", match.group(2)).strip()
        if not name or not description:
            continue
        if name.casefold() in {"traits", "actions", "bonus actions", "reactions"}:
            continue
        entries.append({"name": name, "description": description})
    return entries


def _section_body(text: str, header: str) -> str:
    match = re.search(
        rf"(?ims)^{re.escape(header)}\s*\n(.*?)(?=^(?:Traits|Actions|Bonus Actions|Reactions|Legendary Actions|Mythic Actions)\b|\Z)",
        text,
    )
    return match.group(1).strip() if match else ""


def _build_stat_block(body: str, speed_raw: str) -> dict:
    scores, saves = _parse_abilities(body)
    skills_match = re.search(r"(?im)^Skills\s+(.+)$", body)
    senses_match = re.search(r"(?im)^Senses\s+(.+)$", body)
    languages_match = re.search(r"(?im)^Languages\s+(.+)$", body)
    immunities_match = re.search(r"(?im)^Immunities\s+(.+)$", body)
    resistances_match = re.search(r"(?im)^Resistances\s+(.+)$", body)
    vulnerabilities_match = re.search(r"(?im)^Vulnerabilities\s+(.+)$", body)
    gear_match = re.search(r"(?im)^Gear\s+(.+)$", body)

    damage_immunities: list[str] = []
    condition_immunities: list[str] = []
    if immunities_match:
        chunks = [c.strip() for c in immunities_match.group(1).split(";") if c.strip()]
        if len(chunks) >= 2:
            damage_immunities = _parse_csv_line(chunks[0])
            condition_immunities = _parse_csv_line(chunks[1])
        elif chunks:
            # Heuristic: condition-looking words vs damage types
            items = _parse_csv_line(chunks[0])
            for item in items:
                if re.search(
                    r"(?i)blinded|charmed|deafened|exhaustion|frightened|grappled|"
                    r"incapacitated|invisible|paralyzed|petrified|poisoned|prone|"
                    r"restrained|stunned|unconscious",
                    item,
                ):
                    condition_immunities.append(item)
                else:
                    damage_immunities.append(item)

    stat: dict = {
        "schema_version": 1,
        "speed": _parse_speed(speed_raw),
        "raw_text": body[:12000],
    }
    if scores:
        stat["ability_scores"] = scores
    if saves:
        stat["saving_throws"] = saves
    if skills_match:
        skills = _parse_skill_map(skills_match.group(1))
        if skills:
            stat["skills"] = skills
    if senses_match:
        senses = _parse_senses(senses_match.group(1))
        if senses:
            stat["senses"] = senses
    if languages_match:
        languages = _parse_csv_line(languages_match.group(1).replace(";", ","))
        if languages:
            stat["languages"] = languages
    if damage_immunities:
        stat["damage_immunities"] = damage_immunities
    if condition_immunities:
        stat["condition_immunities"] = condition_immunities
    if resistances_match:
        stat["damage_resistances"] = _parse_csv_line(resistances_match.group(1))
    if vulnerabilities_match:
        stat["damage_vulnerabilities"] = _parse_csv_line(vulnerabilities_match.group(1))
    if gear_match:
        stat["gear"] = gear_match.group(1).strip()

    traits = _parse_named_abilities(_section_body(body, "Traits"))
    actions = _parse_named_abilities(_section_body(body, "Actions"))
    bonus = _parse_named_abilities(_section_body(body, "Bonus Actions"))
    reactions = _parse_named_abilities(_section_body(body, "Reactions"))
    legendary = _parse_named_abilities(_section_body(body, "Legendary Actions"))
    if traits:
        stat["traits"] = traits
    if actions:
        stat["actions"] = actions
    if bonus:
        stat["bonus_actions"] = bonus
    if reactions:
        stat["reactions"] = reactions
    if legendary:
        stat["legendary_actions"] = legendary
    return stat


def _parse_cr(text: str) -> tuple[str | None, float | None, int | None]:
    match = _CR.search(text)
    if not match:
        return None, None, None
    raw = match.group(1).replace("½", "1/2").replace("¼", "1/4").replace("⅛", "1/8")
    xp = None
    try:
        xp = int(match.group(2).replace(",", ""))
    except ValueError:
        pass
    pb = int(match.group(3))
    numeric: float | None
    if "/" in raw:
        num, den = raw.split("/", 1)
        numeric = float(num) / float(den)
    else:
        try:
            numeric = float(raw)
        except ValueError:
            numeric = None
    return raw, numeric, pb


def _parse_size_type(line: str) -> tuple[str | None, str | None, str | None]:
    match = _SIZE_TYPE.match(line.strip())
    if not match:
        return None, None, None
    size = match.group(1).title()
    creature_type = match.group(2).strip()
    alignment = match.group(3).strip()
    # Strip parenthetical tags from type for top-level field, keep full in type_line
    base_type = re.sub(r"\s*\([^)]*\)\s*", "", creature_type).strip().lower()
    return size, base_type or None, alignment


def extract_monsters(doc: fitz.Document) -> list[dict]:
    monsters: list[dict] = []
    seen: set[str] = set()
    for page_index in range(doc.page_count):
        text = doc.load_page(page_index).get_text("text").replace("\t", " ")
        for match in _BLOCK.finditer(text):
            name = re.sub(r"\s+", " ", match.group(1)).strip()
            if name.casefold() in {"traits", "actions", "bonus actions", "reactions", "legendary actions"}:
                continue
            key = name.casefold()
            if key in seen:
                continue
            seen.add(key)
            type_line = match.group(2).strip()
            size, creature_type, alignment = _parse_size_type(type_line)
            ac = int(match.group(3))
            init_mod = int(match.group(4))
            init_score = int(match.group(5))
            hp_max = int(match.group(6))
            hp_formula = re.sub(r"\s+", "", match.group(7))
            speed_raw = match.group(8).strip()
            body = match.group(9).strip()
            cr, cr_numeric, pb = _parse_cr(body)
            xp = None
            cr_match = _CR.search(body)
            if cr_match:
                try:
                    xp = int(cr_match.group(2).replace(",", ""))
                except ValueError:
                    xp = None
            monsters.append(
                {
                    "id": f"private:{slugify(name)}",
                    "name": name,
                    "slug": slugify(name),
                    "source": "MM Expanded 2024",
                    "edition": "2024",
                    "attribution": "Private overlay — not for redistribution",
                    "size": size,
                    "type": creature_type,
                    "alignment": alignment,
                    "type_line": type_line,
                    "armor_class": ac,
                    "initiative_modifier": init_mod,
                    "initiative_score": init_score,
                    "initiative_printed": True,
                    "hp_max": hp_max,
                    "hp_formula": hp_formula,
                    "cr": cr,
                    "cr_numeric": cr_numeric,
                    "proficiency_bonus": pb,
                    "xp": xp,
                    "stat_block_json": _build_stat_block(body, speed_raw),
                    "page": page_index + 1,
                }
            )
    monsters.sort(key=lambda row: row["name"].casefold())
    return monsters


def main() -> None:
    if not PDF_PATH.is_file():
        raise SystemExit(f"Missing PDF: {PDF_PATH}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF_PATH)
    monsters = extract_monsters(doc)
    payload = {
        "_license": LICENSE,
        "_source_note": (
            "Extracted locally from reference/MM_2024.pdf. "
            "Gitignored. Prefer printed Initiative (Dex+PB style) over legacy Dex-only."
        ),
        "monsters": monsters,
    }
    out = OUT_DIR / "monsters.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {out.name} monsters={len(monsters)}")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = {}
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}
    counts = dict(manifest.get("counts") or {})
    counts["monsters"] = len(monsters)
    manifest["counts"] = counts
    manifest["mm_source"] = "reference/MM_2024.pdf"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Updated manifest.json")


if __name__ == "__main__":
    main()
