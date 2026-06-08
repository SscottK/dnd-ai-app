import { useCallback, useEffect, useRef, useState } from "react";
import { NotesPaneWidget } from "../sheet/NotesPaneWidget";
import { NotesArchiveModal } from "./NotesArchiveModal";
import {
  fetchCampaignNotes,
  saveCampaignNotes,
  serverNotesToClient,
} from "../../lib/campaignNotes";

function applyNotesPatch(current, patch) {
  return {
    tabs: patch.playerNotesTabs ?? current.tabs,
    closedTabs: patch.closedNotesTabs ?? current.closedTabs,
    activeTabId:
      patch.activeNotesTabId !== undefined ? patch.activeNotesTabId : current.activeTabId,
  };
}

export function CampaignNotesEditor({ campaignId, token, campaignName }) {
  const [tabs, setTabs] = useState([]);
  const [closedTabs, setClosedTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const saveTimer = useRef(null);
  const stateRef = useRef({ tabs: [], closedTabs: [], activeTabId: null });

  const loadNotes = useCallback(async () => {
    if (!token || !campaignId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchCampaignNotes(campaignId, token);
      const doc = serverNotesToClient(data);
      setTabs(doc.tabs);
      setClosedTabs(doc.closedTabs);
      setActiveTabId(doc.activeTabId);
      stateRef.current = {
        tabs: doc.tabs,
        closedTabs: doc.closedTabs,
        activeTabId: doc.activeTabId,
      };
    } catch (err) {
      setError(err.message || "Could not load campaign notes.");
    } finally {
      setLoading(false);
    }
  }, [campaignId, token]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const persistNotes = useCallback(
    async (nextState) => {
      if (!token || !campaignId) return;
      setSaving(true);
      try {
        await saveCampaignNotes(campaignId, token, {
          tabs: nextState.tabs,
          closedTabs: nextState.closedTabs,
          activeTabId: nextState.activeTabId,
        });
        setError("");
      } catch (err) {
        setError(err.message || "Could not save campaign notes.");
      } finally {
        setSaving(false);
      }
    },
    [campaignId, token]
  );

  const scheduleSave = useCallback(
    (nextState) => {
      stateRef.current = nextState;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistNotes(nextState);
      }, 600);
    },
    [persistNotes]
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const handleChange = (patch) => {
    const nextState = applyNotesPatch(stateRef.current, patch);
    setTabs(nextState.tabs);
    setClosedTabs(nextState.closedTabs);
    setActiveTabId(nextState.activeTabId);
    scheduleSave(nextState);
  };

  const handleImportTab = (tab) => {
    const current = stateRef.current;
    const nextClosed = current.closedTabs.filter((item) => item.id !== tab.id);
    const hasTab = current.tabs.some((item) => item.id === tab.id);
    const nextTabs = hasTab
      ? current.tabs
      : [...current.tabs, { id: tab.id, title: tab.title, content: tab.content || "" }];
    const nextState = {
      tabs: nextTabs,
      closedTabs: nextClosed,
      activeTabId: tab.id,
    };
    setTabs(nextState.tabs);
    setClosedTabs(nextState.closedTabs);
    setActiveTabId(nextState.activeTabId);
    setArchiveOpen(false);
    void persistNotes(nextState);
  };

  if (loading) {
    return <p className="text-[11px] font-mono text-ink-faint">Loading campaign session notes…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-mono text-ink-faint">
          Tabbed notes for live play — combat and action logs append here during sessions.
        </p>
        {saving && <span className="text-[9px] font-mono text-neon-cyan">Saving…</span>}
      </div>
      {error && (
        <p className="rounded-sm border border-danger/40 bg-danger/10 px-2 py-1 text-[10px] font-mono text-danger">
          {error}
        </p>
      )}
      <div className="min-h-[280px] rounded-sm border border-border bg-void-deep/40 p-2">
        <NotesPaneWidget
          tabs={tabs}
          closedTabs={closedTabs}
          activeTabId={activeTabId}
          onChange={handleChange}
          onBrowseArchive={() => setArchiveOpen(true)}
          tabsKey="playerNotesTabs"
          closedTabsKey="closedNotesTabs"
          activeKey="activeNotesTabId"
          hint="Works outside live sessions · close tabs to archive · auto-saved to your account"
          formattedPreview
        />
      </div>
      <NotesArchiveModal
        open={archiveOpen}
        campaignId={campaignId}
        token={token}
        openTabs={tabs}
        onClose={() => setArchiveOpen(false)}
        onImportTab={handleImportTab}
      />
      {campaignName && (
        <p className="text-[9px] font-mono text-ink-faint">
          Stored for you in <span className="text-starlight">{campaignName}</span> — not shared with
          other players' private tabs.
        </p>
      )}
    </div>
  );
}
