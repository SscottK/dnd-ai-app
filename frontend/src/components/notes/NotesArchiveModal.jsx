import { useEffect, useState } from "react";
import { ArchiveRestore, X } from "lucide-react";
import { fetchCampaignNotes, serverNotesToClient } from "../../lib/campaignNotes";

export function NotesArchiveModal({ open, campaignId, token, openTabs, onClose, onImportTab }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archivedTabs, setArchivedTabs] = useState([]);

  useEffect(() => {
    if (!open || !campaignId || !token) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchCampaignNotes(campaignId, token);
        if (cancelled) return;
        const doc = serverNotesToClient(data);
        const openIds = new Set((openTabs || []).map((tab) => tab.id));
        const archived = [
          ...(doc.closedTabs || []),
          ...(doc.tabs || []).filter((tab) => !openIds.has(tab.id)),
        ];
        setArchivedTabs(archived);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load archived notes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, campaignId, token, openTabs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-sm border border-border bg-void-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <ArchiveRestore className="h-4 w-4 text-neon-cyan" />
            <h2 className="text-xs font-black uppercase tracking-widest text-starlight">
              Archived notes
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-faint hover:text-starlight"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="text-[11px] font-mono text-ink-faint">Loading archived notes…</p>
          )}
          {error && <p className="text-[11px] font-mono text-danger">{error}</p>}
          {!loading && !error && archivedTabs.length === 0 && (
            <p className="text-[11px] font-mono text-ink-muted">
              No archived tabs for this campaign yet. Close a tab in the notes pane to archive it,
              or edit campaign session tabs on the Notes page.
            </p>
          )}
          {!loading && !error && archivedTabs.length > 0 && (
            <ul className="space-y-2">
              {archivedTabs.map((tab) => (
                <li
                  key={tab.id}
                  className="rounded-sm border border-border/70 bg-void-deep/40 p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-[11px] font-black uppercase text-starlight">{tab.title}</p>
                    <button
                      type="button"
                      onClick={() => onImportTab(tab)}
                      className="shrink-0 rounded-sm border border-neon-cyan/50 px-2 py-0.5 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
                    >
                      Reopen
                    </button>
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-[10px] font-mono text-ink-muted">
                    {tab.content || "(empty)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-2">
          <p className="text-[9px] font-mono text-ink-faint">
            Reopening adds the tab back to your open tabs. Edit anytime on the Notes page — live
            session not required.
          </p>
        </div>
      </div>
    </div>
  );
}
