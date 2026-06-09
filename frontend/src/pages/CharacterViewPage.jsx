import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, RefreshCw, Upload } from "lucide-react";
import { AuthenticatedPdfFrame, openAuthenticatedPdfInTab } from "../components/sheet/AuthenticatedPdfFrame";
import { DigitalSheetEditor } from "../components/sheet/DigitalSheetEditor";
import { useNestedPageLayout } from "../contexts/PageRefreshContext";
import { useAuth } from "../hooks/useAuth";
import { APP_MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { apiFetch, apiUpload } from "../lib/api";
import { confirmPdfReplace } from "../lib/pdfReplace";

export function CharacterViewPage() {
  const { characterId } = useParams();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  useNestedPageLayout(isMobile);
  const uploadInputRef = useRef(null);
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState(() =>
    searchParams.get("view") === "pdf" ? "pdf" : "digital"
  );

  const loadCharacter = useCallback(async () => {
    if (!token || !characterId) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}`, { token });
      if (!res.ok) throw new Error("Character not found");
      setCharacter(await res.json());
    } catch (err) {
      console.error(err);
      setError("Could not load character.");
    } finally {
      setLoading(false);
    }
  }, [token, characterId]);

  useEffect(() => {
    loadCharacter();
  }, [loadCharacter]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-zinc-500">
        Loading character sheet...
      </div>
    );
  }

  if (!character) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-xs font-mono text-danger">{error || "Character not found"}</p>
        <Link to="/dashboard" className="text-xs text-neon-cyan hover:text-starlight">
          Back to campaigns
        </Link>
      </div>
    );
  }

  const hasPdf = !!character.pdf_url;

  const handleResync = async () => {
    if (!token || !characterId) return;
    setSyncing(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/refresh-from-pdf`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Re-sync failed");
      }
      setCharacter(await res.json());
    } catch (err) {
      setError(err.message || "Could not re-sync from PDF.");
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenPdfTab = async () => {
    try {
      await openAuthenticatedPdfInTab(character.pdf_url, token);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not open PDF.");
    }
  };

  const handleReplacePdf = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !token || !characterId) return;
    if (
      !confirmPdfReplace({
        characterName: character?.name,
        hasExistingPdf: Boolean(character?.pdf_url),
      })
    ) {
      event.target.value = "";
      return;
    }

    setUploading(true);
    setError("");
    try {
      const res = await apiUpload(`/characters/${characterId}/upload-pdf`, { token, file });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "PDF upload failed");
      }
      const data = await res.json();
      setCharacter(data);
      setView("digital");
    } catch (err) {
      setError(err.message || "Could not replace PDF.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 flex flex-col gap-2 border-b-2 border-neon-magenta bg-zinc-950 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase text-zinc-500 hover:text-neon-cyan"
          >
            <ArrowLeft className="h-3 w-3" />
            <span className="hidden sm:inline">Campaigns</span>
          </Link>
          <h1 className="truncate font-black text-sm uppercase text-starlight">
            {character.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {character.dnd_beyond_url && (
            <a
              href={character.dnd_beyond_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-neon-cyan hover:text-starlight"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">D&amp;D Beyond</span>
              <span className="sm:hidden">Beyond</span>
            </a>
          )}
          <button
            type="button"
            disabled={uploading || syncing}
            onClick={() => uploadInputRef.current?.click()}
            className="text-[10px] font-black uppercase text-neon-cyan hover:text-starlight inline-flex items-center gap-1 disabled:opacity-40"
          >
            <Upload className={`w-3 h-3 ${uploading ? "animate-pulse" : ""}`} />
            <span className="hidden sm:inline">
              {uploading ? "Uploading…" : hasPdf ? "Replace PDF" : "Upload PDF"}
            </span>
            <span className="sm:hidden">{uploading ? "…" : "PDF"}</span>
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleReplacePdf}
          />
          {hasPdf && (
            <>
              <button
                type="button"
                disabled={syncing || uploading}
                onClick={handleResync}
                className="text-[10px] font-black uppercase text-starlight hover:text-neon-cyan inline-flex items-center gap-1 disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncing ? "Re-syncing…" : "Re-sync PDF"}</span>
                <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
              </button>
              <button
                type="button"
                onClick={handleOpenPdfTab}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-neon-cyan hover:text-starlight"
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">Open PDF in tab</span>
                <span className="sm:hidden">Open</span>
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <p className="shrink-0 px-4 py-2 text-[10px] text-danger font-mono border-b border-danger/30">
          {error}
        </p>
      )}

      <div className="shrink-0 flex border-b border-zinc-800 px-4">
        <button
          type="button"
          onClick={() => setView("digital")}
          className={`px-4 py-2 text-[10px] font-black uppercase ${
            view === "digital"
              ? "text-starlight border-b-2 border-neon-magenta"
              : "text-zinc-600 hover:text-neon-cyan"
          }`}
        >
          Digital sheet
        </button>
        <button
          type="button"
          onClick={() => setView("pdf")}
          className={`px-4 py-2 text-[10px] font-black uppercase ${
            view === "pdf"
              ? "text-starlight border-b-2 border-neon-magenta"
              : "text-zinc-600 hover:text-neon-cyan"
          }`}
        >
          PDF (read-only)
        </button>
      </div>

      <div className="flex-1 overflow-hidden bg-void">
        {view === "digital" ? (
          <DigitalSheetEditor
            character={character}
            token={token}
            onSaved={(data) => setCharacter(data)}
          />
        ) : hasPdf ? (
          <AuthenticatedPdfFrame
            pdfUrl={character.pdf_url}
            token={token}
            title={`${character.name} character sheet`}
            className="w-full h-full border-0 bg-white"
          />
        ) : character.dnd_beyond_url ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <ExternalLink className="w-12 h-12 text-neon-magenta mb-4" />
            <h2 className="text-lg font-black text-starlight uppercase mb-2">
              D&amp;D Beyond Character
            </h2>
            <p className="text-xs font-mono text-zinc-500 max-w-md mb-6">
              This character is linked on D&amp;D Beyond. Open it there to view the full sheet, or
              use the Digital sheet tab to equip gear and update AC.
            </p>
            <a
              href={character.dnd_beyond_url}
              target="_blank"
              rel="noreferrer"
              className="px-6 py-3 bg-neon-cyan text-black font-black text-xs uppercase tracking-widest border-2 border-black hover:bg-starlight"
            >
              Open on D&amp;D Beyond
            </a>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <FileText className="w-12 h-12 text-zinc-700 mb-4" />
            <h2 className="text-lg font-black text-starlight uppercase mb-2">No sheet file</h2>
            <p className="text-xs font-mono text-zinc-500 max-w-md mb-4">
              Upload a PDF with the button above, or add a D&amp;D Beyond link from Campaigns. Use
              the Digital sheet tab to equip inventory and save AC.
            </p>
            <div className="text-left text-xs font-mono text-zinc-400 border border-zinc-800 p-4 max-w-sm">
              <p>
                <span className="text-neon-cyan">Class:</span> {character.class_name || "—"}
              </p>
              <p>
                <span className="text-neon-cyan">Level:</span> {character.level ?? "—"}
              </p>
              <p>
                <span className="text-neon-cyan">AC:</span> {character.ac ?? "—"}
              </p>
              <p>
                <span className="text-neon-cyan">HP:</span>{" "}
                {character.hp != null && character.max_hp != null
                  ? `${character.hp}/${character.max_hp}`
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
