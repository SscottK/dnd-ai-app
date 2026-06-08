import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Plus, ScrollText, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  createCampaignNoteTab,
  deleteCampaignNoteTab,
  fetchAllNotes,
  saveCampaignNotes,
  serverNotesToClient,
} from "../lib/campaignNotes";

function NoteEditor({ tab, onChange, onDelete }) {
  return (
    <div className="rounded-sm border border-border/70 bg-void-deep/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={tab.title}
          onChange={(event) => onChange({ ...tab, title: event.target.value })}
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-xs font-black uppercase text-starlight"
        />
        {tab.archived && (
          <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[8px] font-black uppercase text-ink-faint">
            Archived
          </span>
        )}
        <button
          type="button"
          onClick={() => onDelete(tab.id)}
          className="shrink-0 rounded-sm border border-danger/40 p-1 text-danger hover:bg-danger/10"
          title="Delete permanently"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={tab.content}
        onChange={(event) => onChange({ ...tab, content: event.target.value })}
        rows={8}
        className="w-full resize-y rounded-sm border border-border bg-black p-2 text-[11px] font-mono leading-relaxed text-ink"
        placeholder="Write notes…"
      />
    </div>
  );
}

export function NotesPage() {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState({});

  const loadNotes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAllNotes(token);
      const rows = (data.campaigns || []).map((row) => {
        const doc = serverNotesToClient(row);
        return {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          tabs: [
            ...doc.tabs.map((tab) => ({ ...tab, archived: false })),
            ...doc.closedTabs.map((tab) => ({ ...tab, archived: true })),
          ],
          activeTabId: doc.activeTabId,
          updatedAt: row.updated_at,
        };
      });
      setCampaigns(rows);
      setExpanded((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (next[row.campaignId] === undefined) next[row.campaignId] = true;
        }
        return next;
      });
    } catch (err) {
      setError(err.message || "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const persistCampaign = async (campaignId, tabs, activeTabId) => {
    if (!token) return;
    setSaving((prev) => ({ ...prev, [campaignId]: true }));
    try {
      const openTabs = tabs.filter((tab) => !tab.archived);
      const closedTabs = tabs.filter((tab) => tab.archived);
      await saveCampaignNotes(campaignId, token, {
        tabs: openTabs,
        closedTabs,
        activeTabId,
      });
    } catch (err) {
      setError(err.message || "Could not save notes.");
    } finally {
      setSaving((prev) => ({ ...prev, [campaignId]: false }));
    }
  };

  const updateTab = (campaignId, tabId, nextTab) => {
    setCampaigns((prev) =>
      prev.map((campaign) => {
        if (campaign.campaignId !== campaignId) return campaign;
        const tabs = campaign.tabs.map((tab) => (tab.id === tabId ? nextTab : tab));
        void persistCampaign(campaignId, tabs, campaign.activeTabId);
        return { ...campaign, tabs };
      })
    );
  };

  const deleteTab = async (campaignId, tabId) => {
    if (!token || !window.confirm("Permanently delete this note? This cannot be undone.")) return;
    try {
      await deleteCampaignNoteTab(campaignId, token, tabId);
      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.campaignId === campaignId
            ? { ...campaign, tabs: campaign.tabs.filter((tab) => tab.id !== tabId) }
            : campaign
        )
      );
    } catch (err) {
      setError(err.message || "Could not delete note.");
    }
  };

  const addTab = async (campaignId) => {
    if (!token) return;
    try {
      const data = await createCampaignNoteTab(campaignId, token, { title: "New note" });
      const doc = serverNotesToClient(data);
      setCampaigns((prev) =>
        prev.map((campaign) =>
          campaign.campaignId === campaignId
            ? {
                ...campaign,
                tabs: [
                  ...doc.tabs.map((tab) => ({ ...tab, archived: false })),
                  ...doc.closedTabs.map((tab) => ({ ...tab, archived: true })),
                ],
                activeTabId: doc.activeTabId,
              }
            : campaign
        )
      );
    } catch (err) {
      setError(err.message || "Could not create note.");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-starlight">
              <ScrollText className="h-4 w-4 text-neon-cyan" />
              Campaign notes
            </h1>
            <p className="mt-1 text-[11px] font-mono text-ink-muted">
              All notes grouped by campaign. Combat logs append after each fight; action logs append
              when the DM ends a session.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="text-[10px] font-black uppercase tracking-widest text-neon-cyan hover:text-starlight"
          >
            Back to dashboard
          </Link>
        </div>

        {error && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] font-mono text-danger">
            {error}
          </p>
        )}

        {loading && (
          <p className="text-[11px] font-mono text-ink-faint">Loading notes…</p>
        )}

        {!loading && campaigns.length === 0 && (
          <p className="rounded-sm border border-dashed border-border px-4 py-8 text-center text-[11px] font-mono text-ink-muted">
            No campaign notes yet. Join a campaign or start taking notes during a live session.
          </p>
        )}

        {campaigns.map((campaign) => {
          const isOpen = expanded[campaign.campaignId];
          return (
            <section
              key={campaign.campaignId}
              className="rounded-sm border border-border bg-void-panel/60"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [campaign.campaignId]: !prev[campaign.campaignId],
                  }))
                }
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-starlight">
                    {campaign.campaignName}
                  </p>
                  <p className="text-[10px] font-mono text-ink-faint">
                    {campaign.tabs.length} note{campaign.tabs.length === 1 ? "" : "s"}
                    {saving[campaign.campaignId] ? " · saving…" : ""}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  <button
                    type="button"
                    onClick={() => addTab(campaign.campaignId)}
                    className="inline-flex items-center gap-1 rounded-sm border border-neon-cyan/50 px-2 py-1 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
                  >
                    <Plus className="h-3 w-3" />
                    New note
                  </button>

                  {campaign.tabs.length === 0 ? (
                    <p className="text-[10px] font-mono text-ink-faint">No notes for this campaign.</p>
                  ) : (
                    campaign.tabs.map((tab) => (
                      <NoteEditor
                        key={tab.id}
                        tab={tab}
                        onChange={(nextTab) => updateTab(campaign.campaignId, tab.id, nextTab)}
                        onDelete={(tabId) => deleteTab(campaign.campaignId, tabId)}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
