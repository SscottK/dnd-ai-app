import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Dices } from "lucide-react";
import { LevelUpChoiceStep } from "../components/levelup/LevelUpChoiceStep";
import { useNestedPageLayout } from "../contexts/PageRefreshContext";
import { useAuth } from "../hooks/useAuth";
import { APP_MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { apiFetch } from "../lib/api";
import {
  applyLevelUp,
  fetchLevelUpPreview,
  isChoiceComplete,
  rollHitDieHp,
} from "../lib/levelUp";

export function LevelUpPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  useNestedPageLayout(isMobile);

  const [character, setCharacter] = useState(null);
  const [preview, setPreview] = useState(null);
  const [step, setStep] = useState("confirm");
  const [hpMethod, setHpMethod] = useState("average");
  const [hpGain, setHpGain] = useState(null);
  const [rolledValue, setRolledValue] = useState(null);
  const [healCurrent, setHealCurrent] = useState(true);
  const [choices, setChoices] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const requiredChoices = preview?.required_choices || [];

  const steps = useMemo(() => {
    const list = ["confirm", "hp"];
    requiredChoices.forEach((_, index) => list.push(`choice:${index}`));
    list.push("review");
    return list;
  }, [requiredChoices]);

  const stepIndex = steps.indexOf(step);
  const activeChoice =
    step.startsWith("choice:") && requiredChoices[Number(step.split(":")[1])]
      ? requiredChoices[Number(step.split(":")[1])]
      : null;

  const load = useCallback(async () => {
    if (!token || !characterId) return;
    setLoading(true);
    setError("");
    try {
      const [charRes, previewData] = await Promise.all([
        apiFetch(`/characters/${characterId}`, { token }),
        fetchLevelUpPreview(characterId, token),
      ]);
      if (!charRes.ok) throw new Error("Character not found");
      setCharacter(await charRes.json());
      setPreview(previewData);
      setHpGain(previewData.average_hp_gain);
      setHpMethod("average");
      setRolledValue(null);
      setChoices({});
      setStep("confirm");
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not load level-up preview.");
      setCharacter(null);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [token, characterId]);

  useEffect(() => {
    load();
  }, [load]);

  const pbChanged = useMemo(() => {
    if (!preview?.proficiency_bonus) return false;
    return preview.proficiency_bonus.from !== preview.proficiency_bonus.to;
  }, [preview]);

  const chooseAverage = () => {
    if (!preview) return;
    setHpMethod("average");
    setHpGain(preview.average_hp_gain);
    setRolledValue(null);
  };

  const chooseRoll = () => {
    if (!preview) return;
    const value = rollHitDieHp(preview.hit_die, preview.con_modifier);
    setHpMethod("roll");
    setRolledValue(value);
    setHpGain(value);
  };

  const canContinue = () => {
    if (step === "hp") return hpGain != null && hpGain >= 1;
    if (activeChoice) {
      return isChoiceComplete(activeChoice, choices[activeChoice.id]);
    }
    return true;
  };

  const goNext = () => {
    if (stepIndex < 0 || stepIndex >= steps.length - 1) return;
    setStep(steps[stepIndex + 1]);
  };

  const goBack = () => {
    if (stepIndex <= 0) return;
    setStep(steps[stepIndex - 1]);
  };

  const handleSave = async () => {
    if (!token || !characterId || hpGain == null) return;
    setSaving(true);
    setError("");
    try {
      await applyLevelUp(characterId, token, {
        hpGain,
        healCurrent,
        hpMethod,
        choices,
      });
      navigate(`/character/${characterId}?view=digital`, { replace: true });
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not save level-up.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-500">
        Preparing level-up…
      </div>
    );
  }

  if (!character || !preview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <p className="font-mono text-xs text-danger">{error || "Level-up unavailable"}</p>
        <Link to={`/character/${characterId}`} className="text-xs text-neon-cyan hover:text-starlight">
          Back to sheet
        </Link>
      </div>
    );
  }

  const stepLabel = (id) => {
    if (id === "confirm") return "Confirm";
    if (id === "hp") return "HP";
    if (id === "review") return "Review";
    if (id.startsWith("choice:")) {
      const choice = requiredChoices[Number(id.split(":")[1])];
      return choice?.label || "Choice";
    }
    return id;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-neon-magenta bg-zinc-950 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to={`/character/${characterId}`}
            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan"
          >
            <ArrowLeft className="h-3 w-3" />
            <span className="hidden sm:inline">Sheet</span>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase text-starlight">Level Up</h1>
            <p className="truncate font-mono text-[10px] text-neon-cyan">
              {character.name}
              {preview.class_name ? ` · ${preview.class_name}` : ""} · {preview.current_level} →{" "}
              {preview.new_level}
            </p>
          </div>
        </div>
        <p className="hidden font-mono text-[9px] uppercase text-zinc-500 sm:block">
          Step {Math.max(1, stepIndex + 1)} / {steps.length}: {stepLabel(step)}
        </p>
      </header>

      {error && (
        <p className="shrink-0 border-b border-danger/30 px-4 py-2 font-mono text-[10px] text-danger">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-6">
          {step === "confirm" && (
            <section className="space-y-4">
              <h2 className="text-base font-black uppercase text-starlight">Confirm advancement</h2>
              <p className="text-sm text-zinc-400">
                Advance one level in {preview.class_name || "your class"} (5.5e / 2024). You&apos;ll
                set hit points
                {requiredChoices.length
                  ? ` and make ${requiredChoices.length} choice${requiredChoices.length === 1 ? "" : "s"}`
                  : ""}
                , then save. A snapshot is kept so you can undo the last level-up.
              </p>
              <dl className="grid grid-cols-2 gap-3 border border-neon-cyan/25 bg-void-panel/50 p-4 font-mono text-xs">
                <div>
                  <dt className="text-[9px] uppercase text-zinc-500">Level</dt>
                  <dd className="text-starlight">
                    {preview.current_level} → {preview.new_level}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase text-zinc-500">Hit die</dt>
                  <dd className="text-starlight">d{preview.hit_die}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase text-zinc-500">Proficiency</dt>
                  <dd className="text-starlight">
                    +{preview.proficiency_bonus.from}
                    {pbChanged ? ` → +${preview.proficiency_bonus.to}` : " (unchanged)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase text-zinc-500">Hit dice</dt>
                  <dd className="text-starlight">{preview.hit_dice_next}</dd>
                </div>
              </dl>
              {requiredChoices.length > 0 && (
                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-wide text-neon-magenta">
                    Choices required
                  </p>
                  <ul className="space-y-1.5 border border-zinc-800 p-3">
                    {requiredChoices.map((c) => (
                      <li key={c.id} className="text-xs text-zinc-300">
                        <span className="font-semibold text-starlight">{c.label}</span>
                        <span className="ml-2 text-[9px] uppercase text-zinc-600">{c.type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.unlocks?.length > 0 && (
                <div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-wide text-neon-cyan">
                    Automatic unlocks
                  </p>
                  <ul className="space-y-1.5 border border-zinc-800 p-3">
                    {preview.unlocks.map((u) => (
                      <li key={`${u.kind}-${u.name}`} className="text-xs text-zinc-300">
                        <span className="font-semibold text-starlight">{u.name}</span>
                        <span className="ml-2 text-[9px] uppercase text-zinc-600">{u.kind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {step === "hp" && (
            <section className="space-y-4">
              <h2 className="text-base font-black uppercase text-starlight">Hit points</h2>
              <p className="text-sm text-zinc-400">
                CON modifier is {preview.con_modifier >= 0 ? "+" : ""}
                {preview.con_modifier}. Average uses floor(die/2)+1 + CON (2024).
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={chooseAverage}
                  className={`border p-4 text-left transition ${
                    hpMethod === "average"
                      ? "border-neon-magenta bg-neon-magenta/10"
                      : "border-zinc-700 hover:border-neon-cyan/50"
                  }`}
                >
                  <p className="text-[9px] font-black uppercase text-neon-cyan">Take average</p>
                  <p className="mt-1 text-2xl font-black text-starlight">+{preview.average_hp_gain}</p>
                </button>
                <button
                  type="button"
                  onClick={chooseRoll}
                  className={`border p-4 text-left transition ${
                    hpMethod === "roll"
                      ? "border-neon-magenta bg-neon-magenta/10"
                      : "border-zinc-700 hover:border-neon-cyan/50"
                  }`}
                >
                  <p className="flex items-center gap-1 text-[9px] font-black uppercase text-neon-cyan">
                    <Dices className="h-3 w-3" />
                    Roll d{preview.hit_die}
                  </p>
                  <p className="mt-1 text-2xl font-black text-starlight">
                    {rolledValue != null ? `+${rolledValue}` : "—"}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    Range {preview.roll_hp_min}–{preview.roll_hp_max} · tap to roll
                  </p>
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={healCurrent}
                  onChange={(e) => setHealCurrent(e.target.checked)}
                  className="accent-neon-cyan"
                />
                Also increase current HP by the same amount
              </label>
            </section>
          )}

          {activeChoice && (
            <LevelUpChoiceStep
              key={activeChoice.id}
              spec={activeChoice}
              value={choices[activeChoice.id]}
              onChange={(next) =>
                setChoices((prev) => ({
                  ...prev,
                  [activeChoice.id]: next,
                }))
              }
            />
          )}

          {step === "review" && (
            <section className="space-y-4">
              <h2 className="text-base font-black uppercase text-starlight">Review &amp; save</h2>
              <dl className="space-y-2 border border-neon-cyan/25 bg-void-panel/50 p-4 font-mono text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">New level</dt>
                  <dd className="text-starlight">{preview.new_level}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">HP gain ({hpMethod})</dt>
                  <dd className="text-starlight">+{hpGain}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Hit dice</dt>
                  <dd className="text-starlight">{preview.hit_dice_next}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Proficiency</dt>
                  <dd className="text-starlight">+{preview.proficiency_bonus.to}</dd>
                </div>
              </dl>
              {requiredChoices.map((spec) => {
                const val = choices[spec.id];
                let summary = "—";
                if (spec.type === "asi_or_feat" && val?.mode === "asi") {
                  summary = Object.entries(val.increases || {})
                    .map(([k, v]) => `${k.toUpperCase()} +${v}`)
                    .join(", ");
                } else if (spec.type === "asi_or_feat" && val?.mode === "feat") {
                  summary = val.feat;
                } else if (val?.feat) summary = val.feat;
                else if (val?.name) summary = val.name;
                else if (val?.skills) summary = val.skills.join(", ");
                else if (val?.order) summary = val.order;
                else if (val?.choice) summary = val.choice;
                else if (val?.weapons) summary = val.weapons.filter(Boolean).join(", ");
                return (
                  <div key={spec.id} className="border border-zinc-800 px-3 py-2">
                    <p className="text-[9px] font-black uppercase text-zinc-500">{spec.label}</p>
                    <p className="text-xs text-starlight">{summary}</p>
                  </div>
                );
              })}
              {preview.unlocks?.length > 0 && (
                <ul className="space-y-1.5 border border-zinc-800 p-3">
                  {preview.unlocks.map((u) => (
                    <li key={`rev-${u.kind}-${u.name}`} className="text-xs text-zinc-300">
                      <span className="font-semibold text-starlight">{u.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-zinc-500">
                Saving stores a snapshot. Use Undo last level-up on the sheet to revert.
              </p>
            </section>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        <button
          type="button"
          disabled={stepIndex === 0 || saving}
          onClick={goBack}
          className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan disabled:opacity-30"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        {step !== "review" ? (
          <button
            type="button"
            disabled={!canContinue()}
            onClick={goNext}
            className="inline-flex items-center gap-1 border border-neon-magenta bg-neon-magenta/15 px-4 py-2 text-[10px] font-black uppercase text-starlight hover:bg-neon-magenta/25 disabled:opacity-40"
          >
            Continue
            <ArrowRight className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || hpGain == null}
            onClick={handleSave}
            className="inline-flex items-center gap-1 border border-neon-magenta bg-neon-magenta/20 px-4 py-2 text-[10px] font-black uppercase text-starlight hover:bg-neon-magenta/30 disabled:opacity-40"
          >
            <Check className="h-3 w-3" />
            {saving ? "Saving…" : "Save level-up"}
          </button>
        )}
      </footer>
    </div>
  );
}
