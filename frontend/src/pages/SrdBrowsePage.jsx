import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useMediaQuery, APP_MOBILE_QUERY } from "../hooks/useMediaQuery";
import { apiFetch } from "../lib/api";
import { MarkdownRenderer } from "../components/MarkdownRenderer";

const CATEGORIES = [
  { id: "spells", label: "Spells", path: "/rules/spells", listKey: "spells" },
  { id: "monsters", label: "Monsters", path: "/rules/monsters", listKey: "monsters" },
  { id: "magic_items", label: "Magic items", path: "/rules/magic-items", listKey: "magic_items" },
  { id: "conditions", label: "Conditions", path: "/rules/conditions", listKey: "conditions" },
  { id: "species", label: "Species", path: "/rules/species", listKey: "species" },
  { id: "feats", label: "Feats", path: "/rules/feats", listKey: "feats" },
  { id: "glossary", label: "Glossary", path: "/rules/glossary", listKey: "glossary" },
  { id: "gear", label: "Gear", path: "/rules/gear", listKey: "gear" },
];

function formatSpellLevel(level) {
  if (level === 0) return "Cantrip";
  if (level != null) return `Lv ${level}`;
  return null;
}

function isSpellEntry(entry) {
  return Boolean(entry?.school != null && (entry.casting_time != null || entry.components != null));
}

function SpellEntryMeta({ entry }) {
  const header = [
    formatSpellLevel(entry.level) || (entry.level != null ? `Level ${entry.level}` : null),
    entry.school,
    entry.classes ? `(${entry.classes})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const rows = [
    ["Casting Time", entry.casting_time],
    ["Range", entry.range],
    ["Components", entry.components],
    ["Duration", entry.duration],
  ].filter(([, value]) => value);

  if (entry.ritual === "yes") rows.push(["Ritual", "Yes"]);
  if (entry.concentration === "yes") rows.push(["Concentration", "Yes"]);

  return (
    <div className="space-y-2 border-b border-border/60 pb-3">
      {header && <p className="text-xs font-black uppercase text-neon-cyan">{header}</p>}
      <dl className="space-y-1 font-mono text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 text-ink-faint">{label}:</dt>
            <dd className="text-starlight">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function entrySummary(entry, category) {
  if (category === "spells") {
    return [formatSpellLevel(entry.level), entry.school, entry.casting_time]
      .filter(Boolean)
      .join(" · ");
  }
  if (category === "monsters") {
    return [`CR ${entry.cr ?? "?"}`, entry.size, entry.type].filter(Boolean).join(" · ");
  }
  if (category === "magic_items") {
    return entry.rarity || entry.category || "";
  }
  return entry.tag || entry.category || "";
}

function entryBody(entry) {
  const text = entry.description || entry.desc || entry.content || "";
  if (!text) return "No description in SRD excerpt.";
  return text;
}

function BrowseListPanel({ title, titleClassName = "text-starlight", children, fillHeight = true }) {
  return (
    <div
      className={`flex flex-col rounded-md border border-border-bright bg-void-panel ${
        fillHeight ? "h-full min-h-0" : "max-h-[min(58dvh,28rem)]"
      }`}
    >
      <p
        className={`shrink-0 border-b border-border px-3 py-2 text-xs font-black uppercase ${titleClassName}`}
      >
        {title}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">{children}</div>
    </div>
  );
}

function EntryDetailPanel({ title, onClose, children, fillHeight = false }) {
  return (
    <div
      className={`w-full rounded-md border border-border-bright bg-void-panel lg:w-[min(100%,26rem)] ${
        fillHeight ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
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
      <div
        className={`p-3 text-sm font-mono text-ink-muted sm:p-4 ${
          fillHeight
            ? "min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            : "max-h-[min(70vh,28rem)] overflow-y-auto overscroll-y-contain"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function SrdBrowsePage() {
  const { token } = useAuth();
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  const [activeCategory, setActiveCategory] = useState("spells");
  const [entries, setEntries] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [error, setError] = useState("");

  const categoryMeta = useMemo(
    () => CATEGORIES.find((item) => item.id === activeCategory) || CATEGORIES[0],
    [activeCategory]
  );

  const loadCategory = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    setError("");
    setSelectedName(null);
    setSelectedEntry(null);
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
  }, [token, categoryMeta]);

  useEffect(() => {
    void loadCategory();
  }, [loadCategory]);

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!token || !q) {
      setSearchResults([]);
      return;
    }
    setError("");
    try {
      const res = await apiFetch(`/rules/search?q=${encodeURIComponent(q)}&limit=16`, { token });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err.message || "Search failed.");
      setSearchResults([]);
    }
  }, [token, searchQuery]);

  const openEntry = async (name, category = activeCategory) => {
    if (!token || !name) return;
    setSelectedName(name);
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
  };

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) => row.name.toLowerCase().includes(q));
  }, [entries, searchQuery]);

  const closeEntry = () => {
    setSelectedName(null);
    setSelectedEntry(null);
    setLoadingEntry(false);
  };

  const showDetail = Boolean(selectedName);
  const mobileDetailOpen = isMobile && showDetail;

  return (
    <div className="session-ui flex h-full min-h-0 flex-col overflow-hidden bg-void">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-3 overflow-hidden px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
        <header className="shrink-0">
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
            void runSearch();
          }}
          className="flex shrink-0 gap-2"
        >
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search all SRD categories…"
            className="flex-1 rounded-sm border border-border bg-black px-3 py-2 text-sm font-mono text-starlight placeholder:text-ink-faint focus:border-neon-cyan focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-neon-cyan px-3 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        {error && (
          <p className="shrink-0 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-mono text-danger">
            {error}
          </p>
        )}

        {searchResults.length > 0 && !mobileDetailOpen && (
          <section className="shrink-0 rounded-md border border-neon-magenta/40 bg-void-panel p-3">
            <p className="mb-2 text-xs font-black uppercase text-neon-magenta">Search results</p>
            <ul className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {searchResults.map((hit) => (
                <li key={`${hit.category}-${hit.name}`}>
                  <button
                    type="button"
                    onClick={() => void openEntry(hit.name, hit.category)}
                    className="rounded-sm border border-border px-2 py-1 text-xs font-mono text-starlight hover:border-neon-cyan hover:text-neon-cyan"
                  >
                    <span className="text-ink-faint">{hit.category}</span> {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:gap-4">
          <aside className={`shrink-0 lg:w-44 xl:w-52 ${mobileDetailOpen ? "hidden lg:block" : ""}`}>
            <p className="mb-2 text-xs font-black uppercase text-ink-faint">Categories</p>
            <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSearchResults([]);
                    setActiveCategory(cat.id);
                  }}
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
          </aside>

          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row lg:items-start">
            {(!isMobile || !showDetail) && (
            <div className="min-h-0 w-full shrink-0 lg:w-[22rem] xl:w-[24rem]">
              <BrowseListPanel
                fillHeight={!isMobile}
                title={
                  <>
                    {categoryMeta.label}
                    {loadingList && <span className="ml-2 text-ink-faint">Loading…</span>}
                  </>
                }
                titleClassName="text-neon-cyan"
              >
                <ul className="p-1.5 sm:p-2">
                  {filteredEntries.map((row) => (
                    <li key={row.name}>
                      <button
                        type="button"
                        onClick={() => void openEntry(row.name)}
                        className={`block w-full rounded-sm px-2 py-1.5 text-left text-xs font-mono hover:bg-neon-cyan/10 ${
                          selectedName === row.name
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
                  {!loadingList && filteredEntries.length === 0 && (
                    <li className="px-2 py-4 text-center text-xs font-mono text-ink-faint">
                      No entries found.
                    </li>
                  )}
                </ul>
              </BrowseListPanel>
            </div>
            )}

            {showDetail && (
              <EntryDetailPanel
                title={selectedName}
                onClose={closeEntry}
                fillHeight={isMobile}
              >
                {loadingEntry && <p className="text-ink-faint">Loading…</p>}
                {!loadingEntry && selectedEntry && (
                  <div className="space-y-3">
                    {isSpellEntry(selectedEntry) && <SpellEntryMeta entry={selectedEntry} />}
                    {!isSpellEntry(selectedEntry) && selectedEntry.cr != null && (
                      <p className="text-xs text-neon-cyan">CR {selectedEntry.cr}</p>
                    )}
                    <MarkdownRenderer content={entryBody(selectedEntry)} />
                  </div>
                )}
                {!loadingEntry && !selectedEntry && (
                  <p className="text-ink-faint">Could not load this entry.</p>
                )}
              </EntryDetailPanel>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
