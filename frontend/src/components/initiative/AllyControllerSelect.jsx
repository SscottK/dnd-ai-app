/** DM assigns which PC controls an ally/summon during team initiative slices. */
export function AllyControllerSelect({
  value,
  options = [],
  disabled = false,
  onChange,
  compact = false,
}) {
  if (!options.length) return null;

  return (
    <label
      className={`flex items-center gap-1.5 font-mono uppercase text-ink-faint ${
        compact ? "text-[9px]" : "text-[10px] sm:text-xs"
      }`}
    >
      <span className="shrink-0">Controller</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value ? parseInt(e.target.value, 10) : null;
          onChange(next);
        }}
        className={`max-w-[8rem] rounded-sm border border-border bg-black px-1 py-0.5 text-starlight ${
          compact ? "text-[9px]" : "text-[10px] sm:text-xs"
        }`}
      >
        <option value="">DM</option>
        {options.map((pc) => (
          <option key={pc.character_id} value={pc.character_id}>
            {pc.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function partyControllerOptions(encounter) {
  return (encounter?.combatants || [])
    .filter((c) => c.is_pc && c.character_id)
    .map((c) => ({ character_id: c.character_id, name: c.name }));
}
