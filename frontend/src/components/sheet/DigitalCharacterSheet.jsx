import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import {
  collectSheetAttackEntries,
  collectSheetCombatActions,
  STANDARD_ACTIONS,
} from "../../lib/combatActions";
import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  getInitiativeBonus,
  getProficiencyBonus,
  itemAffectsAc,
  resolveCombatStats,
  resolvePassiveSkill,
  resolveSaveBonus,
  resolveSkillBonus,
  setInventoryItemEquipped,
} from "../../lib/characterSheet";

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

function SheetSection({ title, children, className = "", compact = false }) {
  return (
    <section
      className={`rounded-sm border border-zinc-800/90 bg-zinc-950/60 ${className}`}
    >
      {title && (
        <header className={`border-b border-zinc-800/80 px-3 ${compact ? "py-1.5" : "py-2"}`}>
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500 lg:text-sm">
            {title}
          </h3>
        </header>
      )}
      <div className={compact ? "p-3 lg:p-4" : "p-3.5 lg:p-4"}>{children}</div>
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

function AbilityRow({ sheet, onShowDetail }) {
  return (
    <div className="grid grid-cols-6 gap-2 lg:gap-3">
      {ABILITIES.map((key) => {
        const score = sheet.abilities?.[key];
        const mod = abilityModifier(score);
        return (
          <button
            key={key}
            type="button"
            onClick={() =>
              onShowDetail({
                title: ABILITY_LABELS[key],
                body: `Score ${score ?? "—"} · Modifier ${formatModifier(mod)}`,
              })
            }
            className="flex flex-col items-center rounded-sm border border-zinc-800 bg-black/40 px-1 py-2 hover:border-neon-cyan/50 lg:py-3"
          >
            <span className="text-xs font-black uppercase text-zinc-600">{ABILITY_LABELS[key]}</span>
            <span className="text-xl font-black leading-none text-starlight lg:text-2xl">
              {formatModifier(mod)}
            </span>
            <span className="text-sm tabular-nums text-zinc-600">{score ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, onClick, accent }) {
  const inner = (
    <div
      className={`rounded-sm border px-2 py-2 text-center lg:px-3 lg:py-2.5 ${
        accent ? "border-neon-magenta/50 bg-neon-magenta/5" : "border-zinc-800"
      } ${onClick ? "hover:border-neon-cyan/50" : ""}`}
    >
      <p className="text-[10px] font-black uppercase text-zinc-600 lg:text-xs">{label}</p>
      <p className="text-base font-black tabular-nums text-starlight lg:text-lg">{value}</p>
    </div>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} className="text-left">
      {inner}
    </button>
  );
}

function SavesGrid({ sheet, onShowDetail }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
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
            className="flex items-center justify-between gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-zinc-900"
          >
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <span
                className={`h-2 w-2 rounded-full border ${
                  save.proficient ? "border-neon-cyan bg-neon-cyan" : "border-zinc-600"
                }`}
              />
              {ABILITY_LABELS[save.ability]}
            </span>
            <span className="text-sm font-black tabular-nums text-starlight">
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
    <div className="flex flex-wrap gap-3 text-sm">
      {senses.map((sense) => (
        <span key={sense.short} className="text-zinc-500">
          {sense.short}{" "}
          <span className="font-black tabular-nums text-starlight">{sense.value ?? "—"}</span>
        </span>
      ))}
    </div>
  );
}

function SkillsGrid({ sheet, onShowDetail }) {
  const skills = sheet.skills || [];
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
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
            className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-zinc-900"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full border ${
                skill.expertise
                  ? "border-neon-magenta bg-neon-magenta"
                  : skill.proficient
                    ? "border-neon-cyan bg-neon-cyan"
                    : "border-zinc-700"
              }`}
            />
            <span className="w-8 shrink-0 text-xs font-mono uppercase text-zinc-600">
              {ABILITY_LABELS[skill.ability]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{skill.name}</span>
            <span
              className={`shrink-0 text-sm font-black tabular-nums ${
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
  const prof = getProficiencyBonus(sheet);
  const init = getInitiativeBonus(sheet);
  const resources = sheet.resources || [];

  const updateResource = (index, current) => {
    if (!onSheetChange) return;
    const next = resources.map((entry, i) => (i === index ? { ...entry, current } : entry));
    onSheetChange({ ...sheet, resources: next }, { immediate: true });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Prof" value={prof != null ? `+${prof}` : "—"} />
        <StatPill label="Speed" value={combat.speed != null ? `${combat.speed}` : "—"} />
        <StatPill
          label="Init"
          value={formatModifier(init)}
          onClick={() =>
            onShowDetail({ title: "Initiative", body: `Bonus ${formatModifier(init)}` })
          }
        />
        <StatPill
          label="AC"
          value={combat.ac ?? "—"}
          accent
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
      <div className="flex items-center justify-center gap-2 rounded-sm border border-starlight/25 px-3 py-2">
        <span className="text-xs font-black uppercase text-zinc-600">HP</span>
        {readOnly ? (
          <span className="text-lg font-black tabular-nums text-starlight lg:text-xl">
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
              className="w-14 border border-zinc-700 bg-black text-center text-lg font-black text-starlight lg:w-16 lg:text-xl"
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
              className="w-14 border border-zinc-700 bg-black text-center text-lg font-black text-zinc-400 lg:w-16 lg:text-xl"
            />
          </>
        )}
      </div>
      {resources.map((resource, index) => (
        <div
          key={resource.id || index}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="truncate text-zinc-400">{resource.name}</span>
          {readOnly ? (
            <span className="font-black tabular-nums text-starlight">
              {resource.current ?? "—"}/{resource.max ?? "—"}
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => updateResource(index, Math.max(0, (resource.current ?? 0) - 1))}
                className="h-6 w-6 border border-zinc-700 text-sm text-zinc-500"
              >
                −
              </button>
              <span className="w-10 text-center font-black tabular-nums text-starlight">
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
                className="h-6 w-6 border border-zinc-700 text-sm text-zinc-500"
              >
                +
              </button>
            </div>
          )}
        </div>
      ))}
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
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-black uppercase tracking-wider text-zinc-500 hover:text-zinc-300 lg:text-sm"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Proficiencies & training
      </button>
      {open && (
        <div className="space-y-1 border-t border-zinc-800/80 px-2 py-2">
          {groups.map((group) => (
            <p key={group.label} className="text-sm leading-snug text-zinc-500">
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

function standardActionsForFilter(filter) {
  if (filter === "all") return STANDARD_ACTIONS;
  if (filter === "action") {
    return STANDARD_ACTIONS.filter((action) => action.actionType === "action");
  }
  return [];
}

function ActionsPanel({ sheet, filter, onShowDetail }) {
  const attacks = useMemo(() => collectSheetAttackEntries(sheet), [sheet]);
  const combatActions = useMemo(() => collectSheetCombatActions(sheet), [sheet]);
  const filteredActions = useMemo(
    () => filterCombatActions(combatActions, filter),
    [combatActions, filter]
  );
  const standardActions = useMemo(() => standardActionsForFilter(filter), [filter]);

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
          <table className="w-full min-w-[480px] text-left text-sm lg:text-base">
            <thead className="bg-zinc-900/80">
              <tr className="text-xs uppercase text-zinc-600">
                <th className="px-3 py-2 font-black">Name</th>
                <th className="px-3 py-2 font-black">Range</th>
                <th className="px-3 py-2 font-black">Hit</th>
                <th className="px-3 py-2 font-black">Damage</th>
                <th className="px-3 py-2 font-black">Notes</th>
              </tr>
            </thead>
            <tbody>
              {attacks.map((attack) => (
                <tr key={attack.id} className="border-t border-zinc-900/80">
                  <td className="px-3 py-2 font-semibold text-neon-cyan">{attack.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{attack.range}</td>
                  <td className="px-3 py-2 font-black tabular-nums text-starlight">
                    {attack.toHit != null ? formatModifier(attack.toHit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{attack.damage || "—"}</td>
                  <td className="px-3 py-2 text-zinc-600">{attack.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showStandards && (
        <p className="text-sm leading-relaxed text-zinc-600 lg:text-base">
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
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-900/80"
            >
              <span className="truncate text-sm font-semibold text-starlight lg:text-base">
                {action.name}
              </span>
              <span className="shrink-0 text-xs font-black uppercase text-zinc-600">
                {ACTION_TYPE_LABELS[action.actionType] || "Action"}
              </span>
            </button>
          ))}
        </div>
      )}

      {showEmptyMessage && EMPTY_FILTER_MESSAGES[filter] && (
        <p className="text-sm leading-relaxed text-zinc-600 lg:text-base">
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
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-900/80"
        >
          <span className="truncate text-sm font-semibold text-starlight lg:text-base">
            {feat.name}
          </span>
          {feat.source && (
            <span className="shrink-0 text-xs uppercase text-zinc-600">{feat.source}</span>
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
    { id: "actions", label: "Actions" },
    { id: "inventory", label: "Inventory" },
    { id: "features", label: "Features" },
  ];

  return (
    <>
      <div className="w-full space-y-3 pb-4 lg:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black uppercase text-starlight lg:text-xl">
              {character?.name || "Character"}
            </h2>
            {subtitle && (
              <p className="text-sm font-mono text-neon-cyan lg:text-base">{subtitle}</p>
            )}
          </div>
          {sheet.hit_dice && (
            <span className="text-sm font-mono text-zinc-600">HD {sheet.hit_dice}</span>
          )}
        </div>

        <AbilityRow sheet={sheet} onShowDetail={setDetail} />

        <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
          <div className="lg:col-span-2 xl:col-span-2">
            <SheetSection title="Saves & senses" compact>
              <SavesGrid sheet={sheet} onShowDetail={setDetail} />
              <div className="mt-1.5 border-t border-zinc-900 pt-1.5">
                <SensesInline sheet={sheet} />
              </div>
            </SheetSection>
          </div>

          <div className="lg:col-span-7 xl:col-span-8">
            <SheetSection title="Skills" compact>
              <SkillsGrid sheet={sheet} onShowDetail={setDetail} />
            </SheetSection>
          </div>

          <div className="lg:col-span-3 xl:col-span-2">
            <SheetSection title="Combat" compact>
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

        <div>
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800">
            {mainTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`px-4 py-2 text-xs font-black uppercase lg:text-sm ${
                  mainTab === tab.id
                    ? "border-b-2 border-neon-cyan text-starlight"
                    : "text-zinc-600 hover:text-neon-cyan"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {mainTab === "actions" &&
              ACTION_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActionFilter(filter.id)}
                  className={`ml-0.5 rounded-sm px-2.5 py-1 text-xs font-black uppercase lg:text-sm ${
                    actionFilter === filter.id
                      ? "bg-neon-cyan/15 text-neon-cyan"
                      : "text-zinc-600 hover:text-starlight"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
          </div>

          <div className="pt-3">
            {mainTab === "actions" && (
              <ActionsPanel sheet={sheet} filter={actionFilter} onShowDetail={setDetail} />
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
