import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { loadActionRulesCatalog } from "../../lib/actionRules";
import { impliesIncapacitated } from "../../lib/conditions";
import { formatCombatResources, parseCombatEndPayload, turnStatusLabels } from "../../lib/encounterDisplay";
import {
  ACTION_TYPES,
  actionHasOptions,
  actionNeedsReadyDetail,
  actionNeedsTarget,
  buildAvailableActions,
  canAffordResourceCost,
  groupActionsForPicker,
  resolveOptionAction,
  filterTargetCandidates,
  formatApiErrorDetail,
  resourceCostLabel,
  targetLabel,
  validateTargetSelection,
} from "../../lib/combatActions";

const TYPE_LABELS = {
  [ACTION_TYPES.action]: "Action",
  [ACTION_TYPES.bonus_action]: "Bonus Action",
  [ACTION_TYPES.reaction]: "Reaction",
  [ACTION_TYPES.magic_action]: "Magic",
};

const CATEGORY_LABELS = {
  weapon: "Weapon",
  attack: "Attack",
  spell: "Spell",
  feature: "Feature",
  combat: "Ability",
  npc: "NPC",
  standard: "Standard",
};

function economyForCombatant(encounter, combatantId) {
  return (
    encounter?.turn_economy?.[combatantId] || {
      action_used: false,
      bonus_action_used: false,
      reaction_used: false,
      movement_remaining: null,
      extra_action_available: false,
      attacks_remaining: 0,
      magic_action_used: false,
      dodging: false,
      disengaged: false,
      hiding: false,
    }
  );
}

function cleanActionName(name) {
  return String(name || "")
    .replace(/\s*★\s*$/, "")
    .split("(")[0]
    .trim();
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
  canAdjustMovement = false,
  onEncounterUpdate,
  onSheetRefresh,
  onCombatEnded,
  onError,
}) {
  const [step, setStep] = useState("pick_type");
  const [pickedType, setPickedType] = useState(null);
  const [pickedAction, setPickedAction] = useState(null);
  const [targetId, setTargetId] = useState("");
  const [readyDetail, setReadyDetail] = useState("");
  const [readyTrigger, setReadyTrigger] = useState("");
  const [busy, setBusy] = useState(false);
  const [movementBusy, setMovementBusy] = useState(false);
  const [lastOutcome, setLastOutcome] = useState("");
  const [rulesReady, setRulesReady] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void loadActionRulesCatalog(token).then(() => {
      if (!cancelled) setRulesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const catalogSheet = actionSheet !== undefined ? actionSheet : sheet;
  const available = useMemo(
    () => buildAvailableActions(catalogSheet || {}, { mode: actionCatalogMode }),
    [catalogSheet, actionCatalogMode, rulesReady]
  );
  const economy = economyForCombatant(encounter, actorCombatant?.id);
  const turnStatuses = turnStatusLabels(economy, encounter?.combatants);
  const incapacitated = impliesIncapacitated(actorCombatant?.conditions);

  useEffect(() => {
    setLastOutcome("");
    setStep("pick_type");
    setPickedType(null);
    setPickedAction(null);
    setTargetId("");
    setReadyDetail("");
    setReadyTrigger("");
  }, [actorCombatant?.id, canTakeTurn]);

  const resetFlow = () => {
    setStep("pick_type");
    setPickedType(null);
    setPickedAction(null);
    setTargetId("");
    setReadyDetail("");
    setReadyTrigger("");
  };

  const freeActionFeatures = (available[ACTION_TYPES.action] || []).some(
    (action) => action.skipsEconomy
  );

  const typeAvailable = (type) => {
    if (type === ACTION_TYPES.action) {
      return (
        !economy.action_used ||
        economy.attacks_remaining > 0 ||
        economy.extra_action_available ||
        freeActionFeatures
      );
    }
    if (type === ACTION_TYPES.bonus_action) return !economy.bonus_action_used;
    if (type === ACTION_TYPES.reaction) return !economy.reaction_used;
    if (type === ACTION_TYPES.magic_action) return !economy.magic_action_used;
    return false;
  };

  const adjustMovement = async (delta) => {
    if (!token || !campaignId || !actorCombatant || delta === 0) return;
    setMovementBusy(true);
    onError?.("");
    try {
      const body = { delta };
      if (isDmProxy) {
        body.combatant_id = actorCombatant.id;
      }
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/adjust-movement`, {
        token,
        method: "POST",
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(formatApiErrorDetail(err.detail, "Could not adjust movement"));
      }
      onEncounterUpdate?.(await res.json());
    } catch (err) {
      onError?.(err.message || "Could not adjust movement.");
    } finally {
      setMovementBusy(false);
    }
  };

  const submitAction = async (action, targets = []) => {
    if (!token || !campaignId || !actorCombatant) return;
    setBusy(true);
    onError?.("");
    setLastOutcome("");
    try {
      const rawDetail = action.readyDetail ?? action.detail ?? null;
      const rawTrigger = action.readyTrigger ?? null;
      const body = {
        action_id: action.id,
        action_name: cleanActionName(action.name),
        action_type: action.actionType,
        targeting: action.targeting,
        target_ids: targets,
        detail:
          rawDetail && rawDetail.length > 200 ? rawDetail.slice(0, 200) : rawDetail,
        trigger:
          rawTrigger && rawTrigger.length > 200 ? rawTrigger.slice(0, 200) : rawTrigger,
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
      const parsed = parseCombatEndPayload(payload);
      onEncounterUpdate?.(parsed.encounter);
      const messages = payload.action_messages || [];
      setLastOutcome(messages.length ? messages.join(" · ") : `${actorCombatant.name} used ${action.name}.`);
      if (parsed.combatEnded) {
        onCombatEnded?.(parsed.combatLogText, parsed.reason);
      }
      if (actorCombatant.character_id) {
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
    if (!canAffordResourceCost(catalogSheet, action)) {
      const label = resourceCostLabel(action);
      onError?.(label ? `Not enough resources (${label} required).` : "Not enough resources for this action.");
      return;
    }
    setPickedAction(action);
    if (actionNeedsReadyDetail(action)) {
      setReadyDetail("");
      setReadyTrigger("");
      setStep("pick_detail");
      return;
    }
    if (actionHasOptions(action)) {
      setStep("pick_option");
      return;
    }
    if (action.requiresOption) {
      onError?.(`No beast forms on file for ${action.name}. Re-sync from PDF or add wild shapes to the sheet.`);
      return;
    }
    if (actionNeedsTarget(action)) {
      const candidates = filterTargetCandidates(
        encounter.combatants,
        actorCombatant.id,
        action.targeting,
        actorCombatant
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
      encounter.combatants,
      actorCombatant
    );
    if (!check.ok) {
      onError?.(check.reason);
      return;
    }
    void submitAction(pickedAction, [targetId]);
  };

  const handlePickOption = (option) => {
    if (!pickedAction) return;
    const resolved = resolveOptionAction(pickedAction, option);
    if (!resolved) return;
    if (actionNeedsTarget(resolved)) {
      const candidates = filterTargetCandidates(
        encounter.combatants,
        actorCombatant.id,
        resolved.targeting,
        actorCombatant
      );
      if (candidates.length === 0) {
        onError?.(`No valid targets for ${resolved.name} (${targetLabel(resolved.targeting)}).`);
        return;
      }
      setPickedAction(resolved);
      setStep("pick_target");
      setTargetId("");
      return;
    }
    void submitAction(resolved, []);
  };

  if (!actorCombatant) return null;

  const showReaction = !canTakeTurn && typeAvailable(ACTION_TYPES.reaction);
  const showTurnPanel = canTakeTurn && !incapacitated;
  const movementLabel =
    economy.movement_remaining != null && actorCombatant.speed != null
      ? `${economy.movement_remaining}/${actorCombatant.speed} ft`
      : economy.movement_remaining != null
        ? `${economy.movement_remaining} ft`
        : actorCombatant.speed != null
          ? `${actorCombatant.speed} ft`
          : "—";

  if (!showTurnPanel && !showReaction) {
    if (incapacitated && canTakeTurn) {
      return (
        <p className="text-xs sm:text-sm font-mono text-danger">
          Incapacitated — {actorCombatant.name} cannot take actions, bonus actions, or reactions.
        </p>
      );
    }
    if (!canTakeTurn && activeTurnName) {
      return (
        <div className="rounded-sm border border-border/60 bg-void-deep/30 px-2 py-1.5">
          <p className="text-xs sm:text-sm font-mono text-ink-faint">
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
      <p className="text-xs sm:text-sm font-mono text-ink-faint">Loading actions for {actorCombatant.name}…</p>
    );
  }

  const targetCandidates = pickedAction
    ? filterTargetCandidates(
        encounter.combatants,
        actorCombatant.id,
        pickedAction.targeting,
        actorCombatant
      )
    : [];
  const pickerActions = (() => {
    const list = available[pickedType] || [];
    if (pickedType !== ACTION_TYPES.action || !economy.action_used) return list;
    if (economy.attacks_remaining > 0) {
      return list.filter((action) => action.category === "weapon" || action.category === "attack");
    }
    if (!economy.extra_action_available) {
      return list.filter((action) => action.skipsEconomy);
    }
    return list;
  })();
  const pickerGroups = groupActionsForPicker(pickerActions);
  const resourceSummary = formatCombatResources(catalogSheet);

  const handleConfirmReadyDetail = () => {
    if (!pickedAction) return;
    const detail = readyDetail.trim() || "an action";
    const trigger = readyTrigger.trim() || null;
    void submitAction({ ...pickedAction, readyDetail: detail, readyTrigger: trigger }, []);
  };

  return (
    <div className="session-ui space-y-2 rounded-sm border border-neon-cyan/40 bg-neon-cyan/5 p-2.5 sm:space-y-3 sm:p-3">
      <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">
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
        <p className="rounded-sm border border-neon-cyan/30 bg-neon-cyan/10 px-2 py-1 text-xs sm:text-sm font-mono text-neon-cyan">
          {lastOutcome}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs font-black uppercase">
        <span
          className={
            economy.action_used && !economy.extra_action_available
              ? "text-ink-faint line-through"
              : "text-starlight"
          }
        >
          Action {economy.action_used && !economy.extra_action_available && economy.attacks_remaining <= 0 ? "✓" : "○"}
          {economy.extra_action_available ? " (+1)" : ""}
          {economy.attacks_remaining > 0 ? ` · ${economy.attacks_remaining} atk` : ""}
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
        {(available[ACTION_TYPES.magic_action] || []).length > 0 && (
          <span
            className={
              economy.magic_action_used ? "text-ink-faint line-through" : "text-starlight"
            }
          >
            Magic {economy.magic_action_used ? "✓" : "○"}
          </span>
        )}
        <span className="text-neon-cyan">Move {movementLabel}</span>
      </div>

      {turnStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {turnStatuses.map((label) => (
            <span
              key={label}
              className="rounded-sm border border-neon-magenta/40 bg-neon-magenta/10 px-1.5 py-0.5 text-[11px] sm:text-xs font-black uppercase text-neon-magenta"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {resourceSummary && (
        <p className="text-[11px] sm:text-xs font-mono text-neon-cyan">
          <span className="font-black uppercase text-ink-faint">Uses </span>
          {resourceSummary}
        </p>
      )}

      {canAdjustMovement && (
        <div className="space-y-1 rounded-sm border border-border/50 bg-void-deep/30 px-2 py-1.5">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">
            Spend movement
          </p>
          <MovementStepButtons disabled={movementBusy || busy} onAdjust={adjustMovement} />
        </div>
      )}

      {step === "pick_type" && (
        <div className="flex flex-wrap gap-1">
          {showTurnPanel &&
            [ACTION_TYPES.action, ACTION_TYPES.bonus_action, ACTION_TYPES.magic_action].map((type) => {
              const actions = available[type] || [];
              const enabled =
                typeAvailable(type) &&
                actions.length > 0 &&
                (type === ACTION_TYPES.action || type === ACTION_TYPES.bonus_action || type === ACTION_TYPES.magic_action);
              return (
                <button
                  key={type}
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => handlePickType(type)}
                  className="rounded-sm border border-starlight px-2 py-1 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
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
              className="rounded-sm border border-neon-magenta px-2 py-1 text-xs sm:text-sm font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
            >
              Reaction
            </button>
          )}
        </div>
      )}

      {step === "pick_action" && pickedType && (
        <div className="space-y-1">
          <p className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">
            Choose {TYPE_LABELS[pickedType]}
          </p>
          <div className="max-h-40 space-y-2 overflow-y-auto">
            {pickerGroups.length === 0 ? (
              <p className="text-xs sm:text-sm font-mono text-ink-faint">
                No {TYPE_LABELS[pickedType].toLowerCase()}s available for {actorCombatant.name}.
              </p>
            ) : (
              pickerGroups.map((group) => (
                <div key={group.category} className="space-y-1">
                  <p className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-ink-faint">
                    {group.label}
                  </p>
                  {group.actions.map((action) => {
                    const affordable = canAffordResourceCost(catalogSheet, action);
                    const costLabel = resourceCostLabel(action);
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={busy || !affordable}
                        onClick={() => handlePickAction(action)}
                        className="flex w-full flex-col rounded-sm border border-border/60 bg-void-deep/40 px-2 py-1 text-left hover:border-neon-cyan/50 disabled:opacity-40"
                      >
                        <span className="text-xs sm:text-sm font-black uppercase text-starlight">
                          {action.name}
                        </span>
                        <span className="text-[11px] sm:text-xs font-mono text-ink-faint">
                          {targetLabel(action.targeting)}
                          {costLabel ? ` · ${costLabel}` : ""}
                        </span>
                        {(action.detail || action.description) && (
                          <span className="text-[11px] sm:text-xs font-mono text-ink-muted line-clamp-2">
                            {action.detail || action.description}
                          </span>
                        )}
                        {!affordable && costLabel && (
                          <span className="text-[11px] sm:text-xs font-mono text-danger">Insufficient {costLabel}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={resetFlow}
            className="text-[11px] sm:text-xs font-black uppercase text-ink-faint hover:text-starlight"
          >
            Back
          </button>
        </div>
      )}

      {step === "pick_option" && pickedAction && (
        <div className="space-y-1">
          <p className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">
            {pickedAction.name} — choose form
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {(pickedAction.options || []).map((option, index) => (
              <button
                key={option.id || option.name || index}
                type="button"
                disabled={busy}
                onClick={() => handlePickOption(option)}
                className="flex w-full flex-col rounded-sm border border-border/60 bg-void-deep/40 px-2 py-1 text-left hover:border-neon-cyan/50 disabled:opacity-40"
              >
                <span className="text-xs sm:text-sm font-black uppercase text-starlight">{option.name}</span>
                {(option.notes || option.cr) && (
                  <span className="text-[11px] sm:text-xs font-mono text-ink-faint line-clamp-2">
                    {[option.cr ? `CR ${option.cr}` : null, option.notes].filter(Boolean).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setStep("pick_action");
              setPickedAction(null);
            }}
            className="text-[11px] sm:text-xs font-black uppercase text-ink-faint hover:text-starlight"
          >
            Back
          </button>
        </div>
      )}

      {step === "pick_detail" && pickedAction && (
        <div className="space-y-1">
          <p className="text-[11px] sm:text-xs font-mono uppercase text-ink-faint">
            Ready action (D&amp;D 5.5e) — prepare a Reaction for later this round
          </p>
          <input
            type="text"
            value={readyDetail}
            disabled={busy}
            onChange={(e) => setReadyDetail(e.target.value)}
            placeholder="Action to ready (e.g. Fire Bolt, Attack with longbow)"
            className="w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-starlight"
          />
          <input
            type="text"
            value={readyTrigger}
            disabled={busy}
            onChange={(e) => setReadyTrigger(e.target.value)}
            placeholder="Perceivable trigger (e.g. the goblin moves within 30 ft)"
            className="w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-starlight"
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirmReadyDetail}
              className="flex-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs sm:text-sm font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              Take Ready
            </button>
            <button
              type="button"
              onClick={() => setStep("pick_action")}
              className="rounded-sm border border-border px-2 py-1 text-xs sm:text-sm font-black uppercase text-ink-faint"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === "pick_target" && pickedAction && (
        <div className="space-y-1">
          <p className="text-[11px] sm:text-xs font-mono text-ink-muted">
            <span className="font-black text-starlight">{pickedAction.name}</span>
            {" — "}
            {targetLabel(pickedAction.targeting)}
          </p>
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {targetCandidates.length === 0 ? (
              <p className="text-xs sm:text-sm font-mono text-danger">
                No valid targets ({targetLabel(pickedAction.targeting)}).
              </p>
            ) : (
              targetCandidates.map((combatant) => (
                <button
                  key={combatant.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setTargetId(combatant.id)}
                  className={`w-full rounded-sm border px-2 py-1 text-left text-xs sm:text-sm font-black uppercase ${
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
              className="flex-1 rounded-sm border border-neon-cyan px-2 py-1 text-xs sm:text-sm font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setStep("pick_action")}
              className="rounded-sm border border-border px-2 py-1 text-xs sm:text-sm font-black uppercase text-ink-faint"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLogEntry(entry) {
  if (entry.kind === "roll" && entry.dice && entry.result != null) {
    const bonus = entry.bonus ? ` ${entry.bonus > 0 ? "+" : ""}${entry.bonus}` : "";
    const total =
      entry.total != null && entry.total !== entry.result ? ` = ${entry.total}` : "";
    return `${entry.dice}: ${entry.result}${bonus}${total} — ${entry.message}`;
  }
  return entry.message;
}

export function EncounterCombatLog({ log, limit = 8 }) {
  const entries = (log || []).slice(-limit).reverse();
  if (!entries.length) return null;

  return (
    <div className="shrink-0 space-y-1 rounded-sm border border-border/60 bg-void-deep/40 p-2">
      <p className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-ink-faint">Combat log</p>
      <ul className="max-h-24 space-y-0.5 overflow-y-auto">
        {entries.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="text-xs sm:text-sm font-mono text-ink-muted">
            <span
              className={
                entry.kind === "roll"
                  ? "text-neon-magenta"
                  : entry.kind === "action" || entry.kind === "hp"
                    ? "text-neon-cyan"
                    : "text-ink-faint"
              }
            >
              {formatLogEntry(entry)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
