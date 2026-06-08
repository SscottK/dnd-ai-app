import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Swords,
  Trash2,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { ConditionsEditor } from "../components/sheet/ConditionsEditor";
import { formatConditionsList } from "../lib/conditions";
import {
  combatantMoveText,
  formatCombatantAc,
  formatCombatantSpeed,
  formatCombatResources,
  isDefeatedEnemy,
  parseEncounterPatchResponse,
  sortCombatantsForDisplay,
  sortCombatantsForTurns,
  turnStatusLabels,
} from "../lib/encounterDisplay";
import { DiceRoller } from "../components/DiceRoller";
import {
  EncounterCombatLog,
  TurnActionsPanel,
} from "../components/sheet/TurnActionsPanel";

function newId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function MovementStepButtons({ disabled, onAdjust }) {
  const steps = [-30, -15, -10, -5, 5, 10, 15, 30];
  return (
    <div className="flex flex-wrap gap-0.5">
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          disabled={disabled}
          onClick={() => onAdjust(step)}
          className={`min-w-[1.75rem] border px-1 py-0.5 text-[8px] font-black uppercase disabled:opacity-30 ${
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

export function InitiativePage() {
  const { campaignId } = useParams();
  const { token, user } = useAuth();
  const [campaignName, setCampaignName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [encounter, setEncounter] = useState({
    round: 1,
    active_index: 0,
    combatants: [],
    turn_economy: {},
  });
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [monsterName, setMonsterName] = useState("");
  const [monsterInit, setMonsterInit] = useState("10");
  const [monsterAlly, setMonsterAlly] = useState(false);
  const [monsterSuggestions, setMonsterSuggestions] = useState([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [movementBusy, setMovementBusy] = useState(false);
  const [activeResourceSheet, setActiveResourceSheet] = useState(null);
  const [dicePanelWidth, setDicePanelWidth] = useState(() => {
    const stored = localStorage.getItem(`initiative-dice-width-${campaignId}`);
    const parsed = stored ? Number(stored) : 280;
    return Number.isFinite(parsed) ? Math.min(480, Math.max(200, parsed)) : 280;
  });
  const resizeRef = useRef(null);
  const [dmActionSheet, setDmActionSheet] = useState(null);
  const [dmSheetLoading, setDmSheetLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    localStorage.setItem(`initiative-dice-width-${campaignId}`, String(dicePanelWidth));
  }, [campaignId, dicePanelWidth]);

  useEffect(() => {
    const onPointerMove = (event) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.x - event.clientX;
      const next = Math.min(480, Math.max(200, resizeRef.current.origin + delta));
      setDicePanelWidth(next);
    };
    const onPointerUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useEffect(() => {
    if (!token || !isOwner || monsterName.trim().length < 2) {
      setMonsterSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void apiFetch(`/campaigns/srd-monsters/search?q=${encodeURIComponent(monsterName.trim())}`, {
        token,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Search failed");
          const data = await res.json();
          if (!cancelled) setMonsterSuggestions(data.monsters || []);
        })
        .catch(() => {
          if (!cancelled) setMonsterSuggestions([]);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, isOwner, monsterName]);

  const saveEncounter = useCallback(
    async (next) => {
      if (!token || !campaignId || !isOwner) return;
      setSaving(true);
      try {
        const res = await apiFetch(`/campaigns/${campaignId}/encounter`, {
          token,
          method: "PATCH",
          body: next,
        });
        if (!res.ok) throw new Error("Save failed");
        const parsed = parseEncounterPatchResponse(await res.json());
        setEncounter(parsed.encounter);
        if (parsed.combatEnded) {
          setStatusMessage(
            "Victory! All enemies defeated. Combat log added to everyone's Session notes."
          );
        }
      } catch (err) {
        console.error(err);
        setError("Could not save initiative.");
      } finally {
        setSaving(false);
      }
    },
    [token, campaignId, isOwner]
  );

  const loadData = useCallback(async () => {
    if (!token || !campaignId) return;
    setLoading(true);
    setError("");
    try {
      const [campaignRes, encounterRes, sessionRes] = await Promise.all([
        apiFetch("/campaigns", { token }),
        apiFetch(`/campaigns/${campaignId}/encounter`, { token }),
        apiFetch(`/campaigns/${campaignId}/session`, { token }),
      ]);

      if (!encounterRes.ok) throw new Error("Encounter not available");

      const encounterData = await encounterRes.json();
      setEncounter(encounterData);

      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setSessionActive(!!sessionData.session_active);
      } else {
        setSessionActive(false);
      }

      if (campaignRes.ok) {
        const campaignData = await campaignRes.json();
        const campaign = (campaignData.campaigns || []).find(
          (c) => String(c.id) === String(campaignId)
        );
        if (campaign) {
          setCampaignName(campaign.name);
          setIsOwner(campaign.is_owner);
          if (campaign.is_owner) {
            const rosterRes = await apiFetch(`/campaigns/${campaignId}/roster`, { token });
            if (rosterRes.ok) {
              const rosterData = await rosterRes.json();
              setRoster(rosterData.members || []);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError("Could not load initiative tracker.");
    } finally {
      setLoading(false);
    }
  }, [token, campaignId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token || !campaignId || saving) return undefined;
    const timer = setInterval(() => {
      void apiFetch(`/campaigns/${campaignId}/encounter`, { token })
        .then(async (res) => {
          if (!res.ok) return;
          setEncounter(await res.json());
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [token, campaignId, saving]);

  const displaySorted = sortCombatantsForDisplay(encounter.combatants);
  const turnSorted = sortCombatantsForTurns(encounter.combatants);
  const activeCombatant = encounter.active_combatant_id
    ? turnSorted.find((c) => c.id === encounter.active_combatant_id) ||
      turnSorted[encounter.active_index] ||
      null
    : turnSorted[encounter.active_index] || null;
  const activeEconomy = activeCombatant ? encounter.turn_economy?.[activeCombatant.id] : null;

  useEffect(() => {
    if (!isOwner || !token || !campaignId || !activeCombatant?.character_id) {
      setActiveResourceSheet(null);
      return undefined;
    }
    let cancelled = false;
    void apiFetch(
      `/campaigns/${campaignId}/encounter/combatants/${activeCombatant.id}/action-sheet`,
      { token }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Load failed");
        const data = await res.json();
        if (!cancelled) setActiveResourceSheet(data.sheet || null);
      })
      .catch(() => {
        if (!cancelled) setActiveResourceSheet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, token, campaignId, activeCombatant?.id, activeCombatant?.character_id]);

  useEffect(() => {
    if (!isOwner || !token || !campaignId || !activeCombatant?.id) {
      setDmActionSheet(null);
      return undefined;
    }
    let cancelled = false;
    setDmSheetLoading(true);
    void apiFetch(
      `/campaigns/${campaignId}/encounter/combatants/${activeCombatant.id}/action-sheet`,
      { token }
    )
      .then(async (res) => {
        if (!res.ok) throw new Error("Load failed");
        const data = await res.json();
        if (!cancelled) setDmActionSheet(data.sheet || {});
      })
      .catch(() => {
        if (!cancelled) setDmActionSheet({});
      })
      .finally(() => {
        if (!cancelled) setDmSheetLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, token, campaignId, activeCombatant?.id]);

  const reloadDmActionSheet = useCallback(async () => {
    if (!isOwner || !token || !campaignId || !activeCombatant?.id) return;
    setDmSheetLoading(true);
    try {
      const res = await apiFetch(
        `/campaigns/${campaignId}/encounter/combatants/${activeCombatant.id}/action-sheet`,
        { token }
      );
      if (!res.ok) throw new Error("Load failed");
      const data = await res.json();
      setDmActionSheet(data.sheet || {});
      if (activeCombatant.character_id) {
        setActiveResourceSheet(data.sheet || null);
      }
    } catch {
      setDmActionSheet({});
    } finally {
      setDmSheetLoading(false);
    }
  }, [isOwner, token, campaignId, activeCombatant?.id, activeCombatant?.character_id]);

  const pushEncounter = (next) => {
    setEncounter(next);
    saveEncounter(next);
  };

  const addFromRoster = (member) => {
    if (encounter.combatants.some((c) => c.character_id === member.character_id)) return;
    const next = {
      ...encounter,
      combatants: [
        ...encounter.combatants,
        {
          id: newId(),
          name: member.character_name,
          initiative: 0,
          is_pc: true,
          is_ally: false,
          character_id: member.character_id,
          hp: member.hp,
          max_hp: member.max_hp,
          ac: member.ac,
          conditions: [],
        },
      ],
    };
    pushEncounter(next);
  };

  const addMonster = (e) => {
    e.preventDefault();
    if (!monsterName.trim()) return;
    const next = {
      ...encounter,
      combatants: [
        ...encounter.combatants,
        {
          id: newId(),
          name: monsterName.trim(),
          initiative: parseInt(monsterInit, 10) || 0,
          is_pc: false,
          is_ally: monsterAlly,
          character_id: null,
          hp: null,
          max_hp: null,
          ac: null,
          conditions: [],
        },
      ],
    };
    pushEncounter(next);
    setMonsterName("");
    setMonsterAlly(false);
  };

  const updateCombatant = (id, patch) => {
    const next = {
      ...encounter,
      combatants: encounter.combatants.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    pushEncounter(next);
  };

  const removeCombatant = (id) => {
    const nextCombatants = encounter.combatants.filter((c) => c.id !== id);
    const removedActive = encounter.active_combatant_id === id;
    const next = {
      ...encounter,
      combatants: nextCombatants,
      active_combatant_id: removedActive ? null : encounter.active_combatant_id,
      active_index: Math.min(encounter.active_index, Math.max(0, nextCombatants.length - 1)),
    };
    pushEncounter(next);
  };

  const nextTurn = async () => {
    if (!token || !campaignId || !isOwner || !turnSorted.length) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/next-turn`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not advance turn");
      }
      setEncounter(await res.json());
    } catch (err) {
      setError(err.message || "Could not advance turn.");
    } finally {
      setSaving(false);
    }
  };

  const adjustMovement = async (combatantId, delta) => {
    if (!token || !campaignId || !isOwner || delta === 0) return;
    setMovementBusy(true);
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
      setError(err.message || "Could not adjust movement.");
    } finally {
      setMovementBusy(false);
    }
  };

  const clearEncounter = () => {
    pushEncounter({
      round: 1,
      active_index: 0,
      active_combatant_id: null,
      combatants: [],
    });
  };

  const handleEndCombat = async () => {
    if (!token || !campaignId || !isOwner) return;
    setSaving(true);
    setError("");
    setStatusMessage("");
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
      setStatusMessage(
        "Combat ended by DM. Initiative order, rolls, and events were added to everyone's Session notes."
      );
    } catch (err) {
      setError(err.message || "Could not end combat.");
    } finally {
      setSaving(false);
    }
  };

  const addAllFromRoster = async () => {
    if (!token || !campaignId) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/add-roster`, {
        token,
        method: "POST",
        body: { auto_roll: true },
      });
      if (!res.ok) throw new Error("Add roster failed");
      setEncounter(await res.json());
    } catch (err) {
      console.error(err);
      setError("Could not add roster to tracker.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-zinc-500">
        Loading initiative...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-y-contain">
      <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan"
          >
            <ArrowLeft className="w-3 h-3" />
            Campaigns
          </Link>
          <Link
            to={`/session/${campaignId}`}
            className={`inline-flex items-center gap-1 border-2 px-3 py-1.5 text-[10px] font-black uppercase ${
              sessionActive
                ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20"
                : "border-zinc-700 text-zinc-500 hover:border-neon-cyan hover:text-neon-cyan"
            }`}
          >
            <ArrowLeft className="w-3 h-3" />
            {sessionActive ? "Back to live session" : "Session playspace"}
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-black text-starlight uppercase tracking-widest">
              <Swords className="w-5 h-5 text-neon-magenta" />
              Initiative
            </h1>
            <p className="text-xs font-mono text-zinc-500 mt-1">
              {campaignName || `Campaign #${campaignId}`}
              {saving && " · saving..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-neon-cyan">Round {encounter.round}</span>
            {isOwner && (
              <>
                <button
                  type="button"
                  onClick={nextTurn}
                  className="px-3 py-2 text-[10px] font-black uppercase bg-neon-magenta text-black border-2 border-black"
                >
                  Next Turn
                </button>
                <button
                  type="button"
                  onClick={loadData}
                  className="p-2 border border-zinc-700 hover:border-neon-cyan"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                {turnSorted.length > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleEndCombat}
                    className="px-3 py-2 text-[10px] font-black uppercase border-2 border-danger text-danger hover:bg-danger/10 disabled:opacity-40"
                  >
                    End Combat
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {statusMessage && (
          <p className="mb-4 text-[10px] font-mono text-neon-cyan border-l-2 border-neon-cyan pl-2">
            {statusMessage}
          </p>
        )}

        {error && (
          <p className="mb-4 text-xs font-mono text-danger border-l-2 border-danger pl-2">
            {error}
          </p>
        )}

        {!isOwner && (
          <p className="mb-4 text-[10px] font-mono text-zinc-500 border border-zinc-800 p-3">
            Use the Initiative pane in your session play view to roll initiative and end your turn.
          </p>
        )}

        {activeCombatant && (
          <div className="mb-4 space-y-2 border-2 border-starlight bg-black p-4">
            <div>
              <p className="text-[10px] uppercase text-zinc-500">Active turn</p>
              <p className="text-xl font-black uppercase text-starlight">{activeCombatant.name}</p>
              <p className="mt-1 text-[10px] font-mono text-zinc-500">
                {combatantMoveText(activeCombatant, activeEconomy) &&
                  `Move ${combatantMoveText(activeCombatant, activeEconomy)}`}
                {turnStatusLabels(activeEconomy, encounter.combatants).length
                  ? ` · ${turnStatusLabels(activeEconomy, encounter.combatants).join(", ")}`
                  : ""}
                {formatCombatResources(activeResourceSheet)
                  ? ` · ${formatCombatResources(activeResourceSheet)}`
                  : ""}
              </p>
            </div>
            {isOwner && (
              <div className="space-y-1">
                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-500">
                  Spend movement
                </p>
                <MovementStepButtons
                  disabled={movementBusy || saving}
                  onAdjust={(delta) => adjustMovement(activeCombatant.id, delta)}
                />
              </div>
            )}
            {isOwner && activeCombatant && (
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                {actionError && (
                  <p className="text-[9px] font-mono text-danger">{actionError}</p>
                )}
                <TurnActionsPanel
                  campaignId={campaignId}
                  token={token}
                  actionSheet={dmActionSheet}
                  actionSheetLoading={dmSheetLoading}
                  encounter={encounter}
                  actorCombatant={activeCombatant}
                  canTakeTurn
                  canAdjustMovement
                  isDmProxy
                  onEncounterUpdate={setEncounter}
                  onSheetRefresh={reloadDmActionSheet}
                  onError={setActionError}
                />
              </div>
            )}
          </div>
        )}

        {encounter.combat_log?.length > 0 && (
          <div className="mb-4">
            <EncounterCombatLog log={encounter.combat_log} limit={12} />
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <section className="min-w-0 flex-1">
            {displaySorted.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-zinc-700 text-center text-xs font-mono text-zinc-500">
                No combatants yet. {isOwner ? "Add PCs from roster or monsters below." : ""}
              </div>
            ) : (
              <div className="space-y-2">
                {displaySorted.map((combatant, index) => {
                  const defeated = isDefeatedEnemy(combatant);
                  const isActive = !defeated && activeCombatant?.id === combatant.id;
                  const economy = encounter.turn_economy?.[combatant.id];
                  const moveText = isActive
                    ? combatantMoveText(combatant, economy)
                    : formatCombatantSpeed(combatant.speed).replace(/^ · /, "");
                  const turnStatuses = isActive
                    ? turnStatusLabels(economy, encounter.combatants)
                    : [];
                  const resourceSummary =
                    isActive && isOwner ? formatCombatResources(activeResourceSheet) : null;
                  return (
                  <div
                    key={combatant.id}
                    className={`p-3 border-2 flex flex-wrap items-center gap-3 ${
                      defeated
                        ? "border-zinc-800/60 bg-zinc-950 opacity-45"
                        : isActive
                          ? "border-starlight bg-starlight/5"
                          : "border-neon-cyan/40 bg-black"
                    }`}
                  >
                    <span className="text-[10px] font-mono text-zinc-600 w-6">{index + 1}</span>
                    {isOwner ? (
                      <input
                        type="number"
                        value={combatant.initiative}
                        onChange={(e) =>
                          updateCombatant(combatant.id, {
                            initiative: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-14 px-2 py-1 bg-black border border-zinc-700 text-center font-mono"
                        title="Initiative"
                      />
                    ) : (
                      <span className="w-14 text-center font-mono">{combatant.initiative}</span>
                    )}
                    <div className="flex-1 min-w-[120px]">
                      <p className="font-black text-starlight uppercase text-sm">
                        {combatant.name}
                        {defeated && (
                          <span className="ml-2 text-[9px] text-zinc-500">DEFEATED</span>
                        )}
                        {combatant.is_pc && (
                          <span className="ml-2 text-[9px] text-neon-cyan">PC</span>
                        )}
                        {combatant.is_ally && !combatant.is_pc && (
                          <span className="ml-2 text-[9px] text-neon-cyan">ALLY</span>
                        )}
                      </p>
                      {(combatant.hp != null ||
                        combatant.speed != null ||
                        formatCombatantAc(combatant, isOwner)) && (
                        <p className="text-[10px] font-mono text-zinc-500">
                          {combatant.hp != null && combatant.max_hp != null
                            ? `HP ${combatant.hp}/${combatant.max_hp}`
                            : ""}
                          {formatCombatantAc(combatant, isOwner)}
                          {moveText ? ` · ${moveText}` : ""}
                          {turnStatuses.length ? ` · ${turnStatuses.join(", ")}` : ""}
                          {resourceSummary ? ` · ${resourceSummary}` : ""}
                        </p>
                      )}
                    </div>
                    {isOwner && (
                      <>
                        {!combatant.is_pc && (
                          <label className="flex items-center gap-1 text-[9px] font-mono uppercase text-zinc-500">
                            <input
                              type="checkbox"
                              checked={Boolean(combatant.is_ally)}
                              onChange={(e) =>
                                updateCombatant(combatant.id, { is_ally: e.target.checked })
                              }
                              className="accent-neon-cyan"
                            />
                            Ally
                          </label>
                        )}
                        {!combatant.is_pc && (
                          <>
                            <input
                              type="number"
                              min="0"
                              value={combatant.hp ?? ""}
                              onChange={(e) =>
                                updateCombatant(combatant.id, {
                                  hp: e.target.value === "" ? null : parseInt(e.target.value, 10),
                                })
                              }
                              placeholder="HP"
                              className="w-14 px-2 py-1 bg-black border border-zinc-800 text-[10px] font-mono"
                              title="Current HP"
                            />
                            <span className="text-zinc-600 text-[10px]">/</span>
                            <input
                              type="number"
                              min="0"
                              value={combatant.max_hp ?? ""}
                              onChange={(e) =>
                                updateCombatant(combatant.id, {
                                  max_hp:
                                    e.target.value === "" ? null : parseInt(e.target.value, 10),
                                })
                              }
                              placeholder="Max"
                              className="w-14 px-2 py-1 bg-black border border-zinc-800 text-[10px] font-mono"
                              title="Max HP"
                            />
                          </>
                        )}
                        <div className="w-full min-w-[200px]">
                          <ConditionsEditor
                            conditions={combatant.conditions}
                            compact
                            onChange={(next) =>
                              updateCombatant(combatant.id, { conditions: next })
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCombatant(combatant.id)}
                          className="text-zinc-600 hover:text-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {!isOwner && formatConditionsList(combatant.conditions) && (
                      <span className="text-[10px] text-zinc-500">
                        {formatConditionsList(combatant.conditions)}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {isOwner && (
              <div className="mt-6 space-y-4">
                {roster.length > 0 && (
                  <div className="p-4 border-2 border-neon-cyan/50 bg-zinc-950">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase text-neon-cyan">Add from roster</p>
                      <button
                        type="button"
                        onClick={addAllFromRoster}
                        disabled={saving}
                        className="px-2 py-1 text-[10px] font-black uppercase border border-starlight text-starlight hover:bg-starlight/10 disabled:opacity-40"
                      >
                        Add all & roll init
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {roster.map((member) => (
                        <button
                          key={member.member_id}
                          type="button"
                          onClick={() => addFromRoster(member)}
                          className="px-2 py-1 text-[10px] font-black uppercase border border-zinc-700 hover:border-starlight"
                        >
                          <Plus className="w-3 h-3 inline mr-1" />
                          {member.character_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={addMonster} className="p-4 border-2 border-neon-magenta bg-black flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[160px]">
                    <input
                      type="text"
                      value={monsterName}
                      onChange={(e) => setMonsterName(e.target.value)}
                      placeholder="SRD monster name (e.g. Goblin)"
                      className="w-full px-3 py-2 bg-black border border-zinc-700 text-sm font-mono"
                      autoComplete="off"
                    />
                    {monsterSuggestions.length > 0 && (
                      <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto border border-zinc-700 bg-black shadow-lg">
                        {monsterSuggestions.map((monster) => (
                          <li key={monster.name}>
                            <button
                              type="button"
                              onClick={() => {
                                setMonsterName(monster.name);
                                setMonsterSuggestions([]);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-mono hover:bg-zinc-900"
                            >
                              <span className="font-black text-starlight">{monster.name}</span>
                              <span className="text-zinc-500">
                                CR {monster.cr}
                                {monster.action_count ? ` · ${monster.action_count} actions` : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <input
                    type="number"
                    value={monsterInit}
                    onChange={(e) => setMonsterInit(e.target.value)}
                    className="w-20 px-3 py-2 bg-black border border-zinc-700 text-sm font-mono"
                    title="Initiative"
                  />
                  <label className="flex items-center gap-1 px-2 text-[10px] font-mono uppercase text-zinc-500">
                    <input
                      type="checkbox"
                      checked={monsterAlly}
                      onChange={(e) => setMonsterAlly(e.target.checked)}
                      className="accent-neon-cyan"
                    />
                    Ally
                  </label>
                  <button
                    type="submit"
                    className="px-4 py-2 text-[10px] font-black uppercase bg-neon-cyan text-black"
                  >
                    Add NPC
                  </button>
                  <p className="w-full text-[9px] font-mono text-zinc-500">
                    Matching SRD 5.2.1 names auto-fill HP, AC, and real attacks (Scimitar, breath weapons, etc.).
                  </p>
                  <button
                    type="button"
                    onClick={clearEncounter}
                    className="px-4 py-2 text-[10px] font-black uppercase border border-zinc-700 text-zinc-500 hover:text-danger"
                  >
                    Clear
                  </button>
                </form>
              </div>
            )}
          </section>

          <div
            className="hidden shrink-0 cursor-col-resize select-none lg:block"
            style={{ width: 6 }}
            onPointerDown={(event) => {
              event.preventDefault();
              resizeRef.current = { x: event.clientX, origin: dicePanelWidth };
            }}
            title="Drag to resize dice panel"
          >
            <div className="mx-auto h-full w-1 rounded-full bg-border hover:bg-neon-cyan/60" />
          </div>
          <aside
            className="w-full shrink-0 space-y-4 lg:max-w-[480px]"
            style={{ width: "100%", "--dice-panel-width": `${dicePanelWidth}px` }}
          >
            <div className="min-h-[280px] rounded-sm border border-border-bright bg-void-panel p-2 lg:min-h-[360px] lg:w-[var(--dice-panel-width)]">
              <DiceRoller
                campaignId={campaignId}
                token={token}
                rollerLabel={user?.username}
                combatActive={(encounter.combatants || []).length > 0}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
