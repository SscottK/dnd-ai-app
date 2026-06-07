import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { abilityModifier } from "../lib/characterSheet";

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const HIT_DICE = {
  Barbarian: 12,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Sorcerer: 6,
  Wizard: 6,
};

const SKILL_NAMES = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
];

const SKILL_ABILITY = {
  Acrobatics: "dex",
  "Animal Handling": "wis",
  Arcana: "int",
  Athletics: "str",
  Deception: "cha",
  History: "int",
  Insight: "wis",
  Intimidation: "cha",
  Investigation: "int",
  Medicine: "wis",
  Nature: "int",
  Perception: "wis",
  Performance: "cha",
  Persuasion: "cha",
  Religion: "int",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Survival: "wis",
};

function proficiencyBonus(level) {
  return Math.floor((Math.max(1, level) - 1) / 4) + 2;
}

function buildSheet({ name, className, level, race, abilities, proficientSkills }) {
  const prof = proficiencyBonus(level);
  const conMod = abilityModifier(abilities.con);
  const hitDie = HIT_DICE[className] || 8;
  const maxHp = hitDie + conMod;

  const skills = SKILL_NAMES.map((skillName) => {
    const ability = SKILL_ABILITY[skillName];
    const proficient = proficientSkills.includes(skillName);
    const mod = abilityModifier(abilities[ability]);
    const bonus = mod + (proficient ? prof : 0);
    return {
      name: skillName,
      ability,
      proficient,
      expertise: false,
      bonus,
    };
  });

  const savingThrows = ABILITIES.map((ability) => ({
    ability,
    proficient: false,
    bonus: abilityModifier(abilities[ability]),
  }));

  return {
    abilities,
    proficiency_bonus: prof,
    speed: 30,
    initiative_bonus: abilityModifier(abilities.dex),
    passive_perception: 10 + (skills.find((s) => s.name === "Perception")?.bonus ?? 0),
    hit_dice: `${level}d${hitDie}`,
    saving_throws: savingThrows,
    skills,
    proficiencies: { armor: [], weapons: [], tools: [], languages: ["Common"] },
    inventory: [],
    features: [{ name: race || "Adventurer", description: "Built in-app", source: "Background" }],
    attacks: [],
    spells: [],
    classes: [{ name: className, level, subclass: null }],
    resources: [],
    wild_shapes: [],
    combat_actions: [],
    ac_breakdown: [{ label: "Base", value: 10, kind: "base" }],
    ac_bonuses: [],
    conditions: [],
    notes: `Created with the in-app builder for ${name}.`,
  };
}

export function CharacterBuilderPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    class_name: "Fighter",
    level: 1,
    race: "",
    abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 },
    proficientSkills: ["Athletics", "Perception"],
  });

  useEffect(() => {
    if (!token) return;
    void apiFetch("/rules/classes", { token })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setClasses(data.classes || []);
      })
      .catch(() => setClasses(Object.keys(HIT_DICE)));
  }, [token]);

  const classOptions = classes.length ? classes : Object.keys(HIT_DICE);
  const previewHp = (HIT_DICE[form.class_name] || 8) + abilityModifier(form.abilities.con);

  const toggleSkill = (skillName) => {
    setForm((prev) => {
      const set = new Set(prev.proficientSkills);
      if (set.has(skillName)) set.delete(skillName);
      else if (set.size < 2) set.add(skillName);
      return { ...prev, proficientSkills: [...set] };
    });
  };

  const applyStandardArray = () => {
    const [str, dex, con, int, wis, cha] = STANDARD_ARRAY;
    setForm((prev) => ({
      ...prev,
      abilities: { str, dex, con, int, wis, cha },
    }));
  };

  const handleCreate = async () => {
    if (!token || !form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const sheet = buildSheet(form);
      const res = await apiFetch("/characters", {
        token,
        method: "POST",
        body: {
          name: form.name.trim(),
          class_name: form.class_name,
          level: form.level,
          hp: previewHp,
          max_hp: previewHp,
          ac: 10 + abilityModifier(form.abilities.dex),
          sheet_json: JSON.stringify(sheet),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not create character");
      }
      const data = await res.json();
      navigate(`/character/${data.id}`);
    } catch (err) {
      setError(err.message || "Could not create character.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan"
        >
          <ArrowLeft className="h-3 w-3" />
          Dashboard
        </Link>

        <h1 className="mb-1 flex items-center gap-2 text-lg font-black uppercase tracking-widest text-starlight">
          <Sparkles className="h-5 w-5 text-neon-cyan" />
          Character Builder
        </h1>
        <p className="mb-6 text-xs font-mono text-zinc-500">
          Quick level-1 sheet on the canonical schema — enrichment adds class resources and combat actions.
        </p>

        {error && (
          <p className="mb-4 border-l-2 border-danger pl-2 text-xs font-mono text-danger">{error}</p>
        )}

        {step === 0 && (
          <div className="space-y-4 border border-zinc-800 p-4">
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 font-mono text-starlight"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-black uppercase text-zinc-500">
                Class
                <select
                  value={form.class_name}
                  onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                  className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 font-mono text-starlight"
                >
                  {classOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[10px] font-black uppercase text-zinc-500">
                Level
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.level}
                  onChange={(e) =>
                    setForm({ ...form, level: Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)) })
                  }
                  className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 font-mono text-starlight"
                />
              </label>
            </div>
            <label className="block text-[10px] font-black uppercase text-zinc-500">
              Species / background label
              <input
                value={form.race}
                onChange={(e) => setForm({ ...form, race: e.target.value })}
                placeholder="e.g. Human, Elf"
                className="mt-1 w-full border border-zinc-700 bg-black px-3 py-2 font-mono text-starlight"
              />
            </label>
            <button
              type="button"
              disabled={!form.name.trim()}
              onClick={() => setStep(1)}
              className="w-full border-2 border-neon-cyan px-4 py-2 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              Next — Abilities
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 border border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase text-zinc-500">Ability scores</p>
              <button
                type="button"
                onClick={applyStandardArray}
                className="text-[9px] font-black uppercase text-neon-cyan hover:underline"
              >
                Standard array
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ABILITIES.map((ability) => (
                <label key={ability} className="text-center text-[9px] font-black uppercase text-zinc-500">
                  {ability}
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={form.abilities[ability]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        abilities: {
                          ...form.abilities,
                          [ability]: parseInt(e.target.value, 10) || 10,
                        },
                      })
                    }
                    className="mt-1 w-full border border-zinc-700 bg-black px-2 py-1 text-center font-mono text-starlight"
                  />
                  <span className="text-[8px] text-zinc-600">
                    {abilityModifier(form.abilities[ability]) >= 0 ? "+" : ""}
                    {abilityModifier(form.abilities[ability])}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[10px] font-black uppercase text-zinc-500">
              Proficient skills (pick 2)
            </p>
            <div className="flex flex-wrap gap-1">
              {SKILL_NAMES.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`rounded-sm border px-2 py-0.5 text-[8px] font-black uppercase ${
                    form.proficientSkills.includes(skill)
                      ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
                      : "border-zinc-700 text-zinc-500"
                  }`}
                >
                  {skill}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="flex-1 border border-zinc-700 px-4 py-2 text-[10px] font-black uppercase text-zinc-500"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 border-2 border-neon-cyan px-4 py-2 text-[10px] font-black uppercase text-neon-cyan"
              >
                Review
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 border border-zinc-800 p-4">
            <p className="text-sm font-black uppercase text-starlight">{form.name}</p>
            <p className="text-[10px] font-mono text-zinc-500">
              Level {form.level} {form.class_name}
              {form.race ? ` · ${form.race}` : ""} · HP {previewHp} · AC{" "}
              {10 + abilityModifier(form.abilities.dex)} · Init{" "}
              {abilityModifier(form.abilities.dex) >= 0 ? "+" : ""}
              {abilityModifier(form.abilities.dex)}
            </p>
            <p className="text-[9px] font-mono text-zinc-600">
              Enrichment will add {form.class_name} resources, combat actions, and catalog merges on save.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 border border-zinc-700 px-4 py-2 text-[10px] font-black uppercase text-zinc-500"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className="flex-1 border-2 border-neon-magenta bg-neon-magenta px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-40"
              >
                {saving ? "Creating…" : "Create character"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
