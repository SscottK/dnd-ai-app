export function isEnemy(combatant) {
  return Boolean(combatant && !combatant.is_pc && !combatant.is_ally);
}

/** Enemies at 0 HP leave the turn order and sit at the bottom — no death saves. */
export function isDefeatedEnemy(combatant) {
  return isEnemy(combatant) && combatant.hp != null && combatant.hp <= 0;
}

export function canTakeTurn(combatant) {
  return !isDefeatedEnemy(combatant);
}

export function sortCombatantsForDisplay(combatants) {
  const list = [...(combatants || [])];
  const living = list.filter((c) => canTakeTurn(c));
  const defeated = list.filter((c) => isDefeatedEnemy(c));
  const byInit = (a, b) => b.initiative - a.initiative;
  return [...living.sort(byInit), ...defeated.sort(byInit)];
}

export function sortCombatantsForTurns(combatants) {
  return [...(combatants || [])].filter(canTakeTurn).sort((a, b) => b.initiative - a.initiative);
}

/** Whether a player (non-DM) may see this combatant's AC on the initiative tracker. */
export function playerCanSeeCombatantAc(combatant) {
  return Boolean(combatant?.is_pc || combatant?.is_ally);
}

export function shouldShowCombatantAc(combatant, isDmView) {
  if (isDmView) return true;
  return playerCanSeeCombatantAc(combatant);
}

/** Normalize PATCH /encounter response (wraps encounter when combat auto-ends). */
export function parseEncounterPatchResponse(data) {
  if (data?.encounter) {
    return {
      encounter: data.encounter,
      combatEnded: Boolean(data.combat_ended),
      combatLogText: data.combat_log_text ?? null,
      reason: data.reason ?? null,
    };
  }
  return { encounter: data, combatEnded: false, combatLogText: null, reason: null };
}

export function formatCombatantAc(combatant, isDmView) {
  if (!shouldShowCombatantAc(combatant, isDmView) || combatant.ac == null) return "";
  return ` · AC ${combatant.ac}`;
}

export function formatCombatantSpeed(speed) {
  if (speed == null) return "";
  return ` · ${speed} ft`;
}

export function formatSpeedLabel(speed) {
  return speed != null ? `${speed} ft` : "—";
}

export function combatantHpText(combatant) {
  if (combatant?.hp != null && combatant?.max_hp != null) {
    return `${combatant.hp}/${combatant.max_hp}`;
  }
  if (combatant?.hp != null) return String(combatant.hp);
  if (combatant?.max_hp != null) return `—/${combatant.max_hp}`;
  return null;
}

export function combatantAcText(combatant, isDmView) {
  if (!shouldShowCombatantAc(combatant, isDmView) || combatant?.ac == null) return null;
  return String(combatant.ac);
}

export function combatantMoveText(combatant, economy) {
  const speed = combatant?.speed;
  const remaining = economy?.movement_remaining;
  if (remaining != null && speed != null) return `${remaining}/${speed} ft`;
  if (remaining != null) return `${remaining} ft`;
  return speed != null ? `${speed} ft` : null;
}

export function turnStatusLabels(economy) {
  if (!economy) return [];
  const labels = [];
  if (economy.dodging) labels.push("Dodging");
  if (economy.disengaged) labels.push("Disengaged");
  if (economy.hiding) labels.push("Hiding");
  return labels;
}
