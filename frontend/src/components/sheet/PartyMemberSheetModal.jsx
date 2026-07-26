import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { parseSheetJson } from "../../lib/characterSheet";
import { DigitalCharacterSheet } from "./DigitalCharacterSheet";

export function PartyMemberSheetModal({ open, characterId, token, onClose }) {
  const [character, setCharacter] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadCharacter = useCallback(async () => {
    if (!token || !characterId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}`, { token });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load character sheet");
      }
      const data = await res.json();
      setCharacter(data);
      setSheet(parseSheetJson(data.sheet_json));
    } catch (err) {
      setCharacter(null);
      setSheet(null);
      setError(err.message || "Could not load character sheet.");
    } finally {
      setLoading(false);
    }
  }, [token, characterId]);

  useEffect(() => {
    if (!open || !characterId) {
      setCharacter(null);
      setSheet(null);
      setError("");
      return;
    }
    void loadCharacter();
  }, [open, characterId, loadCharacter]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-3 lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="party-sheet-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/85"
        aria-hidden="true"
        onClick={onClose}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div
        className="relative z-[1] flex h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-sm border-2 border-neon-cyan bg-void shadow-2xl xl:max-w-[1400px]"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="party-sheet-modal-title"
              className="truncate text-sm font-black uppercase text-starlight lg:text-base"
            >
              {character?.name || "Character sheet"}
            </h2>
            <p className="text-xs font-mono text-zinc-500">
              DM view — read-only party member sheet
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={loading || !characterId}
              onClick={() => void loadCharacter()}
              className="inline-flex items-center gap-1 rounded-sm border border-zinc-700 px-2 py-1 text-xs font-black uppercase text-zinc-400 hover:border-neon-cyan hover:text-neon-cyan disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-neon-magenta px-3 py-1.5 text-xs font-black uppercase text-neon-magenta hover:bg-neon-magenta/10"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-starlight"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-void px-4 py-4 lg:px-8">
          {loading && !character && (
            <p className="text-sm font-mono text-zinc-500">Loading character sheet…</p>
          )}
          {error && (
            <div className="space-y-2">
              <p className="text-sm font-mono text-danger">{error}</p>
              <button
                type="button"
                onClick={() => void loadCharacter()}
                className="text-xs font-black uppercase text-neon-cyan hover:text-starlight"
              >
                Retry
              </button>
            </div>
          )}
          {character && sheet && (
            <DigitalCharacterSheet character={character} sheet={sheet} readOnly />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
