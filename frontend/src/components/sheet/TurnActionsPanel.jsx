import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { impliesIncapacitated } from "../../lib/conditions";
import {
  ACTION_TYPES,
  actionNeedsTarget,
  buildAvailableActions,
  filterTargetCandidates,
  formatApiErrorDetail,
  targetLabel,
  validateTargetSelection,
} from "../../lib/combatActions";

const TYPE_LABELS = {
  [ACTION_TYPES.action]: "Action",
  [ACTION_TYPES.bonus_action]: "Bonus Action",
  [ACTION_TYPES.reaction]: "Reaction",
};

const CATEGORY_LABELS = {
  weapon: "Weapon",
  attack: "Attack",
  spell: "Spell",
  feature: "Feature",
  combat: "Ability",
  equipment: "Equipment",
  npc: "NPC",
  standard: "Standard",
};

function economyForCombatant(encounter, combatantId) {
  return (
    encounter?.turn_economy?.[combatantId] || {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
    }
  );
}

function cleanActionName(name) {
  return String(name || "")
    .replace(/\s*★\s*$/, "")
    .split("(")[0]
    .trim();
}

export function TurnActionsPanel({
  campaignId,
  token,
  sheet,
  actionSheet,
  actionCatalogMode = "pc",
  actionSheetLoading = false,
  encounter,
  actorCombatant,
  canTakeTurn,
  activeTurnName,
  isDmProxy = false,
  onEncounterUpdate,
  onSheetRefresh,
  onError,
}) {
  const [step, setStep] = useState("pick_type");
  const [pickedType, setPickedType] = useState(null);
  const [pickedAction, setPickedAction] = useState(null);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastOutcome, setLastOutcome] = useState("");

  const catalogSheet = actionSheet !== undefined ? actionSheet : sheet;
  const available = useMemo(
    () => buildAvailableActions(catalogSheet || {}, { mode: actionCatalogMode }),
    [catalogSheet, actionCatalogMode]
  );
  const economy = economyForCombatant(encounter, actorCombatant?.id);
  const incapacitated = impliesIncapacitated(actorCombatant?.conditions);

  useEffect(() => {
    setLastOutcome("");
    setStep("pick_type");
    setPickedType(null);
    setPickedAction(null);
    setTargetId("");
  }, [actorCombatant?.id, canTakeTurn]);

  const resetFlow = () => {
    setStep("pick_type");
    setPickedType(null);
    setPickedAction(null);
    setTargetId("");
  };

  const typeAvailable = (type) => {
    if (type === ACTION_TYPES.action) return !economy.action_used;
    if (type === ACTION_TYPES.bonus_action) return !economy.bonus_action_used;
    if (type === ACTION_TYPES.reaction) return !economy.reaction_used;
    return false;
  };

  const submitAction = async (action, targets = []) => {
    if (!token || !campaignId || !actorCombatant) return;
    setBusy(true);
    onError?.("");
    setLastOutcome("");
    try {
      const body = {
        action_id: action.id,
        action_name: cleanActionName(action.name),
        action_type: action.actionType,
        targeting: action.targeting,
        target_ids: targets,
        detail: action.detail || action.description || null,
      };
      if (isDmProxy) {
        body.combatant_id = actorCombatant.id;
      }
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/use-action`, {
        token,
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(err.detail, "Could not use action"));
      }
      const payload = await res.json();
      const nextEncounter = payload.encounter || payload;
      onEncounterUpdate?.(nextEncounter);
      const messages = payload.action_messages || [];
      setLastOutcome(messages.length ? messages.join(" · ") : `${actorCombatant.name} used ${action.name}.`);
      if (action.id.startsWith("equip-") || action.id.startsWith("unequip-")) {
        onSheetRefresh?.();
      }
      resetFlow();
    } catch (err) {
      onError?.(err.message || "Could not use action.");
    } finally {
      setBusy(false);
    }
  };

  const handlePickType = (type) => {
    setLastOutcome("");
    setPickedType(type);
    setStep("pick_action");
  };

  const handlePickAction = (action) => {
    setPickedAction(action);
    if (actionNeedsTarget(action)) {
      const candidates = filterTargetCandidates(
        encounter.combatants,
        actorCombatant.id,
        action.targeting
      );
      if (candidates.length === 0) {
        onError?.(`No valid targets for ${action.name} (${targetLabel(action.targeting)}).`);
        return;
      }
      setStep("pick_target");
      setTargetId("");
      return;
    }
    void submitAction(action, []);
  };

  const handleConfirmTarget = () => {
    if (!pickedAction) return;
    const check = validateTargetSelection(
      pickedAction,
      actorCombatant.id,
      targetId ? [targetId] : [],
      encounter.combatants
    );
    if (!check.ok) {
      onError?.(check.reason);
      return;
    }
    void submitAction(pickedAction, [targetId]);
  };

  if (!actorCombatant) return null;

  const showReaction = !canTakeTurn && typeAvailable(ACTION_TYPES.reaction);
  const showTurnPanel = canTakeTurn && !incapacitated;

  if (!showTurnPanel && !showReaction) {
    if (incapacitated && canTakeTurn) {
      return (
        <p className="text-[9px] font-mono text-danger">
          Incapacitated — {actorCombatant.name} cannot take actions, bonus actions, or reactions.
        </p>
      );
    }
    if (!canTakeTurn && activeTurnName) {
      return (
        <div className="rounded-sm border border-border/60 bg-void-deep/30 px-2 py-1.5">
          <p className="text-[9px] font-mono text-ink-faint">
            Waiting — <span className="font-black text-starlight">{activeTurnName}</span>
            {"'s turn"}
          </p>
        </div>
      );
    }
    return null;
  }

  if (actionSheetLoading) {
    return (
      <p className="text-[9px] font-mono text-ink-faint">Loading actions for {actorCombatant.name}…</p>
    );
  }

  const targetCandidates = pickedAction
    ? filterTargetCandidates(encounter.combatants, actorCombatant.id, pickedAction.targeting)
    : [];

  return (
    <div className="space-y-2 rounded-sm border border-neon-cyan/40 bg-neon-cyan/5 p-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-ink-faint">
        {isDmProxy ? (
          <>
            DM acting as <span className="text-starlight">{actorCombatant.name}</span>
          </>
        ) : (
          <>
            Your turn — <span className="text-starlight">{actorCombatant.name}</span>
          </>
        )}
      </p>

      {lastOutcome && step === "pick_type" && (
        <p className="rounded-sm border border-neon-cyan/30 bg-neon-cyan/10 px-2 py-1 text-[9px] font-mono text-neon-cyan">
          {lastOutcome}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 text-[8px] font-black uppercase">
        <span className={economy.action_used ? "text-ink-faint line-through" : "text-starlight"}>
          Action {economy.action_used ? "✓" : "○"}
        </span>
        <span
          className={
            economy.bonus_action_used ? "text-ink-faint line-through" : "text-starlight"
          }
        >
          Bonus {economy.bonus_action_used ? "✓" : "○"}
        </span>
        <span className={economy.reaction_used ? "text-ink-faint line-through" : "text-starlight"}>
          Reaction {economy.reaction_used ? "✓" : "○"}
        </span>
      </div>

      {step === "pick_type" && (
        <div className="flex flex-wrap gap-1">
          {showTurnPanel &&
            [ACTION_TYPES.action, ACTION_TYPES.bonus_action].map((type) => {
              const actions = available[type] || [];
              const enabled = typeAvailable(type) && (type === ACTION_TYPES.action || actions.length > 0);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => handlePickType(type)}
                  className="rounded-sm border border-starlight px-2 py-1 text-[9px] font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
                >
                  {TYPE_LABELS[type]}
                  {actions.length > 0 ? ` (${actions.length})` : ""}
                </button>
              );
            })}
          {showReaction && (
            <button
              type="button"
              disabled={busy || (available[ACTION_TYPES.reaction] || []).length === 0}
              onClick={() => handlePickType(ACTION_TYPES.reaction)}
              className="rounded-sm border border-neon-magenta px-2 py-1 text-[9px] font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
            >
              Reaction
            </button>
          )}
        </div>
      )}

      {step === "pick_action" && pickedType && (
        <div className="space-y-1">
          <p className="text-[8px] font-mono uppercase text-ink-faint">
            Choose {TYPE_LABELS[pickedType]}
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {(available[pickedType] || []).length === 0 ? (
              <p className="text-[9px] font-mono text-ink-faint">
                No {TYPE_LABELS[pickedType].toLowerCase()}s available for {actorCombatant.name}.
              </p>
            ) : null}
            {(available[pickedType] || []).map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={busy}
                onClick={() => handlePickAction(action)}
                className="flex w-full flex-col rounded-sm border border-border/60 bg-void-deep/40 px-2 py-1 text-left hover:border-neon-cyan/50 disabled:opacity-40"
              >
                <span className="text-[9px] font-black uppercase text-starlight">{action.name}</span>
                <span className="text-[8px] font-mono text-ink-faint">
                  {CATEGORY_LABELS[action.category] || action.category || "Action"}
                  {" · "}
                  {targetLabel(action.targeting)}
                </span>
                {(action.detail || action.description) && (
                  <span className="text-[8px] font-mono text-ink-muted line-clamp-2">
                    {action.detail || action.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetFlow}
            className="text-[8px] font-black uppercase text-ink-faint hover:text-starlight"
          >
            Back
          </button>
        </div>
      )}

      {step === "pick_target" && pickedAction && (
        <div className="space-y-1">
          <p className="text-[8px] font-mono text-ink-muted">
            <span className="font-black text-starlight">{pickedAction.name}</span>
            {" — "}
            {targetLabel(pickedAction.targeting)}
          </p>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {targetCandidates.length === 0 ? (
              <p className="text-[9px] font-mono text-danger">
                No valid targets ({targetLabel(pickedAction.targeting)}).
              </p>
            ) : (
              targetCandidates.map((combatant) => (
                <button
                  key={combatant.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setTargetId(combatant.id)}
                  className={`w-full rounded-sm border px-2 py-1 text-left text-[9px] font-black uppercase ${
                    targetId === combatant.id
                      ? "border-starlight bg-starlight/10 text-starlight"
                      : "border-border/60 text-ink hover:border-neon-cyan/40"
                  }`}
                >
                  {combatant.name}
                </button>
              ))
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={!targetId || busy}
              onClick={handleConfirmTarget}
              className="flex-1 rounded-sm border border-neon-cyan px-2 py-1 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setStep("pick_action")}
              className="rounded-sm border border-border px-2 py-1 text-[9px] font-black uppercase text-ink-faint"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EncounterCombatLog({ log, limit = 8 }) {
  const entries = (log || []).slice(-limit).reverse();
  if (!entries.length) return null;

  return (
    <div className="shrink-0 space-y-1 rounded-sm border border-border/60 bg-void-deep/40 p-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-ink-faint">Combat log</p>
      <ul className="max-h-24 space-y-0.5 overflow-y-auto">
        {entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="text-[9px] font-mono text-ink-muted">
            <span className={entry.kind === "action" || entry.kind === "hp" ? "text-neon-cyan" : "text-ink-faint"}>
              {entry.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
