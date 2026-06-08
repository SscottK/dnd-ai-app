import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Check, ShieldAlert, UserPlus, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";

export function AdminAccessPage() {
  const { token, user, isValidating } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadRequests = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/admin/access-requests?status_filter=pending", { token });
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
  }, [token]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  if (!isValidating && !user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleAction = async (requestId, action) => {
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
      await loadRequests();
    } catch (err) {
      setError(err.message || `Could not ${action} request`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-black uppercase italic text-starlight tracking-tight flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-neon-cyan" />
            Access Requests
          </h1>
          <p className="text-xs text-zinc-500 mt-2 font-mono uppercase tracking-widest">
            Approve friends who want to join Quest Terminal
          </p>
        </div>

        {actionMessage && (
          <div className="text-xs text-neon-cyan border-l-2 border-neon-cyan pl-3 font-bold">
            {actionMessage}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-danger text-xs border-l-2 border-danger pl-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span className="font-bold">{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-zinc-500 font-mono uppercase tracking-widest">Loading…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-zinc-500 font-mono">No pending requests right now.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="border-2 border-border-bright bg-void-panel p-4 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-black text-starlight uppercase tracking-wide">{request.username}</p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">
                    Requested {new Date(request.created_at).toLocaleString()}
                  </p>
                  {request.message ? (
                    <p className="text-sm text-ink-muted mt-2 whitespace-pre-wrap">{request.message}</p>
                  ) : (
                    <p className="text-[10px] text-zinc-600 mt-2 italic">No message left</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => handleAction(request.id, "approve")}
                    className="flex items-center gap-1.5 px-3 py-2 bg-neon-cyan hover:bg-starlight text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => handleAction(request.id, "reject")}
                    className="flex items-center gap-1.5 px-3 py-2 border-2 border-danger text-danger hover:bg-danger hover:text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
