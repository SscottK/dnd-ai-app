import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useMediaQuery, APP_MOBILE_QUERY } from "../hooks/useMediaQuery";
import { apiFetch } from "../lib/api";
import { entrySummary, formatCategoryLabel } from "../lib/srdEntryFormat";
import { SrdEntryDetail } from "../components/SrdEntryDetail";
import { PAGE_SCROLL_CLASS, PullToRefresh } from "../components/PullToRefresh";

const CATEGORIES = [
  { id: "spells", label: "Spells", path: "/rules/spells", listKey: "spells" },
  { id: "monsters", label: "Monsters", path: "/rules/monsters", listKey: "monsters" },
  { id: "magic_items", label: "Magic items", path: "/rules/magic-items", listKey: "magic_items" },
  { id: "conditions", label: "Conditions", path: "/rules/conditions", listKey: "conditions" },
  { id: "species", label: "Species", path: "/rules/species", listKey: "species" },
  { id: "backgrounds", label: "Backgrounds", path: "/rules/backgrounds", listKey: "backgrounds" },
  { id: "feats", label: "Feats", path: "/rules/feats", listKey: "feats" },
  { id: "weapons", label: "Weapons", path: "/rules/weapons", listKey: "weapons" },
  { id: "armor", label: "Armor", path: "/rules/armor", listKey: "armor" },
  { id: "gear", label: "Gear", path: "/rules/gear", listKey: "gear" },
  { id: "animals", label: "Animals", path: "/rules/animals", listKey: "animals" },
  { id: "glossary", label: "Glossary", path: "/rules/glossary", listKey: "glossary" },
];

function BrowseListPanel({ title, titleClassName = "text-starlight", children, onRefresh }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border-bright bg-void-panel">
      <p
        className={`shrink-0 border-b border-border px-3 py-2 text-xs font-black uppercase ${titleClassName}`}
      >
        {title}
      </p>
      <PullToRefresh onRefresh={onRefresh} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        {children}
      </PullToRefresh>
    </div>
  );
}

function EntryList({
  entries,
  activeCategory,
  selectedName,
  selectedCategory,
  loadingList,
  emptyMessage,
  onOpenEntry,
}) {
  return (
    <ul className="p-1.5 sm:p-2">
      {entries.map((row) => (
        <li key={row.name}>
          <button
            type="button"
            onClick={() => void onOpenEntry(row.name, activeCategory)}
            className={`block w-full rounded-sm px-2 py-1.5 text-left text-xs font-mono transition-colors hover:bg-neon-cyan/10 ${
              selectedName === row.name && selectedCategory === activeCategory
                ? "bg-neon-cyan/10 text-starlight"
                : "text-ink-muted"
            }`}
          >
            <span className="font-black text-starlight">{row.name}</span>
            {entrySummary(row, activeCategory) && (
              <span className="mt-0.5 block text-[10px] text-ink-faint">
                {entrySummary(row, activeCategory)}
              </span>
            )}
          </button>
        </li>
      ))}
      {!loadingList && entries.length === 0 && (
        <li className="px-2 py-6 text-center text-xs font-mono text-ink-faint">{emptyMessage}</li>
      )}
    </ul>
  );
}

function EntryDetailPanel({ title, onClose, children, onRefresh, fullScreen = false }) {
  return (
    <div
      className={`flex min-h-0 w-full min-w-0 flex-1 flex-col bg-void-panel ${
        fullScreen
          ? "h-full rounded-none border-0"
          : "rounded-md border border-border-bright lg:w-[min(100%,26rem)]"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 truncate text-xs font-black uppercase text-starlight">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-ink-faint hover:bg-border/40 hover:text-starlight"
          aria-label="Close entry"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <PullToRefresh
        onRefresh={onRefresh}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 text-sm font-mono text-ink-muted sm:p-4"
      >
        {children}
      </PullToRefresh>
    </div>
  );
}

function SearchResultsPanel({ results, searching, query, onSelect, onClear, inline = false }) {
  if (!query.trim()) return null;

  return (
    <section className="rounded-md border border-neon-magenta/40 bg-void-panel">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <p className="text-xs font-black uppercase text-neon-magenta">
          Search results
          {searching && <span className="ml-2 font-mono text-ink-faint">Searching…</span>}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded px-2 py-0.5 text-[10px] font-black uppercase text-ink-faint hover:bg-border/40 hover:text-starlight"
        >
          Clear
        </button>
      </div>
      {!searching && results.length === 0 && (
        <p className="px-3 py-4 text-center text-xs font-mono text-ink-faint">
          No SRD entries match &ldquo;{query}&rdquo;.
        </p>
      )}
      {results.length > 0 && (
        <ul
          className={
            inline
              ? "p-1.5 sm:p-2"
              : "max-h-40 overflow-y-auto overscroll-y-contain p-1.5 sm:max-h-48"
          }
        >
          {results.map((hit) => {
            const summary = entrySummary(hit, hit.category);
            return (
              <li key={`${hit.category}-${hit.name}`}>
                <button
                  type="button"
                  onClick={() => onSelect(hit.name, hit.category)}
                  className="block w-full rounded-sm px-2 py-2 text-left hover:bg-neon-magenta/10"
                >
                  <span className="block text-xs font-black text-starlight">{hit.name}</span>
                  <span className="mt-0.5 block text-[10px] text-neon-magenta">
                    {formatCategoryLabel(hit.category)}
                  </span>
                  {summary && (
                    <span className="mt-0.5 block text-[10px] text-ink-faint">{summary}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CategoryTabs({ activeCategory, onSelect }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase text-ink-faint">Categories</p>
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={`shrink-0 rounded-sm border px-3 py-1.5 text-left text-xs font-black uppercase lg:shrink lg:py-2 ${
              activeCategory === cat.id
                ? "border-neon-cyan bg-neon-cyan/10 text-starlight"
                : "border-border text-ink-muted hover:border-neon-cyan/50 hover:text-starlight"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BrowseChrome({
  trimmedSearch,
  searchQuery,
  setSearchQuery,
  clearSearch,
  runSearch,
  error,
  showGlobalSearch,
  searchResults,
  searching,
  onSelectSearchHit,
  searchResultsInline = false,
}) {
  return (
    <>
      <header>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-neon-cyan">SRD 5.2.1</p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-black uppercase text-starlight sm:text-2xl">
          <BookOpen className="h-5 w-5 text-neon-magenta sm:h-6 sm:w-6" />
          Rules browser
        </h1>
        <p className="mt-1 text-xs text-ink-muted sm:mt-2 sm:text-sm">
          Browse spells, monsters, magic items, and more from the official System Reference Document.
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(trimmedSearch);
        }}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search all SRD categories…"
            className="w-full rounded-sm border border-border bg-black py-2 pl-3 pr-9 text-sm font-mono text-starlight placeholder:text-ink-faint focus:border-neon-cyan focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-faint hover:text-starlight"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-neon-cyan px-3 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>
      </form>

      {error && (
        <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-mono text-danger">
          {error}
        </p>
      )}

      {showGlobalSearch && (
        <SearchResultsPanel
          results={searchResults}
          searching={searching}
          query={trimmedSearch}
          onSelect={onSelectSearchHit}
          onClear={clearSearch}
          inline={searchResultsInline}
        />
      )}
    </>
  );
}

export function SrdBrowsePage() {
  const { token } = useAuth();
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  const [activeCategory, setActiveCategory] = useState("spells");
  const [entries, setEntries] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [error, setError] = useState("");
  const searchRequestRef = useRef(0);

  const categoryMeta = useMemo(
    () => CATEGORIES.find((item) => item.id === activeCategory) || CATEGORIES[0],
    [activeCategory]
  );

  const detailCategory = selectedCategory || activeCategory;
  const trimmedSearch = searchQuery.trim();
  const showGlobalSearch = Boolean(trimmedSearch);

  const loadCategory = useCallback(
    async ({ preserveSelection = false } = {}) => {
      if (!token) return;
      setLoadingList(true);
      setError("");
      if (!preserveSelection) {
        setSelectedName(null);
        setSelectedCategory(null);
        setSelectedEntry(null);
      }
      try {
        const res = await apiFetch(categoryMeta.path, { token });
        if (!res.ok) throw new Error("Could not load SRD category");
        const data = await res.json();
        const rows = (data[categoryMeta.listKey] || [])
          .map((row) => (typeof row === "string" ? { name: row } : row))
          .filter((row) => row?.name)
          .sort((left, right) => left.name.localeCompare(right.name));
        setEntries(rows);
      } catch (err) {
        setError(err.message || "Could not load SRD data.");
        setEntries([]);
      } finally {
        setLoadingList(false);
      }
    },
    [token, categoryMeta]
  );

  useEffect(() => {
    void loadCategory();
  }, [loadCategory]);

  const runSearch = useCallback(
    async (query = trimmedSearch) => {
      const q = query.trim();
      if (!token || !q) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const requestId = ++searchRequestRef.current;
      setSearching(true);
      setError("");
      try {
        const res = await apiFetch(`/rules/search?q=${encodeURIComponent(q)}&limit=16`, { token });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        if (requestId !== searchRequestRef.current) return;
        setSearchResults(data.results || []);
      } catch (err) {
        if (requestId !== searchRequestRef.current) return;
        setError(err.message || "Search failed.");
        setSearchResults([]);
      } finally {
        if (requestId === searchRequestRef.current) {
          setSearching(false);
        }
      }
    },
    [token, trimmedSearch]
  );

  useEffect(() => {
    if (!trimmedSearch) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch(trimmedSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [trimmedSearch, runSearch]);

  const openEntry = useCallback(
    async (name, category = activeCategory) => {
      if (!token || !name) return;
      setSelectedName(name);
      setSelectedCategory(category);
      setLoadingEntry(true);
      setError("");
      try {
        const res = await apiFetch(
          `/rules/lookup/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
          { token }
        );
        if (!res.ok) throw new Error("Could not load entry");
        const data = await res.json();
        setSelectedEntry(data.entry || null);
        if (category !== activeCategory) {
          const match = CATEGORIES.find((item) => item.id === category);
          if (match) setActiveCategory(category);
        }
      } catch (err) {
        setError(err.message || "Could not load entry.");
        setSelectedEntry(null);
      } finally {
        setLoadingEntry(false);
      }
    },
    [token, activeCategory]
  );

  const reloadSelectedEntry = useCallback(async () => {
    if (!selectedName || !selectedCategory) return;
    await openEntry(selectedName, selectedCategory);
  }, [openEntry, selectedCategory, selectedName]);

  const refreshBrowse = useCallback(async () => {
    await loadCategory({ preserveSelection: true });
    if (trimmedSearch) {
      await runSearch(trimmedSearch);
    }
    if (selectedName && selectedCategory) {
      await reloadSelectedEntry();
    }
  }, [loadCategory, trimmedSearch, runSearch, selectedName, selectedCategory, reloadSelectedEntry]);

  const closeEntry = () => {
    setSelectedName(null);
    setSelectedCategory(null);
    setSelectedEntry(null);
    setLoadingEntry(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
    searchRequestRef.current += 1;
  };

  const handleCategorySelect = (categoryId) => {
    setSearchResults([]);
    setActiveCategory(categoryId);
  };

  const showDetail = Boolean(selectedName);
  const mobileDetailOpen = isMobile && showDetail;
  const listEmptyMessage = loadingList
    ? null
    : showGlobalSearch && searchResults.length === 0 && !searching
      ? `No entries in ${categoryMeta.label} match your search.`
      : `No entries in ${categoryMeta.label}.`;

  const listTitle = (
    <>
      {categoryMeta.label}
      {loadingList && <span className="ml-2 text-ink-faint">Loading…</span>}
      {!loadingList && entries.length > 0 && (
        <span className="ml-2 font-mono text-ink-faint">({entries.length})</span>
      )}
    </>
  );

  const detailBody = (
    <>
      {loadingEntry && <p className="text-ink-faint">Loading…</p>}
      {!loadingEntry && selectedEntry && (
        <SrdEntryDetail entry={selectedEntry} category={detailCategory} />
      )}
      {!loadingEntry && !selectedEntry && (
        <p className="text-ink-faint">Could not load this entry.</p>
      )}
      {mobileDetailOpen && error && (
        <p className="mt-3 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-mono text-danger">
          {error}
        </p>
      )}
    </>
  );

  if (isMobile && mobileDetailOpen) {
    return (
      <div className="session-ui flex h-full min-h-0 flex-col overflow-hidden bg-void">
        <EntryDetailPanel
          title={selectedName}
          onClose={closeEntry}
          onRefresh={refreshBrowse}
          fullScreen
        >
          {detailBody}
        </EntryDetailPanel>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="session-ui flex h-full min-h-0 flex-col overflow-hidden bg-void">
        <PullToRefresh onRefresh={refreshBrowse} className={PAGE_SCROLL_CLASS}>
          <div className="mx-auto w-full max-w-6xl space-y-3 px-4 py-4 sm:space-y-4">
            <BrowseChrome
              trimmedSearch={trimmedSearch}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              clearSearch={clearSearch}
              runSearch={runSearch}
              error={error}
              showGlobalSearch={showGlobalSearch}
              searchResults={searchResults}
              searching={searching}
              onSelectSearchHit={(name, category) => void openEntry(name, category)}
              searchResultsInline
            />

            <CategoryTabs activeCategory={activeCategory} onSelect={handleCategorySelect} />

            <section className="rounded-md border border-border-bright bg-void-panel">
              <p className="border-b border-border px-3 py-2 text-xs font-black uppercase text-neon-cyan">
                {listTitle}
              </p>
              <EntryList
                entries={entries}
                activeCategory={activeCategory}
                selectedName={selectedName}
                selectedCategory={selectedCategory}
                loadingList={loadingList}
                emptyMessage={listEmptyMessage}
                onOpenEntry={openEntry}
              />
            </section>
          </div>
        </PullToRefresh>
      </div>
    );
  }

  return (
    <div className="session-ui flex h-full min-h-0 flex-col overflow-hidden bg-void">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden px-6 py-5">
        <div className="shrink-0 space-y-3">
          <BrowseChrome
            trimmedSearch={trimmedSearch}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            clearSearch={clearSearch}
            runSearch={runSearch}
            error={error}
            showGlobalSearch={showGlobalSearch}
            searchResults={searchResults}
            searching={searching}
            onSelectSearchHit={(name, category) => void openEntry(name, category)}
          />
        </div>

        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          <aside className="w-44 shrink-0 xl:w-52">
            <CategoryTabs activeCategory={activeCategory} onSelect={handleCategorySelect} />
          </aside>

          <section className="flex min-h-0 flex-1 items-stretch gap-4 overflow-hidden">
            <div className="w-[22rem] shrink-0 xl:w-[24rem]">
              <BrowseListPanel onRefresh={refreshBrowse} title={listTitle} titleClassName="text-neon-cyan">
                <EntryList
                  entries={entries}
                  activeCategory={activeCategory}
                  selectedName={selectedName}
                  selectedCategory={selectedCategory}
                  loadingList={loadingList}
                  emptyMessage={listEmptyMessage}
                  onOpenEntry={openEntry}
                />
              </BrowseListPanel>
            </div>

            {showDetail ? (
              <EntryDetailPanel
                title={selectedName}
                onClose={closeEntry}
                onRefresh={refreshBrowse}
              >
                {detailBody}
              </EntryDetailPanel>
            ) : (
              <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-void-panel/40">
                <p className="px-6 text-center text-xs font-mono text-ink-faint">
                  Select an entry to view spells, stat blocks, and item details.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
