import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Copy,
  Loader2,
  MessageSquare,
  Send,
  Swords,
  Users,
  Wand2,
} from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useChatStream } from "../../hooks/useChatStream";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { DiceRoller } from "../DiceRoller";

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
          className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider ${
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
        <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint">{title}</p>
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-[8px] font-mono uppercase text-ink-faint">{field.label}</span>
            {field.type === "select" ? (
              <select
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-[10px] font-mono text-ink"
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
                className="mt-0.5 w-full resize-none rounded-sm border border-border bg-black px-2 py-1 text-[10px] font-mono text-ink"
              />
            ) : (
              <input
                type={field.type || "text"}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="mt-0.5 w-full rounded-sm border border-border bg-black px-2 py-1 text-[10px] font-mono text-ink"
              />
            )}
          </label>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-1 rounded-sm border border-neon-magenta px-2 py-1.5 text-[10px] font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
          Generate
        </button>
      </form>
      {error && <p className="shrink-0 text-[9px] font-mono text-danger">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border/60 bg-void-deep/40 p-2">
        {result ? (
          <div className="text-[10px] text-ink-muted [&_p]:mb-2">
            <MarkdownRenderer content={result} />
          </div>
        ) : (
          <p className="text-[9px] font-mono text-ink-faint">Output appears here — copy into your notes or tracker.</p>
        )}
      </div>
      {result && (
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 flex items-center justify-center gap-1 rounded-sm border border-border px-2 py-1 text-[9px] font-black uppercase text-ink-muted hover:text-starlight"
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
    return <p className="text-[10px] font-mono text-ink-faint">Starting rules assistant...</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[9px] font-black uppercase text-ink-faint">
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
          <p className="text-[9px] font-mono text-ink-faint">
            Ask rules questions, encounter balance, or spell clarifications.
          </p>
        )}
        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`rounded-sm px-2 py-1 text-[10px] ${
              msg.role === "user"
                ? "ml-4 border border-neon-cyan/30 bg-neon-cyan/5 text-ink"
                : "mr-2 border border-border text-ink-muted"
            }`}
          >
            {msg.role === "assistant" ? <MarkdownRenderer content={msg.content} /> : msg.content}
          </div>
        ))}
        {streamedReply && (
          <div className="mr-2 rounded-sm border border-border px-2 py-1 text-[10px] text-ink-muted">
            <MarkdownRenderer content={streamedReply} />
          </div>
        )}
      </div>
      <form onSubmit={handleSend} className="flex shrink-0 gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the rules..."
          className="min-w-0 flex-1 rounded-sm border border-border bg-black px-2 py-1 text-[10px] font-mono text-ink"
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

export function DmGeneratorsWidget({ token, activeTab = "encounter", onTabChange }) {
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
          <GeneratorPanel
            token={token}
            title="Encounter generator"
            fields={[
              { key: "partyLevel", label: "Party level", type: "number", default: "5" },
              {
                key: "difficulty",
                label: "Difficulty",
                type: "select",
                options: ["Easy", "Medium", "Hard", "Deadly"],
                default: "Medium",
              },
              {
                key: "setting",
                label: "Scene / setting",
                type: "textarea",
                placeholder: "e.g. flooded mine, 4 PCs, short rest just taken",
                rows: 3,
              },
            ]}
            buildPrompt={(form) =>
              `You are a D&D 5e DM assistant. Generate a combat encounter for a party of level ${form.partyLevel} characters. Difficulty: ${form.difficulty}. Setting: ${form.setting || "generic fantasy"}. Format in markdown with sections: ## Overview, ## Terrain & Hazards, ## Enemies (name, count, brief stat notes), ## Tactics, ## Rewards. Keep it table-ready and concise.`
            }
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

export function DmToolboxWidget({ campaignId, token, activeTab = "dice", onTabChange }) {
  const tab = ["dice", "session", "party"].includes(activeTab) ? activeTab : "dice";
  const [roster, setRoster] = useState([]);
  const [encounter, setEncounter] = useState({ round: 1, combatants: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!token || !campaignId) return;
    try {
      const [rosterRes, encounterRes] = await Promise.all([
        apiFetch(`/campaigns/${campaignId}/roster`, { token }),
        apiFetch(`/campaigns/${campaignId}/encounter`, { token }),
      ]);
      if (rosterRes.ok) {
        const data = await rosterRes.json();
        setRoster(data.members || []);
      }
      if (encounterRes.ok) {
        setEncounter(await encounterRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  }, [token, campaignId]);

  useEffect(() => {
    if (tab === "party" || tab === "session") loadData();
  }, [tab, loadData]);

  const runAction = async (path) => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(path, { token, method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Action failed");
      }
      setEncounter(await res.json());
      await loadData();
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneTabs
        tabs={[
          { id: "dice", label: "Dice" },
          { id: "session", label: "Combat" },
          { id: "party", label: "Party" },
        ]}
        active={tab}
        onChange={onTabChange}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        {tab === "dice" && (
          <div className="[&>div]:border-border [&>div]:bg-void-deep/40">
            <DiceRoller />
          </div>
        )}
        {tab === "session" && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono text-ink-faint">
              Round <span className="font-black text-neon-cyan">{encounter.round}</span>
              {" · "}
              {encounter.combatants?.length || 0} combatants
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(`/campaigns/${campaignId}/encounter/next-turn`)}
                className="flex items-center gap-1 rounded-sm border border-starlight px-2 py-1 text-[9px] font-black uppercase text-starlight hover:bg-starlight/10 disabled:opacity-40"
              >
                <ChevronRight className="h-3 w-3" />
                Next turn
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(`/campaigns/${campaignId}/encounter/add-roster`)}
                className="rounded-sm border border-neon-cyan px-2 py-1 text-[9px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
              >
                Add all PCs
              </button>
              <Link
                to={`/initiative/${campaignId}`}
                className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-[9px] font-black uppercase text-ink-muted hover:text-starlight"
              >
                <Swords className="h-3 w-3" />
                Full tracker
              </Link>
            </div>
            {error && <p className="text-[9px] font-mono text-danger">{error}</p>}
          </div>
        )}
        {tab === "party" && (
          <div className="space-y-1">
            {roster.length === 0 ? (
              <p className="text-[9px] font-mono text-ink-faint">No players have joined yet.</p>
            ) : (
              roster.map((member) => (
                <div
                  key={member.member_id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border/60 px-2 py-1"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-black uppercase text-starlight">
                      {member.character_name}
                    </p>
                    <p className="truncate text-[9px] font-mono text-ink-faint">
                      {member.username}
                      {member.class_name ? ` · ${member.class_name}` : ""}
                      {member.hp != null && member.max_hp != null
                        ? ` · HP ${member.hp}/${member.max_hp}`
                        : ""}
                    </p>
                  </div>
                  <Users className="h-3 w-3 shrink-0 text-ink-faint" />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
