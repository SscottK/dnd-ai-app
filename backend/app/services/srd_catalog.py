"""Load and search SRD 5.2.1 JSON catalogs."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "srd-5.2.1"


def _load_json(filename: str) -> dict:
    path = _DATA_DIR / filename
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _index_by_name(rows: list[dict]) -> dict[str, dict]:
    return {row["name"].casefold(): row for row in rows if row.get("name")}


@lru_cache(maxsize=1)
def _species_index() -> dict[str, dict]:
    return _index_by_name((_load_json("species.json").get("species") or []))


@lru_cache(maxsize=1)
def _backgrounds_index() -> dict[str, dict]:
    return _index_by_name((_load_json("backgrounds.json").get("backgrounds") or []))


@lru_cache(maxsize=1)
def _feats_index() -> dict[str, dict]:
    return _index_by_name((_load_json("feats.json").get("feats") or []))


@lru_cache(maxsize=1)
def _glossary_index() -> dict[str, dict]:
    return _index_by_name((_load_json("glossary.json").get("glossary") or []))


@lru_cache(maxsize=1)
def _spells_index() -> dict[str, dict]:
    return _index_by_name((_load_json("spells.json").get("spells") or []))


@lru_cache(maxsize=1)
def _conditions_index() -> dict[str, dict]:
    return _index_by_name((_load_json("conditions.json").get("conditions") or []))


@lru_cache(maxsize=1)
def _classes_index() -> dict[str, dict]:
    return _index_by_name((_load_json("classes.json").get("classes") or []))


@lru_cache(maxsize=1)
def _magic_items_index() -> dict[str, dict]:
    return _index_by_name((_load_json("magic_items.json").get("magic_items") or []))


@lru_cache(maxsize=1)
def _animals_index() -> dict[str, dict]:
    return _index_by_name((_load_json("animals.json").get("animals") or []))


@lru_cache(maxsize=1)
def _monsters_index() -> dict[str, dict]:
    return _index_by_name((_load_json("monsters.json").get("monsters") or []))


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
        return [
            {
                "name": row.get("name"),
                "slug": row.get("id") or row.get("name", "").lower(),
                "cr": row.get("cr"),
                "type": (row.get("stat_block_json") or {}).get("type"),
                "size": row.get("size"),
            }
            for row in _monsters_index().values()
        ]
    if category == "weapons":
        return list(_equipment_data().get("weapons") or [])
    if category == "armor":
        return list(_equipment_data().get("armor") or [])
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
        return lookup_map[category]().get(key)

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
        description = f"{stat.get('type', '')} {stat.get('alignment', '')}"

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
