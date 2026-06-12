/**
 * D&D 5.5e turn actions — sheet-derived attacks, spells, features, and NPC stat-block actions.
 */

import {
  enrichRawAction,
  inferTargeting,
  lookupCatalogAction,
  overrideActionType,
} from "./actionRules";
import { isDyingPc } from "./deathSaves";
import { inferPrimaryActionType } from "./actionTypeInference";
import { abilityModifier, getProficiencyBonus } from "./characterSheet";
import { ACTION_TYPES as SCHEMA_ACTION_TYPES } from "./sheetSchema";

export const ACTION_TYPES = SCHEMA_ACTION_TYPES;

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
  { id: "std-dash-bonus", name: "Dash", actionType: ACTION_TYPES.bonus_action, targeting: TARGETING.self, category: "standard" },
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

/** One turn-menu entry per action type + name (features beat mislabeled attacks). */
function actionDedupeKey(action) {
  return `${action.actionType}:${actionNameKey(action.name)}`;
}

function actionCategoryPriority(category) {
  if (category === "feature" || category === "combat" || category === "class_feature") return 3;
  if (category === "spell") return 2;
  if (category === "standard") return 1;
  return 0;
}

function sheetCombatAbilityNames(sheet) {
  const names = new Set();
  for (const action of sheet?.combat_actions || []) {
    if (action?.name) names.add(actionNameKey(action.name));
  }
  return names;
}

/** Sheet attacks[] often includes class features misparsed from PDF — keep real strikes only. */
function isRealAttackEntry(raw, sheet) {
  const name = String(raw?.name || "").trim();
  if (!name) return false;

  const key = actionNameKey(name);
  if (sheetCombatAbilityNames(sheet).has(key)) return false;

  const catalog = lookupCatalogAction(name);
  if (catalog) {
    if (catalog.category === "class_feature") return false;
    if (catalog.healing_dice || catalog.resource_cost || catalog.effect) return false;
    if (
      catalog.targeting === "self" &&
      !raw?.to_hit &&
      !raw?.damage &&
      !raw?.damage_dice &&
      !catalog.damage_dice
    ) {
      return false;
    }
  }

  if (/unarmed|talon|bite|claw|fist|slam|kick|punch|hoof|horn/i.test(name)) return true;
  if (isWeaponItem({ name, type: raw?.type, damage: raw?.damage, to_hit: raw?.to_hit })) {
    return true;
  }
  if (raw?.to_hit != null || raw?.damage || raw?.damage_dice) {
    return !catalog?.healing_dice;
  }

  return false;
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

export function actionNeedsReadyDetail(action) {
  if (!action) return false;
  return action.id === "std-ready" || actionNameKey(action.name) === "ready";
}

function isTurnMenuAction(raw) {
  const display = raw?.display;
  if (!Array.isArray(display) || display.length === 0) return true;
  return display.includes("turn_actions");
}

export function canSelectTurnAction(action) {
  if (!action || isPassiveTurnAction(action)) return false;
  if (action.requiresOption && !actionHasOptions(action)) return false;
  if (ON_HIT_RIDERS.has(actionNameKey(action.name))) return false;
  if (action.actionType === ACTION_TYPES.magic_action) return true;
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
    resourceCost: resourceCost || enriched.resource_cost || undefined,
    skipsEconomy: enriched.effect === "extra_action",
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

const WEAPON_PROFILES = [
  { pattern: /rapier/i, dice: "1d8", range: "5 ft Reach", notes: "Martial, Finesse", finesse: true },
  { pattern: /shortsword|longsword|scimitar|war pick|morningstar/i, dice: "1d8", range: "5 ft Reach", notes: "Martial", finesse: true },
  { pattern: /greatsword|maul|greataxe|halberd|glaive|pike/i, dice: "1d12", range: "5 ft Reach", notes: "Martial, Heavy" },
  { pattern: /handaxe|light hammer|sickle|club|dagger|mace|spear/i, dice: "1d6", range: "5 ft Reach", notes: "Simple" },
  { pattern: /javelin/i, dice: "1d6", range: "30/120 ft", notes: "Simple, Thrown" },
  { pattern: /shortbow/i, dice: "1d6", range: "80/320 ft", notes: "Simple, Two-Handed" },
  { pattern: /longbow/i, dice: "1d8", range: "150/600 ft", notes: "Martial, Two-Handed, Heavy" },
  { pattern: /light crossbow/i, dice: "1d8", range: "80/320 ft", notes: "Simple, Two-Handed, Loading" },
  { pattern: /crossbow/i, dice: "1d10", range: "100/400 ft", notes: "Martial, Two-Handed, Loading" },
];

function weaponProfile(name) {
  const match = WEAPON_PROFILES.find((entry) => entry.pattern.test(name));
  return (
    match || {
      dice: "1d6",
      range: /bow|crossbow|sling|javelin/i.test(name) ? "80/320 ft" : "5 ft Reach",
      notes: "",
      finesse: /rapier|dagger|scimitar|shortsword|whip/i.test(name),
    }
  );
}

function inferDefaultToHit(sheet) {
  const fromAttack = (sheet?.attacks || []).find((attack) => attack.to_hit != null)?.to_hit;
  if (fromAttack != null) return fromAttack;
  const prof = getProficiencyBonus(sheet) ?? 0;
  const str = abilityModifier(sheet?.abilities?.str) ?? 0;
  return prof + str;
}

function formatWeaponDamage(dice, sheet, finesse = false) {
  if (!dice) return null;
  const str = abilityModifier(sheet?.abilities?.str) ?? 0;
  const dex = abilityModifier(sheet?.abilities?.dex) ?? 0;
  const mod = finesse ? Math.max(str, dex) : str;
  return mod ? `${dice}+${mod}` : dice;
}

function isDiceExpression(value) {
  return /^\d+d\d+([+-]\d+)?$/i.test(String(value || "").trim());
}

function resolveAttackDamage(raw, sheet, profile) {
  if (raw.damage && !isDiceExpression(raw.damage)) return raw.damage;
  const dice = raw.damage_dice || (isDiceExpression(raw.damage) ? raw.damage : null) || profile.dice;
  return formatWeaponDamage(dice, sheet, profile.finesse);
}

function mapAttackEntry(raw, sheet) {
  const name = raw.name;
  if (!name) return null;
  const profile = weaponProfile(name);
  return {
    id: raw.id || `attack-${slug(name)}`,
    name,
    range: raw.range || profile.range,
    toHit: raw.to_hit ?? raw.attack_bonus ?? null,
    damage: resolveAttackDamage(raw, sheet, profile),
    notes: raw.notes || profile.notes || "",
    description: raw.description || "",
    actionType: raw.action_type || raw.actionType || ACTION_TYPES.action,
    category: "attack",
  };
}

/** Attack rows for the digital sheet — merges parsed attacks with all inventory weapons. */
export function collectSheetAttackEntries(sheet) {
  const entries = [];
  const seen = new Set();
  const defaultToHit = inferDefaultToHit(sheet);

  for (const attack of sheet?.attacks || []) {
    if (!isRealAttackEntry(attack, sheet)) continue;
    const entry = mapAttackEntry(attack, sheet);
    if (!entry || seen.has(entry.name.toLowerCase())) continue;
    seen.add(entry.name.toLowerCase());
    if (entry.toHit == null) entry.toHit = defaultToHit;
    entries.push(entry);
  }

  for (const item of sheet?.inventory || []) {
    if (!isWeaponItem(item)) continue;
    const key = String(item.name || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const profile = weaponProfile(item.name);
    entries.push({
      id: `weapon-${item.id || slug(item.name)}`,
      name: item.name,
      range: item.range || profile.range,
      toHit: item.to_hit ?? defaultToHit,
      damage: item.damage || formatWeaponDamage(profile.dice, sheet, profile.finesse),
      notes: item.notes || profile.notes,
      description: "",
      actionType: ACTION_TYPES.action,
      category: "attack",
    });
  }

  return entries;
}

function attackEntriesAsActions(sheet, attacks) {
  return attacks
    .map((entry, index) => {
      const detail = [entry.damage, entry.toHit != null ? `+${entry.toHit} to hit` : null, entry.range, entry.notes]
        .filter(Boolean)
        .join(" · ");
      const category = String(entry.id || "").startsWith("weapon-") ? "weapon" : "attack";
      return normalizeCombatAction(
        {
          id: entry.id,
          name: entry.name,
          action_type: entry.actionType || ACTION_TYPES.action,
          targeting: TARGETING.one_enemy,
          to_hit: entry.toHit,
          damage: entry.damage,
          notes: entry.notes,
          detail: detail || entry.name,
        },
        index,
        category
      );
    })
    .filter(Boolean);
}

/**
 * Canonical sheet action catalog — single source for digital sheet and turn UI.
 * @returns {{ attacks: object[], actions: object[] }}
 */
export function collectSheetActionCatalog(sheet) {
  const attacks = collectSheetAttackEntries(sheet);
  const actions = [];
  const seen = new Set();

  const add = (action) => {
    if (!action) return;
    const key = actionDedupeKey(action);
    const existingIndex = actions.findIndex((entry) => actionDedupeKey(entry) === key);
    if (existingIndex >= 0) {
      if (
        actionCategoryPriority(action.category) >
        actionCategoryPriority(actions[existingIndex].category)
      ) {
        actions[existingIndex] = action;
      }
      return;
    }
    actions.push(action);
  };

  spellActions(sheet).forEach(add);
  explicitSheetActions(sheet).forEach(add);
  featureActions(sheet).forEach(add);
  inferredFeatureActions(sheet).forEach(add);
  attackEntriesAsActions(sheet, attacks).forEach(add);

  return {
    attacks,
    actions: attachWildShapeOptions(sheet, actions),
  };
}

/** Non-attack actions for the digital sheet Actions tab (attacks use the table). */
export function collectSheetCombatActions(sheet) {
  return collectSheetActionCatalog(sheet).actions.filter(
    (action) => action.category !== "attack" && action.category !== "weapon"
  );
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

function spellActionType(spell) {
  const explicit = spell.action_type || spell.actionType;
  if (explicit === ACTION_TYPES.magic_action || explicit === "magic_action") {
    return ACTION_TYPES.magic_action;
  }
  const level = spell.level ?? spell.spell_level;
  if (Number(level) > 0 && (!explicit || explicit === ACTION_TYPES.action)) {
    return ACTION_TYPES.magic_action;
  }
  return explicit || ACTION_TYPES.action;
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
          action_type: spellActionType(spell),
          targeting: spell.targeting,
          description: spell.description,
          display: spell.display,
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

function combatActionCategory(action) {
  const catalog = lookupCatalogAction(String(action?.name || ""));
  if (catalog?.category === "class_feature") return "feature";
  if (catalog?.category === "standard") return "standard";
  if (action?.category === "class_feature") return "feature";

  const id = String(action?.id || "");
  if (/^(action|bonus|reaction|legendary|npc|attack)-/.test(id)) return "attack";
  if (action?.attack_bonus != null || action?.attackBonus != null || action?.damage_dice) {
    return "attack";
  }
  return action?.category || "combat";
}

function explicitSheetActions(sheet) {
  return (sheet?.combat_actions || [])
    .filter((action) => isTurnMenuAction(action))
    .map((action, index) => normalizeCombatAction(action, index, combatActionCategory(action)))
    .filter(Boolean);
}

function featureActions(sheet) {
  return (sheet?.features || [])
    .filter(
      (feat) =>
        isTurnMenuAction(feat) &&
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
  return collectSheetActionCatalog(sheet).actions;
}

/**
 * Standard actions shown on sheet / added to turn menu — mirrors buildAvailableActions rules.
 * @param {object|null} sheet
 * @param {{ filter?: string, mode?: 'pc' | 'npc' }} options
 */
function sheetGrantsBonusStandard(sheet, actionName) {
  const key = actionNameKey(actionName);
  return (sheet?.combat_actions || []).some((row) => {
    if (!row?.name) return false;
    return (
      actionNameKey(row.name) === key &&
      (row.action_type === ACTION_TYPES.bonus_action || row.actionType === ACTION_TYPES.bonus_action)
    );
  });
}

export function resolveStandardActions(sheet, options = {}) {
  const { filter = "all", mode = "pc" } = options;
  if (mode === "npc") return [];

  const catalog = collectSheetActionCatalog(sheet || {});
  const hasAttacks = catalog.attacks.length > 0;
  const hasActionSlotActions = catalog.actions.some(
    (action) => action.actionType === ACTION_TYPES.action
  );
  const hasBonusDash =
    sheetGrantsBonusStandard(sheet, "Dash") ||
    sheetGrantsBonusStandard(sheet, "Cunning Action") ||
    sheetGrantsBonusStandard(sheet, "Step of the Wind");

  let standards = hasAttacks
    ? STANDARD_ACTIONS.filter((action) => action.id !== "std-attack")
    : [...STANDARD_ACTIONS];

  if (!hasBonusDash) {
    standards = standards.filter((action) => action.id !== "std-dash-bonus");
  }

  if (hasActionSlotActions) {
    standards = standards.filter((action) => action.targeting === TARGETING.self);
  }

  if (filter === "action") {
    standards = standards.filter((action) => action.actionType === ACTION_TYPES.action);
  } else if (filter === "bonus_action") {
    standards = standards.filter((action) => action.actionType === ACTION_TYPES.bonus_action);
  } else if (filter === "reaction" || filter === "attack" || filter === "limited_use") {
    standards = [];
  }

  return standards;
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
    [ACTION_TYPES.magic_action]: [],
  };

  const seen = new Set();
  const add = (action) => {
    if (!canSelectTurnAction(action)) return;
    const key = actionDedupeKey(action);
    if (seen.has(key)) return;
    seen.add(key);
    if (byType[action.actionType]) {
      byType[action.actionType].push(action);
    }
  };

  const derived = collectSheetDerivedActions(sheet || {});
  derived.forEach(add);

  if (mode === "npc") {
    if (byType[ACTION_TYPES.action].length === 0) {
      NPC_FALLBACK_ACTIONS.forEach(add);
    }
    return byType;
  }

  resolveStandardActions(sheet, { mode }).forEach(add);

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

export function actionHealsHp(action) {
  if (!action) return false;
  if (action.healingDice || action.healing_dice) return true;
  const catalog = lookupCatalogAction(String(action.name || ""));
  return Boolean(catalog?.healing_dice);
}

export function canReceiveHealing(combatant) {
  if (!combatant) return false;
  if (combatant.hp == null || combatant.max_hp == null) return true;
  return combatant.hp < combatant.max_hp;
}

/** Living combatants eligible as targets (not defeated enemies). */
export function filterTargetCandidates(
  combatants,
  actorCombatantId,
  targeting,
  actorCombatant = null,
  action = null
) {
  const actor =
    actorCombatant || (combatants || []).find((combatant) => combatant.id === actorCombatantId);
  const living = (combatants || []).filter(
    (c) => !(isEnemyCombatant(c) && c.hp != null && c.hp <= 0)
  );
  const heals = actionHealsHp(action);

  let candidates;
  switch (targeting) {
    case TARGETING.self:
      candidates = living.filter((c) => c.id === actorCombatantId);
      break;
    case TARGETING.one_enemy:
      if (!actor) return [];
      candidates = living.filter((c) => c.id !== actorCombatantId && isOpponent(actor, c));
      break;
    case TARGETING.one_ally:
      if (!actor) return [];
      candidates = living.filter((c) => c.id !== actorCombatantId && isSameTeam(actor, c));
      break;
    case TARGETING.one_ally_or_self:
      if (!actor) candidates = living.filter((c) => c.id === actorCombatantId);
      else candidates = living.filter((c) => c.id === actorCombatantId || isSameTeam(actor, c));
      break;
    case TARGETING.one_creature:
      candidates = living.filter((c) => c.id !== actorCombatantId);
      break;
    default:
      return [];
  }

  if (!heals) return candidates;
  return candidates.filter((combatant) => canReceiveHealing(combatant));
}

export function validateTargetSelection(
  action,
  actorCombatantId,
  targetIds,
  combatants,
  actorCombatant = null
) {
  if (!actionNeedsTarget(action)) {
    return targetIds.length === 0 ? { ok: true } : { ok: false, reason: "This action does not use a target." };
  }
  if (targetIds.length !== 1) {
    return { ok: false, reason: `Select exactly one target (${targetLabel(action.targeting)}).` };
  }
  const allowed = filterTargetCandidates(
    combatants,
    actorCombatantId,
    action.targeting,
    actorCombatant,
    action
  );
  const allowedIds = new Set(allowed.map((c) => c.id));
  if (!allowedIds.has(targetIds[0])) {
    return { ok: false, reason: "That target is not valid for this action." };
  }
  return { ok: true };
}

export function canAffordResourceCost(sheet, action) {
  const cost = action?.resourceCost;
  if (!cost?.resource_id) return true;
  const pool = (sheet?.resources || []).find((entry) => entry?.id === cost.resource_id);
  if (!pool || pool.current == null) return true;
  return Number(pool.current) >= Number(cost.amount ?? 1);
}

export function resourceCostLabel(action) {
  const cost = action?.resourceCost;
  if (!cost?.resource_id) return null;
  const amount = cost.amount ?? 1;
  return `${amount} ${cost.resource_id.replace(/-/g, " ")}`;
}

const PICKER_CATEGORY_ORDER = ["attack", "weapon", "feature", "spell", "combat", "standard", "npc"];

const PICKER_CATEGORY_LABELS = {
  attack: "Attacks",
  weapon: "Weapons",
  feature: "Features",
  class_feature: "Features",
  spell: "Spells",
  combat: "Abilities",
  standard: "Standard",
  npc: "NPC",
};

/** Group turn-menu actions for the picker UI. */
export function groupActionsForPicker(actions) {
  const groups = new Map();
  for (const action of actions || []) {
    const category = action.category || "combat";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(action);
  }
  return PICKER_CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
    category,
    label: PICKER_CATEGORY_LABELS[category] || category,
    actions: groups.get(category),
  }));
}

export function formatApiErrorDetail(detail, fallback = "Request failed") {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((entry) => entry?.msg || String(entry)).join("; ");
  }
  return fallback;
}
