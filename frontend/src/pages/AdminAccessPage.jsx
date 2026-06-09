import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, MessageSquarePlus, ShieldAlert, UserPlus, X } from "lucide-react";
import { PAGE_SCROLL_CLASS, PullToRefresh } from "../components/PullToRefresh";
import { useAuth } from "../hooks/useAuth";
import { usePendingAccessCount } from "../hooks/usePendingAccessCount";
import { apiFetch } from "../lib/api";

const SECTIONS = [
  { id: "access", label: "Access" },
  { id: "feedback", label: "Feedback" },
];

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "reviewed", label: "Reviewed" },
];

function statusLabel(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "reviewed") return "Reviewed";
  return status;
}

function statusClass(status) {
  if (status === "approved" || status === "reviewed") return "text-neon-cyan border-neon-cyan";
  if (status === "rejected") return "text-danger border-danger";
  return "text-zinc-500 border-zinc-600";
}

export function AdminAccessPage() {
  const { token, user, isValidating } = useAuth();
  const {
    pendingCount,
    accessPendingCount,
    feedbackPendingCount,
    loading: countLoading,
    refresh: refreshPendingCount,
  } = usePendingAccessCount(token, Boolean(user?.is_admin));
  const [activeSection, setActiveSection] = useState("access");
  const [activeTab, setActiveTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadAccessRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        `/admin/access-requests?status_filter=${encodeURIComponent(activeTab)}`,
        { token }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load access requests");
      }
      setRequests(await response.json());
    } catch (err) {
      setError(err.message || "Could not load access requests");
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  const loadFeedback = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        `/admin/feedback?status_filter=${encodeURIComponent(activeTab)}`,
        { token }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load feedback");
      }
      setFeedbackItems(await response.json());
    } catch (err) {
      setError(err.message || "Could not load feedback");
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  useEffect(() => {
    if (activeSection === "access") {
      void loadAccessRequests();
    } else {
      void loadFeedback();
    }
  }, [activeSection, loadAccessRequests, loadFeedback]);

  const refreshPage = useCallback(async () => {
    await refreshPendingCount();
    if (activeSection === "access") {
      await loadAccessRequests();
    } else {
      await loadFeedback();
    }
  }, [activeSection, loadAccessRequests, loadFeedback, refreshPendingCount]);

  if (!isValidating && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleAccessAction = async (requestId, action) => {
    setBusyId(requestId);
    setActionMessage("");
    setError("");
    try {
      const response = await apiFetch(`/admin/access-requests/${requestId}/${action}`, {
        method: "POST",
        token,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `Could not ${action} request`);
      }
      setActionMessage(data.message || "Done");
      await Promise.all([loadAccessRequests(), refreshPendingCount()]);
    } catch (err) {
      setError(err.message || `Could not ${action} request`);
    } finally {
      setBusyId(null);
    }
  };

  const handleReviewFeedback = async (feedbackId) => {
    setBusyId(feedbackId);
    setActionMessage("");
    setError("");
    try {
      const response = await apiFetch(`/admin/feedback/${feedbackId}/review`, {
        method: "POST",
        token,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Could not mark feedback reviewed");
      }
      setActionMessage(data.message || "Marked as reviewed");
      await Promise.all([loadFeedback(), refreshPendingCount()]);
    } catch (err) {
      setError(err.message || "Could not mark feedback reviewed");
    } finally {
      setBusyId(null);
    }
  };

  const sectionPendingCount = activeSection === "access" ? accessPendingCount : feedbackPendingCount;
  const emptyMessage =
    activeTab === "pending"
      ? activeSection === "access"
        ? "No pending access requests right now."
        : "No pending feedback right now."
      : activeSection === "access"
        ? "No reviewed access requests yet."
        : "No reviewed feedback yet.";

  return (
    <PullToRefresh onRefresh={refreshPage} className={`${PAGE_SCROLL_CLASS} p-3 sm:p-6`}>
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black uppercase italic tracking-tight text-starlight sm:text-2xl">
            <UserPlus className="h-6 w-6 text-neon-cyan" />
            Requests
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
            Review access requests and beta feedback
          </p>
        </div>

        {!countLoading && (
          <div
            className={`border-l-2 pl-3 font-mono text-xs uppercase tracking-widest ${
              pendingCount > 0
                ? "border-neon-magenta font-bold text-neon-magenta"
                : "border-zinc-700 text-zinc-500"
            }`}
          >
            {pendingCount > 0
              ? `${pendingCount} pending item${pendingCount === 1 ? "" : "s"} waiting for review`
              : "No pending requests"}
            {pendingCount > 0 && (
              <span className="mt-1 block text-[10px] font-normal normal-case text-ink-muted">
                {accessPendingCount} access · {feedbackPendingCount} feedback
              </span>
            )}
          </div>
        )}

        <div className="flex gap-2 border-b-2 border-border-bright">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                setActiveSection(section.id);
                setActiveTab("pending");
              }}
              className={`-mb-0.5 border-b-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                activeSection === section.id
                  ? "border-neon-cyan text-starlight"
                  : "border-transparent text-zinc-500 hover:text-ink"
              }`}
            >
              {section.label}
              {section.id === "access" && accessPendingCount > 0 && (
                <span className="ml-1.5 text-neon-magenta">({accessPendingCount})</span>
              )}
              {section.id === "feedback" && feedbackPendingCount > 0 && (
                <span className="ml-1.5 text-neon-magenta">({feedbackPendingCount})</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2 border-b border-border/60">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition ${
                activeTab === tab.id
                  ? "border-neon-magenta text-starlight"
                  : "border-transparent text-zinc-500 hover:text-ink"
              }`}
            >
              {tab.label}
              {tab.id === "pending" && sectionPendingCount > 0 && activeTab === tab.id && (
                <span className="ml-1.5 text-neon-magenta">({sectionPendingCount})</span>
              )}
            </button>
          ))}
        </div>

        {actionMessage && (
          <div className="border-l-2 border-neon-cyan pl-3 text-xs font-bold text-neon-cyan">
            {actionMessage}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 border-l-2 border-danger pl-2 text-xs text-danger">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        {loading ? (
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">Loading…</p>
        ) : activeSection === "access" ? (
          requests.length === 0 ? (
            <p className="font-mono text-sm text-zinc-500">{emptyMessage}</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-4 border-2 border-border-bright bg-void-panel p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black uppercase tracking-wide text-starlight">{request.username}</p>
                      {activeTab === "reviewed" && (
                        <span
                          className={`border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusClass(request.status)}`}
                        >
                          {statusLabel(request.status)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-zinc-500">
                      Requested {new Date(request.created_at).toLocaleString()}
                    </p>
                    {activeTab === "reviewed" && request.reviewed_at && (
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                        {statusLabel(request.status)} {new Date(request.reviewed_at).toLocaleString()}
                        {request.reviewed_by_username ? ` by ${request.reviewed_by_username}` : ""}
                      </p>
                    )}
                    {request.message ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{request.message}</p>
                    ) : (
                      <p className="mt-2 text-[10px] italic text-zinc-600">No message left</p>
                    )}
                  </div>
                  {activeTab === "pending" && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => handleAccessAction(request.id, "approve")}
                        className="flex items-center gap-1.5 bg-neon-cyan px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-starlight disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => handleAccessAction(request.id, "reject")}
                        className="flex items-center gap-1.5 border-2 border-danger px-3 py-2 text-[10px] font-black uppercase tracking-widest text-danger hover:bg-danger hover:text-black disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : feedbackItems.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500">{emptyMessage}</p>
        ) : (
          <ul className="space-y-3">
            {feedbackItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-4 border-2 border-border-bright bg-void-panel p-4 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black uppercase tracking-wide text-starlight">{item.username}</p>
                    {activeTab === "reviewed" && (
                      <span
                        className={`border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusClass(item.status)}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    Sent {new Date(item.created_at).toLocaleString()}
                  </p>
                  {item.page_url && (
                    <p className="mt-0.5 font-mono text-[10px] text-neon-cyan">Page: {item.page_url}</p>
                  )}
                  {activeTab === "reviewed" && item.reviewed_at && (
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
                      Reviewed {new Date(item.reviewed_at).toLocaleString()}
                      {item.reviewed_by_username ? ` by ${item.reviewed_by_username}` : ""}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{item.message}</p>
                </div>
                {activeTab === "pending" && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleReviewFeedback(item.id)}
                    className="flex shrink-0 items-center gap-1.5 border-2 border-neon-cyan px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neon-cyan hover:bg-neon-cyan hover:text-black disabled:opacity-50"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Mark reviewed
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PullToRefresh>
  );
}
