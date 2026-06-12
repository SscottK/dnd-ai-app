import { apiFetch } from "./api";

export function emptyMonsterRow() {
  return { srd_name: "", count: 1, label: "" };
}

export async function fetchEncounterTemplates(token) {
  const res = await apiFetch("/encounter-templates", { token });
  if (!res.ok) throw new Error("Could not load encounter templates");
  const data = await res.json();
  return data.templates || [];
}

export async function createEncounterTemplate(token, body) {
  const res = await apiFetch("/encounter-templates", {
    token,
    method: "POST",
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not save encounter");
  }
  return res.json();
}

export async function updateEncounterTemplate(token, templateId, body) {
  const res = await apiFetch(`/encounter-templates/${templateId}`, {
    token,
    method: "PATCH",
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not update encounter");
  }
  return res.json();
}

export async function deleteEncounterTemplate(token, templateId) {
  const res = await apiFetch(`/encounter-templates/${templateId}`, {
    token,
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not delete encounter");
  }
}

export async function addTemplateToTracker(token, campaignId, templateId) {
  const res = await apiFetch(`/campaigns/${campaignId}/encounter/add-from-template`, {
    token,
    method: "POST",
    body: { template_id: templateId },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Could not add encounter to tracker");
  }
  return res.json();
}

export function formatTemplateSummary(template) {
  const monsters = template?.monsters || [];
  const total = monsters.reduce((sum, row) => sum + (row.count || 1), 0);
  const names = monsters
    .map((row) => {
      const label = row.label?.trim();
      const base = label || row.srd_name;
      return row.count > 1 ? `${base} ×${row.count}` : base;
    })
    .join(", ");
  return { total, names };
}
