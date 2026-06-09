import { useState } from "react";
import { apiFetch } from "../../lib/api";
import { parseEncounterPatchResponse } from "../../lib/encounterDisplay";

export function listReadiedCombatants(encounter) {
  return (encounter?.combatants || [])
    .map((combatant) => {
      const economy = encounter?.turn_economy?.[combatant.id];
      if (!economy?.readied_action) return null;
      return { combatant, economy };
    })
    .filter(Boolean);
}

export function ReadiedActionsPanel({
  campaignId,
  token,
  encounter,
  onEncounterUpdate,
  onError,
  compact = false,
}) {
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const readied = listReadiedCombatants(encounter);

  if (!readied.length) return null;

  const run = async (combatantId, path, body) => {
    if (!token || !campaignId) return;
    setBusyId(combatantId);
    onError?.("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/${path}`, {
        token,
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Request failed");
      }
      const parsed = parseEncounterPatchResponse(await res.json());
      onEncounterUpdate?.(parsed.encounter);
    } catch (err) {
      onError?.(err.message || "Could not update readied action.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className={`rounded-sm border border-neon-magenta/40 bg-neon-magenta/5 ${
        compact ? "p-2 space-y-2" : "p-3 space-y-3"
      }`}
    >
      <p
        className={`font-black uppercase text-neon-magenta ${
          compact ? "text-[9px]" : "text-[10px] sm:text-xs"
        }`}
      >
        Readied actions (5.5e)
      </p>
      <ul className={compact ? "space-y-2" : "space-y-3"}>
        {readied.map(({ combatant, economy }) => (
          <li
            key={combatant.id}
            className="rounded-sm border border-border/60 bg-black/40 p-2 space-y-1.5"
          >
            <p className={`font-black uppercase text-starlight ${compact ? "text-[10px]" : "text-xs"}`}>
              {combatant.name}
            </p>
            <p className={`font-mono text-ink-muted ${compact ? "text-[9px]" : "text-[10px] sm:text-xs"}`}>
              Readies <span className="text-neon-cyan">{economy.readied_action}</span>
              {economy.readied_trigger ? (
                <>
                  {" "}
                  when <span className="text-starlight">{economy.readied_trigger}</span>
                </>
              ) : (
                <span className="text-ink-faint"> (trigger TBD)</span>
              )}
            </p>
            <input
              type="text"
              value={notes[combatant.id] ?? ""}
              disabled={busyId === combatant.id}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [combatant.id]: e.target.value }))
              }
              placeholder="Optional note for the log"
              className={`w-full rounded-sm border border-border bg-black px-2 py-1 font-mono text-starlight ${
                compact ? "text-[9px]" : "text-[10px] sm:text-xs"
              }`}
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={busyId === combatant.id || economy.reaction_used}
                title={
                  economy.reaction_used
                    ? "Reaction already used this round"
                    : "Resolve trigger and spend their reaction"
                }
                onClick={() =>
                  run(combatant.id, "trigger-readied", {
                    combatant_id: combatant.id,
                    note: notes[combatant.id] || null,
                  })
                }
                className={`rounded-sm border border-neon-cyan px-2 py-0.5 font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40 ${
                  compact ? "text-[9px]" : "text-[10px] sm:text-xs"
                }`}
              >
                {busyId === combatant.id ? "…" : "Trigger (reaction)"}
              </button>
              <button
                type="button"
                disabled={busyId === combatant.id}
                onClick={() =>
                  run(combatant.id, "cancel-readied", { combatant_id: combatant.id })
                }
                className={`rounded-sm border border-border px-2 py-0.5 font-black uppercase text-ink-faint hover:text-starlight disabled:opacity-40 ${
                  compact ? "text-[9px]" : "text-[10px] sm:text-xs"
                }`}
              >
                Cancel ready
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
