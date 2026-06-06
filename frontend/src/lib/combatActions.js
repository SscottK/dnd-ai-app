/**
 * D&D 5.5e turn actions — sheet-derived attacks, spells, features, and NPC stat-block actions.
 */

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

const SELF_TARGET_HINTS =
  /self only|on yourself|you gain|you have advantage on|teleport|heal yourself|restore hit points to yourself/i;
const ALLY_TARGET_HINTS = /ally|friendly creature|creature you can see within/i;
const AREA_HINTS = /each creature|creatures within|in a \d+-foot|radius|cone|line|cube|sphere/i;

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

function normalizeTargeting(value, hintText = "") {
  if (value && Object.values(TARGETING).includes(value)) return value;
  const text = String(hintText || "");
  if (SELF_TARGET_HINTS.test(text) && !AREA_HINTS.test(text)) return TARGETING.self;
  if (AREA_HINTS.test(text)) return TARGETING.one_creature;
  if (ALLY_TARGET_HINTS.test(text)) return TARGETING.one_ally_or_self;
  return TARGETING.one_enemy;
}

export function normalizeCombatAction(raw, index = 0, category = "action") {
  if (!raw?.name) return null;
  const description = raw.description || raw.notes || "";
  const detailParts = [raw.damage, raw.to_hit != null ? `+${raw.to_hit} to hit` : null, description]
    .filter(Boolean)
    .join(" · ");
  const damageDice = raw.damage_dice || raw.damageDice || null;
  const parsedDamage =
    damageDice ||
    (typeof raw.damage === "string" ? raw.damage.replace(/\s+/g, "") : null);

  return {
    id: raw.id || `${category}-${index}-${slug(raw.name)}`,
    name: String(raw.name).trim(),
    actionType: normalizeActionType(raw.action_type || raw.actionType),
    targeting: normalizeTargeting(raw.targeting, `${raw.name} ${description}`),
    category,
    description: description || undefined,
    detail: raw.detail || (detailParts || undefined),
    attackBonus: raw.attack_bonus ?? raw.attackBonus ?? raw.to_hit ?? null,
    damageDice: parsedDamage,
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

function equipmentActions(sheet) {
  return (sheet?.inventory || [])
    .filter((item) => item?.name)
    .flatMap((item, index) => {
      const itemId = item.id || item.name;
      if (item.equipped) {
        return [
          normalizeCombatAction(
            {
              id: `unequip-${itemId}`,
              name: `Unequip ${item.name}`,
              action_type: ACTION_TYPES.action,
              targeting: TARGETING.self,
              category: "equipment",
            },
            index,
            "equipment"
          ),
        ];
      }
      return [
        normalizeCombatAction(
          {
            id: `equip-${itemId}`,
            name: `Equip ${item.name}`,
            action_type: ACTION_TYPES.bonus_action,
            targeting: TARGETING.self,
            category: "equipment",
          },
          index,
          "equipment"
        ),
      ];
    })
    .filter(Boolean);
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
  const text = `${name} ${description}`;
  if (/bonus action/i.test(text)) return ACTION_TYPES.bonus_action;
  if (/reaction/i.test(text)) return ACTION_TYPES.reaction;
  if (/\baction\b/i.test(text)) return ACTION_TYPES.action;
  return null;
}

function inferredFeatureActions(sheet) {
  const results = [];
  for (const feat of sheet?.features || []) {
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
  return normalizeTargeting(feat?.targeting, text);
}

function explicitSheetActions(sheet) {
  return (sheet?.combat_actions || [])
    .map((action, index) => normalizeCombatAction(action, index, action.category || "combat"))
    .filter(Boolean);
}

function featureActions(sheet) {
  return (sheet?.features || [])
    .filter((feat) => feat?.action_type && feat?.targeting)
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

function collectSheetDerivedActions(sheet) {
  return [
    ...attackRowActions(sheet),
    ...inventoryWeaponActions(sheet),
    ...equipmentActions(sheet),
    ...spellActions(sheet),
    ...explicitSheetActions(sheet),
    ...featureActions(sheet),
    ...inferredFeatureActions(sheet),
  ];
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
    if (!action) return;
    const key = `${action.actionType}:${action.id}`;
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
