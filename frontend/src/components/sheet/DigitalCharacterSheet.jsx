import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
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
  SHEET_SECTION_HINTS,
  SHEET_STAT_HINTS,
} from "../../lib/sheetHints";
import { InfoTooltip } from "../ui/InfoTooltip";
import { AbilityScoresGrid } from "./AbilityScoresGrid";

const ACTION_FILTERS = [
  { id: "all", label: "All" },
  { id: "attack", label: "Attack" },
  { id: "action", label: "Action" },
  { id: "bonus_action", label: "Bonus" },
  { id: "reaction", label: "Reaction" },
  { id: "limited_use", label: "Limited" },
];

const ACTION_TYPE_LABELS = {
  action: "Action",
  bonus_action: "Bonus",
  reaction: "Reaction",
  magic_action: "Magic",
};

function SheetSection({ title, hint, children, className = "" }) {
  return (
    <section
      className={`rounded-sm border border-zinc-800/90 bg-zinc-950/60 ${className}`}
    >
      {title && (
        <header className="flex items-center gap-1 border-b border-zinc-800/80 px-2 py-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
            {title}
          </h3>
          <InfoTooltip text={hint} label={`About ${title}`} />
        </header>
      )}
      <div className="p-2">{children}</div>
    </section>
  );
}

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

function StatPill({ label, value, onClick, accent, hint }) {
  const labelRow = (
    <p className="flex items-center justify-center gap-0.5 text-[9px] font-black uppercase text-zinc-600">
      <span>{label}</span>
      {hint ? <InfoTooltip text={hint} label={`About ${label}`} /> : null}
    </p>
  );
  const valueRow = (
    <p className="text-sm font-black tabular-nums leading-tight text-starlight">{value}</p>
  );
  const shellClass = `rounded-sm border px-1.5 py-1 text-center ${
    accent ? "border-neon-magenta/50 bg-neon-magenta/5" : "border-zinc-800"
  } ${onClick ? "hover:border-neon-cyan/50" : ""}`;

  if (!onClick) {
    return (
      <div className={shellClass}>
        {labelRow}
        {valueRow}
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {labelRow}
      <button
        type="button"
        onClick={onClick}
        className="w-full text-center hover:text-neon-cyan"
        title={`Open ${label} details`}
      >
        {valueRow}
      </button>
    </div>
  );
}

function SavesGrid({ sheet, onShowDetail }) {
  return (
    <div className="grid grid-cols-2 gap-x-1.5 gap-y-0">
      {sheet.saving_throws?.map((save) => {
        const bonus = resolveSaveBonus(save, sheet);
        return (
          <button
            key={save.ability}
            type="button"
            onClick={() =>
              onShowDetail({
                title: `${ABILITY_LABELS[save.ability]} save`,
                body: `Bonus ${formatModifier(bonus)}${save.proficient ? " (proficient)" : ""}`,
              })
            }
            className="flex items-center justify-between gap-1 rounded-sm px-0.5 py-0.5 text-left hover:bg-zinc-900"
          >
            <span className="flex items-center gap-1 text-[11px] text-zinc-400">
              <span
                className={`h-1.5 w-1.5 rounded-full border ${
                  save.proficient ? "border-neon-cyan bg-neon-cyan" : "border-zinc-600"
                }`}
              />
              {ABILITY_LABELS[save.ability]}
            </span>
            <span className="text-[11px] font-black tabular-nums text-starlight">
              {formatModifier(bonus)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SensesInline({ sheet }) {
  const senses = [
    { short: "PP", value: resolvePassiveSkill(sheet, "Perception") },
    { short: "Inv", value: resolvePassiveSkill(sheet, "Investigation") },
    { short: "Ins", value: resolvePassiveSkill(sheet, "Insight") },
  ];
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]">
      {senses.map((sense) => (
        <span key={sense.short} className="inline-flex items-center gap-0.5 text-zinc-500">
          <span className="inline-flex items-center gap-0.5">
            {sense.short}
            <InfoTooltip text={SENSE_HINTS[sense.short]} label={`About ${sense.short}`} />
          </span>
          <span className="font-black tabular-nums text-starlight">{sense.value ?? "—"}</span>
        </span>
      ))}
    </div>
  );
}

function SkillsGrid({ sheet, onShowDetail }) {
  const skills = sheet.skills || [];
  return (
    <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 xl:grid-cols-3">
      {skills.map((skill) => {
        const bonus = resolveSkillBonus(skill, sheet);
        const marked = skill.expertise || skill.proficient;
        return (
          <button
            key={skill.name}
            type="button"
            onClick={() =>
              onShowDetail({
                title: skill.name,
                body: `${ABILITY_LABELS[skill.ability]} · ${formatModifier(bonus)}${
                  skill.proficient ? " (proficient)" : ""
                }`,
              })
            }
            className="flex items-center gap-1 rounded-sm px-0.5 py-px text-left hover:bg-zinc-900"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full border ${
                skill.expertise
                  ? "border-neon-magenta bg-neon-magenta"
                  : skill.proficient
                    ? "border-neon-cyan bg-neon-cyan"
                    : "border-zinc-700"
              }`}
            />
            <span className="w-6 shrink-0 text-[9px] font-mono uppercase text-zinc-600">
              {ABILITY_LABELS[skill.ability]}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{skill.name}</span>
            <span
              className={`shrink-0 text-[11px] font-black tabular-nums ${
                marked ? "text-starlight" : "text-zinc-500"
              }`}
            >
              {formatModifier(bonus)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CombatStrip({
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

  const updateResource = (index, current) => {
    if (!onSheetChange) return;
    const next = resources.map((entry, i) => (i === index ? { ...entry, current } : entry));
    onSheetChange({ ...sheet, resources: next }, { immediate: true });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {readOnly || !onSheetChange ? (
          <StatPill
            label="Prof"
            value={prof != null ? `+${prof}` : "—"}
            hint={SHEET_STAT_HINTS.prof}
          />
        ) : (
          <label className="rounded-sm border border-zinc-800 px-1.5 py-1 text-center focus-within:border-neon-cyan/50">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-black uppercase text-zinc-600">
              <span>Prof</span>
              <InfoTooltip text={SHEET_STAT_HINTS.prof} label="About Proficiency Bonus" />
            </p>
            <input
              type="number"
              min={2}
              max={12}
              value={sheet.proficiency_bonus ?? prof ?? ""}
              onChange={(e) => onSheetChange(setProficiencyBonus(sheet, e.target.value))}
              className="w-full min-w-0 border-0 bg-transparent text-center text-sm font-black tabular-nums text-starlight focus:outline-none"
            />
          </label>
        )}
        {readOnly || !onSheetChange ? (
          <StatPill
            label="Speed"
            value={displaySpeed != null ? `${displaySpeed}` : "—"}
            hint={SHEET_STAT_HINTS.speed}
          />
        ) : (
          <label className="rounded-sm border border-zinc-800 px-1.5 py-1 text-center focus-within:border-neon-cyan/50">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-black uppercase text-zinc-600">
              <span>Speed</span>
              <InfoTooltip text={SHEET_STAT_HINTS.speed} label="About Speed" />
            </p>
            <input
              type="number"
              min={0}
              value={sheet.speed ?? displaySpeed ?? ""}
              onChange={(e) => onSheetChange(setSheetSpeed(sheet, e.target.value))}
              className="w-full min-w-0 border-0 bg-transparent text-center text-sm font-black tabular-nums text-starlight focus:outline-none"
            />
          </label>
        )}
        <StatPill
          label="Init"
          value={formatModifier(init)}
          hint={SHEET_STAT_HINTS.init}
          onClick={() =>
            onShowDetail({ title: "Initiative", body: `Bonus ${formatModifier(init)}` })
          }
        />
        <StatPill
          label="AC"
          value={combat.ac ?? "—"}
          accent
          hint={SHEET_STAT_HINTS.ac}
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
        />
      </div>

      <div className="flex items-center justify-center gap-2 rounded-sm border border-starlight/25 px-2 py-1.5">
        <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase text-zinc-600">
          HP
          <InfoTooltip text={SHEET_STAT_HINTS.hp} label="About Hit Points" />
        </span>
        {readOnly ? (
          <span className="text-sm font-black tabular-nums text-starlight">
            {character.hp ?? "—"}
            <span className="text-zinc-600"> / </span>
            <span className="text-zinc-400">{character.max_hp ?? "—"}</span>
          </span>
        ) : (
          <>
            <input
              type="number"
              min="0"
              value={character.hp ?? ""}
              onChange={(e) =>
                onCombatChange({
                  hp: e.target.value === "" ? null : parseInt(e.target.value, 10),
                })
              }
              className="w-12 border border-zinc-700 bg-black text-center text-sm font-black text-starlight"
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
              className="w-12 border border-zinc-700 bg-black text-center text-sm font-black text-zinc-400"
              aria-label="Maximum hit points"
            />
          </>
        )}
      </div>

      {resources.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Resources
            </p>
            <InfoTooltip text={SHEET_STAT_HINTS.resources} label="About resources" />
          </div>
          <div className="max-h-28 space-y-0.5 overflow-y-auto pr-0.5">
            {resources.map((resource, index) => (
              <div
                key={resource.id || index}
                className="flex items-center justify-between gap-1.5 text-[11px]"
              >
                <span className="inline-flex min-w-0 items-center gap-0.5 truncate text-zinc-400">
                  <span className="truncate">{resource.name}</span>
                  <InfoTooltip
                    text={resourceHint(resource)}
                    label={`About ${resource.name}`}
                  />
                </span>
                {readOnly ? (
                  <span className="font-black tabular-nums text-starlight">
                    {resource.current ?? "—"}/{resource.max ?? "—"}
                  </span>
                ) : (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateResource(index, Math.max(0, (resource.current ?? 0) - 1))
                      }
                      className="h-5 w-5 border border-zinc-700 text-xs text-zinc-500 hover:border-neon-cyan hover:text-starlight"
                      aria-label={`Spend ${resource.name}`}
                    >
                      −
                    </button>
                    <span className="w-9 text-center font-black tabular-nums text-starlight">
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
                      className="h-5 w-5 border border-zinc-700 text-xs text-zinc-500 hover:border-neon-cyan hover:text-starlight"
                      aria-label={`Regain ${resource.name}`}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleProficiencies({ sheet }) {
  const [open, setOpen] = useState(false);
  const groups = [
    { label: "Armor", items: sheet.proficiencies?.armor },
    { label: "Weapons", items: sheet.proficiencies?.weapons },
    { label: "Tools", items: sheet.proficiencies?.tools },
    { label: "Languages", items: sheet.proficiencies?.languages },
  ].filter((group) => group.items?.length);

  if (!groups.length) return null;

  return (
    <div className="rounded-sm border border-zinc-800/90 bg-zinc-950/40">
      <div className="flex w-full items-center gap-1 px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Proficiencies & training
        </button>
        <InfoTooltip text={SHEET_SECTION_HINTS.proficiencies} label="About proficiencies" />
      </div>
      {open && (
        <div className="space-y-0.5 border-t border-zinc-800/80 px-2 py-1.5">
          {groups.map((group) => (
            <p key={group.label} className="text-[11px] leading-snug text-zinc-500">
              <span className="font-black uppercase text-zinc-600">{group.label}: </span>
              {group.items.join(", ")}
            </p>
          ))}
        </div>
      )}
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
    () => catalog.actions.filter((action) => action.category !== "attack" && action.category !== "weapon"),
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
    (showAttacks && attacks.length > 0) ||
    filteredActions.length > 0 ||
    showStandards;
  const showEmptyMessage = !hasContent;

  return (
    <div className="space-y-2">
      {showAttacks && attacks.length > 0 && (
        <div className="overflow-x-auto rounded-sm border border-zinc-800">
          <table className="w-full min-w-[480px] text-left text-[11px]">
            <thead className="bg-zinc-900/80">
              <tr className="text-[9px] uppercase text-zinc-600">
                <th className="px-2 py-1 font-black">Name</th>
                <th className="px-2 py-1 font-black">Range</th>
                <th className="px-2 py-1 font-black">Hit</th>
                <th className="px-2 py-1 font-black">Damage</th>
                <th className="px-2 py-1 font-black">Notes</th>
              </tr>
            </thead>
            <tbody>
              {attacks.map((attack) => (
                <tr key={attack.id} className="border-t border-zinc-900/80">
                  <td className="px-2 py-1 font-semibold text-neon-cyan">{attack.name}</td>
                  <td className="px-2 py-1 text-zinc-500">{attack.range}</td>
                  <td className="px-2 py-1 font-black tabular-nums text-starlight">
                    {attack.toHit != null ? formatModifier(attack.toHit) : "—"}
                  </td>
                  <td className="px-2 py-1 text-zinc-300">{attack.damage || "—"}</td>
                  <td className="px-2 py-1 text-zinc-600">{attack.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showStandards && (
        <p className="text-[11px] leading-snug text-zinc-600">
          <span className="font-black uppercase text-zinc-500">Standard actions: </span>
          {standardActions.map((action) => action.name).join(", ")}
        </p>
      )}

      {filteredActions.length > 0 && (
        <div className="divide-y divide-zinc-900/80 rounded-sm border border-zinc-800">
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
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-zinc-900/80"
            >
              <span className="truncate text-[11px] font-semibold text-starlight">
                {action.name}
              </span>
              <span className="shrink-0 text-[9px] font-black uppercase text-zinc-600">
                {ACTION_TYPE_LABELS[action.actionType] || "Action"}
              </span>
            </button>
          ))}
        </div>
      )}

      {showEmptyMessage && EMPTY_FILTER_MESSAGES[filter] && (
        <p className="text-[11px] leading-snug text-zinc-600">
          {EMPTY_FILTER_MESSAGES[filter]}
        </p>
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {!sheet.inventory?.length && (
        <p className="text-sm text-zinc-600 sm:col-span-2 xl:col-span-3 2xl:col-span-4">
          No gear on sheet yet.
        </p>
      )}
      {sheet.inventory?.map((item, index) => {
        const equipped = !!item.equipped;
        return (
          <div
            key={item.id || index}
            className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${
              equipped ? "border-starlight/30 bg-starlight/5" : "border-zinc-900"
            }`}
          >
            {readOnly ? (
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-black uppercase ${
                  equipped ? "bg-starlight/20 text-starlight" : "text-zinc-600"
                }`}
              >
                {equipped ? "Equipped" : "Stowed"}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => updateItem(index, { equipped: !equipped })}
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-black uppercase ${
                  equipped
                    ? "bg-starlight text-black"
                    : "border border-zinc-700 text-zinc-500"
                }`}
              >
                {equipped ? "Equipped" : "Stowed"}
              </button>
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{item.name}</span>
            {itemAffectsAc(item) && (
              <span className="text-xs font-black text-neon-cyan">AC</span>
            )}
            <span className="text-sm tabular-nums text-zinc-600">×{item.qty ?? 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function SpellsBlock({ sheet, onShowDetail }) {
  const spells = sheet.spells || [];
  if (!spells.length) {
    return <p className="text-sm text-zinc-600">No spells parsed yet.</p>;
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
    <div className="space-y-3">
      {levels.map((level) => (
        <div key={level} className="rounded-sm border border-zinc-800">
          <p className="border-b border-zinc-900 px-3 py-2 text-xs font-black uppercase text-zinc-500">
            {Number(level) === 0 ? "Cantrips" : `Level ${level}`}
          </p>
          <div className="divide-y divide-zinc-900/80">
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
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-zinc-900/80"
              >
                <span className="truncate text-[11px] font-semibold text-starlight">
                  {spell.name}
                </span>
                {spell.concentration && (
                  <span className="shrink-0 text-[10px] font-black uppercase text-neon-magenta">
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
    <div className="divide-y divide-zinc-900/80 rounded-sm border border-zinc-800">
      {!sheet.features?.length && (
        <p className="px-3 py-2 text-sm text-zinc-600">No features parsed yet.</p>
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
          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-zinc-900/80"
        >
          <span className="truncate text-[11px] font-semibold text-starlight">
            {feat.name}
          </span>
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
  const [mainTab, setMainTab] = useState("actions");
  const [actionFilter, setActionFilter] = useState("all");
  const combat = resolveCombatStats(character, sheet);

  const subtitle = [
    character?.race,
    [character?.class_name, character?.level != null ? character.level : null]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  const mainTabs = [
    { id: "actions", label: "Actions", hint: SHEET_SECTION_HINTS.actions },
    { id: "spells", label: "Spells", hint: SHEET_SECTION_HINTS.spells },
    { id: "inventory", label: "Inventory", hint: SHEET_SECTION_HINTS.inventory },
    { id: "features", label: "Features", hint: SHEET_SECTION_HINTS.features },
  ];

  const activeTab = mainTabs.find((tab) => tab.id === mainTab) || mainTabs[0];

  return (
    <>
      <div className="w-full space-y-2 pb-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-800 pb-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black uppercase text-starlight">
              {character?.name || "Character"}
            </h2>
            {subtitle && (
              <p className="text-xs font-mono text-neon-cyan">{subtitle}</p>
            )}
            <p className="mt-0.5 text-[9px] font-mono text-zinc-600">
              ⓘ tips · click a row for full text
            </p>
          </div>
          {sheet.hit_dice && (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-600">
              HD {sheet.hit_dice}
              <InfoTooltip text={SHEET_STAT_HINTS.hitDice} label="About Hit Dice" />
            </span>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1 px-0.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-600">
              Ability scores
            </p>
            <InfoTooltip text={SHEET_SECTION_HINTS.abilities} label="About ability scores" />
          </div>
          <AbilityScoresGrid
            sheet={sheet}
            dense
            readOnly={readOnly}
            onShowDetail={setDetail}
            onChange={readOnly ? undefined : onSheetChange}
          />
        </div>

        <div className="grid gap-2 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <SheetSection title="Saves & senses" hint={SHEET_SECTION_HINTS.saves}>
              <SavesGrid sheet={sheet} onShowDetail={setDetail} />
              <div className="mt-1 border-t border-zinc-900 pt-1">
                <SensesInline sheet={sheet} />
              </div>
            </SheetSection>
          </div>

          <div className="lg:col-span-6">
            <SheetSection title="Skills" hint={SHEET_SECTION_HINTS.skills}>
              <SkillsGrid sheet={sheet} onShowDetail={setDetail} />
            </SheetSection>
          </div>

          <div className="lg:col-span-4">
            <SheetSection title="Combat" hint={SHEET_SECTION_HINTS.combat}>
              <CombatStrip
                character={character}
                sheet={sheet}
                combat={combat}
                onCombatChange={onCombatChange}
                onShowDetail={setDetail}
                onSheetChange={onSheetChange}
                readOnly={readOnly}
              />
            </SheetSection>
          </div>
        </div>

        <CollapsibleProficiencies sheet={sheet} />

        <div className="rounded-sm border border-zinc-800/90 bg-zinc-950/40">
          <div className="flex flex-wrap items-center gap-0.5 border-b border-zinc-800 px-1">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`px-3 py-1.5 text-[10px] font-black uppercase ${
                  mainTab === tab.id
                    ? "border-b-2 border-neon-cyan text-starlight"
                    : "text-zinc-600 hover:text-neon-cyan"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 px-1.5">
              <InfoTooltip text={activeTab.hint} label={`About ${activeTab.label}`} />
            </div>
          </div>

          {mainTab === "actions" && (
            <div className="flex flex-wrap gap-1 border-b border-zinc-900/80 px-2 py-1.5">
              {ACTION_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActionFilter(filter.id)}
                  className={`rounded-sm px-2 py-0.5 text-[10px] font-black uppercase ${
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

          <div className="p-2">
            {mainTab === "actions" && (
              <ActionsPanel sheet={sheet} filter={actionFilter} onShowDetail={setDetail} />
            )}
            {mainTab === "spells" && (
              <SpellsBlock sheet={sheet} onShowDetail={setDetail} />
            )}
            {mainTab === "inventory" && (
              <InventoryBlock sheet={sheet} onSheetChange={onSheetChange} readOnly={readOnly} />
            )}
            {mainTab === "features" && (
              <FeaturesBlock sheet={sheet} onShowDetail={setDetail} />
            )}
          </div>
        </div>
      </div>
      <DetailPanel detail={detail} onClose={() => setDetail(null)} />
    </>
  );
}
