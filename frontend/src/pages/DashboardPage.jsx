import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Hammer,
  MessageSquare,
  Play,
  Plus,
  Radio,
  Scroll,
  Sparkles,
  Swords,
  Upload,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch, apiUpload } from "../lib/api";
import { APP_NAME } from "../constants/branding";

const emptyCharacterForm = {
  name: "",
  class_name: "",
  level: "1",
  ac: "",
  hp: "",
  max_hp: "",
  skills: "",
  dnd_beyond_url: "",
  pdf_stored_name: null,
  sheet_json: null,
};

function StatPill({ children }) {
  return (
    <span className="rounded-sm border border-border/60 bg-void-deep/60 px-2 py-0.5 text-xs font-mono text-ink-muted">
      {children}
    </span>
  );
}

function ActionButton({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-black uppercase tracking-wide transition sm:text-sm ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function LinkButton({ to, children, className = "" }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-xs font-black uppercase tracking-wide transition sm:text-sm ${className}`}
    >
      {children}
    </Link>
  );
}

export function DashboardPage() {
  const { token, user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [rosters, setRosters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parsingPdf, setParsingPdf] = useState(false);
  const [parseWarning, setParseWarning] = useState("");

  const [newCampaignName, setNewCampaignName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCharacterId, setJoinCharacterId] = useState("");
  const [showJoinPanel, setShowJoinPanel] = useState(false);
  const [showCharacterForm, setShowCharacterForm] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState(null);
  const [characterForm, setCharacterForm] = useState(emptyCharacterForm);
  const [savingCharacter, setSavingCharacter] = useState(false);

  const availableCharacters = characters.filter((c) => !c.campaign_id);
  const liveCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.session_active),
    [campaigns]
  );

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
      const loadedCampaigns = campaignData.campaigns || [];
      setCampaigns(loadedCampaigns);
      setCharacters(characterData.characters || []);

      const owned = loadedCampaigns.filter((c) => c.is_owner);
      const rosterEntries = await Promise.all(
        owned.map(async (campaign) => {
          const res = await apiFetch(`/campaigns/${campaign.id}/roster`, { token });
          if (!res.ok) return [campaign.id, []];
          const data = await res.json();
          return [campaign.id, data.members || []];
        })
      );
      setRosters(Object.fromEntries(rosterEntries));
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
    if (!inviteCode.trim() || !joinCharacterId || !token) {
      setError("Select a character and enter an invite code to join.");
      return;
    }

    const response = await apiFetch("/campaigns/join", {
      token,
      method: "POST",
      body: {
        invite_code: inviteCode.trim().toUpperCase(),
        character_id: parseInt(joinCharacterId, 10),
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setError(err.detail || "Could not join campaign.");
      return;
    }

    setInviteCode("");
    setJoinCharacterId("");
    setShowJoinPanel(false);
    setError("");
    await loadDashboard();
  };

  const handleLeaveCampaign = async (campaignId) => {
    if (!token || !window.confirm("Leave this campaign?")) return;

    const response = await apiFetch(`/campaigns/${campaignId}/leave`, {
      token,
      method: "POST",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setError(err.detail || "Could not leave campaign.");
      return;
    }

    await loadDashboard();
  };

  const handleKickMember = async (campaignId, memberId) => {
    if (!token || !window.confirm("Remove this player from the campaign?")) return;

    const response = await apiFetch(`/campaigns/${campaignId}/members/${memberId}`, {
      token,
      method: "DELETE",
    });

    if (!response.ok) {
      setError("Could not remove member.");
      return;
    }

    await loadDashboard();
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setParsingPdf(true);
    setError("");
    try {
      const response = await apiUpload("/characters/parse-pdf", { token, file });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "PDF parse failed");
      }
      const draft = await response.json();
      setParseWarning(draft.parse_warning || "");
      setCharacterForm({
        name: draft.name && draft.name !== "Unknown Hero" ? draft.name : "",
        class_name: draft.class_name || "",
        level: String(draft.level ?? 1),
        ac: draft.ac != null ? String(draft.ac) : "",
        hp: draft.hp != null ? String(draft.hp) : "",
        max_hp: draft.max_hp != null ? String(draft.max_hp) : "",
        skills: draft.skills || "",
        dnd_beyond_url: "",
        pdf_stored_name: draft.pdf_stored_name,
        sheet_json: draft.sheet_json || null,
      });
      setEditingCharacterId(null);
      setShowCharacterForm(true);
    } catch (err) {
      setError(err.message || "Could not read PDF.");
    } finally {
      setParsingPdf(false);
      e.target.value = "";
    }
  };

  const resetCharacterForm = () => {
    setCharacterForm(emptyCharacterForm);
    setEditingCharacterId(null);
    setParseWarning("");
    setShowCharacterForm(false);
  };

  const handleEditCharacter = (character) => {
    setEditingCharacterId(character.id);
    setCharacterForm({
      name: character.name || "",
      class_name: character.class_name || "",
      level: String(character.level ?? 1),
      ac: character.ac != null ? String(character.ac) : "",
      hp: character.hp != null ? String(character.hp) : "",
      max_hp: character.max_hp != null ? String(character.max_hp) : "",
      skills: character.skills || "",
      dnd_beyond_url: character.dnd_beyond_url || "",
      pdf_stored_name: null,
      sheet_json: character.sheet_json || null,
    });
    setParseWarning("");
    setShowCharacterForm(true);
    setError("");
  };

  const handleSaveCharacter = async (e) => {
    e.preventDefault();
    if (!characterForm.name.trim() || !token) return;

    setSavingCharacter(true);
    setError("");

    const body = {
      name: characterForm.name.trim(),
      class_name: characterForm.class_name.trim() || null,
      level: characterForm.level ? parseInt(characterForm.level, 10) : 1,
      ac: characterForm.ac ? parseInt(characterForm.ac, 10) : null,
      hp: characterForm.hp ? parseInt(characterForm.hp, 10) : null,
      max_hp: characterForm.max_hp ? parseInt(characterForm.max_hp, 10) : null,
      skills: characterForm.skills.trim() || null,
      dnd_beyond_url: characterForm.dnd_beyond_url.trim() || null,
    };

    try {
      if (editingCharacterId) {
        const response = await apiFetch(`/characters/${editingCharacterId}`, {
          token,
          method: "PATCH",
          body,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to update character.");
        }
      } else {
        const response = await apiFetch("/characters", {
          token,
          method: "POST",
          body: {
            ...body,
            pdf_stored_name: characterForm.pdf_stored_name,
            sheet_json: characterForm.sheet_json,
          },
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to create character.");
        }
      }

      resetCharacterForm();
      await loadDashboard();
    } catch (err) {
      setError(err.message || "Could not save character.");
    } finally {
      setSavingCharacter(false);
    }
  };

  const handleToggleSession = async (campaignId, active) => {
    if (!token) return;
    const response = await apiFetch(`/campaigns/${campaignId}/session`, {
      token,
      method: "PATCH",
      body: { session_active: active },
    });
    if (!response.ok) {
      setError(active ? "Could not start session." : "Could not end session.");
      return;
    }
    await loadDashboard();
  };

  const handleDeleteCharacter = async (id) => {
    if (!token || !window.confirm("Delete this character?")) return;

    const response = await apiFetch(`/characters/${id}`, {
      token,
      method: "DELETE",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      setError(err.detail || "Could not delete character.");
      return;
    }

    await loadDashboard();
  };

  const statLine = (character) =>
    [
      character.class_name,
      character.level ? `Level ${character.level}` : null,
      character.ac != null ? `AC ${character.ac}` : null,
      character.hp != null && character.max_hp != null
        ? `HP ${character.hp}/${character.max_hp}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const inputClass =
    "w-full rounded-sm border border-border bg-black px-3 py-2.5 text-sm font-mono text-starlight placeholder:text-ink-faint focus:border-neon-cyan focus:outline-none";

  return (
    <div className="session-ui h-full overflow-y-auto bg-void">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-neon-cyan sm:text-sm">
            {APP_NAME}
          </p>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-starlight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-ink-muted sm:text-base">
            Welcome back, <span className="font-mono text-starlight">{user?.username}</span>.
            Manage campaigns, characters, and jump into play.
          </p>
        </header>

        {error && (
          <p className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-mono text-danger">
            {error}
          </p>
        )}

        {liveCampaigns.length > 0 && (
          <section className="mb-8 rounded-md border border-neon-magenta/50 bg-neon-magenta/10 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Radio className="h-4 w-4 animate-pulse text-neon-magenta" />
              <h2 className="text-sm font-black uppercase tracking-wide text-starlight sm:text-base">
                Live now
              </h2>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {liveCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/60 bg-void-panel/80 px-3 py-3"
                >
                  <div>
                    <p className="font-black uppercase text-starlight">{campaign.name}</p>
                    <p className="text-xs font-mono text-ink-muted sm:text-sm">
                      {campaign.is_owner
                        ? "You are DM — open the session playspace"
                        : campaign.my_character_name
                          ? `Playing as ${campaign.my_character_name}`
                          : "Session is active"}
                    </p>
                  </div>
                  {(campaign.is_owner ||
                    (campaign.session_active && campaign.my_character_id)) && (
                    <LinkButton
                      to={`/session/${campaign.id}`}
                      className="border-starlight bg-starlight/10 text-starlight hover:bg-starlight/20"
                    >
                      <Play className="h-4 w-4" />
                      {campaign.is_owner ? "Open session" : "Join session"}
                    </LinkButton>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/chat"
            className="group rounded-md border border-border-bright bg-void-panel p-4 transition hover:border-neon-magenta/60 hover:bg-neon-magenta/5"
          >
            <MessageSquare className="mb-2 h-5 w-5 text-neon-magenta group-hover:text-starlight" />
            <h3 className="text-sm font-black uppercase text-starlight">Rules AI</h3>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">Spells, monsters, and 5.5e lookups</p>
          </Link>
          <Link
            to="/character/build"
            className="group rounded-md border border-border-bright bg-void-panel p-4 transition hover:border-neon-cyan/60 hover:bg-neon-cyan/5"
          >
            <Sparkles className="mb-2 h-5 w-5 text-neon-cyan group-hover:text-starlight" />
            <h3 className="text-sm font-black uppercase text-starlight">Character builder</h3>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">Create a sheet without a PDF</p>
          </Link>
          <label className="group cursor-pointer rounded-md border border-border-bright bg-void-panel p-4 transition hover:border-starlight/60 hover:bg-starlight/5">
            <Upload className="mb-2 h-5 w-5 text-starlight group-hover:text-neon-cyan" />
            <h3 className="text-sm font-black uppercase text-starlight">
              {parsingPdf ? "Reading PDF…" : "Import PDF"}
            </h3>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">D&amp;D Beyond character sheet</p>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={parsingPdf}
              onChange={handlePdfUpload}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              resetCharacterForm();
              setShowCharacterForm(true);
            }}
            className="group rounded-md border border-border-bright bg-void-panel p-4 text-left transition hover:border-neon-cyan/60 hover:bg-neon-cyan/5"
          >
            <Hammer className="mb-2 h-5 w-5 text-neon-cyan group-hover:text-starlight" />
            <h3 className="text-sm font-black uppercase text-starlight">Manual entry</h3>
            <p className="mt-1 text-xs text-ink-muted sm:text-sm">Quick-create basic stats</p>
          </button>
        </section>

        <div className="grid gap-8 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black uppercase tracking-wide text-neon-magenta sm:text-lg">
                  <Users className="h-5 w-5" />
                  Campaigns
                </h2>
                <p className="mt-1 text-xs text-ink-muted sm:text-sm">
                  {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinPanel((open) => !open)}
                className="inline-flex items-center gap-1 text-xs font-black uppercase text-neon-cyan hover:text-starlight sm:text-sm"
              >
                <UserPlus className="h-4 w-4" />
                Join with code
                {showJoinPanel ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            <form
              onSubmit={handleCreateCampaign}
              className="mb-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="text"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="New campaign name…"
                className={inputClass}
              />
              <ActionButton
                type="submit"
                className="shrink-0 border-neon-magenta bg-neon-magenta text-black hover:bg-starlight"
              >
                <Plus className="h-4 w-4" />
                Create
              </ActionButton>
            </form>

            {showJoinPanel && (
              <form
                onSubmit={handleJoinCampaign}
                className="mb-4 space-y-3 rounded-md border border-neon-cyan/40 bg-neon-cyan/5 p-4"
              >
                <p className="text-xs font-black uppercase tracking-wide text-neon-cyan sm:text-sm">
                  Join a campaign
                </p>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Invite code"
                  className={inputClass}
                />
                <select
                  value={joinCharacterId}
                  onChange={(e) => setJoinCharacterId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select character…</option>
                  {availableCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.class_name ? ` (${c.class_name})` : ""}
                    </option>
                  ))}
                </select>
                {availableCharacters.length === 0 && (
                  <p className="text-xs font-mono text-ink-muted sm:text-sm">
                    Create a character first — it must not already be in a campaign.
                  </p>
                )}
                <ActionButton
                  type="submit"
                  disabled={availableCharacters.length === 0}
                  className="w-full border-neon-cyan bg-neon-cyan text-black hover:bg-starlight disabled:opacity-40 sm:w-auto"
                >
                  <UserPlus className="h-4 w-4" />
                  Join campaign
                </ActionButton>
              </form>
            )}

            {loading ? (
              <p className="text-sm font-mono text-ink-muted">Loading campaigns…</p>
            ) : campaigns.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center">
                <p className="text-sm font-mono text-ink-muted">
                  No campaigns yet. Create one above or join with an invite code.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <article
                    key={campaign.id}
                    className="rounded-md border border-border-bright bg-void-panel p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black uppercase text-starlight sm:text-lg">
                            {campaign.name}
                          </h3>
                          {campaign.is_owner && (
                            <StatPill>DM</StatPill>
                          )}
                          {campaign.session_active && (
                            <StatPill>
                              <span className="inline-flex items-center gap-1 text-neon-magenta">
                                <Radio className="h-3 w-3" />
                                Live
                              </span>
                            </StatPill>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-mono text-ink-muted sm:text-sm">
                          DM: {campaign.owner_username}
                          {campaign.is_owner ? " (you)" : ""}
                        </p>
                        {!campaign.is_owner && campaign.my_character_name && (
                          <p className="mt-1 text-xs font-mono text-starlight sm:text-sm">
                            Playing as {campaign.my_character_name}
                          </p>
                        )}
                        {campaign.is_owner && campaign.invite_code && (
                          <p className="mt-2 text-xs font-mono text-ink-muted sm:text-sm">
                            Invite:{" "}
                            <span className="tracking-widest text-starlight">
                              {campaign.invite_code}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 sm:max-w-[14rem] sm:flex-col sm:items-stretch">
                        {campaign.is_owner && campaign.session_active && (
                          <LinkButton
                            to={`/session/${campaign.id}`}
                            className="border-starlight bg-starlight/10 text-starlight hover:bg-starlight/20"
                          >
                            <Play className="h-4 w-4" />
                            Open session
                          </LinkButton>
                        )}
                        {!campaign.is_owner &&
                          campaign.session_active &&
                          campaign.my_character_id && (
                            <LinkButton
                              to={`/session/${campaign.id}`}
                              className="border-starlight bg-starlight/10 text-starlight hover:bg-starlight/20"
                            >
                              <Play className="h-4 w-4" />
                              Join session
                            </LinkButton>
                          )}
                        <LinkButton
                          to={`/initiative/${campaign.id}`}
                          className="border-neon-cyan/60 text-neon-cyan hover:bg-neon-cyan/10"
                        >
                          <Swords className="h-4 w-4" />
                          Initiative
                        </LinkButton>
                        {campaign.is_owner && (
                          <ActionButton
                            onClick={() =>
                              handleToggleSession(campaign.id, !campaign.session_active)
                            }
                            className={
                              campaign.session_active
                                ? "border-border text-ink-muted hover:border-danger hover:text-danger"
                                : "border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10"
                            }
                          >
                            <Play className="h-4 w-4" />
                            {campaign.session_active ? "End session" : "Start session"}
                          </ActionButton>
                        )}
                        {!campaign.is_owner && (
                          <ActionButton
                            onClick={() => handleLeaveCampaign(campaign.id)}
                            className="border-border text-ink-muted hover:border-danger hover:text-danger"
                          >
                            Leave
                          </ActionButton>
                        )}
                      </div>
                    </div>

                    {campaign.is_owner && rosters[campaign.id]?.length > 0 && (
                      <div className="mt-4 border-t border-border pt-4">
                        <p className="mb-2 text-xs font-black uppercase tracking-wide text-neon-magenta sm:text-sm">
                          Party roster
                        </p>
                        <ul className="space-y-2">
                          {rosters[campaign.id].map((member) => (
                            <li
                              key={member.member_id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-void-deep/50 px-3 py-2 text-xs font-mono text-ink-muted sm:text-sm"
                            >
                              <span>
                                <span className="font-black text-starlight">
                                  {member.character_name}
                                </span>
                                {" · "}
                                {member.username}
                                {member.class_name ? ` · ${member.class_name}` : ""}
                                {member.ac != null ? ` · AC ${member.ac}` : ""}
                                {member.hp != null && member.max_hp != null
                                  ? ` · HP ${member.hp}/${member.max_hp}`
                                  : ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleKickMember(campaign.id, member.member_id)}
                                className="inline-flex items-center gap-1 font-black uppercase text-ink-faint hover:text-danger"
                              >
                                <UserMinus className="h-3.5 w-3.5" />
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-black uppercase tracking-wide text-neon-cyan sm:text-lg">
                  <Scroll className="h-5 w-5" />
                  Characters
                </h2>
                <p className="mt-1 text-xs text-ink-muted sm:text-sm">
                  {characters.length} character{characters.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {showCharacterForm && (
              <form
                onSubmit={handleSaveCharacter}
                className="mb-4 space-y-3 rounded-md border border-neon-cyan/50 bg-void-panel p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black uppercase text-starlight">
                    {editingCharacterId ? "Edit character" : "New character"}
                  </p>
                  <button
                    type="button"
                    onClick={resetCharacterForm}
                    className="text-xs font-black uppercase text-ink-faint hover:text-starlight"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs font-mono text-ink-muted sm:text-sm">
                  {editingCharacterId
                    ? "Basic stats only — gear and notes live in session play."
                    : "Upload a PDF from the quick actions, or fill in details here."}
                </p>
                {characterForm.pdf_stored_name && (
                  <p className="text-xs font-mono text-neon-cyan sm:text-sm">
                    PDF attached — review fields, then save.
                  </p>
                )}
                {parseWarning && (
                  <p className="border-l-2 border-starlight pl-2 text-xs font-mono text-starlight sm:text-sm">
                    {parseWarning}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    value={characterForm.name}
                    onChange={(e) => setCharacterForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Name *"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={characterForm.class_name}
                    onChange={(e) =>
                      setCharacterForm((f) => ({ ...f, class_name: e.target.value }))
                    }
                    placeholder="Class"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={characterForm.level}
                    onChange={(e) => setCharacterForm((f) => ({ ...f, level: e.target.value }))}
                    placeholder="Level"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="0"
                    value={characterForm.ac}
                    onChange={(e) => setCharacterForm((f) => ({ ...f, ac: e.target.value }))}
                    placeholder="AC"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="0"
                    value={characterForm.hp}
                    onChange={(e) => setCharacterForm((f) => ({ ...f, hp: e.target.value }))}
                    placeholder="HP"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="0"
                    value={characterForm.max_hp}
                    onChange={(e) => setCharacterForm((f) => ({ ...f, max_hp: e.target.value }))}
                    placeholder="Max HP"
                    className={inputClass}
                  />
                </div>
                <input
                  type="text"
                  value={characterForm.skills}
                  onChange={(e) => setCharacterForm((f) => ({ ...f, skills: e.target.value }))}
                  placeholder="Notable skills (optional)"
                  className={inputClass}
                />
                <input
                  type="url"
                  value={characterForm.dnd_beyond_url}
                  onChange={(e) =>
                    setCharacterForm((f) => ({ ...f, dnd_beyond_url: e.target.value }))
                  }
                  placeholder="D&amp;D Beyond link (optional)"
                  className={inputClass}
                />
                <ActionButton
                  type="submit"
                  disabled={savingCharacter}
                  className="w-full border-neon-cyan bg-neon-cyan text-black hover:bg-starlight disabled:opacity-50"
                >
                  {savingCharacter
                    ? "Saving…"
                    : editingCharacterId
                      ? "Save changes"
                      : "Save character"}
                </ActionButton>
              </form>
            )}

            {loading ? (
              <p className="text-sm font-mono text-ink-muted">Loading characters…</p>
            ) : characters.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center">
                <p className="text-sm font-mono text-ink-muted">
                  No characters yet. Import a PDF or use the builder to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {characters.map((character) => (
                  <article
                    key={character.id}
                    className="rounded-md border border-border-bright bg-void-panel p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-black uppercase text-starlight">
                          {character.name}
                        </h3>
                        <p className="mt-1 text-xs font-mono text-ink-muted sm:text-sm">
                          {statLine(character) || "No combat stats yet"}
                        </p>
                        {character.campaign_name ? (
                          <p className="mt-2 text-xs font-mono text-neon-magenta sm:text-sm">
                            In {character.campaign_name}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-mono text-ink-faint sm:text-sm">
                            Not in a campaign
                          </p>
                        )}
                      </div>
                      {!character.campaign_id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCharacter(character.id)}
                          className="shrink-0 text-xs font-black uppercase text-ink-faint hover:text-danger"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <LinkButton
                        to={`/character/${character.id}`}
                        className="border-border text-starlight hover:border-neon-cyan hover:text-neon-cyan"
                      >
                        <FileText className="h-4 w-4" />
                        Open sheet
                      </LinkButton>
                      <ActionButton
                        onClick={() => handleEditCharacter(character)}
                        className="border-border text-neon-cyan hover:bg-neon-cyan/10"
                      >
                        Edit
                      </ActionButton>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
