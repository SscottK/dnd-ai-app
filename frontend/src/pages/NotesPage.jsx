import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Plus, ScrollText, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  createUserNote,
  deleteUserNote,
  fetchAllNotes,
  fetchUserNotesPage,
  serverNotesToClient,
  updateUserNote,
} from "../lib/campaignNotes";

const PERSONAL_GROUP = "personal";

function CampaignSelect({ value, campaigns, onChange, className = "" }) {
  return (
    <select
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next ? Number(next) : null);
      }}
      className={`rounded-sm border border-border bg-black px-2 py-1 text-[10px] font-mono text-ink ${className}`}
    >
      <option value="">Personal (no campaign)</option>
      {campaigns.map((campaign) => (
        <option key={campaign.id} value={campaign.id}>
          {campaign.name}
        </option>
      ))}
    </select>
  );
}

function UserNoteEditor({ note, campaigns, onChange, onDelete, saving }) {
  const saveTimer = useRef(null);

  const scheduleSave = (patch) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onChange(patch), 500);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  return (
    <div className="rounded-sm border border-border/70 bg-void-deep/30 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note.title}
          onChange={(event) => scheduleSave({ title: event.target.value })}
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-xs font-black uppercase text-starlight"
        />
        <CampaignSelect
          value={note.campaign_id}
          campaigns={campaigns}
          onChange={(campaignId) => onChange({ campaignId })}
          className="min-w-[160px]"
        />
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="shrink-0 rounded-sm border border-danger/40 p-1 text-danger hover:bg-danger/10"
          title="Delete permanently"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        value={note.content}
        onChange={(event) => scheduleSave({ content: event.target.value })}
        rows={8}
        className="w-full resize-y rounded-sm border border-border bg-black p-2 text-[11px] font-mono leading-relaxed text-ink"
        placeholder="Write notes…"
      />
      {saving && <p className="text-[9px] font-mono text-ink-faint">Saving…</p>}
    </div>
  );
}

function SessionNoteBlock({ tab }) {
  return (
    <div className="rounded-sm border border-border/50 bg-void-deep/20 p-3 space-y-1">
      <p className="text-[10px] font-black uppercase text-starlight">{tab.title}</p>
      {tab.archived && (
        <span className="inline-block rounded-sm border border-border px-1.5 py-0.5 text-[8px] font-black uppercase text-ink-faint">
          Archived
        </span>
      )}
      <p className="whitespace-pre-wrap text-[11px] font-mono leading-relaxed text-ink-muted">
        {tab.content || "(empty)"}
      </p>
    </div>
  );
}

export function NotesPage() {
  const { token } = useAuth();
  const [notes, setNotes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [sessionNotes, setSessionNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingIds, setSavingIds] = useState({});
  const [expanded, setExpanded] = useState({ [PERSONAL_GROUP]: true });
  const [showSessionNotes, setShowSessionNotes] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", campaignId: null });

  const loadNotes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [pageData, sessionData] = await Promise.all([
        fetchUserNotesPage(token),
        fetchAllNotes(token).catch(() => ({ campaigns: [] })),
      ]);
      setNotes(pageData.notes || []);
      setCampaigns(pageData.campaigns || []);
      const sessionRows = (sessionData.campaigns || []).map((row) => {
        const doc = serverNotesToClient(row);
        return {
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          tabs: [
            ...doc.tabs.map((tab) => ({ ...tab, archived: false })),
            ...doc.closedTabs.map((tab) => ({ ...tab, archived: true })),
          ],
        };
      });
      setSessionNotes(sessionRows);
    } catch (err) {
      setError(err.message || "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const groupedNotes = useMemo(() => {
    const groups = new Map();
    groups.set(PERSONAL_GROUP, { id: PERSONAL_GROUP, label: "Personal", notes: [] });

    for (const campaign of campaigns) {
      groups.set(String(campaign.id), {
        id: String(campaign.id),
        label: campaign.name,
        notes: [],
      });
    }

    for (const note of notes) {
      const key = note.campaign_id ? String(note.campaign_id) : PERSONAL_GROUP;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          label: note.campaign_name || "Campaign",
          notes: [],
        });
      }
      groups.get(key).notes.push(note);
    }

    return Array.from(groups.values()).filter((group) => group.notes.length > 0 || group.id === PERSONAL_GROUP);
  }, [notes, campaigns]);

  const handleCreate = async () => {
    if (!token) return;
    setCreating(true);
    setError("");
    try {
      const created = await createUserNote(token, {
        title: draft.title.trim() || "New note",
        content: draft.content,
        campaignId: draft.campaignId,
      });
      setNotes((prev) => [created, ...prev]);
      setDraft({ title: "", content: "", campaignId: null });
      const groupKey = created.campaign_id ? String(created.campaign_id) : PERSONAL_GROUP;
      setExpanded((prev) => ({ ...prev, [groupKey]: true }));
    } catch (err) {
      setError(err.message || "Could not create note.");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (noteId, patch) => {
    if (!token) return;
    setSavingIds((prev) => ({ ...prev, [noteId]: true }));
    setNotes((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) return note;
        const next = { ...note };
        if (patch.title !== undefined) next.title = patch.title;
        if (patch.content !== undefined) next.content = patch.content;
        if (patch.campaignId !== undefined) {
          next.campaign_id = patch.campaignId;
          next.campaign_name =
            campaigns.find((campaign) => campaign.id === patch.campaignId)?.name || null;
        }
        return next;
      })
    );
    try {
      const updated = await updateUserNote(token, noteId, patch);
      setNotes((prev) => prev.map((note) => (note.id === noteId ? updated : note)));
    } catch (err) {
      setError(err.message || "Could not save note.");
      await loadNotes();
    } finally {
      setSavingIds((prev) => ({ ...prev, [noteId]: false }));
    }
  };

  const handleDelete = async (noteId) => {
    if (!token || !window.confirm("Permanently delete this note? This cannot be undone.")) return;
    try {
      await deleteUserNote(token, noteId);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
    } catch (err) {
      setError(err.message || "Could not delete note.");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-starlight">
              <ScrollText className="h-4 w-4 text-neon-cyan" />
              Notes
            </h1>
            <p className="mt-1 text-[11px] font-mono text-ink-muted">
              Your notes live on your account. Assign them to a campaign or keep them personal.
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

        <section className="rounded-sm border border-neon-cyan/30 bg-void-panel/60 p-4 space-y-3">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-neon-cyan">
            New note
          </h2>
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Note title"
            className="w-full rounded-sm border border-border bg-black px-2 py-1.5 text-xs font-black uppercase text-starlight"
          />
          <textarea
            value={draft.content}
            onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
            rows={5}
            placeholder="Start writing…"
            className="w-full resize-y rounded-sm border border-border bg-black p-2 text-[11px] font-mono leading-relaxed text-ink"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-mono text-ink-muted">
              <span>Campaign</span>
              <CampaignSelect
                value={draft.campaignId}
                campaigns={campaigns}
                onChange={(campaignId) => setDraft((prev) => ({ ...prev, campaignId }))}
              />
            </label>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1 rounded-sm border border-neon-cyan bg-neon-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {creating ? "Creating…" : "Create note"}
            </button>
          </div>
        </section>

        {loading && <p className="text-[11px] font-mono text-ink-faint">Loading notes…</p>}

        {!loading && notes.length === 0 && (
          <p className="rounded-sm border border-dashed border-border px-4 py-6 text-center text-[11px] font-mono text-ink-muted">
            No notes yet. Use the form above to create your first one.
          </p>
        )}

        {groupedNotes.map((group) => {
          const isOpen = expanded[group.id] ?? true;
          return (
            <section key={group.id} className="rounded-sm border border-border bg-void-panel/60">
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [group.id]: !isOpen }))}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-starlight">
                    {group.label}
                  </p>
                  <p className="text-[10px] font-mono text-ink-faint">
                    {group.notes.length} note{group.notes.length === 1 ? "" : "s"}
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-faint transition ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-border px-4 py-4">
                  {group.notes.length === 0 ? (
                    <p className="text-[10px] font-mono text-ink-faint">No notes in this group.</p>
                  ) : (
                    group.notes.map((note) => (
                      <UserNoteEditor
                        key={note.id}
                        note={note}
                        campaigns={campaigns}
                        onChange={(patch) => handleUpdate(note.id, patch)}
                        onDelete={handleDelete}
                        saving={savingIds[note.id]}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
          );
        })}

        {sessionNotes.some((row) => row.tabs.length > 0) && (
          <section className="rounded-sm border border-border/70 bg-void-panel/40">
            <button
              type="button"
              onClick={() => setShowSessionNotes((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-ink-muted">
                  Session notes
                </p>
                <p className="text-[10px] font-mono text-ink-faint">
                  Auto-appended combat and action logs from live play
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-ink-faint transition ${showSessionNotes ? "rotate-180" : ""}`}
              />
            </button>
            {showSessionNotes && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                {sessionNotes.map((row) =>
                  row.tabs.length > 0 ? (
                    <div key={row.campaignId} className="space-y-2">
                      <p className="text-[10px] font-black uppercase text-starlight">
                        {row.campaignName}
                      </p>
                      {row.tabs.map((tab) => (
                        <SessionNoteBlock key={tab.id} tab={tab} />
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
