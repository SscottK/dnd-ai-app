import React, { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { useChatStream } from "./hooks/useChatStream";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { 
  LogOut, 
  Plus, 
  Send, 
  MessageSquare, 
  BookOpen, 
  Wand2, 
  ShieldAlert,
  Pencil,
  Check,
  X
} from "lucide-react";

export default function App() {
  const { token, isAuthenticated, login, logout, isValidating } = useAuth();
  const { streamMessage, isStreaming } = useChatStream(token);

  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [streamedReply, setStreamedReply] = useState("");

  // Title Editing States
  const [editingConvId, setEditingConvId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState("");

  // Load sidebar conversation registry list
  useEffect(() => {
    if (isAuthenticated && token) {
      fetch("/api/v1/conversations", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setConversations(data.conversations || []))
        .catch((e) => console.error("Error loading threads:", e));
    }
  }, [isAuthenticated, token]);

  // Load chat logs when a conversation is chosen
  useEffect(() => {
    if (activeConvId && token) {
      fetch(`/api/v1/conversations/${activeConvId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setMessages(data.messages || []);
          setStreamedReply("");
        })
        .catch((e) => console.error("Error loading chat metadata:", e));
    }
  }, [activeConvId, token]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    const success = await login(passwordInput);
    if (!success) {
      setLoginError("Invalid application key phrase.");
    }
  };

  const handleCreateConversation = async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/v1/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          title: `D&D Log: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
        }),
      });
      if (response.ok) {
        const newThread = await response.json();
        setConversations((prev) => [newThread, ...prev]);
        setActiveConvId(newThread.id);
      }
    } catch (e) {
      console.error("Could not instantiate thread", e);
    }
  };

  // Toggle inline editing state
  const handleStartRename = (e, id, currentTitle) => {
    e.stopPropagation(); // Stops the thread from loading in the viewport
    setEditingConvId(id);
    setEditTitleVal(currentTitle);
  };

  // Send PATCH request matching your secure route
  const handleSaveRename = async (e, id) => {
    e.stopPropagation();
    if (!editTitleVal.trim() || !token) return;

    try {
      const response = await fetch(`/api/v1/conversations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitleVal.trim() }),
      });

      if (response.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: editTitleVal.trim() } : c))
        );
        setEditingConvId(null);
      } else {
        console.error("Failed to patch title on server.");
      }
    } catch (err) {
      console.error("Error patching title:", err);
    }
  };

  const handleCancelRename = (e) => {
    e.stopPropagation();
    setEditingConvId(null);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputVal.trim() || !activeConvId || isStreaming) return;

    const userMsgText = inputVal.trim();
    setInputVal("");

    const newUserMessage = { role: "user", content: userMsgText };
    setMessages((prev) => [...prev, newUserMessage]);
    setStreamedReply("");

    await streamMessage(activeConvId, userMsgText, {
      onChunk: (chunk) => {
        setStreamedReply((prev) => prev + chunk);
      },
      onDone: (finalMessage) => {
        setMessages((prev) => [...prev, finalMessage]);
        setStreamedReply("");
      },
      onError: (err) => {
        console.error("Stream run-error:", err);
        setStreamedReply((prev) => prev + "\n*(Transmission lost - Stream Error)*");
      },
    });
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <Wand2 className="w-10 h-10 animate-spin text-amber-500 mx-auto mb-4" />
          <span className="tracking-widest text-xs font-semibold text-slate-400 uppercase">Opening Spellbook...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b13] px-4">
        <form onSubmit={handleLoginSubmit} className="w-full max-w-md p-8 rounded-xl border border-amber-900/40 bg-slate-900/90 shadow-2xl backdrop-blur-sm">
          <div className="text-center mb-6">
            <BookOpen className="w-12 h-12 text-amber-500 mx-auto mb-2" />
            <h1 className="text-3xl font-extrabold text-amber-500 tracking-wider">GEMINI PROXY</h1>
            <p className="text-xs text-slate-455 uppercase tracking-widest mt-1">D&amp;D 5.5e Compendium Game Room</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Campaign Access Password</label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter campaign entry key..."
                className="w-full px-4 py-3 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-red-500 text-xs mt-1">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-lg transition-colors shadow-lg shadow-amber-900/20 uppercase text-xs tracking-wider"
            >
              Consult the Archive
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar Panel */}
      <aside className="w-80 border-r border-slate-800/80 bg-slate-900/95 flex flex-col justify-between">
        <div>
          <div className="p-4 border-b border-slate-800/85 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-500" />
              <h2 className="font-extrabold text-sm text-slate-200 tracking-wider">D&amp;D JOURNAL</h2>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-red-400 p-1 rounded transition" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3">
            <button
              onClick={handleCreateConversation}
              className="w-full py-2 bg-slate-800 hover:bg-slate-755 text-amber-400 border border-amber-955/40 font-semibold rounded-lg text-xs flex items-center justify-center gap-2 uppercase tracking-wide transition"
            >
              <Plus className="w-4 h-4" /> New Log Entry
            </button>
          </div>
          <nav className="px-2 space-y-1 overflow-y-auto max-h-[75vh]">
            {conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => setActiveConvId(c.id)}
                className={`group w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition cursor-pointer border ${
                  activeConvId === c.id
                    ? "bg-amber-900/20 text-amber-400 border-amber-500/20"
                    : "text-slate-450 border-transparent hover:bg-slate-850"
                }`}
              >
                <div className="flex items-center gap-3 truncate w-full pr-2">
                  <MessageSquare className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  {editingConvId === c.id ? (
                    <input
                      type="text"
                      value={editTitleVal}
                      onChange={(e) => setEditTitleVal(e.target.value)}
                      onClick={(e) => e.stopPropagation()} 
                      className="w-full bg-slate-950 text-slate-100 text-xs px-2 py-1 rounded border border-amber-500 outline-none focus:ring-1 focus:ring-amber-500"
                      autoFocus
                    />
                  ) : (
                    <span className="truncate text-slate-300">{c.title}</span>
                  )}
                </div>

                {/* Edit Controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingConvId === c.id ? (
                    <>
                      <button
                        onClick={(e) => handleSaveRename(e, c.id)}
                        className="text-emerald-500 hover:text-emerald-450 p-1 rounded"
                        title="Save changes"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleCancelRename}
                        className="text-red-500 hover:text-red-450 p-1 rounded"
                        title="Cancel"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => handleStartRename(e, c.id, c.title)}
                      className="text-slate-400 hover:text-amber-400 p-1 rounded transition"
                      title="Rename thread"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-850 text-[10px] text-slate-500 tracking-wider text-center uppercase font-mono">
          T3 Gemini Proxy Server Connected
        </div>
      </aside>

      {/* Main Console Canvas */}
      <main className="flex-1 flex flex-col justify-between bg-zinc-950">
        {activeConvId ? (
          <>
            {/* Conversation Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-2xl rounded-xl p-4 leading-relaxed text-sm ${
                      m.role === "user"
                        ? "bg-amber-600 text-slate-950 font-semibold"
                        : "bg-slate-900 border border-slate-800 text-slate-200"
                    }`}
                  >
                    {m.role === "user" ? m.content : <MarkdownRenderer content={m.content} />}
                  </div>
                </div>
              ))}
              {streamedReply && (
                <div className="flex justify-start">
                  <div className="max-w-2xl rounded-xl p-4 bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed text-sm">
                    <MarkdownRenderer content={streamedReply} />
                    <span className="inline-block w-2.5 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
                  </div>
                </div>
              )}
            </div>

            {/* Input Submission Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Ask about properties, items, rules or general lore..."
                  disabled={isStreaming}
                  className="flex-1 px-4 py-3 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !inputVal.trim()}
                  className="px-5 bg-amber-500 text-slate-950 font-bold rounded-lg hover:bg-amber-400 disabled:opacity-40 transition-colors flex items-center gap-1 text-sm uppercase tracking-wider"
                >
                  <Send className="w-4 h-4" /> Send
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <BookOpen className="w-16 h-16 text-slate-800 mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-slate-400 tracking-wider uppercase">Vault Unlocked</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-sans">
              Open an archived session or create a new entry inside the left registry tab to invoke Gemini directives.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}