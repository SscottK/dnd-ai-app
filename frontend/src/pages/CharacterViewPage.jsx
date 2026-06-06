import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { AuthenticatedPdfFrame, openAuthenticatedPdfInTab } from "../components/sheet/AuthenticatedPdfFrame";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";

export function CharacterViewPage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const handleOpenPdfTab = async () => {
    try {
      await openAuthenticatedPdfInTab(character.pdf_url, token);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not open PDF.");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b-2 border-neon-magenta bg-zinc-950">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="text-zinc-500 hover:text-neon-cyan flex items-center gap-1 text-[10px] font-black uppercase"
          >
            <ArrowLeft className="w-3 h-3" />
            Campaigns
          </Link>
          <h1 className="font-black text-sm text-starlight uppercase truncate">
            {character.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {character.dnd_beyond_url && (
            <a
              href={character.dnd_beyond_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-black uppercase text-neon-cyan hover:text-starlight inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              D&amp;D Beyond
            </a>
          )}
          {hasPdf && (
            <button
              type="button"
              onClick={handleOpenPdfTab}
              className="text-[10px] font-black uppercase text-neon-cyan hover:text-starlight inline-flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              Open PDF in tab
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-void">
        {hasPdf ? (
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
              This character is linked on D&amp;D Beyond. Open it there to view the full sheet.
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
              Upload a PDF or add a D&amp;D Beyond link from the campaigns page.
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
