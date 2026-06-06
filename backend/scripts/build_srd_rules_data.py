#!/usr/bin/env python3
"""Build SRD 5.2.1 combat action and spell JSON from Open5e (CC-BY 4.0)."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "srd-5.2.1"
LICENSE = (
    "Source: D&D System Reference Document v5.2.1, © Wizards of the Coast LLC, "
    "licensed under CC-BY 4.0. Re-published via the Open5e API "
    "(https://api.open5e.com/, document slug: wotc-srd), also under CC-BY 4.0."
)

STANDARD_ACTIONS = [
    {
        "name": "Attack",
        "action_type": "action",
        "targeting": "one_enemy",
        "category": "standard",
        "description": "Make one attack roll with a weapon or an Unarmed Strike.",
    },
    {
        "name": "Dash",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
        "description": "Gain extra movement equal to your Speed.",
    },
    {
        "name": "Disengage",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Dodge",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Help",
        "action_type": "action",
        "targeting": "one_ally_or_self",
        "category": "standard",
    },
    {
        "name": "Hide",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Ready",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Search",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Study",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Utilize",
        "action_type": "action",
        "targeting": "self",
        "category": "standard",
    },
    {
        "name": "Influence",
        "action_type": "action",
        "targeting": "one_creature",
        "category": "standard",
    },
]


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "dnd-ai-app/1.0 (SRD data build script)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def paginate(base_url: str) -> list[dict]:
    results: list[dict] = []
    url = base_url
    while url:
        payload = fetch_json(url)
        results.extend(payload.get("results") or [])
        url = payload.get("next")
    return results


def infer_action_type(text: str) -> str | None:
    from app.services.action_type_inference import infer_primary_action_type

    return infer_primary_action_type("", text)


def infer_targeting(name: str, text: str, *, category: str = "feature") -> str:
    blob = f"{name} {text}".lower()
    if "self only" in blob or "(self only)" in blob:
        return "self"
    if re.search(r"\bon yourself\b", blob) or re.search(r"\byou regain\b", blob):
        return "self"
    if "regain hit points" in blob and "one target" not in blob and "creature you" not in blob:
        return "self"
    if "you gain" in blob and "attack" not in blob and "one target" not in blob:
        return "self"
    if "one ally" in blob or "friendly creature" in blob:
        return "one_ally"
    if "one ally or yourself" in blob or "ally or yourself" in blob:
        return "one_ally_or_self"
    if "each creature" in blob or "all creatures" in blob:
        return "one_creature"
    if "one target" in blob or "melee weapon attack" in blob or "ranged weapon attack" in blob:
        return "one_enemy"
    if "spell attack" in blob and "creature you can see" in blob:
        return "one_enemy"
    if category == "spell":
        if blob.strip().startswith("self") or " range: self" in blob:
            return "self"
    if category in {"feature", "standard"}:
        return "self"
    return "one_enemy"


def infer_spell_targeting(spell: dict) -> str:
    name = str(spell.get("name") or "")
    desc = str(spell.get("desc") or "")
    range_text = str(spell.get("range") or "").lower()
    if range_text == "self":
        return "self"
    if range_text == "touch":
        return "one_ally_or_self"
    if "spell attack" in desc.lower():
        return "one_enemy"
    if "creature you can see" in desc.lower():
        return "one_creature"
    return infer_targeting(name, f"{range_text} {desc}", category="spell")


def infer_spell_action_type(spell: dict) -> str:
    casting = str(spell.get("casting_time") or "").lower()
    if "bonus action" in casting:
        return "bonus_action"
    if "reaction" in casting:
        return "reaction"
    return "action"


def parse_healing_dice(text: str) -> str | None:
    match = re.search(r"regain hit points equal to (\d+d\d+(?:\s*\+\s*[^.]+)?)", text, re.I)
    if match:
        return re.sub(r"\s+", "", match.group(1).lower())
    return None


def parse_class_features(class_entry: dict) -> list[dict]:
    desc = str(class_entry.get("desc") or "")
    class_name = str(class_entry.get("name") or "")
    features: list[dict] = []
    for chunk in re.split(r"\n###\s+", desc):
        chunk = chunk.strip()
        if not chunk:
            continue
        lines = chunk.split("\n", 1)
        name = re.sub(r"^#+\s*", "", lines[0]).strip()
        body = lines[1].strip() if len(lines) > 1 else ""
        action_type = infer_action_type(body)
        if action_type is None:
            continue
        entry = {
            "name": name,
            "action_type": action_type,
            "targeting": infer_targeting(name, body, category="feature"),
            "category": "class_feature",
            "source_class": class_name,
            "description": body[:500],
        }
        healing = parse_healing_dice(body)
        if healing:
            entry["healing_dice"] = healing
        features.append(entry)

    for archetype in class_entry.get("archetypes") or []:
        if archetype.get("document__slug") != "wotc-srd":
            continue
        for feature in parse_class_features(
            {
                "name": f"{class_name} ({archetype.get('name')})",
                "desc": archetype.get("desc") or "",
            }
        ):
            feature["source_subclass"] = archetype.get("name")
            features.append(feature)
    return features


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    classes = paginate("https://api.open5e.com/v1/classes/?document__slug=wotc-srd&limit=50")
    class_features: list[dict] = []
    seen: set[str] = set()
    for class_entry in classes:
        for feature in parse_class_features(class_entry):
            key = feature["name"].casefold()
            if key in seen:
                continue
            seen.add(key)
            class_features.append(feature)

    combat_actions = {
        "_license": LICENSE,
        "standard_actions": STANDARD_ACTIONS,
        "class_features": sorted(class_features, key=lambda row: row["name"].casefold()),
    }
    (OUT_DIR / "combat_actions.json").write_text(
        json.dumps(combat_actions, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    spells_raw = paginate("https://api.open5e.com/v1/spells/?document__slug=wotc-srd&limit=100")
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
                "action_type": infer_spell_action_type(spell),
                "targeting": infer_spell_targeting(spell),
                "range": spell.get("range"),
                "casting_time": spell.get("casting_time"),
                "description": (spell.get("desc") or "")[:600],
            }
        )
    spells_payload = {"_license": LICENSE, "spells": sorted(spells, key=lambda row: row["name"].casefold())}
    (OUT_DIR / "spells.json").write_text(
        json.dumps(spells_payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    conditions = fetch_json(
        "https://raw.githubusercontent.com/cocoajamworld/srd-5.2.1/main/data/conditions.json"
    )
    (OUT_DIR / "conditions.json").write_text(
        json.dumps(conditions, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(
        f"Wrote {len(STANDARD_ACTIONS)} standard actions, "
        f"{len(class_features)} class features, {len(spells)} spells"
    )


if __name__ == "__main__":
    main()
