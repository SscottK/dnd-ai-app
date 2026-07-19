import { apiFetch } from "./api";

/** Client-side roll for hit die + CON (matches server roll bounds). */
export function rollHitDieHp(hitDie, conModifier) {
  const die = Math.max(1, Number(hitDie) || 8);
  const con = Number(conModifier) || 0;
  const roll = 1 + Math.floor(Math.random() * die);
  return Math.max(1, roll + con);
}

export async function fetchLevelUpPreview(characterId, token) {
  const res = await apiFetch(`/characters/${characterId}/level-up/preview`, { token });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Could not preview level-up");
  }
  return res.json();
}

export async function applyLevelUp(
  characterId,
  token,
  { hpGain, healCurrent = true, hpMethod, choices = {} }
) {
  const res = await apiFetch(`/characters/${characterId}/level-up`, {
    token,
    method: "POST",
    body: {
      hp_gain: hpGain,
      heal_current: healCurrent,
      hp_method: hpMethod || null,
      choices,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Level-up failed");
  }
  return res.json();
}

export async function fetchLevelUpHistory(characterId, token) {
  const res = await apiFetch(`/characters/${characterId}/level-up/history`, { token });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Could not load level history");
  }
  return res.json();
}

export async function revertLevelUp(characterId, token, snapshotId = null) {
  const res = await apiFetch(`/characters/${characterId}/level-up/revert`, {
    token,
    method: "POST",
    body: { snapshot_id: snapshotId },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Revert failed");
  }
  return res.json();
}

export function isChoiceComplete(spec, value) {
  if (!spec) return false;
  if (value == null) return false;
  const type = spec.type;

  if (type === "asi_or_feat") {
    if (value.mode === "asi") {
      const increases = value.increases || {};
      const total = Object.values(increases).reduce((sum, n) => sum + Number(n || 0), 0);
      const keys = Object.keys(increases).filter((k) => Number(increases[k]) > 0);
      return total === 2 && (keys.length === 1 || keys.length === 2);
    }
    return value.mode === "feat" && Boolean(value.feat);
  }
  if (type === "fighting_style" || type === "epic_boon") {
    return Boolean(value.feat);
  }
  if (type === "subclass") {
    return String(value.name || "").trim().length >= 2;
  }
  if (type === "subclass_feature") {
    return String(value.name || "").trim().length >= 2;
  }
  if (type === "expertise" || type === "scholar" || type === "primal_knowledge") {
    const count = Number(spec.count || (type === "expertise" ? 2 : 1));
    return Array.isArray(value.skills) && value.skills.length === count;
  }
  if (type === "divine_order") {
    return Boolean(value.order);
  }
  if (type === "blessed_strikes") {
    return Boolean(value.choice);
  }
  if (type === "weapon_mastery") {
    const count = Number(spec.count || 2);
    return Array.isArray(value.weapons) && value.weapons.filter(Boolean).length === count;
  }
  return false;
}
