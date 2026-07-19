"""Level-up progression helpers (5.5e)."""

from app.services.level_choices import choices_at_level, validate_choices
from app.services.level_progression import (
    apply_level_up,
    average_hp_gain,
    bump_hit_dice,
    preview_level_up,
    proficiency_bonus_for_level,
    revert_level_up,
    unlocks_at_level,
)


def test_proficiency_bonus_bands():
    assert proficiency_bonus_for_level(1) == 2
    assert proficiency_bonus_for_level(4) == 2
    assert proficiency_bonus_for_level(5) == 3
    assert proficiency_bonus_for_level(9) == 4
    assert proficiency_bonus_for_level(17) == 6


def test_average_hp_gain_includes_con():
    assert average_hp_gain(10, 2) == 8
    assert average_hp_gain(8, -1) == 4
    assert average_hp_gain(6, -3) == 1


def test_bump_hit_dice():
    assert bump_hit_dice("1d10", "Fighter") == "2d10"
    assert bump_hit_dice("3d8", "Rogue") == "4d8"
    assert bump_hit_dice(None, "Wizard") == "2d6"


def test_fighter_level_2_unlocks_action_surge():
    unlocks = unlocks_at_level("Fighter", 2)
    names = {u["name"] for u in unlocks}
    assert "Action Surge" in names


def test_fighter_level_4_requires_asi_or_feat():
    sheet = {"abilities": {"str": 16, "con": 14}, "classes": [{"name": "Fighter", "level": 3}]}
    required = choices_at_level("Fighter", 4, sheet)
    assert len(required) == 1
    assert required[0]["type"] == "asi_or_feat"


def test_fighter_level_3_requires_subclass():
    required = choices_at_level("Fighter", 3, {"classes": [{"name": "Fighter", "level": 2}]})
    assert any(c["type"] == "subclass" for c in required)


def test_preview_includes_required_choices():
    sheet = {
        "abilities": {"con": 14},
        "classes": [{"name": "Fighter", "level": 3}],
        "hit_dice": "3d10",
        "resources": [],
        "features": [],
    }
    preview = preview_level_up(sheet=sheet, class_name="Fighter", current_level=3)
    assert preview["new_level"] == 4
    assert any(c["type"] == "asi_or_feat" for c in preview["required_choices"])


def test_apply_rejects_missing_choices():
    sheet = {
        "abilities": {"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 8},
        "classes": [{"name": "Fighter", "level": 3}],
        "hit_dice": "3d10",
        "resources": [],
        "features": [],
        "skills": [],
    }
    try:
        apply_level_up(
            sheet=sheet,
            class_name="Fighter",
            current_level=3,
            current_hp=30,
            current_max_hp=30,
            hp_gain=8,
            choices={},
        )
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Missing required choices" in str(exc)


def test_apply_asi_and_snapshot_revert():
    sheet = {
        "abilities": {"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 8},
        "classes": [{"name": "Fighter", "level": 3, "subclass": "Champion"}],
        "hit_dice": "3d10",
        "resources": [],
        "features": [],
        "skills": [],
    }
    result = apply_level_up(
        sheet=sheet,
        class_name="Fighter",
        current_level=3,
        current_hp=30,
        current_max_hp=30,
        current_ac=16,
        hp_gain=8,
        choices={"asi_or_feat": {"mode": "asi", "increases": {"str": 2}}},
    )
    assert result["level"] == 4
    assert result["sheet"]["abilities"]["str"] == 18
    assert result["sheet"]["level_history"]
    assert result["max_hp"] == 38

    restored = revert_level_up(sheet=result["sheet"])
    assert restored["level"] == 3
    assert restored["max_hp"] == 30
    assert restored["sheet"]["abilities"]["str"] == 16
    assert restored["sheet"]["level_history"] == []


def test_apply_subclass_choice():
    sheet = {
        "abilities": {"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 8},
        "classes": [{"name": "Fighter", "level": 2}],
        "hit_dice": "2d10",
        "resources": [],
        "features": [],
        "skills": [],
    }
    result = apply_level_up(
        sheet=sheet,
        class_name="Fighter",
        current_level=2,
        current_hp=20,
        current_max_hp=20,
        hp_gain=7,
        choices={"subclass": {"name": "Champion"}},
    )
    assert result["sheet"]["classes"][0]["subclass"] == "Champion"
    assert any(u["name"] == "Champion" for u in result["choices_applied"])


def test_validate_asi_shapes():
    required = [{"id": "asi_or_feat", "type": "asi_or_feat", "label": "ASI"}]
    ok = validate_choices(required, {"asi_or_feat": {"mode": "asi", "increases": {"str": 1, "dex": 1}}})
    assert ok["asi_or_feat"]["increases"]["str"] == 1
    try:
        validate_choices(required, {"asi_or_feat": {"mode": "asi", "increases": {"str": 3}}})
        assert False
    except ValueError:
        pass


def test_apply_level_up_fighter_1_to_2_no_choices():
    sheet = {
        "abilities": {"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 10, "cha": 8},
        "classes": [{"name": "Fighter", "level": 1}],
        "hit_dice": "1d10",
        "resources": [
            {
                "id": "second-wind",
                "name": "Second Wind",
                "current": 2,
                "max": 2,
                "recharge": "short_rest",
            }
        ],
        "features": [],
        "skills": [],
        "inventory": [],
    }
    result = apply_level_up(
        sheet=sheet,
        class_name="Fighter",
        current_level=1,
        current_hp=12,
        current_max_hp=12,
        hp_gain=8,
        heal_current=True,
        choices={},
    )
    assert result["level"] == 2
    assert result["max_hp"] == 20
    assert result["sheet"]["hit_dice"] == "2d10"
    assert result["sheet"]["level_history"]
    feature_names = {f["name"] for f in result["sheet"].get("features") or []}
    assert "Action Surge" in feature_names or "Tactical Mind" in feature_names
