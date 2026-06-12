import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export function MonsterSrdSearch({
  token,
  value,
  onChange,
  onSelect,
  placeholder = "SRD monster (e.g. Goblin)",
  className = "",
  inputClassName = "w-full rounded-sm border border-border bg-black px-2 py-1.5 text-xs font-mono text-starlight",
}) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!token || value.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void apiFetch(`/campaigns/srd-monsters/search?q=${encodeURIComponent(value.trim())}`, {
        token,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("search failed");
          const data = await res.json();
          if (!cancelled) setSuggestions(data.monsters || []);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, value]);

  const pick = (monster) => {
    onChange(monster.name);
    onSelect?.(monster);
    setSuggestions([]);
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-sm border border-border bg-void-panel shadow-lg">
          {suggestions.map((monster) => (
            <li key={monster.name}>
              <button
                type="button"
                onClick={() => pick(monster)}
                className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] font-mono hover:bg-border/40"
              >
                <span className="font-black text-starlight">{monster.name}</span>
                <span className="shrink-0 text-ink-faint">
                  CR {monster.cr}
                  {monster.action_count ? ` · ${monster.action_count} atk` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
