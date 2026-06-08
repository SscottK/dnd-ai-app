"""Load and search SRD 5.2.1 JSON catalogs."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "srd-5.2.1"

CATALOG_FILES = {
    "species": "species.json",
    "backgrounds": "backgrounds.json",
    "feats": "feats.json",
    "glossary": "glossary.json",
    "spells": "spells.json",
    "conditions": "conditions.json",
}


def _load_json(filename: str) -> dict:
    path = _DATA_DIR / filename
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def _species_index() -> dict[str, dict]:
    payload = _load_json("species.json")
    return {row["name"].casefold(): row for row in payload.get("species") or [] if row.get("name")}


@lru_cache(maxsize=1)
def _backgrounds_index() -> dict[str, dict]:
    payload = _load_json("backgrounds.json")
    return {
        row["name"].casefold(): row for row in payload.get("backgrounds") or [] if row.get("name")
    }


@lru_cache(maxsize=1)
def _feats_index() -> dict[str, dict]:
    payload = _load_json("feats.json")
    return {row["name"].casefold(): row for row in payload.get("feats") or [] if row.get("name")}


@lru_cache(maxsize=1)
def _glossary_index() -> dict[str, dict]:
    payload = _load_json("glossary.json")
    return {row["name"].casefold(): row for row in payload.get("glossary") or [] if row.get("name")}


@lru_cache(maxsize=1)
def _spells_index() -> dict[str, dict]:
    payload = _load_json("spells.json")
    return {row["name"].casefold(): row for row in payload.get("spells") or [] if row.get("name")}


@lru_cache(maxsize=1)
def _conditions_index() -> dict[str, dict]:
    payload = _load_json("conditions.json")
    rows = payload.get("conditions") or []
    return {row["name"].casefold(): row for row in rows if row.get("name")}


@lru_cache(maxsize=1)
def _equipment_data() -> dict:
    payload = _load_json("equipment.json")
    return payload.get("equipment") or {}


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
    if category == "weapons":
        return list(_equipment_data().get("weapons") or [])
    if category == "armor":
        return list(_equipment_data().get("armor") or [])
    return []


def lookup_entry(category: str, name: str) -> dict | None:
    key = name.strip().casefold()
    if category == "species":
        return _species_index().get(key)
    if category == "backgrounds":
        return _backgrounds_index().get(key)
    if category == "feats":
        return _feats_index().get(key)
    if category == "glossary":
        return _glossary_index().get(key)
    if category == "spells":
        return _spells_index().get(key)
    if category == "conditions":
        return _conditions_index().get(key)
    if category == "weapons":
        for row in _equipment_data().get("weapons") or []:
            if row.get("name", "").casefold() == key:
                return row
    if category == "armor":
        for row in _equipment_data().get("armor") or []:
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

    description = str(entry.get("description") or entry.get("desc") or "")
    desc_tokens = _tokenize(description)
    overlap = len(query_tokens & desc_tokens)
    score += min(overlap * 3, 30)

    tag = str(entry.get("tag") or "")
    if tag and tag.casefold() in query_lower:
        score += 25

    if category == "glossary" and tag == "Condition" and "condition" in query_tokens:
        score += 10

    return score


def search_catalog(query: str, *, limit: int = 8) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    query_lower = query.casefold()
    query_tokens = _tokenize(query)

    scored: list[tuple[int, str, dict]] = []
    catalogs = [
        ("glossary", _glossary_index().values()),
        ("feats", _feats_index().values()),
        ("species", _species_index().values()),
        ("backgrounds", _backgrounds_index().values()),
        ("conditions", _conditions_index().values()),
        ("spells", _spells_index().values()),
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
    equipment = _equipment_data()
    return {
        "species": len(_species_index()),
        "backgrounds": len(_backgrounds_index()),
        "feats": len(_feats_index()),
        "glossary": len(_glossary_index()),
        "spells": len(_spells_index()),
        "conditions": len(_conditions_index()),
        "weapons": len(equipment.get("weapons") or []),
        "armor": len(equipment.get("armor") or []),
    }
