export function PassCombatDialog({ open, targetName, onConfirm, onCancel, busy = false }) {
  if (!open || !targetName) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/80" aria-label="Cancel" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-md border border-neon-cyan/50 bg-void-panel p-4 shadow-xl">
        <p className="text-sm font-black uppercase text-starlight">Pass combat?</p>
        <p className="mt-2 text-xs font-mono text-ink-muted">
          Hand the party slice to <span className="text-neon-cyan">{targetName}</span>. They spend their
          5.5e action economy for their PC and any allies/summons assigned to them this phase.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[10px] font-black uppercase text-ink-faint hover:text-starlight"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="border border-neon-cyan bg-neon-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase text-neon-cyan disabled:opacity-40"
          >
            {busy ? "Passing…" : "Pass combat"}
          </button>
        </div>
      </div>
    </div>
  );
}
