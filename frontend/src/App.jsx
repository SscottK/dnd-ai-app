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
  X,
  Trash2,
  Pin,
  PinOff
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api/v1` 
  : "/api/v1";

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

  // Sidebar States
  const [editingConvId, setEditingConvId] = useState(null);
  const [editTitleVal, setEditTitleVal] = useState("");

  // Pinned Conversation IDs (Persisted in LocalStorage)
  const [pinnedConvIds, setPinnedConvIds] = useState(() => {
    const saved = localStorage.getItem("pinned_conversations");
    return saved ? JSON.parse(saved) : [];
  });

  // Keep Pinned Conversation IDs in sync with local storage
  useEffect(() => {
    localStorage.setItem("pinned_conversations", JSON.stringify(pinnedConvIds));
  }, [pinnedConvIds]);

  // Load sidebar conversation registry list
  useEffect(() => {
    if (isAuthenticated && token) {
      fetch(`${API_BASE_URL}/conversations`, {
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
      fetch(`${API_BASE_URL}/conversations/${activeConvId}`, {
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
      setLoginError("ACCESS DENIED. WRONG FREQUENCY.");
    }
  };

  const handleCreateConversation = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE_URL}/conversations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          title: `INSERT TAPE: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
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

  const handleStartRename = (e, id, currentTitle) => {
    e.stopPropagation();
    setEditingConvId(id);
    setEditTitleVal(currentTitle);
  };

  const handleSaveRename = async (e, id) => {
    e.stopPropagation();
    if (!editTitleVal.trim() || !token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${id}`, {
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

  const handleDeleteConversation = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("ARE YOU SURE YOU WANT TO WIPE THIS TAPE? DATA WILL BE LOST PERMANENTLY.")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/conversations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        setPinnedConvIds((prev) => prev.filter((pinId) => pinId !== id));

        if (activeConvId === id) {
          setActiveConvId(null);
          setMessages([]);
        }
      } else {
        console.error("Failed to delete conversation on server.");
      }
    } catch (err) {
      console.error("Error calling deleting route:", err);
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
      onChunk: (chunk) => {
        setStreamedReply((prev) => prev + chunk);
      },
      onDone: (finalMessage) => {
        setMessages((prev) => [...prev, finalMessage]);
        setStreamedReply("");
      },
      onError: (err) => {
        console.error("Stream run-error:", err);
        setStreamedReply((prev) => prev + "\n*(LINE BUSY - SIGNAL CARRIER DROPPED)*");
      },
    });
  };

  const pinnedThreads = conversations.filter((c) => pinnedConvIds.includes(c.id));
  const generalThreads = conversations.filter((c) => !pinnedConvIds.includes(c.id));

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center animate-pulse">
          <Wand2 className="w-12 h-12 animate-spin text-[#ff007f] mx-auto mb-4 drop-shadow-[0_0_10px_#ff007f]" />
          <span className="tracking-[0.3em] text-xs font-black text-[#00ffff] uppercase drop-shadow-[0_0_5px_#00ffff]">
            REWINDING VHS CASSETTE...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05000a] px-4">
        <form onSubmit={handleLoginSubmit} className="w-full max-w-md p-8 rounded-none border-4 border-[#ff007f] bg-black shadow-[0_0_30px_rgba(255,0,127,0.3)] backdrop-blur-sm">
          <div className="text-center mb-6">
            <BookOpen className="w-14 h-14 text-[#00ffff] mx-auto mb-2 drop-shadow-[0_0_8px_#00ffff]" />
            <h1 className="text-4xl font-black text-[#fffb00] tracking-tighter italic uppercase drop-shadow-[0_2px_0px_#ff007f]">
              HOTLINE PROXY
            </h1>
            <p className="text-[10px] text-[#00ffff] uppercase tracking-[0.2em] font-extrabold mt-1">
              D&amp;D 5.5E COMPENDIUM // DIAL IN NOW
            </p>
          </div>
          <div className="space-y-4 font-mono">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-[#ff007f] mb-2 font-sans">
                ENTER SIGNAL PASSCODE
              </label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Connection keyphrase..."
                className="w-full px-4 py-3 rounded-none border-2 border-[#00ffff] bg-black text-[#00ffff] placeholder-[#004e4e] focus:outline-none focus:border-[#fffb00] focus:ring-1 focus:ring-[#fffb00] text-sm"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-[#ff003c] text-xs mt-1 border-l-2 border-[#ff003c] pl-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold tracking-tight">{loginError}</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3.5 bg-[#ff007f] hover:bg-[#fffb00] text-black font-black transition-colors duration-150 uppercase text-xs tracking-[0.15em] border-2 border-black hover:border-black active:translate-y-1"
            >
              ANSWER PHONE
            </button>
          </div>
        </form>
      </div>
    );
  }

  const renderConversationItem = (c) => {
    const isPinned = pinnedConvIds.includes(c.id);
    const isActive = activeConvId === c.id;
    return (
      <div
        key={c.id}
        onClick={() => setActiveConvId(c.id)}
        className={`group w-full flex items-center justify-between px-3 py-2.5 rounded-none text-xs transition cursor-pointer border-l-4 font-mono uppercase tracking-tight ${
          isActive
            ? "bg-[#ff007f]/10 text-[#fffb00] border-[#ff007f] bg-gradient-to-r from-[#ff007f]/20 to-transparent"
            : "text-zinc-400 border-transparent hover:text-white hover:bg-zinc-900/80"
        }`}
      >
        <div className="flex items-center gap-2.5 truncate w-full pr-2">
          <MessageSquare className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#ff007f]" : "text-zinc-600"}`} />
          {editingConvId === c.id ? (
            <input
              type="text"
              value={editTitleVal}
              onChange={(e) => setEditTitleVal(e.target.value)}
              onClick={(e) => e.stopPropagation()} 
              className="w-full bg-black text-[#00ffff] text-xs px-2 py-0.5 rounded-none border-2 border-[#00ffff] outline-none"
              autoFocus
            />
          ) : (
            <span className="truncate font-bold tracking-wide">{c.title}</span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {editingConvId === c.id ? (
            <>
              <button
                onClick={(e) => handleSaveRename(e, c.id)}
                className="text-emerald-400 hover:text-emerald-300 p-0.5"
                title="SAVE TAPE TITLE"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCancelRename}
                className="text-[#ff0055] hover:text-[#ff3377] p-0.5"
                title="CANCEL"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => handleTogglePinThread(e, c.id)}
                className={`p-0.5 rounded transition ${isPinned ? "text-[#fffb00] hover:text-[#00ffff]" : "text-zinc-500 hover:text-[#ff007f]"}`}
                title={isPinned ? "UNPIN TAPE" : "PIN TAPE"}
              >
                {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={(e) => handleStartRename(e, c.id, c.title)}
                className="text-zinc-500 hover:text-[#00ffff] p-0.5"
                title="RENAME TAPE"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => handleDeleteConversation(e, c.id)}
                className="text-zinc-500 hover:text-[#ff003c] p-0.5 ml-0.5"
                title="DESTROY TAPE"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#030005] text-[#00ffff] overflow-hidden font-sans select-none">
      {/* Laser Neon Sidebar */}
      <aside className="w-80 border-r-4 border-[#ff007f] bg-black flex flex-col justify-between">
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Header Panel */}
          <div className="p-4 border-b-2 border-[#ff007f]/50 flex items-center justify-between flex-shrink-0 bg-zinc-950">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#00ffff] drop-shadow-[0_0_3px_#00ffff]" />
              <h2 className="font-black text-sm text-[#ff007f] tracking-widest italic uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                TAPE REGISTRY
              </h2>
            </div>
            <button onClick={logout} className="text-zinc-500 hover:text-[#ff003c] p-1 transition" title="DIAL OUT">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          
          {/* Action Trigger */}
          <div className="p-3 flex-shrink-0">
            <button
              onClick={handleCreateConversation}
              className="w-full py-2.5 bg-black hover:bg-[#ff007f] text-[#ff007f] hover:text-black border-2 border-[#ff007f] font-black rounded-none text-xs flex items-center justify-center gap-2 uppercase tracking-widest transition duration-150 active:translate-y-0.5 shadow-[inset_0_0_4px_rgba(255,0,127,0.2)]"
            >
              <Plus className="w-4 h-4" /> RECORD NEW TAPE
            </button>
          </div>

          {/* Cassette Lists */}
          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            
            {/* Pinned Tapes Section */}
            {pinnedThreads.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 px-3 py-1 text-[#fffb00] animate-pulse">
                  <Pin className="w-3 h-3 fill-[#fffb00] drop-shadow-[0_0_3px_#fffb00]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] font-mono">
                    PRIORITY FREQUENCIES
                  </span>
                </div>
                <div className="space-y-0.5">
                  {pinnedThreads.map(renderConversationItem)}
                </div>
                <div className="border-b-2 border-dashed border-[#ff007f]/30 pt-2 mx-2" />
              </div>
            )}

            {/* Standard Log Tapes */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 px-3 py-1 text-[#00ffff]">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] font-mono">
                  CHRONO DIRECTIVES
                </span>
              </div>
              <div className="space-y-0.5">
                {generalThreads.length > 0 ? (
                  generalThreads.map(renderConversationItem)
                ) : (
                  pinnedThreads.length === 0 && (
                    <div className="text-center py-8 text-zinc-700 text-xs font-mono lowercase italic">
                      [ tapes tray empty ]
                    </div>
                  )
                )}
              </div>
            </div>

          </div>
        </div>
        <div className="p-4 border-t-2 border-[#ff007f]/50 text-[9px] text-[#ff007f] font-black tracking-[0.2em] text-center uppercase font-mono bg-zinc-950 flex-shrink-0">
          STATION CONNECTED: 55-900Z
        </div>
      </aside>

      {/* Retro Arcade Main Frame */}
      <main className="flex-1 flex flex-col justify-between bg-black relative">
        {activeConvId ? (
          <>
            {/* Thread Text logs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-2xl rounded-none p-4 leading-relaxed text-sm border-2 font-mono ${
                      m.role === "user"
                        ? "bg-[#00ffff] text-black border-white font-extrabold shadow-[2px_2px_0px_rgba(255,255,255,1)]"
                        : "bg-zinc-950 text-white border-[#ff007f] shadow-[3px_3px_0px_#ff007f]"
                    }`}
                  >
                    <div className={`text-[9px] font-black tracking-widest mb-1.5 uppercase ${m.role === "user" ? "text-zinc-800" : "text-[#fffb00]"}`}>
                      {m.role === "user" ? "YOUR REQUEST" : "SYSTEM REPLY"}
                    </div>
                    {m.role === "user" ? m.content : <MarkdownRenderer content={m.content} />}
                  </div>
                </div>
              ))}
              {streamedReply && (
                <div className="flex justify-start">
                  <div className="max-w-2xl rounded-none p-4 bg-zinc-950 text-white border-2 border-[#fffb00] shadow-[3px_3px_0px_#fffb00] leading-relaxed text-sm font-mono">
                    <div className="text-[9px] text-[#fffb00] font-black tracking-widest mb-1.5 uppercase">
                      INCOMING FREQUENCY
                    </div>
                    <MarkdownRenderer content={streamedReply} />
                    <span className="inline-block w-2.5 h-4 ml-1 bg-[#ff007f] animate-ping align-middle" />
                  </div>
                </div>
              )}
            </div>

            {/* Input Footer Console */}
            <div className="p-4 border-t-4 border-[#ff007f] bg-black/95">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto font-mono">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="TYPE TO DIAL SIGNAL..."
                  disabled={isStreaming}
                  className="flex-1 px-4 py-3 rounded-none border-2 border-[#00ffff] bg-zinc-950 text-[#fffb00] placeholder-zinc-750 focus:outline-none focus:border-[#fffb00] text-sm font-bold uppercase"
                />
                <button
                  type="submit"
                  disabled={isStreaming || !inputVal.trim()}
                  className="px-6 bg-[#ff007f] text-black font-black border-2 border-black hover:bg-[#fffb00] disabled:opacity-40 transition-all duration-150 flex items-center gap-2 text-xs tracking-widest uppercase"
                >
                  <Send className="w-4 h-4" /> DIAL
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#040008]">
            <BookOpen className="w-20 h-20 text-[#ff007f] mb-4 animate-pulse drop-shadow-[0_0_15px_#ff007f]" />
            <h3 className="text-2xl font-black text-[#fffb00] tracking-wider italic uppercase drop-shadow-[0_2px_0px_black]">
              ANSWER THE LINE
            </h3>
            <p className="text-xs text-[#00ffff] mt-2 max-w-xs font-mono uppercase tracking-widest leading-relaxed">
              SELECT AND TAP A TELEPHONE UNIT ON THE LEFT REGISTER TO INITIATE INTEL COMPENDIUM SECTOR.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}