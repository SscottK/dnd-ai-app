/**
 * D&D 5.5e (2024) conditions — Rules Glossary.
 * Conditions don't stack with themselves; Exhaustion is the exception (levels 1–6).
 */

export const CONDITION_OPTIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
];

/** Short rules summary for UI tooltips (2024 glossary). */
export const CONDITION_HINTS = {
  Blinded: "Can't see; attacks have Disadvantage; attacks against you have Advantage.",
  Charmed: "Can't attack the charmer; charmer has Advantage on social checks against you.",
  Deafened: "Can't hear; automatically fail hearing-based checks.",
  Exhaustion: "Cumulative levels 1–6. −2 per level to D20 Tests; −5 ft. Speed per level. Die at 6.",
  Frightened: "Disadvantage on checks/attacks while source is in line of sight; can't willingly move closer.",
  Grappled: "Speed 0; ends if grappler is Incapacitated or you escape.",
  Incapacitated: "Can't take actions, Bonus Actions, or Reactions; can't speak (except faltering if Stunned).",
  Invisible: "Heavily obscured for hiding; attacks against you have Disadvantage; your attacks have Advantage.",
  Paralyzed: "Incapacitated; Speed 0; auto-fail Str/Dex saves; attacks against you have Advantage; melee hits within 5 ft. are crits.",
  Petrified: "Incapacitated; Speed 0; Resistant to all damage; Immune to Poisoned.",
  Poisoned: "Disadvantage on attack rolls and ability checks.",
  Prone: "Disadvantage on attacks; melee attacks against you have Advantage, ranged have Disadvantage.",
  Restrained: "Speed 0; Disadvantage on attacks and Dex saves; attacks against you have Advantage.",
  Stunned: "Incapacitated; Speed 0; auto-fail Str/Dex saves; attacks against you have Advantage.",
  Unconscious: "Incapacitated and Prone; Speed 0; unaware; auto-fail Str/Dex saves; melee hits within 5 ft. are crits.",
};

const INCAPACITATING = new Set(["Paralyzed", "Stunned", "Unconscious", "Petrified"]);

export function normalizeConditions(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (value == null || !String(value).trim()) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getExhaustionLevel(conditions) {
  const list = normalizeConditions(conditions);
  const entry = list.find((c) => /^exhaustion\b/i.test(c));
  if (!entry) return 0;
  const match = entry.match(/^exhaustion\s*(\d+)?/i);
  if (!match) return 1;
  const level = match[1] ? parseInt(match[1], 10) : 1;
  return Number.isFinite(level) && level > 0 ? level : 1;
}

export function formatExhaustion(level) {
  return `Exhaustion ${level}`;
}

export function hasCondition(conditions, name) {
  const list = normalizeConditions(conditions);
  const lower = name.toLowerCase();
  if (lower === "exhaustion") return getExhaustionLevel(list) > 0;
  return list.some((entry) => entry.toLowerCase() === lower);
}

function withoutExhaustion(conditions) {
  return normalizeConditions(conditions).filter((entry) => !/^exhaustion\b/i.test(entry));
}

/**
 * @returns {{ ok: true, conditions: string[] } | { ok: false, reason: string }}
 */
export function addCondition(conditions, conditionName, { dryRun = false } = {}) {
  const list = normalizeConditions(conditions);
  const name = String(conditionName || "").trim();
  if (!name) return { ok: false, reason: "Choose a condition." };

  if (name === "Exhaustion") {
    const level = getExhaustionLevel(list);
    if (level >= 6) {
      return { ok: false, reason: "Exhaustion is already level 6 — the creature dies." };
    }
    const next = [...withoutExhaustion(list), formatExhaustion(level + 1)];
    return dryRun ? { ok: true, conditions: next } : { ok: true, conditions: next };
  }

  if (hasCondition(list, name)) {
    return {
      ok: false,
      reason: `${name} is already applied. Conditions don't stack with themselves (5.5e Rules Glossary).`,
    };
  }

  if (name === "Incapacitated" && impliesIncapacitated(list)) {
    return {
      ok: false,
      reason:
        "Incapacitated is already in effect via Paralyzed, Stunned, Unconscious, or Petrified.",
    };
  }

  if (name === "Prone" && hasCondition(list, "Unconscious")) {
    return {
      ok: false,
      reason: "Prone is already applied while a creature has the Unconscious condition.",
    };
  }

  if (name === "Poisoned" && hasCondition(list, "Petrified")) {
    return {
      ok: false,
      reason: "Petrified creatures have Immunity to the Poisoned condition.",
    };
  }

  const next = [...list, name];
  return dryRun ? { ok: true, conditions: next } : { ok: true, conditions: next };
}

export function removeCondition(conditions, conditionName) {
  const list = normalizeConditions(conditions);
  const lower = String(conditionName).toLowerCase();
  if (lower.startsWith("exhaustion")) {
    return withoutExhaustion(list);
  }
  return list.filter((entry) => entry.toLowerCase() !== lower);
}

export function canAddCondition(conditions, conditionName) {
  return addCondition(conditions, conditionName, { dryRun: true }).ok;
}

export function impliesIncapacitated(conditions) {
  const list = normalizeConditions(conditions);
  if (hasCondition(list, "Incapacitated")) return true;
  return list.some((entry) => {
    const base = entry.split(/\s+/)[0];
    return INCAPACITATING.has(base);
  });
}

export function formatConditionsList(conditions) {
  return normalizeConditions(conditions).join(", ");
}
