import { apiFetch } from "./api";

export function serverNotesToClient(data) {
  const tabs = (data.tabs || []).map((tab) => ({
    id: tab.id,
    title: tab.title,
    content: tab.content || "",
  }));
  const closedTabs = (data.closed_tabs || data.closedTabs || []).map((tab) => ({
    id: tab.id,
    title: tab.title,
    content: tab.content || "",
  }));
  return {
    tabs,
    closedTabs,
    activeTabId: data.active_tab_id ?? data.activeTabId ?? tabs[0]?.id ?? null,
  };
}

export function clientNotesToServer(payload) {
  return {
    tabs: (payload.tabs || []).map(({ id, title, content }) => ({
      id,
      title,
      content: content || "",
    })),
    closedTabs: (payload.closedTabs || []).map(({ id, title, content }) => ({
      id,
      title,
      content: content || "",
    })),
    activeTabId: payload.activeTabId ?? null,
  };
}

export async function fetchCampaignNotes(campaignId, token) {
  const response = await apiFetch(`/notes/campaigns/${campaignId}`, { token });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not load notes.");
  }
  return response.json();
}

export async function saveCampaignNotes(campaignId, token, payload) {
  const response = await apiFetch(`/notes/campaigns/${campaignId}`, {
    token,
    method: "PUT",
    body: clientNotesToServer(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not save notes.");
  }
  return response.json();
}

export async function fetchAllNotes(token) {
  const response = await apiFetch("/notes", { token });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not load notes.");
  }
  return response.json();
}

export async function createCampaignNoteTab(campaignId, token, { title, content = "" }) {
  const response = await apiFetch(`/notes/campaigns/${campaignId}/tabs`, {
    token,
    method: "POST",
    body: { title, content },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not create note.");
  }
  return response.json();
}

export async function deleteCampaignNoteTab(campaignId, token, tabId) {
  const response = await apiFetch(`/notes/campaigns/${campaignId}/tabs/${tabId}`, {
    token,
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not delete note.");
  }
  return response.json();
}

export async function fetchUserNotesPage(token) {
  const response = await apiFetch("/notes/entries", { token });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not load notes.");
  }
  return response.json();
}

export async function createUserNote(token, { title, content = "", campaignId = null }) {
  const response = await apiFetch("/notes/entries", {
    token,
    method: "POST",
    body: {
      title,
      content,
      campaign_id: campaignId,
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not create note.");
  }
  return response.json();
}

export async function updateUserNote(token, noteId, patch) {
  const body = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.content !== undefined) body.content = patch.content;
  if (patch.campaignId !== undefined) body.campaign_id = patch.campaignId;

  const response = await apiFetch(`/notes/entries/${noteId}`, {
    token,
    method: "PATCH",
    body,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not save note.");
  }
  return response.json();
}

export async function deleteUserNote(token, noteId) {
  const response = await apiFetch(`/notes/entries/${noteId}`, {
    token,
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Could not delete note.");
  }
}
