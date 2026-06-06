/**
 * SRD 5.2.1 action targeting — mirrors backend action_rules.py heuristics + catalog lookup.
 */

import { apiFetch } from "./api";

const SELF_HINTS =
  /self only|\(self only\)|on yourself|you regain|regain hit points|heal yourself|restore hit points to yourself|you gain (?!.*attack)|protect yourself|teleport yourself/i;
const ALLY_HINTS = /one ally|friendly creature|ally or yourself/i;
const AREA_HINTS =
  /each creature|all creatures|creatures within|in a \d+-foot|radius|cone|line|cube|sphere/i;
const ATTACK_HINTS =
  /one target|melee weapon attack|ranged weapon attack|spell attack|make an attack/i;

let catalogPromise = null;
let combatCatalog = null;
let spellCatalog = null;

function indexByName(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    if (!entry?.name) continue;
    map.set(entry.name.toLowerCase(), entry);
  }
  return map;
}

export async function loadActionRulesCatalog(token) {
  if (combatCatalog && spellCatalog) {
    return { combatCatalog, spellCatalog };
  }
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [combatRes, spellRes] = await Promise.all([
        apiFetch("/rules/combat-actions", { token }),
        apiFetch("/rules/spells", { token }),
      ]);
      const combatPayload = combatRes.ok ? await combatRes.json() : {};
      const spellPayload = spellRes.ok ? await spellRes.json() : {};
      combatCatalog = new Map([
        ...indexByName(combatPayload.standard_actions),
        ...indexByName(combatPayload.class_features),
      ]);
      spellCatalog = indexByName(spellPayload.spells);
      return { combatCatalog, spellCatalog };
    })();
  }
  return catalogPromise;
}

export function lookupCatalogAction(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  const base = key.replace(/\s*\(l\d+\)\s*$/i, "").trim();
  if (combatCatalog) {
    const hit = combatCatalog.get(key) || combatCatalog.get(base);
    if (hit) return hit;
  }
  if (spellCatalog) {
    return spellCatalog.get(key) || spellCatalog.get(base) || null;
  }
  return null;
}

export { inferPrimaryActionType as inferActionType } from "./actionTypeInference";
export { overrideActionType } from "./actionTypeInference";

export function inferTargeting(name = "", description = "", { category = "action", range = "" } = {}) {
  const text = `${name} ${description} ${range}`.trim();
  const lowered = text.toLowerCase();

  if (String(range).toLowerCase() === "self") return "self";
  if (String(range).toLowerCase() === "touch") return "one_ally_or_self";

  if (SELF_HINTS.test(text) && !AREA_HINTS.test(text)) return "self";
  if (lowered.includes("one ally or yourself") || lowered.includes("ally or yourself")) {
    return "one_ally_or_self";
  }
  if (ALLY_HINTS.test(text)) return "one_ally";
  if (AREA_HINTS.test(text)) return "one_creature";
  if (ATTACK_HINTS.test(text)) return "one_enemy";
  if (/\+\d+\s+to\s+hit|to hit/i.test(text)) return "one_enemy";

  if (category === "feature" || category === "class_feature" || category === "combat" || category === "standard") {
    return "self";
  }
  if (category === "spell") {
    if (lowered.includes("creature you can see")) return "one_creature";
    return "one_enemy";
  }
  if (category === "weapon" || category === "attack") return "one_enemy";
  return "self";
}

export function lookupCatalogActionForCategory(name, category = "action") {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  const base = key.replace(/\s*\(l\d+\)\s*$/i, "").trim();
  if (category === "weapon" || category === "attack") {
    return combatCatalog?.get(key) || combatCatalog?.get(base) || null;
  }
  return lookupCatalogAction(name);
}

export function enrichRawAction(raw, category = "action") {
  if (!raw?.name) return raw;

  const name = String(raw.name).trim();
  const description = raw.description || raw.notes || "";
  const range = raw.range || "";
  const catalog = lookupCatalogActionForCategory(name, category);
  const inferredTargeting = inferTargeting(name, description, { category, range });

  const next = { ...raw };

  if (catalog?.action_type) {
    next.action_type = catalog.action_type;
    next.actionType = catalog.action_type;
  } else if (!next.action_type && !next.actionType) {
    const inferredType = inferActionType(name, description);
    if (inferredType) {
      next.action_type = inferredType;
      next.actionType = inferredType;
    }
  }

  const currentTargeting = next.targeting || next.targeting;
  if (catalog?.targeting) {
    next.targeting = catalog.targeting;
  } else if (category === "weapon" || category === "attack") {
    if (!currentTargeting) {
      next.targeting = "one_enemy";
    }
  } else if (
    (category === "feature" || category === "combat" || category === "spell") &&
    (!currentTargeting || currentTargeting === "one_enemy")
  ) {
    next.targeting = inferredTargeting;
  } else if (!currentTargeting) {
    next.targeting = inferredTargeting;
  }

  if (catalog?.healing_dice && !next.healing_dice) {
    next.healing_dice = catalog.healing_dice;
  }

  return next;
}
