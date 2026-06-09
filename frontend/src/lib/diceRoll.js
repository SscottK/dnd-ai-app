/** Client-side dice rolling — mirrors backend action_dice for combat-time rolls. */

const DICE_EXPR = /^(?:(\d+)|)d(\d+)(([kd][hl])(\d+))?([+-]\d+)?$/i;

export function normalizeRollExpression(expression) {
  return String(expression || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function isValidDiceExpression(expression) {
  const normalized = normalizeRollExpression(expression);
  if (!normalized) return false;

  const match = normalized.match(DICE_EXPR);
  if (!match) return false;

  const count = parseInt(match[1] || "1", 10);
  const sides = parseInt(match[2], 10);
  return count >= 1 && count <= 40 && sides >= 2 && sides <= 100;
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function rollD20Check({ advantage = false, disadvantage = false } = {}) {
  let adv = advantage;
  let dis = disadvantage;
  if (adv && dis) {
    adv = false;
    dis = false;
  }
  if (adv) {
    const rolls = [rollDie(20), rollDie(20)];
    return { total: Math.max(...rolls), rolls, dropped: [] };
  }
  if (dis) {
    const rolls = [rollDie(20), rollDie(20)];
    return { total: Math.min(...rolls), rolls, dropped: [] };
  }
  const roll = rollDie(20);
  return { total: roll, rolls: [roll], dropped: [] };
}

export function rollExpression(expression, { advantage = false, disadvantage = false } = {}) {
  const normalized = normalizeRollExpression(expression);
  if (!normalized) {
    throw new Error("Enter a dice expression like 2d6+3 or 4d6dl1.");
  }

  const match = normalized.match(DICE_EXPR);
  if (!match) {
    throw new Error(`Could not parse dice expression: ${expression}`);
  }

  const count = parseInt(match[1] || "1", 10);
  const sides = parseInt(match[2], 10);
  if (count < 1 || count > 40 || sides < 2 || sides > 100) {
    throw new Error("Dice count must be 1–40 and sides 2–100.");
  }

  const keepDrop = (match[4] || "").toLowerCase();
  const keepCount = parseInt(match[5] || "0", 10);
  const mod = parseInt(match[6] || "0", 10);

  if (sides === 20 && count === 1 && !keepDrop) {
    const { total, rolls, dropped } = rollD20Check({ advantage, disadvantage });
    return {
      total: total + mod,
      kept: rolls,
      dropped,
      modifier: mod,
      expression: normalized,
    };
  }

  if (advantage || disadvantage) {
    const { total, rolls, dropped } = rollD20Check({ advantage, disadvantage });
    return {
      total: total + mod,
      kept: rolls,
      dropped,
      modifier: mod,
      expression: normalized,
    };
  }

  const rolls = Array.from({ length: count }, () => rollDie(sides));
  let kept = [...rolls];
  let dropped = [];

  if ((keepDrop === "dl" || keepDrop === "kd") && keepCount > 0) {
    const dropN = Math.min(keepCount, kept.length - 1);
    for (let i = 0; i < dropN; i += 1) {
      const lowest = Math.min(...kept);
      const idx = kept.indexOf(lowest);
      kept.splice(idx, 1);
      dropped.push(lowest);
    }
  } else if ((keepDrop === "kh" || keepDrop === "k") && keepCount > 0) {
    const keepN = Math.min(keepCount, kept.length);
    const sortedDesc = [...kept].sort((a, b) => b - a);
    kept = sortedDesc.slice(0, keepN);
    dropped = sortedDesc.slice(keepN);
  } else if ((keepDrop === "kl" || keepDrop === "l") && keepCount > 0) {
    const keepN = Math.min(keepCount, kept.length);
    const sortedAsc = [...kept].sort((a, b) => a - b);
    kept = sortedAsc.slice(0, keepN);
    dropped = sortedAsc.slice(keepN);
  }

  return {
    total: kept.reduce((sum, value) => sum + value, 0) + mod,
    kept,
    dropped,
    modifier: mod,
    expression: normalized,
  };
}

export function formatRollMessage({
  label,
  kept = [],
  dropped = [],
  modifier = 0,
  total,
  bonus = null,
}) {
  const parts = [];
  if (kept.length === 1) {
    parts.push(String(kept[0]));
  } else if (kept.length) {
    parts.push(kept.join("+"));
  }
  if (dropped.length) {
    parts.push(`drop [${dropped.join(", ")}]`);
  }
  if (bonus != null && bonus !== 0) {
    parts.push(bonus >= 0 ? `+${bonus}` : String(bonus));
  } else if (modifier) {
    parts.push(modifier >= 0 ? `+${modifier}` : String(modifier));
  }
  const body = parts.length ? parts.join(" ") : String(total);
  return `${label}: ${body} = ${total}`;
}

export function appendModifier(expression, modifier) {
  const mod = Number(modifier);
  if (!mod || Number.isNaN(mod)) return expression;
  const normalized = normalizeRollExpression(expression);
  const existing = normalized.match(/([+-]\d+)$/);
  if (existing) {
    const base = normalized.slice(0, -existing[1].length);
    const combined = parseInt(existing[1], 10) + mod;
    if (combined === 0) return base;
    return `${base}${combined >= 0 ? `+${combined}` : combined}`;
  }
  return `${normalized}${mod >= 0 ? `+${mod}` : mod}`;
}
