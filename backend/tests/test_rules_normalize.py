"""Consistency checks for normalized rules catalog entries."""

from __future__ import annotations

from app.services.srd_catalog import list_entries, lookup_entry


def test_species_all_have_fields():
    rows = list_entries("species")
    assert len(rows) >= 10
    for row in rows:
        fields = row.get("fields") or {}
        assert fields.get("Creature Type"), row["name"]
        assert fields.get("Size"), row["name"]
        assert fields.get("Speed"), row["name"]


def test_aasimar_matches_species_shape():
    aasimar = lookup_entry("species", "Aasimar")
    human = lookup_entry("species", "Human")
    assert aasimar and human
    assert set(aasimar["fields"]) >= {"Creature Type", "Size", "Speed"}
    assert set(human["fields"]) >= {"Creature Type", "Size", "Speed"}
    assert "Creature Type:" not in (aasimar.get("description") or "")


def test_backgrounds_all_have_fields_not_duplicated_prose():
    rows = list_entries("backgrounds")
    assert len(rows) == 16
    for row in rows:
        fields = row.get("fields") or {}
        assert fields.get("Ability Scores"), row["name"]
        assert fields.get("Feat"), row["name"]
        assert fields.get("Skill Proficiencies"), row["name"]
        eq = fields.get("Equipment") or ""
        assert "Choose" in eq, row["name"]
        assert "You " not in eq and "Your " not in eq, (row["name"], eq)
        assert len(eq) < 350, (row["name"], len(eq), eq)
        desc = row.get("description") or ""
        assert not desc.lower().startswith("ability scores:")


def test_feats_expose_category_label():
    alert = lookup_entry("feats", "Alert")
    assert alert
    assert alert.get("fields", {}).get("Category") == "Origin Feat"


def test_magic_items_have_type_subtitle():
    jug = lookup_entry("magic_items", "Alchemy Jug")
    bag = lookup_entry("magic_items", "Bag of Holding")
    assert jug and bag
    assert (jug.get("description") or "").startswith("_")
    assert (bag.get("description") or "").startswith("_")
