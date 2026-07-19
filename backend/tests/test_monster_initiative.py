"""Tests for 2024 monster initiative (Dex + PB) and private overlay merge."""

from __future__ import annotations

from app.services.monster_catalog import (
    effective_initiative_modifier,
    lookup_monster,
    proficiency_bonus_for_cr,
)


def test_proficiency_bonus_for_cr_bands():
    assert proficiency_bonus_for_cr("1/4") == 2
    assert proficiency_bonus_for_cr(5) == 3
    assert proficiency_bonus_for_cr("21") == 7


def test_srd_goblin_initiative_is_dex_plus_pb():
    goblin = lookup_monster("Goblin")
    assert goblin is not None
    # Dex 14 (+2) + PB +2 for CR 1/4 → +4 (2024), not legacy Dex-only +2
    assert effective_initiative_modifier(goblin) == 4


def test_printed_initiative_preferred():
    monster = {
        "name": "Test Beast",
        "initiative_modifier": 9,
        "initiative_printed": True,
        "cr": "5",
        "stat_block_json": {"ability_scores": {"dex": 14}},
    }
    assert effective_initiative_modifier(monster) == 9
