import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Swords,
  Trash2,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { formatCombatantAc } from "../lib/encounterDisplay";
import { DiceRoller } from "../components/DiceRoller";

function sortCombatants(combatants) {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}

function newId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function InitiativePage() {
  const { campaignId } = useParams();
  const { token } = useAuth();
  const [campaignName, setCampaignName] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [encounter, setEncounter] = useState({ round: 1, active_index: 0, combatants: [] });
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [monsterName, setMonsterName] = useState("");
  const [monsterInit, setMonsterInit] = useState("10");
  const [monsterAlly, setMonsterAlly] = useState(false);

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
        const data = await res.json();
        setEncounter(data);
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
      const [campaignRes, encounterRes] = await Promise.all([
        apiFetch("/campaigns", { token }),
        apiFetch(`/campaigns/${campaignId}/encounter`, { token }),
      ]);

      if (!encounterRes.ok) throw new Error("Encounter not available");

      const encounterData = await encounterRes.json();
      setEncounter(encounterData);

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

  const sorted = sortCombatants(encounter.combatants);
  const activeIndex = encounter.active_combatant_id
    ? sorted.findIndex((c) => c.id === encounter.active_combatant_id)
    : encounter.active_index;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeCombatant = sorted[resolvedIndex] || null;

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
          conditions: "",
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
          conditions: "",
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
    const next = {
      ...encounter,
      combatants: nextCombatants,
      active_index: Math.min(encounter.active_index, Math.max(0, nextCombatants.length - 1)),
    };
    pushEncounter(next);
  };

  const nextTurn = () => {
    if (!sorted.length) return;
    const nextIndex = (resolvedIndex + 1) % sorted.length;
    const nextRound = nextIndex === 0 ? encounter.round + 1 : encounter.round;
    pushEncounter({
      ...encounter,
      active_index: nextIndex,
      active_combatant_id: sorted[nextIndex]?.id ?? null,
      round: nextRound,
    });
  };

  const prevTurn = () => {
    if (!sorted.length) return;
    const nextIndex = (resolvedIndex - 1 + sorted.length) % sorted.length;
    const nextRound =
      nextIndex === sorted.length - 1 && resolvedIndex === 0
        ? Math.max(1, encounter.round - 1)
        : encounter.round;
    pushEncounter({
      ...encounter,
      active_index: nextIndex,
      active_combatant_id: sorted[nextIndex]?.id ?? null,
      round: nextRound,
    });
  };

  const clearEncounter = () => {
    pushEncounter({
      round: 1,
      active_index: 0,
      active_combatant_id: null,
      combatants: [],
    });
  };

  const addAllFromRoster = async () => {
    if (!token || !campaignId) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/add-roster`, {
        token,
        method: "POST",
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan mb-4"
        >
          <ArrowLeft className="w-3 h-3" />
          Campaigns
        </Link>

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
                  onClick={prevTurn}
                  className="p-2 border border-zinc-700 hover:border-neon-cyan"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
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
              </>
            )}
          </div>
        </div>

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
          <div className="mb-4 p-4 border-2 border-starlight bg-black">
            <p className="text-[10px] uppercase text-zinc-500">Active turn</p>
            <p className="text-xl font-black text-starlight uppercase">{activeCombatant.name}</p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          <section>
            {sorted.length === 0 ? (
              <div className="p-8 border-2 border-dashed border-zinc-700 text-center text-xs font-mono text-zinc-500">
                No combatants yet. {isOwner ? "Add PCs from roster or monsters below." : ""}
              </div>
            ) : (
              <div className="space-y-2">
                {sorted.map((combatant, index) => (
                  <div
                    key={combatant.id}
                    className={`p-3 border-2 flex flex-wrap items-center gap-3 ${
                      index === resolvedIndex
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
                        {combatant.is_pc && (
                          <span className="ml-2 text-[9px] text-neon-cyan">PC</span>
                        )}
                        {combatant.is_ally && !combatant.is_pc && (
                          <span className="ml-2 text-[9px] text-neon-cyan">ALLY</span>
                        )}
                      </p>
                      {(combatant.hp != null || formatCombatantAc(combatant, isOwner)) && (
                        <p className="text-[10px] font-mono text-zinc-500">
                          {combatant.hp != null && combatant.max_hp != null
                            ? `HP ${combatant.hp}/${combatant.max_hp}`
                            : ""}
                          {formatCombatantAc(combatant, isOwner)}
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
                        <input
                          type="text"
                          value={combatant.conditions || ""}
                          onChange={(e) =>
                            updateCombatant(combatant.id, { conditions: e.target.value })
                          }
                          placeholder="Conditions"
                          className="w-28 px-2 py-1 bg-black border border-zinc-800 text-[10px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeCombatant(combatant.id)}
                          className="text-zinc-600 hover:text-danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {!isOwner && combatant.conditions && (
                      <span className="text-[10px] text-zinc-500">{combatant.conditions}</span>
                    )}
                  </div>
                ))}
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
                        Add all players
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
                  <input
                    type="text"
                    value={monsterName}
                    onChange={(e) => setMonsterName(e.target.value)}
                    placeholder="Monster / NPC name"
                    className="flex-1 min-w-[160px] px-3 py-2 bg-black border border-zinc-700 text-sm font-mono"
                  />
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

          <aside className="space-y-4">
            <DiceRoller />
          </aside>
        </div>
      </div>
    </div>
  );
}
