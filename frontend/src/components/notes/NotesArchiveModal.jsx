import { useEffect, useState } from "react";
import { ArchiveRestore, Trash2, X } from "lucide-react";
import {
  deleteCampaignNoteTab,
  fetchCampaignNotes,
  serverNotesToClient,
} from "../../lib/campaignNotes";

export function NotesArchiveModal({
  open,
  campaignId,
  token,
  openTabs,
  onClose,
  onImportTab,
  onTabDeleted,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archivedTabs, setArchivedTabs] = useState([]);
  const [deletingId, setDeletingId] = useState(null);

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
        const byId = new Map();
        for (const tab of doc.closedTabs || []) {
          if (tab?.id) byId.set(tab.id, tab);
        }
        for (const tab of doc.tabs || []) {
          if (!tab?.id || openIds.has(tab.id) || byId.has(tab.id)) continue;
          byId.set(tab.id, tab);
        }
        setArchivedTabs([...byId.values()]);
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

  const handleDeleteTab = async (tab) => {
    if (!campaignId || !token) return;
    const confirmed = window.confirm(
      `Permanently delete "${tab.title}"?\n\nThis removes the tab from your archive and cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(tab.id);
    setError("");
    try {
      await deleteCampaignNoteTab(campaignId, token, tab.id);
      setArchivedTabs((prev) => prev.filter((item) => item.id !== tab.id));
      onTabDeleted?.(tab);
    } catch (err) {
      setError(err.message || "Could not delete note.");
    } finally {
      setDeletingId(null);
    }
  };

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
                    <p className="min-w-0 flex-1 text-[11px] font-black uppercase text-starlight">
                      {tab.title}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        disabled={deletingId === tab.id}
                        onClick={() => onImportTab(tab)}
                        className="rounded-sm border border-neon-cyan/50 px-2 py-0.5 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
                      >
                        Reopen
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === tab.id}
                        onClick={() => handleDeleteTab(tab)}
                        className="inline-flex items-center gap-1 rounded-sm border border-danger/50 px-2 py-0.5 text-[9px] font-black uppercase text-danger hover:bg-danger/10 disabled:opacity-40"
                        title="Delete permanently"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
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
            Reopen adds a tab back to your open notes. Delete permanently removes it from your
            archive and server storage.
          </p>
        </div>
      </div>
    </div>
  );
}
