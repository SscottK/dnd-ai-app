import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export function joinableLiveCampaigns(campaigns) {
  return (campaigns || []).filter(
    (campaign) => campaign.session_active && (campaign.is_owner || campaign.my_character_id)
  );
}

export function useLiveCampaigns(token) {
  const [liveCampaigns, setLiveCampaigns] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));

  const refresh = useCallback(async () => {
    if (!token) {
      setLiveCampaigns([]);
      setLoading(false);
      return;
    }

    try {
      const response = await apiFetch("/campaigns", { token });
      if (!response.ok) {
        setLiveCampaigns([]);
        return;
      }
      const data = await response.json();
      setLiveCampaigns(joinableLiveCampaigns(data.campaigns));
    } catch {
      setLiveCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 45000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { liveCampaigns, loading, refresh };
}
