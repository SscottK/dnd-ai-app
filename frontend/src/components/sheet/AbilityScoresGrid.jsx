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
  dense = false,
  orientation,
}) {
  const editable = Boolean(onChange) && !readOnly;
  const isHorizontal = orientation === PANE_ORIENTATION_HORIZONTAL;
  const tight = dense || compact;

  const handleScoreChange = (key, rawValue) => {
    onChange?.(setAbilityScore(sheet, key, rawValue));
  };

  const gridClass = isHorizontal
    ? "grid grid-cols-6 gap-1"
    : compact
      ? "grid grid-cols-3 gap-1.5"
      : dense
        ? "grid grid-cols-6 gap-1.5"
        : "grid grid-cols-6 gap-2 lg:gap-3";

  const boxPad = tight ? "px-1 py-1.5" : "px-1 py-2 lg:py-3";
  const modSize = tight ? "text-base leading-none" : "text-lg leading-none lg:text-2xl";
  const labelSize = tight ? "text-[9px]" : "text-xs";
  const scoreSize = tight ? "text-xs" : "text-sm";

  return (
    <div className={gridClass}>
      {ABILITIES.map((key) => {
        const score = sheet.abilities?.[key];
        const mod = abilityModifier(score);

        if (editable) {
          return (
            <label
              key={key}
              className={`flex flex-col items-center rounded-sm border border-zinc-800 bg-black/40 focus-within:border-neon-cyan/60 ${boxPad}`}
            >
              <span className={`${labelSize} font-black uppercase text-zinc-600`}>
                {ABILITY_LABELS[key]}
              </span>
              <span className={`${modSize} font-black text-starlight`}>
                {formatModifier(mod)}
              </span>
              <input
                type="number"
                min={1}
                max={30}
                value={score ?? ""}
                onChange={(e) => handleScoreChange(key, e.target.value)}
                className={`mt-0.5 border border-zinc-700 bg-black text-center tabular-nums text-zinc-300 focus:border-neon-cyan focus:outline-none ${
                  tight ? "w-10 text-xs" : "mt-1 w-12 text-sm"
                }`}
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
                subtitle: tight ? "Ability Score" : undefined,
                body: tight ? (
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
            className={`flex flex-col items-center rounded-sm border border-zinc-800 bg-black/40 hover:border-neon-cyan/50 ${boxPad} ${
              tight ? "text-center hover:bg-neon-cyan/5" : ""
            }`}
          >
            <span className={`${labelSize} font-black uppercase text-zinc-600`}>
              {ABILITY_LABELS[key]}
            </span>
            <span className={`${modSize} font-black text-starlight`}>
              {formatModifier(mod)}
            </span>
            <span className={`${scoreSize} tabular-nums text-zinc-600`}>{score ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
