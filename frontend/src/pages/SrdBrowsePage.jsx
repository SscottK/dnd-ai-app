import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
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

function entrySummary(entry, category) {
  if (category === "spells") {
    return [entry.level != null ? `Lv ${entry.level}` : null, entry.school, entry.casting_time]
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

export function SrdBrowsePage() {
  const { token } = useAuth();
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

  return (
    <div className="session-ui h-full overflow-y-auto bg-void">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <header>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-neon-cyan">SRD 5.2.1</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black uppercase text-starlight">
            <BookOpen className="h-6 w-6 text-neon-magenta" />
            Rules browser
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Browse spells, monsters, magic items, and more from the official System Reference Document.
          </p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
          className="flex gap-2"
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
            className="inline-flex items-center gap-1 rounded-sm border border-neon-cyan px-3 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/10"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        {error && (
          <p className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-mono text-danger">
            {error}
          </p>
        )}

        {searchResults.length > 0 && (
          <section className="rounded-md border border-neon-magenta/40 bg-void-panel p-3">
            <p className="mb-2 text-xs font-black uppercase text-neon-magenta">Search results</p>
            <ul className="flex flex-wrap gap-2">
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <aside className="lg:w-52 shrink-0">
            <p className="mb-2 text-xs font-black uppercase text-ink-faint">Categories</p>
            <div className="flex flex-wrap gap-1 lg:flex-col">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSearchResults([]);
                    setActiveCategory(cat.id);
                  }}
                  className={`rounded-sm border px-3 py-2 text-left text-xs font-black uppercase ${
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

          <section className="grid min-h-[320px] min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="min-h-0 rounded-md border border-border-bright bg-void-panel">
              <p className="border-b border-border px-3 py-2 text-xs font-black uppercase text-neon-cyan">
                {categoryMeta.label}
                {loadingList && <span className="ml-2 text-ink-faint">Loading…</span>}
              </p>
              <ul className="max-h-[420px] overflow-y-auto p-2">
                {filteredEntries.map((row) => (
                  <li key={row.name}>
                    <button
                      type="button"
                      onClick={() => void openEntry(row.name)}
                      className={`block w-full rounded-sm px-2 py-1.5 text-left text-xs font-mono hover:bg-neon-cyan/10 ${
                        selectedName === row.name ? "bg-neon-cyan/10 text-starlight" : "text-ink-muted"
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
                  <li className="px-2 py-4 text-center text-xs font-mono text-ink-faint">No entries found.</li>
                )}
              </ul>
            </div>

            <div className="min-h-0 rounded-md border border-border-bright bg-void-panel">
              <p className="border-b border-border px-3 py-2 text-xs font-black uppercase text-starlight">
                {selectedName || "Select an entry"}
              </p>
              <div className="max-h-[420px] overflow-y-auto p-4 text-sm font-mono text-ink-muted">
                {loadingEntry && <p className="text-ink-faint">Loading…</p>}
                {!loadingEntry && selectedEntry && (
                  <div className="space-y-3">
                    {selectedEntry.level != null && (
                      <p className="text-xs text-neon-cyan">
                        Level {selectedEntry.level}
                        {selectedEntry.school ? ` · ${selectedEntry.school}` : ""}
                      </p>
                    )}
                    {selectedEntry.cr != null && (
                      <p className="text-xs text-neon-cyan">CR {selectedEntry.cr}</p>
                    )}
                    <MarkdownRenderer content={entryBody(selectedEntry)} />
                  </div>
                )}
                {!loadingEntry && !selectedEntry && (
                  <p className="text-ink-faint">Pick a name from the list or run a search.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
