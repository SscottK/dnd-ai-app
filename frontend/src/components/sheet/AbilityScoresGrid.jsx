import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  formatModifier,
  setAbilityScore,
} from "../../lib/characterSheet";
import { PANE_ORIENTATION_HORIZONTAL } from "../../lib/sheetLayout";

export function AbilityScoresGrid({
  sheet,
  onChange,
  readOnly = false,
  onShowDetail,
  compact = false,
  orientation,
}) {
  const editable = Boolean(onChange) && !readOnly;
  const isHorizontal = orientation === PANE_ORIENTATION_HORIZONTAL;

  const handleScoreChange = (key, rawValue) => {
    onChange?.(setAbilityScore(sheet, key, rawValue));
  };

  const gridClass = isHorizontal
    ? "grid grid-cols-6 gap-1"
    : compact
      ? "grid grid-cols-3 gap-2"
      : "grid grid-cols-6 gap-2 lg:gap-3";

  return (
    <div className={gridClass}>
      {ABILITIES.map((key) => {
        const score = sheet.abilities?.[key];
        const mod = abilityModifier(score);

        if (editable) {
          return (
            <label
              key={key}
              className={`flex flex-col items-center rounded-sm border border-zinc-800 bg-black/40 px-1 py-2 focus-within:border-neon-cyan/60 ${
                compact ? "p-2" : "lg:py-3"
              }`}
            >
              <span className="text-xs font-black uppercase text-zinc-600">
                {ABILITY_LABELS[key]}
              </span>
              <span className="text-lg font-black leading-none text-starlight lg:text-2xl">
                {formatModifier(mod)}
              </span>
              <input
                type="number"
                min={1}
                max={30}
                value={score ?? ""}
                onChange={(e) => handleScoreChange(key, e.target.value)}
                className="mt-1 w-12 border border-zinc-700 bg-black text-center text-sm tabular-nums text-zinc-300 focus:border-neon-cyan focus:outline-none"
                aria-label={`${ABILITY_LABELS[key]} score`}
              />
            </label>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={() =>
              onShowDetail?.({
                title: ABILITY_LABELS[key],
                subtitle: compact ? "Ability Score" : undefined,
                body: compact ? (
                  <div className="space-y-2">
                    <p>
                      Score: <span className="text-starlight">{score ?? "—"}</span>
                    </p>
                    <p>
                      Modifier: <span className="text-starlight">{formatModifier(mod)}</span>
                    </p>
                  </div>
                ) : (
                  `Score ${score ?? "—"} · Modifier ${formatModifier(mod)}`
                ),
              })
            }
            className={`flex flex-col items-center rounded-sm border border-zinc-800 bg-black/40 px-1 py-2 hover:border-neon-cyan/50 ${
              compact ? "p-2 text-center hover:border-neon-cyan hover:bg-neon-cyan/5" : "lg:py-3"
            }`}
          >
            <span className="text-xs font-black uppercase text-zinc-600">
              {ABILITY_LABELS[key]}
            </span>
            <span className="text-lg font-black leading-none text-starlight lg:text-2xl">
              {formatModifier(mod)}
            </span>
            <span className="text-sm tabular-nums text-zinc-600">{score ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
