import { MarkdownRenderer } from "./MarkdownRenderer";
import { isMonsterEntry, MonsterStatBlock } from "./MonsterStatBlock";
import { entryProse, formatSpellLevel, parseLeadingSubtitle } from "../lib/srdEntryFormat";

function MetaRow({ label, value }) {
  if (value == null || value === "") return null;
  const display = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value);
  if (!display) return null;
  return (
    <div className="flex gap-2 font-mono text-xs leading-relaxed">
      <dt className="shrink-0 text-ink-faint">{label}:</dt>
      <dd className="text-starlight">{display}</dd>
    </div>
  );
}

function MetaPanel({ header, headerClassName = "text-neon-cyan", rows = [], children }) {
  const visibleRows = rows.filter(([, value]) => value != null && value !== "");
  if (!header && !visibleRows.length && !children) return null;
  return (
    <div className="space-y-2 border-b border-border/60 pb-3">
      {header && <p className={`text-xs font-black uppercase ${headerClassName}`}>{header}</p>}
      {visibleRows.length > 0 && (
        <dl className="space-y-1">
          {visibleRows.map(([label, value]) => (
            <MetaRow key={label} label={label} value={value} />
          ))}
        </dl>
      )}
      {children}
    </div>
  );
}

function FieldsPanel({ fields, header = "Details" }) {
  if (!fields || typeof fields !== "object" || !Object.keys(fields).length) return null;
  return (
    <MetaPanel
      header={header}
      rows={Object.entries(fields).map(([label, value]) => [label, value])}
    />
  );
}

function SpellEntryMeta({ entry }) {
  const school =
    entry.school && !/^(cantrip|level\s*\d+)$/i.test(String(entry.school).trim())
      ? entry.school
      : null;
  const header = [
    formatSpellLevel(entry.level) || (entry.level != null ? `Level ${entry.level}` : null),
    school,
    entry.classes ? `(${entry.classes})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const rows = [
    ["Casting Time", entry.casting_time],
    ["Range", entry.range],
    ["Components", entry.components],
    ["Duration", entry.duration],
  ];
  if (entry.ritual === "yes" || entry.ritual === true) rows.push(["Ritual", "Yes"]);
  if (entry.concentration === "yes" || entry.concentration === true) {
    rows.push(["Concentration", "Yes"]);
  }

  return <MetaPanel header={header} rows={rows} />;
}

function WeaponEntryMeta({ entry }) {
  return (
    <MetaPanel
      header={entry.category || "Weapon"}
      headerClassName="text-neon-magenta"
      rows={[
        ["Cost", entry.cost],
        ["Damage", entry.damage_dice && entry.damage_type ? `${entry.damage_dice} ${entry.damage_type}` : entry.damage_dice],
        ["Properties", entry.properties],
        ["Mastery", entry.mastery],
        ["Weight", entry.weight],
      ]}
    />
  );
}

function ArmorEntryMeta({ entry }) {
  let ac = null;
  if (entry.ac_base != null) {
    ac = String(entry.ac_base);
    if (entry.ac_add_dexmod) {
      ac += " + Dex modifier";
      if (entry.ac_cap_dexmod != null) ac += ` (max ${entry.ac_cap_dexmod})`;
    }
  } else if (entry.ac_text) {
    ac = entry.ac_text;
  } else if (entry.category === "Shield") {
    ac = `+${entry.ac_base}`;
  }

  return (
    <MetaPanel
      header={entry.category || "Armor"}
      headerClassName="text-neon-magenta"
      rows={[
        ["Armor Class", ac],
        ["Cost", entry.cost],
        ["Strength", entry.strength_requirement != null ? `Str ${entry.strength_requirement}` : null],
        ["Stealth", entry.stealth_disadvantage ? "Disadvantage" : null],
        ["Weight", entry.weight],
      ]}
    />
  );
}

function MagicItemEntryMeta({ entry }) {
  const { subtitle } = parseLeadingSubtitle(entry.description || "");
  const header = subtitle || entry.type_line || entry.rarity || entry.type || null;
  return (
    <>
      {header && <MetaPanel header={header} headerClassName="text-neon-magenta" />}
      <FieldsPanel fields={entry.fields} />
    </>
  );
}

function FeatEntryMeta({ entry }) {
  const { subtitle } = parseLeadingSubtitle(entry.description || "");
  const header = subtitle || entry.fields?.Category || null;
  return (
    <>
      {header && <MetaPanel header={header} headerClassName="text-accent" />}
      <FieldsPanel
        fields={
          entry.fields
            ? Object.fromEntries(Object.entries(entry.fields).filter(([key]) => key !== "Category"))
            : null
        }
      />
    </>
  );
}

function GlossaryEntryMeta({ entry }) {
  if (!entry.tag) return null;
  return <MetaPanel header={entry.tag} headerClassName="text-plasma" />;
}

function ConditionEntryMeta({ entry }) {
  if (!entry.tag) return null;
  return <MetaPanel header={entry.tag} headerClassName="text-plasma" />;
}

function GearEntryMeta({ entry }) {
  return (
    <MetaPanel
      header="Adventuring Gear"
      rows={[
        ["Cost", entry.cost],
        ["Category", entry.category],
      ]}
    />
  );
}

function BackgroundEntryMeta({ entry }) {
  const fields =
    entry.fields && Object.keys(entry.fields).length
      ? entry.fields
      : {
          ...(entry.ability_scores ? { "Ability Scores": entry.ability_scores } : {}),
          ...(entry.feat ? { Feat: entry.feat } : {}),
          ...(entry.skill_proficiencies
            ? { "Skill Proficiencies": entry.skill_proficiencies }
            : {}),
          ...(entry.tool_proficiency ? { "Tool Proficiency": entry.tool_proficiency } : {}),
          ...(entry.equipment ? { Equipment: entry.equipment } : {}),
        };
  return <FieldsPanel fields={fields} header="Background" />;
}

function SpeciesEntryMeta({ entry }) {
  return <FieldsPanel fields={entry.fields} header="Species" />;
}

function RulesSectionEntryMeta({ entry }) {
  if (!entry.document) return null;
  return <MetaPanel header={entry.document} headerClassName="text-ink-muted" />;
}

function isSpellEntry(entry) {
  return Boolean(entry?.school != null && (entry.casting_time != null || entry.components != null));
}

function isWeaponEntry(entry, category) {
  return category === "weapons" || (entry?.damage_dice != null && entry?.properties != null);
}

function isArmorEntry(entry, category) {
  return category === "armor" || entry?.ac_base != null || entry?.ac_text != null;
}

function normalizeMarkdown(content) {
  if (!content) return "";
  return String(content).replace(/<br\s*\/?>/gi, "\n").replace(/<hr\s*\/?>/gi, "\n---\n");
}

function EntryProse({ entry }) {
  const prose = normalizeMarkdown(entryProse(entry));
  if (!prose) return null;
  return <MarkdownRenderer content={prose} />;
}

export function SrdEntryDetail({ entry, category }) {
  if (!entry) return null;

  if (isMonsterEntry(entry)) {
    return <MonsterStatBlock monster={entry} />;
  }

  return (
    <div className="space-y-4">
      {isSpellEntry(entry) && <SpellEntryMeta entry={entry} />}
      {isWeaponEntry(entry, category) && <WeaponEntryMeta entry={entry} />}
      {isArmorEntry(entry, category) && !isWeaponEntry(entry, category) && (
        <ArmorEntryMeta entry={entry} />
      )}
      {category === "magic_items" && <MagicItemEntryMeta entry={entry} />}
      {category === "feats" && <FeatEntryMeta entry={entry} />}
      {category === "glossary" && <GlossaryEntryMeta entry={entry} />}
      {category === "conditions" && <ConditionEntryMeta entry={entry} />}
      {category === "gear" && <GearEntryMeta entry={entry} />}
      {category === "backgrounds" && <BackgroundEntryMeta entry={entry} />}
      {category === "species" && <SpeciesEntryMeta entry={entry} />}
      {category === "rules_sections" && <RulesSectionEntryMeta entry={entry} />}
      {category === "classes" && (
        <MetaPanel header="Character Class" headerClassName="text-starlight" />
      )}
      {category === "animals" && (
        <MetaPanel header="Animal" headerClassName="text-neon-cyan" />
      )}

      {!isMonsterEntry(entry) && <EntryProse entry={entry} />}
    </div>
  );
}
