import { apiFetch } from "./api";

export async function postActionRoll(campaignId, token, body) {
  const response = await apiFetch(`/campaigns/${campaignId}/action-log/roll`, {
    token,
    method: "POST",
    body,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = Array.isArray(err.detail)
      ? err.detail.map((item) => item.msg).join(", ")
      : err.detail;
    throw new Error(detail || "Could not log roll");
  }
  return response.json();
}

export async function postCombatRoll(campaignId, token, { dice, result, message }) {
  const response = await apiFetch(`/campaigns/${campaignId}/encounter/roll`, {
    token,
    method: "POST",
    body: { dice, result, message },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not log roll to combat");
  }
  return response.json();
}

export function formatRollEntry(entry) {
  if (!entry) return "";
  if (entry.message) return entry.message;
  return entry.total != null ? String(entry.total) : "";
}
