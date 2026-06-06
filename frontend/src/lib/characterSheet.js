const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

const DEFAULT_SKILLS = [
  ["Athletics", "str"],
  ["Acrobatics", "dex"],
  ["Sleight of Hand", "dex"],
  ["Stealth", "dex"],
  ["Arcana", "int"],
  ["History", "int"],
  ["Investigation", "int"],
  ["Nature", "int"],
  ["Religion", "int"],
  ["Animal Handling", "wis"],
  ["Insight", "wis"],
  ["Medicine", "wis"],
  ["Perception", "wis"],
  ["Survival", "wis"],
  ["Deception", "cha"],
  ["Intimidation", "cha"],
  ["Performance", "cha"],
  ["Persuasion", "cha"],
];

export function abilityModifier(score) {
  if (score == null || Number.isNaN(Number(score))) return null;
  return Math.floor((Number(score) - 10) / 2);
}

export function formatModifier(mod) {
  if (mod == null) return "—";
  return mod >= 0 ? `+${mod}` : String(mod);
}

export function getProficiencyBonus(sheet) {
  return sheet?.proficiency_bonus ?? null;
}

export function resolveSaveBonus(save, sheet) {
  if (save?.bonus != null) return save.bonus;
  const mod = abilityModifier(sheet?.abilities?.[save?.ability]) ?? 0;
  const prof = getProficiencyBonus(sheet) ?? 0;
  return mod + (save?.proficient ? prof : 0);
}

export function resolveSkillBonus(skill, sheet) {
  if (skill?.bonus != null) return skill.bonus;
  const mod = abilityModifier(sheet?.abilities?.[skill?.ability]) ?? 0;
  const prof = getProficiencyBonus(sheet) ?? 0;
  let total = mod;
  if (skill?.proficient) total += prof;
  if (skill?.expertise) total += prof;
  return total;
}

export function resolvePassivePerception(sheet) {
  if (sheet?.passive_perception != null) return sheet.passive_perception;
  const perception = sheet?.skills?.find((skill) => skill.name === "Perception");
  if (!perception) return null;
  return 10 + resolveSkillBonus(perception, sheet);
}

export function getInitiativeBonus(sheet) {
  if (sheet?.initiative_bonus != null) return sheet.initiative_bonus;
  return abilityModifier(sheet?.abilities?.dex) ?? 0;
}

export function emptySheet() {
  return {
    abilities: Object.fromEntries(ABILITIES.map((k) => [k, null])),
    proficiency_bonus: null,
    speed: null,
    initiative_bonus: null,
    passive_perception: null,
    hit_dice: null,
    saving_throws: ABILITIES.map((ability) => ({
      ability,
      proficient: false,
      bonus: null,
    })),
    skills: DEFAULT_SKILLS.map(([name, ability]) => ({
      name,
      ability,
      proficient: false,
      expertise: false,
      bonus: null,
    })),
    proficiencies: { armor: [], weapons: [], tools: [], languages: [] },
    inventory: [],
    equipped_overrides: {},
    features: [],
    attacks: [],
    spells: [],
    combat_actions: [],
    resources: [],
    classes: [],
    wild_shapes: [],
    ac_bonuses: [],
    ac_breakdown: [],
    authoritative_ac: null,
    conditions: [],
    notes: "",
  };
}

export function parseSheetJson(text) {
  if (!text) return emptySheet();
  try {
    const raw = JSON.parse(text);
    const base = emptySheet();
    if (raw.abilities) base.abilities = { ...base.abilities, ...raw.abilities };
    for (const key of [
      "proficiency_bonus",
      "speed",
      "initiative_bonus",
      "passive_perception",
      "hit_dice",
      "notes",
    ]) {
      if (raw[key] != null) base[key] = raw[key];
    }
    if (Array.isArray(raw.saving_throws) && raw.saving_throws.length) {
      const byAbility = Object.fromEntries(raw.saving_throws.map((s) => [s.ability, s]));
      base.saving_throws = ABILITIES.map((ability) => ({
        ability,
        proficient: !!byAbility[ability]?.proficient,
        bonus: byAbility[ability]?.bonus ?? null,
      }));
    }
    if (Array.isArray(raw.skills) && raw.skills.length) {
      const byName = Object.fromEntries(raw.skills.map((s) => [s.name, s]));
      base.skills = DEFAULT_SKILLS.map(([name, ability]) => ({
        name,
        ability,
        proficient: !!byName[name]?.proficient,
        expertise: !!byName[name]?.expertise,
        bonus: byName[name]?.bonus ?? null,
      }));
    }
    if (raw.proficiencies) {
      base.proficiencies = {
        armor: raw.proficiencies.armor || [],
        weapons: raw.proficiencies.weapons || [],
        tools: raw.proficiencies.tools || [],
        languages: raw.proficiencies.languages || [],
      };
    }
    base.inventory = Array.isArray(raw.inventory)
      ? raw.inventory.map((item) => ({
          ...item,
          ac_bonus: item.ac_bonus != null ? Number(item.ac_bonus) : item.ac_bonus,
        }))
      : [];
    base.features = Array.isArray(raw.features) ? raw.features : [];
    base.attacks = Array.isArray(raw.attacks) ? raw.attacks : [];
    base.spells = Array.isArray(raw.spells) ? raw.spells : [];
    base.combat_actions = Array.isArray(raw.combat_actions) ? raw.combat_actions : [];
    base.resources = Array.isArray(raw.resources) ? raw.resources : [];
    base.classes = Array.isArray(raw.classes) ? raw.classes : [];
    base.wild_shapes = Array.isArray(raw.wild_shapes) ? raw.wild_shapes : [];
    base.ac_bonuses = Array.isArray(raw.ac_bonuses)
      ? raw.ac_bonuses.map((entry) => ({
          name: entry.name || "AC bonus",
          bonus: Number(entry.bonus) || 0,
          requires_armor: entry.requires_armor !== false,
        }))
      : [];
    base.ac_breakdown = Array.isArray(raw.ac_breakdown) ? raw.ac_breakdown : [];
    if (raw.authoritative_ac != null) {
      base.authoritative_ac = Number(raw.authoritative_ac);
    }
    base.equipped_overrides =
      raw.equipped_overrides && typeof raw.equipped_overrides === "object"
        ? Object.fromEntries(
            Object.entries(raw.equipped_overrides).map(([key, value]) => [
              normalizeItemKey(key),
              !!value,
            ])
          )
        : {};
    base.conditions = Array.isArray(raw.conditions) ? raw.conditions : [];
    return enrichSheetAcBonuses(applyEquippedOverrides(base));
  } catch {
    return emptySheet();
  }
}

export function prepareSheetForSave(sheet) {
  const next = { ...sheet };
  if (Object.keys(next.equipped_overrides || {}).length) {
    next.authoritative_ac = null;
  }
  return next;
}

export function sheetToJson(sheet) {
  return JSON.stringify(prepareSheetForSave(sheet));
}

const ARMOR_CATALOG = [
  { pattern: /plate armor|^plate$/i, base: 18, dexCap: 0, category: "heavy" },
  { pattern: /splint(?:\s+armor)?/i, base: 17, dexCap: 0, category: "heavy" },
  { pattern: /chain\s*mail/i, base: 16, dexCap: 0, category: "heavy" },
  { pattern: /ring\s*mail/i, base: 14, dexCap: 0, category: "heavy" },
  { pattern: /half[\s-]?plate/i, base: 15, dexCap: 2, category: "medium" },
  { pattern: /breastplate/i, base: 14, dexCap: 2, category: "medium" },
  { pattern: /scale\s*mail/i, base: 14, dexCap: 2, category: "medium" },
  { pattern: /chain\s*shirt/i, base: 13, dexCap: 2, category: "medium" },
  { pattern: /hide(?:\s+armor)?/i, base: 12, dexCap: 2, category: "medium" },
  { pattern: /studded\s*leather/i, base: 12, dexCap: 99, category: "light" },
  { pattern: /leather(?:\s+armor)?/i, base: 11, dexCap: 99, category: "light" },
  { pattern: /padded(?:\s+armor)?/i, base: 11, dexCap: 99, category: "light" },
];

function armorDexBonus(armor, dex) {
  if (armor.dexCap === 0) return 0;
  return Math.min(dex, armor.dexCap);
}

function armorBreakdownLines(bestArmor, dex) {
  const { base, dexCap, magicBonus = 0 } = bestArmor.stats;
  const dexBonus = armorDexBonus(bestArmor.stats, dex);
  const lines = ["Base: 10"];

  if (dexCap === 0) {
    if (dex) lines.push(`DEX: ${formatModifier(dex)}`);
    const armorIncrement = base - 10 - dex;
    lines.push(`${bestArmor.item.name}: +${armorIncrement}`);
    if (magicBonus) lines.push(`Magic armor bonus: +${magicBonus}`);
    return lines;
  }

  if (dexBonus) lines.push(`DEX: ${formatModifier(dexBonus)}`);
  lines.push(`${bestArmor.item.name}: +${base - 10}`);
  if (magicBonus) lines.push(`Magic armor bonus: +${magicBonus}`);
  return lines;
}

const SHIELD_PATTERN = /shield/i;

export function normalizeItemKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeItemName(name) {
  return String(name || "").trim();
}

export function applyEquippedOverrides(sheet) {
  const overrides = sheet.equipped_overrides || {};
  if (!Object.keys(overrides).length) return sheet;

  return {
    ...sheet,
    inventory: (sheet.inventory || []).map((item) => {
      const key = normalizeItemKey(item.name);
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return { ...item, equipped: !!overrides[key] };
      }
      return item;
    }),
  };
}

export function setInventoryItemEquipped(sheet, index, equipped) {
  const item = sheet.inventory?.[index];
  if (!item) return sheet;

  const key = normalizeItemKey(item.name);
  const inventory = sheet.inventory.map((entry, i) =>
    i === index ? { ...entry, equipped } : entry
  );

  return applyEquippedOverrides({
    ...sheet,
    inventory,
    authoritative_ac: null,
    equipped_overrides: {
      ...(sheet.equipped_overrides || {}),
      [key]: equipped,
    },
  });
}

function trustAuthoritativeAc(sheet) {
  return Object.keys(sheet?.equipped_overrides || {}).length === 0;
}

export function itemAffectsAc(item) {
  return !!classifyInventoryItem(item);
}

function stripMagicSuffix(name) {
  return normalizeItemName(name)
    .replace(/\s*\+\s*\d+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMagicBonus(...parts) {
  for (const part of parts) {
    if (part == null || part === "") continue;
    const text = String(part);
    const match = text.match(/\+\s*(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

function itemMagicBonus(item) {
  if (item?.ac_bonus != null && !Number.isNaN(Number(item.ac_bonus))) {
    return Number(item.ac_bonus);
  }
  return parseMagicBonus(item?.name, item?.notes);
}

function classifyInventoryItem(itemOrName) {
  const item = typeof itemOrName === "string" ? { name: itemOrName } : itemOrName || {};
  const label = normalizeItemName(item.name);
  if (!label) return null;

  const magicBonus = itemMagicBonus(item);
  const armorLabel = stripMagicSuffix(label);

  if (SHIELD_PATTERN.test(armorLabel)) {
    return { kind: "shield", bonus: 2 + magicBonus, magicBonus, label };
  }
  for (const armor of ARMOR_CATALOG) {
    if (armor.pattern.test(armorLabel)) {
      return { kind: "armor", ...armor, magicBonus, label };
    }
  }
  if (/\bac\b/i.test(label) || /armor\s*class/i.test(label)) {
    const match = label.match(/(\d{1,2})/);
    if (match) return { kind: "bonus", bonus: parseInt(match[1], 10), magicBonus: 0, label };
  }
  return null;
}

function featureText(feature) {
  return `${feature?.name || ""} ${feature?.source || ""} ${feature?.description || ""}`;
}

function isDefenseFightingStyle(feature) {
  const name = String(feature?.name || "").trim().toLowerCase();
  const source = String(feature?.source || "").toLowerCase();
  const text = featureText(feature);
  if (name === "defense") return true;
  if (/fighting style/i.test(name) && /\bdefense\b/i.test(name)) return true;
  if (name === "fighting style" && /\bdefense\b/i.test(text)) return true;
  if (/fighting style/i.test(source) && /\bdefense\b/i.test(name)) return true;
  if (/fighting style.*\bdefense\b|\bdefense\b.*fighting style/i.test(text)) return true;
  if (/armored bonus.*\bdefense\b|\bdefense\b.*armored bonus/i.test(text)) return true;
  if (/\+\s*1\s+.*\bac\b.*wearing armor|wearing armor.*\+\s*1\s+.*\bac\b/i.test(text)) {
    return true;
  }
  return false;
}

function inferAcBonusesFromFeatures(features) {
  const bonuses = [];
  for (const feature of features || []) {
    if (isDefenseFightingStyle(feature)) {
      bonuses.push({ name: "Defense (Fighting Style)", bonus: 1, requires_armor: true });
    }
  }
  return bonuses;
}

function sheetTextBlob(sheet) {
  const parts = [sheet.notes || ""];
  for (const feature of sheet.features || []) {
    parts.push(featureText(feature));
  }
  for (const item of sheet.inventory || []) {
    parts.push(`${item.name || ""} ${item.notes || ""}`);
  }
  return parts.join(" ");
}

function inferAcBonusesFromSheetText(sheet) {
  const text = sheetTextBlob(sheet);
  if (/armored bonus.*\bdefense\b|\bdefense\b.*armored bonus/i.test(text)) {
    return [{ name: "Armored Bonus (Defense)", bonus: 1, requires_armor: true }];
  }
  return [];
}

function isStructuralAcLine(name, bonus, dex) {
  const label = String(name || "").trim().toLowerCase();
  if (label === "base" || (/\bbase\b/.test(label) && bonus === 10)) return true;
  if (/\b(dex|dexterity|ability)\b/i.test(label) && bonus === dex) return true;
  return false;
}

function acBonusesFromBreakdown(breakdown) {
  const bonuses = [];
  for (const row of breakdown || []) {
    const kind = String(row?.kind || "bonus").toLowerCase();
    if (kind === "armor" || kind === "dex" || kind === "shield" || kind === "base" || kind === "ability") {
      continue;
    }
    const bonus = Number(row?.value ?? row?.bonus);
    if (!bonus) continue;
    bonuses.push({
      name: row.label || row.name || "AC bonus",
      bonus,
      requires_armor: row.requires_armor !== false,
    });
  }
  return bonuses;
}

function mergeAcBonuses(existing, inferred) {
  const merged = [...existing];
  for (const bonus of inferred) {
    const duplicate = merged.some(
      (entry) => entry.name === bonus.name && entry.bonus === bonus.bonus
    );
    if (!duplicate) merged.push(bonus);
  }
  return merged;
}

function dedupeDefenseBonuses(bonuses) {
  let hasDefense = false;
  return bonuses.filter((entry) => {
    if (/defense/i.test(entry.name || "")) {
      if (hasDefense) return false;
      hasDefense = true;
    }
    return true;
  });
}

function sanitizeAcBonuses(sheet, bonuses) {
  const equipped = equippedItems(sheet);
  const dex = abilityModifier(sheet.abilities?.dex) ?? 0;
  let bestArmor = null;
  for (const item of equipped) {
    const stats = classifyInventoryItem(item);
    if (stats?.kind === "armor") {
      if (!bestArmor || stats.base > bestArmor.base) bestArmor = stats;
    }
  }

  return bonuses.filter((entry) => {
    const name = String(entry.name || "").toLowerCase();
    const bonus = Number(entry.bonus) || 0;
    if (isStructuralAcLine(name, bonus, dex)) return false;
    if (/shield|buckler/i.test(name)) return false;
    if (bestArmor && /dex|dexterity/i.test(name)) return false;
    if (
      bestArmor?.dexCap === 0 &&
      entry.bonus === abilityModifier(sheet.abilities?.dex) &&
      entry.bonus > 0
    ) {
      return false;
    }
    if (bestArmor && /armor|chain mail|plate|mail|breastplate/i.test(name) && entry.bonus === bestArmor.base) {
      return false;
    }
    return true;
  });
}

function estimateEquipmentAc(sheet) {
  const dex = abilityModifier(sheet.abilities?.dex) ?? 0;
  const { bestArmor, shieldBonus } = collectEquippedCombatStats(sheet);
  if (bestArmor) {
    const magicBonus = bestArmor.stats.magicBonus || 0;
    return bestArmor.stats.base + armorDexBonus(bestArmor.stats, dex) + magicBonus + shieldBonus;
  }
  if (shieldBonus > 0) return 10 + dex + shieldBonus;
  return null;
}

export function enrichSheetAcBonuses(sheet) {
  const next = { ...sheet };
  const inferred = [
    ...acBonusesFromBreakdown(next.ac_breakdown),
    ...inferAcBonusesFromFeatures(next.features),
    ...inferAcBonusesFromSheetText(next),
  ];
  next.ac_bonuses = dedupeDefenseBonuses(
    sanitizeAcBonuses(next, mergeAcBonuses(next.ac_bonuses || [], inferred))
  );

  const wearingArmor = equippedItems(next).some(
    (item) => classifyInventoryItem(item)?.kind === "armor"
  );
  const equipmentAc = estimateEquipmentAc(next);
  const authoritative = next.authoritative_ac;
  if (authoritative != null && equipmentAc != null && authoritative > equipmentAc) {
    const covered = equipmentAc + collectAcBonuses(next, { wearingArmor }).total;
    const gap = authoritative - covered;
    if (gap > 0) {
      next.ac_bonuses = mergeAcBonuses(next.ac_bonuses, [
        { name: "Sheet AC bonus", bonus: gap, requires_armor: wearingArmor },
      ]);
    }
  }

  return next;
}

function acBonusFromFeatures(features, { wearingArmor = false, skipDefense = false } = {}) {
  let bonus = 0;
  for (const feature of features || []) {
    const text = featureText(feature);
    if (!skipDefense && isDefenseFightingStyle(feature) && wearingArmor) {
      bonus += 1;
      continue;
    }
    if (/\bnatural armor\b/i.test(text)) {
      const match = text.match(/AC\s*(?:of\s*)?(\d{1,2})/i) || text.match(/\+\s*(\d+)/);
      if (match) bonus = Math.max(bonus, parseInt(match[1], 10));
    }
  }
  return bonus;
}

function collectAcBonuses(sheet, { wearingArmor = false } = {}) {
  const entries = sheet.ac_bonuses?.length
    ? sheet.ac_bonuses
    : inferAcBonusesFromFeatures(sheet.features);
  const lines = [];
  let total = 0;
  let hasDefense = false;

  for (const entry of entries) {
    if (entry.requires_armor && !wearingArmor) continue;
    const amount = Number(entry.bonus) || 0;
    if (!amount) continue;
    total += amount;
    lines.push(`${entry.name}: +${amount}`);
    if (/defense/i.test(entry.name)) hasDefense = true;
  }

  const featureExtra = acBonusFromFeatures(sheet.features, {
    wearingArmor,
    skipDefense: hasDefense,
  });
  if (featureExtra) {
    total += featureExtra;
    lines.push(`Class/feature bonus: +${featureExtra}`);
  }

  return { total, lines };
}

function reconcileAuthoritativeAc(total, sheet, lines, { wearingArmor = false } = {}) {
  const authoritative = sheet.authoritative_ac;
  if (authoritative == null || !wearingArmor || !trustAuthoritativeAc(sheet)) {
    return { ac: total, lines };
  }
  if (authoritative < total) {
    return {
      ac: authoritative,
      lines: [...lines, `Adjusted to sheet total (${authoritative}); removed duplicate bonuses`],
    };
  }
  if (authoritative > total) {
    const gap = authoritative - total;
    return {
      ac: authoritative,
      lines: [...lines, `Other sheet bonuses: +${gap}`],
    };
  }
  return { ac: total, lines };
}

function unarmoredAcFromFeatures(features, sheet) {
  const dex = abilityModifier(sheet?.abilities?.dex) ?? 0;
  for (const feature of features || []) {
    const text = `${feature?.name || ""} ${feature?.description || ""}`;
    if (/\bdraconic resilience\b/i.test(text)) {
      return { ac: 13 + dex, label: "Draconic Resilience: 13 + DEX" };
    }
    if (/\bunarmored defense\b/i.test(text)) {
      const con = abilityModifier(sheet?.abilities?.con) ?? 0;
      const wis = abilityModifier(sheet?.abilities?.wis) ?? 0;
      const source = String(feature?.source || "").toLowerCase();
      if (source.includes("monk") || /wisdom|\+\s*wis\b/i.test(text)) {
        return { ac: 10 + dex + wis, label: "Unarmored Defense: 10 + DEX + WIS" };
      }
      return { ac: 10 + dex + con, label: "Unarmored Defense: 10 + DEX + CON" };
    }
  }
  return null;
}

function computeMiscAcBonuses(sheet, wearingArmor) {
  let total = 0;
  for (const item of equippedItems(sheet)) {
    const haystack = `${item.name || ""} ${item.notes || ""}`;
    if (/ring of protection/i.test(haystack)) total += 1;
    if (/cloak of protection/i.test(haystack)) total += 1;
    if (/ioun stone.*protection|stone of protection/i.test(haystack)) total += 1;
    if (!wearingArmor && /bracers of defense/i.test(haystack)) total += 2;
    if (/amulet of (?:natural )?armor/i.test(haystack)) {
      total += itemMagicBonus(item) || parseMagicBonus(haystack) || 1;
    }
  }
  return total;
}

function equippedItems(sheet) {
  const resolved = applyEquippedOverrides(sheet);
  return (resolved.inventory || []).filter((item) => item.equipped);
}

function hasEquippedCombatGear(sheet) {
  return equippedItems(sheet).some((item) => classifyInventoryItem(item));
}

function collectEquippedCombatStats(sheet) {
  let bestArmor = null;
  let shieldBonus = 0;
  let flatBonus = 0;

  for (const item of equippedItems(sheet)) {
    const stats = classifyInventoryItem(item);
    if (!stats) continue;
    if (stats.kind === "shield") {
      shieldBonus += stats.bonus;
    } else if (stats.kind === "armor") {
      const score = (stats.base || 0) + (stats.magicBonus || 0);
      const bestScore = bestArmor
        ? (bestArmor.stats.base || 0) + (bestArmor.stats.magicBonus || 0)
        : -1;
      if (!bestArmor || score > bestScore) {
        bestArmor = { item, stats };
      }
    } else if (stats.kind === "bonus") {
      flatBonus = Math.max(flatBonus, stats.bonus);
    }
  }

  return { bestArmor, shieldBonus, flatBonus };
}

export function computeArmorClass(sheet, fallbackAc = null) {
  const enriched = enrichSheetAcBonuses(sheet);
  const dex = abilityModifier(enriched.abilities?.dex) ?? 0;
  const { bestArmor, shieldBonus, flatBonus } = collectEquippedCombatStats(enriched);
  const wearingArmor = !!bestArmor;
  const { total: acBonuses } = collectAcBonuses(enriched, { wearingArmor });
  const miscBonus = computeMiscAcBonuses(enriched, wearingArmor);
  const unarmoredFeature = !bestArmor ? unarmoredAcFromFeatures(enriched.features, enriched) : null;
  const authoritative = enriched.authoritative_ac ?? fallbackAc;

  let total;

  if (bestArmor) {
    const magicBonus = bestArmor.stats.magicBonus || 0;
    total =
      bestArmor.stats.base +
      armorDexBonus(bestArmor.stats, dex) +
      magicBonus +
      shieldBonus +
      miscBonus +
      acBonuses;
  } else if (shieldBonus > 0) {
    const base = unarmoredFeature?.ac ?? 10 + dex;
    total = base + shieldBonus + miscBonus + acBonuses;
  } else if (flatBonus > 0) {
    total = flatBonus + miscBonus + acBonuses;
  } else if (unarmoredFeature) {
    total = unarmoredFeature.ac + miscBonus + acBonuses;
  } else if (acBonuses > 0) {
    total = 10 + dex + acBonuses + miscBonus;
  } else {
    total = 10 + dex + miscBonus;
  }

  if (wearingArmor && authoritative != null && trustAuthoritativeAc(enriched)) {
    if (authoritative > total) return authoritative;
    if (authoritative < total) return authoritative;
  }
  return total;
}

export function getAcBreakdown(sheet, fallbackAc = null) {
  const enriched = enrichSheetAcBonuses(sheet);
  const dex = abilityModifier(enriched.abilities?.dex) ?? 0;
  const { bestArmor, shieldBonus, flatBonus } = collectEquippedCombatStats(enriched);
  const wearingArmor = !!bestArmor;
  const { total: acBonuses, lines: acBonusLines } = collectAcBonuses(enriched, { wearingArmor });
  const miscBonus = computeMiscAcBonuses(enriched, wearingArmor);
  const unarmoredFeature = !bestArmor ? unarmoredAcFromFeatures(enriched.features, enriched) : null;
  const shields = equippedItems(enriched)
    .map((item) => ({ item, stats: classifyInventoryItem(item) }))
    .filter((entry) => entry.stats?.kind === "shield");

  const lines = [];
  let total;

  if (bestArmor) {
    const magicBonus = bestArmor.stats.magicBonus || 0;
    const dexBonus = armorDexBonus(bestArmor.stats, dex);
    total = bestArmor.stats.base + dexBonus + magicBonus;
    lines.push(...armorBreakdownLines(bestArmor, dex));
  } else if (flatBonus > 0) {
    total = flatBonus;
    lines.push(`Item AC bonus: ${flatBonus}`);
  } else if (unarmoredFeature) {
    total = unarmoredFeature.ac;
    lines.push(unarmoredFeature.label);
  } else {
    total = 10 + dex;
    lines.push(`Unarmored: 10 + DEX (${formatModifier(dex)})`);
  }

  for (const { item, stats } of shields) {
    total += stats.bonus;
    lines.push(`${item.name}: +${stats.bonus}`);
  }

  if (miscBonus) lines.push(`Worn items (ring/cloak/etc.): +${miscBonus}`);
  lines.push(...acBonusLines);
  total += miscBonus + acBonuses;

  return reconcileAuthoritativeAc(total, enriched, lines, { wearingArmor });
}

export function computeEffectiveSpeed(sheet, fallbackSpeed = null) {
  const base = sheet.speed ?? fallbackSpeed;
  if (base == null) return null;

  const str = sheet.abilities?.str ?? 0;
  const wearingHeavy = equippedItems(sheet).some((item) => {
    const stats = classifyInventoryItem(item);
    return stats?.kind === "armor" && stats.category === "heavy";
  });

  if (wearingHeavy && str < 15) {
    return Math.max(0, base - 10);
  }
  return base;
}

export function applyEquipmentToCharacter(character, sheet) {
  const ac = computeArmorClass(sheet, character?.ac ?? null);
  return { ...character, ac };
}

export function resolveCombatStats(character, sheet) {
  const breakdown = getAcBreakdown(sheet, null);
  const speed = computeEffectiveSpeed(sheet, sheet.speed);
  return {
    ac: breakdown.ac,
    acLines: breakdown.lines,
    speed: speed ?? sheet.speed,
    fromEquipment: hasEquippedCombatGear(sheet),
  };
}

export function hasSheetData(sheet) {
  const abilityCount = ABILITIES.filter((k) => sheet.abilities?.[k] != null).length;
  return (
    abilityCount > 0 ||
    sheet.inventory?.length > 0 ||
    sheet.features?.length > 0 ||
    sheet.skills?.some((s) => s.proficient || s.bonus != null)
  );
}

export { ABILITIES, ABILITY_LABELS };
