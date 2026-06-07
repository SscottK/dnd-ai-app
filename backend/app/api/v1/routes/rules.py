"""SRD 5.2.1 rules data for client-side action targeting."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter

from app.services.action_rules import lookup_combat_action, lookup_spell

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


@router.get("/lookup")
def lookup_action(name: str):
    combat = lookup_combat_action(name)
    if combat is not None:
        return {"source": "combat_action", "entry": combat}
    spell = lookup_spell(name)
    if spell is not None:
        return {"source": "spell", "entry": spell}
    return {"source": None, "entry": None}
