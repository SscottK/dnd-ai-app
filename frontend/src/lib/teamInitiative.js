import { canTakeTurn } from "./encounterDisplay";

export const PARTY_SLOT = "__party__";

export function isTeamMode(encounter) {
  return encounter?.initiative_mode === "team";
}

export function isPartyPhaseActive(encounter) {
  return Boolean(encounter?.team?.party_phase_active);
}

export function combatHasStarted(encounter) {
  if (!encounter) return false;
  if (encounter.round > 1) return true;
  return (encounter.combat_log || []).some((entry) => entry.kind === "turn");
}

export function partyPcs(encounter) {
  return (encounter?.combatants || []).filter((c) => c.is_pc && canTakeTurn(c));
}

export function partyRoster(encounter) {
  if (encounter?.team?.party_roster?.length) {
    return encounter.team.party_roster;
  }
  return partyPcs(encounter).map((c) => ({ id: c.id, name: c.name }));
}

export function passTargets(encounter) {
  const completed = new Set(encounter?.team?.completed_this_phase || []);
  const activeId = encounter?.active_combatant_id;
  return partyRoster(encounter).filter((member) => member.id !== activeId && !completed.has(member.id));
}

export function displayCombatants(encounter, { isDmView = false } = {}) {
  if (!isTeamMode(encounter)) {
    return encounter?.combatants || [];
  }
  const combatants = encounter?.combatants || [];
  if (isDmView) {
    return combatants.filter((c) => !c.is_pc && !(c.is_ally && c.controller_character_id));
  }
  return combatants;
}

export function showPartyInitiative(encounter, { isDmView = false } = {}) {
  if (!isTeamMode(encounter)) return false;
  return isDmView || !combatHasStarted(encounter);
}

/** Resolve the viewer's PC combatant when roster rows are redacted during combat. */
export function resolveMyCombatant(encounter, characterId) {
  if (!characterId) return null;
  const direct = (encounter?.combatants || []).find((c) => c.character_id === characterId);
  if (direct) return direct;
  const rosterEntry = partyRoster(encounter).find((r) => r.character_id === characterId);
  if (!rosterEntry) return null;
  return {
    id: rosterEntry.id,
    name: rosterEntry.name,
    character_id: characterId,
    is_pc: true,
    initiative: encounter?.team?.initiative_rolls?.[rosterEntry.id] ?? 0,
  };
}
