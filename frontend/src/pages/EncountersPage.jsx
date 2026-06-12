import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Skull, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { PageScroll } from "../components/PageScroll";
import { MonsterSrdSearch } from "../components/encounter/MonsterSrdSearch";
import {
  createEncounterTemplate,
  deleteEncounterTemplate,
  emptyMonsterRow,
  fetchEncounterTemplates,
  formatTemplateSummary,
  updateEncounterTemplate,
} from "../lib/encounterTemplates";

function MonsterRowEditor({ row, index, token, onChange, onRemove, canRemove }) {
  return (
    <div className="grid gap-2 rounded-sm border border-border/60 bg-void-deep/40 p-2 sm:grid-cols-[1fr_4rem_1fr_auto] sm:items-end">
      <label className="block min-w-0">
        <span className="text-[10px] font-black uppercase text-ink-faint">Stat block</span>
        <MonsterSrdSearch
          token={token}
          value={row.srd_name}
          onChange={(value) => onChange(index, { ...row, srd_name: value })}
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-black uppercase text-ink-faint">Count</span>
        <input
          type="number"
          min={1}
          max={12}
          value={row.count}
          onChange={(e) =>
            onChange(index, { ...row, count: Math.max(1, parseInt(e.target.value, 10) || 1) })
          }
          className="w-full rounded-sm border border-border bg-black px-2 py-1.5 text-center text-xs font-mono text-starlight"
        />
      </label>
      <label className="block min-w-0">
        <span className="text-[10px] font-black uppercase text-ink-faint">Label (optional)</span>
        <input
          type="text"
          value={row.label}
          onChange={(e) => onChange(index, { ...row, label: e.target.value })}
          placeholder={row.srd_name || "Uses SRD name"}
          className="w-full rounded-sm border border-border bg-black px-2 py-1.5 text-xs font-mono text-starlight"
        />
      </label>
      <button
        type="button"
        disabled={!canRemove}
        onClick={() => onRemove(index)}
        className="rounded p-2 text-ink-faint hover:bg-danger/10 hover:text-danger disabled:opacity-30"
        title="Remove row"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EncountersPage() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [monsters, setMonsters] = useState([emptyMonsterRow()]);

  const loadTemplates = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setTemplates(await fetchEncounterTemplates(token));
    } catch (err) {
      setError(err.message || "Could not load encounters.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const startNew = () => {
    setSelectedId(null);
    setTitle("");
    setNotes("");
    setMonsters([emptyMonsterRow()]);
    setError("");
  };

  const startEdit = (template) => {
    setSelectedId(template.id);
    setTitle(template.title);
    setNotes(template.notes || "");
    setMonsters(
      template.monsters?.length
        ? template.monsters.map((row) => ({
            srd_name: row.srd_name,
            count: row.count || 1,
            label: row.label || "",
          }))
        : [emptyMonsterRow()]
    );
    setError("");
  };

  const updateMonster = (index, nextRow) => {
    setMonsters((prev) => prev.map((row, i) => (i === index ? nextRow : row)));
  };

  const removeMonster = (index) => {
    setMonsters((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!token) return;

    const cleaned = monsters
      .map((row) => ({
        srd_name: row.srd_name.trim(),
        count: row.count || 1,
        label: row.label?.trim() || null,
      }))
      .filter((row) => row.srd_name);

    if (!title.trim()) {
      setError("Give this encounter a title.");
      return;
    }
    if (!cleaned.length) {
      setError("Add at least one monster with an SRD stat block name.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = { title: title.trim(), notes: notes.trim(), monsters: cleaned };
      if (selectedId) {
        await updateEncounterTemplate(token, selectedId, body);
      } else {
        await createEncounterTemplate(token, body);
      }
      await loadTemplates();
      startNew();
    } catch (err) {
      setError(err.message || "Could not save encounter.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId) => {
    if (!token || !window.confirm("Delete this saved encounter?")) return;
    setSaving(true);
    setError("");
    try {
      await deleteEncounterTemplate(token, templateId);
      if (selectedId === templateId) startNew();
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Could not delete encounter.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScroll onRefresh={loadTemplates} className="session-ui bg-void">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-black uppercase text-starlight sm:text-xl">
              <Skull className="h-5 w-5 text-neon-magenta" />
              Encounter library
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:text-sm">
              Build reusable monster groups for your campaigns. Only you see your templates; as DM you
              can drop them into the initiative tracker during play.
            </p>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1 rounded-sm border border-neon-cyan px-3 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
          >
            <Plus className="h-4 w-4" />
            New encounter
          </button>
        </div>

        {error && (
          <p className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-mono text-danger">
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-black uppercase text-neon-cyan">Saved encounters</h2>
            {loading ? (
              <p className="text-xs font-mono text-ink-faint">Loading…</p>
            ) : templates.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border p-4 text-xs font-mono text-ink-faint">
                No saved encounters yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((template) => {
                  const summary = formatTemplateSummary(template);
                  const active = selectedId === template.id;
                  return (
                    <li
                      key={template.id}
                      className={`rounded-sm border p-3 ${
                        active
                          ? "border-starlight bg-starlight/5"
                          : "border-border/60 bg-void-panel/80"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => startEdit(template)}
                        className="w-full text-left"
                      >
                        <p className="font-black uppercase text-starlight">{template.title}</p>
                        <p className="mt-1 text-[10px] font-mono text-ink-muted">
                          {summary.total} creature{summary.total === 1 ? "" : "s"}
                          {summary.names ? ` · ${summary.names}` : ""}
                        </p>
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDelete(template.id)}
                        className="mt-2 text-[10px] font-black uppercase text-danger hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="lg:col-span-3">
            <form onSubmit={handleSave} className="space-y-4 rounded-md border border-border-bright bg-void-panel p-4">
              <h2 className="text-sm font-black uppercase text-starlight">
                {selectedId ? "Edit encounter" : "New encounter"}
              </h2>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-ink-faint">Title</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ambush at the bridge"
                  className="mt-1 w-full rounded-sm border border-border bg-black px-3 py-2 text-sm text-starlight"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase text-ink-faint">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Tactics, terrain, treasure…"
                  className="mt-1 w-full rounded-sm border border-border bg-black px-3 py-2 text-sm font-mono text-ink-muted"
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase text-ink-faint">Monsters</p>
                  <button
                    type="button"
                    onClick={() => setMonsters((prev) => [...prev, emptyMonsterRow()])}
                    className="text-[10px] font-black uppercase text-neon-cyan hover:text-starlight"
                  >
                    + Add row
                  </button>
                </div>
                {monsters.map((row, index) => (
                  <MonsterRowEditor
                    key={index}
                    row={row}
                    index={index}
                    token={token}
                    onChange={updateMonster}
                    onRemove={removeMonster}
                    canRemove={monsters.length > 1}
                  />
                ))}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-sm border border-starlight bg-starlight/10 px-4 py-2 text-xs font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : selectedId ? "Update encounter" : "Save encounter"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </PageScroll>
  );
}
