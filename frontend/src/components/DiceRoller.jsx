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

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"];

const SAVE_ROWS = ["str", "dex", "con", "int", "wis", "cha"];

function rollDieLocal(sides) {
  return Math.floor(Math.random() * sides) + 1;
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
      setLastRoll({
        message: formatRollEntry(data.entry),
        at: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setError(err.message || "Roll failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRoll = async (label) => {
    if (combatActive && campaignId && token) {
      const sides = parseInt(label.slice(1), 10);
      const result = rollDieLocal(sides);
      setLastRoll({ message: `${label}: ${result}`, at: new Date().toLocaleTimeString() });
      setError("");
      setBusy(true);
      try {
        await postCombatRoll(campaignId, token, { dice: label, result });
      } catch (err) {
        setError(err.message || "Roll not logged to combat.");
      } finally {
        setBusy(false);
      }
      return;
    }
    await runActionRoll({ roll_kind: "dice", quick_die: label });
  };

  const handleExpressionRoll = async (event) => {
    event.preventDefault();
    await runActionRoll({ roll_kind: "dice", expression: expression.trim() });
  };

  const handleSkillRoll = async () => {
    if (!skillName) {
      setError("Choose a skill.");
      return;
    }
    await runActionRoll({ roll_kind: "skill", label: skillName });
  };

  const handleSaveRoll = async () => {
    await runActionRoll({ roll_kind: "save", label: saveAbility });
  };

  const selectedSkill = skills.find((skill) => skill.name === skillName) || skills[0];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 border-2 border-neon-magenta bg-black p-3">
      <div className="flex items-center gap-2">
        <Dices className="h-4 w-4 shrink-0 text-neon-magenta" />
        <span className="text-[10px] font-black uppercase tracking-widest text-starlight">
          Dice
        </span>
        {rollerLabel && (
          <span className="truncate text-[8px] font-mono text-ink-faint">as {rollerLabel}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {["quick", "expr", "check"].map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={busy || (combatActive && tab === "check")}
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

      {mode === "quick" && (
        <div className="flex flex-wrap gap-1">
          {QUICK_DICE.map((die) => (
            <button
              key={die}
              type="button"
              disabled={busy}
              onClick={() => handleQuickRoll(die)}
              className="border border-zinc-700 px-2 py-1 text-[10px] font-black uppercase hover:border-neon-cyan hover:text-starlight disabled:opacity-40"
            >
              {die}
            </button>
          ))}
        </div>
      )}

      {mode === "expr" && (
        <form onSubmit={handleExpressionRoll} className="space-y-2">
          <input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="2d6+3, 4d6dl1, 2d20kh1"
            className="w-full border border-border bg-void-deep px-2 py-1 text-xs font-mono text-starlight"
          />
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono text-ink-faint">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={advantage}
                onChange={(event) => setAdvantage(event.target.checked)}
              />
              Adv
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={disadvantage}
                onChange={(event) => setDisadvantage(event.target.checked)}
              />
              Dis
            </label>
          </div>
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
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono text-ink-faint">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={advantage}
                    onChange={(event) => setAdvantage(event.target.checked)}
                  />
                  Adv
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={disadvantage}
                    onChange={(event) => setDisadvantage(event.target.checked)}
                  />
                  Dis
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {lastRoll && (
        <p className="text-xs font-mono text-neon-cyan">
          <span className="text-starlight">{lastRoll.message}</span>
          <span className="ml-2 text-zinc-600">{lastRoll.at}</span>
        </p>
      )}

      <p className="text-[8px] font-mono text-ink-faint">
        {combatActive
          ? "Combat active — quick rolls go to the combat log."
          : "Rolls are logged to the session action log."}
      </p>
      {error && <p className="text-[9px] font-mono text-danger">{error}</p>}
    </div>
  );
}
