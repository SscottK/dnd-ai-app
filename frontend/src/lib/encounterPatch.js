import { apiFetch } from "./api";
import { parseEncounterPatchResponse } from "./encounterDisplay";

/** Strip server-owned fields before PATCH /encounter (DM tracker saves). */
export function encounterPatchBody(encounter) {
  if (!encounter) return encounter;
  const { turn_economy: _turnEconomy, ...body } = encounter;
  return body;
}

/** Reveal a hidden enemy during combat — rolls initiative and adds them to the player tracker. */
export async function revealHiddenCombatant(token, campaignId, combatantId) {
  const res = await apiFetch(`/campaigns/${campaignId}/encounter/reveal-combatant`, {
    token,
    method: "POST",
    body: { combatant_id: combatantId },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not reveal enemy");
  }
  return parseEncounterPatchResponse(await res.json());
}
