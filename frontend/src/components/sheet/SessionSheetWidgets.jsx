import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Columns3, Dices, RefreshCw, Rows3, Trash2, X } from "lucide-react";
import { CharacterPhotoAlbum } from "../character/CharacterPhotoAlbum";
import { apiFetch, apiUpload } from "../../lib/api";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { formatConditionsList } from "../../lib/conditions";
import {
  combatantAcText,
  combatantHpText,
  combatantMoveText,
  formatCombatResources,
  turnStatusLabels,
  isDefeatedEnemy,
  isWaitingForPcInitiative,
  parseEncounterPatchResponse,
  shouldShowCombatantTrackerStats,
} from "../../lib/encounterDisplay";
import { encounterPatchBody, revealHiddenCombatant } from "../../lib/encounterPatch";
import {
  buildTrackerCombatants,
  combatHasStarted,
  hasTurnOrder,
  isPartyPhaseActive,
  isPartySlotEntry,
  isTeamMode,
  isTrackerEntryActive,
  partyControllerOptions,
  partyPcs,
  partyRoster,
  passTargets,
  playerNeedsInitiativeRoll,
  resolveActiveCombatant,
  resolveMyCombatant,
  showPartyInitiative,
} from "../../lib/teamInitiative";
import { PassCombatDialog } from "../initiative/PassCombatDialog";
import { AllyControllerSelect } from "../initiative/AllyControllerSelect";
import { CombatResolutionBanner } from "../initiative/CombatResolutionBanner";
import { ReadiedActionsPanel } from "../initiative/ReadiedActionsPanel";
import { ConditionsEditor } from "./ConditionsEditor";
import { EncounterCombatLog, TurnActionsPanel } from "./TurnActionsPanel";
import { AbilityScoresGrid } from "./AbilityScoresGrid";
import { NotesPaneWidget } from "./NotesPaneWidget";
import { PartyMemberSheetModal } from "./PartyMemberSheetModal";
import { PortraitPreviewModal } from "./PortraitPreviewModal";
import {
  INITIATIVE_ORIENTATION_HORIZONTAL,
  INITIATIVE_ORIENTATION_VERTICAL,
  PANE_ORIENTATION_HORIZONTAL,
  PANE_ORIENTATION_VERTICAL,
} from "../../lib/sheetLayout";
import { PaneOrientationToggle } from "./PaneOrientationToggle";
import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  getInitiativeBonus,
  hasSheetData,
  itemAffectsAc,
  resolveCombatStats,
  resolvePassivePerception,
  resolveSaveBonus,
  resolveSkillBonus,
  patchInventoryItemEquipped,
  setInventoryItemEquipped,
} from "../../lib/characterSheet";

function mergePartyWithEncounter(members, combatants) {
  const byCharacterId = Object.fromEntries(
    (combatants || [])
      .filter((combatant) => combatant.character_id && combatant.is_pc)
      .map((combatant) => [combatant.character_id, combatant])
  );

  return members.map((member) => {
    const combatant = byCharacterId[member.character_id];
    if (!combatant) return member;
    return {
      ...member,
      hp: combatant.hp ?? member.hp,
      max_hp: combatant.max_hp ?? member.max_hp,
      ac: combatant.ac ?? member.ac,
      speed: combatant.speed ?? member.speed,
    };
  });
}

function formatPartyResource(label, value) {
  if (value == null) return null;
  return `${label}: ${value}`;
}

function PartyMemberRow({ member, isYou, token, isOwner, onViewSheet, onPortraitPreview, horizontal = false }) {
  const hpLabel =
    member.hp != null && member.max_hp != null
      ? `${member.hp}/${member.max_hp}`
      : member.hp != null
        ? String(member.hp)
        : "—";
  const acLabel = member.ac != null ? String(member.ac) : "—";
  const speedLabel = member.speed != null ? `${member.speed} ft` : "—";
  const subtitle = [
    member.race,
    member.class_name,
    member.level != null ? `Lv ${member.level}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const resourceLabels = [
    formatPartyResource("Heroic Inspiration", member.heroic_inspiration),
    formatPartyResource("I Know a Guy", member.i_know_a_guy),
  ].filter(Boolean);

  const openSheet = () => onViewSheet?.(member);
  const cardClass = `${
    isYou ? "border-neon-cyan/60 bg-neon-cyan/5" : "border-border bg-void-deep/40"
  } ${isOwner && onViewSheet ? "hover:border-neon-cyan/40" : ""}`;

  if (horizontal) {
    return (
      <li
        className={`flex min-w-[148px] max-w-[168px] shrink-0 flex-col items-center gap-2 rounded-sm border px-2 py-2.5 text-center ${cardClass}`}
      >
        <CombatantAvatar
          portraitUrl={member.portrait_url}
          token={token}
          name={member.character_name}
          size="lg"
          onPreview={onPortraitPreview}
        />
        <button
          type="button"
          onClick={isOwner && onViewSheet ? openSheet : undefined}
          disabled={!isOwner || !onViewSheet}
          className={`min-w-0 w-full ${
            isOwner && onViewSheet ? "cursor-pointer hover:opacity-90" : "cursor-default"
          }`}
        >
          <p className="line-clamp-2 text-[11px] font-black uppercase leading-tight text-starlight">
            {member.character_name}
          </p>
          {isYou && <p className="mt-0.5 text-[10px] font-black uppercase text-neon-cyan">You</p>}
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-[10px] font-mono leading-snug text-ink-faint">
              {subtitle}
            </p>
          )}
        </button>
        <div className="grid w-full grid-cols-3 gap-1 text-[10px] font-mono">
          <div>
            <p className="text-ink-faint">AC</p>
            <p className="font-black text-starlight">{acLabel}</p>
          </div>
          <div>
            <p className="text-ink-faint">HP</p>
            <p className="font-black text-starlight">{hpLabel}</p>
          </div>
          <div>
            <p className="text-ink-faint">Move</p>
            <p className="font-black text-starlight">{speedLabel.replace(" ft", "")}</p>
          </div>
        </div>
        {resourceLabels.length > 0 && (
          <div className="flex w-full flex-col gap-1">
            {resourceLabels.map((label) => (
              <span
                key={label}
                className="rounded-sm border border-neon-magenta/30 bg-neon-magenta/5 px-1 py-0.5 text-[9px] font-mono leading-tight text-neon-magenta"
              >
                {label}
              </span>
            ))}
          </div>
        )}
        {isOwner && onViewSheet && (
          <button
            type="button"
            onClick={() => onViewSheet(member)}
            className="w-full rounded-sm border border-neon-cyan/50 px-2 py-1 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
            title={`View ${member.character_name}'s sheet`}
          >
            Sheet
          </button>
        )}
      </li>
    );
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-sm border px-2 py-2 ${cardClass}`}
    >
      <CombatantAvatar
        portraitUrl={member.portrait_url}
        token={token}
        name={member.character_name}
        onPreview={onPortraitPreview}
      />
      <button
        type="button"
        onClick={isOwner && onViewSheet ? openSheet : undefined}
        disabled={!isOwner || !onViewSheet}
        className={`min-w-0 flex-1 text-left ${
          isOwner && onViewSheet ? "cursor-pointer hover:opacity-90" : "cursor-default"
        }`}
      >
        <p className="truncate text-xs sm:text-sm font-black uppercase text-starlight">
          {member.character_name}
          {isYou && <span className="ml-1.5 text-[11px] sm:text-xs text-neon-cyan">YOU</span>}
        </p>
        {subtitle && <p className="truncate text-xs sm:text-sm font-mono text-ink-faint">{subtitle}</p>}
        {resourceLabels.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {resourceLabels.map((label) => (
              <span
                key={label}
                className="rounded-sm border border-neon-magenta/30 bg-neon-magenta/5 px-1.5 py-0.5 text-[10px] font-mono text-neon-magenta"
              >
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs sm:text-sm font-mono">
          <span>
            <span className="text-ink-faint">AC </span>
            <span className="font-black text-starlight">{acLabel}</span>
          </span>
          <span>
            <span className="text-ink-faint">HP </span>
            <span className="font-black text-starlight">{hpLabel}</span>
          </span>
          <span>
            <span className="text-ink-faint">Move </span>
            <span className="font-black text-starlight">{speedLabel}</span>
          </span>
        </div>
      </button>
      {isOwner && onViewSheet && (
        <button
          type="button"
          onClick={() => onViewSheet(member)}
          className="shrink-0 rounded-sm border border-neon-cyan/50 px-2 py-1 text-[11px] sm:text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 lg:text-xs sm:text-sm"
          title={`View ${member.character_name}'s sheet`}
        >
          Sheet
        </button>
      )}
    </li>
  );
}

export function PartyWidget({
  campaignId,
  token,
  characterId,
  isOwner = false,
  orientation = PANE_ORIENTATION_VERTICAL,
  onOrientationChange,
  portraitSyncKey = null,
}) {
  const isHorizontal = orientation === PANE_ORIENTATION_HORIZONTAL;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [sheetModalMember, setSheetModalMember] = useState(null);
  const [portraitPreview, setPortraitPreview] = useState(null);

  const loadParty = useCallback(async () => {
    if (!token || !campaignId) return;
    try {
      const [rosterRes, encounterRes] = await Promise.all([
        apiFetch(`/campaigns/${campaignId}/roster`, { token }),
        apiFetch(`/campaigns/${campaignId}/encounter`, { token }),
      ]);

      if (!rosterRes.ok) throw new Error("Could not load party");

      const rosterData = await rosterRes.json();
      let nextMembers = rosterData.members || [];

      if (encounterRes.ok) {
        const encounter = await encounterRes.json();
        nextMembers = mergePartyWithEncounter(nextMembers, encounter.combatants);
      }

      setMembers(nextMembers);
      setError("");
    } catch {
      setError("Could not load party.");
    } finally {
      setLoading(false);
    }
  }, [token, campaignId]);

  useEffect(() => {
    loadParty();
    const timer = setInterval(loadParty, 8000);
    return () => clearInterval(timer);
  }, [loadParty]);

  useEffect(() => {
    if (portraitSyncKey == null) return;
    void loadParty();
  }, [portraitSyncKey, loadParty]);

  if (loading) {
    return <p className="text-xs sm:text-sm font-mono text-ink-faint">Loading party...</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs sm:text-sm font-mono text-danger">{error}</p>
        <button
          type="button"
          onClick={loadParty}
          className="text-xs sm:text-sm font-black uppercase text-neon-cyan hover:text-starlight"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleAddAllToInitiative = async () => {
    if (!token || !campaignId || !isOwner) return;
    setAddingAll(true);
    setActionMessage("");
    setError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/add-roster`, {
        token,
        method: "POST",
        body: { auto_roll: true },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not add party to initiative");
      }
      setActionMessage("Party added to initiative with rolled values.");
      await loadParty();
    } catch (err) {
      setError(err.message || "Could not add party to initiative.");
    } finally {
      setAddingAll(false);
    }
  };

  if (members.length === 0) {
    return (
      <p className="text-xs sm:text-sm font-mono text-ink-faint">
        No characters have joined this campaign yet.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-ink-faint">
          {members.length} adventurer{members.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1">
          {onOrientationChange && (
            <PaneOrientationToggle
              orientation={orientation}
              onChange={onOrientationChange}
              verticalTitle="Vertical party list"
              horizontalTitle="Horizontal party row"
            />
          )}
        {isOwner && (
          <button
            type="button"
            disabled={addingAll}
            onClick={handleAddAllToInitiative}
            className="rounded-sm border border-neon-cyan px-2 py-1 text-[11px] sm:text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
          >
            {addingAll ? "Rolling…" : "Add all to initiative"}
          </button>
        )}
        </div>
      </div>
      {actionMessage && (
        <p className="shrink-0 text-xs sm:text-sm font-mono text-neon-cyan">{actionMessage}</p>
      )}
      <ul
        className={`min-h-0 flex-1 ${
          isHorizontal
            ? "flex gap-2 overflow-x-auto pb-1"
            : "space-y-1.5 overflow-y-auto"
        }`}
      >
        {members.map((member) => (
          <PartyMemberRow
            key={member.member_id}
            member={member}
            horizontal={isHorizontal}
            isYou={member.character_id === characterId}
            token={token}
            isOwner={isOwner}
            onViewSheet={isOwner ? setSheetModalMember : undefined}
            onPortraitPreview={setPortraitPreview}
          />
        ))}
      </ul>
      <button
        type="button"
        onClick={loadParty}
        className="shrink-0 self-start text-xs sm:text-sm font-black uppercase text-ink-faint hover:text-neon-cyan"
      >
        Refresh
      </button>
      <PartyMemberSheetModal
        open={!!sheetModalMember}
        characterId={sheetModalMember?.character_id}
        token={token}
        onClose={() => setSheetModalMember(null)}
      />
      <PortraitPreviewModal
        open={!!portraitPreview}
        portraitUrl={portraitPreview?.portraitUrl}
        name={portraitPreview?.name}
        token={token}
        onClose={() => setPortraitPreview(null)}
      />
    </div>
  );
}

function ClickableRow({ label, value, sub, onClick, onRoll }) {
  return (
    <div className="flex items-center gap-1 border border-transparent hover:border-neon-magenta/30 hover:bg-neon-magenta/10">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1 text-left"
      >
        <span className="truncate text-xs sm:text-sm text-zinc-400">{label}</span>
        <span className="shrink-0 text-xs font-black text-starlight">{value}</span>
        {sub && <span className="shrink-0 text-xs sm:text-sm text-zinc-600">{sub}</span>}
      </button>
      {onRoll && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRoll();
          }}
          className="shrink-0 px-1.5 py-1 text-[9px] font-black uppercase text-neon-cyan hover:text-starlight"
          title={`Roll ${label}`}
        >
          d20
        </button>
      )}
    </div>
  );
}

function rechargeLabel(value) {
  if (value === "short_rest") return "Short rest";
  if (value === "long_rest") return "Long rest";
  if (value === "turn") return "Per turn";
  return null;
}

export function CombatWidget({ character, sheet, onCombatChange, onShowDetail, onSheetChange }) {
  const combat = resolveCombatStats(character, sheet);
  const resources = sheet.resources || [];

  const updateResource = (index, current) => {
    if (!onSheetChange) return;
    const next = (sheet.resources || []).map((entry, i) =>
      i === index ? { ...entry, current } : entry
    );
    onSheetChange({ ...sheet, resources: next }, { immediate: true });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-center">
        <button
          type="button"
          onClick={() =>
            onShowDetail({
              title: "Armor Class",
              subtitle: combat.fromEquipment ? "From equipped gear" : "Character sheet",
              body: (
                <div className="space-y-1 text-xs">
                  {combat.acLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  <p className="pt-2 text-starlight font-black">Total AC: {combat.ac}</p>
                </div>
              ),
            })
          }
          className="border border-neon-magenta/50 p-2 hover:bg-neon-magenta/5 text-left"
        >
          <p className="text-xs sm:text-sm text-zinc-500 uppercase">AC</p>
          <p className="text-2xl font-black text-starlight text-center">{combat.ac ?? "—"}</p>
          {combat.fromEquipment && (
            <p className="text-[11px] sm:text-xs text-ink-faint text-center uppercase">Equipped</p>
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            onShowDetail({
              title: "Initiative",
              subtitle: character.class_name,
              body: `Initiative bonus: ${formatModifier(sheet.initiative_bonus ?? abilityModifier(sheet.abilities?.dex))}`,
            })
          }
          className="border border-neon-cyan/50 p-2 hover:bg-neon-cyan/5"
        >
          <p className="text-xs sm:text-sm text-zinc-500 uppercase">Init</p>
          <p className="text-2xl font-black text-starlight">
            {formatModifier(sheet.initiative_bonus ?? abilityModifier(sheet.abilities?.dex))}
          </p>
        </button>
      </div>
      <div className="border border-starlight/50 p-2">
        <p className="text-xs sm:text-sm text-zinc-500 uppercase mb-1">Hit Points</p>
        <div className="flex items-center justify-center gap-2">
          <input
            type="number"
            min="0"
            value={character.hp ?? ""}
            onChange={(e) =>
              onCombatChange({
                hp: e.target.value === "" ? null : parseInt(e.target.value, 10),
              })
            }
            className="w-14 bg-black text-xl font-black text-starlight text-center border border-zinc-700"
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
            className="w-14 bg-black text-xl font-black text-zinc-400 text-center border border-zinc-700"
          />
        </div>
      </div>
      <div className="flex justify-between text-xs sm:text-sm font-mono text-zinc-500">
        <span>Speed: {combat.speed != null ? `${combat.speed} ft` : "—"}</span>
        <span>PP: {resolvePassivePerception(sheet) ?? "—"}</span>
      </div>
      {resources.length > 0 && (
        <div className="border border-neon-cyan/40 p-2 space-y-1.5">
          <p className="text-xs sm:text-sm text-zinc-500 uppercase">Class Resources</p>
          {resources.map((resource, index) => (
            <div key={resource.id || index} className="flex items-center justify-between gap-2 text-xs sm:text-sm">
              <button
                type="button"
                onClick={() =>
                  onShowDetail({
                    title: resource.name,
                    subtitle: resource.source_class || character.class_name,
                    body: (
                      <div className="space-y-1 text-xs">
                        <p>
                          {resource.current ?? "—"} / {resource.max ?? "—"}
                        </p>
                        {rechargeLabel(resource.recharge) && (
                          <p className="text-ink-faint">Recharges on {rechargeLabel(resource.recharge)}</p>
                        )}
                      </div>
                    ),
                  })
                }
                className="min-w-0 flex-1 text-left text-neon-cyan hover:text-starlight truncate"
              >
                {resource.name}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min="0"
                  max={resource.max ?? undefined}
                  value={resource.current ?? ""}
                  onChange={(e) =>
                    updateResource(
                      index,
                      e.target.value === "" ? null : parseInt(e.target.value, 10)
                    )
                  }
                  className="w-10 bg-black text-starlight text-center border border-zinc-700 text-xs"
                />
                <span className="text-zinc-600">/</span>
                <span className="w-6 text-center text-zinc-400">{resource.max ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      {sheet.conditions?.length > 0 && (
        <p className="text-xs sm:text-sm text-neon-magenta">{sheet.conditions.join(", ")}</p>
      )}
    </div>
  );
}

export function AbilitiesWidget({
  sheet,
  onShowDetail,
  onSheetChange,
  orientation = PANE_ORIENTATION_VERTICAL,
  onOrientationChange,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {onOrientationChange && (
        <div className="flex shrink-0 justify-end">
          <PaneOrientationToggle
            orientation={orientation}
            onChange={onOrientationChange}
            verticalTitle="3×2 ability grid"
            horizontalTitle="Single-row abilities"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AbilityScoresGrid
          sheet={sheet}
          compact={orientation !== PANE_ORIENTATION_HORIZONTAL}
          orientation={orientation}
          readOnly={!onSheetChange}
          onShowDetail={onShowDetail}
          onChange={onSheetChange}
        />
      </div>
    </div>
  );
}

export function SkillsSavesWidget({
  sheet,
  onShowDetail,
  onRollCheck,
  lastRollMessage = "",
  rollBusy = false,
}) {
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const proficientSkills = sheet.skills?.filter((s) => s.proficient || s.expertise) || [];
  const otherSkills = sheet.skills?.filter((s) => !s.proficient && !s.expertise) || [];

  const rollCheck = (body) => {
    if (!onRollCheck) return;
    void onRollCheck({ ...body, advantage, disadvantage });
  };

  return (
    <div className="space-y-3">
      {onRollCheck && (
        <div className="space-y-1 rounded-sm border border-zinc-800 bg-void-deep/40 p-2">
          <div className="flex flex-wrap items-center gap-3 text-[9px] font-mono text-ink-faint">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={advantage}
                disabled={rollBusy}
                onChange={(event) => {
                  setAdvantage(event.target.checked);
                  if (event.target.checked) setDisadvantage(false);
                }}
              />
              Adv
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={disadvantage}
                disabled={rollBusy}
                onChange={(event) => {
                  setDisadvantage(event.target.checked);
                  if (event.target.checked) setAdvantage(false);
                }}
              />
              Dis
            </label>
          </div>
          {lastRollMessage && (
            <p className="text-[10px] font-mono text-neon-cyan">{lastRollMessage}</p>
          )}
        </div>
      )}
      <div>
        <p className="text-xs sm:text-sm font-black text-neon-magenta uppercase mb-1">Saving Throws</p>
        <div className="space-y-0.5">
          {sheet.saving_throws?.map((save) => {
            const bonus = resolveSaveBonus(save, sheet);
            return (
              <ClickableRow
                key={save.ability}
                label={ABILITY_LABELS[save.ability]}
                value={formatModifier(bonus)}
                sub={save.proficient ? "prof" : ""}
                onClick={() =>
                  onShowDetail({
                    title: `${ABILITY_LABELS[save.ability]} Save`,
                    subtitle: save.proficient ? "Proficient" : "Not proficient",
                    body: `Bonus: ${formatModifier(bonus)}`,
                  })
                }
                onRoll={onRollCheck ? () => rollCheck({ roll_kind: "save", label: save.ability }) : undefined}
              />
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-xs sm:text-sm font-black text-neon-cyan uppercase mb-1">Skills</p>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {[...proficientSkills, ...otherSkills].map((skill) => {
            const bonus = resolveSkillBonus(skill, sheet);
            return (
              <ClickableRow
                key={skill.name}
                label={skill.name}
                value={formatModifier(bonus)}
                sub={
                  skill.expertise ? "exp" : skill.proficient ? "prof" : skill.ability?.toUpperCase()
                }
                onClick={() =>
                  onShowDetail({
                    title: skill.name,
                    subtitle: `${skill.ability?.toUpperCase()} · ${skill.expertise ? "Expertise" : skill.proficient ? "Proficient" : "Not proficient"}`,
                    body: `Bonus: ${formatModifier(bonus)}`,
                  })
                }
                onRoll={onRollCheck ? () => rollCheck({ roll_kind: "skill", label: skill.name }) : undefined}
              />
            );
          })}
        </div>
      </div>
      {(sheet.proficiencies?.languages?.length > 0 ||
        sheet.proficiencies?.armor?.length > 0) && (
        <button
          type="button"
          onClick={() =>
            onShowDetail({
              title: "Proficiencies",
              body: (
                <div className="space-y-2 text-xs">
                  {sheet.proficiencies.armor?.length > 0 && (
                    <p>
                      <span className="text-neon-magenta">Armor:</span>{" "}
                      {sheet.proficiencies.armor.join(", ")}
                    </p>
                  )}
                  {sheet.proficiencies.weapons?.length > 0 && (
                    <p>
                      <span className="text-neon-magenta">Weapons:</span>{" "}
                      {sheet.proficiencies.weapons.join(", ")}
                    </p>
                  )}
                  {sheet.proficiencies.tools?.length > 0 && (
                    <p>
                      <span className="text-neon-magenta">Tools:</span>{" "}
                      {sheet.proficiencies.tools.join(", ")}
                    </p>
                  )}
                  {sheet.proficiencies.languages?.length > 0 && (
                    <p>
                      <span className="text-neon-magenta">Languages:</span>{" "}
                      {sheet.proficiencies.languages.join(", ")}
                    </p>
                  )}
                </div>
              ),
            })
          }
          className="text-xs sm:text-sm text-neon-cyan hover:text-starlight uppercase font-black"
        >
          View proficiencies →
        </button>
      )}
    </div>
  );
}

export function CharacterPortraitWidget(props) {
  return <CharacterPhotoAlbum {...props} layout="pane" />;
}

function CombatantAvatar({ portraitUrl, token, name, size = "sm", onPreview }) {
  const dimensions = size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  const cacheKey = portraitUrl?.split("photo=")[1] ?? portraitUrl;
  const image = (
    <AuthenticatedImage
      key={cacheKey}
      src={portraitUrl}
      token={token}
      alt={name}
      className={`${dimensions} shrink-0 rounded-sm border border-border object-cover`}
      fallbackClassName={`${dimensions} shrink-0 rounded-sm border border-border`}
    />
  );

  if (!onPreview || !portraitUrl) {
    return image;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onPreview({ portraitUrl, name });
      }}
      className="shrink-0 rounded-sm focus:outline-none focus:ring-2 focus:ring-neon-cyan/60 hover:opacity-90"
      title={`View ${name}`}
    >
      {image}
    </button>
  );
}

export function PlayerNotesWidget({ tabs, closedTabs, activeTabId, onChange, onBrowseArchive }) {
  return (
    <NotesPaneWidget
      tabs={tabs}
      closedTabs={closedTabs}
      activeTabId={activeTabId}
      onChange={onChange}
      onBrowseArchive={onBrowseArchive}
      tabsKey="playerNotesTabs"
      closedTabsKey="closedNotesTabs"
      activeKey="activeNotesTabId"
      hint="Close tabs to archive · reopen from archive icon · auto-saved"
      formattedPreview
    />
  );
}

export function CharacterTabsWidget({ sheet, onSheetChange, onShowDetail }) {
  const [tab, setTab] = useState("inventory");
  const tabs = [
    { id: "inventory", label: "Inventory" },
    { id: "features", label: "Features" },
  ];

  const updateInventoryItem = (index, patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, "equipped")) {
      onSheetChange(setInventoryItemEquipped(sheet, index, patch.equipped), { immediate: true });
      return;
    }
    const next = sheet.inventory.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onSheetChange({ ...sheet, inventory: next });
  };

  return (
    <div className="flex flex-col h-full min-h-[200px]">
      <div className="flex border-b border-zinc-800 mb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 py-1.5 text-xs sm:text-sm font-black uppercase ${
              tab === t.id
                ? "text-starlight border-b-2 border-neon-magenta"
                : "text-zinc-600 hover:text-neon-cyan"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "inventory" && (
          <div className="space-y-1">
            <p className="mb-1 text-[11px] sm:text-xs font-mono leading-relaxed text-ink-faint">
              Tap <span className="text-starlight">Equip</span> for worn/wielded gear — saves to your
              digital sheet and updates AC immediately (PDF is not modified).
            </p>
            {sheet.inventory?.length === 0 && (
              <p className="text-xs sm:text-sm text-zinc-600">No items parsed yet.</p>
            )}
            {sheet.inventory?.map((item, index) => {
              const affectsAc = itemAffectsAc(item);
              const isEquipped = !!item.equipped;
              return (
                <div
                  key={item.id || index}
                  className={`flex items-center gap-1.5 p-1 border ${
                    isEquipped
                      ? "border-starlight/70 bg-starlight/5"
                      : "border-zinc-900 hover:border-neon-cyan/40"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateInventoryItem(index, { equipped: !isEquipped })}
                    className={`shrink-0 rounded-sm px-1.5 py-1 text-[11px] sm:text-xs font-black uppercase tracking-wide ${
                      isEquipped
                        ? "bg-starlight text-black"
                        : "border border-zinc-700 text-zinc-500 hover:border-neon-cyan hover:text-neon-cyan"
                    }`}
                    title={isEquipped ? "Unequip" : "Mark as equipped"}
                  >
                    {isEquipped ? "Equipped" : "Equip"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onShowDetail({
                        title: item.name,
                        subtitle: isEquipped ? "Equipped" : "Carried",
                        body: (
                          <div className="space-y-2 text-xs">
                            <p>Qty: {item.qty ?? 1}</p>
                            {item.weight != null && <p>Weight: {item.weight} lb</p>}
                            {item.notes && <p>{item.notes}</p>}
                            {affectsAc && (
                              <p className="text-neon-cyan">Counts toward armor class when equipped.</p>
                            )}
                          </div>
                        ),
                      })
                    }
                    className="min-w-0 flex-1 text-left text-xs sm:text-sm text-neon-cyan hover:text-starlight truncate"
                  >
                    {item.name}
                  </button>
                  {affectsAc && (
                    <span className="shrink-0 text-[10px] sm:text-xs font-black uppercase text-neon-cyan/80">
                      AC
                    </span>
                  )}
                  <input
                    type="number"
                    min="0"
                    value={item.qty ?? 1}
                    onChange={(e) =>
                      updateInventoryItem(index, { qty: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-10 shrink-0 text-center bg-black border border-zinc-800 text-xs sm:text-sm"
                  />
                </div>
              );
            })}
          </div>
        )}
        {tab === "features" && (
          <div className="space-y-1">
            {sheet.features?.length === 0 && (
              <p className="text-xs sm:text-sm text-zinc-600">No features parsed yet.</p>
            )}
            {sheet.features?.map((feat, index) => (
              <button
                key={feat.id || index}
                type="button"
                onClick={() =>
                  onShowDetail({
                    title: feat.name,
                    subtitle: feat.source || "Feature",
                    body: feat.description || "No description available.",
                  })
                }
                className="w-full text-left px-2 py-1.5 text-xs sm:text-sm text-neon-cyan hover:bg-neon-magenta/10 border border-transparent hover:border-neon-magenta/30"
              >
                <span className="font-black text-starlight">{feat.name}</span>
                {feat.source && (
                  <span className="text-zinc-600 ml-2 text-xs sm:text-sm">{feat.source}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InitiativeLabeledStat({ label, value, valueClassName = "text-starlight" }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex w-full items-baseline justify-between gap-1 leading-tight">
      <span className="shrink-0 text-[11px] sm:text-xs font-black uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className={`truncate text-right text-xs sm:text-sm font-mono font-black ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

function InitiativeTurnBadge({ index, compact = false }) {
  return (
    <div
      className={`flex items-center justify-center rounded-sm border border-border/50 bg-void-deep/50 ${
        compact ? "px-1.5 py-1" : "w-full px-2 py-1"
      }`}
    >
      <span
        className={`font-black leading-none text-starlight ${compact ? "text-xl" : "text-2xl"}`}
      >
        {index + 1}
      </span>
    </div>
  );
}

function InitiativeStatusBadges({ combatant, isYou, isDefeated, isDmView = false }) {
  const badges = [];
  if (isDefeated) badges.push({ key: "defeated", label: "Defeated", className: "text-ink-faint" });
  if (
    isDmView &&
    combatant.hidden_from_players &&
    !combatant.is_pc &&
    !combatant.is_ally
  ) {
    badges.push({ key: "hidden", label: "Hidden", className: "text-neon-magenta" });
  }
  if (isPartySlotEntry(combatant)) {
    badges.push({ key: "party", label: "Party", className: "text-neon-cyan" });
  } else if (isYou) badges.push({ key: "you", label: "You", className: "text-neon-cyan" });
  else if (combatant.is_pc) badges.push({ key: "pc", label: "PC", className: "text-ink-faint" });
  else if (combatant.is_ally) badges.push({ key: "ally", label: "Ally", className: "text-neon-cyan" });

  if (!badges.length) return null;

  return (
    <div className="flex w-full flex-wrap justify-center gap-1">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`rounded-sm border border-border/50 px-1 py-0.5 text-[10px] sm:text-xs font-black uppercase ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function InitiativeCombatantStats({
  combatant,
  combatants,
  isDmView,
  turnEconomy,
  isActive,
  resourceSheet,
}) {
  if (isPartySlotEntry(combatant)) {
    const memberCount = combatant.party_members?.length || 0;
    return (
      <div className="flex w-full flex-col gap-0.5">
        <InitiativeLabeledStat label="Init" value={combatant.initiative} />
        {memberCount > 0 ? (
          <InitiativeLabeledStat label="Group" value={`${memberCount} PC${memberCount === 1 ? "" : "s"}`} />
        ) : null}
      </div>
    );
  }

  const showStats = shouldShowCombatantTrackerStats(combatant, isDmView);
  const conditions = showStats ? formatConditionsList(combatant.conditions) : null;
  const economy = isActive ? turnEconomy?.[combatant.id] : null;
  const turnStatuses = showStats ? turnStatusLabels(economy, combatants) : [];
  const resourceSummary =
    showStats && resourceSheet ? formatCombatResources(resourceSheet) : null;
  const initValue =
    combatant.hidden_from_players && !combatant.is_pc && !combatant.is_ally
      ? "—"
      : combatant.initiative;
  return (
    <div className="flex w-full flex-col gap-0.5">
      <InitiativeLabeledStat label="Init" value={initValue} />
      {showStats ? (
        <>
          <InitiativeLabeledStat label="HP" value={combatantHpText(combatant)} />
          <InitiativeLabeledStat label="AC" value={combatantAcText(combatant, isDmView)} />
          <InitiativeLabeledStat label="Move" value={combatantMoveText(combatant, economy)} />
          {resourceSummary ? (
            <InitiativeLabeledStat
              label="Uses"
              value={resourceSummary}
              valueClassName="text-neon-cyan"
            />
          ) : null}
          {turnStatuses.length ? (
            <InitiativeLabeledStat
              label="Turn"
              value={turnStatuses.join(", ")}
              valueClassName="text-neon-magenta"
            />
          ) : null}
          {conditions ? (
            <InitiativeLabeledStat
              label="Cond"
              value={conditions}
              valueClassName="text-neon-magenta"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function initiativeCardClass(
  isActive,
  isYou,
  isSelected = false,
  isDefeated = false,
  isHidden = false
) {
  if (isHidden) return "border-neon-magenta/50 border-dashed bg-void-deep/35";
  if (isDefeated) return "border-border/30 bg-void-deep/25 opacity-45";
  if (isSelected) return "border-starlight bg-starlight/10";
  if (isActive) return "border-starlight bg-starlight/5";
  if (isYou) return "border-neon-cyan/50 bg-neon-cyan/5";
  return "border-neon-cyan/40 bg-void-deep/60";
}

function clampCombatantHp(hp, maxHp) {
  if (hp == null) return null;
  const ceiling = maxHp != null ? maxHp : hp;
  return Math.max(0, Math.min(hp, ceiling));
}

function HpStepButtons({ combatant, disabled, onAdjust }) {
  const steps = [-10, -5, -1, 1, 5, 10];
  return (
    <div className="flex flex-wrap gap-0.5">
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          disabled={disabled || combatant.hp == null}
          onClick={() => onAdjust(step)}
          className={`min-w-[1.75rem] rounded-sm border px-1 py-0.5 text-[11px] sm:text-xs font-black uppercase disabled:opacity-30 ${
            step < 0
              ? "border-danger/50 text-danger hover:bg-danger/10"
              : "border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10"
          }`}
        >
          {step > 0 ? `+${step}` : step}
        </button>
      ))}
    </div>
  );
}

function DmCombatantEditor({
  combatant,
  saving,
  onPatch,
  onRemove,
  onClose,
  onReveal,
  combatStarted = false,
  isActiveTurn = false,
  movementRemaining = null,
  onAdjustMovement,
  movementBusy = false,
  controllerOptions = [],
  teamMode = false,
}) {
  const defeated = combatant.hp != null && combatant.hp <= 0;
  const isEnemy = !combatant.is_pc && !combatant.is_ally;
  const isNpc = !combatant.is_pc && !combatant.character_id;

  const adjustHp = (delta) => {
    if (combatant.hp == null) return;
    onPatch({ hp: clampCombatantHp(combatant.hp + delta, combatant.max_hp) });
  };

  return (
    <div
      className={`rounded-sm border p-2 ${
        defeated ? "border-danger/40 bg-danger/5" : "border-border bg-void-deep/40"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">
            Health &amp; status
          </p>
          {isNpc ? (
            <div className="min-w-0">
              <input
                type="text"
                value={combatant.name}
                disabled={saving}
                onChange={(e) => onPatch({ name: e.target.value })}
                className="w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-black uppercase text-starlight"
              />
              {combatant.srd_name && (
                <p className="mt-0.5 truncate text-[10px] font-mono text-ink-faint">
                  SRD: {combatant.srd_name}
                </p>
              )}
            </div>
          ) : (
            <p className="truncate text-xs sm:text-sm font-black uppercase text-starlight">
              {combatant.name}
            </p>
          )}
          {defeated && (
            <p className="text-[10px] font-black uppercase text-danger">Defeated</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-ink-faint hover:bg-border/40 hover:text-starlight"
          title="Close"
          aria-label="Close health and status panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">Init</span>
          {combatant.hidden_from_players && isEnemy ? (
            <span className="w-10 text-center text-xs sm:text-sm font-mono text-ink-faint">—</span>
          ) : (
            <input
              type="number"
              value={combatant.initiative}
              disabled={saving}
              onChange={(e) =>
                onPatch({ initiative: parseInt(e.target.value, 10) || 0 })
              }
              className="w-10 rounded-sm border border-border bg-black px-1 py-0.5 text-center text-xs sm:text-sm font-mono text-starlight"
            />
          )}
          <span className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">HP</span>
          <input
            type="number"
            min="0"
            value={combatant.hp ?? ""}
            disabled={saving}
            onChange={(e) =>
              onPatch({
                hp:
                  e.target.value === ""
                    ? null
                    : clampCombatantHp(parseInt(e.target.value, 10) || 0, combatant.max_hp),
              })
            }
            className="w-11 rounded-sm border border-border bg-black px-1 py-0.5 text-center text-xs sm:text-sm font-mono text-starlight"
          />
          <span className="text-ink-faint">/</span>
          <input
            type="number"
            min="0"
            value={combatant.max_hp ?? ""}
            disabled={saving}
            onChange={(e) =>
              onPatch({
                max_hp: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0,
              })
            }
            className="w-11 rounded-sm border border-border bg-black px-1 py-0.5 text-center text-xs sm:text-sm font-mono text-ink-muted"
          />
          {isEnemy && (
            <>
              <span className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">AC</span>
              <input
                type="number"
                min="0"
                value={combatant.ac ?? ""}
                disabled={saving}
                onChange={(e) =>
                  onPatch({
                    ac: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-10 rounded-sm border border-border bg-black px-1 py-0.5 text-center text-xs sm:text-sm font-mono text-starlight"
              />
            </>
          )}
        </div>
        <HpStepButtons combatant={combatant} disabled={saving} onAdjust={adjustHp} />
        {isActiveTurn && onAdjustMovement && (
          <div className="space-y-1">
            <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">
              Movement
              {movementRemaining != null && combatant.speed != null
                ? ` — ${movementRemaining}/${combatant.speed} ft`
                : movementRemaining != null
                  ? ` — ${movementRemaining} ft`
                  : ""}
            </p>
            <div className="flex flex-wrap gap-0.5">
              {[-30, -15, -10, -5, 5, 10, 15, 30].map((step) => (
                <button
                  key={step}
                  type="button"
                  disabled={saving || movementBusy}
                  onClick={() => onAdjustMovement(step)}
                  className={`min-w-[1.75rem] rounded-sm border px-1 py-0.5 text-[11px] sm:text-xs font-black uppercase disabled:opacity-30 ${
                    step < 0
                      ? "border-danger/50 text-danger hover:bg-danger/10"
                      : "border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10"
                  }`}
                >
                  {step > 0 ? `+${step}` : step}
                </button>
              ))}
            </div>
          </div>
        )}
        <ConditionsEditor
          conditions={combatant.conditions}
          disabled={saving}
          compact
          onChange={(next) => onPatch({ conditions: next })}
        />
        {isEnemy && (
          <div className="space-y-1.5">
            {combatant.hidden_from_players && combatStarted ? (
              <button
                type="button"
                disabled={saving}
                onClick={onReveal}
                className="w-full rounded-sm border border-neon-magenta px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
              >
                Reveal to players (roll initiative)
              </button>
            ) : (
              <label className="flex items-center gap-1.5 text-xs sm:text-sm font-mono uppercase text-ink-faint">
                <input
                  type="checkbox"
                  checked={Boolean(combatant.hidden_from_players)}
                  disabled={saving || combatStarted}
                  onChange={(e) =>
                    onPatch({
                      hidden_from_players: e.target.checked,
                      initiative: e.target.checked ? 0 : combatant.initiative,
                    })
                  }
                  className="accent-neon-magenta"
                />
                Hidden from players at combat start
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs sm:text-sm font-mono uppercase text-ink-faint">
              <input
                type="checkbox"
                checked={Boolean(combatant.is_ally)}
                disabled={saving}
                onChange={(e) =>
                  onPatch({
                    is_ally: e.target.checked,
                    controller_character_id: e.target.checked
                      ? combatant.controller_character_id
                      : null,
                  })
                }
                className="accent-neon-cyan"
              />
              Ally / summon
            </label>
            {combatant.is_ally && teamMode && (
              <AllyControllerSelect
                value={combatant.controller_character_id}
                options={controllerOptions}
                disabled={saving}
                onChange={(characterId) =>
                  onPatch({ controller_character_id: characterId })
                }
              />
            )}
          </div>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={onRemove}
          className="text-xs sm:text-sm font-black uppercase text-danger hover:underline disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function InitiativeCombatantRow({
  combatant,
  combatants,
  index,
  isActive,
  isYou,
  isDmView,
  isSelected,
  isDefeated,
  onSelect,
  onPortraitPreview,
  token,
  turnEconomy,
  resourceSheet,
}) {
  const selectable = isDmView && onSelect;
  const isHidden =
    isDmView && combatant.hidden_from_players && !combatant.is_pc && !combatant.is_ally;
  return (
    <li
      onClick={selectable ? () => onSelect(combatant.id) : undefined}
      className={`flex w-full items-center gap-3 rounded-sm border-2 px-3 py-3 sm:py-3.5 ${
        selectable ? "cursor-pointer" : ""
      } ${initiativeCardClass(isActive, isYou, isSelected, isDefeated, isHidden)}`}
    >
      <InitiativeTurnBadge index={index} compact />
      <CombatantAvatar
        portraitUrl={combatant.portrait_url}
        token={token}
        name={combatant.name}
        onPreview={onPortraitPreview}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black uppercase text-starlight" title={combatant.name}>
          {combatant.name}
        </p>
        <InitiativeStatusBadges
          combatant={combatant}
          isYou={isYou}
          isDefeated={isDefeated}
          isDmView={isDmView}
        />
        <div className="mt-1 w-full max-w-full sm:max-w-[280px]">
          <InitiativeCombatantStats
            combatant={combatant}
            combatants={combatants}
            isDmView={isDmView}
            turnEconomy={turnEconomy}
            isActive={isActive}
            resourceSheet={resourceSheet}
          />
        </div>
      </div>
    </li>
  );
}

function InitiativeCombatantCard({
  combatant,
  combatants,
  index,
  isActive,
  isYou,
  isDmView,
  isSelected,
  isDefeated,
  onSelect,
  onPortraitPreview,
  token,
  turnEconomy,
  resourceSheet,
}) {
  const selectable = isDmView && onSelect;
  const isHidden =
    isDmView && combatant.hidden_from_players && !combatant.is_pc && !combatant.is_ally;
  return (
    <div
      onClick={selectable ? () => onSelect(combatant.id) : undefined}
      className={`flex min-w-[9.5rem] max-w-[11rem] flex-1 flex-col items-stretch gap-2 border-2 p-2.5 sm:min-w-[7.5rem] sm:max-w-[9rem] ${
        selectable ? "cursor-pointer" : ""
      } ${initiativeCardClass(isActive, isYou, isSelected, isDefeated, isHidden)}`}
    >
      <InitiativeTurnBadge index={index} />
      <div className="flex justify-center">
        <CombatantAvatar
          portraitUrl={combatant.portrait_url}
          token={token}
          name={combatant.name}
          size="lg"
          onPreview={onPortraitPreview}
        />
      </div>
      <p
        className="line-clamp-2 min-h-[2rem] text-center text-xs sm:text-sm font-black uppercase leading-tight text-starlight"
        title={combatant.name}
      >
        {combatant.name}
      </p>
      <InitiativeCombatantStats
        combatant={combatant}
        combatants={combatants}
        isDmView={isDmView}
        turnEconomy={turnEconomy}
        isActive={isActive}
        resourceSheet={resourceSheet}
      />
      <InitiativeStatusBadges
        combatant={combatant}
        isYou={isYou}
        isDefeated={isDefeated}
        isDmView={isDmView}
      />
    </div>
  );
}

function resourceSheetForCombatant(
  combatant,
  { characterId, sheet, partyPcSheets, dmActionSheet, isOwner }
) {
  if (!combatant?.character_id) return null;
  if (combatant.character_id === characterId) return sheet;
  if (!isOwner) return null;
  return (
    partyPcSheets?.[combatant.character_id] ??
    (dmActionSheet && combatant.character_id ? dmActionSheet : null)
  );
}

function partySliceRequestBody(activeCombatant, isOwner) {
  const body = {};
  if (isOwner && activeCombatant?.id) {
    body.combatant_id = activeCombatant.id;
  }
  return body;
}

function PartyPassControls({
  passOptions,
  passBusy,
  onPass,
  onFinishSlice,
  finishLabel = "Done",
}) {
  if (!passOptions.length) {
    return (
      <div className="border-t border-border/40 pt-2">
        <button
          type="button"
          disabled={passBusy}
          onClick={onFinishSlice}
          className="rounded-sm border border-starlight/60 px-2 py-0.5 text-[10px] font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
        >
          {finishLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
      <span className="text-[10px] font-black uppercase text-ink-faint">Pass to</span>
      {passOptions.map((member) => (
        <button
          key={member.id}
          type="button"
          disabled={passBusy}
          onClick={() => onPass(member)}
          className="rounded-sm border border-neon-cyan/50 px-2 py-0.5 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
        >
          {member.name}
        </button>
      ))}
      <button
        type="button"
        disabled={passBusy}
        onClick={onFinishSlice}
        className="rounded-sm border border-starlight/60 px-2 py-0.5 text-[10px] font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
      >
        {finishLabel}
      </button>
    </div>
  );
}

export function InitiativeWidget({
  campaignId,
  characterId,
  token,
  isOwner,
  sheet,
  orientation = INITIATIVE_ORIENTATION_VERTICAL,
  onOrientationChange,
  onCombatEnded,
  onSheetRefresh,
  onSheetChange,
}) {
  const isHorizontal = orientation === INITIATIVE_ORIENTATION_HORIZONTAL;
  const initiativeBonus = getInitiativeBonus(sheet);
  const [encounter, setEncounter] = useState({
    round: 1,
    active_index: 0,
    active_combatant_id: null,
    combatants: [],
    turn_economy: {},
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [manualInit, setManualInit] = useState("");
  const [lastRoll, setLastRoll] = useState(null);
  const [actionError, setActionError] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dmActionSheet, setDmActionSheet] = useState(null);
  const [dmSheetLoading, setDmSheetLoading] = useState(false);
  const [partyPcSheets, setPartyPcSheets] = useState({});
  const [movementBusy, setMovementBusy] = useState(false);
  const [portraitPreview, setPortraitPreview] = useState(null);
  const [passTarget, setPassTarget] = useState(null);
  const [passBusy, setPassBusy] = useState(false);
  const [combatResolution, setCombatResolution] = useState(null);
  const savingRef = useRef(false);
  const encounterSnapshotRef = useRef(encounter);

  useEffect(() => {
    if (!combatResolution) {
      encounterSnapshotRef.current = encounter;
    }
  }, [encounter, combatResolution]);

  const notifyCombatEnded = useCallback(
    (logText, reason) => {
      setCombatResolution({
        reason,
        logText,
        encounter: encounterSnapshotRef.current,
      });
      setSelectedId(null);
      onCombatEnded?.(logText, reason);
    },
    [onCombatEnded]
  );

  const loadEncounter = useCallback(async () => {
    if (!token || !campaignId || savingRef.current) return;
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter`, { token });
      if (!res.ok) throw new Error("Load failed");
      setEncounter(await res.json());
      setError("");
    } catch {
      setError("Could not load initiative.");
    } finally {
      setLoading(false);
    }
  }, [token, campaignId]);

  useEffect(() => {
    loadEncounter();
    const timer = setInterval(loadEncounter, 5000);
    return () => clearInterval(timer);
  }, [loadEncounter]);

  const viewEncounter = combatResolution?.encounter ?? encounter;
  const teamMode = isTeamMode(viewEncounter);
  const partyPhase = isPartyPhaseActive(viewEncounter);
  const trackerCombatants = buildTrackerCombatants(viewEncounter, { isDmView: isOwner });
  const displaySorted = trackerCombatants;
  const activeCombatant = resolveActiveCombatant(viewEncounter);
  const myCombatant = resolveMyCombatant(viewEncounter, characterId);
  const isMyTurn = Boolean(
    myCombatant && viewEncounter.active_combatant_id === myCombatant.id
  );
  const activeCombatantId = viewEncounter.active_combatant_id ?? activeCombatant?.id ?? null;
  const waitingForInitiative =
    !teamMode && isWaitingForPcInitiative(viewEncounter.combatants);
  const passOptions = passTargets(viewEncounter);
  const partyInitDisplay = viewEncounter.team?.party_initiative ?? 0;
  const controllerOptions = partyControllerOptions(viewEncounter);

  const reloadDmActionSheet = useCallback(async () => {
    if (!isOwner || !token || !campaignId || !activeCombatantId) {
      setDmActionSheet(null);
      return;
    }
    setDmSheetLoading(true);
    try {
      const res = await apiFetch(
        `/campaigns/${campaignId}/encounter/combatants/${activeCombatantId}/action-sheet`,
        { token }
      );
      if (!res.ok) throw new Error("Load failed");
      const data = await res.json();
      setDmActionSheet(data.sheet || {});
    } catch {
      setDmActionSheet({});
    } finally {
      setDmSheetLoading(false);
    }
  }, [isOwner, token, campaignId, activeCombatantId]);

  const loadPartyPcSheets = useCallback(async () => {
    if (!isOwner || !token || !campaignId) {
      setPartyPcSheets({});
      return;
    }
    const byCharacterId = new Map();
    for (const combatant of viewEncounter.combatants || []) {
      if (combatant.character_id && combatant.is_pc) {
        byCharacterId.set(combatant.character_id, combatant.id);
      }
    }
    if (byCharacterId.size === 0) {
      setPartyPcSheets({});
      return;
    }
    const entries = await Promise.all(
      [...byCharacterId.entries()].map(async ([charId, combatantId]) => {
        try {
          const res = await apiFetch(
            `/campaigns/${campaignId}/encounter/combatants/${combatantId}/action-sheet`,
            { token }
          );
          if (!res.ok) return [charId, null];
          const data = await res.json();
          return [charId, data.sheet || null];
        } catch {
          return [charId, null];
        }
      })
    );
    setPartyPcSheets(
      Object.fromEntries(entries.filter(([, sheetData]) => sheetData))
    );
  }, [isOwner, token, campaignId, viewEncounter.combatants]);

  useEffect(() => {
    void reloadDmActionSheet();
  }, [reloadDmActionSheet, viewEncounter.combat_log?.length]);

  useEffect(() => {
    void loadPartyPcSheets();
  }, [loadPartyPcSheets, viewEncounter.combat_log?.length]);

  const handleSheetRefresh = useCallback(() => {
    onSheetRefresh?.();
    void reloadDmActionSheet();
    void loadPartyPcSheets();
  }, [onSheetRefresh, reloadDmActionSheet, loadPartyPcSheets]);

  const handleInventoryEquip = useCallback(
    async ({ item, equipped, characterId: targetCharacterId }) => {
      const targetId = targetCharacterId || characterId;
      if (!targetId) {
        throw new Error("No character linked to this combatant.");
      }
      if (targetId === characterId) {
        if (!onSheetChange) {
          throw new Error("Sheet updates are not available.");
        }
        const inventory = sheet?.inventory || [];
        const index = inventory.findIndex(
          (entry) => (item?.id && entry.id === item.id) || entry.name === item?.name
        );
        if (index < 0) {
          throw new Error("Item not found on your sheet.");
        }
        onSheetChange(setInventoryItemEquipped(sheet, index, equipped), { immediate: true });
        return;
      }
      if (!token) {
        throw new Error("Not signed in.");
      }
      const remoteSheet = partyPcSheets[targetId] || dmActionSheet;
      if (!remoteSheet) {
        throw new Error("Could not load that character's sheet.");
      }
      const nextSheet = await patchInventoryItemEquipped({
        token,
        characterId: targetId,
        sheet: remoteSheet,
        item,
        equipped,
      });
      setPartyPcSheets((prev) => ({ ...prev, [targetId]: nextSheet }));
      if (activeCombatant?.character_id === targetId) {
        setDmActionSheet(nextSheet);
      }
    },
    [
      characterId,
      onSheetChange,
      sheet,
      token,
      partyPcSheets,
      dmActionSheet,
      activeCombatant?.character_id,
    ]
  );

  const submitInitiative = async (body) => {
    if (!token || !campaignId) return;
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/submit-initiative`, {
        token,
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Submit failed");
      }
      const data = await res.json();
      setEncounter(data.encounter);
      setLastRoll({
        total: data.total,
        d20: data.d20_roll,
        bonus: data.bonus,
      });
      setManualInit("");
    } catch (err) {
      setActionError(err.message || "Could not submit initiative.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAutoRoll = () => submitInitiative({ auto_roll: true });

  const handleManualSubmit = (event) => {
    event.preventDefault();
    const value = parseInt(manualInit, 10);
    if (Number.isNaN(value)) return;
    submitInitiative({ initiative: value });
  };

  const passCombatTo = async (targetCombatantId) => {
    if (!token || !campaignId) return;
    setPassBusy(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/pass-combat`, {
        token,
        method: "POST",
        body: {
          target_combatant_id: targetCombatantId,
          ...partySliceRequestBody(activeCombatant, isOwner),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not pass combat");
      }
      const parsed = parseEncounterPatchResponse(await res.json());
      setEncounter(parsed.encounter);
      setPassTarget(null);
    } catch (err) {
      setActionError(err.message || "Could not pass combat.");
    } finally {
      setPassBusy(false);
    }
  };

  const finishPartySlice = async () => {
    if (!token || !campaignId) return;
    setPassBusy(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/finish-party-slice`, {
        token,
        method: "POST",
        body: partySliceRequestBody(activeCombatant, isOwner),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not end turn");
      }
      const parsed = parseEncounterPatchResponse(await res.json());
      setEncounter(parsed.encounter);
      if (parsed.combatEnded) {
        setSelectedId(null);
        notifyCombatEnded(parsed.combatLogText, parsed.reason);
      }
    } catch (err) {
      setActionError(err.message || "Could not end turn.");
    } finally {
      setPassBusy(false);
    }
  };

  const endPartyTurnEarly = async () => {
    if (!token || !campaignId || !isOwner) return;
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/end-party-turn`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not end party turn");
      }
      const parsed = parseEncounterPatchResponse(await res.json());
      setEncounter(parsed.encounter);
    } catch (err) {
      setActionError(err.message || "Could not end party turn.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndTurn = async () => {
    if (!token || !campaignId) return;
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/next-turn`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not end turn");
      }
      const parsed = parseEncounterPatchResponse(await res.json());
      setEncounter(parsed.encounter);
      if (parsed.combatEnded) {
        setSelectedId(null);
        notifyCombatEnded(parsed.combatLogText, parsed.reason);
      }
    } catch (err) {
      setActionError(err.message || "Could not end turn.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndCombat = async () => {
    if (!token || !campaignId || !isOwner) return;
    setSubmitting(true);
    setActionError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/end-combat`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not end combat");
      }
      const data = await res.json();
      setEncounter(data.encounter || { round: 1, combatants: [] });
      setSelectedId(null);
      notifyCombatEnded(data.combat_log_text, data.reason);
    } catch (err) {
      setActionError(err.message || "Could not end combat.");
    } finally {
      setSubmitting(false);
    }
  };

  const saveEncounter = useCallback(
    async (next) => {
      if (!token || !campaignId || !isOwner) return;
      savingRef.current = true;
      setSaving(true);
      setEncounter(next);
      setActionError("");
      try {
        const res = await apiFetch(`/campaigns/${campaignId}/encounter`, {
          token,
          method: "PATCH",
          body: encounterPatchBody(next),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Could not save");
        }
        const parsed = parseEncounterPatchResponse(await res.json());
        setEncounter(parsed.encounter);
        if (parsed.combatEnded) {
          setSelectedId(null);
          notifyCombatEnded(parsed.combatLogText, parsed.reason);
        }
      } catch (err) {
        setActionError(err.message || "Could not save combatant.");
        await loadEncounter();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [token, campaignId, isOwner, loadEncounter, notifyCombatEnded]
  );

  const updateCombatant = (id, patch) => {
    saveEncounter({
      ...encounter,
      combatants: encounter.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const adjustMovement = useCallback(
    async (combatantId, delta) => {
      if (!token || !campaignId || delta === 0) return;
      setMovementBusy(true);
      setActionError("");
      try {
        const res = await apiFetch(`/campaigns/${campaignId}/encounter/adjust-movement`, {
          token,
          method: "POST",
          body: { combatant_id: combatantId, delta },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Could not adjust movement");
        }
        setEncounter(await res.json());
      } catch (err) {
        setActionError(err.message || "Could not adjust movement.");
      } finally {
        setMovementBusy(false);
      }
    },
    [token, campaignId]
  );

  const handleRevealCombatant = useCallback(
    async (combatantId) => {
      if (!token || !campaignId || !isOwner) return;
      savingRef.current = true;
      setSaving(true);
      setActionError("");
      try {
        const parsed = await revealHiddenCombatant(token, campaignId, combatantId);
        setEncounter(parsed.encounter);
        if (parsed.combatEnded) {
          setSelectedId(null);
          notifyCombatEnded(parsed.combatLogText, parsed.reason);
        }
      } catch (err) {
        setActionError(err.message || "Could not reveal enemy.");
        await loadEncounter();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [token, campaignId, isOwner, loadEncounter, notifyCombatEnded]
  );

  const removeCombatant = (id) => {
    const nextCombatants = encounter.combatants.filter((c) => c.id !== id);
    if (selectedId === id) setSelectedId(null);
    const removedActive = encounter.active_combatant_id === id;
    saveEncounter({
      ...encounter,
      combatants: nextCombatants,
      active_combatant_id: removedActive ? null : encounter.active_combatant_id,
      active_index: Math.min(encounter.active_index, Math.max(0, nextCombatants.length - 1)),
    });
  };

  const selectedCombatant = displaySorted.find((c) => c.id === selectedId) || null;
  const dmBusy = submitting || saving;

  const handleSelectCombatant = (id) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  if (loading) {
    return <p className="text-xs sm:text-sm font-mono text-ink-faint">Loading initiative...</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs sm:text-sm font-mono text-danger">{error}</p>
        <button
          type="button"
          onClick={loadEncounter}
          className="text-xs sm:text-sm font-black uppercase text-neon-cyan hover:text-starlight"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleOrientation = (nextOrientation) => {
    if (nextOrientation === orientation) return;
    onOrientationChange?.(nextOrientation, displaySorted.length);
  };

  const renderTracker = () => {
    if (displaySorted.length === 0) {
      return (
        <p className="text-xs font-mono text-ink-faint">
          Roll initiative to join the tracker when combat starts.
        </p>
      );
    }
    if (isHorizontal) {
      return (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {displaySorted.map((combatant, index) => {
            const defeated = isDefeatedEnemy(combatant);
            const isActive = isTrackerEntryActive(combatant, viewEncounter, activeCombatant);
            const isYou = isPartySlotEntry(combatant)
              ? partyRoster(viewEncounter).some((member) => member.character_id === characterId)
              : combatant.character_id === characterId;
            return (
              <InitiativeCombatantCard
                key={combatant.id}
                combatant={combatant}
                combatants={viewEncounter.combatants}
                index={index}
                isActive={isActive}
                isYou={isYou}
                isDmView={false}
                isDefeated={defeated}
                onPortraitPreview={setPortraitPreview}
                token={token}
                turnEconomy={viewEncounter.turn_economy}
                resourceSheet={resourceSheetForCombatant(combatant, {
                  characterId,
                  sheet,
                  partyPcSheets: null,
                  dmActionSheet: null,
                  isOwner: false,
                })}
              />
            );
          })}
        </div>
      );
    }
    return (
      <ul className="space-y-1.5">
        {displaySorted.map((combatant, index) => {
          const defeated = isDefeatedEnemy(combatant);
          const isActive = isTrackerEntryActive(combatant, viewEncounter, activeCombatant);
          const isYou = isPartySlotEntry(combatant)
            ? partyRoster(viewEncounter).some((member) => member.character_id === characterId)
            : combatant.character_id === characterId;
          return (
            <InitiativeCombatantRow
              key={combatant.id}
              combatant={combatant}
              combatants={viewEncounter.combatants}
              index={index}
              isActive={isActive}
              isYou={isYou}
              isDmView={false}
              isDefeated={defeated}
              onPortraitPreview={setPortraitPreview}
              token={token}
              turnEconomy={viewEncounter.turn_economy}
              resourceSheet={resourceSheetForCombatant(combatant, {
                characterId,
                sheet,
                partyPcSheets: null,
                dmActionSheet: null,
                isOwner: false,
              })}
            />
          );
        })}
      </ul>
    );
  };

  const dmPartyPassSlot =
    isOwner && partyPhase && activeCombatant?.character_id ? (
      <PartyPassControls
        passOptions={passOptions}
        passBusy={passBusy}
        onPass={setPassTarget}
        onFinishSlice={finishPartySlice}
        finishLabel="Done slice"
      />
    ) : null;

  if (!isOwner) {
    const combatActive = combatHasStarted(viewEncounter) || hasTurnOrder(viewEncounter);
    const needsInitRoll = playerNeedsInitiativeRoll(encounter, characterId);
    const turnHeaderSlot =
      isMyTurn && (partyPhase || !teamMode) ? (
        partyPhase ? (
          <PartyPassControls
            passOptions={passOptions}
            passBusy={passBusy}
            onPass={setPassTarget}
            onFinishSlice={finishPartySlice}
          />
        ) : (
          <div className="border-t border-border/40 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleEndTurn}
              className="rounded-sm border border-starlight bg-starlight/10 px-2 py-0.5 text-[10px] font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
            >
              End turn
            </button>
          </div>
        )
      ) : null;

    return (
      <div className="session-ui flex h-full min-h-0 flex-col gap-2">
        <CombatResolutionBanner
          resolution={combatResolution}
          onDismiss={() => setCombatResolution(null)}
        />
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-ink-faint">
            Round <span className="text-lg text-neon-cyan">{viewEncounter.round}</span>
          </p>
          <div className="flex items-center gap-1">
            <div className="flex overflow-hidden rounded-sm border border-border">
              <button
                type="button"
                onClick={() => handleOrientation(INITIATIVE_ORIENTATION_VERTICAL)}
                className={`p-1.5 ${
                  !isHorizontal
                    ? "bg-neon-cyan/20 text-starlight"
                    : "text-ink-faint hover:bg-border/40 hover:text-starlight"
                }`}
                title="Vertical list"
              >
                <Rows3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleOrientation(INITIATIVE_ORIENTATION_HORIZONTAL)}
                className={`border-l border-border p-1.5 ${
                  isHorizontal
                    ? "bg-neon-cyan/20 text-starlight"
                    : "text-ink-faint hover:bg-border/40 hover:text-starlight"
                }`}
                title="Horizontal row"
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={loadEncounter}
              className="rounded p-1.5 text-ink-faint hover:bg-border/40 hover:text-starlight"
              title="Refresh initiative"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-[42%] shrink-0 overflow-auto rounded-sm border border-border/60 bg-void-deep/30 p-2">
          {renderTracker()}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {actionError && (
            <p className="shrink-0 text-xs font-mono text-danger">{actionError}</p>
          )}

          {isMyTurn && myCombatant && combatActive ? (
            <TurnActionsPanel
              campaignId={campaignId}
              token={token}
              sheet={sheet}
              actionCatalogMode="pc"
              encounter={viewEncounter}
              actorCombatant={myCombatant}
              canTakeTurn
              canAdjustMovement
              headerSlot={turnHeaderSlot}
              onEncounterUpdate={setEncounter}
              onSheetRefresh={handleSheetRefresh}
              onInventoryEquip={handleInventoryEquip}
              onCombatEnded={notifyCombatEnded}
              onError={setActionError}
            />
          ) : needsInitRoll ? (
            <div className="shrink-0 space-y-2 rounded-sm border border-border-bright bg-void-deep/50 p-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink-faint">
                {teamMode ? "Roll for team initiative" : "Roll initiative"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleAutoRoll}
                  className="flex items-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
                >
                  <Dices className="h-3.5 w-3.5" />
                  Roll d20{formatModifier(initiativeBonus)}
                </button>
                <form onSubmit={handleManualSubmit} className="flex items-center gap-1">
                  <input
                    type="number"
                    value={manualInit}
                    onChange={(e) => setManualInit(e.target.value)}
                    placeholder="Total"
                    className="w-14 rounded-sm border border-border bg-black px-2 py-1 text-center text-xs font-mono text-starlight"
                  />
                  <button
                    type="submit"
                    disabled={submitting || manualInit === ""}
                    className="rounded-sm border border-border px-2 py-1 text-xs font-black uppercase text-ink-muted hover:text-starlight disabled:opacity-40"
                  >
                    Set
                  </button>
                </form>
              </div>
              {teamMode && (
                <p className="text-[10px] font-mono text-ink-faint">
                  Your roll counts toward the party slot (floor of average).
                </p>
              )}
              {lastRoll && lastRoll.d20 != null && (
                <p className="text-xs font-mono text-neon-cyan">
                  Rolled {lastRoll.d20} {formatModifier(lastRoll.bonus)} ={" "}
                  <span className="font-black text-starlight">{lastRoll.total}</span>
                </p>
              )}
            </div>
          ) : combatActive ? (
            <p className="shrink-0 rounded-sm border border-border/60 bg-void-deep/40 px-2 py-2 text-xs font-mono text-ink-muted">
              {partyPhase && activeCombatant
                ? `Party turn — ${activeCombatant.name} is acting`
                : activeCombatant
                  ? `Waiting — ${activeCombatant.name}'s turn`
                  : "Waiting for the next turn…"}
            </p>
          ) : (
            <p className="shrink-0 text-xs font-mono text-ink-faint">
              Combat has not started yet.
            </p>
          )}

          {combatActive && viewEncounter.combat_log?.length > 0 && (
            <details className="shrink-0 rounded-sm border border-border/50 bg-void-deep/25 px-2 py-1.5">
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-ink-faint">
                Combat log
              </summary>
              <div className="mt-2">
                <EncounterCombatLog log={viewEncounter.combat_log} limit={5} bare />
              </div>
            </details>
          )}
        </div>

        <PortraitPreviewModal
          open={!!portraitPreview}
          portraitUrl={portraitPreview?.portraitUrl}
          name={portraitPreview?.name}
          token={token}
          onClose={() => setPortraitPreview(null)}
        />

        <PassCombatDialog
          open={Boolean(passTarget)}
          targetName={passTarget?.name}
          busy={passBusy}
          onConfirm={() => passCombatTo(passTarget.id)}
          onCancel={() => setPassTarget(null)}
        />
      </div>
    );
  }

  return (
    <div className="session-ui flex h-full min-h-0 flex-col gap-2 sm:gap-3">
      <CombatResolutionBanner
        resolution={combatResolution}
        onDismiss={() => setCombatResolution(null)}
      />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-2 sm:pb-3">
        <div>
          <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-ink-faint">Round</p>
          <p className="text-lg font-black text-neon-cyan">{viewEncounter.round}</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex overflow-hidden rounded-sm border border-border">
            <button
              type="button"
              onClick={() => handleOrientation(INITIATIVE_ORIENTATION_VERTICAL)}
              className={`p-1.5 ${
                !isHorizontal
                  ? "bg-neon-cyan/20 text-starlight"
                  : "text-ink-faint hover:bg-border/40 hover:text-starlight"
              }`}
              title="Vertical list"
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleOrientation(INITIATIVE_ORIENTATION_HORIZONTAL)}
              className={`border-l border-border p-1.5 ${
                isHorizontal
                  ? "bg-neon-cyan/20 text-starlight"
                  : "text-ink-faint hover:bg-border/40 hover:text-starlight"
              }`}
              title="Horizontal row"
            >
              <Columns3 className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={loadEncounter}
            className="rounded p-1.5 text-ink-faint hover:bg-border/40 hover:text-starlight"
            title="Refresh initiative"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {teamMode && partyRoster(encounter).length > 0 && partyPhase && (
        <div className="shrink-0 rounded-sm border border-starlight/60 bg-starlight/5 px-2 py-2">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-neon-cyan">
            Party turn
          </p>
          {activeCombatant && (
            <p className="truncate text-xs font-black uppercase text-starlight">
              Active: {activeCombatant.name}
            </p>
          )}
          {showPartyInitiative(encounter, { isDmView: isOwner }) && (
            <p className="text-[10px] font-mono text-ink-muted">
              Party init: <span className="text-starlight">{partyInitDisplay}</span>
            </p>
          )}
        </div>
      )}

      {!isHorizontal && activeCombatant && !partyPhase ? (
        <div className="shrink-0 rounded-sm border border-starlight/60 bg-starlight/5 px-2 py-1.5">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">Active turn</p>
          <p className="truncate text-xs font-black uppercase text-starlight">{activeCombatant.name}</p>
        </div>
      ) : !isHorizontal && !partyPhase ? (
        <p className="shrink-0 text-xs sm:text-sm font-mono text-ink-faint">
          {waitingForInitiative
            ? "Waiting for party initiative rolls…"
            : teamMode
              ? "Party turn will start when initiative reaches the party slot."
              : "No active turn yet."}
        </p>
      ) : null}

      {characterId && (
        <div className="shrink-0 space-y-2 rounded-sm border border-border-bright bg-void-deep/50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleAutoRoll}
              className="flex items-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs sm:text-sm font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              <Dices className="h-3.5 w-3.5" />
              Roll d20{formatModifier(initiativeBonus)}
            </button>
            <form onSubmit={handleManualSubmit} className="flex items-center gap-1">
              <input
                type="number"
                value={manualInit}
                onChange={(e) => setManualInit(e.target.value)}
                placeholder="Manual"
                className="w-16 rounded-sm border border-border bg-black px-2 py-1 text-center text-xs sm:text-sm font-mono text-starlight"
                title="Enter your total initiative if you rolled at the table"
              />
              <button
                type="submit"
                disabled={submitting || manualInit === ""}
                className="rounded-sm border border-border px-2 py-1 text-xs sm:text-sm font-black uppercase text-ink-muted hover:text-starlight disabled:opacity-40"
              >
                Set
              </button>
            </form>
            {isMyTurn && !waitingForInitiative && !partyPhase && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleEndTurn}
                className="rounded-sm border border-starlight bg-starlight/10 px-2 py-1 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
              >
                End Turn
              </button>
            )}
            {teamMode && showPartyInitiative(encounter, { isDmView: isOwner }) && (
              <p className="w-full text-[10px] font-mono text-ink-faint">
                Team initiative (5.5e): your roll counts toward the party slot (floor of average).
              </p>
            )}
          </div>
          {myCombatant && (
            <p className="text-xs sm:text-sm font-mono text-ink-faint">
              Your initiative: <span className="text-starlight font-black">{myCombatant.initiative}</span>
            </p>
          )}
          {lastRoll && lastRoll.d20 != null && (
            <p className="text-xs sm:text-sm font-mono text-neon-cyan">
              Rolled {lastRoll.d20} {formatModifier(lastRoll.bonus)} ={" "}
              <span className="font-black text-starlight">{lastRoll.total}</span>
            </p>
          )}
          {actionError && <p className="text-xs sm:text-sm font-mono text-danger">{actionError}</p>}
        </div>
      )}

      {!isOwner && characterId && myCombatant && hasTurnOrder(viewEncounter) && (!partyPhase || isMyTurn) && (
        <TurnActionsPanel
          campaignId={campaignId}
          token={token}
          sheet={sheet}
          actionCatalogMode="pc"
          encounter={viewEncounter}
          actorCombatant={myCombatant}
          canTakeTurn={isMyTurn}
          canAdjustMovement={isMyTurn}
          activeTurnName={activeCombatant?.name}
          onEncounterUpdate={setEncounter}
          onSheetRefresh={handleSheetRefresh}
          onInventoryEquip={handleInventoryEquip}
          onCombatEnded={notifyCombatEnded}
          onError={setActionError}
        />
      )}

      {isOwner && (
        <ReadiedActionsPanel
          campaignId={campaignId}
          token={token}
          encounter={viewEncounter}
          onEncounterUpdate={setEncounter}
          onError={setActionError}
          compact
        />
      )}

      {isOwner &&
        activeCombatant &&
        hasTurnOrder(viewEncounter) &&
        (!activeCombatant.is_pc || !activeCombatant.character_id) && (
        <TurnActionsPanel
          campaignId={campaignId}
          token={token}
          encounter={viewEncounter}
          actorCombatant={activeCombatant}
          canTakeTurn
          canAdjustMovement
          isDmProxy
          headerSlot={dmPartyPassSlot}
          actionCatalogMode="npc"
          actionSheet={dmActionSheet}
          actionSheetLoading={dmSheetLoading}
          onEncounterUpdate={setEncounter}
          onSheetRefresh={handleSheetRefresh}
          onCombatEnded={notifyCombatEnded}
          onError={setActionError}
        />
      )}

      {hasTurnOrder(viewEncounter) && viewEncounter.combat_log?.length > 0 && (
        <EncounterCombatLog log={viewEncounter.combat_log} />
      )}

      {displaySorted.length === 0 ? (
        <p className="text-xs sm:text-sm font-mono text-ink-faint">
          {isOwner
            ? "Add enemies from Generators or party from the Party pane."
            : "Roll initiative to join the tracker when combat starts."}
        </p>
      ) : isHorizontal ? (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
          {displaySorted.map((combatant, index) => {
            const defeated = isDefeatedEnemy(combatant);
            const isActive = isTrackerEntryActive(combatant, viewEncounter, activeCombatant);
            const isYou = isPartySlotEntry(combatant)
              ? partyRoster(viewEncounter).some((member) => member.character_id === characterId)
              : combatant.character_id === characterId;
            return (
              <InitiativeCombatantCard
                key={combatant.id}
                combatant={combatant}
                combatants={viewEncounter.combatants}
                index={index}
                isActive={isActive}
                isYou={isYou}
                isDmView={isOwner}
                isSelected={isOwner && selectedId === combatant.id}
                isDefeated={defeated}
                onSelect={
                  isOwner && !isPartySlotEntry(combatant) ? handleSelectCombatant : undefined
                }
                onPortraitPreview={setPortraitPreview}
                token={token}
                turnEconomy={viewEncounter.turn_economy}
                resourceSheet={resourceSheetForCombatant(combatant, {
                  characterId,
                  sheet,
                  partyPcSheets,
                  dmActionSheet,
                  isOwner,
                })}
              />
            );
          })}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {displaySorted.map((combatant, index) => {
            const defeated = isDefeatedEnemy(combatant);
            const isActive = isTrackerEntryActive(combatant, viewEncounter, activeCombatant);
            const isYou = isPartySlotEntry(combatant)
              ? partyRoster(viewEncounter).some((member) => member.character_id === characterId)
              : combatant.character_id === characterId;
            return (
              <InitiativeCombatantRow
                key={combatant.id}
                combatant={combatant}
                combatants={viewEncounter.combatants}
                index={index}
                isActive={isActive}
                isYou={isYou}
                isDmView={isOwner}
                isSelected={isOwner && selectedId === combatant.id}
                isDefeated={defeated}
                onSelect={
                  isOwner && !isPartySlotEntry(combatant) ? handleSelectCombatant : undefined
                }
                onPortraitPreview={setPortraitPreview}
                token={token}
                turnEconomy={viewEncounter.turn_economy}
                resourceSheet={resourceSheetForCombatant(combatant, {
                  characterId,
                  sheet,
                  partyPcSheets,
                  dmActionSheet,
                  isOwner,
                })}
              />
            );
          })}
        </ul>
      )}

      <PortraitPreviewModal
        open={!!portraitPreview}
        portraitUrl={portraitPreview?.portraitUrl}
        name={portraitPreview?.name}
        token={token}
        onClose={() => setPortraitPreview(null)}
      />

      {isOwner && selectedCombatant && (
        <div className="shrink-0 border-t border-border pt-2">
          <DmCombatantEditor
            combatant={selectedCombatant}
            saving={saving}
            onPatch={(patch) => updateCombatant(selectedCombatant.id, patch)}
            onRemove={() => removeCombatant(selectedCombatant.id)}
            onClose={() => setSelectedId(null)}
            combatStarted={combatHasStarted(encounter)}
            onReveal={() => handleRevealCombatant(selectedCombatant.id)}
            isActiveTurn={activeCombatant?.id === selectedCombatant.id}
            movementRemaining={
              encounter.turn_economy?.[selectedCombatant.id]?.movement_remaining ?? null
            }
            movementBusy={movementBusy}
            teamMode={teamMode}
            controllerOptions={controllerOptions}
            onAdjustMovement={
              activeCombatant?.id === selectedCombatant.id
                ? (delta) => adjustMovement(selectedCombatant.id, delta)
                : undefined
            }
          />
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-border pt-2">
        {isOwner && hasTurnOrder(encounter) && (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={dmBusy || partyPhase}
              onClick={handleEndTurn}
              title={partyPhase ? "Use pass combat during a party turn" : "Advance turn"}
              className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-starlight px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
            >
              <ChevronRight className="h-3 w-3" />
              Next turn
            </button>
            {partyPhase && (
              <button
                type="button"
                disabled={dmBusy}
                onClick={endPartyTurnEarly}
                className="flex-1 rounded-sm border border-zinc-600 px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-zinc-400 hover:border-starlight disabled:opacity-40"
              >
                End party turn
              </button>
            )}
            <button
              type="button"
              disabled={dmBusy}
              onClick={handleEndCombat}
              className="flex-1 rounded-sm border border-danger/60 px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              End combat
            </button>
          </div>
        )}
        {isOwner && saving && (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">Saving…</p>
        )}
        {isOwner && actionError && (
          <p className="text-xs sm:text-sm font-mono text-danger">{actionError}</p>
        )}
        {!isOwner && (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">
            {teamMode
              ? "Roll for team initiative · Pass combat during party turns (5.5e)"
              : "Roll to join combat · End turn on your initiative (5.5e)"}
          </p>
        )}
      </div>

      <PassCombatDialog
        open={Boolean(passTarget)}
        targetName={passTarget?.name}
        busy={passBusy}
        onConfirm={() => passCombatTo(passTarget.id)}
        onCancel={() => setPassTarget(null)}
      />
    </div>
  );
}

function loadVttState(campaignId) {
  try {
    const raw = localStorage.getItem(`vtt-zone-${campaignId}`);
    return raw ? JSON.parse(raw) : { embedUrl: "", tokens: [] };
  } catch {
    return { embedUrl: "", tokens: [] };
  }
}

function saveVttState(campaignId, state) {
  localStorage.setItem(`vtt-zone-${campaignId}`, JSON.stringify(state));
}

export function VttZoneWidget({ campaignId }) {
  const [embedUrl, setEmbedUrl] = useState("");
  const [tokens, setTokens] = useState([]);
  const [newTokenName, setNewTokenName] = useState("");
  const [showEmbed, setShowEmbed] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    const saved = loadVttState(campaignId);
    setEmbedUrl(saved.embedUrl || "");
    setTokens(saved.tokens || []);
    setShowEmbed(Boolean(saved.embedUrl));
  }, [campaignId]);

  const persist = (nextEmbed, nextTokens) => {
    if (!campaignId) return;
    saveVttState(campaignId, { embedUrl: nextEmbed, tokens: nextTokens });
  };

  const addToken = () => {
    const name = newTokenName.trim();
    if (!name) return;
    const next = [
      ...tokens,
      {
        id: `t-${Date.now()}`,
        name,
        x: Math.floor(Math.random() * 8),
        y: Math.floor(Math.random() * 6),
      },
    ];
    setTokens(next);
    setNewTokenName("");
    persist(embedUrl, next);
  };

  const moveToken = (id, dx, dy) => {
    const next = tokens.map((token) => {
      if (token.id !== id) return token;
      return {
        ...token,
        x: Math.max(0, Math.min(11, (token.x || 0) + dx)),
        y: Math.max(0, Math.min(7, (token.y || 0) + dy)),
      };
    });
    setTokens(next);
    persist(embedUrl, next);
  };

  const applyEmbed = () => {
    setShowEmbed(Boolean(embedUrl.trim()));
    persist(embedUrl.trim(), tokens);
  };

  if (showEmbed && embedUrl.trim()) {
    return (
      <div className="flex h-full min-h-[120px] flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">VTT embed</p>
          <button
            type="button"
            onClick={() => setShowEmbed(false)}
            className="text-[11px] sm:text-xs font-black uppercase text-neon-cyan hover:underline"
          >
            Grid view
          </button>
        </div>
        <iframe
          title="External VTT"
          src={embedUrl.trim()}
          className="min-h-[140px] flex-1 rounded-sm border border-border bg-black"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[120px] flex-col gap-2 rounded-sm border border-dashed border-border bg-void-deep/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] text-ink-faint">Battle grid</p>
        <span className="text-[11px] sm:text-xs font-mono text-ink-faint">12×8 · local</span>
      </div>
      <div
        className="relative grid flex-1 gap-px rounded-sm border border-border/60 bg-border/20"
        style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gridTemplateRows: "repeat(8, minmax(0, 1fr))" }}
      >
        {Array.from({ length: 96 }).map((_, index) => {
          const x = index % 12;
          const y = Math.floor(index / 12);
          const here = tokens.filter((token) => token.x === x && token.y === y);
          return (
            <div
              key={index}
              className="relative min-h-[14px] bg-void-deep/50"
              title={here.map((t) => t.name).join(", ")}
            >
              {here.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  onClick={() => moveToken(token.id, 1, 0)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    moveToken(token.id, -1, 0);
                  }}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-neon-cyan/20 text-[6px] font-black uppercase text-neon-cyan"
                  title={`${token.name} — click →, right-click ←`}
                >
                  {token.name.slice(0, 2)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        <input
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          placeholder="Token name"
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-starlight"
        />
        <button
          type="button"
          onClick={addToken}
          className="shrink-0 rounded-sm border border-neon-cyan px-2 py-1 text-[11px] sm:text-xs font-black uppercase text-neon-cyan"
        >
          Add
        </button>
      </div>
      <div className="flex gap-1">
        <input
          value={embedUrl}
          onChange={(e) => setEmbedUrl(e.target.value)}
          placeholder="Godot / VTT embed URL (optional)"
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-starlight"
        />
        <button
          type="button"
          onClick={applyEmbed}
          className="shrink-0 rounded-sm border border-border px-2 py-1 text-[11px] sm:text-xs font-black uppercase text-ink-faint"
        >
          Embed
        </button>
      </div>
    </div>
  );
}

export function EmptySheetHint({ character, onOpenFullSheet }) {
  return (
    <div className="p-3 text-center text-xs sm:text-sm font-mono text-zinc-500 border border-dashed border-zinc-700">
      <p className="mb-2">Sheet data not loaded yet.</p>
      {character.pdf_url ? (
        <button
          type="button"
          onClick={onOpenFullSheet}
          className="text-starlight hover:text-neon-cyan uppercase font-black"
        >
          Open digital sheet → Re-sync from PDF
        </button>
      ) : (
        <p>Upload a D&amp;D Beyond PDF from Campaigns.</p>
      )}
    </div>
  );
}

export function SheetDataGuard({ sheet, character, onOpenFullSheet, children }) {
  if (!hasSheetData(sheet)) {
    return <EmptySheetHint character={character} onOpenFullSheet={onOpenFullSheet} />;
  }
  return children;
}
