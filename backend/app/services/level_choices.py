"""Detect and apply level-up choice points (5.5e / 2024).

Choice schedules come from BR-2024 class feature tables. Feat option lists
come from the merged rules catalog (SRD + private overlay when present).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.srd_catalog import list_entries, lookup_entry

ABILITY_KEYS = ("str", "dex", "con", "int", "wis", "cha")
ABILITY_LABELS = {
    "str": "Strength",
    "dex": "Dexterity",
    "con": "Constitution",
    "int": "Intelligence",
    "wis": "Wisdom",
    "cha": "Charisma",
}

STANDARD_SKILLS = [
    "Acrobatics",
    "Animal Handling",
    "Arcana",
    "Athletics",
    "Deception",
    "History",
    "Insight",
    "Intimidation",
    "Investigation",
    "Medicine",
    "Nature",
    "Perception",
    "Performance",
    "Persuasion",
    "Religion",
    "Sleight of Hand",
    "Stealth",
    "Survival",
]

KNOWN_SUBCLASSES: dict[str, list[str]] = {
    "Barbarian": ["Path of the Berserker"],
    "Bard": ["College of Dance", "College of Glamour", "College of Lore"],
    "Cleric": ["Life Domain", "Light Domain", "Trickery Domain", "War Domain"],
    "Druid": ["Circle of the Land", "Circle of the Moon", "Circle of the Sea"],
    "Fighter": ["Champion", "Eldritch Knight", "Psi Warrior"],
    "Monk": ["Warrior of Mercy", "Warrior of Shadow", "Warrior of the Elements", "Warrior of the Open Hand"],
    "Paladin": ["Oath of Devotion", "Oath of Glory", "Oath of the Ancients", "Oath of Vengeance"],
    "Ranger": ["Beast Master", "Fey Wanderer", "Gloom Stalker", "Hunter"],
    "Rogue": ["Arcane Trickster", "Assassin", "Soulknife", "Thief"],
    "Sorcerer": ["Aberrant Sorcery", "Clockwork Sorcery", "Draconic Sorcery", "Wild Magic Sorcery"],
    "Warlock": ["Archfey Patron", "Celestial Patron", "Fiend Patron", "Great Old One Patron"],
    "Wizard": ["Abjurer", "Diviner", "Evoker", "Illusionist"],
}

DIVINE_ORDER_OPTIONS = [
    {
        "id": "Protector",
        "label": "Protector",
        "detail": "Training with Martial weapons and Heavy armor.",
    },
    {
        "id": "Thaumaturge",
        "label": "Thaumaturge",
        "detail": "Extra cantrip potency; proficiency in Arcana or Religion.",
    },
]

BLESSED_STRIKES_OPTIONS = [
    {
        "id": "Divine Strike",
        "label": "Divine Strike",
        "detail": "Once per turn, deal extra radiant or necrotic damage with a weapon attack.",
    },
    {
        "id": "Potent Spellcasting",
        "label": "Potent Spellcasting",
        "detail": "Add Wisdom modifier to damage from Cleric cantrips.",
    },
]

# Tokens in feature_table.class_features that require a player choice.
_CHOICE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^ability score improvement$", re.I), "asi_or_feat"),
    (re.compile(r"^epic boon$", re.I), "epic_boon"),
    (re.compile(r"^fighting style$", re.I), "fighting_style"),
    (re.compile(r"^expertise$", re.I), "expertise"),
    (re.compile(r"^divine order$", re.I), "divine_order"),
    (re.compile(r"^weapon mastery$", re.I), "weapon_mastery"),
    (re.compile(r"^scholar$", re.I), "scholar"),
    (re.compile(r"^blessed strikes$", re.I), "blessed_strikes"),
    (re.compile(r"^primal knowledge$", re.I), "primal_knowledge"),
    (re.compile(r"^subclass feature$", re.I), "subclass_feature"),
    (re.compile(r"^.+\s+subclass$", re.I), "subclass"),
]


def _data_path(*parts: str) -> Path:
    # backend/app/services/this_file.py → backend/data/...
    return Path(__file__).resolve().parents[2] / "data" / Path(*parts)


@lru_cache(maxsize=1)
def _load_br_classes() -> dict[str, Any]:
    path = _data_path("br-2024", "classes.json")
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload.get("classes") or {}


def _split_feature_names(raw: str) -> list[str]:
    # Tables use "A , B , C" and sometimes "Action Surge (one use)"
    parts = re.split(r"\s*,\s*", str(raw or ""))
    names: list[str] = []
    for part in parts:
        name = part.strip()
        if not name:
            continue
        name = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
        if name:
            names.append(name)
    return names


def _feature_blurb(class_name: str, feature_name: str, level: int) -> str:
    cls = _load_br_classes().get(class_name) or {}
    for entry in cls.get("features") or []:
        if str(entry.get("name") or "").strip().casefold() != feature_name.casefold():
            continue
        if int(entry.get("level") or 0) not in (0, int(level)):
            # Prefer exact level match; fall through to first name match.
            continue
        return str(entry.get("description") or "").strip()
    for entry in cls.get("features") or []:
        if str(entry.get("name") or "").strip().casefold() == feature_name.casefold():
            return str(entry.get("description") or "").strip()
    return ""


def _table_row(class_name: str, level: int) -> dict[str, Any] | None:
    cls = _load_br_classes().get(class_name) or {}
    for row in cls.get("feature_table") or []:
        try:
            if int(row.get("level")) == int(level):
                return row
        except (TypeError, ValueError):
            continue
    return None


def _classify_feature(name: str) -> str | None:
    for pattern, choice_type in _CHOICE_RULES:
        if pattern.match(name.strip()):
            return choice_type
    return None


def _feat_options(categories: set[str]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for entry in list_entries("feats"):
        category = str(entry.get("category") or "").strip().casefold()
        name = str(entry.get("name") or "").strip()
        if not name or category not in categories:
            continue
        # ASI is handled via the dedicated ASI UI, not the feat picker list.
        if name.casefold() == "ability score improvement":
            continue
        rows.append(
            {
                "name": name,
                "category": category,
                "description": str(entry.get("description") or "")[:400],
            }
        )
    rows.sort(key=lambda row: row["name"].casefold())
    return rows


def _proficient_skill_names(sheet: dict) -> list[str]:
    names: list[str] = []
    for skill in sheet.get("skills") or []:
        if not isinstance(skill, dict):
            continue
        if not skill.get("proficient") and not skill.get("expertise"):
            continue
        name = str(skill.get("name") or "").strip()
        if name:
            names.append(name)
    return names


def _skill_options(sheet: dict, *, proficient_only: bool) -> list[str]:
    if not proficient_only:
        return list(STANDARD_SKILLS)
    found = _proficient_skill_names(sheet)
    return found or list(STANDARD_SKILLS)


def _weapon_mastery_count(class_name: str, level: int) -> int:
    row = _table_row(class_name, level) or {}
    raw = row.get("weapon_mastery")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return 3 if class_name == "Fighter" else 2


def choices_at_level(class_name: str | None, new_level: int, sheet: dict | None = None) -> list[dict[str, Any]]:
    """Return required choice specs for advancing into new_level."""
    if not class_name:
        return []
    row = _table_row(class_name, new_level)
    if not row:
        return []
    sheet = sheet or {}
    choices: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    for feature_name in _split_feature_names(row.get("class_features") or ""):
        choice_type = _classify_feature(feature_name)
        if not choice_type:
            continue
        choice_id = choice_type
        # Multiple identical types in one level are rare; keep ids unique.
        if choice_id in used_ids:
            choice_id = f"{choice_type}_{len(used_ids)}"
        used_ids.add(choice_id)

        spec: dict[str, Any] = {
            "id": choice_id,
            "type": choice_type,
            "label": feature_name,
            "detail": _feature_blurb(class_name, feature_name, new_level),
        }

        if choice_type == "asi_or_feat":
            spec["options"] = {
                "abilities": [{"id": key, "label": ABILITY_LABELS[key]} for key in ABILITY_KEYS],
                "feats": _feat_options({"general", "origin", "fighting_style"}),
            }
        elif choice_type == "fighting_style":
            spec["options"] = {"feats": _feat_options({"fighting_style"})}
        elif choice_type == "epic_boon":
            spec["options"] = {
                "feats": _feat_options({"epic_boon", "general"}),
            }
        elif choice_type == "subclass":
            spec["options"] = {
                "suggestions": KNOWN_SUBCLASSES.get(class_name, []),
            }
        elif choice_type == "subclass_feature":
            subclass = None
            classes = sheet.get("classes")
            if isinstance(classes, list) and classes and isinstance(classes[0], dict):
                subclass = classes[0].get("subclass")
            spec["options"] = {
                "subclass": subclass,
                "hint": "Enter the subclass feature you gain at this level.",
            }
        elif choice_type == "expertise":
            spec["count"] = 2
            spec["options"] = {"skills": _skill_options(sheet, proficient_only=True)}
        elif choice_type == "scholar":
            spec["count"] = 1
            spec["options"] = {"skills": _skill_options(sheet, proficient_only=True)}
        elif choice_type == "primal_knowledge":
            spec["count"] = 1
            spec["options"] = {"skills": STANDARD_SKILLS}
        elif choice_type == "divine_order":
            spec["options"] = {"orders": DIVINE_ORDER_OPTIONS}
        elif choice_type == "blessed_strikes":
            spec["options"] = {"choices": BLESSED_STRIKES_OPTIONS}
        elif choice_type == "weapon_mastery":
            count = _weapon_mastery_count(class_name, new_level)
            spec["count"] = count
            spec["options"] = {
                "hint": f"Choose {count} weapon kinds for Weapon Mastery.",
            }

        choices.append(spec)
    return choices


def auto_features_at_level(class_name: str | None, new_level: int) -> list[dict[str, str]]:
    """Non-choice class features granted at new_level (from BR table)."""
    if not class_name:
        return []
    row = _table_row(class_name, new_level)
    if not row:
        return []
    unlocks: list[dict[str, str]] = []
    for feature_name in _split_feature_names(row.get("class_features") or ""):
        if _classify_feature(feature_name):
            continue
        unlocks.append(
            {
                "kind": "feature",
                "name": feature_name,
                "detail": _feature_blurb(class_name, feature_name, new_level)
                or f"Unlocked at {class_name} level {new_level}.",
            }
        )
    return unlocks


def _normalize_ability_increases(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        raise ValueError("ASI increases must be an object of ability → amount")
    increases: dict[str, int] = {}
    total = 0
    for key, value in raw.items():
        ability = str(key).strip().casefold()
        if ability not in ABILITY_KEYS:
            raise ValueError(f"Unknown ability '{key}'")
        try:
            amount = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid ASI amount for {ability}") from exc
        if amount < 1:
            raise ValueError("ASI amounts must be positive")
        increases[ability] = amount
        total += amount
    if total != 2 or len(increases) not in (1, 2):
        raise ValueError("ASI must be +2 to one score or +1 to two scores")
    if len(increases) == 1 and next(iter(increases.values())) != 2:
        raise ValueError("Single-score ASI must be +2")
    if len(increases) == 2 and any(v != 1 for v in increases.values()):
        raise ValueError("Two-score ASI must be +1 each")
    return increases


def _resolve_feat(name: str, allowed_categories: set[str] | None = None) -> dict:
    entry = lookup_entry("feats", name)
    if entry is None:
        # Allow free-text feat names when catalog is incomplete.
        return {"name": name.strip(), "category": "custom", "description": ""}
    category = str(entry.get("category") or "").strip().casefold()
    if allowed_categories is not None and category and category not in allowed_categories:
        raise ValueError(f"Feat '{name}' is not valid for this choice")
    return entry


def validate_choices(
    required: list[dict[str, Any]],
    submitted: dict[str, Any] | None,
) -> dict[str, Any]:
    submitted = submitted or {}
    if not isinstance(submitted, dict):
        raise ValueError("choices must be an object keyed by choice id")
    cleaned: dict[str, Any] = {}
    required_ids = {str(spec["id"]) for spec in required}
    missing = required_ids - set(submitted)
    if missing:
        raise ValueError(f"Missing required choices: {', '.join(sorted(missing))}")

    for spec in required:
        choice_id = str(spec["id"])
        payload = submitted.get(choice_id)
        if payload is None:
            raise ValueError(f"Missing choice '{choice_id}'")
        choice_type = spec["type"]

        if choice_type == "asi_or_feat":
            if not isinstance(payload, dict):
                raise ValueError("ASI/feat choice must be an object")
            mode = str(payload.get("mode") or "").strip().casefold()
            if mode == "asi":
                increases = _normalize_ability_increases(payload.get("increases"))
                cleaned[choice_id] = {"mode": "asi", "increases": increases}
            elif mode == "feat":
                feat_name = str(payload.get("feat") or "").strip()
                if not feat_name:
                    raise ValueError("Select a feat")
                _resolve_feat(feat_name, {"general", "origin", "fighting_style", "custom", ""})
                cleaned[choice_id] = {"mode": "feat", "feat": feat_name}
            else:
                raise ValueError("ASI/feat mode must be 'asi' or 'feat'")

        elif choice_type in ("fighting_style", "epic_boon"):
            if not isinstance(payload, dict):
                raise ValueError(f"{choice_type} choice must be an object")
            feat_name = str(payload.get("feat") or "").strip()
            if not feat_name:
                raise ValueError(f"Select a {spec['label']}")
            allowed = {"fighting_style"} if choice_type == "fighting_style" else {"epic_boon", "general", "custom", ""}
            _resolve_feat(feat_name, allowed)
            cleaned[choice_id] = {"feat": feat_name}

        elif choice_type == "subclass":
            if isinstance(payload, str):
                name = payload.strip()
            elif isinstance(payload, dict):
                name = str(payload.get("name") or "").strip()
            else:
                raise ValueError("Subclass choice must include a name")
            if len(name) < 2:
                raise ValueError("Enter a subclass name")
            cleaned[choice_id] = {"name": name}

        elif choice_type == "subclass_feature":
            if isinstance(payload, dict):
                name = str(payload.get("name") or "").strip()
                note = str(payload.get("note") or "").strip()
            else:
                name = str(payload or "").strip()
                note = ""
            if len(name) < 2:
                raise ValueError("Enter the subclass feature name")
            cleaned[choice_id] = {"name": name, "note": note}

        elif choice_type in ("expertise", "scholar"):
            count = int(spec.get("count") or (2 if choice_type == "expertise" else 1))
            skills = _as_skill_list(payload, count=count)
            cleaned[choice_id] = {"skills": skills}

        elif choice_type == "primal_knowledge":
            skills = _as_skill_list(payload, count=1)
            cleaned[choice_id] = {"skills": skills}

        elif choice_type == "divine_order":
            order = payload.get("order") if isinstance(payload, dict) else payload
            order_name = str(order or "").strip()
            valid = {opt["id"] for opt in DIVINE_ORDER_OPTIONS}
            if order_name not in valid:
                raise ValueError("Choose Protector or Thaumaturge")
            cleaned[choice_id] = {"order": order_name}

        elif choice_type == "blessed_strikes":
            pick = payload.get("choice") if isinstance(payload, dict) else payload
            pick_name = str(pick or "").strip()
            valid = {opt["id"] for opt in BLESSED_STRIKES_OPTIONS}
            if pick_name not in valid:
                raise ValueError("Choose Divine Strike or Potent Spellcasting")
            cleaned[choice_id] = {"choice": pick_name}

        elif choice_type == "weapon_mastery":
            count = int(spec.get("count") or 2)
            weapons = payload.get("weapons") if isinstance(payload, dict) else payload
            if not isinstance(weapons, list):
                raise ValueError("Weapon Mastery requires a list of weapons")
            cleaned_weapons = [str(w).strip() for w in weapons if str(w).strip()]
            if len(cleaned_weapons) != count:
                raise ValueError(f"Choose exactly {count} weapons")
            cleaned[choice_id] = {"weapons": cleaned_weapons}

        else:
            raise ValueError(f"Unsupported choice type '{choice_type}'")

    return cleaned


def _as_skill_list(payload: Any, *, count: int) -> list[str]:
    if isinstance(payload, dict):
        skills = payload.get("skills")
        if skills is None and payload.get("skill"):
            skills = [payload.get("skill")]
    else:
        skills = payload
    if isinstance(skills, str):
        skills = [skills]
    if not isinstance(skills, list):
        raise ValueError("Skill choice must be a list")
    cleaned = [str(s).strip() for s in skills if str(s).strip()]
    if len(cleaned) != count:
        raise ValueError(f"Choose exactly {count} skill(s)")
    if len(set(s.casefold() for s in cleaned)) != len(cleaned):
        raise ValueError("Skill choices must be unique")
    return cleaned


def _ensure_skill_row(sheet: dict, skill_name: str) -> dict:
    skills = list(sheet.get("skills") or [])
    for row in skills:
        if isinstance(row, dict) and str(row.get("name") or "").casefold() == skill_name.casefold():
            sheet["skills"] = skills
            return row
    row = {"name": skill_name, "proficient": False, "expertise": False}
    skills.append(row)
    sheet["skills"] = skills
    return row


def _add_feature(
    sheet: dict,
    *,
    name: str,
    source: str,
    description: str = "",
) -> None:
    features = list(sheet.get("features") or [])
    existing = {
        str(entry.get("name") or "").strip().casefold()
        for entry in features
        if isinstance(entry, dict)
    }
    if name.casefold() in existing:
        return
    features.append(
        {
            "name": name,
            "source": source,
            "description": description,
            "display": ["features_tab"],
        }
    )
    sheet["features"] = features


def _apply_ability_increases(sheet: dict, increases: dict[str, int], *, cap: int = 20) -> None:
    abilities = dict(sheet.get("abilities") or {})
    for ability, amount in increases.items():
        try:
            current = int(abilities.get(ability) or 10)
        except (TypeError, ValueError):
            current = 10
        abilities[ability] = min(cap, current + amount)
    sheet["abilities"] = abilities


def apply_choices_to_sheet(
    sheet: dict,
    *,
    class_name: str | None,
    new_level: int,
    choices: dict[str, Any],
    required: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Mutate sheet with validated choices. Returns summary unlocks for the UI."""
    applied: list[dict[str, str]] = []
    by_id = {str(spec["id"]): spec for spec in required}

    for choice_id, payload in choices.items():
        spec = by_id.get(choice_id) or {}
        choice_type = spec.get("type")
        label = spec.get("label") or choice_type or choice_id

        if choice_type == "asi_or_feat":
            if payload.get("mode") == "asi":
                increases = payload["increases"]
                _apply_ability_increases(sheet, increases)
                detail = ", ".join(
                    f"{ABILITY_LABELS[k]} +{v}" for k, v in sorted(increases.items())
                )
                _add_feature(
                    sheet,
                    name="Ability Score Improvement",
                    source=f"{class_name} {new_level}",
                    description=detail,
                )
                applied.append({"kind": "asi", "name": "Ability Score Improvement", "detail": detail})
            else:
                feat_name = payload["feat"]
                feat = _resolve_feat(feat_name)
                _add_feature(
                    sheet,
                    name=feat_name,
                    source=f"Feat · {class_name} {new_level}",
                    description=str(feat.get("description") or ""),
                )
                applied.append({"kind": "feat", "name": feat_name, "detail": "Feat choice"})

        elif choice_type in ("fighting_style", "epic_boon"):
            feat_name = payload["feat"]
            feat = _resolve_feat(feat_name)
            _add_feature(
                sheet,
                name=feat_name,
                source=f"{label} · {class_name} {new_level}",
                description=str(feat.get("description") or ""),
            )
            applied.append({"kind": "feat", "name": feat_name, "detail": label})

        elif choice_type == "subclass":
            subclass_name = payload["name"]
            classes = sheet.get("classes")
            if isinstance(classes, list) and classes and isinstance(classes[0], dict):
                classes[0]["subclass"] = subclass_name
            else:
                sheet["classes"] = [
                    {"name": class_name, "level": new_level, "subclass": subclass_name}
                ]
            _add_feature(
                sheet,
                name=f"{class_name} Subclass: {subclass_name}",
                source=f"{class_name} {new_level}",
                description=f"Chose the {subclass_name} subclass.",
            )
            applied.append({"kind": "subclass", "name": subclass_name, "detail": "Subclass"})

        elif choice_type == "subclass_feature":
            name = payload["name"]
            note = payload.get("note") or ""
            _add_feature(
                sheet,
                name=name,
                source=f"{class_name} {new_level}",
                description=note or f"Subclass feature at level {new_level}.",
            )
            applied.append({"kind": "feature", "name": name, "detail": "Subclass feature"})

        elif choice_type in ("expertise", "scholar"):
            for skill_name in payload["skills"]:
                row = _ensure_skill_row(sheet, skill_name)
                row["proficient"] = True
                row["expertise"] = True
            joined = ", ".join(payload["skills"])
            _add_feature(
                sheet,
                name=str(label),
                source=f"{class_name} {new_level}",
                description=f"Expertise: {joined}",
            )
            applied.append({"kind": "expertise", "name": str(label), "detail": joined})

        elif choice_type == "primal_knowledge":
            skill_name = payload["skills"][0]
            row = _ensure_skill_row(sheet, skill_name)
            row["proficient"] = True
            _add_feature(
                sheet,
                name="Primal Knowledge",
                source=f"{class_name} {new_level}",
                description=f"Gained proficiency in {skill_name}.",
            )
            applied.append({"kind": "skill", "name": skill_name, "detail": "Primal Knowledge"})

        elif choice_type == "divine_order":
            order = payload["order"]
            _add_feature(
                sheet,
                name=f"Divine Order: {order}",
                source=f"{class_name} {new_level}",
                description=next(
                    (opt["detail"] for opt in DIVINE_ORDER_OPTIONS if opt["id"] == order),
                    "",
                ),
            )
            if order == "Thaumaturge":
                # Prefer Religion if neither; leave skill pick soft — player can edit sheet.
                for preferred in ("Religion", "Arcana"):
                    row = _ensure_skill_row(sheet, preferred)
                    if not row.get("proficient"):
                        row["proficient"] = True
                        break
            applied.append({"kind": "choice", "name": f"Divine Order: {order}", "detail": order})

        elif choice_type == "blessed_strikes":
            pick = payload["choice"]
            detail = next(
                (opt["detail"] for opt in BLESSED_STRIKES_OPTIONS if opt["id"] == pick),
                "",
            )
            _add_feature(
                sheet,
                name=pick,
                source=f"{class_name} {new_level}",
                description=detail,
            )
            applied.append({"kind": "feature", "name": pick, "detail": "Blessed Strikes"})

        elif choice_type == "weapon_mastery":
            weapons = payload["weapons"]
            joined = ", ".join(weapons)
            _add_feature(
                sheet,
                name="Weapon Mastery",
                source=f"{class_name} {new_level}",
                description=f"Mastery weapons: {joined}",
            )
            sheet["weapon_mastery"] = weapons
            applied.append({"kind": "choice", "name": "Weapon Mastery", "detail": joined})

    return applied
