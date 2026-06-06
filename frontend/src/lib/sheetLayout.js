import { normalizeNotesText } from "./notesFormat";

export const DEFAULT_ZOOM = 1;
export const MIN_PANE_HEIGHT = 32;

export const INITIATIVE_ORIENTATION_VERTICAL = "vertical";
export const INITIATIVE_ORIENTATION_HORIZONTAL = "horizontal";

const HORIZONTAL_INIT_CARD_WIDTH = 108;
const HORIZONTAL_INIT_CARD_GAP = 8;
const HORIZONTAL_INIT_CHROME = 16;

/** Ideal pane width for horizontal initiative row; capped by caller to canvas bounds. */
export function computeHorizontalInitiativeWidth(combatantCount) {
  const count = Math.max(combatantCount, 3);
  return (
    HORIZONTAL_INIT_CHROME +
    count * HORIZONTAL_INIT_CARD_WIDTH +
    Math.max(0, count - 1) * HORIZONTAL_INIT_CARD_GAP
  );
}

export const PLAYER_WIDGET_TYPES = [
  { type: "combat", label: "Combat" },
  { type: "abilities", label: "Abilities" },
  { type: "skills_saves", label: "Skills & Saves" },
  { type: "character_tabs", label: "Character (Tabs)" },
  { type: "player_notes", label: "Notes" },
  { type: "vtt_zone", label: "VTT Zone" },
  { type: "initiative", label: "Initiative" },
];

export const DM_WIDGET_TYPES = [
  { type: "dm_rules_chat", label: "Rules AI" },
  { type: "dm_generators", label: "Generators" },
  { type: "dm_notes", label: "DM Notes" },
  { type: "dm_toolbox", label: "DM Toolbox" },
  { type: "initiative", label: "Initiative" },
  { type: "vtt_zone", label: "VTT Zone" },
];

export function defaultDmNotesTabs() {
  return [
    { id: "notes-session", title: "Session", content: "" },
    { id: "notes-plot", title: "Plot", content: "" },
  ];
}

export function defaultPlayerNotesTabs() {
  return [
    { id: "notes-session", title: "Session", content: "" },
    { id: "notes-character", title: "Character", content: "" },
  ];
}

function truncateTabTitle(title) {
  const text = String(title || "Encounter").trim() || "Encounter";
  return text.length <= 28 ? text : `${text.slice(0, 25)}…`;
}

/** Append an encounter tab to the DM Notes pane (creates the pane if missing). */
export function appendEncounterDmNotesTab(layout, { title, content }, canvasW, canvasH) {
  const tabId = `notes-enc-${Date.now()}`;
  const newTab = { id: tabId, title: truncateTabTitle(title), content };

  let notesWidget = layout.widgets.find((widget) => widget.type === "dm_notes");
  let widgets = layout.widgets;

  if (!notesWidget) {
    notesWidget = createWidget("dm_notes", canvasW || 1280, canvasH || 800);
    widgets = [...widgets, notesWidget];
  }

  const existingTabs =
    Array.isArray(notesWidget.dmNotesTabs) && notesWidget.dmNotesTabs.length
      ? notesWidget.dmNotesTabs
      : defaultDmNotesTabs();

  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          dmNotesTabs: [...existingTabs, newTab],
          activeNotesTabId: tabId,
        }
      : widget
  );

  return { ...layout, widgets: nextWidgets };
}

export const WIDGET_TYPES = [...PLAYER_WIDGET_TYPES, ...DM_WIDGET_TYPES];

export const SINGLETON_WIDGET_TYPES = new Set([
  "vtt_zone",
  "initiative",
  "player_notes",
  "dm_rules_chat",
  "dm_generators",
  "dm_toolbox",
  "dm_notes",
]);

export function isDmOnlyWidgetType(type) {
  return type.startsWith("dm_");
}

export function paneOptionsForSession(isDmSession) {
  return isDmSession ? DM_WIDGET_TYPES : PLAYER_WIDGET_TYPES;
}

/** Keep pane fully inside the viewport — can touch edges, never extend past them. */
export function clampWidget(widget, canvasW, canvasH) {
  if (!canvasW || !canvasH) return widget;

  const height = widget.minimized ? MIN_PANE_HEIGHT : Math.min(Math.max(120, widget.h), canvasH);
  const width = Math.min(Math.max(180, widget.w), canvasW);
  const maxX = Math.max(0, canvasW - width);
  const maxY = Math.max(0, canvasH - height);

  return {
    ...widget,
    w: width,
    h: height,
    x: Math.min(Math.max(0, widget.x), maxX),
    y: Math.min(Math.max(0, widget.y), maxY),
  };
}

export function clampWidgets(widgets, canvasW, canvasH) {
  return widgets.map((widget) => clampWidget(widget, canvasW, canvasH));
}

/** Scale pane positions and sizes proportionally when the viewport changes, then clamp. */
export function reflowWidgetsOnResize(widgets, prevW, prevH, nextW, nextH) {
  if (!prevW || !prevH || (prevW === nextW && prevH === nextH)) {
    return clampWidgets(widgets, nextW, nextH);
  }

  const scaleX = nextW / prevW;
  const scaleY = nextH / prevH;

  return widgets.map((widget) => {
    const expandedH = widget.expandedH ?? widget.h;
    const scaled = {
      ...widget,
      x: Math.round(widget.x * scaleX),
      y: Math.round(widget.y * scaleY),
      w: Math.round(widget.w * scaleX),
      expandedH: Math.round(expandedH * scaleY),
    };
    if (widget.minimized) {
      scaled.h = MIN_PANE_HEIGHT;
    } else {
      scaled.h = Math.round(expandedH * scaleY);
    }
    return clampWidget(scaled, nextW, nextH);
  });
}

export function vttZoneDefault(canvasW, canvasH) {
  const w = Math.min(560, Math.max(240, canvasW - 680));
  const h = Math.min(400, Math.max(160, canvasH - 160));
  return {
    x: Math.round((canvasW - w) / 2),
    y: Math.round((canvasH - h) / 2),
    w,
    h,
  };
}

export const DM_LAYOUT_STORAGE_PREFIX = "quest-terminal-dm-layout-";

export function readStoredDmLayout(campaignId) {
  if (!campaignId) return null;
  try {
    const raw = localStorage.getItem(`${DM_LAYOUT_STORAGE_PREFIX}${campaignId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStoredDmLayout(campaignId, layout) {
  if (!campaignId) return;
  try {
    localStorage.setItem(`${DM_LAYOUT_STORAGE_PREFIX}${campaignId}`, JSON.stringify(layout));
  } catch {
    // ignore quota errors
  }
}

export function buildDmDefaultLayout(canvasW, canvasH) {
  const margin = 16;
  const colW = 300;
  const leftX = margin;
  const rightX = Math.max(margin, canvasW - margin - colW);
  const vtt = vttZoneDefault(canvasW, canvasH);

  return {
    widgets: [
      {
        id: "dm-chat-1",
        type: "dm_rules_chat",
        x: leftX,
        y: margin,
        w: colW,
        h: 240,
        pinned: false,
        minimized: false,
      },
      {
        id: "dm-gen-1",
        type: "dm_generators",
        x: leftX,
        y: 264,
        w: colW,
        h: 280,
        pinned: false,
        minimized: false,
        dmGeneratorsTab: "encounter",
      },
      {
        id: "dm-toolbox-1",
        type: "dm_toolbox",
        x: leftX,
        y: 560,
        w: colW,
        h: Math.min(200, Math.max(140, canvasH - 576)),
        pinned: false,
        minimized: false,
        dmToolboxTab: "dice",
      },
      {
        id: "vtt-dm-1",
        type: "vtt_zone",
        x: vtt.x,
        y: vtt.y,
        w: vtt.w,
        h: vtt.h,
        pinned: false,
        minimized: false,
      },
      {
        id: "initiative-dm-1",
        type: "initiative",
        x: rightX,
        y: margin,
        w: colW,
        h: 280,
        pinned: false,
        minimized: false,
        initiativeOrientation: INITIATIVE_ORIENTATION_VERTICAL,
      },
      {
        id: "dm-notes-1",
        type: "dm_notes",
        x: rightX,
        y: 304,
        w: colW,
        h: Math.min(360, Math.max(200, canvasH - 320)),
        pinned: false,
        minimized: false,
        dmNotesTabs: defaultDmNotesTabs(),
        activeNotesTabId: "notes-session",
      },
    ],
    viewport: { scale: DEFAULT_ZOOM, canvasW, canvasH },
  };
}

export function buildDefaultLayout(canvasW, canvasH) {
  const colW = 300;
  const margin = 16;
  const leftX = margin;
  const rightX = Math.max(margin, canvasW - margin - colW);
  const vtt = vttZoneDefault(canvasW, canvasH);

  return {
    widgets: [
      { id: "combat-1", type: "combat", x: leftX, y: margin, w: colW, h: 220, pinned: false, minimized: false },
      {
        id: "abilities-1",
        type: "abilities",
        x: leftX,
        y: 248,
        w: colW,
        h: 188,
        pinned: false,
        minimized: false,
      },
      {
        id: "skills-1",
        type: "skills_saves",
        x: leftX,
        y: 456,
        w: colW,
        h: Math.min(340, canvasH - 472),
        pinned: false,
        minimized: false,
      },
      {
        id: "character-1",
        type: "character_tabs",
        x: rightX,
        y: margin,
        w: colW,
        h: 340,
        pinned: false,
        minimized: false,
      },
      {
        id: "player-notes-1",
        type: "player_notes",
        x: rightX,
        y: 364,
        w: colW,
        h: Math.min(400, Math.max(220, canvasH - 380)),
        pinned: false,
        minimized: false,
        playerNotesTabs: defaultPlayerNotesTabs(),
        activeNotesTabId: "notes-session",
      },
      {
        id: "vtt-1",
        type: "vtt_zone",
        x: vtt.x,
        y: vtt.y,
        w: vtt.w,
        h: vtt.h,
        pinned: false,
        minimized: false,
      },
    ],
    viewport: { scale: DEFAULT_ZOOM, canvasW: canvasW, canvasH: canvasH },
  };
}

export function defaultViewport(scale = DEFAULT_ZOOM, canvasW = null, canvasH = null) {
  return { scale, canvasW, canvasH };
}

export function withCanvasViewport(viewport, canvasW, canvasH) {
  return { ...viewport, canvasW, canvasH };
}

function ensureVttWidget(widgets, canvasW, canvasH) {
  if (widgets.some((widget) => widget.type === "vtt_zone")) {
    return widgets;
  }
  const vtt = vttZoneDefault(canvasW, canvasH);
  return [
    ...widgets,
    {
      id: "vtt-1",
      type: "vtt_zone",
      x: vtt.x,
      y: vtt.y,
      w: vtt.w,
      h: vtt.h,
      pinned: false,
      minimized: false,
    },
  ];
}

function normalizeWidget(widget) {
  const normalized = {
    ...widget,
    pinned: widget.pinned ?? false,
    minimized: widget.minimized ?? false,
    expandedH: widget.expandedH ?? widget.h,
  };
  if (widget.type === "initiative") {
    normalized.initiativeOrientation =
      widget.initiativeOrientation === INITIATIVE_ORIENTATION_HORIZONTAL
        ? INITIATIVE_ORIENTATION_HORIZONTAL
        : INITIATIVE_ORIENTATION_VERTICAL;
  }
  if (widget.type === "dm_generators") {
    normalized.dmGeneratorsTab = widget.dmGeneratorsTab === "npc" ? "npc" : "encounter";
  }
  if (widget.type === "dm_toolbox") {
    normalized.dmToolboxTab = ["dice", "session", "party"].includes(widget.dmToolboxTab)
      ? widget.dmToolboxTab
      : "dice";
  }
  if (widget.type === "dm_notes") {
    const tabs =
      Array.isArray(widget.dmNotesTabs) && widget.dmNotesTabs.length
        ? widget.dmNotesTabs.map((tab) => ({
            id: tab.id || `notes-${Date.now()}`,
            title: tab.title || "Notes",
            content: tab.content || "",
          }))
        : defaultDmNotesTabs();
    normalized.dmNotesTabs = tabs;
    normalized.activeNotesTabId = tabs.some((tab) => tab.id === widget.activeNotesTabId)
      ? widget.activeNotesTabId
      : tabs[0].id;
  }
  if (widget.type === "player_notes") {
    const tabs =
      Array.isArray(widget.playerNotesTabs) && widget.playerNotesTabs.length
        ? widget.playerNotesTabs.map((tab) => ({
            id: tab.id || `notes-${Date.now()}`,
            title: tab.title || "Notes",
            content: tab.content || "",
          }))
        : defaultPlayerNotesTabs();
    normalized.playerNotesTabs = tabs;
    normalized.activeNotesTabId = tabs.some((tab) => tab.id === widget.activeNotesTabId)
      ? widget.activeNotesTabId
      : tabs[0].id;
  }
  return normalized;
}

function ensurePlayerNotesWidget(widgets, canvasW, canvasH) {
  if (widgets.some((widget) => widget.type === "player_notes")) {
    return widgets;
  }
  const colW = 300;
  const margin = 16;
  const rightX = Math.max(margin, canvasW - margin - colW);
  return [
    ...widgets,
    {
      id: `player-notes-${Date.now()}`,
      type: "player_notes",
      x: rightX,
      y: Math.max(364, canvasH - 336),
      w: colW,
      h: Math.min(400, Math.max(220, canvasH - 380)),
      pinned: false,
      minimized: false,
      playerNotesTabs: defaultPlayerNotesTabs(),
      activeNotesTabId: "notes-session",
    },
  ];
}

/** Move legacy sheet/character notes into the player Notes pane Character tab. */
export function migrateLegacyNotesIntoLayout(layout, legacyNotes, canvasW, canvasH) {
  const trimmed = normalizeNotesText(legacyNotes);
  if (!trimmed) return { layout, migrated: false };

  let widgets = ensurePlayerNotesWidget(layout.widgets || [], canvasW, canvasH);
  const notesWidget = widgets.find((widget) => widget.type === "player_notes");
  if (!notesWidget) return { layout, migrated: false };

  const tabs = notesWidget.playerNotesTabs?.length
    ? notesWidget.playerNotesTabs
    : defaultPlayerNotesTabs();
  const characterTab =
    tabs.find((tab) => tab.id === "notes-character") || tabs.find((tab) => tab.title === "Character") || tabs[0];
  if (characterTab.content?.trim()) return { layout: { ...layout, widgets }, migrated: false };

  const nextTabs = tabs.map((tab) =>
    tab.id === characterTab.id ? { ...tab, content: trimmed } : tab
  );
  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          playerNotesTabs: nextTabs,
          activeNotesTabId: characterTab.id,
        }
      : widget
  );

  return {
    layout: { ...layout, widgets: nextWidgets },
    migrated: true,
  };
}

function recenterWidgets(widgets, canvasW, canvasH) {
  if (!widgets.length) return widgets;

  let minX = Infinity;
  let maxX = 0;

  for (const widget of widgets) {
    minX = Math.min(minX, widget.x);
    maxX = Math.max(maxX, widget.x + widget.w);
  }

  if (minX >= 16) return widgets;

  const dx = Math.round((canvasW - (maxX - minX)) / 2 - minX);
  if (dx === 0) return widgets;

  return widgets.map((widget) => ({
    ...widget,
    x: widget.x + dx,
    y: widget.y,
  }));
}

/** Apply a saved layout object without legacy migration checks (DM local layout, etc.). */
export function hydrateLayout(layout, canvasW = 1280, canvasH = 800) {
  if (!layout?.widgets?.length) return null;
  const layoutW = layout.viewport?.canvasW ?? canvasW;
  const layoutH = layout.viewport?.canvasH ?? canvasH;
  return {
    widgets: clampWidgets(layout.widgets.map(normalizeWidget), layoutW, layoutH),
    viewport: {
      scale: layout.viewport?.scale ?? DEFAULT_ZOOM,
      canvasW: layoutW,
      canvasH: layoutH,
    },
  };
}

export function parseLayout(layoutJson, canvasW = 1280, canvasH = 800) {
  if (!layoutJson) return buildDefaultLayout(canvasW, canvasH);
  try {
    const parsed = JSON.parse(layoutJson);
    const types = new Set((parsed.widgets || []).map((w) => w.type));
    const hasNewLayout = ["abilities", "skills_saves", "character_tabs"].some((t) => types.has(t));
    if (!parsed.widgets?.length || !hasNewLayout) {
      return buildDefaultLayout(canvasW, canvasH);
    }
    const layoutW = parsed.viewport?.canvasW ?? canvasW;
    const layoutH = parsed.viewport?.canvasH ?? canvasH;
    const widgets = clampWidgets(
      ensurePlayerNotesWidget(
        ensureVttWidget(recenterWidgets(parsed.widgets, layoutW, layoutH), layoutW, layoutH),
        layoutW,
        layoutH
      ).map(normalizeWidget),
      layoutW,
      layoutH
    );

    return {
      widgets,
      viewport: {
        scale: parsed.viewport?.scale ?? DEFAULT_ZOOM,
        canvasW: layoutW,
        canvasH: layoutH,
      },
    };
  } catch {
    return buildDefaultLayout(canvasW, canvasH);
  }
}

export function createWidget(type, canvasW, canvasH) {
  const defaults = {
    combat: { w: 280, h: 240 },
    abilities: { w: 300, h: 200 },
    skills_saves: { w: 300, h: 380 },
    character_tabs: { w: 300, h: 340 },
    player_notes: { w: 320, h: 360 },
    vtt_zone: vttZoneDefault(canvasW, canvasH),
    initiative: { w: 280, h: 320 },
    dm_rules_chat: { w: 300, h: 240 },
    dm_generators: { w: 300, h: 280 },
    dm_toolbox: { w: 300, h: 180 },
    dm_notes: { w: 320, h: 320 },
  };
  const size = defaults[type] || { w: 280, h: 280 };
  const widget = {
    id: `${type}-${Date.now()}`,
    type,
    x: Math.round(canvasW / 2 - size.w / 2),
    y: Math.round(canvasH / 2 - size.h / 2),
    w: size.w,
    h: size.h,
    pinned: false,
    minimized: false,
    expandedH: size.h,
    ...(type === "initiative" ? { initiativeOrientation: INITIATIVE_ORIENTATION_VERTICAL } : {}),
    ...(type === "dm_generators" ? { dmGeneratorsTab: "encounter" } : {}),
    ...(type === "dm_toolbox" ? { dmToolboxTab: "dice" } : {}),
    ...(type === "dm_notes"
      ? { dmNotesTabs: defaultDmNotesTabs(), activeNotesTabId: "notes-session" }
      : {}),
    ...(type === "player_notes"
      ? { playerNotesTabs: defaultPlayerNotesTabs(), activeNotesTabId: "notes-session" }
      : {}),
  };
  return clampWidget(widget, canvasW, canvasH);
}
