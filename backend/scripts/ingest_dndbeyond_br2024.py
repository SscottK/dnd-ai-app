#!/usr/bin/env python3
"""Ingest D&D Beyond 2024 Free Rules (br-2024) into structured JSON catalogs."""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "br-2024"
sys.path.insert(0, str(ROOT))

from app.services.action_type_inference import (  # noqa: E402
    infer_primary_action_type,
    override_action_type,
)

SOURCE_URL = "https://www.dndbeyond.com/sources/dnd/br-2024"
PAGES = {
    "character_classes": f"{SOURCE_URL}/character-classes",
    "playing_the_game": f"{SOURCE_URL}/playing-the-game",
    "rules_glossary": f"{SOURCE_URL}/rules-glossary",
}

CLASS_NAMES = [
    "Barbarian",
    "Bard",
    "Cleric",
    "Druid",
    "Fighter",
    "Monk",
    "Paladin",
    "Ranger",
    "Rogue",
    "Sorcerer",
    "Warlock",
    "Wizard",
]

_PASSIVE_NAMES = frozenset(
    {
        "extra attack",
        "unarmored defense",
        "unarmored movement",
        "martial arts",
        "slow fall",
        "empowered strikes",
        "evasion",
        "danger sense",
        "reckless attack",
        "weapon mastery",
        "jack of all trades",
        "expertise",
        "spellcasting",
        "druidic",
        "primal order",
        "divine order",
        "deflect attacks",
        "acrobatic movement",
        "heightened focus",
        "monk's focus",
        "font of inspiration",
        "wild resurgence",
        "archdruid",
        "uncanny metabolism",
        "divine sense",
        "lay on hands",
    }
)

_OPTION_ACTIONS = frozenset({"wild shape", "combat wild shape"})

_EMBEDDED_ACTIONS = {
    "monk's focus": [
        ("Flurry of Blows", "bonus_action", "one_enemy", {"resource_id": "focus-points", "amount": 1}),
        ("Patient Defense", "bonus_action", "self", {"resource_id": "focus-points", "amount": 1}),
        ("Step of the Wind", "bonus_action", "self", {"resource_id": "focus-points", "amount": 1}),
    ],
}

# 2024 Free Rules overrides (shared inference module still has 2014 Wild Shape = action).
_BR2024_OVERRIDES: dict[str, str] = {
    "wild shape": "bonus_action",
    "end wild shape": "bonus_action",
    "combat wild shape": "bonus_action",
    "rage": "bonus_action",
    "wild companion": "magic_action",
    "cunning action": "bonus_action",
    "second wind": "bonus_action",
    "action surge": "action",
    "flurry of blows": "bonus_action",
    "patient defense": "bonus_action",
    "step of the wind": "bonus_action",
}


def fetch(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "dnd-ai-app/1.0 (2024 free rules ingest)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="ignore")


def strip_html(fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"</li>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_class_sections(html: str) -> dict[str, str]:
    """Split on '{Class} Class Features' headings only (skip table-caption h3s)."""
    pattern = re.compile(r"<h3[^>]*>(.*?)</h3>", re.I | re.S)
    class_markers: list[tuple[str, int, int]] = []
    for match in pattern.finditer(html):
        title = strip_html(match.group(1))
        if not title.endswith("Class Features"):
            continue
        class_name = title.replace(" Class Features", "").strip()
        class_markers.append((class_name, match.start(), match.end()))

    sections: dict[str, str] = {}
    for index, (class_name, _start, content_start) in enumerate(class_markers):
        end = class_markers[index + 1][1] if index + 1 < len(class_markers) else len(html)
        sections[class_name] = html[content_start:end]
    return sections


def _header_key(header: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", header.lower()).strip("_")
    if key.isdigit():
        return f"spell_slot_{key}"
    return key or "column"


def parse_feature_table(section_html: str) -> list[dict]:
    tables = re.findall(r"<table[^>]*>(.*?)</table>", section_html, re.I | re.S)
    for table_body in tables:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table_body, re.I | re.S)
        header_row_index = None
        headers: list[str] = []
        for index, row in enumerate(rows):
            cells = [
                strip_html(cell)
                for cell in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.I | re.S)
            ]
            if cells and cells[0].casefold() == "level":
                header_row_index = index
                headers = cells
                break
        if header_row_index is None:
            continue

        parsed: list[dict] = []
        for row in rows[header_row_index + 1 :]:
            cells = [
                strip_html(cell)
                for cell in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.I | re.S)
            ]
            if not cells or not cells[0].isdigit():
                continue
            entry = {"level": int(cells[0])}
            for header, value in zip(headers, cells):
                entry[_header_key(header)] = value
            parsed.append(entry)
        if parsed:
            return parsed
    return []


def _norm_name(name: str) -> str:
    return str(name or "").strip().replace("\u2019", "'").casefold()


def br2024_action_type(name: str, description: str) -> str | None:
    key = _norm_name(name)
    if key in _BR2024_OVERRIDES:
        return _BR2024_OVERRIDES[key]
    text = str(description or "")
    if re.search(r"\bas a magic action\b", text, re.I):
        return "magic_action"
    return override_action_type(name) or infer_primary_action_type(name, description)


def parse_level_features(section_html: str) -> list[dict]:
    features: list[dict] = []
    matches = list(re.finditer(r"<h4[^>]*>(.*?)</h4>", section_html, re.I | re.S))
    for index, match in enumerate(matches):
        title = strip_html(match.group(1))
        level_match = re.match(r"Level\s+(\d+)\s*:\s*(.+)", title, re.I)
        if not level_match:
            continue
        level = int(level_match.group(1))
        name = level_match.group(2).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section_html)
        description = strip_html(section_html[start:end])
        features.append(
            {
                "level": level,
                "name": name,
                "description": description[:2000],
            }
        )
    return features


def classify_feature(feature: dict) -> dict:
    name = feature["name"]
    description = feature.get("description") or ""
    key = _norm_name(name)
    action_type = br2024_action_type(name, description)
    passive = key in _PASSIVE_NAMES or key in _EMBEDDED_ACTIONS or (
        action_type is None and key not in _OPTION_ACTIONS
    )
    if key == "stunning strike":
        passive = True  # on-hit rider, not a standalone menu action

    entry = dict(feature)
    entry["passive"] = passive
    if action_type:
        entry["action_type"] = action_type
    if key in _OPTION_ACTIONS:
        entry["requires_option"] = True
        entry["option_source"] = "wild_shapes"
        entry["targeting"] = "self"
    elif action_type and not passive:
        entry["targeting"] = _infer_targeting(name, description)
    return entry


def _infer_targeting(name: str, description: str) -> str:
    text = f"{name} {description}".lower()
    if "unarmed strike" in text and "bonus action" in text:
        return "one_enemy"
    if "yourself" in text or "self only" in text:
        return "self"
    if "one enemy" in text or "one creature" in text or "attack roll" in text:
        return "one_enemy"
    return "self"


def extract_resources(class_name: str, table: list[dict]) -> list[dict]:
    if not table:
        return []

    resources: list[dict] = []
    column_map = {
        "wild_shape": ("wild-shape", "Wild Shape", "short_rest"),
        "focus_points": ("focus-points", "Focus Points", "short_rest"),
        "rage": ("rage", "Rage", "long_rest"),
        "rages": ("rage", "Rage", "long_rest"),
        "bardic_inspiration": ("bardic-inspiration", "Bardic Inspiration", "long_rest"),
        "channel_divinity": ("channel-divinity", "Channel Divinity", "short_rest"),
        "sorcery_points": ("sorcery-points", "Sorcery Points", "long_rest"),
        "lay_on_hands": ("lay-on-hands", "Lay on Hands", "long_rest"),
        "ki": ("focus-points", "Focus Points", "short_rest"),
    }

    for column, (rid, label, recharge) in column_map.items():
        if column not in table[0]:
            continue
        max_by_level: dict[str, int] = {}
        for row in table:
            raw = str(row.get(column, "")).strip()
            if not raw or raw in {"—", "-", "–"}:
                continue
            try:
                max_by_level[str(row["level"])] = int(raw)
            except ValueError:
                continue
        if not max_by_level:
            continue
        resources.append(
            {
                "id": rid,
                "name": label,
                "source_class": class_name,
                "recharge": recharge,
                "max_by_level": max_by_level,
            }
        )
    return resources


def build_combat_actions(classes: dict) -> list[dict]:
    actions: list[dict] = []
    seen: set[str] = set()

    def add_action(
        *,
        name: str,
        action_type: str,
        targeting: str,
        source_class: str,
        description: str = "",
        resource_cost: dict | None = None,
        requires_option: bool = False,
        level: int | None = None,
    ) -> None:
        key = name.casefold()
        if key in seen:
            return
        seen.add(key)
        entry = {
            "name": name,
            "action_type": action_type,
            "targeting": targeting,
            "category": "class_feature",
            "source_class": source_class,
            "description": description[:500],
        }
        if resource_cost:
            entry["resource_cost"] = resource_cost
        if requires_option:
            entry["requires_option"] = True
            entry["option_source"] = "wild_shapes"
        if level is not None:
            entry["min_level"] = level
        actions.append(entry)

    for class_name, payload in classes.items():
        for feature in payload.get("features", []):
            embedded = _EMBEDDED_ACTIONS.get(_norm_name(feature["name"]), [])
            for emb_name, emb_type, emb_target, emb_cost in embedded:
                add_action(
                    name=emb_name,
                    action_type=emb_type,
                    targeting=emb_target,
                    source_class=class_name,
                    description=feature.get("description") or "",
                    resource_cost=emb_cost,
                    level=feature.get("level"),
                )

            if feature.get("passive"):
                continue
            action_type = feature.get("action_type")
            if not action_type:
                continue
            add_action(
                name=feature["name"],
                action_type=action_type,
                targeting=feature.get("targeting") or "self",
                source_class=class_name,
                description=feature.get("description") or "",
                requires_option=bool(feature.get("requires_option")),
                level=feature.get("level"),
            )

    return sorted(actions, key=lambda row: (row["source_class"], row.get("min_level") or 0, row["name"]))


def parse_action_economy(html: str) -> dict:
    text = strip_html(html)
    snippets: dict[str, str] = {}
    for label in ("Action", "Bonus Action", "Reaction", "Magic action"):
        match = re.search(
            rf"{re.escape(label)}s?\..{{0,40}}?(Various|You|When|If)",
            text,
            re.I,
        )
        if match:
            start = match.start()
            snippets[label.lower().replace(" ", "_")] = text[start : start + 600]
    return {
        "source": PAGES["playing_the_game"],
        "snippets": snippets,
        "notes": "2024 uses Magic action for some class features (e.g. Wild Companion).",
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fetched: dict[str, str] = {}
    for key, url in PAGES.items():
        print(f"Fetching {key}...")
        fetched[key] = fetch(url)

    classes_html = fetched["character_classes"]
    sections = split_class_sections(classes_html)
    classes: dict[str, dict] = {}

    for class_name in CLASS_NAMES:
        section = sections.get(class_name, "")
        if not section:
            print(f"Warning: missing section for {class_name}")
            continue
        table = parse_feature_table(section)
        raw_features = parse_level_features(section)
        features = [classify_feature(feature) for feature in raw_features]
        resources = extract_resources(class_name, table)
        classes[class_name] = {
            "name": class_name,
            "source": PAGES["character_classes"],
            "feature_table": table,
            "features": features,
            "resources": resources,
        }
        print(f"  {class_name}: {len(table)} table rows, {len(features)} features, {len(resources)} resources")

    combat_actions = build_combat_actions(classes)
    action_economy = parse_action_economy(fetched["playing_the_game"])

    payload = {
        "_source": SOURCE_URL,
        "_edition": "2024",
        "_ingested_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "_note": "D&D Beyond 2024 Free Rules. For development reference; not redistributed prose.",
        "classes": classes,
    }

    (OUT_DIR / "classes.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "combat_actions.json").write_text(
        json.dumps(
            {
                "_source": SOURCE_URL,
                "_edition": "2024",
                "class_features": combat_actions,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "action_economy.json").write_text(
        json.dumps(action_economy, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    (OUT_DIR / "SOURCE.md").write_text(
        "\n".join(
            [
                "# D&D Beyond 2024 Free Rules (ingested catalog)",
                "",
                f"Source: [{SOURCE_URL}]({SOURCE_URL})",
                "",
                "Structured extracts for combat enrichment. Wizards of the Coast / D&D Beyond.",
                "Do not commit full rulebook prose; this folder holds parsed game-data fields only.",
                "",
                f"Last ingested: {payload['_ingested_at']}",
                "",
                "## Files",
                "",
                "- `classes.json` — feature tables, level features, resources per class",
                "- `combat_actions.json` — actionable class features for turn combat",
                "- `action_economy.json` — action/bonus/reaction/magic notes from Playing the Game",
                "",
                "Regenerate: `PYTHONPATH=backend backend/.venv/bin/python backend/scripts/ingest_dndbeyond_br2024.py`",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(classes)} classes and {len(combat_actions)} combat actions to {OUT_DIR}")


if __name__ == "__main__":
    main()
