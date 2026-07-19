import { useMemo, useState } from "react";

const ABILITIES = [
  { id: "str", label: "Strength" },
  { id: "dex", label: "Dexterity" },
  { id: "con", label: "Constitution" },
  { id: "int", label: "Intelligence" },
  { id: "wis", label: "Wisdom" },
  { id: "cha", label: "Charisma" },
];

function FeatPicker({ feats, value, onChange, placeholder = "Search feats…" }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return feats || [];
    return (feats || []).filter(
      (feat) =>
        feat.name.toLowerCase().includes(q) ||
        (feat.description || "").toLowerCase().includes(q)
    );
  }, [feats, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-starlight outline-none focus:border-neon-cyan"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto border border-zinc-800 p-2">
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-center text-[10px] text-zinc-600">No matching feats</p>
        )}
        {filtered.map((feat) => {
          const selected = value === feat.name;
          return (
            <button
              key={feat.name}
              type="button"
              onClick={() => onChange(feat.name)}
              className={`w-full border px-3 py-2 text-left transition ${
                selected
                  ? "border-neon-magenta bg-neon-magenta/10"
                  : "border-transparent hover:border-zinc-700 hover:bg-zinc-900/60"
              }`}
            >
              <p className="text-xs font-semibold text-starlight">{feat.name}</p>
              {feat.category && (
                <p className="text-[9px] uppercase text-zinc-600">{feat.category}</p>
              )}
              {feat.description && (
                <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-zinc-500">
                  {feat.description}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AsiOrFeatChoice({ spec, value, onChange }) {
  const mode = value?.mode || "asi";
  const increases = value?.increases || {};

  const setAsi = (nextIncreases) => onChange({ mode: "asi", increases: nextIncreases });

  const toggleAbility = (abilityId) => {
    const current = { ...increases };
    const keys = Object.keys(current).filter((k) => current[k] > 0);

    if (current[abilityId]) {
      delete current[abilityId];
      setAsi(current);
      return;
    }

    if (keys.length === 0) {
      setAsi({ [abilityId]: 2 });
      return;
    }
    if (keys.length === 1 && current[keys[0]] === 2) {
      setAsi({ [keys[0]]: 1, [abilityId]: 1 });
      return;
    }
    if (keys.length === 1 && current[keys[0]] === 1) {
      setAsi({ [keys[0]]: 1, [abilityId]: 1 });
      return;
    }
    if (keys.length >= 2) {
      const keep = keys[0];
      setAsi({ [keep]: 1, [abilityId]: 1 });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ mode: "asi", increases: value?.increases || {} })}
          className={`border px-3 py-2 text-[10px] font-black uppercase ${
            mode === "asi"
              ? "border-neon-magenta bg-neon-magenta/10 text-starlight"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          Ability scores
        </button>        <button
          type="button"
          onClick={() => onChange({ mode: "feat", feat: value?.feat || "" })}
          className={`border px-3 py-2 text-[10px] font-black uppercase ${
            mode === "feat"
              ? "border-neon-magenta bg-neon-magenta/10 text-starlight"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          Feat
        </button>
      </div>

      {mode === "asi" ? (
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500">
            Tap one score for +2, or two scores for +1 each (max 20).
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ABILITIES.map((ability) => {
              const amount = increases[ability.id] || 0;
              return (
                <button
                  key={ability.id}
                  type="button"
                  onClick={() => toggleAbility(ability.id)}
                  className={`border px-3 py-3 text-left ${
                    amount
                      ? "border-neon-cyan bg-neon-cyan/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <p className="text-[9px] font-black uppercase text-zinc-500">{ability.label}</p>
                  <p className="text-lg font-black text-starlight">
                    {amount ? `+${amount}` : "—"}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <FeatPicker
          feats={spec.options?.feats || []}
          value={value?.feat}
          onChange={(feat) => onChange({ mode: "feat", feat })}
        />
      )}
    </div>
  );
}

function SkillMultiPick({ skills, count, value, onChange }) {
  const selected = value?.skills || [];
  const toggle = (skill) => {
    if (selected.includes(skill)) {
      onChange({ skills: selected.filter((s) => s !== skill) });
      return;
    }
    if (selected.length >= count) {
      onChange({ skills: [...selected.slice(1), skill] });
      return;
    }
    onChange({ skills: [...selected, skill] });
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-zinc-500">
        Choose {count} skill{count === 1 ? "" : "s"}
        {selected.length ? ` (${selected.length}/${count})` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {(skills || []).map((skill) => {
          const on = selected.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              className={`border px-2.5 py-1.5 text-[10px] font-semibold ${
                on
                  ? "border-neon-magenta bg-neon-magenta/15 text-starlight"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {skill}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LevelUpChoiceStep({ spec, value, onChange }) {
  if (!spec) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-black uppercase text-starlight">{spec.label}</h2>
        {spec.detail && (
          <p className="mt-2 max-h-28 overflow-y-auto text-sm leading-relaxed text-zinc-400">
            {spec.detail}
          </p>
        )}
      </div>

      {spec.type === "asi_or_feat" && (
        <AsiOrFeatChoice spec={spec} value={value} onChange={onChange} />
      )}

      {(spec.type === "fighting_style" || spec.type === "epic_boon") && (
        <FeatPicker
          feats={spec.options?.feats || []}
          value={value?.feat}
          onChange={(feat) => onChange({ feat })}
          placeholder={
            spec.type === "fighting_style" ? "Search fighting styles…" : "Search epic boons…"
          }
        />
      )}

      {spec.type === "subclass" && (
        <div className="space-y-3">
          {(spec.options?.suggestions || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {spec.options.suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ name })}
                  className={`border px-2.5 py-1.5 text-[10px] font-semibold ${
                    value?.name === name
                      ? "border-neon-magenta bg-neon-magenta/15 text-starlight"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={value?.name || ""}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Subclass name"
            className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-starlight outline-none focus:border-neon-cyan"
          />
        </div>
      )}

      {spec.type === "subclass_feature" && (
        <div className="space-y-3">
          {spec.options?.subclass && (
            <p className="font-mono text-[10px] text-neon-cyan">
              Current subclass: {spec.options.subclass}
            </p>
          )}
          <input
            type="text"
            value={value?.name || ""}
            onChange={(e) => onChange({ name: e.target.value, note: value?.note || "" })}
            placeholder="Feature name (e.g. Improved Critical)"
            className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-starlight outline-none focus:border-neon-cyan"
          />
          <textarea
            value={value?.note || ""}
            onChange={(e) => onChange({ name: value?.name || "", note: e.target.value })}
            placeholder="Optional notes"
            rows={3}
            className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-starlight outline-none focus:border-neon-cyan"
          />
        </div>
      )}

      {(spec.type === "expertise" || spec.type === "scholar" || spec.type === "primal_knowledge") && (
        <SkillMultiPick
          skills={spec.options?.skills || []}
          count={Number(spec.count || (spec.type === "expertise" ? 2 : 1))}
          value={value}
          onChange={onChange}
        />
      )}

      {spec.type === "divine_order" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(spec.options?.orders || []).map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => onChange({ order: order.id })}
              className={`border p-3 text-left ${
                value?.order === order.id
                  ? "border-neon-magenta bg-neon-magenta/10"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <p className="text-xs font-black uppercase text-starlight">{order.label}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{order.detail}</p>
            </button>
          ))}
        </div>
      )}

      {spec.type === "blessed_strikes" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(spec.options?.choices || []).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange({ choice: opt.id })}
              className={`border p-3 text-left ${
                value?.choice === opt.id
                  ? "border-neon-magenta bg-neon-magenta/10"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <p className="text-xs font-black uppercase text-starlight">{opt.label}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{opt.detail}</p>
            </button>
          ))}
        </div>
      )}

      {spec.type === "weapon_mastery" && (
        <div className="space-y-2">
          <p className="text-[10px] text-zinc-500">
            {spec.options?.hint || `Enter ${spec.count} weapon kinds.`}
          </p>
          {Array.from({ length: Number(spec.count || 2) }).map((_, index) => (
            <input
              key={index}
              type="text"
              value={(value?.weapons || [])[index] || ""}
              onChange={(e) => {
                const next = [...(value?.weapons || [])];
                while (next.length < Number(spec.count || 2)) next.push("");
                next[index] = e.target.value;
                onChange({ weapons: next });
              }}
              placeholder={`Weapon ${index + 1}`}
              className="w-full border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-starlight outline-none focus:border-neon-cyan"
            />
          ))}
        </div>
      )}
    </section>
  );
}
