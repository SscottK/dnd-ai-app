/** Short how-to / definition copy for digital sheet chrome (5.5e / 2024). */

export const SHEET_SECTION_HINTS = {
  abilities:
    "Ability scores drive checks, saves, and combat math. The big number is the modifier; the small one is the score.",
  saves:
    "Saving throw bonuses. Filled dots mean proficiency.",
  senses:
    "Passive Perception, Investigation, and Insight — fixed scores, not proficiency trackers. Open Additional Sense Types for vision rules.",
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

/** Rules text for the Additional Sense Types side pane (5.5e / 2024). */
export const SENSES_PANEL = {
  passiveChecks:
    "A passive check is a special kind of ability check that doesn't involve any die rolls. Use 10 + all modifiers that normally apply to the check. If the character has Advantage on the check, add 5; with Disadvantage, subtract 5. Passive Perception, Investigation, and Insight on the sheet are already calculated that way.",
  specialSenses: [
    {
      name: "Blindsight",
      text: "A creature with Blindsight can perceive its surroundings without relying on sight, within a specific radius. Creatures without eyes (such as oozes) typically have this sense, as do creatures with echolocation or other extraordinary senses.",
    },
    {
      name: "Darkvision",
      text: "A creature with Darkvision can see in Dim Light within a specific radius as if it were Bright Light, and in Darkness as if it were Dim Light. The creature can't discern color in Darkness, only shades of gray.",
    },
    {
      name: "Tremorsense",
      text: "A creature with Tremorsense can detect and pinpoint the origin of vibrations within a specific radius, provided the creature and the source of the vibrations are in contact with the same surface (such as the ground, a wall, or a ceiling) or the same liquid. Tremorsense can't detect flying or incorporeal creatures.",
    },
    {
      name: "Truesight",
      text: "A creature with Truesight can see in normal and magical Darkness, see Invisible creatures and objects, automatically detect visual illusions and succeed on saving throws against them, and perceive the original form of a shapechanger or a creature transformed by magic. Furthermore, the creature can see into the Ethereal Plane within the same range.",
    },
  ],
};

/** Pull special sense lines mentioned on the sheet (features / notes), if any. */
export function collectCharacterSenseNotes(sheet) {
  const textChunks = [];
  for (const feat of sheet?.features || []) {
    textChunks.push(`${feat.name || ""} ${feat.description || ""}`);
  }
  if (sheet?.senses) {
    textChunks.push(String(sheet.senses));
  }
  const blob = textChunks.join("\n");
  const found = [];
  const patterns = [
    { name: "Darkvision", re: /darkvision[^\n.]{0,40}/gi },
    { name: "Blindsight", re: /blindsight[^\n.]{0,40}/gi },
    { name: "Tremorsense", re: /tremorsense[^\n.]{0,40}/gi },
    { name: "Truesight", re: /truesight[^\n.]{0,40}/gi },
  ];
  for (const { name, re } of patterns) {
    const match = blob.match(re);
    if (match?.[0]) {
      found.push({ name, detail: match[0].replace(/\s+/g, " ").trim() });
    }
  }
  return found;
}
