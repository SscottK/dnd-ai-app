/**
 * D&D 5.5e turn actions — sheet-derived attacks, spells, features, and NPC stat-block actions.
 */

import { enrichRawAction, inferTargeting, overrideActionType } from "./actionRules";
import { inferPrimaryActionType } from "./actionTypeInference";

export const ACTION_TYPES = {
  action: "action",
  bonus_action: "bonus_action",
  reaction: "reaction",
};

export const TARGETING = {
  self: "self",
  one_enemy: "one_enemy",
  one_ally: "one_ally",
  one_creature: "one_creature",
  one_ally_or_self: "one_ally_or_self",
};


/** Minimal fallback when a combatant has no parsed actions (NPCs). */
export const NPC_FALLBACK_ACTIONS = [
  {
    id: "npc-attack",
    name: "Attack",
    actionType: ACTION_TYPES.action,
    targeting: TARGETING.one_enemy,
    category: "npc",
  },
  {
    id: "npc-dodge",
    name: "Dodge",
    actionType: ACTION_TYPES.action,
    targeting: TARGETING.self,
    category: "npc",
  },
  {
    id: "npc-dash",
    name: "Dash",
    actionType: ACTION_TYPES.action,
    targeting: TARGETING.self,
    category: "npc",
  },
];

/** 2024 PHB standard actions — used only when a PC sheet has no action-type options. */
export const STANDARD_ACTIONS = [
  { id: "std-attack", name: "Attack", actionType: ACTION_TYPES.action, targeting: TARGETING.one_enemy, category: "standard" },
  { id: "std-dash", name: "Dash", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-disengage", name: "Disengage", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-dodge", name: "Dodge", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-help", name: "Help", actionType: ACTION_TYPES.action, targeting: TARGETING.one_ally_or_self, category: "standard" },
  { id: "std-hide", name: "Hide", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-ready", name: "Ready", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-search", name: "Search", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-study", name: "Study", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-utilize", name: "Utilize", actionType: ACTION_TYPES.action, targeting: TARGETING.self, category: "standard" },
  { id: "std-influence", name: "Influence", actionType: ACTION_TYPES.action, targeting: TARGETING.one_creature, category: "standard" },
];

/** Abilities that modify other actions — not standalone turn choices. */
const PASSIVE_TURN_ACTIONS = new Set([
  "extra-attack",
  "martial-arts",
  "unarmored-defense",
  "unarmored-movement",
  "ki-empowered-strikes",
  "open-hand-technique",
  "slow-fall",
  "deflect-missiles",
  "stillness-of-mind",
  "purity-of-body",
]);

function cleanActionName(name) {
  return String(name || "")
    .replace(/\s*★\s*$/, "")
    .split("(")[0]
    .trim();
}

function actionNameKey(name) {
  return slug(cleanActionName(name));
}

function isPassiveTurnAction(action) {
  return PASSIVE_TURN_ACTIONS.has(actionNameKey(action?.name));
}

/** On-hit modifiers — not standalone turn menu choices. */
const ON_HIT_RIDERS = new Set(["stunning-strike"]);

/** Routed via combat_actions catalog — skip duplicate feature inference. */
const CATALOG_MANAGED_ACTIONS = new Set(["wild-shape", "combat-wild-shape"]);

/** Class features the server resolves using sheet attack stats (e.g. Talons). */
const DELEGATED_ATTACK_ACTIONS = new Set(["flurry-of-blows"]);

export function canSelectTurnAction(action) {
  if (!action || isPassiveTurnAction(action)) return false;
  if (ON_HIT_RIDERS.has(actionNameKey(action.name))) return false;
  if (!actionNeedsTarget(action)) return true;
  if (action.attackBonus != null || action.damageDice) return true;
  if (["weapon", "attack", "spell"].includes(action.category)) return true;
  if (DELEGATED_ATTACK_ACTIONS.has(actionNameKey(action.name))) return true;
  return false;
}

const WEAPON_PATTERN =
  /sword|axe|bow|crossbow|dagger|mace|hammer|spear|staff|whip|sling|javelin|rapier|scimitar|halberd|glaive|lance|club|flail|trident|warhammer|handaxe|light hammer|maul|pike|sickle|greatsword|longbow|shortbow|longsword|shortsword|war pick|morningstar|net/i;
const ARMOR_PATTERN =
  /armor|mail|plate|leather|hide|shield|breastplate|gauntlet|helm|boots|cloak of protection|ring of protection/i;

function slug(value) {
  return String(value || "action")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeActionType(value) {
  const raw = String(value || ACTION_TYPES.action).toLowerCase();
  if (raw.includes("bonus")) return ACTION_TYPES.bonus_action;
  if (raw.includes("reaction")) return ACTION_TYPES.reaction;
  return ACTION_TYPES.action;
}

function normalizeTargeting(value, hintText = "", category = "action") {
  if (value && Object.values(TARGETING).includes(value)) {
    return value;
  }
  return inferTargeting("", hintText, { category });
}

export function normalizeCombatAction(raw, index = 0, category = "action") {
  if (!raw?.name) return null;
  const enriched = enrichRawAction(raw, category);
  const description = enriched.description || enriched.notes || "";
  const detailParts = [enriched.damage, enriched.to_hit != null ? `+${enriched.to_hit} to hit` : null]
    .filter(Boolean)
    .join(" · ");
  const damageDice = raw.damage_dice || raw.damageDice || null;
  const parsedDamage =
    damageDice ||
    (typeof raw.damage === "string" ? raw.damage.replace(/\s+/g, "") : null);

  const resourceCost = enriched.resource_cost || enriched.resourceCost || null;
  const costLabel =
    resourceCost?.amount != null && resourceCost?.resource_id
      ? ` · ${resourceCost.amount} ${resourceCost.resource_id}`
      : null;

  const typeOverride = overrideActionType(enriched.name);
  return {
    id: enriched.id || `${category}-${index}-${slug(enriched.name)}`,
    name: String(enriched.name).trim(),
    actionType: normalizeActionType(
      typeOverride || enriched.action_type || enriched.actionType
    ),
    targeting: normalizeTargeting(
      enriched.targeting,
      `${enriched.name} ${description}`,
      category
    ),
    category,
    description: description || undefined,
    detail: enriched.detail || (detailParts ? `${detailParts}${costLabel || ""}` : costLabel || undefined),
    attackBonus: enriched.attack_bonus ?? enriched.attackBonus ?? enriched.to_hit ?? null,
    damageDice: parsedDamage,
    resourceCost: resourceCost || undefined,
    requiresOption: Boolean(enriched.requires_option || enriched.requiresOption),
    optionSource: enriched.option_source || enriched.optionSource || null,
    options: Array.isArray(enriched.options) ? enriched.options : undefined,
  };
}

export function actionHasOptions(action) {
  return Array.isArray(action?.options) && action.options.length > 0;
}

export function resolveOptionAction(parentAction, option) {
  if (!parentAction || !option?.name) return null;
  const suffix = slug(option.name);
  return {
    ...parentAction,
    id: `${parentAction.id}-${suffix}`,
    name: `${parentAction.name}: ${option.name}`,
    detail: [option.notes, option.cr ? `CR ${option.cr}` : null].filter(Boolean).join(" · ") || option.name,
  };
}

function isWeaponItem(item) {
  const name = String(item?.name || "").trim();
  if (!name) return false;
  if (String(item?.type || "").toLowerCase() === "weapon") return true;
  if (item?.damage || item?.to_hit != null) return true;
  if (ARMOR_PATTERN.test(name) && !WEAPON_PATTERN.test(name)) return false;
  return WEAPON_PATTERN.test(name);
}

function inventoryWeaponActions(sheet) {
  return (sheet?.inventory || [])
    .filter((item) => isWeaponItem(item) && item?.equipped)
    .map((item, index) => {
      const detail = [item.damage, item.to_hit != null ? `+${item.to_hit} to hit` : null, item.notes]
        .filter(Boolean)
        .join(" · ");
      return normalizeCombatAction(
        {
          id: `weapon-${item.id || item.name}`,
          name: item.name,
          action_type: ACTION_TYPES.action,
          targeting: TARGETING.one_enemy,
          detail: detail || item.name,
          to_hit: item.to_hit,
          damage: item.damage,
        },
        index,
        "weapon"
      );
    })
    .filter(Boolean);
}

/** Single menu entry — item picked in a follow-up submenu. Slot type is set per menu. */
export const EQUIP_META_ACTION = {
  id: "equip-item",
  name: "Equip",
  targeting: TARGETING.self,
  category: "equipment",
};

export const UNEQUIP_META_ACTION = {
  id: "unequip-item",
  name: "Unequip",
  targeting: TARGETING.self,
  category: "equipment",
};

export function equipmentMetaForSlot(kind, slotType) {
  const base = kind === "equip" ? EQUIP_META_ACTION : UNEQUIP_META_ACTION;
  return { ...base, actionType: slotType };
}

export function isEquipmentMetaAction(action) {
  return action?.id === EQUIP_META_ACTION.id || action?.id === UNEQUIP_META_ACTION.id;
}

export function getEquippableItems(sheet) {
  return (sheet?.inventory || []).filter((item) => item?.name && !item.equipped);
}

export function getUnequippableItems(sheet) {
  return (sheet?.inventory || []).filter((item) => item?.name && item.equipped);
}

export function equipItemAction(item, slotType = ACTION_TYPES.action) {
  const itemId = item.id || item.name;
  return normalizeCombatAction(
    {
      id: `equip-${itemId}`,
      name: item.name,
      action_type: slotType,
      targeting: TARGETING.self,
      category: "equipment",
    },
    0,
    "equipment"
  );
}

export function unequipItemAction(item, slotType = ACTION_TYPES.action) {
  const itemId = item.id || item.name;
  return normalizeCombatAction(
    {
      id: `unequip-${itemId}`,
      name: item.name,
      action_type: slotType,
      targeting: TARGETING.self,
      category: "equipment",
    },
    0,
    "equipment"
  );
}

function attackRowActions(sheet) {
  return (sheet?.attacks || [])
    .map((attack, index) =>
      normalizeCombatAction(
        {
          ...attack,
          action_type: attack.action_type || attack.actionType || ACTION_TYPES.action,
          targeting: attack.targeting || TARGETING.one_enemy,
        },
        index,
        "attack"
      )
    )
    .filter(Boolean);
}

function spellActions(sheet) {
  return (sheet?.spells || [])
    .filter((spell) => spell?.name && spell.prepared !== false)
    .map((spell, index) => {
      const level = spell.level ?? spell.spell_level;
      const suffix = level != null && Number(level) > 0 ? ` (L${level})` : "";
      return normalizeCombatAction(
        {
          id: spell.id || `spell-${spell.name}`,
          name: `${spell.name}${suffix}`,
          action_type: spell.action_type || spell.actionType || ACTION_TYPES.action,
          targeting: spell.targeting,
          description: spell.description,
        },
        index,
        "spell"
      );
    })
    .filter(Boolean);
}

function inferActionTypeFromText(name, description = "") {
  const inferred = inferPrimaryActionType(name, description);
  if (!inferred) return null;
  if (inferred === ACTION_TYPES.bonus_action) return ACTION_TYPES.bonus_action;
  if (inferred === ACTION_TYPES.reaction) return ACTION_TYPES.reaction;
  return ACTION_TYPES.action;
}

function inferredFeatureActions(sheet) {
  const results = [];
  for (const feat of sheet?.features || []) {
    if (isPassiveTurnAction(feat)) continue;
    if (CATALOG_MANAGED_ACTIONS.has(actionNameKey(feat?.name))) continue;
    if (feat?.action_type && feat?.targeting) continue;
    const inferredType = inferActionTypeFromText(feat?.name, feat?.description);
    if (!inferredType) continue;
    const action = normalizeCombatAction(
      {
        id: feat.id || `feat-${feat.name}`,
        name: feat.name,
        action_type: inferredType,
        targeting: inferFeatureTargeting(feat),
        description: feat.description,
      },
      results.length,
      "feature"
    );
    if (action) results.push(action);
  }
  return results;
}

function inferFeatureTargeting(feat) {
  const text = `${feat?.name || ""} ${feat?.description || ""}`;
  return normalizeTargeting(feat?.targeting, text, "feature");
}

function npcActionCategory(action) {
  const id = String(action?.id || "");
  if (/^(action|bonus|reaction|legendary|npc|attack)-/.test(id)) return "attack";
  if (action?.attack_bonus != null || action?.attackBonus != null || action?.damage_dice) {
    return "attack";
  }
  return action?.category || "combat";
}

function explicitSheetActions(sheet) {
  return (sheet?.combat_actions || [])
    .map((action, index) => normalizeCombatAction(action, index, npcActionCategory(action)))
    .filter(Boolean);
}

function featureActions(sheet) {
  return (sheet?.features || [])
    .filter(
      (feat) =>
        feat?.action_type &&
        feat?.targeting &&
        !isPassiveTurnAction(feat) &&
        !CATALOG_MANAGED_ACTIONS.has(actionNameKey(feat?.name))
    )
    .map((feat, index) =>
      normalizeCombatAction(
        {
          id: feat.id || `feat-${feat.name}`,
          name: feat.name,
          action_type: feat.action_type,
          targeting: feat.targeting,
          description: feat.description,
        },
        index,
        "feature"
      )
    )
    .filter(Boolean);
}

function attachWildShapeOptions(sheet, actions) {
  const forms = sheet?.wild_shapes || [];
  if (!forms.length) return actions;
  return actions.map((action) => {
    const key = actionNameKey(action.name);
    if (key !== "wild-shape" && key !== "combat-wild-shape") return action;
    return {
      ...action,
      requiresOption: true,
      options: forms.map((form, index) => ({
        id: form.id || `wild-shape-${index}`,
        name: form.name,
        notes: form.notes || "",
        cr: form.cr,
      })),
    };
  });
}

function collectSheetDerivedActions(sheet) {
  return attachWildShapeOptions(sheet, [
    ...attackRowActions(sheet),
    ...inventoryWeaponActions(sheet),
    ...spellActions(sheet),
    ...explicitSheetActions(sheet),
    ...featureActions(sheet),
    ...inferredFeatureActions(sheet),
  ]);
}

/**
 * @param {object|null} sheet
 * @param {{ mode?: 'pc' | 'npc' }} options
 */
export function buildAvailableActions(sheet, options = {}) {
  const mode = options.mode || "pc";
  const byType = {
    [ACTION_TYPES.action]: [],
    [ACTION_TYPES.bonus_action]: [],
    [ACTION_TYPES.reaction]: [],
  };

  const seen = new Set();
  const add = (action) => {
    if (!canSelectTurnAction(action)) return;
    const key = `${action.actionType}:${actionNameKey(action.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (byType[action.actionType]) byType[action.actionType].push(action);
  };

  const derived = collectSheetDerivedActions(sheet || {});
  derived.forEach(add);

  const hasWeaponAttacks = derived.some(
    (action) => action.category === "weapon" || action.category === "attack"
  );

  if (mode === "npc") {
    if (byType[ACTION_TYPES.action].length === 0) {
      NPC_FALLBACK_ACTIONS.forEach(add);
    }
    return byType;
  }

  const standards = hasWeaponAttacks
    ? STANDARD_ACTIONS.filter((action) => action.id !== "std-attack")
    : STANDARD_ACTIONS;

  if (byType[ACTION_TYPES.action].length === 0) {
    standards.forEach(add);
  } else {
    standards
      .filter((action) => action.targeting === TARGETING.self)
      .forEach(add);
  }

  const canEquip = getEquippableItems(sheet).length > 0;
  const canUnequip = getUnequippableItems(sheet).length > 0;
  for (const slot of [ACTION_TYPES.action, ACTION_TYPES.bonus_action]) {
    if (canEquip) add(equipmentMetaForSlot("equip", slot));
    if (canUnequip) add(equipmentMetaForSlot("unequip", slot));
  }

  return byType;
}

export function actionNeedsTarget(action) {
  return action?.targeting && action.targeting !== TARGETING.self;
}

export function targetLabel(mode) {
  switch (mode) {
    case TARGETING.self:
      return "Self";
    case TARGETING.one_enemy:
      return "One enemy";
    case TARGETING.one_ally:
      return "One ally";
    case TARGETING.one_ally_or_self:
      return "One ally or yourself";
    case TARGETING.one_creature:
      return "One creature";
    default:
      return "Target";
  }
}

export function isAllyCombatant(combatant) {
  return Boolean(combatant?.is_pc || combatant?.is_ally);
}

export function isEnemyCombatant(combatant) {
  return !isAllyCombatant(combatant);
}

export function isSameTeam(left, right) {
  return isAllyCombatant(left) === isAllyCombatant(right);
}

export function isOpponent(left, right) {
  return isAllyCombatant(left) !== isAllyCombatant(right);
}

/** Living combatants eligible as targets (not defeated enemies). */
export function filterTargetCandidates(combatants, actorCombatantId, targeting) {
  const actor = (combatants || []).find((c) => c.id === actorCombatantId);
  const living = (combatants || []).filter(
    (c) => !(isEnemyCombatant(c) && c.hp != null && c.hp <= 0)
  );

  switch (targeting) {
    case TARGETING.self:
      return living.filter((c) => c.id === actorCombatantId);
    case TARGETING.one_enemy:
      if (!actor) return [];
      return living.filter((c) => c.id !== actorCombatantId && isOpponent(actor, c));
    case TARGETING.one_ally:
      if (!actor) return [];
      return living.filter((c) => c.id !== actorCombatantId && isSameTeam(actor, c));
    case TARGETING.one_ally_or_self:
      if (!actor) return living.filter((c) => c.id === actorCombatantId);
      return living.filter((c) => c.id === actorCombatantId || isSameTeam(actor, c));
    case TARGETING.one_creature:
      return living.filter((c) => c.id !== actorCombatantId);
    default:
      return [];
  }
}

export function validateTargetSelection(action, actorCombatantId, targetIds, combatants) {
  if (!actionNeedsTarget(action)) {
    return targetIds.length === 0 ? { ok: true } : { ok: false, reason: "This action does not use a target." };
  }
  if (targetIds.length !== 1) {
    return { ok: false, reason: `Select exactly one target (${targetLabel(action.targeting)}).` };
  }
  const allowed = filterTargetCandidates(combatants, actorCombatantId, action.targeting);
  const allowedIds = new Set(allowed.map((c) => c.id));
  if (!allowedIds.has(targetIds[0])) {
    return { ok: false, reason: "That target is not valid for this action." };
  }
  return { ok: true };
}

export function formatApiErrorDetail(detail, fallback = "Request failed") {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((entry) => entry?.msg || String(entry)).join("; ");
  }
  return fallback;
}
