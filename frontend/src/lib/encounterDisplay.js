/** Whether a player (non-DM) may see this combatant's AC on the initiative tracker. */
export function playerCanSeeCombatantAc(combatant) {
  return Boolean(combatant?.is_pc || combatant?.is_ally);
}

export function shouldShowCombatantAc(combatant, isDmView) {
  if (isDmView) return true;
  return playerCanSeeCombatantAc(combatant);
}

export function formatCombatantAc(combatant, isDmView) {
  if (!shouldShowCombatantAc(combatant, isDmView) || combatant.ac == null) return "";
  return ` · AC ${combatant.ac}`;
}
