export function CombatResolutionBanner({ resolution, onDismiss }) {
  if (!resolution) return null;

  const isDefeat = resolution.reason === "defeat";
  const title = isDefeat ? "Party defeated" : "Victory";
  const subtitle = isDefeat
    ? "All player characters are down. Combat log was added to everyone’s Log tab."
    : "All enemies defeated. Combat log was added to everyone’s Log tab.";

  return (
    <div className="mb-4 rounded-md border-2 border-starlight/60 bg-void-panel p-4 shadow-lg">
      <p
        className={`text-sm font-black uppercase tracking-widest ${
          isDefeat ? "text-danger" : "text-agency-orange"
        }`}
      >
        {title}
      </p>
      <p className="mt-2 text-xs font-mono text-ink-muted">{subtitle}</p>
      {resolution.logText && (
        <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-sm border border-border/60 bg-black/60 p-2 text-[10px] font-mono text-ink-faint">
          {resolution.logText}
        </pre>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 rounded-sm border border-starlight bg-starlight/10 px-4 py-2 text-xs font-black uppercase text-starlight hover:bg-starlight/20"
      >
        Close combat view
      </button>
    </div>
  );
}
