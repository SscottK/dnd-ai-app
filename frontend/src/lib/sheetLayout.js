import { normalizeNotesText } from "./notesFormat";

export const DEFAULT_ZOOM = 1;
export const MIN_PANE_HEIGHT = 32;
export const MIN_PANE_WIDTH = 260;
export const SESSION_MOBILE_MAX_WIDTH = 767;

/** DM panes surface first on narrow stacked layout. */
export const DM_MOBILE_STACK_ORDER = [
  "initiative",
  "party",
  "dm_generators",
  "dm_notes",
  "dm_rules_chat",
  "dm_toolbox",
  "vtt_zone",
];

export const PLAYER_MOBILE_STACK_ORDER = [
  "initiative",
  "combat",
  "character_tabs",
  "party",
  "dice_roller",
  "player_notes",
  "vtt_zone",
  "abilities",
  "skills_saves",
  "character_portrait",
];

const MOBILE_PANE_MIN_HEIGHTS = {
  initiative: 420,
  party: 180,
  dm_generators: 300,
  dm_notes: 280,
  dm_rules_chat: 320,
  dm_toolbox: 200,
  vtt_zone: 240,
  combat: 220,
  character_tabs: 360,
  dice_roller: 300,
  player_notes: 260,
  abilities: 200,
  skills_saves: 240,
  character_portrait: 200,
};

export function mobilePaneMinHeight(type) {
  return MOBILE_PANE_MIN_HEIGHTS[type] || 220;
}

export function sortWidgetsForMobileStack(widgets, { isDm = false } = {}) {
  const order = isDm ? DM_MOBILE_STACK_ORDER : PLAYER_MOBILE_STACK_ORDER;
  const rank = (type) => {
    const index = order.indexOf(type);
    return index === -1 ? 100 + (type || "").charCodeAt(0) : index;
  };
  return [...(widgets || [])].sort((left, right) => rank(left.type) - rank(right.type));
}

function dmSideColumnWidth(canvasW) {
  return Math.min(440, Math.max(MIN_PANE_WIDTH, Math.round(canvasW * 0.3)));
}

export const INITIATIVE_ORIENTATION_VERTICAL = "vertical";
export const INITIATIVE_ORIENTATION_HORIZONTAL = "horizontal";

export const PANE_ORIENTATION_VERTICAL = INITIATIVE_ORIENTATION_VERTICAL;
export const PANE_ORIENTATION_HORIZONTAL = INITIATIVE_ORIENTATION_HORIZONTAL;

const HORIZONTAL_INIT_CARD_WIDTH = 124;
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
  { type: "character_portrait", label: "Photo Album" },
  { type: "party", label: "Party" },
  { type: "player_notes", label: "Notes" },
  { type: "dice_roller", label: "Dice Roller" },
  { type: "vtt_zone", label: "VTT Zone" },
  { type: "initiative", label: "Initiative" },
];

export const DM_WIDGET_TYPES = [
  { type: "dm_rules_chat", label: "Rules AI" },
  { type: "dm_generators", label: "Generators" },
  { type: "dm_notes", label: "DM Notes" },
  { type: "dm_toolbox", label: "Dice Roller" },
  { type: "party", label: "Party" },
  { type: "initiative", label: "Initiative" },
  { type: "vtt_zone", label: "VTT Zone" },
];

export const NOTES_LOG_TAB_ID = "notes-log";
export const NOTES_LOG_TAB_TITLE = "Log";

export function defaultDmNotesTabs() {
  return [
    { id: "notes-session", title: "Session", content: "" },
    { id: NOTES_LOG_TAB_ID, title: NOTES_LOG_TAB_TITLE, content: "" },
    { id: "notes-plot", title: "Plot", content: "" },
  ];
}

export function defaultPlayerNotesTabs() {
  return [
    { id: "notes-session", title: "Session", content: "" },
    { id: NOTES_LOG_TAB_ID, title: NOTES_LOG_TAB_TITLE, content: "" },
    { id: "notes-character", title: "Character", content: "" },
  ];
}

function truncateTabTitle(title) {
  const text = String(title || "Encounter").trim() || "Encounter";
  return text.length <= 28 ? text : `${text.slice(0, 25)}…`;
}

function appendTextToSessionNotesTab(layout, combatLogText, widgetType, tabsKey, canvasW, canvasH) {
  let notesWidget = layout.widgets?.find((widget) => widget.type === widgetType);
  let widgets = layout.widgets || [];

  if (!notesWidget) {
    if (widgetType !== "dm_notes") return layout;
    notesWidget = createWidget("dm_notes", canvasW || 1280, canvasH || 800);
    widgets = [...widgets, notesWidget];
  }

  const existingTabs =
    Array.isArray(notesWidget[tabsKey]) && notesWidget[tabsKey].length
      ? notesWidget[tabsKey]
      : widgetType === "dm_notes"
        ? defaultDmNotesTabs()
        : defaultPlayerNotesTabs();

  const sessionTab =
    existingTabs.find((tab) => tab.id === "notes-session") || existingTabs[0] || {
      id: "notes-session",
      title: "Session",
      content: "",
    };

  const trimmed = String(sessionTab.content || "").trim();
  const separator = trimmed ? "\n\n---\n\n" : "";
  const nextSessionTab = {
    ...sessionTab,
    content: `${trimmed}${separator}${combatLogText}`,
  };

  const nextTabs = existingTabs.map((tab) =>
    tab.id === nextSessionTab.id ? nextSessionTab : tab
  );
  if (!nextTabs.some((tab) => tab.id === nextSessionTab.id)) {
    nextTabs.unshift(nextSessionTab);
  }

  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          [tabsKey]: nextTabs,
          activeNotesTabId: "notes-session",
        }
      : widget
  );

  return { ...layout, widgets: nextWidgets };
}

/** Ensure a play-session tab exists; optionally switch the active tab. */
export function ensurePlaySessionNotesTab(
  layout,
  tabId,
  tabTitle,
  {
    widgetType = "player_notes",
    tabsKey = "playerNotesTabs",
    canvasW,
    canvasH,
    switchActive = true,
  } = {}
) {
  if (!tabId || !tabTitle) return layout;

  let notesWidget = layout.widgets?.find((widget) => widget.type === widgetType);
  let widgets = layout.widgets || [];

  if (!notesWidget) {
    if (widgetType === "dm_notes") {
      notesWidget = createWidget("dm_notes", canvasW || 1280, canvasH || 800);
      widgets = [...widgets, notesWidget];
    } else {
      widgets = ensurePlayerNotesWidget(widgets, canvasW || 1280, canvasH || 800);
      notesWidget = widgets.find((widget) => widget.type === "player_notes");
    }
  }

  const existingTabs =
    Array.isArray(notesWidget[tabsKey]) && notesWidget[tabsKey].length
      ? notesWidget[tabsKey]
      : widgetType === "dm_notes"
        ? defaultDmNotesTabs()
        : defaultPlayerNotesTabs();

  const nextTabs = existingTabs.some((tab) => tab.id === tabId)
    ? existingTabs
    : [{ id: tabId, title: tabTitle, content: "" }, ...existingTabs];

  const priorActive = notesWidget.activeNotesTabId;
  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          [tabsKey]: nextTabs,
          activeNotesTabId: switchActive ? tabId : priorActive || tabId,
        }
      : widget
  );

  return { ...layout, widgets: nextWidgets };
}

/** Ensure session notes + session logs tabs exist (notes tab active). */
export function ensurePlaySessionTabs(
  layout,
  notesTabId,
  notesTabTitle,
  logsTabId,
  logsTabTitle,
  options = {}
) {
  if (!notesTabId || !notesTabTitle || !logsTabId || !logsTabTitle) return layout;
  let next = ensurePlaySessionNotesTab(layout, notesTabId, notesTabTitle, {
    ...options,
    switchActive: true,
  });
  next = ensurePlaySessionNotesTab(next, logsTabId, logsTabTitle, {
    ...options,
    switchActive: false,
  });
  return next;
}

function ensureNotesTabOnWidget(notesWidget, tabsKey, tabId, tabTitle) {
  const tabs = Array.isArray(notesWidget[tabsKey]) ? [...notesWidget[tabsKey]] : [];
  if (tabs.some((tab) => tab.id === tabId)) return tabs;
  return [{ id: tabId, title: tabTitle, content: "" }, ...tabs];
}

function appendTextToNamedNotesTab(
  layout,
  combatLogText,
  tabId,
  tabTitle,
  widgetType,
  tabsKey,
  canvasW,
  canvasH,
  switchActiveTab = false
) {
  let notesWidget = layout.widgets?.find((widget) => widget.type === widgetType);
  let widgets = layout.widgets || [];

  if (!notesWidget) {
    if (widgetType === "dm_notes") {
      notesWidget = createWidget("dm_notes", canvasW || 1280, canvasH || 800);
      widgets = [...widgets, notesWidget];
    } else if (widgetType === "player_notes") {
      widgets = ensurePlayerNotesWidget(widgets, canvasW || 1280, canvasH || 800);
      notesWidget = widgets.find((widget) => widget.type === "player_notes");
    } else {
      return layout;
    }
  }

  const nextTabs = ensureNotesTabOnWidget(notesWidget, tabsKey, tabId, tabTitle);
  const target = nextTabs.find((tab) => tab.id === tabId);
  if (!target) return layout;

  const trimmed = String(target.content || "").trim();
  const separator = trimmed ? "\n\n---\n\n" : "";
  const nextTarget = {
    ...target,
    content: `${trimmed}${separator}${combatLogText}`,
  };
  const mergedTabs = nextTabs.map((tab) => (tab.id === tabId ? nextTarget : tab));
  const priorActive = notesWidget.activeNotesTabId;

  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          [tabsKey]: mergedTabs,
          activeNotesTabId: switchActiveTab ? tabId : priorActive || tabId,
        }
      : widget
  );
  return { ...layout, widgets: nextWidgets };
}

/** Append a combat log block to the Log tab (does not switch away from the active tab). */
export function appendCombatLogToDmSessionNotes(
  layout,
  combatLogText,
  canvasW,
  canvasH,
  tabId = NOTES_LOG_TAB_ID,
  tabTitle = NOTES_LOG_TAB_TITLE
) {
  return appendTextToNamedNotesTab(
    layout,
    combatLogText,
    tabId,
    tabTitle,
    "dm_notes",
    "dmNotesTabs",
    canvasW,
    canvasH,
    false
  );
}

export function appendCombatLogToPlayerNotes(layout, combatLogText, canvasW, canvasH) {
  return appendTextToNamedNotesTab(
    layout,
    combatLogText,
    NOTES_LOG_TAB_ID,
    NOTES_LOG_TAB_TITLE,
    "player_notes",
    "playerNotesTabs",
    canvasW,
    canvasH,
    false
  );
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
  "party",
  "player_notes",
  "dice_roller",
  "character_portrait",
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

/** Layout coordinate space shrinks when the canvas is zoomed in via CSS scale. */
export function effectiveLayoutSize(canvasW, canvasH, viewportScale = 1) {
  const scale = Math.max(Number(viewportScale) || 1, 0.01);
  if (!canvasW || !canvasH) {
    return { width: canvasW || 0, height: canvasH || 0, scale };
  }
  return {
    width: canvasW / scale,
    height: canvasH / scale,
    scale,
  };
}

function widgetDisplayHeight(widget, maxH) {
  const height = widget.minimized ? MIN_PANE_HEIGHT : Math.max(120, widget.h);
  return maxH ? Math.min(height, maxH) : height;
}

function widgetVisibleRatio(widget, effW, effH) {
  const h = widgetDisplayHeight(widget, effH);
  const left = Math.max(widget.x, 0);
  const top = Math.max(widget.y, 0);
  const right = Math.min(widget.x + widget.w, effW);
  const bottom = Math.min(widget.y + h, effH);
  if (right <= left || bottom <= top) return 0;
  const visible = (right - left) * (bottom - top);
  return visible / Math.max(1, widget.w * h);
}

function widgetOverflowsBounds(widget, effW, effH, tolerance = 1) {
  const h = widgetDisplayHeight(widget, effH);
  return (
    widget.x < -tolerance ||
    widget.y < -tolerance ||
    widget.x + widget.w > effW + tolerance ||
    widget.y + h > effH + tolerance
  );
}

function widgetsOverlap(left, right, gap = 8) {
  const leftH = widgetDisplayHeight(left);
  const rightH = widgetDisplayHeight(right);
  return !(
    left.x + left.w + gap <= right.x ||
    right.x + right.w + gap <= left.x ||
    left.y + leftH + gap <= right.y ||
    right.y + rightH + gap <= left.y
  );
}

/** Keep pane fully inside the effective viewport (accounts for zoom). */
export function clampWidget(widget, canvasW, canvasH, viewportScale = 1) {
  if (!canvasW || !canvasH) return widget;

  const { width: effW, height: effH } = effectiveLayoutSize(canvasW, canvasH, viewportScale);
  const height = widget.minimized
    ? MIN_PANE_HEIGHT
    : Math.min(widgetDisplayHeight(widget, effH), effH);
  const width = Math.min(Math.max(MIN_PANE_WIDTH, widget.w), effW);
  const maxX = Math.max(0, effW - width);
  const maxY = Math.max(0, effH - height);

  return {
    ...widget,
    w: width,
    h: height,
    x: Math.min(Math.max(0, widget.x), maxX),
    y: Math.min(Math.max(0, widget.y), maxY),
  };
}

export function clampWidgets(widgets, canvasW, canvasH, viewportScale = 1) {
  return widgets.map((widget) => clampWidget(widget, canvasW, canvasH, viewportScale));
}

/** Move a pane back into view, pulling toward the center when it is mostly off-screen. */
export function nudgeWidgetIntoView(widget, canvasW, canvasH, viewportScale = 1) {
  if (!canvasW || !canvasH) return widget;

  const { width: effW, height: effH } = effectiveLayoutSize(canvasW, canvasH, viewportScale);
  const width = Math.min(Math.max(MIN_PANE_WIDTH, widget.w), effW);
  const height = widgetDisplayHeight(widget, effH);
  let x = widget.x;
  let y = widget.y;

  const ratio = widgetVisibleRatio({ ...widget, w: width, h: height }, effW, effH);
  const fullyInside =
    ratio >= 0.9 && x >= 0 && y >= 0 && x + width <= effW && y + height <= effH;
  if (fullyInside) {
    return clampWidget({ ...widget, w: width, h: height }, canvasW, canvasH, viewportScale);
  }

  if (ratio === 0) {
    x = Math.round((effW - width) / 2);
    y = Math.round((effH - height) / 2);
  } else {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + width > effW) x = Math.max(0, effW - width);
    if (y + height > effH) y = Math.max(0, effH - height);
    const afterClamp = widgetVisibleRatio({ ...widget, x, y, w: width, h: height }, effW, effH);
    if (afterClamp < 0.6) {
      const centerX = (effW - width) / 2;
      const centerY = (effH - height) / 2;
      x = Math.round(x * 0.3 + centerX * 0.7);
      y = Math.round(y * 0.3 + centerY * 0.7);
    }
  }

  return clampWidget({ ...widget, x, y, w: width, h: height }, canvasW, canvasH, viewportScale);
}

function widgetNeedsRecovery(widget, effW, effH) {
  return widgetOverflowsBounds(widget, effW, effH) || widgetVisibleRatio(widget, effW, effH) < 0.95;
}

function findOpenSlot(widget, placed, effW, effH, startX, startY, gap = 12) {
  const margin = 12;
  const width = Math.min(Math.max(MIN_PANE_WIDTH, widget.w), effW - margin * 2);
  const height = widgetDisplayHeight({ ...widget, w: width }, effH);
  const maxX = Math.max(margin, effW - margin - width);
  const maxY = Math.max(margin, effH - margin - height);

  let y = Math.max(margin, startY);
  while (y <= maxY) {
    let x = Math.max(margin, startX);
    while (x <= maxX) {
      const candidate = { ...widget, x, y, w: width, h: height };
      const inBounds =
        x >= margin &&
        y >= margin &&
        x + width <= effW - margin &&
        y + height <= effH - margin;
      if (inBounds && !placed.some((other) => widgetsOverlap(candidate, other))) {
        return { x, y, w: width, h: height };
      }
      x += gap + Math.min(120, width / 2);
    }
    y += gap + Math.min(80, height / 2);
  }

  const index = placed.length;
  return {
    x: Math.round((effW - width) / 2) + (index % 3) * 28,
    y: Math.round((effH - height) / 2) + Math.floor(index / 3) * 28,
    w: width,
    h: height,
  };
}

/** Clamp and nudge panes inside the canvas without re-slotting them to new positions. */
export function fitWidgetsToCanvas(widgets, canvasW, canvasH, viewportScale = 1) {
  return clampWidgets(widgets, canvasW, canvasH, viewportScale).map((widget) =>
    nudgeWidgetIntoView(widget, canvasW, canvasH, viewportScale)
  );
}

/** Recover panes after resize/zoom so none stay hidden outside the visible canvas. */
export function pullWidgetsIntoView(widgets, canvasW, canvasH, viewportScale = 1) {
  const { width: effW, height: effH } = effectiveLayoutSize(canvasW, canvasH, viewportScale);
  if (!effW || !effH) return widgets;

  const clamped = clampWidgets(widgets, canvasW, canvasH, viewportScale);
  const needsRecovery = clamped.filter((widget) => widgetNeedsRecovery(widget, effW, effH));
  if (!needsRecovery.length) return clamped;

  const placed = clamped.filter((widget) => !widgetNeedsRecovery(widget, effW, effH));
  const startX = Math.round(effW * 0.18);
  const startY = Math.round(effH * 0.14);
  const gap = 12;
  const recoveredById = new Map();

  for (const widget of [...needsRecovery].sort((left, right) => (left.z ?? 0) - (right.z ?? 0))) {
    const slot = findOpenSlot(widget, placed, effW, effH, startX, startY, gap);
    const next = clampWidget(
      { ...widget, x: slot.x, y: slot.y, w: slot.w, h: slot.h },
      canvasW,
      canvasH,
      viewportScale
    );
    recoveredById.set(widget.id, next);
    placed.push(next);
  }

  return clamped.map((widget) => recoveredById.get(widget.id) || widget);
}

/** True when pane footprint is out of proportion with the current canvas. */
export function layoutNeedsReflowForCanvas(widgets, canvasW, canvasH, viewportScale = 1) {
  if (!widgets?.length || !canvasW || !canvasH) return false;
  const { width: effW, height: effH } = effectiveLayoutSize(canvasW, canvasH, viewportScale);
  const { maxRight, maxBottom } = inferLayoutExtents(widgets);
  const margin = 16;
  if (maxRight > effW + margin || maxBottom > effH + margin) return true;
  return widgets.some((widget) => {
    const height = widget.minimized ? MIN_PANE_HEIGHT : widget.h ?? 0;
    return widget.w > effW - margin || height > effH - margin;
  });
}

/** Bounding box of all widgets in layout coordinates. */
export function inferLayoutExtents(widgets) {
  let maxRight = 0;
  let maxBottom = 0;
  for (const widget of widgets || []) {
    const height = widget?.minimized ? MIN_PANE_HEIGHT : widget?.h ?? 0;
    const width = widget?.w ?? 0;
    maxRight = Math.max(maxRight, (widget?.x ?? 0) + width);
    maxBottom = Math.max(maxBottom, (widget?.y ?? 0) + height);
  }
  return { maxRight, maxBottom };
}

/** Scale pane positions and sizes proportionally when the viewport changes, then clamp. */
export function reflowWidgetsOnResize(widgets, prevW, prevH, nextW, nextH, viewportScale = 1) {
  if (!prevW || !prevH || (prevW === nextW && prevH === nextH)) {
    return fitWidgetsToCanvas(widgets, nextW, nextH, viewportScale);
  }

  const scaleX = nextW / prevW;
  const scaleY = nextH / prevH;

  const scaled = widgets.map((widget) => {
    const expandedH = widget.expandedH ?? widget.h ?? MIN_PANE_HEIGHT;
    const currentH = widget.minimized ? MIN_PANE_HEIGHT : widget.h ?? expandedH;
    const next = {
      ...widget,
      x: Math.round(widget.x * scaleX),
      y: Math.round(widget.y * scaleY),
      w: Math.round(widget.w * scaleX),
      expandedH: Math.round(expandedH * scaleY),
      h: widget.minimized ? MIN_PANE_HEIGHT : Math.round(currentH * scaleY),
    };
    return clampWidget(next, nextW, nextH, viewportScale);
  });

  return fitWidgetsToCanvas(scaled, nextW, nextH, viewportScale);
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
  const colW = dmSideColumnWidth(canvasW);
  const leftX = margin;
  const rightX = Math.max(margin, canvasW - margin - colW);
  const vtt = vttZoneDefault(canvasW, canvasH);
  const initiativeH = Math.min(520, Math.max(380, Math.round(canvasH * 0.52)));
  const partyH = Math.min(200, Math.max(150, Math.round(canvasH * 0.18)));

  return {
    widgets: ensureWidgetZIndices([
      {
        id: "dm-chat-1",
        type: "dm_rules_chat",
        x: leftX,
        y: margin,
        w: colW,
        h: Math.min(300, Math.max(240, Math.round(canvasH * 0.28))),
        pinned: false,
        minimized: false,
      },
      {
        id: "dm-gen-1",
        type: "dm_generators",
        x: leftX,
        y: 264,
        w: colW,
        h: Math.min(340, Math.max(260, Math.round(canvasH * 0.32))),
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
        h: Math.min(220, Math.max(160, Math.round(canvasH * 0.2))),
        pinned: false,
        minimized: false,
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
        h: initiativeH,
        pinned: false,
        minimized: false,
        initiativeOrientation: INITIATIVE_ORIENTATION_VERTICAL,
      },
      {
        id: "party-dm-1",
        type: "party",
        x: rightX,
        y: margin + initiativeH + 12,
        w: colW,
        h: partyH,
        pinned: false,
        minimized: false,
      },
      {
        id: "dm-notes-1",
        type: "dm_notes",
        x: rightX,
        y: margin + initiativeH + 12 + partyH + 12,
        w: colW,
        h: Math.min(400, Math.max(240, canvasH - (margin + initiativeH + 200))),
        pinned: false,
        minimized: false,
        dmNotesTabs: defaultDmNotesTabs(),
        closedNotesTabs: [],
        activeNotesTabId: "notes-session",
      },
    ]),
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
    widgets: ensureWidgetZIndices([
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
        id: "portrait-1",
        type: "character_portrait",
        x: rightX,
        y: margin,
        w: colW,
        h: 180,
        pinned: false,
        minimized: false,
      },
      {
        id: "party-1",
        type: "party",
        x: rightX,
        y: 204,
        w: colW,
        h: 200,
        pinned: false,
        minimized: false,
      },
      {
        id: "character-1",
        type: "character_tabs",
        x: rightX,
        y: 420,
        w: colW,
        h: 240,
        pinned: false,
        minimized: false,
      },
      {
        id: "player-notes-1",
        type: "player_notes",
        x: rightX,
        y: 676,
        w: colW,
        h: Math.min(280, Math.max(160, canvasH - 692)),
        pinned: false,
        minimized: false,
        playerNotesTabs: defaultPlayerNotesTabs(),
        closedNotesTabs: [],
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
    ]),
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

export function ensureWidgetZIndices(widgets) {
  return widgets.map((widget, index) => ({
    ...widget,
    z: typeof widget.z === "number" ? widget.z : index + 1,
  }));
}

export function bringWidgetToFront(widgets, widgetId) {
  const maxZ = Math.max(0, ...widgets.map((widget) => widget.z ?? 0));
  const target = widgets.find((widget) => widget.id === widgetId);
  if (!target || (target.z ?? 0) >= maxZ) return widgets;
  return widgets.map((widget) =>
    widget.id === widgetId ? { ...widget, z: maxZ + 1 } : widget
  );
}

function normalizeNotesTabList(tabs, fallback) {
  const source = Array.isArray(tabs) && tabs.length ? tabs : fallback();
  return source.map((tab) => ({
    id: tab.id || `notes-${Date.now()}`,
    title: tab.title || "Notes",
    content: tab.content || "",
  }));
}

function normalizeWidget(widget) {
  const normalized = {
    ...widget,
    pinned: widget.pinned ?? false,
    minimized: widget.minimized ?? false,
    expandedH: widget.expandedH ?? widget.h,
    z: typeof widget.z === "number" ? widget.z : undefined,
  };
  if (widget.type === "initiative") {
    normalized.initiativeOrientation =
      widget.initiativeOrientation === INITIATIVE_ORIENTATION_HORIZONTAL
        ? INITIATIVE_ORIENTATION_HORIZONTAL
        : INITIATIVE_ORIENTATION_VERTICAL;
  }
  if (widget.type === "party" || widget.type === "abilities") {
    const key = widget.type === "party" ? "partyOrientation" : "abilitiesOrientation";
    normalized[key] =
      widget[key] === PANE_ORIENTATION_HORIZONTAL
        ? PANE_ORIENTATION_HORIZONTAL
        : PANE_ORIENTATION_VERTICAL;
  }
  if (widget.type === "dm_generators") {
    normalized.dmGeneratorsTab = widget.dmGeneratorsTab === "npc" ? "npc" : "encounter";
  }
  if (widget.type === "dm_notes") {
    const tabs = normalizeNotesTabList(widget.dmNotesTabs, defaultDmNotesTabs);
    normalized.dmNotesTabs = tabs;
    normalized.closedNotesTabs = normalizeNotesTabList(widget.closedNotesTabs, () => []);
    normalized.activeNotesTabId =
      tabs.length && tabs.some((tab) => tab.id === widget.activeNotesTabId)
        ? widget.activeNotesTabId
        : tabs[0]?.id ?? null;
  }
  if (widget.type === "player_notes") {
    const tabs = normalizeNotesTabList(widget.playerNotesTabs, defaultPlayerNotesTabs);
    normalized.playerNotesTabs = tabs;
    normalized.closedNotesTabs = normalizeNotesTabList(widget.closedNotesTabs, () => []);
    normalized.activeNotesTabId =
      tabs.length && tabs.some((tab) => tab.id === widget.activeNotesTabId)
        ? widget.activeNotesTabId
        : tabs[0]?.id ?? null;
  }
  return normalized;
}

function ensureCharacterPortraitWidget(widgets, canvasW, canvasH) {
  if (widgets.some((widget) => widget.type === "character_portrait")) {
    return widgets;
  }
  const colW = 300;
  const margin = 16;
  const rightX = Math.max(margin, canvasW - margin - colW);
  return [
    ...widgets,
    {
      id: `portrait-${Date.now()}`,
      type: "character_portrait",
      x: rightX,
      y: margin,
      w: colW,
      h: 200,
      pinned: false,
      minimized: false,
    },
  ];
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
      closedNotesTabs: [],
      activeNotesTabId: "notes-session",
    },
  ];
}

/** Keep player-written notes on re-sync; optionally fill Character tab from PDF notes. */
export function mergePlayerNotesOnResync(
  layout,
  preservedTabs,
  pdfNotes,
  canvasW,
  canvasH,
  preservedClosedTabs = []
) {
  const trimmedPdfNotes = normalizeNotesText(pdfNotes);
  let widgets = ensurePlayerNotesWidget(layout.widgets || [], canvasW, canvasH);
  const notesWidget = widgets.find((widget) => widget.type === "player_notes");
  if (!notesWidget) return { layout, changed: false };

  const incomingTabs = notesWidget.playerNotesTabs?.length
    ? notesWidget.playerNotesTabs
    : defaultPlayerNotesTabs();
  const incomingClosed = notesWidget.closedNotesTabs || [];
  const preservedById = Object.fromEntries((preservedTabs || []).map((tab) => [tab.id, tab]));
  const preservedClosedById = Object.fromEntries(
    (preservedClosedTabs || []).map((tab) => [tab.id, tab])
  );

  const nextTabs = incomingTabs.map((tab) => {
    const preserved = preservedById[tab.id];
    if (preserved?.content?.trim()) {
      return { ...tab, content: preserved.content };
    }
    if (tab.id === "notes-character" && trimmedPdfNotes) {
      return { ...tab, content: trimmedPdfNotes };
    }
    return tab;
  });

  for (const preserved of preservedTabs || []) {
    if (!nextTabs.some((tab) => tab.id === preserved.id) && preserved.content?.trim()) {
      nextTabs.push(preserved);
    }
  }

  const nextClosed = incomingClosed.map((tab) => preservedClosedById[tab.id] || tab);
  for (const preserved of preservedClosedTabs || []) {
    if (!nextClosed.some((tab) => tab.id === preserved.id)) {
      nextClosed.push(preserved);
    }
  }

  const changed =
    JSON.stringify(nextTabs) !== JSON.stringify(incomingTabs) ||
    JSON.stringify(nextClosed) !== JSON.stringify(incomingClosed);
  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? { ...widget, playerNotesTabs: nextTabs, closedNotesTabs: nextClosed }
      : widget
  );

  return {
    layout: { ...layout, widgets: nextWidgets },
    changed,
  };
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
  const scale = layout.viewport?.scale ?? DEFAULT_ZOOM;
  return {
    widgets: ensureWidgetZIndices(
      pullWidgetsIntoView(
        clampWidgets(
          layout.widgets.filter((widget) => widget.type !== "dm_combatants").map(normalizeWidget),
          layoutW,
          layoutH,
          scale
        ),
        layoutW,
        layoutH,
        scale
      )
    ),
    viewport: {
      scale,
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
    const scale = parsed.viewport?.scale ?? DEFAULT_ZOOM;
    const widgets = pullWidgetsIntoView(
      clampWidgets(
        ensureCharacterPortraitWidget(
          ensurePlayerNotesWidget(
            ensureVttWidget(recenterWidgets(parsed.widgets, layoutW, layoutH), layoutW, layoutH),
            layoutW,
            layoutH
          ),
          layoutW,
          layoutH
        ).map(normalizeWidget),
        layoutW,
        layoutH,
        scale
      ),
      layoutW,
      layoutH,
      scale
    );

    return {
      widgets: ensureWidgetZIndices(widgets),
      viewport: {
        scale,
        canvasW: layoutW,
        canvasH: layoutH,
      },
    };
  } catch {
    return buildDefaultLayout(canvasW, canvasH);
  }
}

export function createWidget(type, canvasW, canvasH) {
  const sideW = dmSideColumnWidth(canvasW);
  const defaults = {
    combat: { w: sideW, h: 260 },
    abilities: { w: sideW, h: 220 },
    skills_saves: { w: sideW, h: 400 },
    character_tabs: { w: sideW, h: 320 },
    character_portrait: { w: sideW, h: 220 },
    player_notes: { w: sideW, h: 380 },
    dice_roller: { w: sideW, h: 340 },
    vtt_zone: vttZoneDefault(canvasW, canvasH),
    initiative: { w: sideW, h: Math.min(480, Math.max(380, Math.round(canvasH * 0.5))) },
    party: { w: sideW, h: 200 },
    dm_rules_chat: { w: sideW, h: 280 },
    dm_generators: { w: sideW, h: 320 },
    dm_toolbox: { w: sideW, h: 200 },
    dm_notes: { w: sideW, h: 360 },
  };
  const size = defaults[type] || { w: sideW, h: 300 };
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
    ...(type === "party" ? { partyOrientation: PANE_ORIENTATION_VERTICAL } : {}),
    ...(type === "abilities" ? { abilitiesOrientation: PANE_ORIENTATION_VERTICAL } : {}),
    ...(type === "dm_generators" ? { dmGeneratorsTab: "encounter" } : {}),
    ...(type === "dm_notes"
      ? {
          dmNotesTabs: defaultDmNotesTabs(),
          closedNotesTabs: [],
          activeNotesTabId: "notes-session",
        }
      : {}),
    ...(type === "player_notes"
      ? {
          playerNotesTabs: defaultPlayerNotesTabs(),
          closedNotesTabs: [],
          activeNotesTabId: "notes-session",
        }
      : {}),
  };
  return clampWidget(widget, canvasW, canvasH);
}

/** Merge server-backed notes into the session layout notes widget. */
export function applyServerNotesToLayout(
  layout,
  notesDoc,
  { dmMode, canvasW, canvasH }
) {
  const widgetType = dmMode ? "dm_notes" : "player_notes";
  const tabsKey = dmMode ? "dmNotesTabs" : "playerNotesTabs";
  const base = layout && typeof layout === "object" ? layout : { widgets: [], viewport: {} };
  let widgets = [...(base.widgets || [])];
  let notesWidget = widgets.find((widget) => widget.type === widgetType);

  if (!notesWidget) {
    notesWidget = createWidget(widgetType, canvasW || 1280, canvasH || 800);
    widgets = [...widgets, notesWidget];
  }

  const tabs = Array.isArray(notesDoc?.tabs) ? notesDoc.tabs : [];
  const closedTabs = Array.isArray(notesDoc?.closedTabs) ? notesDoc.closedTabs : [];
  const activeTabId =
    notesDoc?.activeTabId || tabs[0]?.id || (dmMode ? "notes-session" : "notes-session");

  const nextWidgets = widgets.map((widget) =>
    widget.id === notesWidget.id
      ? {
          ...widget,
          [tabsKey]: tabs,
          closedNotesTabs: closedTabs,
          activeNotesTabId: activeTabId,
        }
      : widget
  );

  return { ...base, widgets: nextWidgets };
}

export function extractNotesPayloadFromLayout(layout, dmMode) {
  const widgetType = dmMode ? "dm_notes" : "player_notes";
  const tabsKey = dmMode ? "dmNotesTabs" : "playerNotesTabs";
  const widget = (layout?.widgets || []).find((item) => item.type === widgetType);
  if (!widget) return null;
  return {
    tabs: widget[tabsKey] || [],
    closedTabs: widget.closedNotesTabs || [],
    activeTabId: widget.activeNotesTabId || null,
  };
}

export function notesDocHasContent(notesDoc) {
  const tabs = [...(notesDoc?.tabs || []), ...(notesDoc?.closedTabs || [])];
  if (!tabs.length) return false;
  return tabs.some((tab) => String(tab?.content || "").trim().length > 0);
}
