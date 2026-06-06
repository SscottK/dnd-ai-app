import { ExternalLink, FileText, RefreshCw, X } from "lucide-react";
import { AuthenticatedPdfFrame } from "./AuthenticatedPdfFrame";

export function FullSheetModal({
  open,
  character,
  token,
  syncing,
  onClose,
  onResync,
}) {
  if (!open || !character) return null;

  const hasPdf = !!character.pdf_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close full sheet"
        onClick={onClose}
      />
      <div className="relative w-full max-w-5xl h-[90vh] bg-black border-4 border-neon-cyan flex flex-col">
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b-2 border-neon-magenta bg-zinc-950 shrink-0">
          <div>
            <h2 className="font-black text-starlight uppercase text-sm">{character.name}</h2>
            <p className="text-[10px] text-zinc-500 font-mono">
              PDF is read-only and cannot be edited here. Equip gear in Inventory panes — changes
              save to your digital sheet, not the PDF.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasPdf && (
              <button
                type="button"
                disabled={syncing}
                onClick={onResync}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase border border-starlight text-starlight disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Re-syncing…" : "Re-sync from PDF"}
              </button>
            )}
            {character.dnd_beyond_url && (
              <a
                href={character.dnd_beyond_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-black uppercase border border-neon-cyan text-neon-cyan"
              >
                <ExternalLink className="w-3 h-3" />
                D&amp;D Beyond
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[10px] font-black uppercase bg-neon-magenta text-black"
            >
              Save session &amp; close
            </button>
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>
        <div className="relative flex-1 overflow-hidden bg-white">
          {syncing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6">
              <div className="max-w-sm rounded-sm border-2 border-neon-cyan bg-zinc-950 px-6 py-5 text-center shadow-lg">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-neon-cyan" />
                <p className="text-sm font-black uppercase text-starlight">Re-syncing from PDF</p>
                <p className="mt-2 text-[11px] font-mono leading-relaxed text-zinc-400">
                  This may take a couple of minutes while we read your sheet. Please wait — your
                  panes will update when it finishes.
                </p>
              </div>
            </div>
          )}
          {hasPdf ? (
            <AuthenticatedPdfFrame
              pdfUrl={character.pdf_url}
              token={token}
              title={`${character.name} character sheet`}
              className="w-full h-full border-0"
            />
          ) : character.dnd_beyond_url ? (
            <div className="h-full flex flex-col items-center justify-center bg-void p-8 text-center">
              <FileText className="w-12 h-12 text-neon-magenta mb-4" />
              <p className="text-xs font-mono text-zinc-400 max-w-md mb-4">
                Open your character on D&amp;D Beyond, make changes, then export a new PDF and
                re-upload from Campaigns — or use Re-sync if you replaced the stored PDF.
              </p>
              <a
                href={character.dnd_beyond_url}
                target="_blank"
                rel="noreferrer"
                className="px-6 py-3 bg-neon-cyan text-black font-black text-xs uppercase"
              >
                Open D&amp;D Beyond
              </a>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-void text-xs font-mono text-zinc-500">
              No PDF or D&amp;D Beyond link on file.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
