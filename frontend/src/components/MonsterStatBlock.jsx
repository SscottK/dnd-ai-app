import { MarkdownRenderer } from "./MarkdownRenderer";

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_LABELS = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}

function formatSigned(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number >= 0 ? `+${number}` : `${number}`;
}

function titleCase(value) {
  if (!value) return "";
  return String(value)
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatSpeed(speed) {
  if (speed == null) return null;
  if (typeof speed === "number") return `${speed} ft.`;
  const parts = [];
  for (const [mode, value] of Object.entries(speed)) {
    if (value == null) continue;
    parts.push(mode === "walk" ? `${value} ft.` : `${mode} ${value} ft.`);
  }
  return parts.length ? parts.join(", ") : null;
}

function formatSenses(senses) {
  if (!senses || typeof senses !== "object") return null;
  const parts = [];
  if (senses.darkvision) parts.push(`darkvision ${senses.darkvision} ft.`);
  if (senses.blindsight) parts.push(`blindsight ${senses.blindsight} ft.`);
  if (senses.tremorsense) parts.push(`tremorsense ${senses.tremorsense} ft.`);
  if (senses.truesight) parts.push(`truesight ${senses.truesight} ft.`);
  if (senses.passive_perception != null) {
    parts.push(`passive Perception ${senses.passive_perception}`);
  }
  return parts.length ? parts.join(", ") : null;
}

function formatList(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items.map((item) => titleCase(item)).join(", ");
}

function formatSkills(skills) {
  if (!skills || typeof skills !== "object") return null;
  return Object.entries(skills)
    .map(([name, bonus]) => `${titleCase(name)} ${formatSigned(bonus)}`)
    .join(", ");
}

function formatSavingThrows(saves) {
  if (!saves || typeof saves !== "object") return null;
  return Object.entries(saves)
    .map(([name, bonus]) => `${name.toUpperCase()} ${formatSigned(bonus)}`)
    .join(", ");
}

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 font-mono text-xs leading-relaxed">
      <span className="shrink-0 font-black uppercase text-ink-faint">{label}</span>
      <span className="text-ink-muted">{value}</span>
    </div>
  );
}

function CoreStat({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 font-mono text-xs">
      <dt className="shrink-0 text-ink-faint">{label}:</dt>
      <dd className="text-starlight">{value}</dd>
    </div>
  );
}

function AbilityScores({ scores }) {
  if (!scores || typeof scores !== "object") return null;
  return (
    <div className="grid grid-cols-6 gap-1 rounded border border-border/60 bg-black/30 p-2 text-center font-mono text-[10px] sm:text-xs">
      {ABILITY_ORDER.map((key) => {
        const score = scores[key];
        if (score == null) return null;
        return (
          <div key={key} className="min-w-0 px-0.5">
            <p className="font-black uppercase text-neon-cyan">{ABILITY_LABELS[key]}</p>
            <p className="text-starlight">{score}</p>
            <p className="text-ink-faint">({formatSigned(abilityModifier(score))})</p>
          </div>
        );
      })}
    </div>
  );
}

function NamedAbilities({ title, items, titleClassName = "text-neon-magenta" }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <section className="space-y-2">
      <h4 className={`text-[10px] font-black uppercase tracking-widest ${titleClassName}`}>{title}</h4>
      <ul className="space-y-2.5">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-muted">
            <span className="font-black text-starlight">{item.name}.</span>{" "}
            {item.description || item.desc || ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LegendaryActions({ legendary }) {
  if (!legendary) return null;
  if (Array.isArray(legendary)) {
    return <NamedAbilities title="Legendary Actions" items={legendary} titleClassName="text-accent" />;
  }

  const actions = legendary.actions || [];
  if (!legendary.description && !actions.length) return null;

  return (
    <section className="space-y-2">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-accent">Legendary Actions</h4>
      {legendary.description && (
        <p className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-muted">
          {legendary.description}
        </p>
      )}
      {actions.length > 0 && (
        <ul className="space-y-2.5">
          {actions.map((item, index) => (
            <li key={`${item.name}-${index}`} className="font-mono text-xs leading-relaxed text-ink-muted">
              <span className="font-black text-starlight">{item.name}.</span> {item.description || ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function normalizeMarkdown(content) {
  if (!content) return "";
  return String(content).replace(/<br\s*\/?>/gi, "\n").replace(/<hr\s*\/?>/gi, "\n---\n");
}

function hasMarkdownStatBlock(entry) {
  const text = entry?.content || entry?.description || "";
  return /\*\*AC\*\*/.test(text);
}

export function isMonsterEntry(entry) {
  if (entry?.stat_block_json && typeof entry.stat_block_json === "object") return true;
  return hasMarkdownStatBlock(entry);
}

export function MonsterStatBlock({ monster }) {
  if (!monster?.stat_block_json && hasMarkdownStatBlock(monster)) {
    const typeLine = [monster.size, titleCase(monster.type), monster.alignment]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="space-y-4">
        {typeLine && <p className="text-xs font-black uppercase text-neon-cyan">{typeLine}</p>}
        {monster.cr != null && monster.cr !== "" && (
          <p className="font-mono text-xs text-starlight">Challenge Rating {monster.cr}</p>
        )}
        <MarkdownRenderer content={normalizeMarkdown(monster.content || monster.description)} />
      </div>
    );
  }

  const stat = monster.stat_block_json || {};
  const typeLine = [monster.size, titleCase(monster.type || stat.type)].filter(Boolean).join(" ");
  const hitPoints =
    monster.hp_max != null
      ? `${monster.hp_max}${monster.hp_formula ? ` (${monster.hp_formula})` : ""}`
      : null;
  const initiative =
    monster.initiative_modifier != null
      ? `${formatSigned(monster.initiative_modifier)} (${10 + Number(monster.initiative_modifier)})`
      : null;

  return (
    <div className="space-y-4">
      <div className="space-y-1 border-b border-border/60 pb-3">
        {typeLine && <p className="text-xs font-black uppercase text-neon-cyan">{typeLine}</p>}
        {monster.cr != null && (
          <p className="font-mono text-xs text-starlight">Challenge Rating {monster.cr}</p>
        )}
        <dl className="mt-2 space-y-1">
          <CoreStat label="Armor Class" value={monster.armor_class} />
          <CoreStat label="Initiative" value={initiative} />
          <CoreStat label="Hit Points" value={hitPoints} />
          <CoreStat label="Speed" value={formatSpeed(stat.speed)} />
        </dl>
      </div>

      <AbilityScores scores={stat.ability_scores} />

      <div className="space-y-1 border-b border-border/60 pb-3">
        <MetaRow label="Saving Throws" value={formatSavingThrows(stat.saving_throws)} />
        <MetaRow label="Skills" value={formatSkills(stat.skills)} />
        <MetaRow label="Damage Resistances" value={formatList(stat.damage_resistances)} />
        <MetaRow label="Damage Vulnerabilities" value={formatList(stat.damage_vulnerabilities)} />
        <MetaRow label="Damage Immunities" value={formatList(stat.damage_immunities)} />
        <MetaRow label="Condition Immunities" value={formatList(stat.condition_immunities)} />
        <MetaRow label="Senses" value={formatSenses(stat.senses)} />
        <MetaRow label="Languages" value={formatList(stat.languages)} />
      </div>

      <NamedAbilities title="Traits" items={stat.traits} />
      <NamedAbilities title="Actions" items={stat.actions} titleClassName="text-neon-cyan" />
      <NamedAbilities title="Bonus Actions" items={stat.bonus_actions} />
      <NamedAbilities title="Reactions" items={stat.reactions} titleClassName="text-plasma" />
      <LegendaryActions legendary={stat.legendary_actions} />
    </div>
  );
}
