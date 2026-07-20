"""Condition → attack roll advantage/disadvantage (5.5e Rules Glossary)."""

from __future__ import annotations

import re

from app.services.conditions import has_condition


def _is_ranged_attack(*, action_name: str | None = None, detail: str | None = None) -> bool:
    text = " ".join(part for part in (action_name, detail) if part).casefold()
    if re.search(r"\branged\s+attack\s+roll\b", text):
        return True
    if re.search(r"\bmelee\s+attack\s+roll\b", text):
        return False
    if re.search(r"\branged\b", text) and "melee" not in text:
        return True
    return False


def attack_advantage_flags(
    *,
    actor_conditions: list[str] | str | None,
    target_conditions: list[str] | str | None,
    action_name: str | None = None,
    detail: str | None = None,
) -> tuple[bool, bool, list[str]]:
    """Return (advantage, disadvantage, reason tags) from conditions only.

    Callers merge with Help/Dodge and cancel opposing flags themselves.
    """
    advantage = False
    disadvantage = False
    tags: list[str] = []
    ranged = _is_ranged_attack(action_name=action_name, detail=detail)

    # Attacker conditions
    if has_condition(actor_conditions, "Blinded"):
        disadvantage = True
        tags.append("blinded")
    if has_condition(actor_conditions, "Invisible"):
        advantage = True
        tags.append("invisible")
    if has_condition(actor_conditions, "Poisoned"):
        disadvantage = True
        tags.append("poisoned")
    if has_condition(actor_conditions, "Prone"):
        disadvantage = True
        tags.append("prone (attacker)")
    if has_condition(actor_conditions, "Restrained"):
        disadvantage = True
        tags.append("restrained")
    if has_condition(actor_conditions, "Frightened"):
        disadvantage = True
        tags.append("frightened")

    # Target conditions
    if has_condition(target_conditions, "Blinded"):
        advantage = True
        tags.append("vs blinded")
    if has_condition(target_conditions, "Invisible"):
        disadvantage = True
        tags.append("vs invisible")
    if has_condition(target_conditions, "Paralyzed"):
        advantage = True
        tags.append("vs paralyzed")
    if has_condition(target_conditions, "Petrified"):
        advantage = True
        tags.append("vs petrified")
    if has_condition(target_conditions, "Restrained"):
        advantage = True
        tags.append("vs restrained")
    if has_condition(target_conditions, "Stunned"):
        advantage = True
        tags.append("vs stunned")
    if has_condition(target_conditions, "Unconscious"):
        advantage = True
        tags.append("vs unconscious")
    if has_condition(target_conditions, "Prone"):
        if ranged:
            disadvantage = True
            tags.append("vs prone (ranged)")
        else:
            advantage = True
            tags.append("vs prone (melee)")

    return advantage, disadvantage, tags


def is_auto_crit_melee(
    *,
    target_conditions: list[str] | str | None,
    action_name: str | None = None,
    detail: str | None = None,
) -> bool:
    """Melee hits vs Paralyzed/Unconscious within 5 ft are critical (5.5e)."""
    if _is_ranged_attack(action_name=action_name, detail=detail):
        return False
    return has_condition(target_conditions, "Paralyzed") or has_condition(
        target_conditions, "Unconscious"
    )
