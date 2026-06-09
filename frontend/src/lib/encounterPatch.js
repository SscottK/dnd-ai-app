/** Strip server-owned fields before PATCH /encounter (DM tracker saves). */
export function encounterPatchBody(encounter) {
  if (!encounter) return encounter;
  const { turn_economy: _turnEconomy, ...body } = encounter;
  return body;
}
