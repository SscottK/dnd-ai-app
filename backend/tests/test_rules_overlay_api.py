"""Frontend/API alignment for merged 2024 catalogs."""

from __future__ import annotations

from app.services.srd_catalog import list_entries, lookup_entry


def test_spell_list_includes_overlay_when_present():
    spells = list_entries("spells")
    assert len(spells) >= 300
    names = {s["name"].casefold() for s in spells if s.get("name")}
    # SRD baseline always present
    assert "fireball" in names


def test_magic_item_list_merged():
    items = list_entries("magic_items")
    assert len(items) >= 200
    names = {i["name"].casefold() for i in items if i.get("name")}
    assert "alchemy jug" in names or "bag of holding" in names


def test_monster_lookup_uses_effective_initiative():
    goblin = lookup_entry("monsters", "Goblin")
    assert goblin is not None
    # 2024 Dex + PB for Goblin
    assert goblin.get("initiative_modifier") == 4
    assert goblin.get("default_initiative") == 14
