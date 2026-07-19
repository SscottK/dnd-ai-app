"""Tests for 2024 character initiative (Alert → Dex + PB)."""

from __future__ import annotations

from app.services.character_sheet import computed_initiative_bonus, sheet_has_alert_feat


def test_alert_detected_from_features():
    sheet = {"features": [{"name": "Alert", "source": "Origin Feat"}]}
    assert sheet_has_alert_feat(sheet) is True


def test_initiative_dex_only_without_alert():
    sheet = {
        "abilities": {"dex": 16},
        "proficiency_bonus": 3,
        "features": [{"name": "Lucky"}],
    }
    assert computed_initiative_bonus(sheet) == 3


def test_initiative_alert_adds_pb():
    sheet = {
        "abilities": {"dex": 16},
        "proficiency_bonus": 3,
        "features": [{"name": "Alert"}],
    }
    # Dex +3 + PB +3
    assert computed_initiative_bonus(sheet) == 6


def test_initiative_keeps_higher_explicit_bonus():
    sheet = {
        "abilities": {"dex": 14},
        "proficiency_bonus": 2,
        "initiative_bonus": 7,
        "features": [{"name": "Alert"}],
    }
    # Dex+2 + PB+2 = 4, but sheet has magic/item total 7
    assert computed_initiative_bonus(sheet) == 7
