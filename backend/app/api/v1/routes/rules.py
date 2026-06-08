"""SRD 5.2.1 rules data for clients and Rule Wizard grounding."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.services.action_rules import lookup_combat_action, lookup_spell
from app.services.srd_catalog import catalog_summary, list_entries, lookup_entry, search_catalog

router = APIRouter(prefix="/rules", tags=["rules"])

_DATA_DIR = Path(__file__).resolve().parents[4] / "data" / "srd-5.2.1"


@lru_cache(maxsize=1)
def _combat_action_index() -> dict[str, dict]:
    path = _DATA_DIR / "combat_actions.json"
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    index: dict[str, dict] = {}
    for bucket in ("standard_actions", "class_features"):
        for entry in payload.get(bucket) or []:
            if not isinstance(entry, dict) or not entry.get("name"):
                continue
            index[str(entry["name"]).casefold()] = {
                "name": entry["name"],
                "action_type": entry.get("action_type"),
                "targeting": entry.get("targeting"),
                "healing_dice": entry.get("healing_dice"),
                "category": entry.get("category"),
            }
    return index


@router.get("/summary")
def rules_summary():
    return {
        "_edition": "5.2.1",
        "_license": "CC-BY 4.0 — D&D System Reference Document v5.2.1",
        "counts": catalog_summary(),
    }


@router.get("/classes")
def list_classes():
    path = Path(__file__).resolve().parents[4] / "data" / "class_catalog.json"
    if not path.is_file():
        return {"classes": []}
    with path.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    return {"classes": sorted((payload.get("classes") or {}).keys())}


@router.get("/species")
def list_species():
    return {"species": list_entries("species")}


@router.get("/backgrounds")
def list_backgrounds():
    return {"backgrounds": list_entries("backgrounds")}


@router.get("/feats")
def list_feats():
    return {"feats": list_entries("feats")}


@router.get("/glossary")
def list_glossary():
    return {"glossary": list_entries("glossary")}


@router.get("/conditions")
def list_conditions():
    return {"conditions": list_entries("conditions")}


@router.get("/equipment")
def get_equipment():
    path = _DATA_DIR / "equipment.json"
    if not path.is_file():
        return {"equipment": {"weapons": [], "armor": [], "rules_sections": []}}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@router.get("/combat-actions")
def list_combat_actions():
    from app.services.action_rules import _load_combat_catalog

    by_name = _load_combat_catalog()
    standard_actions = []
    class_features = []
    for entry in by_name.values():
        if entry.get("category") == "standard":
            standard_actions.append(entry)
        else:
            class_features.append(entry)
    return {
        "_edition": "merged",
        "standard_actions": standard_actions,
        "class_features": class_features,
    }


@router.get("/spells")
def list_spells():
    path = _DATA_DIR / "spells.json"
    if not path.is_file():
        return {"_license": "", "spells": []}
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@router.get("/search")
def search_rules(q: str = Query(min_length=1, max_length=200), limit: int = Query(default=8, ge=1, le=20)):
    return {"query": q, "results": search_catalog(q, limit=limit)}


@router.get("/lookup")
def lookup_action(name: str):
    combat = lookup_combat_action(name)
    if combat is not None:
        return {"source": "combat_action", "entry": combat}
    spell = lookup_spell(name)
    if spell is not None:
        return {"source": "spell", "entry": spell}
    return {"source": None, "entry": None}


@router.get("/lookup/{category}/{name}")
def lookup_by_category(category: str, name: str):
    allowed = {
        "species",
        "backgrounds",
        "feats",
        "glossary",
        "spells",
        "conditions",
        "weapons",
        "armor",
    }
    if category not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown category: {category}")
    entry = lookup_entry(category, name)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No {category} entry named {name!r}")
    return {"category": category, "entry": entry}
