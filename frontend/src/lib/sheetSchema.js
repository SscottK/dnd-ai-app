/**
 * Canonical character sheet schema — mirrors backend/app/schemas/character_sheet.py
 * and backend/data/character_sheet.schema.json.
 */

export const ACTION_TYPES = {
  action: "action",
  bonus_action: "bonus_action",
  reaction: "reaction",
  magic_action: "magic_action",
};

export const RECHARGE_TYPES = {
  short_rest: "short_rest",
  long_rest: "long_rest",
  turn: "turn",
  none: "none",
};

export const DISPLAY_PANES = {
  combat_pane: "combat_pane",
  turn_actions: "turn_actions",
  features_tab: "features_tab",
};

export const OPTION_SOURCES = {
  wild_shapes: "wild_shapes",
};

export const TARGETING = {
  self: "self",
  one_enemy: "one_enemy",
  one_ally: "one_ally",
  one_creature: "one_creature",
  one_ally_or_self: "one_ally_or_self",
};

/** Legacy import ids → 2024 canonical ids. */
export const RESOURCE_ID_ALIASES = {
  ki: "focus-points",
  "ki-points": "focus-points",
  "ki-point": "focus-points",
  focus: "focus-points",
  "focus-point": "focus-points",
  wildshape: "wild-shape",
  wild_shape: "wild-shape",
  "bardic-inspiration-die": "bardic-inspiration",
  "channel-divinity-uses": "channel-divinity",
  "sorcery-point": "sorcery-points",
};

export function canonicalResourceId(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return RESOURCE_ID_ALIASES[slug] || slug;
}

/**
 * UI routing contract:
 * - resources → Combat pane (class pools, uses)
 * - combat_actions → Turn action slots (action / bonus / reaction / magic)
 * - features → Features tab; passives stay here only
 * - wild_shapes → submenu options for requires_option actions (Wild Shape)
 * - attacks → delegated strike profiles (Flurry, Extra Attack, weapons)
 */

export function isPassiveFeature(feature) {
  if (!feature) return true;
  if (feature.passive === true) return true;
  if (feature.passive === false) return false;
  const name = String(feature.name || "").toLowerCase();
  const passiveNames = new Set([
    "extra attack",
    "martial arts",
    "unarmored defense",
    "unarmored movement",
    "stunning strike",
    "monk's focus",
    "monk’s focus",
  ]);
  return passiveNames.has(name);
}

export function normalizeResourceRow(entry) {
  if (!entry?.name) return null;
  const recharge = RECHARGE_TYPES[entry.recharge] ? entry.recharge : RECHARGE_TYPES.long_rest;
  return {
    id: canonicalResourceId(entry.id || entry.name),
    name: entry.name,
    current: entry.current ?? null,
    max: entry.max ?? null,
    recharge,
    source_class: entry.source_class ?? null,
    display: Array.isArray(entry.display) ? entry.display : [DISPLAY_PANES.combat_pane],
  };
}

export function normalizeCombatActionRow(entry, index = 0) {
  if (!entry?.name) return null;
  const actionType = ACTION_TYPES[entry.action_type] || ACTION_TYPES.action;
  const targeting = TARGETING[entry.targeting] || TARGETING.self;
  const row = {
    id: entry.id || `action-${index}`,
    name: entry.name,
    action_type: actionType,
    targeting,
    description: entry.description || "",
    source: entry.source ?? null,
    display: Array.isArray(entry.display) ? entry.display : [DISPLAY_PANES.turn_actions],
  };
  if (entry.resource_cost?.resource_id) {
    row.resource_cost = {
      resource_id: canonicalResourceId(entry.resource_cost.resource_id),
      amount: Number(entry.resource_cost.amount) || 1,
    };
  }
  if (entry.requires_option) {
    row.requires_option = true;
    row.option_source = entry.option_source || OPTION_SOURCES.wild_shapes;
    if (Array.isArray(entry.options)) row.options = entry.options;
  }
  return row;
}
