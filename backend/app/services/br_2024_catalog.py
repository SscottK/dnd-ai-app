"""Load ingested D&D Beyond 2024 Free Rules catalogs from backend/data/br-2024."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_BR_DIR = _DATA_DIR / "br-2024"


@lru_cache(maxsize=1)
def load_classes_catalog() -> dict:
    path = _BR_DIR / "classes.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_combat_actions_catalog() -> dict:
    path = _DATA_DIR / "combat_catalog_2024.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_action_economy_catalog() -> dict:
    path = _BR_DIR / "action_economy.json"
    return json.loads(path.read_text(encoding="utf-8"))


def class_resources(class_name: str) -> list[dict]:
    classes = load_classes_catalog().get("classes", {})
    return list(classes.get(class_name, {}).get("resources") or [])


def class_combat_actions(class_name: str) -> list[dict]:
    actions = load_combat_actions_catalog().get("class_features") or []
    return [row for row in actions if row.get("source_class") == class_name]
