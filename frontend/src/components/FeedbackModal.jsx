import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquarePlus, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { APP_VERSION } from "../constants/branding";

export function FeedbackModal({ open, onClose, onSubmitted }) {
  const { token } = useAuth();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!open) return null;

  const handleClose = () => {
    if (submitting) return;
    setMessage("");
    setError("");
    setSuccess("");
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token || message.trim().length < 10) return;

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch("/feedback", {
        method: "POST",
        token,
        body: {
          message: message.trim(),
          page_url: location.pathname,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Could not send feedback");
      }
      setSuccess("Thanks — your feedback was sent to the team.");
      setMessage("");
      onSubmitted?.();
      window.setTimeout(handleClose, 1200);
    } catch (err) {
      setError(err.message || "Could not send feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-4">
      <div
        className="w-full max-w-md rounded-md border border-border-bright bg-void-panel shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="feedback-modal-title"
            className="flex items-center gap-2 text-sm font-black uppercase text-starlight"
          >
            <MessageSquarePlus className="h-4 w-4 text-neon-cyan" />
            Send feedback
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-ink-faint hover:bg-border/40 hover:text-starlight"
            aria-label="Close feedback form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          <p className="text-xs font-mono text-ink-muted">
            Beta {APP_VERSION} — tell us what&apos;s working, broken, or missing.
          </p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            required
            minLength={10}
            maxLength={2000}
            placeholder="Describe the issue or idea…"
            className="w-full resize-y rounded-sm border border-border bg-black px-3 py-2 text-sm font-mono text-starlight placeholder:text-ink-faint focus:border-neon-cyan focus:outline-none"
          />
          <p className="text-[10px] font-mono text-ink-faint">
            Page: {location.pathname}
          </p>
          {error && (
            <p className="text-xs font-mono text-danger">{error}</p>
          )}
          {success && (
            <p className="text-xs font-mono text-neon-cyan">{success}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded-sm border border-border px-3 py-2 text-xs font-black uppercase text-ink-muted hover:text-starlight disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || message.trim().length < 10}
              className="rounded-sm border border-neon-cyan bg-neon-cyan/10 px-3 py-2 text-xs font-black uppercase text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
