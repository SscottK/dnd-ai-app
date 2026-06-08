import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function usePendingAccessCount(token, enabled) {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(enabled));

  const refresh = useCallback(async () => {
    if (!token || !enabled) {
      setPendingCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await apiFetch("/admin/access-requests/summary", { token });
      if (!response.ok) {
        setPendingCount(0);
        return;
      }
      const data = await response.json();
      setPendingCount(Number(data.pending_count) || 0);
    } catch {
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [token, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pendingCount, loading, refresh };
}
