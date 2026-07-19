/** Short how-to / definition copy for digital sheet chrome (5.5e / 2024). */

export const SHEET_SECTION_HINTS = {
  abilities:
    "Ability scores drive checks, saves, and combat math. The big number is the modifier; the small one is the score.",
  saves:
    "Saving throw bonuses. Filled dots mean proficiency. Passive senses sit under the saves list.",
  skills:
    "Skill bonuses. Cyan = proficient, magenta = expertise. Click a skill for a quick breakdown.",
  combat:
    "Core combat numbers and limited-use trackers. Hover the ⓘ icons for what each stat means. Click AC for the armor breakdown.",
  proficiencies: "Armor, weapons, tools, and languages you are trained with.",
  actions:
    "Attacks and special actions from your sheet. Use the filters to narrow by action type. Click a row for full rules text.",
  spells: "Prepared or known spells by level. Click a spell name for casting details and description.",
  inventory:
    "Gear from your sheet. Equipped items marked AC can change Armor Class. Toggle Equipped / Stowed as you change kit.",
  features:
    "Class, species, background, and feat features. Click a name for the full description.",
};

export const SHEET_STAT_HINTS = {
  prof:
    "Proficiency Bonus (PB). Added to attack rolls, saves, and checks you are proficient in. Scales with character level.",
  speed: "Walking speed in feet you can move on your turn (before dash or other movement options).",
  init:
    "Initiative bonus added when you roll for turn order. Usually Dexterity modifier; some feats (like Alert) add Proficiency Bonus too. Click for the current bonus.",
  ac:
    "Armor Class — how hard you are to hit. Built from armor, shield, Dexterity, and other bonuses. Click the number for a line-by-line breakdown.",
  hp:
    "Hit Points: current / maximum. Track damage and healing here. At 0 HP you fall unconscious and make death saving throws unless something else happens first.",
  hitDice:
    "Hit Dice (HD). Spent during a short rest to regain HP; usually recover on a long rest.",
  resources:
    "Limited-use features (Second Wind, Rage, Focus Points, spell slots, and similar). Use − / + as you spend or regain uses.",
};

const RESOURCE_HINTS = {
  "second wind":
    "Fighter feature: bonus action to regain hit points. Typically refreshes on a short or long rest.",
  rage: "Barbarian feature: enter a Rage for combat benefits. Uses usually refresh on a long rest.",
  "ki points":
    "Monk resource spent on monastic techniques. Often refreshes on a short or long rest.",
  "focus points":
    "Monk Focus Points spent on techniques. Often refreshes on a short or long rest.",
  "bardic inspiration":
    "Bard: grant inspiration dice to allies. Uses usually refresh on a long rest (or short rest at higher levels).",
  "channel divinity":
    "Cleric/Paladin Channel Divinity uses. Refresh on a short or long rest.",
  "lay on hands":
    "Paladin healing pool. Spend points to heal; typically refreshes on a long rest.",
  "wild shape": "Druid Wild Shape uses. Refresh rules depend on level and subclass.",
  "sorcery points": "Sorcerer metamagic and Font of Magic fuel. Usually refresh on a long rest.",
  "superiority dice": "Battle Master maneuver dice. Usually refresh on a short or long rest.",
};

function formatRecharge(recharge) {
  if (!recharge) return null;
  const key = String(recharge).toLowerCase().replace(/_/g, " ");
  if (key.includes("short") && key.includes("long")) return "short or long rest";
  if (key.includes("short")) return "short rest";
  if (key.includes("long")) return "long rest";
  if (key.includes("dawn") || key.includes("day")) return "dawn / daily";
  return key;
}

export function resourceHint(resource) {
  if (!resource) return SHEET_STAT_HINTS.resources;
  const name = String(resource.name || "");
  const key = name.toLowerCase();
  for (const [needle, hint] of Object.entries(RESOURCE_HINTS)) {
    if (key.includes(needle)) {
      const recharge = formatRecharge(resource.recharge);
      return recharge ? `${hint} Tracker shows uses left (${recharge}).` : hint;
    }
  }
  if (/spell slot/i.test(name)) {
    return `${name}: expend a slot when you cast a spell of this level. Slots usually return on a long rest.`;
  }
  const recharge = formatRecharge(resource.recharge);
  const bits = [
    `${name} is a limited-use resource on your sheet.`,
    "Adjust with − / + as you spend or regain uses.",
  ];
  if (recharge) bits.push(`Typically refreshes on a ${recharge}.`);
  return bits.join(" ");
}

export const SENSE_HINTS = {
  PP: "Passive Perception — floor for noticing hidden creatures or clues without an active check.",
  Inv: "Passive Investigation — floor for noticing clues or inconsistencies without an active check.",
  Ins: "Passive Insight — floor for sensing motives without an active Insight check.",
};
