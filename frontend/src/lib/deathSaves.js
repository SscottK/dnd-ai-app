export const DEATH_SAVE_ACTION_ID = "std-death-save";
export const DEATH_SAVE_ACTION_NAME = "Death Saving Throw";

export function isDyingPc(combatant) {
  return Boolean(
    combatant?.is_pc &&
      combatant.hp != null &&
      combatant.hp <= 0 &&
      !combatant.death_save_stable
  );
}

export function deathSaveAction() {
  return {
    id: DEATH_SAVE_ACTION_ID,
    name: DEATH_SAVE_ACTION_NAME,
    actionType: "action",
    targeting: "self",
    category: "standard",
    skipsEconomy: true,
  };
}
