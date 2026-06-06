/** Primary activation economy — mirrors backend action_type_inference.py */

const ACTION_TYPE_OVERRIDES = {
  "wild shape": "action",
  "combat wild shape": "bonus_action",
  "end wild shape": "bonus_action",
  "cunning action": "bonus_action",
  "second wind": "bonus_action",
  "action surge": "action",
  rage: "bonus_action",
  "flurry of blows": "bonus_action",
  "patient defense": "bonus_action",
  "step of the wind": "bonus_action",
};

const PRIMARY_ACTION =
  /(?:^|[.!?]\s+|\n)\s*(?:as an action|you can use your action|you use an action|takes? an action|costs? (?:one |an )?action)/i;
const PRIMARY_BONUS =
  /(?:^|[.!?]\s+|\n)\s*(?:as a bonus action|you can use (?:a )?bonus action|you use (?:a )?bonus action|costs? (?:one |a )?bonus action)/i;
const PRIMARY_REACTION =
  /(?:^|[.!?]\s+|\n)\s*(?:as a reaction|you can use (?:a )?reaction|you use (?:a )?reaction|costs? (?:one |a )?reaction)/i;
const TRAILING_ECONOMY = /\(\s*\d+\s*\/\s*[^)]*\s*[•·]\s*(\d+)\s*(Action|Bonus Action|Reaction)s?\s*\)/i;

export function overrideActionType(name) {
  return ACTION_TYPE_OVERRIDES[String(name || "").trim().toLowerCase()] || null;
}

export function inferPrimaryActionType(name = "", description = "") {
  const override = overrideActionType(name);
  if (override) return override;

  const text = String(description || "").trim();
  if (!text) return null;

  const trailer = TRAILING_ECONOMY.exec(text);
  if (trailer) {
    const economy = trailer[2].toLowerCase();
    if (economy.includes("bonus")) return "bonus_action";
    if (economy.includes("reaction")) return "reaction";
    return "action";
  }

  const matches = [];
  for (const [pattern, economy] of [
    [PRIMARY_ACTION, "action"],
    [PRIMARY_BONUS, "bonus_action"],
    [PRIMARY_REACTION, "reaction"],
  ]) {
    const found = pattern.exec(text);
    if (found) matches.push([found.index, economy]);
  }
  if (matches.length) {
    matches.sort((a, b) => a[0] - b[0]);
    return matches[0][1];
  }

  const lowered = `${name} ${text}`.toLowerCase();
  const bonusIdx = lowered.indexOf("bonus action");
  const actionMatch = /\baction\b/i.exec(lowered);
  const reactionIdx = lowered.indexOf("reaction");

  const indices = [];
  if (bonusIdx >= 0) indices.push([bonusIdx, "bonus_action"]);
  if (actionMatch) indices.push([actionMatch.index, "action"]);
  if (reactionIdx >= 0) indices.push([reactionIdx, "reaction"]);
  if (!indices.length) return null;

  indices.sort((a, b) => a[0] - b[0]);
  if (PRIMARY_ACTION.test(text)) return "action";
  return indices[0][1];
}
