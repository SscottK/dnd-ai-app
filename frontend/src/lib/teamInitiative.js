import { canTakeTurn, isDefeatedEnemy, sortCombatantsForDisplay } from "./encounterDisplay";

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

export function partyRoster(encounter) {
  if (encounter?.team?.party_roster?.length) {
    return encounter.team.party_roster;
  }
  return partyPcs(encounter).map((c) => ({
    id: c.id,
    name: c.name,
    character_id: c.character_id,
  }));
}

/** PCs in the party group — falls back to server roster when PC rows are redacted. */
export function partyPcs(encounter) {
  const fromCombatants = (encounter?.combatants || []).filter((c) => c.is_pc && canTakeTurn(c));
  if (fromCombatants.length) return fromCombatants;
  return partyRoster(encounter).map((member) => ({
    id: member.id,
    name: member.name,
    character_id: member.character_id,
    is_pc: true,
    initiative: encounter?.team?.initiative_rolls?.[member.id] ?? 0,
  }));
}

export function createPartySlotCombatant(encounter) {
  const roster = partyRoster(encounter);
  const names = roster.map((member) => member.name).filter(Boolean);
  return {
    id: PARTY_SLOT,
    name: roster.length ? `Party (${roster.length})` : "Party",
    is_pc: true,
    is_party_slot: true,
    initiative: encounter?.team?.party_initiative ?? 0,
    party_members: roster,
    party_member_names: names.join(", "),
  };
}

function nonPartyTrackerCombatants(encounter) {
  return (encounter?.combatants || []).filter(
    (combatant) =>
      !combatant.is_pc && !(combatant.is_ally && combatant.controller_character_id)
  );
}

function fallbackTeamTracker(encounter) {
  const living = nonPartyTrackerCombatants(encounter).filter((combatant) => canTakeTurn(combatant));
  const defeated = nonPartyTrackerCombatants(encounter).filter((combatant) => isDefeatedEnemy(combatant));
  const entries = [...living];
  if (partyPcs(encounter).length) {
    entries.push(createPartySlotCombatant(encounter));
  }
  return [...sortCombatantsForDisplay(entries), ...defeated.sort((a, b) => b.initiative - a.initiative)];
}

/** Initiative tracker rows for team mode (includes a single party slot instead of each PC). */
export function buildTrackerCombatants(encounter, { isDmView = false } = {}) {
  if (!isTeamMode(encounter)) {
    return encounter?.combatants || [];
  }

  const turnSlots = encounter?.team?.turn_slots || [];
  if (!turnSlots.length) {
    return fallbackTeamTracker(encounter);
  }

  const byId = new Map((encounter?.combatants || []).map((combatant) => [combatant.id, combatant]));
  const partySlot = createPartySlotCombatant(encounter);
  const entries = [];
  const seen = new Set();

  for (const slot of turnSlots) {
    if (slot === PARTY_SLOT) {
      if (partyPcs(encounter).length) {
        entries.push(partySlot);
        seen.add(PARTY_SLOT);
      }
      continue;
    }
    const combatant = byId.get(slot);
    if (!combatant || seen.has(slot)) continue;
    if (combatant.is_pc) continue;
    if (combatant.is_ally && combatant.controller_character_id) continue;
    entries.push(combatant);
    seen.add(slot);
  }

  const defeated = nonPartyTrackerCombatants(encounter).filter(
    (combatant) => isDefeatedEnemy(combatant) && !seen.has(combatant.id)
  );
  return [...entries, ...defeated.sort((a, b) => b.initiative - a.initiative)];
}

export function isPartySlotEntry(combatant) {
  return Boolean(combatant?.is_party_slot || combatant?.id === PARTY_SLOT);
}

export function isTrackerEntryActive(entry, encounter, activeCombatant) {
  if (!entry) return false;
  if (isPartySlotEntry(entry)) {
    return isPartyPhaseActive(encounter);
  }
  if (isDefeatedEnemy(entry)) return false;
  return activeCombatant?.id === entry.id;
}

export function resolveActiveCombatant(encounter) {
  const combatants = encounter?.combatants || [];
  const activeId = encounter?.active_combatant_id;
  if (activeId) {
    const direct = combatants.find((combatant) => combatant.id === activeId);
    if (direct) return direct;
    const rosterEntry = partyRoster(encounter).find((member) => member.id === activeId);
    if (rosterEntry) {
      return {
        id: rosterEntry.id,
        name: rosterEntry.name,
        character_id: rosterEntry.character_id,
        is_pc: true,
      };
    }
    const partyPc = partyPcs(encounter).find((combatant) => combatant.id === activeId);
    if (partyPc) return partyPc;
  }
  const turnSorted = sortCombatantsForDisplay(combatants).filter(canTakeTurn);
  return turnSorted[encounter?.active_index] || null;
}

export function hasTurnOrder(encounter) {
  if (!encounter) return false;
  if (isTeamMode(encounter)) {
    return (
      (encounter.team?.turn_slots?.length || 0) > 0 ||
      buildTrackerCombatants(encounter).length > 0
    );
  }
  return (encounter.combatants || []).some(canTakeTurn);
}

export function passTargets(encounter) {
  const completed = new Set(encounter?.team?.completed_this_phase || []);
  const activeId = encounter?.active_combatant_id;
  return partyRoster(encounter).filter((member) => member.id !== activeId && !completed.has(member.id));
}

export function displayCombatants(encounter, options = {}) {
  return buildTrackerCombatants(encounter, options);
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

export function partyControllerOptions(encounter) {
  return partyPcs(encounter)
    .filter((combatant) => combatant.character_id)
    .map((combatant) => ({
      character_id: combatant.character_id,
      name: combatant.name,
    }));
}
