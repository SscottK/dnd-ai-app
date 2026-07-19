"""Load and search SRD 5.2.1 JSON catalogs."""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "srd-5.2.1"
_DEFAULT_PRIVATE_DIR = Path(__file__).resolve().parents[2] / "data" / "private-2024"


def _private_dir() -> Path:
    override = os.environ.get("PRIVATE_2024_DIR", "").strip()
    if override:
        return Path(override)
    render_disk = Path("/var/data/private-2024")
    if render_disk.is_dir():
        return render_disk
    return _DEFAULT_PRIVATE_DIR


def _load_json(filename: str) -> dict:
    path = _DATA_DIR / filename
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _load_private_json(filename: str) -> dict:
    path = _private_dir() / filename
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _index_by_name(rows: list[dict]) -> dict[str, dict]:
    return {row["name"].casefold(): row for row in rows if row.get("name")}


def _ocr_garbage_score(text: str | None) -> float:
    """Higher = worse OCR / less usable prose."""
    if not text:
        return 1.0
    sample = str(text)
    if not sample.strip():
        return 1.0
    weird = sum(1 for ch in sample if ch in "·•~<>□�|" or (ord(ch) > 127 and ch not in "—–’‘“”éà"))
    weird += len(re.findall(r"[A-Za-z][!?][A-Za-z]", sample))
    weird += len(re.findall(r"\.\s+\d+\s*,", sample))
    weird += sample.count(" ,")
    weird += len(re.findall(r"\b[Il1O0]{2,}[a-z]{0,2}[!?][A-Za-z]", sample))
    return weird / max(len(sample), 1)


def _merge_spell_rows(existing: dict, private_row: dict) -> dict:
    """Keep clean SRD prose when private OCR is garbled; otherwise prefer private."""
    private_desc = private_row.get("description") or private_row.get("desc")
    srd_desc = existing.get("description") or existing.get("desc")
    private_score = _ocr_garbage_score(private_desc)
    srd_score = _ocr_garbage_score(srd_desc)

    if private_score > 0.01 and srd_desc and private_score >= srd_score:
        # Private OCR is noisy — keep SRD body/school/classes for consistency.
        merged = {
            **private_row,
            **existing,
            "source": existing.get("source") or private_row.get("source") or "srd-5.2.1",
            "edition": private_row.get("edition") or existing.get("edition") or "2024",
        }
        return merged

    merged = {**existing, **private_row}
    school = str(merged.get("school") or "")
    if re.match(r"(?i)^(cantrip|level\s*\d+)$", school.strip()) and existing.get("school"):
        merged["school"] = existing["school"]
    if not merged.get("classes") and existing.get("classes"):
        merged["classes"] = existing["classes"]
    if (not private_desc or private_score > 0.01) and srd_desc:
        merged["description"] = srd_desc
    merged["source"] = private_row.get("source") or existing.get("source") or "PHB 2024"
    return merged


def _merged_index(srd_key: str, private_key: str, filename: str) -> dict[str, dict]:
    """Prefer private 2024 overlay entries when present; keep SRD for anything missing."""
    merged = _index_by_name((_load_json(filename).get(srd_key) or []))
    private_rows = _load_private_json(filename).get(private_key) or []
    for row in private_rows:
        name = row.get("name")
        if not name:
            continue
        key = name.casefold()
        existing = merged.get(key) or {}
        if srd_key == "spells" and existing:
            merged[key] = _merge_spell_rows(existing, row)
        else:
            merged[key] = {
                **existing,
                **row,
                "source": row.get("source") or existing.get("source") or "PHB 2024",
            }
    return merged


_JUNK_EQUIPMENT_NAMES = {
    "armor",
    "name",
    "weapon",
    "weapons",
    "item",
    "cost",
    "damage",
    "weight",
    "properties",
    "mastery",
}


def _is_valid_equipment_row(row: dict) -> bool:
    name = str(row.get("name") or "").strip()
    if not name or name.casefold() in _JUNK_EQUIPMENT_NAMES:
        return False
    cost = str(row.get("cost") or "").strip().casefold()
    if cost in {"cost", "weight"}:
        return False
    return True


@lru_cache(maxsize=1)
def _species_index() -> dict[str, dict]:
    return _merged_index("species", "species", "species.json")


@lru_cache(maxsize=1)
def _backgrounds_index() -> dict[str, dict]:
    return _merged_index("backgrounds", "backgrounds", "backgrounds.json")


@lru_cache(maxsize=1)
def _feats_index() -> dict[str, dict]:
    return _merged_index("feats", "feats", "feats.json")


@lru_cache(maxsize=1)
def _glossary_index() -> dict[str, dict]:
    return _index_by_name((_load_json("glossary.json").get("glossary") or []))


@lru_cache(maxsize=1)
def _spells_index() -> dict[str, dict]:
    return _merged_index("spells", "spells", "spells.json")


@lru_cache(maxsize=1)
def _conditions_index() -> dict[str, dict]:
    return _index_by_name((_load_json("conditions.json").get("conditions") or []))


@lru_cache(maxsize=1)
def _classes_index() -> dict[str, dict]:
    return _index_by_name((_load_json("classes.json").get("classes") or []))


@lru_cache(maxsize=1)
def _magic_items_index() -> dict[str, dict]:
    return _merged_index("magic_items", "magic_items", "magic_items.json")


@lru_cache(maxsize=1)
def _animals_index() -> dict[str, dict]:
    return _index_by_name((_load_json("animals.json").get("animals") or []))


@lru_cache(maxsize=1)
def _monsters_index() -> dict[str, dict]:
    return _merged_index("monsters", "monsters", "monsters.json")


@lru_cache(maxsize=1)
def _equipment_data() -> dict:
    return _load_json("equipment.json").get("equipment") or {}


@lru_cache(maxsize=1)
def _rules_sections_flat() -> list[dict]:
    sections: list[dict] = []
    for doc in _load_json("rules_documents.json").get("documents") or []:
        doc_title = doc.get("title") or doc.get("id") or "Rules"
        for section in doc.get("sections") or []:
            sections.append(
                {
                    "name": section.get("name"),
                    "slug": section.get("slug"),
                    "description": section.get("content") or "",
                    "document": doc_title,
                }
            )
    for chapter in _equipment_data().get("chapters") or []:
        sections.append(
            {
                "name": chapter.get("name"),
                "slug": chapter.get("slug"),
                "description": chapter.get("content") or "",
                "document": "Equipment",
            }
        )
    return sections


def _gear_index() -> dict[str, dict]:
    return _index_by_name(list(_equipment_data().get("gear") or []))


def list_entries(category: str) -> list[dict]:
    if category == "species":
        return list(_species_index().values())
    if category == "backgrounds":
        return list(_backgrounds_index().values())
    if category == "feats":
        return list(_feats_index().values())
    if category == "glossary":
        return list(_glossary_index().values())
    if category == "spells":
        return list(_spells_index().values())
    if category == "conditions":
        return list(_conditions_index().values())
    if category == "classes":
        return list(_classes_index().values())
    if category == "magic_items":
        return list(_magic_items_index().values())
    if category == "animals":
        return list(_animals_index().values())
    if category == "monsters":
        from app.services.monster_catalog import (
            effective_initiative_modifier,
            monster_default_initiative,
        )

        return [
            {
                "name": row.get("name"),
                "slug": row.get("id") or row.get("name", "").lower(),
                "cr": row.get("cr"),
                "type": row.get("type") or (row.get("stat_block_json") or {}).get("type"),
                "size": row.get("size"),
                "initiative_modifier": effective_initiative_modifier(row),
                "default_initiative": monster_default_initiative(row),
                "source": row.get("source"),
            }
            for row in _monsters_index().values()
        ]
    if category == "weapons":
        return [
            row
            for row in (_equipment_data().get("weapons") or [])
            if _is_valid_equipment_row(row)
        ]
    if category == "armor":
        return [
            row
            for row in (_equipment_data().get("armor") or [])
            if _is_valid_equipment_row(row)
        ]
    if category == "gear":
        return list(_equipment_data().get("gear") or [])
    if category == "rules_sections":
        return _rules_sections_flat()
    return []


def lookup_entry(category: str, name: str) -> dict | None:
    key = name.strip().casefold()
    lookup_map = {
        "species": _species_index,
        "backgrounds": _backgrounds_index,
        "feats": _feats_index,
        "glossary": _glossary_index,
        "spells": _spells_index,
        "conditions": _conditions_index,
        "classes": _classes_index,
        "magic_items": _magic_items_index,
        "animals": _animals_index,
        "monsters": _monsters_index,
        "gear": _gear_index,
    }
    if category in lookup_map:
        entry = lookup_map[category]().get(key)
        if entry is None:
            return None
        if category == "conditions":
            glossary = _glossary_index().get(key)
            if glossary and glossary.get("description"):
                return {
                    **entry,
                    "description": glossary["description"],
                    "tag": glossary.get("tag") or entry.get("tag"),
                }
        if category == "monsters":
            from app.services.monster_catalog import (
                effective_initiative_modifier,
                monster_default_initiative,
            )

            return {
                **entry,
                "initiative_modifier": effective_initiative_modifier(entry),
                "default_initiative": monster_default_initiative(entry),
            }
        return entry

    if category == "weapons":
        for row in _equipment_data().get("weapons") or []:
            if row.get("name", "").casefold() == key:
                return row
    if category == "armor":
        for row in _equipment_data().get("armor") or []:
            if row.get("name", "").casefold() == key:
                return row
    if category == "rules_sections":
        for row in _rules_sections_flat():
            if row.get("name", "").casefold() == key:
                return row
    return None


def _tokenize(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9']+", text.lower()) if len(token) > 2}


def _score_entry(query_tokens: set[str], query_lower: str, entry: dict, *, category: str) -> int:
    name = str(entry.get("name") or "")
    name_lower = name.casefold()
    score = 0

    if name_lower and name_lower in query_lower:
        score += 100
    if name_lower and any(token in name_lower.split() for token in query_tokens):
        score += 40

    description = str(entry.get("description") or entry.get("desc") or entry.get("content") or "")
    if category == "monsters":
        stat = entry.get("stat_block_json") or {}
        description = " ".join(
            filter(
                None,
                [
                    entry.get("type") or stat.get("type"),
                    entry.get("alignment") or stat.get("alignment"),
                    entry.get("content") or entry.get("description"),
                ],
            )
        )

    desc_tokens = _tokenize(description)
    overlap = len(query_tokens & desc_tokens)
    score += min(overlap * 3, 30)

    tag = str(entry.get("tag") or "")
    if tag and tag.casefold() in query_lower:
        score += 25

    if category == "glossary" and tag == "Condition" and "condition" in query_tokens:
        score += 10

    return score


def search_catalog(query: str, *, limit: int = 10) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    query_lower = query.casefold()
    query_tokens = _tokenize(query)

    scored: list[tuple[int, str, dict]] = []
    catalogs: list[tuple[str, object]] = [
        ("glossary", _glossary_index().values()),
        ("feats", _feats_index().values()),
        ("species", _species_index().values()),
        ("backgrounds", _backgrounds_index().values()),
        ("conditions", _conditions_index().values()),
        ("spells", _spells_index().values()),
        ("classes", _classes_index().values()),
        ("magic_items", _magic_items_index().values()),
        ("animals", _animals_index().values()),
        ("monsters", _monsters_index().values()),
        ("gear", _gear_index().values()),
        ("rules_sections", _rules_sections_flat()),
    ]

    for category, rows in catalogs:
        for entry in rows:
            score = _score_entry(query_tokens, query_lower, entry, category=category)
            if score > 0:
                hit = {**entry, "category": category, "_score": score}
                scored.append((score, entry.get("name", ""), hit))

    for row in _equipment_data().get("weapons") or []:
        score = _score_entry(query_tokens, query_lower, row, category="weapons")
        if score > 0:
            scored.append((score, row.get("name", ""), {**row, "category": "weapons", "_score": score}))

    for row in _equipment_data().get("armor") or []:
        score = _score_entry(query_tokens, query_lower, row, category="armor")
        if score > 0:
            scored.append((score, row.get("name", ""), {**row, "category": "armor", "_score": score}))

    scored.sort(key=lambda item: (-item[0], item[1].casefold()))
    results = []
    for _, _, hit in scored[:limit]:
        hit.pop("_score", None)
        results.append(hit)
    return results


def catalog_summary() -> dict:
    manifest = _load_json("manifest.json")
    if manifest.get("counts"):
        return dict(manifest["counts"])

    equipment = _equipment_data()
    return {
        "monsters": len(_monsters_index()),
        "conditions": len(_conditions_index()),
        "spells": len(_spells_index()),
        "species": len(_species_index()),
        "backgrounds": len(_backgrounds_index()),
        "feats": len(_feats_index()),
        "glossary": len(_glossary_index()),
        "classes": len(_classes_index()),
        "magic_items": len(_magic_items_index()),
        "animals": len(_animals_index()),
        "weapons": len(equipment.get("weapons") or []),
        "armor": len(equipment.get("armor") or []),
        "gear": len(equipment.get("gear") or []),
        "rules_sections": len(_rules_sections_flat()),
    }
