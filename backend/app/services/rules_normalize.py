"""Normalize rules catalog entries so SRD and private overlays share one display shape."""

from __future__ import annotations

import re


_CHAPTER_FOOTER = re.compile(
    r"(?im)^(?:CHAPTER|CH APTER|CHA PTER|C H A PTE R|CH \\PTE R|CB APTER).*$"
)
_SPECIES_FIELD_LABELS = ("Creature Type", "Size", "Speed")
_BACKGROUND_FIELD_MAP = (
    ("ability_scores", "Ability Scores"),
    ("feat", "Feat"),
    ("skill_proficiencies", "Skill Proficiencies"),
    ("tool_proficiency", "Tool Proficiency"),
    ("tool_proficiencies", "Tool Proficiency"),
    ("equipment", "Equipment"),
)
_FEAT_CATEGORY_LABELS = {
    "origin": "Origin Feat",
    "general": "General Feat",
    "fighting_style": "Fighting Style Feat",
    "epic_boon": "Epic Boon Feat",
}


def _clean_text(text: str | None) -> str:
    if not text:
        return ""
    cleaned = str(text).replace("\u00ad", "")
    cleaned = cleaned.replace("-\n", "")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"[^\S\n]+", " ", cleaned)
    cleaned = _CHAPTER_FOOTER.sub("", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _parse_labeled_fields(description: str, labels: tuple[str, ...]) -> dict[str, str]:
    fields: dict[str, str] = {}
    if not description:
        return fields
    for label in labels:
        match = re.search(
            rf"(?ims)^{re.escape(label)}:\s*(.+?)(?=^(?:{'|'.join(re.escape(item) for item in labels)}):|\nAs an?\b|\nYou\b|\Z)",
            description,
        )
        if not match:
            match = re.search(rf"(?im)^{re.escape(label)}:\s*(.+)$", description)
        if match:
            value = re.sub(r"\s*\n\s*", " ", match.group(1)).strip()
            if value:
                fields[label] = value
    return fields


def _strip_labeled_lines(description: str, labels: list[str]) -> str:
    if not description or not labels:
        return description or ""
    label_set = {label.casefold() for label in labels}
    kept: list[str] = []
    skipping_multiline = False
    for line in description.splitlines():
        stripped = line.strip()
        match = re.match(r"^([^:]+):\s*(.*)$", stripped)
        if match and match.group(1).strip().casefold() in label_set:
            skipping_multiline = True
            continue
        if skipping_multiline:
            # continuation lines for Size etc. until blank or new Trait-like sentence
            if not stripped:
                skipping_multiline = False
                kept.append(line)
                continue
            if re.match(r"^[A-Z][^.]{0,40}\.\s", stripped) or re.match(r"^As an?\b", stripped):
                skipping_multiline = False
            else:
                continue
        kept.append(line)
    text = "\n".join(kept)
    text = re.sub(r"(?im)^(Aasimar|Dragonborn|Dwarf|Elf|Gnome|Goliath|Halfling|Human|Orc|Tiefling)\s+Traits\s*$", "", text)
    return _clean_text(text)


def normalize_species(entry: dict) -> dict:
    out = dict(entry)
    description = _clean_text(out.get("description") or out.get("desc") or "")
    fields = dict(out.get("fields") or {})
    parsed = _parse_labeled_fields(description, _SPECIES_FIELD_LABELS)
    for key, value in parsed.items():
        fields.setdefault(key, value)
    if fields:
        out["fields"] = fields
    out["description"] = _strip_labeled_lines(description, list(fields.keys()) or list(_SPECIES_FIELD_LABELS))
    return out


def _trim_background_equipment(text: str) -> str:
    cleaned = _clean_text(text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Drop flavor that leaked past the GP / Choose A or B line.
    split = re.split(r"(?<=\bGP)\s+(?=You(?:r)?\b)", cleaned, maxsplit=1)
    cleaned = split[0].strip()
    if re.search(r"\bYou(?:r)?\b", cleaned) and "Choose" in cleaned:
        cleaned = re.split(r"\s+(?=You(?:r)?\b)", cleaned, maxsplit=1)[0].strip()
    return cleaned[:500]


def normalize_background(entry: dict) -> dict:
    out = dict(entry)
    fields = dict(out.get("fields") or {})
    for attr, label in _BACKGROUND_FIELD_MAP:
        value = out.get(attr)
        if value:
            cleaned = _clean_text(str(value))
            cleaned = re.sub(r"\s*\(see chapter 5\)", "", cleaned, flags=re.I).strip()
            if label == "Equipment":
                cleaned = _trim_background_equipment(cleaned)
            fields[label] = cleaned
            out[attr] = cleaned
    if "Equipment" in fields:
        fields["Equipment"] = _trim_background_equipment(fields["Equipment"])
    if fields:
        out["fields"] = fields
    # Background card is the fields panel; keep description empty unless true flavor remains.
    description = _clean_text(out.get("description") or "")
    description = _strip_labeled_lines(description, list(fields.keys()))
    # If only leftover punctuation/equipment crumbs, drop it.
    if len(description) < 40 or description.lower().startswith("choose a or b"):
        description = ""
    out["description"] = description
    return out


def normalize_feat(entry: dict) -> dict:
    out = dict(entry)
    description = _clean_text(out.get("description") or "")
    description = re.sub(r"(?im)^Magic Feature\)\s*", "", description)
    out["description"] = description
    category = str(out.get("category") or "").strip().casefold()
    if category and category in _FEAT_CATEGORY_LABELS:
        out["fields"] = {
            **dict(out.get("fields") or {}),
            "Category": _FEAT_CATEGORY_LABELS[category],
        }
    return out


def normalize_magic_item(entry: dict) -> dict:
    out = dict(entry)
    description = _clean_text(out.get("description") or "")
    type_line = out.get("type_line") or out.get("rarity")
    if not type_line and description.startswith("_") and "_" in description[1:]:
        # already SRD italic subtitle style
        out["description"] = description
        return out
    if type_line and not description.startswith("_"):
        out["description"] = f"_{type_line}_\n\n{description}".strip()
    else:
        out["description"] = description
    if out.get("type") and not out.get("category"):
        out["category"] = out["type"]
    return out


def normalize_spell(entry: dict) -> dict:
    out = dict(entry)
    for key in ("description", "casting_time", "range", "components", "duration"):
        if out.get(key):
            out[key] = _clean_text(str(out[key]))
    school = str(out.get("school") or "").strip()
    if re.match(r"(?i)^(cantrip|level\s*\d+)$", school):
        out.pop("school", None)
    return out


def normalize_entry(category: str, entry: dict | None) -> dict | None:
    if not entry or not isinstance(entry, dict):
        return entry
    if category == "species":
        return normalize_species(entry)
    if category == "backgrounds":
        return normalize_background(entry)
    if category == "feats":
        return normalize_feat(entry)
    if category == "magic_items":
        return normalize_magic_item(entry)
    if category == "spells":
        return normalize_spell(entry)
    # Light cleanup for everything else with prose.
    out = dict(entry)
    for key in ("description", "desc", "content"):
        if out.get(key):
            out[key] = _clean_text(str(out[key]))
    return out
