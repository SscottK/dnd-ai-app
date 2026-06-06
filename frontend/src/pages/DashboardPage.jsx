import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Plus, Scroll, UserPlus, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";

export function DashboardPage() {
  const { token, user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newCampaignName, setNewCampaignName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showCharacterForm, setShowCharacterForm] = useState(false);
  const [characterForm, setCharacterForm] = useState({
    name: "",
    class_name: "",
    level: "1",
    ac: "",
    hp: "",
    max_hp: "",
    dnd_beyond_url: "",
  });

  const loadDashboard = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [campaignRes, characterRes] = await Promise.all([
        apiFetch("/campaigns", { token }),
        apiFetch("/characters", { token }),
      ]);

      if (!campaignRes.ok || !characterRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const campaignData = await campaignRes.json();
      const characterData = await characterRes.json();
      setCampaigns(campaignData.campaigns || []);
      setCharacters(characterData.characters || []);
    } catch (err) {
      console.error(err);
      setError("Could not load dashboard. Try refreshing.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [token]);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaignName.trim() || !token) return;

    const response = await apiFetch("/campaigns", {
      token,
      method: "POST",
      body: { name: newCampaignName.trim() },
    });

    if (!response.ok) {
      setError("Failed to create campaign.");
      return;
    }

    setNewCampaignName("");
    await loadDashboard();
  };

  const handleJoinCampaign = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim() || !token) return;

    const response = await apiFetch("/campaigns/join", {
      token,
      method: "POST",
      body: { invite_code: inviteCode.trim().toUpperCase() },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setError(err.detail || "Invalid invite code.");
      return;
    }

    setInviteCode("");
    setError("");
    await loadDashboard();
  };

  const handleCreateCharacter = async (e) => {
    e.preventDefault();
    if (!characterForm.name.trim() || !token) return;

    const body = {
      name: characterForm.name.trim(),
      class_name: characterForm.class_name.trim() || null,
      level: characterForm.level ? parseInt(characterForm.level, 10) : 1,
      ac: characterForm.ac ? parseInt(characterForm.ac, 10) : null,
      hp: characterForm.hp ? parseInt(characterForm.hp, 10) : null,
      max_hp: characterForm.max_hp ? parseInt(characterForm.max_hp, 10) : null,
      dnd_beyond_url: characterForm.dnd_beyond_url.trim() || null,
    };

    const response = await apiFetch("/characters", {
      token,
      method: "POST",
      body,
    });

    if (!response.ok) {
      setError("Failed to create character.");
      return;
    }

    setCharacterForm({
      name: "",
      class_name: "",
      level: "1",
      ac: "",
      hp: "",
      max_hp: "",
      dnd_beyond_url: "",
    });
    setShowCharacterForm(false);
    await loadDashboard();
  };

  const handleDeleteCharacter = async (id) => {
    if (!token || !window.confirm("Delete this character?")) return;

    const response = await apiFetch(`/characters/${id}`, {
      token,
      method: "DELETE",
    });

    if (response.ok) {
      await loadDashboard();
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8 bg-[#040008]">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black text-[#fffb00] uppercase italic tracking-wider mb-2">
          Dashboard
        </h1>
        <p className="text-sm text-[#00ffff] font-mono mb-6">
          Welcome, {user?.username}.
        </p>

        {error && (
          <p className="text-xs text-[#ff003c] font-mono mb-4 border-l-2 border-[#ff003c] pl-2">
            {error}
          </p>
        )}

        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-black text-[#ff007f] uppercase tracking-widest mb-3">
            <Users className="w-4 h-4" />
            My Campaigns
          </h2>

          <div className="space-y-3 mb-4">
            <form onSubmit={handleCreateCampaign} className="flex gap-2">
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="New campaign name..."
                className="flex-1 px-3 py-2 border-2 border-[#ff007f] bg-black text-[#00ffff] text-sm font-mono focus:outline-none focus:border-[#fffb00]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#ff007f] text-black font-black text-xs uppercase tracking-widest border-2 border-black hover:bg-[#fffb00]"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            <form onSubmit={handleJoinCampaign} className="flex gap-2">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Join with invite code..."
                className="flex-1 px-3 py-2 border-2 border-[#00ffff] bg-black text-[#00ffff] text-sm font-mono focus:outline-none focus:border-[#fffb00]"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#00ffff] text-black font-black text-xs uppercase tracking-widest border-2 border-black hover:bg-[#fffb00] flex items-center gap-1"
              >
                <UserPlus className="w-4 h-4" />
                Join
              </button>
            </form>
          </div>

          {loading ? (
            <p className="text-xs text-zinc-500 font-mono">Loading campaigns...</p>
          ) : campaigns.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-zinc-700 bg-zinc-950/50 text-center">
              <p className="text-xs text-zinc-500 font-mono">
                No campaigns yet. Create one or join with an invite code.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-4 border-2 border-[#ff007f]/50 bg-black flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-black text-[#fffb00] uppercase text-sm tracking-wide">
                      {campaign.name}
                    </h3>
                    <p className="text-[10px] text-[#00ffff] font-mono mt-1">
                      Dungeon Master: {campaign.owner_username}
                      {campaign.is_owner && (
                        <span className="text-[#ff007f] ml-2">(You)</span>
                      )}
                    </p>
                    {campaign.is_owner && campaign.invite_code && (
                      <p className="text-[10px] text-zinc-500 font-mono mt-1">
                        Invite code:{" "}
                        <span className="text-[#fffb00] tracking-widest">{campaign.invite_code}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 text-sm font-black text-[#00ffff] uppercase tracking-widest">
              <Scroll className="w-4 h-4" />
              My Characters
            </h2>
            <button
              onClick={() => setShowCharacterForm((prev) => !prev)}
              className="text-xs font-black uppercase tracking-widest text-[#ff007f] hover:text-[#fffb00]"
            >
              {showCharacterForm ? "Cancel" : "+ Add Character"}
            </button>
          </div>

          {showCharacterForm && (
            <form
              onSubmit={handleCreateCharacter}
              className="mb-4 p-4 border-2 border-[#00ffff] bg-zinc-950 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  value={characterForm.name}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Character name *"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
                <input
                  type="text"
                  value={characterForm.class_name}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, class_name: e.target.value }))}
                  placeholder="Class"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={characterForm.level}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, level: e.target.value }))}
                  placeholder="Level"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
                <input
                  type="number"
                  min="0"
                  value={characterForm.ac}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, ac: e.target.value }))}
                  placeholder="AC"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
                <input
                  type="number"
                  min="0"
                  value={characterForm.hp}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, hp: e.target.value }))}
                  placeholder="HP"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
                <input
                  type="number"
                  min="0"
                  value={characterForm.max_hp}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, max_hp: e.target.value }))}
                  placeholder="Max HP"
                  className="px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
                />
              </div>
              <input
                type="url"
                value={characterForm.dnd_beyond_url}
                onChange={(e) => setCharacterForm((f) => ({ ...f, dnd_beyond_url: e.target.value }))}
                placeholder="D&D Beyond link (optional)"
                className="w-full px-3 py-2 border border-zinc-700 bg-black text-[#00ffff] text-sm font-mono"
              />
              <button
                type="submit"
                className="w-full py-2 bg-[#00ffff] text-black font-black text-xs uppercase tracking-widest border-2 border-black hover:bg-[#fffb00]"
              >
                Save Character
              </button>
            </form>
          )}

          {loading ? (
            <p className="text-xs text-zinc-500 font-mono">Loading characters...</p>
          ) : characters.length === 0 ? (
            <div className="p-6 border-2 border-dashed border-zinc-700 bg-zinc-950/50 text-center">
              <p className="text-xs text-zinc-500 font-mono">
                No characters yet. PDF upload coming later — add basic details for now.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {characters.map((character) => (
                <div
                  key={character.id}
                  className="p-4 border-2 border-[#00ffff]/50 bg-black flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-black text-[#fffb00] uppercase text-sm">{character.name}</h3>
                    <p className="text-[10px] text-zinc-400 font-mono mt-1">
                      {[
                        character.class_name,
                        character.level ? `Level ${character.level}` : null,
                        character.ac != null ? `AC ${character.ac}` : null,
                        character.hp != null && character.max_hp != null
                          ? `HP ${character.hp}/${character.max_hp}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No details yet"}
                    </p>
                    {character.dnd_beyond_url && (
                      <a
                        href={character.dnd_beyond_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-[#00ffff] hover:text-[#fffb00] font-mono mt-1 inline-block"
                      >
                        D&amp;D Beyond sheet
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteCharacter(character.id)}
                    className="text-[10px] font-black uppercase text-zinc-600 hover:text-[#ff003c]"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-black text-[#fffb00] uppercase tracking-widest mb-3">
            Quick Tools
          </h2>
          <Link
            to="/chat"
            className="group block p-6 border-2 border-[#ff007f] bg-black hover:bg-[#ff007f]/10 transition"
          >
            <MessageSquare className="w-8 h-8 text-[#ff007f] mb-3 group-hover:text-[#fffb00]" />
            <h3 className="font-black text-[#fffb00] uppercase tracking-widest text-sm mb-1">
              Rules AI Chat
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              Look up spells, monsters, and 5e rules on the fly.
            </p>
          </Link>
        </section>
      </div>
    </div>
  );
}
