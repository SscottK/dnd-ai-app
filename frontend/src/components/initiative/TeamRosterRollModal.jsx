import { useEffect, useState } from "react";

export function TeamRosterRollModal({ open, roster, onClose, onConfirm, busy = false }) {
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set((roster || []).map((member) => member.character_id)));
    }
  }, [open, roster]);

  if (!open) return null;

  const toggle = (characterId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-md border border-border-bright bg-void-panel p-4 shadow-xl">
        <h2 className="text-sm font-black uppercase text-starlight">Who can roll initiative?</h2>
        <p className="mt-2 text-xs font-mono text-ink-muted">
          Select awake PCs who can roll. Everyone else is still added to the party group and joins
          combat when they wake up — no roll needed.
        </p>
        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
          {(roster || []).map((member) => (
            <li key={member.character_id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-border px-3 py-2 hover:border-neon-cyan/50">
                <input
                  type="checkbox"
                  checked={selected.has(member.character_id)}
                  onChange={() => toggle(member.character_id)}
                />
                <span className="text-xs font-black text-starlight">{member.character_name}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[10px] font-black uppercase text-ink-faint hover:text-starlight"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => onConfirm([...selected])}
            className="border border-neon-cyan px-3 py-1.5 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
          >
            {busy ? "Rolling…" : "Roll & add party"}
          </button>
        </div>
      </div>
    </div>
  );
}
