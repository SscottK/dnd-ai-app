import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  addTemplateToTracker,
  fetchEncounterTemplates,
  formatTemplateSummary,
} from "../../lib/encounterTemplates";
import { parseEncounterPatchResponse } from "../../lib/encounterDisplay";

export function SavedEncounterLoader({ campaignId, token, onEncounterUpdate, onError }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setTemplates(await fetchEncounterTemplates(token));
    } catch (err) {
      onError?.(err.message || "Could not load saved encounters.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [token, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (templateId) => {
    if (!token || !campaignId) return;
    setAddingId(templateId);
    onError?.("");
    try {
      const data = await addTemplateToTracker(token, campaignId, templateId);
      const parsed = parseEncounterPatchResponse(data);
      onEncounterUpdate?.(parsed.encounter);
    } catch (err) {
      onError?.(err.message || "Could not add encounter.");
    } finally {
      setAddingId(null);
    }
  };

  if (loading) {
    return <p className="text-[10px] font-mono text-ink-faint">Loading your encounter library…</p>;
  }

  if (!templates.length) {
    return (
      <p className="text-[10px] font-mono text-ink-faint">
        No saved encounters yet. Build templates on the Encounter library page from your dashboard.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase text-neon-cyan">From your library</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => {
          const summary = formatTemplateSummary(template);
          return (
            <button
              key={template.id}
              type="button"
              disabled={addingId != null}
              onClick={() => handleAdd(template.id)}
              className="max-w-full rounded-sm border border-border px-2 py-1.5 text-left hover:border-starlight disabled:opacity-40"
              title={summary.names}
            >
              <span className="flex items-center gap-1 text-[10px] font-black uppercase text-starlight">
                <Plus className="h-3 w-3 shrink-0" />
                {template.title}
              </span>
              <span className="block text-[9px] font-mono text-ink-faint">
                {summary.total} creature{summary.total === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
