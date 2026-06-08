"""Inject relevant SRD 5.2.1 excerpts into Rule Wizard prompts."""

from __future__ import annotations

import re

from app.services.srd_catalog import search_catalog

MAX_CONTEXT_CHARS = 4000
ENTRY_MAX_CHARS = 900


def _format_entry(entry: dict) -> str:
    category = entry.get("category", "rule")
    name = entry.get("name", "Unknown")
    tag = entry.get("tag")
    header = f"[{category}] {name}"
    if tag:
        header += f" ({tag})"

    body = entry.get("description") or entry.get("desc") or ""
    fields = entry.get("fields")
    if fields:
        field_lines = [f"{key}: {value}" for key, value in fields.items()]
        body = "\n".join(field_lines) + ("\n\n" + body if body else "")

    if category in {"weapons", "armor"}:
        parts = []
        for key in ("category", "cost", "damage_dice", "damage_type", "properties", "ac_base"):
            value = entry.get(key)
            if value:
                parts.append(f"{key}: {value}")
        if parts:
            body = "\n".join(parts)

    body = re.sub(r"\s+", " ", body).strip()
    if len(body) > ENTRY_MAX_CHARS:
        body = body[: ENTRY_MAX_CHARS - 3].rstrip() + "..."

    return f"{header}\n{body}" if body else header


def build_srd_context(user_query: str) -> str:
    hits = search_catalog(user_query, limit=10)
    if not hits:
        return ""

    blocks: list[str] = []
    total = 0
    for entry in hits:
        block = _format_entry(entry)
        if total + len(block) > MAX_CONTEXT_CHARS:
            break
        blocks.append(block)
        total += len(block) + 2

    return "\n\n".join(blocks)
