export const SRD_CATEGORY_LABELS = {
  spells: "Spells",
  monsters: "Monsters",
  magic_items: "Magic items",
  conditions: "Conditions",
  species: "Species",
  backgrounds: "Backgrounds",
  feats: "Feats",
  weapons: "Weapons",
  armor: "Armor",
  gear: "Gear",
  animals: "Animals",
  glossary: "Glossary",
  classes: "Classes",
  rules_sections: "Rules",
};

export function formatCategoryLabel(category) {
  if (!category) return "";
  return SRD_CATEGORY_LABELS[category] || String(category).replace(/_/g, " ");
}

export function formatSpellLevel(level) {
  if (level === 0) return "Cantrip";
  if (level != null) return `Lv ${level}`;
  return null;
}

export function parseLeadingSubtitle(text) {
  if (!text) return { subtitle: null, body: "" };
  const lines = String(text).split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("_") && first.endsWith("_")) {
    return {
      subtitle: first.slice(1, -1),
      body: lines.slice(1).join("\n").trim(),
    };
  }
  return { subtitle: null, body: String(text).trim() };
}

export function stripFieldLines(description, fields) {
  if (!description || !fields || typeof fields !== "object") return description || "";
  const fieldKeys = new Set(Object.keys(fields).map((key) => key.toLowerCase()));
  const lines = String(description).split("\n");
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (match && fieldKeys.has(match[1].trim().toLowerCase())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (!trimmed) {
        skipping = false;
        kept.push(line);
        continue;
      }
      if (/^[A-Z][^.].*\.\s/.test(trimmed) || /^As an?\b/i.test(trimmed)) {
        skipping = false;
      } else {
        continue;
      }
    }
    // SRD markdown field lines: **Label:** value
    const md = trimmed.match(/^\*\*(.+?):\*\*/);
    if (md && fieldKeys.has(md[1].trim().toLowerCase())) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function entryProse(entry) {
  const raw = entry?.description || entry?.desc || entry?.content || "";
  if (!raw) return "";

  let text = raw;
  if (entry.fields && typeof entry.fields === "object") {
    text = stripFieldLines(text, entry.fields) || text;
  }

  const { subtitle, body } = parseLeadingSubtitle(text);
  if (body) return body;
  if (subtitle && text !== raw) return "";
  return text.trim();
}

export function entrySummary(entry, category) {
  if (category === "spells") {
    return [formatSpellLevel(entry.level), entry.school, entry.casting_time]
      .filter(Boolean)
      .join(" · ");
  }
  if (category === "monsters") {
    const parts = [];
    const cr = entry.cr ?? entry.stat_block_json?.cr;
    if (cr != null && cr !== "" && String(cr).toLowerCase() !== "none") {
      parts.push(`CR ${cr}`);
    }
    if (entry.size) parts.push(entry.size);
    if (entry.type) parts.push(entry.type);
    if (entry.alignment) parts.push(entry.alignment);
    return parts.join(" · ");
  }
  if (category === "magic_items") {
    const { subtitle } = parseLeadingSubtitle(entry.description || "");
    return subtitle || entry.type_line || entry.rarity || entry.category || "";
  }
  if (category === "weapons") {
    return [entry.category, entry.damage_dice, entry.damage_type].filter(Boolean).join(" · ");
  }
  if (category === "armor") {
    const ac =
      entry.ac_base != null
        ? `AC ${entry.ac_base}${entry.ac_add_dexmod ? " + Dex" : ""}`
        : entry.ac_text;
    return [entry.category, ac].filter(Boolean).join(" · ");
  }
  if (category === "gear") {
    return entry.cost || "";
  }
  if (category === "feats") {
    const { subtitle } = parseLeadingSubtitle(entry.description || "");
    return subtitle || entry.fields?.Category || entry.category || "";
  }
  if (category === "glossary") {
    return entry.tag || "";
  }
  if (category === "conditions") {
    return entry.key || "Condition";
  }
  if (category === "backgrounds") {
    return (
      entry.fields?.["Skill Proficiencies"] ||
      entry.skill_proficiencies ||
      entry.feat ||
      ""
    );
  }
  if (category === "species") {
    return entry.fields?.Size || entry.fields?.["Creature Type"] || "";
  }
  if (category === "animals") {
    return "Animal stat block";
  }
  if (category === "classes") {
    return "Class rules";
  }
  if (category === "rules_sections" && entry.document) {
    return entry.document;
  }
  return entry.tag || entry.category || "";
}
