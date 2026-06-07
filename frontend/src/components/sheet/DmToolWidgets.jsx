import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Loader2,
  MessageSquare,
  Send,
  Wand2,
} from "lucide-react";
import { apiFetch } from "../../lib/api";
import { buildEncounterPrompt, parseEncounterGeneration } from "../../lib/encounterGen";
import { useChatStream } from "../../hooks/useChatStream";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { DiceRoller } from "../DiceRoller";
import { NotesPaneWidget } from "./NotesPaneWidget";

const DM_CHAT_STORAGE_PREFIX = "quest-terminal-dm-chat-";

async function dmGenerate(token, prompt) {
  const res = await apiFetch("/generate", {
    token,
    method: "POST",
    body: { prompt },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Generation failed");
  }
  const data = await res.json();
  return data.text;
}

function PaneTabs({ tabs, active, onChange }) {
  return (
    <div className="flex shrink-0 gap-0.5 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`px-3 py-2 text-xs font-black uppercase tracking-wider sm:text-sm ${
            active === tab.id
              ? "border-b-2 border-neon-cyan text-starlight"
              : "text-ink-faint hover:text-ink-muted"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function GeneratorPanel({ title, fields, buildPrompt, token }) {
  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.default ?? ""]))
  );
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const text = await dmGenerate(token, buildPrompt(form));
      setResult(text);
    } catch (err) {
      setError(err.message || "Could not generate.");
      setResult("");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <form onSubmit={handleGenerate} className="shrink-0 space-y-2">
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-ink-faint">{title}</p>
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-[8px] font-mono uppercase text-ink-faint">{field.label}</span>
            {field.type === "select" ? (
              <select
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
              >
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                rows={field.rows || 2}
                placeholder={field.placeholder}
                className="mt-0.5 w-full resize-none rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
              />
            ) : (
              <input
                type={field.type || "text"}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
              />
            )}
          </label>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-1 rounded-sm border border-neon-magenta px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Generate
        </button>
      </form>
      {error && <p className="shrink-0 text-xs sm:text-sm font-mono text-danger">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/40 p-2">
        {result ? (
          <div className="text-xs sm:text-sm text-ink-muted [&_p]:mb-2">
            <MarkdownRenderer content={result} />
          </div>
        ) : (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">Output appears here — copy into your notes or tracker.</p>
        )}
      </div>
      {result && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 flex items-center justify-center gap-1 rounded-sm border border-border px-2 py-1 text-xs sm:text-sm font-black uppercase text-ink-muted hover:text-starlight"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

export function DmRulesChatWidget({ campaignId, campaignName, token }) {
  const { streamMessage, isStreaming } = useChatStream(token);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [booting, setBooting] = useState(true);

  const storageKey = `${DM_CHAT_STORAGE_PREFIX}${campaignId}`;

  const ensureConversation = useCallback(async () => {
    if (!token || !campaignId) return null;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const res = await apiFetch(`/conversations/${stored}`, { token });
      if (res.ok) {
        const data = await res.json();
        setConversationId(Number(stored));
        setMessages(data.messages || []);
        return Number(stored);
      }
    }
    const title = `${campaignName || "Campaign"} — DM Session`;
    const createRes = await apiFetch("/conversations", {
      token,
      method: "POST",
      body: { title },
    });
    if (!createRes.ok) throw new Error("Could not start chat thread");
    const thread = await createRes.json();
    localStorage.setItem(storageKey, String(thread.id));
    setConversationId(thread.id);
    setMessages([]);
    return thread.id;
  }, [token, campaignId, campaignName, storageKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureConversation();
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureConversation]);

  const handleSend = async (event) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || !conversationId || isStreaming) return;

    const userMessage = { role: "user", content };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreamedReply("");

    await streamMessage(conversationId, content, {
      onChunk: (chunk) => setStreamedReply((prev) => prev + chunk),
      onDone: (message) => {
        setMessages((prev) => [...prev, message]);
        setStreamedReply("");
      },
      onError: (err) => {
        console.error(err);
        setStreamedReply("");
      },
    });
  };

  const handleNewThread = async () => {
    localStorage.removeItem(storageKey);
    setBooting(true);
    try {
      await ensureConversation();
    } finally {
      setBooting(false);
    }
  };

  if (booting) {
    return <p className="text-xs sm:text-sm font-mono text-ink-faint">Starting rules assistant...</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs sm:text-sm font-black uppercase text-ink-faint">
          <MessageSquare className="h-3 w-3 text-neon-cyan" />
          5e Rules
        </div>
        <button
          type="button"
          onClick={handleNewThread}
          className="text-[8px] font-black uppercase text-ink-faint hover:text-starlight"
        >
          New thread
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/40 p-2">
        {messages.length === 0 && !streamedReply && (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">
            Ask rules questions, encounter balance, or spell clarifications.
          </p>
        )}
        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`rounded-sm px-2 py-1 text-xs sm:text-sm ${
              msg.role === "user"
                ? "ml-4 border border-neon-cyan/30 bg-neon-cyan/5 text-ink"
                : "mr-2 border border-border text-ink-muted"
            }`}
          >
            {msg.role === "assistant" ? <MarkdownRenderer content={msg.content} /> : msg.content}
          </div>
        ))}
        {streamedReply && (
          <div className="mr-2 rounded-sm border border-border px-2 py-1 text-xs sm:text-sm text-ink-muted">
            <MarkdownRenderer content={streamedReply} />
          </div>
        )}
      </div>
      <form onSubmit={handleSend} className="flex shrink-0 gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the rules..."
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
        />
        <button
          type="submit"
          disabled={isStreaming || !input.trim()}
          className="rounded-sm border border-neon-cyan px-2 py-1 text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

function EncounterGeneratorPanel({ campaignId, token, onEncounterGenerated }) {
  const [form, setForm] = useState({
    partyLevel: "5",
    difficulty: "Medium",
    setting: "",
  });
  const [summary, setSummary] = useState("");
  const [enemies, setEnemies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setAdded(false);
    try {
      const text = await dmGenerate(token, buildEncounterPrompt(form));
      const parsed = parseEncounterGeneration(text);
      setSummary(parsed.summary);
      setEnemies(parsed.enemies);
      onEncounterGenerated?.({
        ...parsed,
        partyLevel: form.partyLevel,
        difficulty: form.difficulty,
        setting: form.setting,
      });
    } catch (err) {
      setError(err.message || "Could not generate encounter.");
      setSummary("");
      setEnemies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToTracker = async () => {
    if (!campaignId || !enemies.length) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch(`/campaigns/${campaignId}/encounter/add-enemies`, {
        token,
        method: "POST",
        body: { enemies },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not add enemies");
      }
      setAdded(true);
    } catch (err) {
      setError(err.message || "Could not add to tracker.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <form onSubmit={handleGenerate} className="shrink-0 space-y-2">
        <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-ink-faint">Encounter generator</p>
        <label className="block">
          <span className="text-[8px] font-mono uppercase text-ink-faint">Party level</span>
          <input
            type="number"
            value={form.partyLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, partyLevel: e.target.value }))}
            className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
          />
        </label>
        <label className="block">
          <span className="text-[8px] font-mono uppercase text-ink-faint">Difficulty</span>
          <select
            value={form.difficulty}
            onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value }))}
            className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
          >
            {["Easy", "Medium", "Hard", "Deadly"].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[8px] font-mono uppercase text-ink-faint">Scene / setting</span>
          <textarea
            value={form.setting}
            onChange={(e) => setForm((prev) => ({ ...prev, setting: e.target.value }))}
            rows={2}
            placeholder="e.g. flooded mine, ambush at the bridge"
            className="mt-0.5 w-full resize-none rounded-sm border border-border bg-black px-2 py-1 text-xs sm:text-sm font-mono text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-1 rounded-sm border border-neon-magenta px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Generate
        </button>
      </form>
      {error && <p className="shrink-0 text-xs sm:text-sm font-mono text-danger">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/40 p-2">
        {summary ? (
          <p className="mb-2 text-xs sm:text-sm font-mono text-ink-muted">{summary}</p>
        ) : (
          <p className="text-xs sm:text-sm font-mono text-ink-faint">Generated enemies appear here with stats.</p>
        )}
        {enemies.length > 0 && (
          <ul className="space-y-1">
            {enemies.map((enemy, index) => (
              <li
                key={`${enemy.name}-${index}`}
                className="rounded-sm border border-border/60 px-2 py-1 text-xs sm:text-sm font-mono text-ink"
              >
                <span className="font-black text-starlight">
                  {enemy.name}
                  {enemy.count > 1 ? ` ×${enemy.count}` : ""}
                </span>
                {" · "}Init {enemy.initiative}
                {enemy.ac != null ? ` · AC ${enemy.ac}` : ""}
                {enemy.hp != null ? ` · HP ${enemy.hp}` : ""}
                {enemy.combat_actions?.length ? ` · ${enemy.combat_actions.length} actions` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      {enemies.length > 0 && (
        <button
          type="button"
          disabled={adding}
          onClick={handleAddToTracker}
          className="shrink-0 rounded-sm border border-starlight bg-starlight/10 px-2 py-1.5 text-xs sm:text-sm font-black uppercase text-starlight hover:bg-starlight/20 disabled:opacity-40"
        >
          {adding ? "Adding..." : added ? "Added to tracker" : "Add enemies to tracker"}
        </button>
      )}
    </div>
  );
}

export function DmNotesWidget({ tabs, closedTabs, activeTabId, onChange }) {
  return (
    <NotesPaneWidget
      tabs={tabs}
      closedTabs={closedTabs}
      activeTabId={activeTabId}
      onChange={onChange}
      tabsKey="dmNotesTabs"
      closedTabsKey="closedNotesTabs"
      activeKey="activeNotesTabId"
      hint="Close tabs to archive · reopen from archive icon · auto-saved"
    />
  );
}

export function DmGeneratorsWidget({
  campaignId,
  token,
  activeTab = "encounter",
  onTabChange,
  onEncounterGenerated,
}) {
  const tab = activeTab === "npc" ? "npc" : "encounter";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneTabs
        tabs={[
          { id: "encounter", label: "Encounter" },
          { id: "npc", label: "NPC" },
        ]}
        active={tab}
        onChange={onTabChange}
      />
      <div className="min-h-0 flex-1 pt-2">
        {tab === "encounter" ? (
          <EncounterGeneratorPanel
            campaignId={campaignId}
            token={token}
            onEncounterGenerated={onEncounterGenerated}
          />
        ) : (
          <GeneratorPanel
            token={token}
            title="NPC generator"
            fields={[
              { key: "role", label: "Role / hook", type: "text", placeholder: "nervous informant at the docks" },
              {
                key: "tone",
                label: "Tone",
                type: "select",
                options: ["Serious", "Comedic", "Mysterious", "Heroic", "Grim"],
                default: "Mysterious",
              },
              {
                key: "detail",
                label: "Extra detail",
                type: "textarea",
                placeholder: "Optional: race, faction, secret",
                rows: 2,
              },
            ]}
            buildPrompt={(form) =>
              `You are a D&D 5e DM assistant. Create an NPC. Role: ${form.role || "tavern patron"}. Tone: ${form.tone}. Extra: ${form.detail || "none"}. Format in markdown: ## Name, ## Look & Voice, ## Personality, ## Secret, ## Combat (AC, HP, one attack if relevant), ## Dialogue Hook (one quoted line). Keep it concise.`
            }
          />
        )}
      </div>
    </div>
  );
}

export function DmToolboxWidget({ campaignId, token }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto [&>div]:border-border [&>div]:bg-void-deep/40">
      <DiceRoller campaignId={campaignId} token={token} rollerName="DM" />
    </div>
  );
}
