import { appendCombatLogToDmSessionNotes } from "./sheetLayout";

export async function postCombatEnd(apiFetch, options) {
  const { campaignId, token, layout, canvasW, canvasH, onLayoutChange } = options;
  const res = await apiFetch(`/campaigns/${campaignId}/encounter/end-combat`, {
    token,
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not end combat");
  }
  const data = await res.json();
  if (data.combat_log_text && layout && onLayoutChange) {
    onLayoutChange(
      appendCombatLogToDmSessionNotes(layout, data.combat_log_text, canvasW, canvasH)
    );
  }
  return data;
}
