"""NPC combatant naming: SRD stat block vs display label."""

from __future__ import annotations

from app.api.schemas import EncounterCombatant, EncounterEnemyInput, SavedEncounterMonsterEntry
from app.services.encounter_actions import new_combatant_id
from app.services.monster_catalog import apply_monster_catalog_to_combatant
from app.services.conditions import sanitize_conditions_list


def resolve_enemy_srd_name(enemy: EncounterEnemyInput | SavedEncounterMonsterEntry | object) -> str:
    srd = getattr(enemy, "srd_name", None) or getattr(enemy, "name", None)
    cleaned = str(srd or "").strip()
    if not cleaned:
        raise ValueError("Monster requires an SRD stat block name.")
    return cleaned


def enemy_display_label(enemy: object, *, index: int, count: int) -> str:
    custom = getattr(enemy, "label", None)
    if custom and str(custom).strip():
        base = str(custom).strip()
    else:
        base = resolve_enemy_srd_name(enemy)
    if count == 1:
        return base
    return f"{base} {index + 1}"


def normalize_npc_combatant(combatant: EncounterCombatant) -> EncounterCombatant:
    if combatant.is_pc or combatant.character_id:
        return combatant
    if combatant.srd_name:
        return combatant
    return combatant.model_copy(update={"srd_name": combatant.name})


def build_npc_combatant_from_enemy(
    enemy: EncounterEnemyInput | SavedEncounterMonsterEntry,
    *,
    index: int,
    count: int,
) -> EncounterCombatant:
    srd_name = resolve_enemy_srd_name(enemy)
    display_name = enemy_display_label(enemy, index=index, count=count)
    raw_actions = getattr(enemy, "combat_actions", None) or []
    hidden = bool(getattr(enemy, "hidden_at_start", False))
    initiative = 0 if hidden else int(getattr(enemy, "initiative", 0) or 0)
    combatant = EncounterCombatant(
        id=new_combatant_id(),
        name=display_name,
        srd_name=srd_name,
        initiative=initiative,
        is_pc=False,
        is_ally=False,
        character_id=None,
        hidden_from_players=hidden,
        hp=getattr(enemy, "hp", None),
        max_hp=getattr(enemy, "max_hp", None) or getattr(enemy, "hp", None),
        ac=getattr(enemy, "ac", None),
        conditions=sanitize_conditions_list(getattr(enemy, "conditions", None)),
        combat_actions=list(raw_actions),
    )
    return apply_monster_catalog_to_combatant(combatant)
