import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useChatStream } from "../hooks/useChatStream";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { apiFetch } from "../lib/api";
import {
  Plus,
  Send,
  MessageSquare,
  BookOpen,
  Pencil,
  Check,
  X,
  Trash2,
  Pin,
  PinOff,
} from "lucide-react";

export function ChatPage() {
  const { token } = useAuth();
  const { streamMessage, isStreaming } = useChatStream(token);

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [editingConvId, setEditingConvId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState("");
  const [pinnedConvIds, setPinnedConvIds] = useState(() => {
    const saved = localStorage.getItem("pinned_conversations");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("pinned_conversations", JSON.stringify(pinnedConvIds));
  }, [pinnedConvIds]);

  useEffect(() => {
    if (token) {
      apiFetch("/conversations", { token })
        .then((res) => res.json())
        .then((data) => setConversations(data.conversations || []))
        .catch((e) => console.error("Error loading threads:", e));
    }
  }, [token]);

  useEffect(() => {
    if (activeConvId && token) {
      apiFetch(`/conversations/${activeConvId}`, { token })
        .then((res) => res.json())
        .then((data) => {
          setMessages(data.messages || []);
          setStreamedReply("");
        })
        .catch((e) => console.error("Error loading chat metadata:", e));
    }
  }, [activeConvId, token]);

  const handleCreateConversation = async () => {
    if (!token) return;
    try {
      const response = await apiFetch("/conversations", {
        token,
        method: "POST",
        body: {
          title: `New Thread: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        },
      });
      if (response.ok) {
        const newThread = await response.json();
        setConversations((prev) => [newThread, ...prev]);
        setActiveConvId(newThread.id);
      }
    } catch (e) {
      console.error("Could not create thread", e);
    }
  };

  const handleStartRename = (e, id, currentTitle) => {
    e.stopPropagation();
    setEditingConvId(id);
    setEditTitleVal(currentTitle);
  };

  const handleSaveRename = async (e, id) => {
    e.stopPropagation();
    if (!editTitleVal.trim() || !token) return;

    try {
      const response = await apiFetch(`/conversations/${id}`, {
        token,
        method: "PATCH",
        body: { title: editTitleVal.trim() },
      });

      if (response.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: editTitleVal.trim() } : c))
        );
        setEditingConvId(null);
      }
    } catch (err) {
      console.error("Error patching title:", err);
    }
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setEditingConvId(null);
  };

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this thread permanently?")) return;

    try {
      const response = await apiFetch(`/conversations/${id}`, {
        token,
        method: "DELETE",
      });

      if (response.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setPinnedConvIds((prev) => prev.filter((pinId) => pinId !== id));
        if (activeConvId === id) {
          setActiveConvId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Error deleting conversation:", err);
    }
  };

  const handleTogglePinThread = (e, id) => {
    e.stopPropagation();
    setPinnedConvIds((prev) =>
      prev.includes(id) ? prev.filter((pinId) => pinId !== id) : [...prev, id]
    );
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !activeConvId || isStreaming) return;

    const userMsgText = inputVal.trim();
    setInputVal("");

    const newUserMessage = { role: "user", content: userMsgText, conversation_id: activeConvId };
    setMessages((prev) => [...prev, newUserMessage]);
    setStreamedReply("");

    await streamMessage(activeConvId, userMsgText, {
      onChunk: (chunk) => setStreamedReply((prev) => prev + chunk),
      onDone: (finalMessage) => {
        setMessages((prev) => [...prev, finalMessage]);
        setStreamedReply("");
      },
      onError: (err) => {
        console.error("Stream error:", err);
        setStreamedReply((prev) => prev + "\n*(Connection dropped — try again)*");
      },
    });
  };

  const pinnedThreads = conversations.filter((c) => pinnedConvIds.includes(c.id));
  const generalThreads = conversations.filter((c) => !pinnedConvIds.includes(c.id));

  const renderConversationItem = (c) => {
    const isPinned = pinnedConvIds.includes(c.id);
    const isActive = activeConvId === c.id;
    return (
      <div
        key={c.id}
        onClick={() => setActiveConvId(c.id)}
        className={`group w-full flex items-center justify-between px-3 py-2.5 text-xs transition cursor-pointer border-l-4 font-mono uppercase tracking-tight ${
          isActive
            ? "bg-neon-magenta/10 text-starlight border-neon-magenta"
            : "text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/80"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate w-full pr-2">
          <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-neon-magenta" : "text-zinc-600"}`} />
          {editingConvId === c.id ? (
            <input
              type="text"
              value={editTitleVal}
              onChange={(e) => setEditTitleVal(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-black text-neon-cyan text-xs px-2 py-0.5 border-2 border-neon-cyan outline-none"
              autoFocus
            />
          ) : (
            <span className="truncate font-bold tracking-wide">{c.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {editingConvId === c.id ? (
            <>
              <button onClick={(e) => handleSaveRename(e, c.id)} className="text-emerald-400 p-0.5">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleCancelRename} className="text-[#ff0055] p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={(e) => handleTogglePinThread(e, c.id)} className="p-0.5 text-zinc-500 hover:text-neon-magenta">
                {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
              <button onClick={(e) => handleStartRename(e, c.id, c.title)} className="text-zinc-500 hover:text-neon-cyan p-0.5">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={(e) => handleDeleteConversation(e, c.id)} className="text-zinc-500 hover:text-danger p-0.5">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-black text-neon-cyan overflow-hidden">
      <aside className="w-72 border-r-2 border-neon-magenta/50 bg-zinc-950 flex flex-col">
        <div className="p-3 border-b border-neon-magenta/30">
          <button
            onClick={handleCreateConversation}
            className="w-full py-2 bg-black hover:bg-neon-magenta text-neon-magenta hover:text-black border-2 border-neon-magenta font-black text-xs flex items-center justify-center gap-2 uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" /> New Thread
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-2 space-y-3">
          {pinnedThreads.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-3 text-[10px] font-black text-starlight uppercase tracking-widest">Pinned</div>
              {pinnedThreads.map(renderConversationItem)}
            </div>
          )}
          <div className="space-y-0.5">
            <div className="px-3 text-[10px] font-black text-neon-cyan uppercase tracking-widest">Threads</div>
            {generalThreads.length > 0 ? (
              generalThreads.map(renderConversationItem)
            ) : (
              pinnedThreads.length === 0 && (
                <div className="text-center py-6 text-zinc-700 text-xs font-mono italic">No threads yet</div>
              )
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        {activeConvId ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-2xl p-4 text-sm border-2 font-mono ${
                      m.role === "user"
                        ? "bg-neon-cyan text-black border-white"
                        : "bg-zinc-950 text-white border-neon-magenta"
                    }`}
                  >
                    <div className={`text-[9px] font-black tracking-widest mb-1.5 uppercase ${m.role === "user" ? "text-zinc-800" : "text-starlight"}`}>
                      {m.role === "user" ? "You" : "Rule Wizard"}
                    </div>
                    {m.role === "user" ? m.content : <MarkdownRenderer content={m.content} />}
                  </div>
                </div>
              ))}
              {streamedReply && (
                <div className="flex justify-start">
                  <div className="max-w-2xl p-4 bg-zinc-950 text-white border-2 border-starlight text-sm font-mono">
                    <MarkdownRenderer content={streamedReply} />
                    <span className="inline-block w-2.5 h-4 ml-1 bg-neon-magenta animate-ping align-middle" />
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t-2 border-neon-magenta bg-black/95">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto font-mono">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Ask about a rule, spell, or monster..."
                  disabled={isStreaming}
                  className="flex-1 px-4 py-3 border-2 border-neon-cyan bg-zinc-950 text-starlight focus:outline-none focus:border-starlight text-sm"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !inputVal.trim()}
                  className="px-6 bg-neon-magenta text-black font-black border-2 border-black hover:bg-starlight disabled:opacity-40 flex items-center gap-2 text-xs uppercase"
                >
                  <Send className="w-4 h-4" /> Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-void">
            <BookOpen className="w-16 h-16 text-neon-magenta mb-4 animate-pulse" />
            <h3 className="text-xl font-black text-starlight uppercase tracking-wider">Rule Wizard</h3>
            <p className="text-xs text-neon-cyan mt-2 max-w-xs font-mono">
              Select a thread or create a new one to look up D&amp;D 5.5e rules.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
