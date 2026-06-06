import { useState } from "react";
import { X } from "lucide-react";
import {
  CONDITION_HINTS,
  CONDITION_OPTIONS,
  addCondition,
  canAddCondition,
  formatExhaustion,
  getExhaustionLevel,
  normalizeConditions,
  removeCondition,
} from "../../lib/conditions";

export function ConditionsEditor({ conditions, onChange, disabled = false, compact = false }) {
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const list = normalizeConditions(conditions);

  const handleAdd = () => {
    if (!pick) return;
    const result = addCondition(list, pick);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError("");
    onChange(result.conditions);
    setPick("");
  };

  const handleRemove = (label) => {
    onChange(removeCondition(list, label));
    setError("");
  };

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex flex-wrap gap-1">
        {list.length === 0 ? (
          <span className="text-[9px] font-mono text-ink-faint">No conditions</span>
        ) : (
          list.map((label) => (
            <span
              key={label}
              title={CONDITION_HINTS[label.split(/\s+/)[0]] || label}
              className="inline-flex items-center gap-0.5 rounded-sm border border-neon-magenta/40 bg-neon-magenta/10 px-1.5 py-0.5 text-[8px] font-black uppercase text-neon-magenta"
            >
              {label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(label)}
                  className="rounded-sm hover:bg-neon-magenta/20"
                  title={`Remove ${label}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))
        )}
      </div>
      {!disabled && (
        <div className="flex gap-1">
          <select
            value={pick}
            onChange={(e) => {
              setPick(e.target.value);
              setError("");
            }}
            className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-[9px] font-mono text-ink"
          >
            <option value="">Add condition…</option>
            {CONDITION_OPTIONS.map((option) => {
              const allowed = canAddCondition(list, option);
              const hint = CONDITION_HINTS[option];
              return (
                <option key={option} value={option} disabled={!allowed} title={hint}>
                  {option}
                  {!allowed && option === "Exhaustion" && exhaustionOptionSuffix(list)}
                  {!allowed && option !== "Exhaustion" ? " (blocked)" : ""}
                </option>
              );
            })}
          </select>
          <button
            type="button"
            disabled={!pick || !canAddCondition(list, pick)}
            onClick={handleAdd}
            className="shrink-0 rounded-sm border border-neon-cyan px-2 py-1 text-[8px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      {pick && CONDITION_HINTS[pick] && (
        <p className="text-[8px] font-mono leading-snug text-ink-faint">{CONDITION_HINTS[pick]}</p>
      )}
      {error && <p className="text-[8px] font-mono text-danger">{error}</p>}
    </div>
  );
}

function exhaustionOptionSuffix(list) {
  const level = getExhaustionLevel(list);
  if (level >= 6) return " (max)";
  if (level > 0) return ` → ${formatExhaustion(level + 1)}`;
  return "";
}
