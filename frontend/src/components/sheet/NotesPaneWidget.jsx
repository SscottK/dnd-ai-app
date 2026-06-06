import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { normalizeNotesText, parseNotesToBlocks } from "../../lib/notesFormat";

export function NotesFormattedBody({ content }) {
  const blocks = parseNotesToBlocks(content);

  if (!blocks.length) {
    return (
      <p className="text-[10px] font-mono text-ink-faint">
        No notes yet. Switch to Edit to add session notes, backstory, or loot.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={`heading-${index}`}
              className="border-b border-border/60 pb-1 text-[10px] font-black uppercase tracking-wider text-starlight"
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={`list-${index}`} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`item-${index}-${itemIndex}`}
                  className="flex gap-2 text-[11px] leading-relaxed text-ink-muted"
                >
                  <span className="shrink-0 text-neon-cyan">•</span>
                  <span className="min-w-0 whitespace-pre-wrap">{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={`para-${index}`}
            className="whitespace-pre-wrap text-[11px] leading-relaxed text-ink-muted"
          >
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

export function NotesPaneWidget({
  tabs,
  activeTabId,
  onChange,
  tabsKey,
  activeKey,
  hint = "Double-click a tab name to rename",
  formattedPreview = false,
}) {
  const [localTabs, setLocalTabs] = useState(tabs);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingContent, setEditingContent] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);

  const activeTab = localTabs.find((tab) => tab.id === activeTabId) || localTabs[0];

  const persistTabs = (nextTabs, nextActiveId = activeTabId, immediate = false) => {
    setLocalTabs(nextTabs);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const write = () => onChange({ [tabsKey]: nextTabs, [activeKey]: nextActiveId });
    if (immediate) {
      write();
      return;
    }
    saveTimer.current = setTimeout(write, 500);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );

  const addTab = () => {
    const id = `notes-${Date.now()}`;
    const nextTabs = [...localTabs, { id, title: "New tab", content: "" }];
    persistTabs(nextTabs, id, true);
    setEditingTabId(id);
    setEditTitle("New tab");
    setEditingContent(true);
  };

  const removeTab = (id) => {
    if (localTabs.length <= 1) return;
    const nextTabs = localTabs.filter((tab) => tab.id !== id);
    const nextActive = activeTabId === id ? nextTabs[0].id : activeTabId;
    persistTabs(nextTabs, nextActive, true);
  };

  const startRename = (tab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const commitRename = (id) => {
    const title = editTitle.trim() || "Notes";
    persistTabs(
      localTabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      activeTabId,
      true
    );
    setEditingTabId(null);
  };

  const updateContent = (content) => {
    persistTabs(
      localTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, content } : tab)),
      activeTabId
    );
  };

  const formatActiveTab = () => {
    const formatted = normalizeNotesText(activeTab?.content || "");
    persistTabs(
      localTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, content: formatted } : tab)),
      activeTabId,
      true
    );
  };

  const showEditor = !formattedPreview || editingContent;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border pb-1">
        {localTabs.map((tab) => (
          <div key={tab.id} className="flex shrink-0 items-center">
            {editingTabId === tab.id ? (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(tab.id);
                  if (e.key === "Escape") setEditingTabId(null);
                }}
                autoFocus
                className="w-20 rounded-sm border border-neon-cyan bg-black px-1 py-0.5 text-[9px] font-black uppercase text-starlight"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  persistTabs(localTabs, tab.id, true);
                  setEditingContent(false);
                }}
                onDoubleClick={() => startRename(tab)}
                className={`max-w-[88px] truncate px-2 py-1 text-[9px] font-black uppercase ${
                  tab.id === activeTab?.id
                    ? "border-b-2 border-neon-cyan text-starlight"
                    : "text-ink-faint hover:text-ink-muted"
                }`}
                title="Double-click to rename"
              >
                {tab.title}
              </button>
            )}
            {localTabs.length > 1 && (
              <button
                type="button"
                onClick={() => removeTab(tab.id)}
                className="px-0.5 text-ink-faint hover:text-danger"
                title="Close tab"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addTab}
          className="shrink-0 rounded-sm border border-border p-1 text-ink-faint hover:text-starlight"
          title="New tab"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {showEditor ? (
        <textarea
          value={activeTab?.content || ""}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Session notes, backstory, loot, NPCs..."
          className="min-h-0 flex-1 resize-none rounded-sm border border-border bg-black p-2 text-[11px] font-mono leading-relaxed text-ink"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/30 p-2">
          <NotesFormattedBody content={activeTab?.content || ""} />
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[8px] font-mono text-ink-faint">{hint}</p>
        <div className="flex gap-1">
          {formattedPreview && (
            <>
              <button
                type="button"
                onClick={() => setEditingContent((prev) => !prev)}
                className="rounded-sm border border-border px-2 py-0.5 text-[8px] font-black uppercase text-ink-muted hover:text-starlight"
              >
                {editingContent ? "Preview" : "Edit"}
              </button>
              {editingContent && (
                <button
                  type="button"
                  onClick={formatActiveTab}
                  className="rounded-sm border border-neon-cyan/50 px-2 py-0.5 text-[8px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
                >
                  Format
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
