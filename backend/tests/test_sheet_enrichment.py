"""Sheet enrichment helpers (resources, spell slots)."""

from app.services.sheet_enrichment import enrich_resources


def test_enrich_resources_preserves_pdf_spell_slots():
    sheet = {
        "resources": [
            {
                "name": "1st Level Spell Slots",
                "current": 2,
                "max": 4,
                "recharge": "long_rest",
            },
            {
                "id": "spell_slot_2",
                "name": "2nd-level spell slots",
                "current": 0,
                "max": 3,
            },
        ],
        "classes": [{"name": "Wizard", "level": 5}],
    }
    resources = enrich_resources(sheet, sheet["classes"])
    by_id = {entry["id"]: entry for entry in resources}
    assert by_id["spell-slot-1"]["current"] == 2
    assert by_id["spell-slot-1"]["max"] == 4
    assert by_id["spell-slot-2"]["current"] == 0
    assert by_id["spell-slot-2"]["max"] == 3


def test_enrich_resources_spell_slots_from_feature_text():
    sheet = {
        "resources": [],
        "features": [
            {
                "name": "3rd Level Spell Slots",
                "description": "You have 1/3 third-level spell slots.",
            }
        ],
        "classes": [{"name": "Cleric", "level": 5}],
    }
    resources = enrich_resources(sheet, sheet["classes"])
    slot = next((entry for entry in resources if entry["id"] == "spell-slot-3"), None)
    assert slot is not None
    assert slot["current"] == 1
    assert slot["max"] == 3
