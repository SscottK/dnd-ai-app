import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Columns3, Dices, ImagePlus, RefreshCw, Rows3, Trash2 } from "lucide-react";
import { apiFetch, apiUpload } from "../../lib/api";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { formatCombatantAc } from "../../lib/encounterDisplay";
import { NotesPaneWidget } from "./NotesPaneWidget";
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
  resolveCombatStats,
} from "../../lib/characterSheet";

function sortCombatants(combatants) {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}

function ClickableRow({ label, value, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-2 py-1 text-left hover:bg-neon-magenta/10 border border-transparent hover:border-neon-magenta/30"
    >
      <span className="text-[10px] text-zinc-400 truncate">{label}</span>
      <span className="text-xs font-black text-starlight shrink-0">{value}</span>
      {sub && <span className="text-[9px] text-zinc-600 shrink-0">{sub}</span>}
    </button>
  );
}

export function CombatWidget({ character, sheet, onCombatChange, onShowDetail }) {
  const combat = resolveCombatStats(character, sheet);

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
          <p className="text-[9px] text-zinc-500 uppercase">AC</p>
          <p className="text-2xl font-black text-starlight text-center">{combat.ac ?? "—"}</p>
          {combat.fromEquipment && (
            <p className="text-[8px] text-ink-faint text-center uppercase">Equipped</p>
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
          <p className="text-[9px] text-zinc-500 uppercase">Init</p>
          <p className="text-2xl font-black text-starlight">
            {formatModifier(sheet.initiative_bonus ?? abilityModifier(sheet.abilities?.dex))}
          </p>
        </button>
      </div>
      <div className="border border-starlight/50 p-2">
        <p className="text-[9px] text-zinc-500 uppercase mb-1">Hit Points</p>
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
      <div className="flex justify-between text-[10px] font-mono text-zinc-500">
        <span>Speed: {combat.speed != null ? `${combat.speed} ft` : "—"}</span>
        <span>PP: {sheet.passive_perception ?? "—"}</span>
      </div>
      {sheet.conditions?.length > 0 && (
        <p className="text-[10px] text-neon-magenta">{sheet.conditions.join(", ")}</p>
      )}
    </div>
  );
}

export function AbilitiesWidget({ sheet, onShowDetail }) {
  return (
    <div className="grid grid-cols-3 gap-2">
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
                subtitle: "Ability Score",
                body: (
                  <div className="space-y-2">
                    <p>
                      Score: <span className="text-starlight">{score ?? "—"}</span>
                    </p>
                    <p>
                      Modifier: <span className="text-starlight">{formatModifier(mod)}</span>
                    </p>
                    {sheet.proficiency_bonus != null && (
                      <p className="text-zinc-500 text-xs">
                        Proficiency bonus: +{sheet.proficiency_bonus}
                      </p>
                    )}
                  </div>
                ),
              })
            }
            className="border border-zinc-800 p-2 text-center hover:border-neon-cyan hover:bg-neon-cyan/5"
          >
            <p className="text-[9px] text-zinc-500">{ABILITY_LABELS[key]}</p>
            <p className="text-lg font-black text-starlight">{formatModifier(mod)}</p>
            <p className="text-[10px] text-zinc-600">{score ?? "—"}</p>
          </button>
        );
      })}
    </div>
  );
}

export function SkillsSavesWidget({ sheet, onShowDetail }) {
  const proficientSkills = sheet.skills?.filter((s) => s.proficient || s.expertise) || [];
  const otherSkills = sheet.skills?.filter((s) => !s.proficient && !s.expertise) || [];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[9px] font-black text-neon-magenta uppercase mb-1">Saving Throws</p>
        <div className="space-y-0.5">
          {sheet.saving_throws?.map((save) => (
            <ClickableRow
              key={save.ability}
              label={ABILITY_LABELS[save.ability]}
              value={formatModifier(save.bonus)}
              sub={save.proficient ? "prof" : ""}
              onClick={() =>
                onShowDetail({
                  title: `${ABILITY_LABELS[save.ability]} Save`,
                  subtitle: save.proficient ? "Proficient" : "Not proficient",
                  body: `Bonus: ${formatModifier(save.bonus)}`,
                })
              }
            />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-black text-neon-cyan uppercase mb-1">Skills</p>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {[...proficientSkills, ...otherSkills].map((skill) => (
            <ClickableRow
              key={skill.name}
              label={skill.name}
              value={formatModifier(skill.bonus)}
              sub={
                skill.expertise ? "exp" : skill.proficient ? "prof" : skill.ability?.toUpperCase()
              }
              onClick={() =>
                onShowDetail({
                  title: skill.name,
                  subtitle: `${skill.ability?.toUpperCase()} · ${skill.expertise ? "Expertise" : skill.proficient ? "Proficient" : "Not proficient"}`,
                  body: `Bonus: ${formatModifier(skill.bonus)}`,
                })
              }
            />
          ))}
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
          className="text-[10px] text-neon-cyan hover:text-starlight uppercase font-black"
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
      setPhotos((prev) =>
        prev.map((photo) => ({ ...photo, is_portrait: photo.id === photoId }))
      );
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-1">
      <div className="flex min-h-0 flex-[2] items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-void-deep/40 p-2">
        <AuthenticatedImage
          src={portraitUrl}
          token={token}
          alt={characterName || "Character"}
          className="max-h-full max-w-full rounded-sm border border-neon-cyan/30 object-contain"
          fallbackClassName="flex h-28 w-28 items-center justify-center rounded-sm border-2 border-dashed border-border text-3xl"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/20 p-1.5">
        <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-ink-faint">Album</p>
        {photos.length === 0 ? (
          <p className="text-[9px] font-mono text-ink-faint">Add photos below, then tap one to set your portrait.</p>
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
                    <span className="pointer-events-none absolute left-0.5 top-0.5 rounded-sm bg-starlight/90 px-1 text-[7px] font-black uppercase text-black">
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
        className="flex shrink-0 items-center justify-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
      >
        <ImagePlus className="h-3 w-3" />
        Add photo
      </button>
      {error && <p className="shrink-0 text-center text-[9px] font-mono text-danger">{error}</p>}
      <p className="shrink-0 text-center text-[8px] font-mono text-ink-faint">
        Up to 24 photos · JPEG, PNG, WebP, GIF · max 4 MB
      </p>
    </div>
  );
}

function CombatantAvatar({ portraitUrl, token, name, size = "sm" }) {
  const dimensions = size === "lg" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return (
    <AuthenticatedImage
      src={portraitUrl}
      token={token}
      alt={name}
      className={`${dimensions} shrink-0 rounded-sm border border-border object-cover`}
      fallbackClassName={`${dimensions} shrink-0 rounded-sm border border-border`}
    />
  );
}

export function PlayerNotesWidget({ tabs, activeTabId, onChange }) {
  return (
    <NotesPaneWidget
      tabs={tabs}
      activeTabId={activeTabId}
      onChange={onChange}
      tabsKey="playerNotesTabs"
      activeKey="activeNotesTabId"
      hint="Preview · Edit · Format · saved with layout"
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
            className={`flex-1 py-1.5 text-[9px] font-black uppercase ${
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
            {sheet.inventory?.length === 0 && (
              <p className="text-[10px] text-zinc-600">No items parsed yet.</p>
            )}
            {sheet.inventory?.map((item, index) => (
              <div
                key={item.id || index}
                className="flex items-center gap-2 p-1 border border-zinc-900 hover:border-neon-cyan/40"
              >
                <input
                  type="checkbox"
                  checked={!!item.equipped}
                  onChange={(e) => updateInventoryItem(index, { equipped: e.target.checked })}
                  className="accent-neon-magenta"
                  title={item.equipped ? "Worn/wielded" : "Mark as worn/wielded"}
                />
                <button
                  type="button"
                  onClick={() =>
                    onShowDetail({
                      title: item.name,
                      subtitle: item.equipped ? "Equipped" : "Carried",
                      body: (
                        <div className="space-y-2 text-xs">
                          <p>Qty: {item.qty ?? 1}</p>
                          {item.weight != null && <p>Weight: {item.weight} lb</p>}
                          {item.notes && <p>{item.notes}</p>}
                        </div>
                      ),
                    })
                  }
                  className="flex-1 text-left text-[10px] text-neon-cyan hover:text-starlight truncate"
                >
                  {item.name}
                </button>
                <input
                  type="number"
                  min="0"
                  value={item.qty ?? 1}
                  onChange={(e) =>
                    updateInventoryItem(index, { qty: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-10 text-center bg-black border border-zinc-800 text-[10px]"
                />
              </div>
            ))}
          </div>
        )}
        {tab === "features" && (
          <div className="space-y-1">
            {sheet.features?.length === 0 && (
              <p className="text-[10px] text-zinc-600">No features parsed yet.</p>
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
                className="w-full text-left px-2 py-1.5 text-[10px] text-neon-cyan hover:bg-neon-magenta/10 border border-transparent hover:border-neon-magenta/30"
              >
                <span className="font-black text-starlight">{feat.name}</span>
                {feat.source && (
                  <span className="text-zinc-600 ml-2 text-[9px]">{feat.source}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function initiativeCardClass(isActive, isYou) {
  if (isActive) return "border-starlight bg-starlight/5";
  if (isYou) return "border-neon-cyan/50 bg-neon-cyan/5";
  return "border-neon-cyan/40 bg-void-deep/60";
}

function InitiativeCombatantRow({ combatant, index, isActive, isYou, isDmView, token }) {
  return (
    <li
      className={`flex w-full items-center gap-3 rounded-sm border-2 px-3 py-2.5 ${initiativeCardClass(isActive, isYou)}`}
    >
      <span className="w-6 shrink-0 text-center text-[10px] font-mono text-ink-faint">{index + 1}</span>
      <CombatantAvatar portraitUrl={combatant.portrait_url} token={token} name={combatant.name} />
      <span className="w-10 shrink-0 text-center text-lg font-black text-starlight">{combatant.initiative}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-black uppercase text-ink">
          {combatant.name}
          {isYou && <span className="ml-1.5 text-[9px] text-neon-cyan">YOU</span>}
          {combatant.is_pc && !isYou && <span className="ml-1.5 text-[9px] text-ink-faint">PC</span>}
          {combatant.is_ally && !combatant.is_pc && (
            <span className="ml-1.5 text-[9px] text-neon-cyan">ALLY</span>
          )}
        </p>
        {(combatant.hp != null ||
          formatCombatantAc(combatant, isDmView) ||
          combatant.conditions) && (
          <p className="truncate text-[10px] font-mono text-ink-faint">
            {combatant.hp != null && combatant.max_hp != null
              ? `HP ${combatant.hp}/${combatant.max_hp}`
              : ""}
            {formatCombatantAc(combatant, isDmView)}
            {combatant.conditions ? ` · ${combatant.conditions}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

function InitiativeCombatantCard({ combatant, index, isActive, isYou, isDmView, token }) {
  return (
    <div
      className={`flex min-w-[80px] max-w-[128px] flex-1 flex-col items-center gap-1 border-2 p-2 text-center ${initiativeCardClass(isActive, isYou)}`}
    >
      <span className="text-[9px] font-mono text-ink-faint">{index + 1}</span>
      <CombatantAvatar
        portraitUrl={combatant.portrait_url}
        token={token}
        name={combatant.name}
        size="lg"
      />
      <span className="text-xl font-black leading-none text-starlight">{combatant.initiative}</span>
      <p className="w-full truncate text-[10px] font-black uppercase text-ink">
        {combatant.name}
        {isYou && <span className="block text-[8px] text-neon-cyan">YOU</span>}
      </p>
      {(combatant.hp != null || formatCombatantAc(combatant, isDmView)) && (
        <p className="w-full truncate text-[9px] font-mono text-ink-faint">
          {combatant.hp != null && combatant.max_hp != null
            ? `HP ${combatant.hp}/${combatant.max_hp}`
            : ""}
          {formatCombatantAc(combatant, isDmView)}
        </p>
      )}
      {combatant.conditions && (
        <p className="w-full truncate text-[8px] font-mono text-ink-faint">{combatant.conditions}</p>
      )}
      {combatant.is_pc && !isYou && <span className="text-[8px] text-ink-faint">PC</span>}
      {combatant.is_ally && !combatant.is_pc && (
        <span className="text-[8px] text-neon-cyan">ALLY</span>
      )}
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
}) {
  const isHorizontal = orientation === INITIATIVE_ORIENTATION_HORIZONTAL;
  const initiativeBonus = getInitiativeBonus(sheet);
  const [encounter, setEncounter] = useState({
    round: 1,
    active_index: 0,
    active_combatant_id: null,
    combatants: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [manualInit, setManualInit] = useState("");
  const [lastRoll, setLastRoll] = useState(null);
  const [actionError, setActionError] = useState("");
  const [error, setError] = useState("");

  const loadEncounter = useCallback(async () => {
    if (!token || !campaignId) return;
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

  const sorted = sortCombatants(encounter.combatants);
  const activeIndex = encounter.active_combatant_id
    ? sorted.findIndex((c) => c.id === encounter.active_combatant_id)
    : encounter.active_index;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeCombatant = sorted[resolvedIndex] || null;
  const myCombatant = encounter.combatants.find((c) => c.character_id === characterId);
  const isMyTurn = activeCombatant?.character_id === characterId;

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

  if (loading) {
    return <p className="text-[10px] font-mono text-ink-faint">Loading initiative...</p>;
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-mono text-danger">{error}</p>
        <button
          type="button"
          onClick={loadEncounter}
          className="text-[10px] font-black uppercase text-neon-cyan hover:text-starlight"
        >
          Retry
        </button>
      </div>
    );
  }

  const handleOrientation = (nextOrientation) => {
    if (nextOrientation === orientation) return;
    onOrientationChange?.(nextOrientation, sorted.length);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border pb-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint">Round</p>
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
          <p className="text-[8px] font-black uppercase tracking-widest text-ink-faint">Active turn</p>
          <p className="truncate text-xs font-black uppercase text-starlight">{activeCombatant.name}</p>
        </div>
      ) : !isHorizontal ? (
        <p className="shrink-0 text-[10px] font-mono text-ink-faint">No active turn yet.</p>
      ) : null}

      {characterId && (
        <div className="shrink-0 space-y-2 rounded-sm border border-border-bright bg-void-deep/50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleAutoRoll}
              className="flex items-center gap-1 rounded-sm border border-neon-cyan px-2 py-1 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
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
                className="w-16 rounded-sm border border-border bg-black px-2 py-1 text-center text-[10px] font-mono text-starlight"
                title="Enter your total initiative if you rolled at the table"
              />
              <button
                type="submit"
                disabled={submitting || manualInit === ""}
                className="rounded-sm border border-border px-2 py-1 text-[10px] font-black uppercase text-ink-muted hover:text-starlight disabled:opacity-40"
              >
                Set
              </button>
            </form>
            {isMyTurn && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleEndTurn}
                className="rounded-sm border border-starlight bg-starlight/10 px-2 py-1 text-[10px] font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
              >
                End Turn
              </button>
            )}
          </div>
          {myCombatant && (
            <p className="text-[9px] font-mono text-ink-faint">
              Your initiative: <span className="text-starlight font-black">{myCombatant.initiative}</span>
            </p>
          )}
          {lastRoll && lastRoll.d20 != null && (
            <p className="text-[9px] font-mono text-neon-cyan">
              Rolled {lastRoll.d20} {formatModifier(lastRoll.bonus)} ={" "}
              <span className="font-black text-starlight">{lastRoll.total}</span>
            </p>
          )}
          {actionError && <p className="text-[9px] font-mono text-danger">{actionError}</p>}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-[10px] font-mono text-ink-faint">
          {isOwner
            ? "Add combatants from the Initiative page, or roll to join the tracker."
            : "Roll initiative to join the tracker when combat starts."}
        </p>
      ) : isHorizontal ? (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
          {sorted.map((combatant, index) => (
            <InitiativeCombatantCard
              key={combatant.id}
              combatant={combatant}
              index={index}
              isActive={index === resolvedIndex}
              isYou={combatant.character_id === characterId}
              isDmView={isOwner}
              token={token}
            />
          ))}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {sorted.map((combatant, index) => (
            <InitiativeCombatantRow
              key={combatant.id}
              combatant={combatant}
              index={index}
              isActive={index === resolvedIndex}
              isYou={combatant.character_id === characterId}
              isDmView={isOwner}
              token={token}
            />
          ))}
        </ul>
      )}

      <p className="shrink-0 border-t border-border pt-2 text-[9px] font-mono text-ink-faint">
        {isOwner ? (
          <Link to={`/initiative/${campaignId}`} className="font-black uppercase text-neon-magenta hover:text-starlight">
            Open DM Initiative tracker →
          </Link>
        ) : (
          "Roll to add yourself · End turn when it is yours"
        )}
      </p>
    </div>
  );
}

export function VttZoneWidget() {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-sm border border-dashed border-border bg-void-deep/40 p-4 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-ink-faint">VTT Zone</p>
      <p className="mt-2 max-w-xs text-[10px] font-mono text-ink-faint">
        Run combat on your Godot VTT. Resize this pane to frame the space you keep clear on your desk.
      </p>
    </div>
  );
}

export function EmptySheetHint({ character, onOpenFullSheet }) {
  return (
    <div className="p-3 text-center text-[10px] font-mono text-zinc-500 border border-dashed border-zinc-700">
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
