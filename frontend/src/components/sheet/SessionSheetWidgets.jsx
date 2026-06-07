import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Columns3, Dices, ImagePlus, RefreshCw, Rows3, Trash2, X } from "lucide-react";
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
  parseEncounterPatchResponse,
  sortCombatantsForDisplay,
  sortCombatantsForTurns,
} from "../../lib/encounterDisplay";
import { ConditionsEditor } from "./ConditionsEditor";
import { EncounterCombatLog, TurnActionsPanel } from "./TurnActionsPanel";
import { AbilityScoresGrid } from "./AbilityScoresGrid";
import { NotesPaneWidget } from "./NotesPaneWidget";
import { PartyMemberSheetModal } from "./PartyMemberSheetModal";
import {
  INITIATIVE_ORIENTATION_HORIZONTAL,
  INITIATIVE_ORIENTATION_VERTICAL,
} from "../../lib/sheetLayout";
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

function PartyMemberRow({ member, isYou, token, isOwner, onViewSheet }) {
  const hpLabel =
    member.hp != null && member.max_hp != null
      ? `${member.hp}/${member.max_hp}`
      : member.hp != null
        ? String(member.hp)
        : "—";
  const acLabel = member.ac != null ? String(member.ac) : "—";
  const speedLabel = member.speed != null ? `${member.speed} ft` : "—";
  const subtitle = [member.class_name, member.level != null ? `Lv ${member.level}` : null]
    .filter(Boolean)
    .join(" · ");

  const openSheet = () => onViewSheet?.(member);

  return (
    <li
      className={`flex items-center gap-2 rounded-sm border px-2 py-2 ${
        isYou ? "border-neon-cyan/60 bg-neon-cyan/5" : "border-border bg-void-deep/40"
      } ${isOwner && onViewSheet ? "hover:border-neon-cyan/40" : ""}`}
    >
      <CombatantAvatar
        portraitUrl={member.portrait_url}
        token={token}
        name={member.character_name}
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

export function PartyWidget({ campaignId, token, characterId, isOwner = false }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingAll, setAddingAll] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [sheetModalMember, setSheetModalMember] = useState(null);

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
      {actionMessage && (
        <p className="shrink-0 text-xs sm:text-sm font-mono text-neon-cyan">{actionMessage}</p>
      )}
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {members.map((member) => (
          <PartyMemberRow
            key={member.member_id}
            member={member}
            isYou={member.character_id === characterId}
            token={token}
            isOwner={isOwner}
            onViewSheet={isOwner ? setSheetModalMember : undefined}
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
    </div>
  );
}

function ClickableRow({ label, value, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2 py-1 text-left hover:bg-neon-magenta/10 border border-transparent hover:border-neon-magenta/30"
    >
      <span className="text-xs sm:text-sm text-zinc-400 truncate">{label}</span>
      <span className="text-xs font-black text-starlight shrink-0">{value}</span>
      {sub && <span className="text-xs sm:text-sm text-zinc-600 shrink-0">{sub}</span>}
    </button>
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

export function AbilitiesWidget({ sheet, onShowDetail, onSheetChange }) {
  return (
    <AbilityScoresGrid
      sheet={sheet}
      compact
      readOnly={!onSheetChange}
      onShowDetail={onShowDetail}
      onChange={onSheetChange}
    />
  );
}

export function SkillsSavesWidget({ sheet, onShowDetail }) {
  const proficientSkills = sheet.skills?.filter((s) => s.proficient || s.expertise) || [];
  const otherSkills = sheet.skills?.filter((s) => !s.proficient && !s.expertise) || [];

  return (
    <div className="space-y-3">
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

export function CharacterPortraitWidget({
  characterId,
  portraitUrl,
  portraitPhotoId,
  characterName,
  token,
  onPortraitChange,
}) {
  const inputRef = useRef(null);
  const [photos, setPhotos] = useState([]);
  const [activePortraitId, setActivePortraitId] = useState(portraitPhotoId ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const loadAlbum = useCallback(async () => {
    if (!characterId || !token) return;
    try {
      const res = await apiFetch(`/characters/${characterId}/photos`, { token });
      if (!res.ok) throw new Error("Could not load album");
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
    } catch (err) {
      console.error(err);
    }
  }, [characterId, token]);

  useEffect(() => {
    loadAlbum();
  }, [loadAlbum]);

  useEffect(() => {
    setActivePortraitId(portraitPhotoId ?? null);
  }, [portraitPhotoId]);

  const handleFile = async (file) => {
    if (!file || !characterId || !token) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiUpload(`/characters/${characterId}/photos`, { token, file });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not add photo");
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
      if (data.portrait_photo_id) {
        const charRes = await apiFetch(`/characters/${characterId}`, { token });
        if (charRes.ok) onPortraitChange(await charRes.json());
      }
    } catch (err) {
      setError(err.message || "Could not add photo.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleSelectPortrait = async (photoId) => {
    if (!characterId || !token || photoId === activePortraitId) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/portrait`, {
        token,
        method: "PUT",
        body: { photo_id: photoId },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not set portrait");
      }
      const character = await res.json();
      setActivePortraitId(character.portrait_photo_id ?? photoId);
      await loadAlbum();
      onPortraitChange(character);
    } catch (err) {
      setError(err.message || "Could not set portrait.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!characterId || !token) return;
    setUploading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/photos/${photoId}`, {
        token,
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not delete photo");
      }
      const data = await res.json();
      setPhotos(data.photos || []);
      setActivePortraitId(data.portrait_photo_id ?? null);
      const charRes = await apiFetch(`/characters/${characterId}`, { token });
      if (charRes.ok) onPortraitChange(await charRes.json());
    } catch (err) {
      setError(err.message || "Could not delete photo.");
    } finally {
      setUploading(false);
    }
  };

  const activePhoto = photos.find((photo) => photo.id === activePortraitId);
  const previewSrc =
    activePhoto?.url ||
    (portraitUrl && activePortraitId
      ? `${portraitUrl.split("?")[0]}?photo=${activePortraitId}`
      : portraitUrl);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-1">
      <div className="flex min-h-0 flex-[2] items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-void-deep/40 p-2">
        <AuthenticatedImage
          key={activePortraitId ?? "no-portrait"}
          src={previewSrc}
          token={token}
          alt={characterName || "Character"}
          className="max-h-full max-w-full rounded-sm border border-neon-cyan/30 object-contain"
          fallbackClassName="flex h-28 w-28 items-center justify-center rounded-sm border-2 border-dashed border-border text-3xl"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/20 p-1.5">
        <p className="mb-1 text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">Album</p>
        {photos.length === 0 ? (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">Add photos below, then tap one to set your portrait.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((photo) => {
              const isActive = photo.id === activePortraitId || photo.is_portrait;
              return (
                <div key={photo.id} className="group relative">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => handleSelectPortrait(photo.id)}
                    className={`block w-full overflow-hidden rounded-sm border-2 ${
                      isActive ? "border-starlight" : "border-border hover:border-neon-cyan/60"
                    }`}
                    title={isActive ? "Current portrait" : "Set as portrait"}
                  >
                    <AuthenticatedImage
                      src={photo.url}
                      token={token}
                      alt="Album photo"
                      className="aspect-square w-full object-cover"
                      fallbackClassName="aspect-square w-full bg-void-deep/80 text-sm"
                    />
                  </button>
                  {isActive && (
                    <span className="pointer-events-none absolute left-0.5 top-0.5 rounded-sm bg-starlight/90 px-1 text-[10px] sm:text-xs font-black uppercase text-black">
                      Portrait
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="absolute right-0.5 top-0.5 rounded-sm bg-black/80 p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    title="Delete photo"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="flex shrink-0 items-center justify-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs sm:text-sm font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
      >
        <ImagePlus className="h-3 w-3" />
        Add photo
      </button>
      {error && <p className="shrink-0 text-center text-xs sm:text-sm font-mono text-danger">{error}</p>}
      <p className="shrink-0 text-center text-[11px] sm:text-xs font-mono text-ink-faint">
        Up to 24 photos · JPEG, PNG, WebP, GIF · max 4 MB
      </p>
    </div>
  );
}

function CombatantAvatar({ portraitUrl, token, name, size = "sm" }) {
  const dimensions = size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  const cacheKey = portraitUrl?.split("photo=")[1] ?? portraitUrl;
  return (
    <AuthenticatedImage
      key={cacheKey}
      src={portraitUrl}
      token={token}
      alt={name}
      className={`${dimensions} shrink-0 rounded-sm border border-border object-cover`}
      fallbackClassName={`${dimensions} shrink-0 rounded-sm border border-border`}
    />
  );
}

export function PlayerNotesWidget({ tabs, closedTabs, activeTabId, onChange }) {
  return (
    <NotesPaneWidget
      tabs={tabs}
      closedTabs={closedTabs}
      activeTabId={activeTabId}
      onChange={onChange}
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

function InitiativeStatusBadges({ combatant, isYou, isDefeated }) {
  const badges = [];
  if (isDefeated) badges.push({ key: "defeated", label: "Defeated", className: "text-ink-faint" });
  if (isYou) badges.push({ key: "you", label: "You", className: "text-neon-cyan" });
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
  const conditions = formatConditionsList(combatant.conditions);
  const economy = isActive ? turnEconomy?.[combatant.id] : null;
  const turnStatuses = turnStatusLabels(economy, combatants);
  const resourceSummary = isActive ? formatCombatResources(resourceSheet) : null;
  return (
    <div className="flex w-full flex-col gap-0.5">
      <InitiativeLabeledStat label="Init" value={combatant.initiative} />
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
        <InitiativeLabeledStat label="Cond" value={conditions} valueClassName="text-neon-magenta" />
      ) : null}
    </div>
  );
}

function initiativeCardClass(isActive, isYou, isSelected = false, isDefeated = false) {
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
  isActiveTurn = false,
  movementRemaining = null,
  onAdjustMovement,
  movementBusy = false,
}) {
  const defeated = combatant.hp != null && combatant.hp <= 0;
  const isEnemy = !combatant.is_pc && !combatant.is_ally;

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
          <p className="truncate text-xs sm:text-sm font-black uppercase text-starlight">
            {combatant.name}
            {defeated && <span className="ml-1 text-danger">· Defeated</span>}
          </p>
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
          <input
            type="number"
            value={combatant.initiative}
            disabled={saving}
            onChange={(e) =>
              onPatch({ initiative: parseInt(e.target.value, 10) || 0 })
            }
            className="w-10 rounded-sm border border-border bg-black px-1 py-0.5 text-center text-xs sm:text-sm font-mono text-starlight"
          />
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
          <label className="flex items-center gap-1.5 text-xs sm:text-sm font-mono uppercase text-ink-faint">
            <input
              type="checkbox"
              checked={Boolean(combatant.is_ally)}
              disabled={saving}
              onChange={(e) => onPatch({ is_ally: e.target.checked })}
              className="accent-neon-cyan"
            />
            Ally
          </label>
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
  token,
  turnEconomy,
  resourceSheet,
}) {
  const selectable = isDmView && onSelect;
  return (
    <li
      onClick={selectable ? () => onSelect(combatant.id) : undefined}
      className={`flex w-full items-center gap-3 rounded-sm border-2 px-3 py-3 sm:py-3.5 ${
        selectable ? "cursor-pointer" : ""
      } ${initiativeCardClass(isActive, isYou, isSelected, isDefeated)}`}
    >
      <InitiativeTurnBadge index={index} compact />
      <CombatantAvatar portraitUrl={combatant.portrait_url} token={token} name={combatant.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black uppercase text-starlight" title={combatant.name}>
          {combatant.name}
        </p>
        <InitiativeStatusBadges combatant={combatant} isYou={isYou} isDefeated={isDefeated} />
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
  token,
  turnEconomy,
  resourceSheet,
}) {
  const selectable = isDmView && onSelect;
  return (
    <div
      onClick={selectable ? () => onSelect(combatant.id) : undefined}
      className={`flex min-w-[9.5rem] max-w-[11rem] flex-1 flex-col items-stretch gap-2 border-2 p-2.5 sm:min-w-[7.5rem] sm:max-w-[9rem] ${
        selectable ? "cursor-pointer" : ""
      } ${initiativeCardClass(isActive, isYou, isSelected, isDefeated)}`}
    >
      <InitiativeTurnBadge index={index} />
      <div className="flex justify-center">
        <CombatantAvatar
          portraitUrl={combatant.portrait_url}
          token={token}
          name={combatant.name}
          size="lg"
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
      <InitiativeStatusBadges combatant={combatant} isYou={isYou} isDefeated={isDefeated} />
    </div>
  );
}

function resourceSheetForCombatant(combatant, { isActive, characterId, sheet, dmActionSheet, isOwner }) {
  if (!combatant?.character_id) return null;
  if (combatant.character_id === characterId) return sheet;
  if (isOwner && isActive) return dmActionSheet;
  return null;
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
  const [movementBusy, setMovementBusy] = useState(false);
  const savingRef = useRef(false);

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

  const displaySorted = sortCombatantsForDisplay(encounter.combatants);
  const turnSorted = sortCombatantsForTurns(encounter.combatants);
  const activeCombatant = encounter.active_combatant_id
    ? turnSorted.find((c) => c.id === encounter.active_combatant_id) ||
      turnSorted[encounter.active_index] ||
      null
    : turnSorted[encounter.active_index] || null;
  const myCombatant = encounter.combatants.find((c) => c.character_id === characterId);
  const isMyTurn = Boolean(myCombatant && activeCombatant?.id === myCombatant.id);
  const activeCombatantId = activeCombatant?.id ?? null;

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

  useEffect(() => {
    void reloadDmActionSheet();
  }, [reloadDmActionSheet]);

  const handleSheetRefresh = useCallback(() => {
    onSheetRefresh?.();
    void reloadDmActionSheet();
  }, [onSheetRefresh, reloadDmActionSheet]);

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
      setEncounter(await res.json());
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
      onCombatEnded?.(data.combat_log_text, data.reason);
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
          body: next,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Could not save");
        }
        const parsed = parseEncounterPatchResponse(await res.json());
        setEncounter(parsed.encounter);
        if (parsed.combatEnded) {
          setSelectedId(null);
          onCombatEnded?.(parsed.combatLogText, parsed.reason);
          setActionError(
            "Victory! All enemies defeated. Combat log added to everyone's Session notes."
          );
        }
      } catch (err) {
        setActionError(err.message || "Could not save combatant.");
        await loadEncounter();
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [token, campaignId, isOwner, loadEncounter, onCombatEnded]
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

  const removeCombatant = (id) => {
    const nextCombatants = encounter.combatants.filter((c) => c.id !== id);
    if (selectedId === id) setSelectedId(null);
    saveEncounter({
      ...encounter,
      combatants: nextCombatants,
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

  return (
    <div className="session-ui flex h-full min-h-0 flex-col gap-2 sm:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-2 sm:pb-3">
        <div>
          <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-ink-faint">Round</p>
          <p className="text-lg font-black text-neon-cyan">{encounter.round}</p>
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

      {!isHorizontal && activeCombatant ? (
        <div className="shrink-0 rounded-sm border border-starlight/60 bg-starlight/5 px-2 py-1.5">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">Active turn</p>
          <p className="truncate text-xs font-black uppercase text-starlight">{activeCombatant.name}</p>
        </div>
      ) : !isHorizontal ? (
        <p className="shrink-0 text-xs sm:text-sm font-mono text-ink-faint">No active turn yet.</p>
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
            {isMyTurn && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleEndTurn}
                className="rounded-sm border border-starlight bg-starlight/10 px-2 py-1 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
              >
                End Turn
              </button>
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

      {!isOwner && characterId && myCombatant && turnSorted.length > 0 && (
        <TurnActionsPanel
          campaignId={campaignId}
          token={token}
          sheet={sheet}
          actionCatalogMode="pc"
          encounter={encounter}
          actorCombatant={myCombatant}
          canTakeTurn={isMyTurn}
          canAdjustMovement={isMyTurn}
          activeTurnName={activeCombatant?.name}
          onEncounterUpdate={setEncounter}
          onSheetRefresh={handleSheetRefresh}
          onError={setActionError}
        />
      )}

      {isOwner && activeCombatant && turnSorted.length > 0 && (
        <TurnActionsPanel
          campaignId={campaignId}
          token={token}
          encounter={encounter}
          actorCombatant={activeCombatant}
          canTakeTurn
          canAdjustMovement
          isDmProxy
          actionCatalogMode={activeCombatant.character_id ? "pc" : "npc"}
          actionSheet={dmActionSheet}
          actionSheetLoading={dmSheetLoading}
          onEncounterUpdate={setEncounter}
          onSheetRefresh={handleSheetRefresh}
          onError={setActionError}
        />
      )}

      {turnSorted.length > 0 && encounter.combat_log?.length > 0 && (
        <EncounterCombatLog log={encounter.combat_log} />
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
            const isActive = !defeated && activeCombatant?.id === combatant.id;
            return (
              <InitiativeCombatantCard
                key={combatant.id}
                combatant={combatant}
                combatants={encounter.combatants}
                index={index}
                isActive={isActive}
                isYou={combatant.character_id === characterId}
                isDmView={isOwner}
                isSelected={isOwner && selectedId === combatant.id}
                isDefeated={defeated}
                onSelect={isOwner ? handleSelectCombatant : undefined}
                token={token}
                turnEconomy={encounter.turn_economy}
                resourceSheet={resourceSheetForCombatant(combatant, {
                  isActive,
                  characterId,
                  sheet,
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
            const isActive = !defeated && activeCombatant?.id === combatant.id;
            return (
              <InitiativeCombatantRow
                key={combatant.id}
                combatant={combatant}
                combatants={encounter.combatants}
                index={index}
                isActive={isActive}
                isYou={combatant.character_id === characterId}
                isDmView={isOwner}
                isSelected={isOwner && selectedId === combatant.id}
                isDefeated={defeated}
                onSelect={isOwner ? handleSelectCombatant : undefined}
                token={token}
                turnEconomy={encounter.turn_economy}
                resourceSheet={resourceSheetForCombatant(combatant, {
                  isActive,
                  characterId,
                  sheet,
                  dmActionSheet,
                  isOwner,
                })}
              />
            );
          })}
        </ul>
      )}

      {isOwner && selectedCombatant && (
        <div className="shrink-0 border-t border-border pt-2">
          <DmCombatantEditor
            combatant={selectedCombatant}
            saving={saving}
            onPatch={(patch) => updateCombatant(selectedCombatant.id, patch)}
            onRemove={() => removeCombatant(selectedCombatant.id)}
            onClose={() => setSelectedId(null)}
            isActiveTurn={activeCombatant?.id === selectedCombatant.id}
            movementRemaining={
              encounter.turn_economy?.[selectedCombatant.id]?.movement_remaining ?? null
            }
            movementBusy={movementBusy}
            onAdjustMovement={
              activeCombatant?.id === selectedCombatant.id
                ? (delta) => adjustMovement(selectedCombatant.id, delta)
                : undefined
            }
          />
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-border pt-2">
        {isOwner && turnSorted.length > 0 && (
          <div className="flex gap-1">
            <button
              type="button"
              disabled={dmBusy}
              onClick={handleEndTurn}
              className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-starlight px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
            >
              <ChevronRight className="h-3 w-3" />
              Next turn
            </button>
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
            Roll to add yourself · End turn when it is yours
          </p>
        )}
      </div>
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
          Open Full Sheet → Re-sync from PDF
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
