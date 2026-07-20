/**
 * Apply a D&D 5.5e (2024) Long Rest to a digital character sheet.
 *
 * - Regain all Hit Points
 * - Refresh resources that recharge on a short or long rest
 * - Reduce Exhaustion by 1 (if present)
 * - Clear Unconscious (you finish the rest conscious)
 *
 * Hit Dice are displayed as a total pool string today (e.g. "5d10") with no spent
 * counter, so there is nothing to restore for HD until that is tracked separately.
 */

import {
  formatExhaustion,
  getExhaustionLevel,
  normalizeConditions,
} from "./conditions";

function rechargesOnLongRest(recharge) {
  const raw = String(recharge ?? "long_rest")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (!raw || raw === "none" || raw === "turn" || raw === "round") return false;
  // short_rest, long_rest, short_or_long_rest, etc.
  return raw.includes("rest");
}

function withoutExhaustionAndUnconscious(conditions) {
  return normalizeConditions(conditions).filter(
    (entry) => !/^exhaustion\b/i.test(entry) && entry.toLowerCase() !== "unconscious"
  );
}

export function reduceExhaustionByOne(conditions) {
  const level = getExhaustionLevel(conditions);
  const base = withoutExhaustionAndUnconscious(conditions);
  if (level <= 1) return base;
  return [...base, formatExhaustion(level - 1)];
}

/**
 * @param {{ character: object, sheet: object }} args
 * @returns {{ character: object, sheet: object, summary: string[] }}
 */
export function applyLongRest({ character, sheet }) {
  const nextCharacter = { ...character };
  const nextSheet = { ...sheet };
  const summary = [];

  const maxHp = Number(character?.max_hp);
  const currentHp = Number(character?.hp);
  if (Number.isFinite(maxHp) && maxHp > 0) {
    if (!Number.isFinite(currentHp) || currentHp !== maxHp) {
      nextCharacter.hp = maxHp;
      summary.push(`HP restored to ${maxHp}`);
    }
  }

  const resources = Array.isArray(sheet?.resources) ? sheet.resources : [];
  let refreshed = 0;
  nextSheet.resources = resources.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    if (!rechargesOnLongRest(entry.recharge)) return entry;
    const max = entry.max;
    if (max == null || max === "") return entry;
    const maxNum = Number(max);
    const currentNum = Number(entry.current);
    if (!Number.isFinite(maxNum)) return entry;
    if (Number.isFinite(currentNum) && currentNum === maxNum) return entry;
    refreshed += 1;
    return { ...entry, current: maxNum };
  });
  if (refreshed > 0) {
    summary.push(
      refreshed === 1 ? "1 resource refreshed" : `${refreshed} resources refreshed`
    );
  }

  const beforeLevel = getExhaustionLevel(sheet?.conditions);
  const hadUnconscious = normalizeConditions(sheet?.conditions).some(
    (c) => c.toLowerCase() === "unconscious"
  );
  const nextConditions = reduceExhaustionByOne(sheet?.conditions);
  nextSheet.conditions = nextConditions;
  if (beforeLevel > 0) {
    const afterLevel = getExhaustionLevel(nextConditions);
    summary.push(
      afterLevel > 0
        ? `Exhaustion ${beforeLevel} → ${afterLevel}`
        : `Exhaustion ${beforeLevel} cleared`
    );
  }
  if (hadUnconscious) {
    summary.push("Unconscious removed");
  }

  if (summary.length === 0) {
    summary.push("Already rested — nothing to change");
  }

  return { character: nextCharacter, sheet: nextSheet, summary };
}
