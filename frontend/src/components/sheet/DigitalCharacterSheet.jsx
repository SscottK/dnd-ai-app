import { useMemo, useState } from "react";
import { Heart, Shield, X } from "lucide-react";
import {
  collectSheetActionCatalog,
  resolveStandardActions,
} from "../../lib/combatActions";
import {
  ABILITY_LABELS,
  formatModifier,
  getInitiativeBonus,
  resolveProficiencyBonus,
  itemAffectsAc,
  resolveCombatStats,
  resolvePassiveSkill,
  resolveSaveBonus,
  resolveSkillBonus,
  setInventoryItemEquipped,
  setProficiencyBonus,
  setSheetSpeed,
} from "../../lib/characterSheet";
import {
  resourceHint,
  SENSE_HINTS,
  SENSES_PANEL,
  SHEET_SECTION_HINTS,
  SHEET_STAT_HINTS,
  collectCharacterSenseNotes,
} from "../../lib/sheetHints";
import { InfoTooltip } from "../ui/InfoTooltip";
import { AbilityScoresGrid } from "./AbilityScoresGrid";

const ACTION_FILTERS = [
  { id: "all", label: "All" },
  { id: "attack", label: "Attack" },
  { id: "action", label: "Action" },
  { id: "bonus_action", label: "Bonus Action" },
  { id: "reaction", label: "Reaction" },
  { id: "limited_use", label: "Limited Use" },
];

const ACTION_TYPE_LABELS = {
  action: "Action",
  bonus_action: "Bonus",
  reaction: "Reaction",
  magic_action: "Magic",
};

function DetailPanel({ detail, onClose }) {
  if (!detail) return null;
  return (
    <div className="fixed inset-0 z-[310] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close detail"
        onClick={onClose}
      />
      <div className="relative max-h-[70vh] w-full max-w-md overflow-y-auto rounded-sm border-2 border-neon-cyan bg-zinc-950 p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-black uppercase text-starlight">{detail.title}</h4>
            {detail.subtitle && (
              <p className="text-[10px] font-mono text-zinc-500">{detail.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-starlight"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-xs font-mono leading-relaxed text-zinc-300">
          {typeof detail.body === "string" ? <p>{detail.body}</p> : detail.body}
        </div>
      </div>
    </div>
  );
}

/** Beyond-style right drawer for longer rules (e.g. Additional Sense Types). */
function SheetSidePane({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[320] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label={`Close ${title}`}
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l-2 border-neon-cyan bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neon-cyan/30 px-4 py-3">
          <h3 className="text-sm font-black uppercase tracking-wide text-starlight">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-starlight"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </aside>
    </div>
  );
}

function ColumnPanel({ title, hint, children, className = "" }) {
  return (
    <section
      className={`flex min-h-0 flex-col border border-neon-cyan/30 bg-void-panel/50 ${className}`}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-neon-cyan/25 px-2.5 py-1.5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-neon-cyan">
          {title}
        </h3>
        <InfoTooltip text={hint} label={`About ${title}`} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">{children}</div>
    </section>
  );
}

function ListRow({ proficient, expertise, label, value, onClick, meta }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-zinc-900/80 py-1 text-left last:border-0 hover:bg-zinc-900/60"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
          expertise
            ? "border-neon-magenta bg-neon-magenta"
            : proficient
              ? "border-neon-cyan bg-neon-cyan"
              : "border-zinc-600"
        }`}
      />
      {meta ? (
        <span className="w-7 shrink-0 text-[9px] font-mono uppercase text-zinc-600">{meta}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{label}</span>
      <span
        className={`shrink-0 text-xs font-black tabular-nums ${
          proficient || expertise ? "text-starlight" : "text-zinc-500"
        }`}
      >
        {value}
      </span>
    </button>
  );
}

function SavesList({ sheet, onShowDetail }) {
  return (
    <div>
      {(sheet.saving_throws || []).map((save) => {
        const bonus = resolveSaveBonus(save, sheet);
        return (
          <ListRow
            key={save.ability}
            proficient={save.proficient}
            label={ABILITY_LABELS[save.ability]}
            value={formatModifier(bonus)}
            onClick={() =>
              onShowDetail({
                title: `${ABILITY_LABELS[save.ability]} save`,
                body: `Bonus ${formatModifier(bonus)}${save.proficient ? " (proficient)" : ""}`,
              })
            }
          />
        );
      })}
    </div>
  );
}

function SensesList({ sheet, onOpenSenseTypes }) {
  const senses = [
    { short: "PP", name: "Perception", value: resolvePassiveSkill(sheet, "Perception") },
    { short: "Inv", name: "Investigation", value: resolvePassiveSkill(sheet, "Investigation") },
    { short: "Ins", name: "Insight", value: resolvePassiveSkill(sheet, "Insight") },
  ];
  return (
    <div>
      {senses.map((sense) => (
        <div
          key={sense.short}
          className="flex items-center justify-between gap-2 border-b border-zinc-900/80 py-1 last:border-0"
        >
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-zinc-400">
            <span className="truncate">Passive {sense.name}</span>
            <InfoTooltip text={SENSE_HINTS[sense.short]} label={`About Passive ${sense.name}`} />
          </span>
          <span className="text-xs font-black tabular-nums text-starlight">
            {sense.value ?? "—"}
          </span>
        </div>
      ))}
      <button
        type="button"
        onClick={onOpenSenseTypes}
        className="mt-1.5 text-left text-[10px] font-black uppercase tracking-wide text-neon-cyan hover:text-starlight"
      >
        Additional Sense Types
      </button>
    </div>
  );
}

function SensesSidePaneBody({ sheet }) {
  const passives = [
    { label: "Passive Perception", value: resolvePassiveSkill(sheet, "Perception") },
    { label: "Passive Investigation", value: resolvePassiveSkill(sheet, "Investigation") },
    { label: "Passive Insight", value: resolvePassiveSkill(sheet, "Insight") },
  ];
  const characterSenses = collectCharacterSenseNotes(sheet);

  return (
    <div className="space-y-4 text-xs font-mono leading-relaxed text-zinc-300">
      <div className="space-y-1 border-b border-zinc-800 pb-3">
        {passives.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">{row.label}</span>
            <span className="font-black tabular-nums text-starlight">{row.value ?? "—"}</span>
          </div>
        ))}
      </div>

      {characterSenses.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neon-cyan">
            On this character
          </h4>
          <ul className="space-y-1.5">
            {characterSenses.map((entry) => (
              <li key={entry.name}>
                <span className="font-black text-neon-magenta">{entry.name}. </span>
                <span className="text-zinc-400">{entry.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neon-cyan">
          Passive Checks
        </h4>
        <p>{SENSES_PANEL.passiveChecks}</p>
      </div>

      <div>
        <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-neon-cyan">
          Special Senses
        </h4>
        <ul className="space-y-3">
          {SENSES_PANEL.specialSenses.map((sense) => (
            <li key={sense.name}>
              <p className="font-black text-neon-magenta">{sense.name}</p>
              <p className="mt-0.5 text-zinc-400">{sense.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SkillsList({ sheet, onShowDetail }) {
  return (
    <div>
      {(sheet.skills || []).map((skill) => {
        const bonus = resolveSkillBonus(skill, sheet);
        return (
          <ListRow
            key={skill.name}
            proficient={skill.proficient}
            expertise={skill.expertise}
            meta={ABILITY_LABELS[skill.ability]}
            label={skill.name}
            value={formatModifier(bonus)}
            onClick={() =>
              onShowDetail({
                title: skill.name,
                body: `${ABILITY_LABELS[skill.ability]} · ${formatModifier(bonus)}${
                  skill.expertise ? " (expertise)" : skill.proficient ? " (proficient)" : ""
                }`,
              })
            }
          />
        );
      })}
    </div>
  );
}

function ProficienciesBlock({ sheet }) {
  const groups = [
    { label: "Armor", items: sheet.proficiencies?.armor },
    { label: "Weapons", items: sheet.proficiencies?.weapons },
    { label: "Tools", items: sheet.proficiencies?.tools },
    { label: "Languages", items: sheet.proficiencies?.languages },
  ].filter((group) => group.items?.length);

  if (!groups.length) {
    return <p className="text-[11px] text-zinc-600">None listed.</p>;
  }

  return (
    <div className="space-y-1.5">
      {groups.map((group) => (
        <p key={group.label} className="text-[11px] leading-snug text-zinc-400">
          <span className="font-black uppercase text-zinc-500">{group.label}: </span>
          {group.items.join(", ")}
        </p>
      ))}
    </div>
  );
}

function MetricTile({ label, hint, children, className = "" }) {
  return (
    <div
      className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-sm border border-neon-cyan/35 bg-void-panel/80 px-2 py-1.5 ${className}`}
    >
      <div className="mb-0.5 flex items-center gap-0.5">
        <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <InfoTooltip text={hint} label={`About ${label}`} />
      </div>
      {children}
    </div>
  );
}

function CombatDashboard({
  character,
  sheet,
  combat,
  onCombatChange,
  onShowDetail,
  onSheetChange,
  readOnly = false,
}) {
  const prof = resolveProficiencyBonus(sheet, character?.level);
  const displaySpeed = sheet.speed ?? combat.speed;
  const init = getInitiativeBonus(sheet);
  const resources = sheet.resources || [];

  const bumpHp = (delta) => {
    if (readOnly || !onCombatChange) return;
    const current = Number(character.hp);
    if (!Number.isFinite(current)) return;
    const max = Number(character.max_hp);
    let next = current + delta;
    if (Number.isFinite(max)) next = Math.min(max, next);
    next = Math.max(0, next);
    onCombatChange({ hp: next });
  };

  const updateResource = (index, current) => {
    if (!onSheetChange) return;
    const next = resources.map((entry, i) => (i === index ? { ...entry, current } : entry));
    onSheetChange({ ...sheet, resources: next }, { immediate: true });
  };

  return (
    <div className="flex w-full flex-wrap items-stretch gap-1.5">
      <MetricTile label="Proficiency" hint={SHEET_STAT_HINTS.prof} className="w-[4.75rem] shrink-0">
        {readOnly || !onSheetChange ? (
          <p className="text-lg font-black tabular-nums text-starlight">
            {prof != null ? `+${prof}` : "—"}
          </p>
        ) : (
          <input
            type="number"
            min={2}
            max={12}
            value={sheet.proficiency_bonus ?? prof ?? ""}
            onChange={(e) => onSheetChange(setProficiencyBonus(sheet, e.target.value))}
            className="w-12 border-0 bg-transparent text-center text-lg font-black tabular-nums text-starlight focus:outline-none"
            aria-label="Proficiency bonus"
          />
        )}
      </MetricTile>

      <MetricTile label="Walking" hint={SHEET_STAT_HINTS.speed} className="w-[4.75rem] shrink-0">
        {readOnly || !onSheetChange ? (
          <p className="text-lg font-black tabular-nums text-starlight">
            {displaySpeed != null ? displaySpeed : "—"}
            <span className="ml-0.5 text-[9px] font-bold text-zinc-500">ft.</span>
          </p>
        ) : (
          <div className="flex items-baseline justify-center gap-0.5">
            <input
              type="number"
              min={0}
              value={sheet.speed ?? displaySpeed ?? ""}
              onChange={(e) => onSheetChange(setSheetSpeed(sheet, e.target.value))}
              className="w-12 border-0 bg-transparent text-center text-lg font-black tabular-nums text-starlight focus:outline-none"
              aria-label="Speed"
            />
            <span className="text-[9px] font-bold text-zinc-500">ft.</span>
          </div>
        )}
      </MetricTile>

      <button
        type="button"
        onClick={() =>
          onShowDetail({ title: "Initiative", body: `Bonus ${formatModifier(init)}` })
        }
        className="relative flex min-h-[4.5rem] w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-sm border border-neon-cyan/35 bg-void-panel/80 px-1.5 py-1.5 hover:border-neon-cyan"
        title="Open initiative details"
      >
        <div className="mb-0.5 flex items-center gap-0.5">
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">
            Init
          </span>
          <InfoTooltip text={SHEET_STAT_HINTS.init} label="About Initiative" />
        </div>
        <span
          className="flex h-10 w-10 items-center justify-center bg-zinc-950 text-base font-black tabular-nums text-starlight"
          style={{ clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" }}
        >
          {formatModifier(init)}
        </span>
      </button>

      <button
        type="button"
        onClick={() =>
          onShowDetail({
            title: "Armor Class",
            body: (
              <div className="space-y-1">
                {(combat.acLines || []).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <p className="font-black text-starlight">Total: {combat.ac}</p>
              </div>
            ),
          })
        }
        className="relative flex min-h-[4.5rem] w-[4.75rem] shrink-0 flex-col items-center justify-center rounded-sm border border-neon-cyan/35 bg-void-panel/80 px-1.5 py-1.5 hover:border-neon-cyan"
        title="Open AC breakdown"
      >
        <div className="mb-0.5 flex items-center gap-0.5">
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">AC</span>
          <InfoTooltip text={SHEET_STAT_HINTS.ac} label="About Armor Class" />
        </div>
        <span className="relative flex h-10 w-9 items-center justify-center">
          <Shield
            className="absolute inset-0 h-full w-full text-neon-magenta/80"
            strokeWidth={1.25}
          />
          <span className="relative z-10 text-base font-black tabular-nums text-starlight">
            {combat.ac ?? "—"}
          </span>
        </span>
      </button>

      <div className="flex min-h-[4.5rem] min-w-[14rem] flex-[1.4] flex-col justify-center rounded-sm border border-neon-cyan/35 bg-void-panel/80 px-2.5 py-1.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Heart className="h-3 w-3 text-danger" />
            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">
              Hit Points
            </span>
            <InfoTooltip text={SHEET_STAT_HINTS.hp} label="About Hit Points" />
          </div>
          {sheet.hit_dice && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-mono text-zinc-500">
              HD {sheet.hit_dice}
              <InfoTooltip text={SHEET_STAT_HINTS.hitDice} label="About Hit Dice" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && onCombatChange ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => bumpHp(-1)}
                className="border border-danger/50 px-2 py-0.5 text-[9px] font-black uppercase text-danger hover:bg-danger/10"
              >
                Damage
              </button>
              <input
                type="number"
                min="0"
                value={character.hp ?? ""}
                onChange={(e) =>
                  onCombatChange({
                    hp: e.target.value === "" ? null : parseInt(e.target.value, 10),
                  })
                }
                className="w-12 border border-zinc-700 bg-black text-center text-base font-black text-starlight"
                aria-label="Current hit points"
              />
              <span className="text-zinc-600">/</span>
              <input
                type="number"
                min="0"
                value={character.max_hp ?? ""}
                onChange={(e) =>
                  onCombatChange({
                    max_hp: e.target.value === "" ? null : parseInt(e.target.value, 10),
                  })
                }
                className="w-12 border border-zinc-700 bg-black text-center text-base font-black text-zinc-400"
                aria-label="Maximum hit points"
              />
              <button
                type="button"
                onClick={() => bumpHp(1)}
                className="border border-neon-cyan/50 px-2 py-0.5 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
              >
                Heal
              </button>
            </div>
          ) : (
            <p className="text-base font-black tabular-nums text-starlight">
              {character.hp ?? "—"}
              <span className="text-zinc-600"> / </span>
              <span className="text-zinc-400">{character.max_hp ?? "—"}</span>
            </p>
          )}
        </div>
      </div>

      {resources.length > 0 ? (
        <div className="flex min-h-[4.5rem] min-w-[10rem] flex-1 flex-col justify-center rounded-sm border border-neon-cyan/35 bg-void-panel/80 px-2.5 py-1.5">
          <div className="mb-1 flex items-center gap-0.5">
            <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">
              Resources
            </span>
            <InfoTooltip text={SHEET_STAT_HINTS.resources} label="About resources" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {resources.map((resource, index) => (
              <div
                key={resource.id || index}
                className="inline-flex items-center gap-1 rounded-sm border border-zinc-800 px-1.5 py-0.5 text-[11px]"
              >
                <span className="inline-flex max-w-[7rem] items-center gap-0.5 truncate text-zinc-400">
                  <span className="truncate">{resource.name}</span>
                  <InfoTooltip text={resourceHint(resource)} label={`About ${resource.name}`} />
                </span>
                {readOnly ? (
                  <span className="font-black tabular-nums text-starlight">
                    {resource.current ?? "—"}/{resource.max ?? "—"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateResource(index, Math.max(0, (resource.current ?? 0) - 1))
                      }
                      className="h-4 w-4 text-zinc-500 hover:text-starlight"
                      aria-label={`Spend ${resource.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-[2.25rem] text-center font-black tabular-nums text-starlight">
                      {resource.current ?? "—"}/{resource.max ?? "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateResource(
                          index,
                          Math.min(resource.max ?? 99, (resource.current ?? 0) + 1)
                        )
                      }
                      className="h-4 w-4 text-zinc-500 hover:text-starlight"
                      aria-label={`Regain ${resource.name}`}
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function filterCombatActions(actions, filter) {
  if (filter === "attack") return [];
  if (filter === "limited_use") return actions.filter((action) => action.resourceCost);
  if (filter === "all") return actions;
  return actions.filter((action) => action.actionType === filter);
}

const EMPTY_FILTER_MESSAGES = {
  reaction:
    "No reactions from this character's class, species, or feats. Opportunity Attack is still available when a hostile creature you can see leaves your reach.",
  bonus_action: "No bonus actions on sheet beyond what appears under All or Limited.",
  action: "No special actions on sheet — use the standard combat actions every character can take.",
  limited_use: "No limited-use actions on sheet.",
  attack: "No attacks on sheet.",
};

function ActionsPanel({ sheet, filter, onShowDetail }) {
  const catalog = useMemo(() => collectSheetActionCatalog(sheet), [sheet]);
  const attacks = catalog.attacks;
  const combatActions = useMemo(
    () =>
      catalog.actions.filter(
        (action) => action.category !== "attack" && action.category !== "weapon"
      ),
    [catalog.actions]
  );
  const filteredActions = useMemo(
    () => filterCombatActions(combatActions, filter),
    [combatActions, filter]
  );
  const standardActions = useMemo(
    () => resolveStandardActions(sheet, { filter, mode: "pc" }),
    [sheet, filter]
  );

  const showAttacks = filter === "all" || filter === "attack";
  const showStandards = standardActions.length > 0;
  const hasContent =
    (showAttacks && attacks.length > 0) || filteredActions.length > 0 || showStandards;
  const showEmptyMessage = !hasContent;

  return (
    <div className="space-y-2">
      {showAttacks && attacks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[11px]">
            <thead>
              <tr className="border-b border-neon-cyan/25 text-[9px] uppercase text-zinc-500">
                <th className="px-1.5 py-1 font-black">Attack</th>
                <th className="px-1.5 py-1 font-black">Range</th>
                <th className="px-1.5 py-1 font-black">Hit / DC</th>
                <th className="px-1.5 py-1 font-black">Damage</th>
                <th className="px-1.5 py-1 font-black">Notes</th>
              </tr>
            </thead>
            <tbody>
              {attacks.map((attack) => (
                <tr key={attack.id} className="border-b border-zinc-900/80">
                  <td className="px-1.5 py-1.5 font-semibold text-neon-cyan">{attack.name}</td>
                  <td className="px-1.5 py-1.5 text-zinc-500">{attack.range}</td>
                  <td className="px-1.5 py-1.5 font-black tabular-nums text-starlight">
                    {attack.toHit != null ? formatModifier(attack.toHit) : "—"}
                  </td>
                  <td className="px-1.5 py-1.5 text-zinc-300">{attack.damage || "—"}</td>
                  <td className="px-1.5 py-1.5 text-zinc-600">{attack.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showStandards && (
        <p className="text-[11px] leading-snug text-zinc-600">
          <span className="font-black uppercase text-zinc-500">Actions in Combat: </span>
          {standardActions.map((action) => action.name).join(", ")}
        </p>
      )}

      {filteredActions.length > 0 && (
        <div className="divide-y divide-zinc-900/80">
          {filteredActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() =>
                onShowDetail({
                  title: action.name,
                  subtitle: ACTION_TYPE_LABELS[action.actionType] || "Action",
                  body: action.description || action.detail || "No description.",
                })
              }
              className="flex w-full items-start justify-between gap-2 py-1.5 text-left hover:bg-zinc-900/60"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-starlight">{action.name}</p>
                {(action.description || action.detail) && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                    {action.description || action.detail}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[9px] font-black uppercase text-zinc-600">
                {ACTION_TYPE_LABELS[action.actionType] || "Action"}
              </span>
            </button>
          ))}
        </div>
      )}

      {showEmptyMessage && EMPTY_FILTER_MESSAGES[filter] && (
        <p className="text-[11px] leading-snug text-zinc-600">{EMPTY_FILTER_MESSAGES[filter]}</p>
      )}
    </div>
  );
}

function InventoryBlock({ sheet, onSheetChange, readOnly = false }) {
  const updateItem = (index, patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, "equipped")) {
      onSheetChange(setInventoryItemEquipped(sheet, index, patch.equipped), { immediate: true });
      return;
    }
    const next = sheet.inventory.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onSheetChange({ ...sheet, inventory: next });
  };

  return (
    <div className="space-y-1">
      {!sheet.inventory?.length && (
        <p className="text-[11px] text-zinc-600">No gear on sheet yet.</p>
      )}
      {sheet.inventory?.map((item, index) => {
        const equipped = !!item.equipped;
        return (
          <div
            key={item.id || index}
            className={`flex items-center gap-2 border-b border-zinc-900/80 py-1.5 last:border-0 ${
              equipped ? "bg-starlight/5" : ""
            }`}
          >
            {readOnly ? (
              <span
                className={`shrink-0 text-[9px] font-black uppercase ${
                  equipped ? "text-starlight" : "text-zinc-600"
                }`}
              >
                {equipped ? "Eq" : "—"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => updateItem(index, { equipped: !equipped })}
                className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                  equipped
                    ? "bg-starlight text-black"
                    : "border border-zinc-700 text-zinc-500"
                }`}
              >
                {equipped ? "Eq" : "Stow"}
              </button>
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{item.name}</span>
            {itemAffectsAc(item) && (
              <span className="text-[9px] font-black text-neon-cyan">AC</span>
            )}
            <span className="text-[11px] tabular-nums text-zinc-600">×{item.qty ?? 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpellsBlock({ sheet, onShowDetail }) {
  const spells = sheet.spells || [];
  if (!spells.length) {
    return <p className="text-[11px] text-zinc-600">No spells parsed yet.</p>;
  }

  const byLevel = spells.reduce((groups, spell) => {
    const level = spell.level ?? spell.spell_level ?? 0;
    const key = String(level);
    groups[key] = groups[key] || [];
    groups[key].push(spell);
    return groups;
  }, {});

  const levels = Object.keys(byLevel).sort((left, right) => Number(left) - Number(right));

  return (
    <div className="space-y-2">
      {levels.map((level) => (
        <div key={level}>
          <p className="border-b border-neon-cyan/20 pb-1 text-[9px] font-black uppercase text-zinc-500">
            {Number(level) === 0 ? "Cantrips" : `Level ${level}`}
          </p>
          <div>
            {byLevel[level].map((spell, index) => (
              <button
                key={spell.id || `${level}-${spell.name}-${index}`}
                type="button"
                onClick={() =>
                  onShowDetail({
                    title: spell.name,
                    subtitle: [
                      spell.school,
                      spell.casting_time || spell.action_type,
                      spell.range,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                    body: spell.description || "No description.",
                  })
                }
                className="flex w-full items-center justify-between gap-2 border-b border-zinc-900/80 py-1.5 text-left last:border-0 hover:bg-zinc-900/60"
              >
                <span className="truncate text-[11px] font-semibold text-starlight">
                  {spell.name}
                </span>
                {spell.concentration && (
                  <span className="shrink-0 text-[9px] font-black uppercase text-neon-magenta">
                    C
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeaturesBlock({ sheet, onShowDetail }) {
  return (
    <div>
      {!sheet.features?.length && (
        <p className="py-1 text-[11px] text-zinc-600">No features parsed yet.</p>
      )}
      {sheet.features?.map((feat, index) => (
        <button
          key={feat.id || index}
          type="button"
          onClick={() =>
            onShowDetail({
              title: feat.name,
              subtitle: feat.source || "Feature",
              body: feat.description || "No description.",
            })
          }
          className="flex w-full items-start justify-between gap-2 border-b border-zinc-900/80 py-1.5 text-left last:border-0 hover:bg-zinc-900/60"
        >
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-starlight">{feat.name}</p>
            {feat.description && (
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                {feat.description}
              </p>
            )}
          </div>
          {feat.source && (
            <span className="shrink-0 text-[9px] uppercase text-zinc-600">{feat.source}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function DigitalCharacterSheet({
  character,
  sheet,
  onSheetChange,
  onCombatChange,
  readOnly = false,
}) {
  const [detail, setDetail] = useState(null);
  const [sensesPaneOpen, setSensesPaneOpen] = useState(false);
  const [mainTab, setMainTab] = useState("actions");
  const [actionFilter, setActionFilter] = useState("all");
  const combat = resolveCombatStats(character, sheet);

  const subtitle = [
    character?.race,
    [character?.class_name, character?.level != null ? `Level ${character.level}` : null]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  const mainTabs = [
    { id: "actions", label: "Actions", hint: SHEET_SECTION_HINTS.actions },
    { id: "spells", label: "Spells", hint: SHEET_SECTION_HINTS.spells },
    { id: "inventory", label: "Inventory", hint: SHEET_SECTION_HINTS.inventory },
    { id: "features", label: "Features & Traits", hint: SHEET_SECTION_HINTS.features },
  ];

  const activeTab = mainTabs.find((tab) => tab.id === mainTab) || mainTabs[0];

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3 pb-2">
        {/* Identity */}
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-neon-cyan/25 pb-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black uppercase tracking-wide text-starlight">
              {character?.name || "Character"}
            </h2>
            {subtitle && <p className="text-xs font-mono text-neon-cyan">{subtitle}</p>}
          </div>
          <p className="text-[9px] font-mono text-zinc-600">ⓘ tips · click rows for full text</p>
        </div>

        {/* Top dashboard: abilities across top, combat across bottom */}
        <div className="space-y-3 border border-neon-cyan/30 bg-void-panel/40 p-2.5 sm:p-3">
          <div>
            <div className="mb-2 flex items-center gap-1">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neon-cyan">
                Ability Scores
              </p>
              <InfoTooltip text={SHEET_SECTION_HINTS.abilities} label="About ability scores" />
            </div>
            <AbilityScoresGrid
              sheet={sheet}
              variant="dashboard"
              readOnly={readOnly}
              onShowDetail={setDetail}
              onChange={readOnly ? undefined : onSheetChange}
            />
          </div>

          <div className="border-t border-neon-cyan/20 pt-3">
            <div className="mb-2 flex items-center gap-1">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neon-cyan">
                Combat
              </p>
              <InfoTooltip text={SHEET_SECTION_HINTS.combat} label="About combat" />
            </div>
            <CombatDashboard
              character={character}
              sheet={sheet}
              combat={combat}
              onCombatChange={onCombatChange}
              onShowDetail={setDetail}
              onSheetChange={onSheetChange}
              readOnly={readOnly}
            />
          </div>
        </div>

        {/* Three-column body */}
        <div className="grid min-h-[24rem] gap-2 lg:grid-cols-12 lg:items-stretch">
          <div className="flex flex-col gap-2 lg:col-span-3">
            <ColumnPanel title="Saving Throws" hint={SHEET_SECTION_HINTS.saves}>
              <SavesList sheet={sheet} onShowDetail={setDetail} />
            </ColumnPanel>
            <ColumnPanel title="Senses" hint={SHEET_SECTION_HINTS.senses}>
              <SensesList
                sheet={sheet}
                onOpenSenseTypes={() => setSensesPaneOpen(true)}
              />
            </ColumnPanel>
            <ColumnPanel
              title="Proficiencies & Languages"
              hint={SHEET_SECTION_HINTS.proficiencies}
              className="min-h-[6rem] flex-1"
            >
              <ProficienciesBlock sheet={sheet} />
            </ColumnPanel>
          </div>

          <div className="lg:col-span-3">
            <ColumnPanel
              title="Skills"
              hint={SHEET_SECTION_HINTS.skills}
              className="h-full min-h-[18rem]"
            >
              <SkillsList sheet={sheet} onShowDetail={setDetail} />
            </ColumnPanel>
          </div>

          <div className="flex min-h-[18rem] flex-col border border-neon-cyan/30 bg-void-panel/50 lg:col-span-6">
            <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-neon-cyan/25 px-1">
              {mainTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMainTab(tab.id)}
                  className={`px-2.5 py-2 text-[10px] font-black uppercase tracking-wide ${
                    mainTab === tab.id
                      ? "border-b-2 border-starlight text-starlight"
                      : "text-zinc-500 hover:text-neon-cyan"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto px-1">
                <InfoTooltip text={activeTab.hint} label={`About ${activeTab.label}`} />
              </div>
            </div>

            {mainTab === "actions" && (
              <div className="flex shrink-0 flex-wrap gap-1 border-b border-zinc-900 px-2 py-1.5">
                {ACTION_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActionFilter(filter.id)}
                    className={`rounded-sm px-2 py-0.5 text-[9px] font-black uppercase ${
                      actionFilter === filter.id
                        ? "bg-neon-cyan/15 text-neon-cyan"
                        : "text-zinc-600 hover:text-starlight"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {mainTab === "actions" && (
                <ActionsPanel sheet={sheet} filter={actionFilter} onShowDetail={setDetail} />
              )}
              {mainTab === "spells" && <SpellsBlock sheet={sheet} onShowDetail={setDetail} />}
              {mainTab === "inventory" && (
                <InventoryBlock
                  sheet={sheet}
                  onSheetChange={onSheetChange}
                  readOnly={readOnly}
                />
              )}
              {mainTab === "features" && (
                <FeaturesBlock sheet={sheet} onShowDetail={setDetail} />
              )}
            </div>
          </div>
        </div>
      </div>
      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
      <SheetSidePane
        open={sensesPaneOpen}
        title="Senses"
        onClose={() => setSensesPaneOpen(false)}
      >
        <SensesSidePaneBody sheet={sheet} />
      </SheetSidePane>
    </>
  );
}
