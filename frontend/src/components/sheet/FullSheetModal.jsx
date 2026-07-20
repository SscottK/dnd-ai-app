import { useRef } from "react";
import { ExternalLink, FileText, RefreshCw, Upload, X } from "lucide-react";
import { openAuthenticatedPdfInTab } from "./AuthenticatedPdfFrame";
import { DigitalCharacterSheet } from "./DigitalCharacterSheet";
import { resolveCombatStats } from "../../lib/characterSheet";
import { applyLongRest } from "../../lib/longRest";
import { confirmPdfReplace } from "../../lib/pdfReplace";

export function FullSheetModal({
  open,
  character,
  sheet,
  token,
  syncing,
  uploading = false,
  onClose,
  onResync,
  onUploadPdf,
  onSheetChange,
  onCombatChange,
}) {
  const uploadInputRef = useRef(null);
  if (!open || !character) return null;

  const hasPdf = !!character.pdf_url;
  const combat = resolveCombatStats(character, sheet);

  const handleLongRest = () => {
    if (!onSheetChange && !onCombatChange) return;
    if (
      !window.confirm(
        "Take a Long Rest? This restores HP, refreshes short/long-rest resources, and reduces Exhaustion by 1 (5.5e)."
      )
    ) {
      return;
    }
    const { character: nextCharacter, sheet: nextSheet } = applyLongRest({ character, sheet });
    // Update HP on the character first so immediate sheet save picks it up from refs.
    if (onCombatChange) onCombatChange({ hp: nextCharacter.hp });
    if (onSheetChange) onSheetChange(nextSheet, { immediate: true });
  };

  const handleOpenPdfTab = async () => {
    if (!hasPdf || !token) return;
    try {
      await openAuthenticatedPdfInTab(character.pdf_url, token);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close digital sheet"
        onClick={onClose}
      />
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col border-4 border-neon-cyan bg-black">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-neon-magenta bg-zinc-950 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase text-starlight">{character.name}</h2>
            <p className="text-[10px] font-mono text-zinc-500">
              Digital sheet — equip gear and edit stats here. PDF stays read-only
              {combat.ac != null ? (
                <>
                  {" "}
                  · AC <span className="font-black text-starlight">{combat.ac}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onUploadPdf && (
              <>
                <button
                  type="button"
                  disabled={syncing || uploading}
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center gap-1 border border-neon-cyan px-3 py-1.5 text-[10px] font-black uppercase text-neon-cyan disabled:opacity-40"
                >
                  <Upload className={`h-3 w-3 ${uploading ? "animate-pulse" : ""}`} />
                  {uploading ? "Uploading…" : hasPdf ? "Replace PDF" : "Upload PDF"}
                </button>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (
                      file &&
                      confirmPdfReplace({
                        characterName: character.name,
                        hasExistingPdf: hasPdf,
                      })
                    ) {
                      void onUploadPdf(file);
                    }
                    event.target.value = "";
                  }}
                />
              </>
            )}
            {hasPdf && (
              <>
                <button
                  type="button"
                  disabled={syncing || uploading}
                  onClick={onResync}
                  className="flex items-center gap-1 border border-starlight px-3 py-1.5 text-[10px] font-black uppercase text-starlight disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Re-syncing…" : "Re-sync from PDF"}
                </button>
                <button
                  type="button"
                  disabled={syncing || uploading}
                  onClick={() => void handleOpenPdfTab()}
                  className="flex items-center gap-1 border border-zinc-700 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-starlight disabled:opacity-40"
                >
                  <FileText className="h-3 w-3" />
                  Open PDF
                </button>
              </>
            )}
            {character.dnd_beyond_url && (
              <a
                href={character.dnd_beyond_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 border border-neon-cyan px-3 py-1.5 text-[10px] font-black uppercase text-neon-cyan"
              >
                <ExternalLink className="h-3 w-3" />
                D&amp;D Beyond
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="bg-neon-magenta px-3 py-1.5 text-[10px] font-black uppercase text-black"
            >
              Save session &amp; close
            </button>
            <button type="button" onClick={onClose} className="p-1 text-zinc-500 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-void">
          {(syncing || uploading) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6">
              <div className="max-w-sm rounded-sm border-2 border-neon-cyan bg-zinc-950 px-6 py-5 text-center shadow-lg">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-neon-cyan" />
                <p className="text-sm font-black uppercase text-starlight">
                  {uploading ? "Uploading PDF" : "Re-syncing from PDF"}
                </p>
                <p className="mt-2 text-[11px] font-mono leading-relaxed text-zinc-400">
                  This may take a couple of minutes while we read your sheet. Please wait — your
                  panes will update when it finishes.
                </p>
              </div>
            </div>
          )}
          <div className="h-full overflow-y-auto px-3 py-3">
            <DigitalCharacterSheet
              character={character}
              sheet={sheet}
              onSheetChange={onSheetChange}
              onCombatChange={onCombatChange}
              onLongRest={handleLongRest}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
