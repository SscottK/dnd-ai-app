import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, FolderOpen, Plus, X } from "lucide-react";
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
  closedTabs = [],
  activeTabId,
  onChange,
  tabsKey,
  closedTabsKey = "closedNotesTabs",
  activeKey,
  hint = "Double-click a tab name to rename",
  formattedPreview = false,
  onBrowseArchive,
}) {
  const [localTabs, setLocalTabs] = useState(tabs);
  const [localClosedTabs, setLocalClosedTabs] = useState(closedTabs);
  const [editingTabId, setEditingTabId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingContent, setEditingContent] = useState(false);
  const [closedMenuOpen, setClosedMenuOpen] = useState(false);
  const saveTimer = useRef(null);
  const flushRef = useRef(null);
  const closedMenuRef = useRef(null);

  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);

  useEffect(() => {
    setLocalClosedTabs(closedTabs);
  }, [closedTabs]);

  const activeTab = localTabs.find((tab) => tab.id === activeTabId) || localTabs[0];

  const persistAll = (
    nextTabs,
    nextClosedTabs,
    nextActiveId = activeTabId,
    immediate = false
  ) => {
    setLocalTabs(nextTabs);
    setLocalClosedTabs(nextClosedTabs);
    if (saveTimer.current) clearTimeout(saveTimer.current);

    const write = () =>
      onChange({
        [tabsKey]: nextTabs,
        [closedTabsKey]: nextClosedTabs,
        [activeKey]: nextActiveId,
      });

    flushRef.current = write;

    if (immediate) {
      write();
      return;
    }
    saveTimer.current = setTimeout(write, 500);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        flushRef.current?.();
      }
    },
    []
  );

  useEffect(() => {
    if (!closedMenuOpen) return undefined;
    const handlePointer = (event) => {
      if (closedMenuRef.current && !closedMenuRef.current.contains(event.target)) {
        setClosedMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [closedMenuOpen]);

  const addTab = () => {
    const id = `notes-${Date.now()}`;
    const nextTabs = [...localTabs, { id, title: "New tab", content: "" }];
    persistAll(nextTabs, localClosedTabs, id, true);
    setEditingTabId(id);
    setEditTitle("New tab");
    setEditingContent(true);
    setClosedMenuOpen(false);
  };

  const closeTab = (id) => {
    const closing = localTabs.find((tab) => tab.id === id);
    if (!closing) return;

    const nextTabs = localTabs.filter((tab) => tab.id !== id);
    const nextClosed = [...localClosedTabs, closing];
    const nextActive =
      activeTabId === id ? nextTabs[0]?.id ?? null : activeTabId;

    persistAll(nextTabs, nextClosed, nextActive, true);
    if (activeTabId === id) setEditingContent(false);
  };

  const reopenTab = (id) => {
    const restoring = localClosedTabs.find((tab) => tab.id === id);
    if (!restoring) return;

    const nextClosed = localClosedTabs.filter((tab) => tab.id !== id);
    const nextTabs = [...localTabs, restoring];
    persistAll(nextTabs, nextClosed, id, true);
    setClosedMenuOpen(false);
    setEditingContent(false);
  };

  const startRename = (tab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const commitRename = (id) => {
    const title = editTitle.trim() || "Notes";
    persistAll(
      localTabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
      localClosedTabs,
      activeTabId,
      true
    );
    setEditingTabId(null);
  };

  const updateContent = (content) => {
    if (!activeTab) return;
    persistAll(
      localTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, content } : tab)),
      localClosedTabs,
      activeTabId
    );
  };

  const formatActiveTab = () => {
    if (!activeTab) return;
    const formatted = normalizeNotesText(activeTab.content || "");
    persistAll(
      localTabs.map((tab) => (tab.id === activeTab.id ? { ...tab, content: formatted } : tab)),
      localClosedTabs,
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
                  persistAll(localTabs, localClosedTabs, tab.id, true);
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
            <button
              type="button"
              onClick={() => closeTab(tab.id)}
              className="px-0.5 text-ink-faint hover:text-danger"
              title="Close tab (saved — reopen from archive)"
            >
              <X className="h-3 w-3" />
            </button>
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
        {localClosedTabs.length > 0 && (
          <div className="relative shrink-0" ref={closedMenuRef}>
            <button
              type="button"
              onClick={() => setClosedMenuOpen((open) => !open)}
              className="flex items-center gap-0.5 rounded-sm border border-border px-1.5 py-1 text-[9px] font-black uppercase text-ink-muted hover:border-neon-cyan/50 hover:text-neon-cyan"
              title="Reopen closed notes"
            >
              <ArchiveRestore className="h-3 w-3" />
              <span>{localClosedTabs.length}</span>
            </button>
            {closedMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-sm border border-border bg-void-panel py-1 shadow-lg">
                <p className="px-2 py-1 text-[8px] font-black uppercase tracking-wide text-ink-faint">
                  Closed notes
                </p>
                {localClosedTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => reopenTab(tab.id)}
                    className="block w-full truncate px-2 py-1.5 text-left text-[10px] font-mono text-ink-muted hover:bg-neon-cyan/10 hover:text-starlight"
                    title={tab.title}
                  >
                    {tab.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onBrowseArchive && (
          <button
            type="button"
            onClick={onBrowseArchive}
            className="flex shrink-0 items-center gap-0.5 rounded-sm border border-border px-1.5 py-1 text-[9px] font-black uppercase text-ink-muted hover:border-neon-cyan/50 hover:text-neon-cyan"
            title="Browse all archived notes"
          >
            <FolderOpen className="h-3 w-3" />
            <span className="hidden sm:inline">Archive</span>
          </button>
        )}
      </div>

      {!activeTab ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border/60 bg-void-deep/30 p-4 text-center">
          <p className="text-[10px] font-mono text-ink-muted">All note tabs are closed.</p>
          {localClosedTabs.length > 0 ? (
            <button
              type="button"
              onClick={() => reopenTab(localClosedTabs[localClosedTabs.length - 1].id)}
              className="inline-flex items-center gap-1 rounded-sm border border-neon-cyan/50 px-2 py-1 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
            >
              <ArchiveRestore className="h-3 w-3" />
              Reopen last note
            </button>
          ) : (
            <button
              type="button"
              onClick={addTab}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[9px] font-black uppercase text-starlight hover:border-neon-cyan/50"
            >
              <Plus className="h-3 w-3" />
              New tab
            </button>
          )}
        </div>
      ) : showEditor ? (
        <textarea
          value={activeTab.content || ""}
          onChange={(e) => updateContent(e.target.value)}
          placeholder="Session notes, backstory, loot, NPCs..."
          className="min-h-0 flex-1 resize-none rounded-sm border border-border bg-black p-2 text-[11px] font-mono leading-relaxed text-ink"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/30 p-2">
          <NotesFormattedBody content={activeTab.content || ""} />
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-[8px] font-mono text-ink-faint">{hint}</p>
        <div className="flex gap-1">
          {formattedPreview && activeTab && (
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
