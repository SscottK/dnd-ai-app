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
    features: [],
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
    base.inventory = Array.isArray(raw.inventory) ? raw.inventory : [];
    base.features = Array.isArray(raw.features) ? raw.features : [];
    base.conditions = Array.isArray(raw.conditions) ? raw.conditions : [];
    return base;
  } catch {
    return emptySheet();
  }
}

export function sheetToJson(sheet) {
  return JSON.stringify(sheet);
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

const SHIELD_PATTERN = /shield/i;

function normalizeItemName(name) {
  return String(name || "").trim();
}

function classifyInventoryItem(name) {
  const label = normalizeItemName(name);
  if (!label) return null;
  if (SHIELD_PATTERN.test(label)) {
    return { kind: "shield", bonus: 2, label };
  }
  for (const armor of ARMOR_CATALOG) {
    if (armor.pattern.test(label)) {
      return { kind: "armor", ...armor, label };
    }
  }
  if (/\bac\b/i.test(label) || /armor\s*class/i.test(label)) {
    const match = label.match(/(\d{1,2})/);
    if (match) return { kind: "bonus", bonus: parseInt(match[1], 10), label };
  }
  return null;
}

function equippedItems(sheet) {
  return (sheet.inventory || []).filter((item) => item.equipped);
}

function hasEquippedCombatGear(sheet) {
  return equippedItems(sheet).some((item) => classifyInventoryItem(item.name));
}

export function computeArmorClass(sheet, fallbackAc = null) {
  const dex = abilityModifier(sheet.abilities?.dex) ?? 0;
  const equipped = equippedItems(sheet);

  let bestArmor = null;
  let shieldBonus = 0;
  let flatBonus = 0;

  for (const item of equipped) {
    const stats = classifyInventoryItem(item.name);
    if (!stats) continue;
    if (stats.kind === "shield") {
      shieldBonus += stats.bonus;
    } else if (stats.kind === "armor") {
      if (!bestArmor || stats.base > bestArmor.base) {
        bestArmor = stats;
      }
    } else if (stats.kind === "bonus") {
      flatBonus = Math.max(flatBonus, stats.bonus);
    }
  }

  if (bestArmor) {
    return bestArmor.base + armorDexBonus(bestArmor, dex) + shieldBonus;
  }

  if (shieldBonus > 0) {
    const unarmored = 10 + dex;
    return unarmored + shieldBonus;
  }

  if (flatBonus > 0) return flatBonus;
  if (hasEquippedCombatGear(sheet)) return fallbackAc;
  if (fallbackAc != null) return fallbackAc;
  return 10 + dex;
}

export function getAcBreakdown(sheet, fallbackAc = null) {
  const dex = abilityModifier(sheet.abilities?.dex) ?? 0;
  const equipped = equippedItems(sheet).map((item) => ({
    item,
    stats: classifyInventoryItem(item.name),
  }));

  const armor = equipped
    .filter((entry) => entry.stats?.kind === "armor")
    .sort((a, b) => (b.stats.base || 0) - (a.stats.base || 0))[0];
  const shields = equipped.filter((entry) => entry.stats?.kind === "shield");

  if (!armor && shields.length === 0 && fallbackAc != null && !hasEquippedCombatGear(sheet)) {
    return { ac: fallbackAc, lines: ["Using character sheet AC."] };
  }

  const lines = [];
  let total;

  if (armor) {
    const dexBonus = armorDexBonus(armor.stats, dex);
    total = armor.stats.base + dexBonus;
    lines.push(`${armor.item.name}: base ${armor.stats.base}`);
    if (dexBonus) lines.push(`DEX bonus: +${dexBonus}`);
  } else {
    total = 10 + dex;
    lines.push(`Unarmored: 10 + DEX (${formatModifier(dex)})`);
  }

  for (const { item } of shields) {
    total += 2;
    lines.push(`${item.name}: +2`);
  }

  return { ac: total, lines };
}

export function computeEffectiveSpeed(sheet, fallbackSpeed = null) {
  const base = sheet.speed ?? fallbackSpeed;
  if (base == null) return null;

  const str = sheet.abilities?.str ?? 0;
  const wearingHeavy = equippedItems(sheet).some((item) => {
    const stats = classifyInventoryItem(item.name);
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
  const breakdown = getAcBreakdown(sheet, character?.ac ?? null);
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
