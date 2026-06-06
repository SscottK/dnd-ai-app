import { X } from "lucide-react";

export function DetailSlideOver({ open, title, subtitle, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close details"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-md h-full bg-zinc-950 border-l-4 border-neon-magenta flex flex-col shadow-2xl">
        <header className="flex items-start justify-between gap-3 p-4 border-b border-neon-magenta/40">
          <div className="min-w-0">
            <h2 className="font-black text-starlight uppercase text-sm truncate">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-zinc-500 font-mono mt-1 uppercase">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-danger p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 text-sm font-mono text-neon-cyan leading-relaxed">
          {children}
        </div>
      </aside>
    </div>
  );
}
