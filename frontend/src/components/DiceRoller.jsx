import { useMemo, useState } from "react";
import { Dices } from "lucide-react";
import {
  ABILITY_LABELS,
  DEFAULT_SKILLS,
  formatModifier,
  resolveSaveBonus,
  resolveSkillBonus,
} from "../lib/characterSheet";
import { formatRollEntry, postActionRoll, postCombatRoll } from "../lib/actionRoll";
import { appendModifier, formatRollMessage, rollExpression } from "../lib/diceRoll";

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"];
const COMMON_FORMULAS = ["d20", "2d6", "3d6", "4d6", "2d20kh1", "4d6dl1"];

const SAVE_ROWS = ["str", "dex", "con", "int", "wis", "cha"];

function AdvantageToggles({ advantage, disadvantage, disabled, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono text-ink-faint">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={advantage}
          disabled={disabled}
          onChange={(event) =>
            onChange({ advantage: event.target.checked, disadvantage: event.target.checked ? false : disadvantage })
          }
        />
        Adv
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={disadvantage}
          disabled={disabled}
          onChange={(event) =>
            onChange({ disadvantage: event.target.checked, advantage: event.target.checked ? false : advantage })
          }
        />
        Dis
      </label>
    </div>
  );
}

export function DiceRoller({
  campaignId,
  token,
  rollerLabel,
  combatActive = false,
  sheet = null,
  characterId = null,
}) {
  const [mode, setMode] = useState("quick");
  const [expression, setExpression] = useState("1d20");
  const [modifier, setModifier] = useState("");
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [saveAbility, setSaveAbility] = useState("dex");
  const [lastRoll, setLastRoll] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const skills = useMemo(() => {
    if (sheet?.skills?.length) return sheet.skills;
    return DEFAULT_SKILLS.map(([name, ability]) => ({
      name,
      ability,
      proficient: false,
      expertise: false,
    }));
  }, [sheet]);

  const parsedModifier = Number(modifier);
  const hasModifier = modifier !== "" && !Number.isNaN(parsedModifier) && parsedModifier !== 0;

  const setRollOptions = ({ advantage: nextAdv, disadvantage: nextDis }) => {
    setAdvantage(nextAdv);
    setDisadvantage(nextDis);
  };

  const recordRoll = (message) => {
    setLastRoll({ message, at: new Date().toLocaleTimeString() });
  };

  const rollToCombatLog = async (label, rollResult) => {
    const message = formatRollMessage({
      label,
      kept: rollResult.kept,
      dropped: rollResult.dropped,
      modifier: rollResult.modifier,
      total: rollResult.total,
    });
    recordRoll(message);
    await postCombatRoll(campaignId, token, {
      dice: rollResult.expression,
      result: rollResult.total,
      message,
    });
  };

  const runActionRoll = async (body) => {
    if (!campaignId || !token) return;
    setBusy(true);
    setError("");
    try {
      const data = await postActionRoll(campaignId, token, {
        character_id: characterId ?? undefined,
        advantage,
        disadvantage,
        ...body,
      });
      recordRoll(formatRollEntry(data.entry));
    } catch (err) {
      setError(err.message || "Roll failed.");
    } finally {
      setBusy(false);
    }
  };

  const rollFormula = async (rawExpression) => {
    const expr = appendModifier(rawExpression, hasModifier ? parsedModifier : 0);
    if (combatActive && campaignId && token) {
      setBusy(true);
      setError("");
      try {
        const rollResult = rollExpression(expr, { advantage, disadvantage });
        await rollToCombatLog(expr, rollResult);
      } catch (err) {
        setError(err.message || "Roll failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    await runActionRoll({ roll_kind: "dice", expression: expr });
  };

  const handleQuickRoll = async (label) => {
    await rollFormula(label);
  };

  const handleExpressionRoll = async (event) => {
    event.preventDefault();
    if (!expression.trim()) return;
    await rollFormula(expression.trim());
  };

  const rollCheckToCombatLog = async ({ label, bonus }) => {
    if (!campaignId || !token) return;
    setBusy(true);
    setError("");
    try {
      const rollResult = rollExpression("d20", { advantage, disadvantage });
      const total = rollResult.total + bonus;
      const message = formatRollMessage({
        label,
        kept: rollResult.kept,
        dropped: rollResult.dropped,
        bonus,
        total,
      });
      recordRoll(message);
      await postCombatRoll(campaignId, token, {
        dice: "d20",
        result: total,
        message,
      });
    } catch (err) {
      setError(err.message || "Roll failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSkillRoll = async () => {
    if (!skillName) {
      setError("Choose a skill.");
      return;
    }
    if (combatActive) {
      if (!sheet) {
        setError("Open your character sheet to roll skill checks in combat.");
        return;
      }
      const bonus = resolveSkillBonus(sheet, skillName);
      await rollCheckToCombatLog({
        label: `${skillName} check`,
        bonus,
      });
      return;
    }
    await runActionRoll({ roll_kind: "skill", label: skillName });
  };

  const handleSaveRoll = async () => {
    if (combatActive) {
      if (!sheet) {
        setError("Open your character sheet to roll saving throws in combat.");
        return;
      }
      const bonus = resolveSaveBonus(sheet, saveAbility);
      const abilityLabel = ABILITY_LABELS[saveAbility] || saveAbility.toUpperCase();
      await rollCheckToCombatLog({
        label: `${abilityLabel} save`,
        bonus,
      });
      return;
    }
    await runActionRoll({ roll_kind: "save", label: saveAbility });
  };

  const selectedSkill = skills.find((skill) => skill.name === skillName) || skills[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Dices className="h-4 w-4 shrink-0 text-neon-magenta" />
        <span className="text-[10px] font-black uppercase tracking-widest text-starlight">Dice</span>
        {rollerLabel && (
          <span className="truncate text-[8px] font-mono text-ink-faint">as {rollerLabel}</span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        {["quick", "expr", "check"].map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={busy}
            onClick={() => setMode(tab)}
            className={`px-2 py-0.5 text-[9px] font-black uppercase border ${
              mode === tab
                ? "border-neon-cyan text-neon-cyan"
                : "border-zinc-700 text-ink-faint hover:border-neon-cyan/50"
            } disabled:opacity-40`}
          >
            {tab === "quick" ? "Quick" : tab === "expr" ? "Formula" : "Checks"}
          </button>
        ))}
      </div>

      {(mode === "quick" || mode === "expr") && (
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black uppercase text-ink-faint">Mod</label>
          <input
            type="number"
            value={modifier}
            onChange={(event) => setModifier(event.target.value)}
            placeholder="0"
            className="w-14 border border-border bg-void-deep px-2 py-0.5 text-xs font-mono text-starlight"
          />
          <AdvantageToggles
            advantage={advantage}
            disadvantage={disadvantage}
            disabled={busy}
            onChange={setRollOptions}
          />
        </div>
      )}

      {mode === "quick" && (
        <>
          <div className="flex flex-wrap gap-1">
            {QUICK_DICE.map((die) => (
              <button
                key={die}
                type="button"
                disabled={busy}
                onClick={() => handleQuickRoll(die)}
                className="border border-zinc-700 px-2 py-1 text-[10px] font-black uppercase hover:border-neon-cyan hover:text-starlight disabled:opacity-40"
              >
                {hasModifier ? appendModifier(die, parsedModifier) : die}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {COMMON_FORMULAS.filter((item) => !QUICK_DICE.includes(item)).map((formula) => (
              <button
                key={formula}
                type="button"
                disabled={busy}
                onClick={() => handleQuickRoll(formula)}
                className="border border-zinc-800 px-2 py-0.5 text-[9px] font-mono uppercase text-ink-faint hover:border-neon-cyan hover:text-starlight disabled:opacity-40"
              >
                {hasModifier ? appendModifier(formula, parsedModifier) : formula}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === "expr" && (
        <form onSubmit={handleExpressionRoll} className="space-y-2">
          <input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="2d6+3, 4d6dl1, 2d20kh1"
            className="w-full border border-border bg-void-deep px-2 py-1 text-xs font-mono text-starlight"
          />
          <p className="text-[8px] font-mono text-ink-faint">
            Mod field adds to the formula. Use dl/kh/kl for drop/keep.
          </p>
          <button
            type="submit"
            disabled={busy || !expression.trim()}
            className="w-full border border-neon-cyan py-1 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
          >
            Roll formula
          </button>
        </form>
      )}

      {mode === "check" && (
        <div className="space-y-2">
          {!sheet ? (
            <p className="text-[9px] font-mono text-ink-faint">Join with a character to roll checks.</p>
          ) : (
            <>
              <AdvantageToggles
                advantage={advantage}
                disadvantage={disadvantage}
                disabled={busy}
                onChange={setRollOptions}
              />
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-neon-cyan">Skill</label>
                <select
                  value={skillName || skills[0]?.name || ""}
                  onChange={(event) => setSkillName(event.target.value)}
                  className="w-full border border-border bg-void-deep px-2 py-1 text-xs font-mono text-starlight"
                >
                  {skills.map((skill) => (
                    <option key={skill.name} value={skill.name}>
                      {skill.name} ({formatModifier(resolveSkillBonus(skill, sheet))})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSkillRoll}
                  className="w-full border border-neon-cyan py-1 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
                >
                  Roll {selectedSkill?.name || "skill"}
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-neon-magenta">Save</label>
                <select
                  value={saveAbility}
                  onChange={(event) => setSaveAbility(event.target.value)}
                  className="w-full border border-border bg-void-deep px-2 py-1 text-xs font-mono text-starlight"
                >
                  {SAVE_ROWS.map((ability) => {
                    const save = sheet.saving_throws?.find((row) => row.ability === ability) || {
                      ability,
                      proficient: false,
                    };
                    return (
                      <option key={ability} value={ability}>
                        {ABILITY_LABELS[ability]} ({formatModifier(resolveSaveBonus(save, sheet))})
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveRoll}
                  className="w-full border border-neon-magenta py-1 text-[10px] font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
                >
                  Roll save
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {lastRoll && (
          <p className="text-xs font-mono text-neon-cyan">
            <span className="text-starlight">{lastRoll.message}</span>
            <span className="ml-2 text-zinc-600">{lastRoll.at}</span>
          </p>
        )}
      </div>

      <div className="shrink-0 space-y-1 border-t border-border/60 pt-2">
        <p className="text-[8px] font-mono text-ink-faint">
          {combatActive
            ? "Combat active — dice rolls go to the combat log."
            : "Rolls are logged to the session action log."}
        </p>
        {error && <p className="text-[9px] font-mono text-danger">{error}</p>}
      </div>
    </div>
  );
}
