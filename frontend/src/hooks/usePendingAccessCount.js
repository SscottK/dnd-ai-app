import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function usePendingAccessCount(token, enabled) {
  const [pendingCount, setPendingCount] = useState(0);
  const [accessPendingCount, setAccessPendingCount] = useState(0);
  const [feedbackPendingCount, setFeedbackPendingCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(enabled));

  const refresh = useCallback(async () => {
    if (!token || !enabled) {
      setPendingCount(0);
      setAccessPendingCount(0);
      setFeedbackPendingCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/admin/access-requests/summary", { token });
      if (!response.ok) {
        setPendingCount(0);
        setAccessPendingCount(0);
        setFeedbackPendingCount(0);
        return;
      }
      const data = await response.json();
      const access = Number(data.access_pending_count ?? data.pending_count) || 0;
      const feedback = Number(data.feedback_pending_count) || 0;
      const total = Number(data.pending_count);
      setAccessPendingCount(access);
      setFeedbackPendingCount(feedback);
      setPendingCount(Number.isFinite(total) && total > 0 ? total : access + feedback);
    } catch {
      setPendingCount(0);
      setAccessPendingCount(0);
      setFeedbackPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [token, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pendingCount, accessPendingCount, feedbackPendingCount, loading, refresh };
}
