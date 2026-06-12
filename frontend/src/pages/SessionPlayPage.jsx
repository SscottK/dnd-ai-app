import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, LayoutGrid, Plus, RotateCcw, Save, ScrollText, Swords } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch, apiUpload } from "../lib/api";
import {
  applyEquipmentToCharacter,
  parseSheetJson,
  sheetToJson,
} from "../lib/characterSheet";
import { useNestedPageLayout } from "../contexts/PageRefreshContext";
import { useMediaQuery, SESSION_MOBILE_QUERY } from "../hooks/useMediaQuery";
import { SheetPane } from "../components/sheet/SheetPane";
import { StackedSessionLayout } from "../components/sheet/StackedSessionLayout";
import { DetailSlideOver } from "../components/sheet/DetailSlideOver";
import { FullSheetModal } from "../components/sheet/FullSheetModal";
import { DiceRoller } from "../components/DiceRoller";
import { formatRollEntry, postActionRoll } from "../lib/actionRoll";
import { confirmPdfReplace } from "../lib/pdfReplace";
import {
  DmGeneratorsWidget,
  DmNotesWidget,
  DmRulesChatWidget,
  DmToolboxWidget,
} from "../components/sheet/DmToolWidgets";
import {
  AbilitiesWidget,
  CharacterTabsWidget,
  CombatWidget,
  SheetDataGuard,
  CharacterPortraitWidget,
  InitiativeWidget,
  PartyWidget,
  PlayerNotesWidget,
  SkillsSavesWidget,
  VttZoneWidget,
} from "../components/sheet/SessionSheetWidgets";
import {
  encounterTabTitle,
  formatEncounterNotesContent,
} from "../lib/encounterGen";
import {
  DEFAULT_ZOOM,
  MIN_PANE_HEIGHT,
  paneOptionsForSession,
  SINGLETON_WIDGET_TYPES,
  appendEncounterDmNotesTab,
  applyServerNotesToLayout,
  ensurePlaySessionNotesTab,
  extractNotesPayloadFromLayout,
  notesDocHasContent,
  clampWidget,
  bringWidgetToFront,
  buildDefaultLayout,
  buildDmDefaultLayout,
  clampWidgets,
  computeHorizontalInitiativeWidth,
  createWidget,
  defaultViewport,
  pullWidgetsIntoView,
  hydrateLayout,
  INITIATIVE_ORIENTATION_HORIZONTAL,
  PANE_ORIENTATION_HORIZONTAL,
  mergePlayerNotesOnResync,
  migrateLegacyNotesIntoLayout,
  parseLayout,
  readStoredDmLayout,
  reflowWidgetsOnResize,
  withCanvasViewport,
  WIDGET_TYPES,
  writeStoredDmLayout,
} from "../lib/sheetLayout";
import { NotesArchiveModal } from "../components/notes/NotesArchiveModal";
import {
  fetchCampaignNotes,
  saveCampaignNotes,
  serverNotesToClient,
} from "../lib/campaignNotes";

const WIDGET_LABELS = Object.fromEntries(WIDGET_TYPES.map((w) => [w.type, w.label]));

export function SessionPlayPage() {
  const { campaignId } = useParams();
  const { token, user } = useAuth();
  const [sessionStatus, setSessionStatus] = useState(null);
  const [character, setCharacter] = useState(null);
  const [sheet, setSheet] = useState(parseSheetJson(null));
  const [layout, setLayout] = useState(parseLayout(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paneMenuOpen, setPaneMenuOpen] = useState(false);
  const [fullSheetOpen, setFullSheetOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const saveTimer = useRef(null);
  const canvasRef = useRef(null);
  const paneMenuRef = useRef(null);
  const canvasBoundsRef = useRef({ width: 0, height: 0 });
  const boundsLockedRef = useRef(false);
  const interactingRef = useRef(false);
  const resizeSaveTimer = useRef(null);
  const layoutRef = useRef(layout);
  const characterRef = useRef(character);
  const sheetRef = useRef(sheet);
  const sessionStatusRef = useRef(sessionStatus);
  const lastCombatLogIdRef = useRef(null);
  const lastActionLogIdRef = useRef(null);
  const playSessionTabIdRef = useRef(null);
  const dirtyRef = useRef(false);
  const notesSaveTimer = useRef(null);
  const [combatActive, setCombatActive] = useState(false);
  const [notesArchiveOpen, setNotesArchiveOpen] = useState(false);
  const [checkRollMessage, setCheckRollMessage] = useState("");
  const [checkRollBusy, setCheckRollBusy] = useState(false);

  const characterId = sessionStatus?.character_id;
  const isDmSession =
    sessionStatus?.session_active && sessionStatus?.is_owner && !sessionStatus?.character_id;
  const isMobileSession = useMediaQuery(SESSION_MOBILE_QUERY);
  useNestedPageLayout(isMobileSession);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const measureCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return null;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }, []);

  const getCanvasBounds = useCallback(() => {
    const measured = measureCanvas();
    if (measured) {
      canvasBoundsRef.current = measured;
      return measured;
    }
    const cached = canvasBoundsRef.current;
    if (cached.width > 0 && cached.height > 0) return cached;
    return { width: 1280, height: 800 };
  }, [measureCanvas]);

  const startPaneInteraction = useCallback(() => {
    interactingRef.current = true;
  }, []);

  const endPaneInteraction = useCallback(() => {
    interactingRef.current = false;
  }, []);

  const captureCanvasBounds = useCallback(
    (force = false) => {
      if (boundsLockedRef.current && !force) {
        const { width, height } = canvasBoundsRef.current;
        return width > 0 && height > 0 ? { width, height } : null;
      }
      const size = measureCanvas();
      if (!size) return null;
      canvasBoundsRef.current = size;
      return size;
    },
    [measureCanvas]
  );

  const hydrateCharacter = useCallback((data, { applyLayout = true } = {}) => {
    const sheetData = parseSheetJson(data.sheet_json);
    const legacyNotes = [sheetData.notes, data.notes]
      .filter((value) => value && String(value).trim())
      .join("\n\n");
    if (legacyNotes) {
      sheetData.notes = "";
    }

    const nextCharacter = applyEquipmentToCharacter(data, sheetData);
    setSheet(sheetData);
    setCharacter(nextCharacter);
    sheetRef.current = sheetData;
    characterRef.current = nextCharacter;

    if (!applyLayout) return false;

    const { width, height } = canvasBoundsRef.current;
    const canvasW = width || 1280;
    const canvasH = height || 800;
    let nextLayout = parseLayout(data.layout_json, canvasW, canvasH);
    let migrated = false;

    if (legacyNotes) {
      const result = migrateLegacyNotesIntoLayout(nextLayout, legacyNotes, canvasW, canvasH);
      nextLayout = result.layout;
      migrated = result.migrated;
    }

    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    return migrated;
  }, []);

  const refreshPlaySheet = useCallback(async () => {
    const charId = characterRef.current?.id;
    if (!token || !charId) return;
    const res = await apiFetch(`/characters/${charId}`, { token });
    if (res.ok) hydrateCharacter(await res.json(), { applyLayout: false });
  }, [token, hydrateCharacter]);

  useLayoutEffect(() => {
    if (!sessionStatus?.session_active) {
      boundsLockedRef.current = false;
      return;
    }
    const dmMode = sessionStatus.is_owner && !sessionStatus.character_id;
    if (!character && !dmMode) {
      boundsLockedRef.current = false;
      return;
    }
    boundsLockedRef.current = false;
    const size = captureCanvasBounds(true);
    if (!size) return;
    boundsLockedRef.current = true;
    setLayout((prev) => {
      let base = prev;
      if (dmMode && !prev.widgets?.length) {
        base = buildDmDefaultLayout(size.width, size.height);
      }
      const prevW = base.viewport?.canvasW || size.width;
      const prevH = base.viewport?.canvasH || size.height;
      const viewportScale = base.viewport?.scale ?? DEFAULT_ZOOM;
      const widgets =
        prevW !== size.width || prevH !== size.height
          ? reflowWidgetsOnResize(
              base.widgets,
              prevW,
              prevH,
              size.width,
              size.height,
              viewportScale
            )
          : pullWidgetsIntoView(
              clampWidgets(base.widgets, size.width, size.height, viewportScale),
              size.width,
              size.height,
              viewportScale
            );
      const next = {
        ...base,
        widgets,
        viewport: withCanvasViewport(base.viewport, size.width, size.height),
      };
      if (dmMode) {
        writeStoredDmLayout(campaignId, next);
      }
      return next;
    });
  }, [
    campaignId,
    sessionStatus?.session_active,
    sessionStatus?.is_owner,
    sessionStatus?.character_id,
    character?.id,
    captureCanvasBounds,
  ]);

  useEffect(() => {
    if (!paneMenuOpen) return;
    const onPointerDown = (event) => {
      if (paneMenuRef.current && !paneMenuRef.current.contains(event.target)) {
        setPaneMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [paneMenuOpen]);

  const persistCharacter = useCallback(
    async (patch) => {
      const id = characterRef.current?.id ?? characterId;
      if (!token || !id) return;
      setSaving(true);
      try {
        const res = await apiFetch(`/characters/${id}`, {
          token,
          method: "PATCH",
          body: patch,
        });
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        const sheetData = parseSheetJson(data.sheet_json);
        const nextCharacter = applyEquipmentToCharacter(data, sheetData);
        setCharacter(nextCharacter);
        setSheet(sheetData);
        characterRef.current = nextCharacter;
        sheetRef.current = sheetData;
        setDirty(false);
      } catch (err) {
        console.error(err);
        setError("Failed to save changes.");
      } finally {
        setSaving(false);
      }
    },
    [token, characterId]
  );

  const scheduleSave = useCallback(
    (patch) => {
      const status = sessionStatusRef.current;
      if (status?.is_owner && !status?.character_id && patch.layout_json) {
        try {
          writeStoredDmLayout(campaignId, JSON.parse(patch.layout_json));
        } catch {
          // ignore malformed layout snapshots
        }
        return;
      }
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistCharacter(patch), 700);
    },
    [campaignId, persistCharacter]
  );

  const buildPatch = useCallback(
    (nextCharacter, nextSheet, nextLayout) => ({
      hp: nextCharacter?.hp,
      max_hp: nextCharacter?.max_hp,
      ac: nextCharacter?.ac,
      sheet_json: sheetToJson(nextSheet),
      layout_json: JSON.stringify(nextLayout),
    }),
    []
  );

  const persistNotesToServer = useCallback(
    async (layoutSnapshot) => {
      if (!token || !campaignId) return;
      const status = sessionStatusRef.current;
      const dmMode = Boolean(status?.is_owner && !status?.character_id);
      const payload = extractNotesPayloadFromLayout(layoutSnapshot, dmMode);
      if (!payload) return;
      try {
        await saveCampaignNotes(campaignId, token, payload);
      } catch (err) {
        console.error(err);
      }
    },
    [campaignId, token]
  );

  const scheduleNotesServerSave = useCallback(
    (layoutSnapshot) => {
      if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
      notesSaveTimer.current = setTimeout(() => {
        void persistNotesToServer(layoutSnapshot);
      }, 700);
    },
    [persistNotesToServer]
  );

  const refreshCampaignNotesFromServer = useCallback(async () => {
    if (!token || !campaignId) return;
    const status = sessionStatusRef.current;
    const dmMode = Boolean(status?.is_owner && !status?.character_id);
    const { width, height } = canvasBoundsRef.current;
    try {
      const data = await fetchCampaignNotes(campaignId, token);
      const clientDoc = serverNotesToClient(data);
      setLayout((prev) => {
        const next = applyServerNotesToLayout(prev, clientDoc, {
          dmMode,
          canvasW: width || 1280,
          canvasH: height || 800,
        });
        layoutRef.current = next;
        if (dmMode) {
          writeStoredDmLayout(campaignId, next);
        } else if (characterRef.current) {
          void persistCharacter(buildPatch(characterRef.current, sheetRef.current, next));
        }
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  }, [campaignId, token, buildPatch, persistCharacter]);

  const syncCampaignNotesOnLoad = useCallback(
    async (layoutSnapshot, dmMode) => {
      if (!token || !campaignId) return layoutSnapshot;
      const { width, height } = canvasBoundsRef.current;
      try {
        const data = await fetchCampaignNotes(campaignId, token);
        let clientDoc = serverNotesToClient(data);
        const localDoc = extractNotesPayloadFromLayout(layoutSnapshot, dmMode);
        if (localDoc && notesDocHasContent(localDoc) && !notesDocHasContent(clientDoc)) {
          await saveCampaignNotes(campaignId, token, localDoc);
          clientDoc = localDoc;
        }
        return applyServerNotesToLayout(layoutSnapshot, clientDoc, {
          dmMode,
          canvasW: width || 1280,
          canvasH: height || 800,
        });
      } catch {
        return layoutSnapshot;
      }
    },
    [campaignId, token]
  );

  const applyPlaySessionNotesTab = useCallback(
    (status, { save = false } = {}) => {
      const tabId = status?.play_session_notes_tab_id;
      const tabTitle = status?.play_session_notes_tab_title;
      if (!tabId || !tabTitle) return;

      const dmMode = Boolean(status?.is_owner && !status?.character_id);
      const { width, height } = canvasBoundsRef.current;
      const widgetType = dmMode ? "dm_notes" : "player_notes";
      const tabsKey = dmMode ? "dmNotesTabs" : "playerNotesTabs";

      setLayout((prev) => {
        const next = ensurePlaySessionNotesTab(prev, tabId, tabTitle, {
          widgetType,
          tabsKey,
          canvasW: width || 1280,
          canvasH: height || 800,
        });
        layoutRef.current = next;
        if (save) {
          if (dmMode) {
            writeStoredDmLayout(campaignId, next);
          } else if (characterRef.current) {
            void persistCharacter(buildPatch(characterRef.current, sheetRef.current, next));
          }
        }
        return next;
      });
    },
    [campaignId, persistCharacter, buildPatch]
  );

  const reloadDistributedNotesFromServer = useCallback(async () => {
    const charId = characterRef.current?.id;
    if (charId && token) {
      try {
        const res = await apiFetch(`/characters/${charId}`, { token });
        if (res.ok) {
          hydrateCharacter(await res.json(), { applyLayout: true });
        }
      } catch (err) {
        console.error(err);
      }
    }
    await refreshCampaignNotesFromServer();
  }, [token, hydrateCharacter, refreshCampaignNotesFromServer]);

  const handleActionLogEnded = useCallback(async () => {
    dirtyRef.current = false;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await reloadDistributedNotesFromServer();
  }, [reloadDistributedNotesFromServer]);

  const rollActionLogCheck = useCallback(
    async (body) => {
      if (!token || !campaignId || combatActive) return;
      setCheckRollBusy(true);
      setCheckRollMessage("");
      try {
        const data = await postActionRoll(campaignId, token, {
          character_id: characterRef.current?.id,
          ...body,
        });
        setCheckRollMessage(formatRollEntry(data.entry));
      } catch (err) {
        setCheckRollMessage(err.message || "Roll failed.");
      } finally {
        setCheckRollBusy(false);
      }
    },
    [token, campaignId, combatActive]
  );

  useEffect(() => {
    if (!token || !campaignId || !sessionStatus?.session_active) {
      setCombatActive(false);
      return undefined;
    }
    const pollEncounter = async () => {
      try {
        const res = await apiFetch(`/campaigns/${campaignId}/encounter`, { token });
        if (!res.ok) return;
        const data = await res.json();
        setCombatActive((data.combatants || []).length > 0);
      } catch {
        // ignore
      }
    };
    pollEncounter();
    const timer = setInterval(pollEncounter, 5000);
    return () => clearInterval(timer);
  }, [token, campaignId, sessionStatus?.session_active]);

  const handleCombatEnded = useCallback(async () => {
    dirtyRef.current = false;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await reloadDistributedNotesFromServer();
  }, [reloadDistributedNotesFromServer]);

  const loadSession = useCallback(async () => {
    if (!token || !campaignId) return;
    setLoading(true);
    setError("");
    try {
      const sessionRes = await apiFetch(`/campaigns/${campaignId}/session`, { token });
      if (!sessionRes.ok) throw new Error("Session not available");
      const status = await sessionRes.json();
      setSessionStatus(status);
      lastCombatLogIdRef.current = status.last_combat_log_id ?? null;
      lastActionLogIdRef.current = status.last_action_log_id ?? null;
      playSessionTabIdRef.current = status.play_session_notes_tab_id ?? null;

      if (!status.session_active) {
        setCharacter(null);
        return;
      }

      if (status.character_id) {
        const charRes = await apiFetch(`/characters/${status.character_id}`, { token });
        if (!charRes.ok) throw new Error("Character not found");
        const migrated = hydrateCharacter(await charRes.json());
        const { width, height } = canvasBoundsRef.current;
        let nextLayout = layoutRef.current;
        if (status.play_session_notes_tab_id && status.play_session_notes_tab_title) {
          nextLayout = ensurePlaySessionNotesTab(
            nextLayout,
            status.play_session_notes_tab_id,
            status.play_session_notes_tab_title,
            {
              widgetType: "player_notes",
              tabsKey: "playerNotesTabs",
              canvasW: width || 1280,
              canvasH: height || 800,
            }
          );
        }
        nextLayout = await syncCampaignNotesOnLoad(nextLayout, false);
        layoutRef.current = nextLayout;
        setLayout(nextLayout);
        if (migrated) {
          scheduleSave({
            ...buildPatch(characterRef.current, sheetRef.current, nextLayout),
            notes: "",
          });
        } else {
          scheduleSave(buildPatch(characterRef.current, sheetRef.current, nextLayout));
        }
        return;
      }

      if (status.is_owner) {
        setCharacter(null);
        setSheet(parseSheetJson(null));
        const stored = readStoredDmLayout(campaignId);
        const bootSize = measureCanvas() || canvasBoundsRef.current;
        const bootW = bootSize.width > 0 ? bootSize.width : 1280;
        const bootH = bootSize.height > 0 ? bootSize.height : 800;
        const hydrated = stored ? hydrateLayout(stored, bootW, bootH) : null;
        let nextLayout = hydrated || { widgets: [], viewport: defaultViewport(DEFAULT_ZOOM, bootW, bootH) };
        if (status.play_session_notes_tab_id && status.play_session_notes_tab_title) {
          nextLayout = ensurePlaySessionNotesTab(
            nextLayout,
            status.play_session_notes_tab_id,
            status.play_session_notes_tab_title,
            {
              widgetType: "dm_notes",
              tabsKey: "dmNotesTabs",
              canvasW: bootW,
              canvasH: bootH,
            }
          );
        }
        nextLayout = await syncCampaignNotesOnLoad(nextLayout, true);
        layoutRef.current = nextLayout;
        setLayout(nextLayout);
        writeStoredDmLayout(campaignId, nextLayout);
        return;
      }

      setCharacter(null);
    } catch (err) {
      console.error(err);
      setError("Could not load live session.");
    } finally {
      setLoading(false);
    }
  }, [token, campaignId, hydrateCharacter, scheduleSave, buildPatch, syncCampaignNotesOnLoad]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!token || !campaignId || !sessionStatus?.session_active) return;

    const pollNotes = async () => {
      try {
        const res = await apiFetch(`/campaigns/${campaignId}/session`, { token });
        if (!res.ok) return;
        const status = await res.json();
        const playTabId = status.play_session_notes_tab_id ?? null;
        if (playTabId && playTabId !== playSessionTabIdRef.current) {
          playSessionTabIdRef.current = playTabId;
          applyPlaySessionNotesTab(status, { save: true });
        }

        const logId = status.last_combat_log_id ?? null;
        if (logId != null && logId !== lastCombatLogIdRef.current) {
          lastCombatLogIdRef.current = logId;
          await handleCombatEnded();
          return;
        }

        const actionLogId = status.last_action_log_id ?? null;
        if (actionLogId != null && actionLogId !== lastActionLogIdRef.current) {
          lastActionLogIdRef.current = actionLogId;
          await handleActionLogEnded();
          return;
        }

        const charId = status.character_id ?? characterRef.current?.id;
        if (!charId) return;

        const charRes = await apiFetch(`/characters/${charId}`, { token });
        if (!charRes.ok) return;
        const data = await charRes.json();
        const current = characterRef.current;
        const sheetData = parseSheetJson(data.sheet_json);
        const conditionsChanged =
          JSON.stringify(sheetData.conditions || []) !==
          JSON.stringify(sheetRef.current?.conditions || []);
        const resourcesChanged =
          JSON.stringify(sheetData.resources || []) !==
          JSON.stringify(sheetRef.current?.resources || []);

        if (dirtyRef.current) {
          if (resourcesChanged && current) {
            const mergedSheet = { ...sheetRef.current, resources: sheetData.resources };
            sheetRef.current = mergedSheet;
            setSheet(mergedSheet);
            setCharacter({ ...current, hp: data.hp, max_hp: data.max_hp, ac: data.ac });
          }
          return;
        }

        if (
          !current ||
          data.hp !== current.hp ||
          data.max_hp !== current.max_hp ||
          data.ac !== current.ac ||
          conditionsChanged ||
          resourcesChanged
        ) {
          hydrateCharacter(data, { applyLayout: false });
        }
      } catch {
        // ignore polling errors
      }
    };

    pollNotes();
    const timer = setInterval(pollNotes, 8000);
    return () => clearInterval(timer);
  }, [token, campaignId, sessionStatus?.session_active, hydrateCharacter, applyPlaySessionNotesTab, handleCombatEnded, handleActionLogEnded, reloadDistributedNotesFromServer]);

  const saveLayoutSnapshot = useCallback(
    (nextLayout) => {
      layoutRef.current = nextLayout;
      const status = sessionStatusRef.current;
      if (status?.is_owner && !status?.character_id) {
        writeStoredDmLayout(campaignId, nextLayout);
        return;
      }
      if (!characterRef.current) return;
      scheduleSave(buildPatch(characterRef.current, sheetRef.current, nextLayout));
    },
    [campaignId, scheduleSave, buildPatch]
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !sessionStatus?.session_active) return;
    if (!character && !(sessionStatus.is_owner && !sessionStatus.character_id)) return;

    const applyLayoutRecovery = (width, height, { reflow = false, prevW, prevH } = {}) => {
      if (width <= 0 || height <= 0) return;

      setLayout((prevLayout) => {
        const viewportScale = prevLayout.viewport?.scale ?? DEFAULT_ZOOM;
        const widgets = reflow
          ? reflowWidgetsOnResize(
              prevLayout.widgets,
              prevW,
              prevH,
              width,
              height,
              viewportScale
            )
          : pullWidgetsIntoView(
              prevLayout.widgets,
              width,
              height,
              viewportScale
            );
        const next = {
          ...prevLayout,
          widgets,
          viewport: withCanvasViewport(prevLayout.viewport, width, height),
        };
        layoutRef.current = next;
        return next;
      });
    };

    const applyCanvasResize = (nextW, nextH) => {
      if (nextW <= 0 || nextH <= 0) return;

      const prev = canvasBoundsRef.current;
      if (prev.width === nextW && prev.height === nextH) return;

      const prevW = prev.width > 0 ? prev.width : nextW;
      const prevH = prev.height > 0 ? prev.height : nextH;
      canvasBoundsRef.current = { width: nextW, height: nextH };

      applyLayoutRecovery(nextW, nextH, { reflow: true, prevW, prevH });

      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = setTimeout(() => {
        saveLayoutSnapshot(layoutRef.current);
      }, 500);
    };

    const finalizeCanvasResize = () => {
      const { width, height } = canvasBoundsRef.current;
      if (width <= 0 || height <= 0) return;
      applyLayoutRecovery(width, height, { reflow: false });
      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      resizeSaveTimer.current = setTimeout(() => {
        saveLayoutSnapshot(layoutRef.current);
      }, 500);
    };

    let raf = 0;
    let resizeEndTimer = null;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        applyCanvasResize(Math.round(width), Math.round(height));
        if (resizeEndTimer) clearTimeout(resizeEndTimer);
        resizeEndTimer = setTimeout(finalizeCanvasResize, 120);
      });
    });

    const onWindowResize = () => {
      const measured = measureCanvas();
      if (!measured) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        applyCanvasResize(measured.width, measured.height);
        if (resizeEndTimer) clearTimeout(resizeEndTimer);
        resizeEndTimer = setTimeout(finalizeCanvasResize, 120);
      });
    };

    observer.observe(el);
    window.addEventListener("resize", onWindowResize);
    return () => {
      cancelAnimationFrame(raf);
      if (resizeEndTimer) clearTimeout(resizeEndTimer);
      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      window.removeEventListener("resize", onWindowResize);
      observer.disconnect();
    };
  }, [
    sessionStatus?.session_active,
    sessionStatus?.is_owner,
    sessionStatus?.character_id,
    character?.id,
    saveLayoutSnapshot,
    measureCanvas,
  ]);

  const onCombatChange = (patch) => {
    const next = { ...character, ...patch };
    setCharacter(next);
    scheduleSave(buildPatch(next, sheet, layout));
  };

  const onSheetChange = useCallback(
    (nextSheet, { immediate = false } = {}) => {
      const nextCharacter = applyEquipmentToCharacter(characterRef.current, nextSheet);
      sheetRef.current = nextSheet;
      characterRef.current = nextCharacter;
      setSheet(nextSheet);
      setCharacter(nextCharacter);
      const patch = buildPatch(nextCharacter, nextSheet, layoutRef.current);
      if (immediate) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setDirty(true);
        void persistCharacter(patch);
        return;
      }
      scheduleSave(patch);
    },
    [scheduleSave, buildPatch, persistCharacter]
  );

  const updateWidget = (widget) => {
    const { width, height } = canvasBoundsRef.current;
    const viewportScale = layoutRef.current.viewport?.scale ?? DEFAULT_ZOOM;
    const bounded = clampWidget(widget, width, height, viewportScale);
    setLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === widget.id ? bounded : w)),
    }));
  };

  const commitLayout = useCallback(
    (widget) => {
      const { width, height } = canvasBoundsRef.current;
      const prev = layoutRef.current;
      const next = {
        ...(widget
          ? {
              ...prev,
              widgets: prev.widgets.map((w) => (w.id === widget.id ? widget : w)),
            }
          : prev),
        viewport: withCanvasViewport(prev.viewport, width, height),
      };
      layoutRef.current = next;
      setLayout(next);
      saveLayoutSnapshot(next);
    },
    [saveLayoutSnapshot]
  );

  const updateWidgetMeta = useCallback(
    (widgetId, patch) => {
      const prev = layoutRef.current;
      const nextWidgets = prev.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w));
      const nextLayout = { ...prev, widgets: nextWidgets };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
      if (
        patch.playerNotesTabs ||
        patch.dmNotesTabs ||
        patch.closedNotesTabs ||
        patch.activeNotesTabId
      ) {
        scheduleNotesServerSave(nextLayout);
      }
    },
    [saveLayoutSnapshot, scheduleNotesServerSave]
  );

  const handleDeletedArchivedTab = useCallback(
    (tab) => {
      const prev = layoutRef.current;
      const widgetType = isDmSession ? "dm_notes" : "player_notes";
      const tabsKey = isDmSession ? "dmNotesTabs" : "playerNotesTabs";
      const notesWidget = prev.widgets.find((widget) => widget.type === widgetType);
      if (!notesWidget) return;

      const nextTabs = (notesWidget[tabsKey] || []).filter((item) => item.id !== tab.id);
      const nextClosed = (notesWidget.closedNotesTabs || []).filter((item) => item.id !== tab.id);
      const nextActive =
        notesWidget.activeNotesTabId === tab.id
          ? nextTabs[0]?.id ?? null
          : notesWidget.activeNotesTabId;

      updateWidgetMeta(notesWidget.id, {
        [tabsKey]: nextTabs,
        closedNotesTabs: nextClosed,
        activeNotesTabId: nextActive,
      });
    },
    [isDmSession, updateWidgetMeta]
  );

  const handleImportArchivedTab = useCallback(
    (tab) => {
      const prev = layoutRef.current;
      const widgetType = isDmSession ? "dm_notes" : "player_notes";
      const tabsKey = isDmSession ? "dmNotesTabs" : "playerNotesTabs";
      const notesWidget = prev.widgets.find((widget) => widget.type === widgetType);
      if (!notesWidget) return;

      const existingTabs = notesWidget[tabsKey] || [];
      const nextClosed = (notesWidget.closedNotesTabs || []).filter((item) => item.id !== tab.id);
      const nextTabs = existingTabs.some((item) => item.id === tab.id)
        ? existingTabs.map((item) =>
            item.id === tab.id
              ? {
                  ...item,
                  title: tab.title || item.title,
                  content: tab.content || item.content,
                }
              : item
          )
        : [...existingTabs, { id: tab.id, title: tab.title, content: tab.content || "" }];

      updateWidgetMeta(notesWidget.id, {
        [tabsKey]: nextTabs,
        closedNotesTabs: nextClosed,
        activeNotesTabId: tab.id,
      });
      setNotesArchiveOpen(false);
    },
    [isDmSession, updateWidgetMeta]
  );

  const addEncounterToDmNotes = useCallback(
    (encounter) => {
      const { width, height } = canvasBoundsRef.current;
      const prev = layoutRef.current;
      const title = encounterTabTitle(encounter);
      const content = formatEncounterNotesContent(encounter);
      const nextLayout = appendEncounterDmNotesTab(prev, { title, content }, width, height);
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
      scheduleNotesServerSave(nextLayout);
    },
    [saveLayoutSnapshot, scheduleNotesServerSave]
  );

  const setInitiativeOrientation = useCallback(
    (widgetId, orientation, combatantCount = 0) => {
      const { width: canvasW, height: canvasH } = canvasBoundsRef.current;
      const prev = layoutRef.current;
      const nextWidgets = prev.widgets.map((w) => {
        if (w.id !== widgetId) return w;
        let next = { ...w, initiativeOrientation: orientation };
        if (orientation === INITIATIVE_ORIENTATION_HORIZONTAL) {
          const idealW = computeHorizontalInitiativeWidth(combatantCount);
          const maxW = Math.max(180, canvasW - w.x);
          next.w = Math.min(Math.max(idealW, w.w), maxW);
          next.h = Math.min(Math.max(160, w.h), Math.max(120, canvasH - w.y));
        }
        const viewportScale = prev.viewport?.scale ?? DEFAULT_ZOOM;
        return clampWidget(next, canvasW, canvasH, viewportScale);
      });
      const nextLayout = { ...prev, widgets: nextWidgets };
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
    },
    [saveLayoutSnapshot]
  );

  const setWidgetOrientation = useCallback(
    (widgetId, orientationKey, orientation) => {
      const { width: canvasW, height: canvasH } = canvasBoundsRef.current;
      const prev = layoutRef.current;
      const nextWidgets = prev.widgets.map((w) => {
        if (w.id !== widgetId) return w;
        let next = { ...w, [orientationKey]: orientation };
        if (orientation === PANE_ORIENTATION_HORIZONTAL && w.type === "party") {
          const memberCount = 4;
          const idealW = Math.min(canvasW - w.x, Math.max(w.w, 180 + memberCount * 120));
          next.w = idealW;
          next.h = Math.min(Math.max(180, w.h), Math.max(140, canvasH - w.y));
        }
        const viewportScale = prev.viewport?.scale ?? DEFAULT_ZOOM;
        return clampWidget(next, canvasW, canvasH, viewportScale);
      });
      const nextLayout = { ...prev, widgets: nextWidgets };
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
    },
    [saveLayoutSnapshot]
  );

  const togglePin = (id) => {
    const nextLayout = {
      ...layout,
      widgets: layout.widgets.map((w) =>
        w.id === id ? { ...w, pinned: !w.pinned } : w
      ),
    };
    setLayout(nextLayout);
    saveLayoutSnapshot(nextLayout);
  };

  const toggleMinimize = (id) => {
    const nextLayout = {
      ...layout,
      widgets: layout.widgets.map((w) => {
        if (w.id !== id) return w;
        const next = w.minimized
          ? { ...w, minimized: false, h: w.expandedH || w.h || 200, expandedH: w.expandedH || w.h || 200 }
          : { ...w, minimized: true, expandedH: w.h, h: MIN_PANE_HEIGHT };
        const { width, height } = canvasBoundsRef.current;
        const viewportScale = layoutRef.current.viewport?.scale ?? DEFAULT_ZOOM;
        return clampWidget(next, width, height, viewportScale);
      }),
    };
    setLayout(nextLayout);
    saveLayoutSnapshot(nextLayout);
  };

  const removeWidget = (id) => {
    const nextLayout = {
      ...layout,
      widgets: layout.widgets.filter((w) => w.id !== id),
    };
    setLayout(nextLayout);
    saveLayoutSnapshot(nextLayout);
  };

  const focusWidget = useCallback(
    (widgetId) => {
      const { width, height } = canvasBoundsRef.current;
      const prev = layoutRef.current;
      const viewportScale = prev.viewport?.scale ?? DEFAULT_ZOOM;
      const nextWidgets = bringWidgetToFront(prev.widgets, widgetId).map((widget) =>
        widget.id === widgetId
          ? clampWidget(widget, width, height, viewportScale)
          : widget
      );
      const nextLayout = { ...prev, widgets: nextWidgets };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
    },
    [saveLayoutSnapshot]
  );

  const addWidget = (type) => {
    const maxZ = Math.max(0, ...layout.widgets.map((widget) => widget.z ?? 0));
    const nextLayout = {
      ...layout,
      widgets: [
        ...layout.widgets,
        {
          ...createWidget(
            type,
            canvasBoundsRef.current.width || 1280,
            canvasBoundsRef.current.height || 800
          ),
          z: maxZ + 1,
        },
      ],
    };
    setLayout(nextLayout);
    saveLayoutSnapshot(nextLayout);
    setPaneMenuOpen(false);
  };

  const setViewport = (viewport, { save = true } = {}) => {
    const { width, height } = canvasBoundsRef.current;
    setLayout((prev) => {
      const nextViewport = { ...prev.viewport, ...viewport, canvasW: width, canvasH: height };
      const scale = nextViewport.scale ?? DEFAULT_ZOOM;
      const nextLayout = {
        ...prev,
        viewport: nextViewport,
        widgets: pullWidgetsIntoView(prev.widgets, width, height, scale),
      };
      layoutRef.current = nextLayout;
      if (save) {
        saveLayoutSnapshot(nextLayout);
      }
      return nextLayout;
    });
  };

  const resetZoom = () => {
    const { width, height } = canvasBoundsRef.current;
    setViewport(defaultViewport(DEFAULT_ZOOM, width || null, height || null));
  };

  const resetLayout = () => {
    const size = captureCanvasBounds(true);
    const width = size?.width || canvasBoundsRef.current.width || 1280;
    const height = size?.height || canvasBoundsRef.current.height || 800;
    boundsLockedRef.current = true;
    const nextLayout = isDmSession
      ? buildDmDefaultLayout(width, height)
      : buildDefaultLayout(width, height);
    setLayout(nextLayout);
    if (isDmSession) {
      writeStoredDmLayout(campaignId, nextLayout);
    } else {
      scheduleSave(buildPatch(character, sheet, nextLayout));
    }
  };

  const applyPdfRefreshPayload = useCallback(
    async (data) => {
      const preservedNotesWidget = layoutRef.current.widgets?.find(
        (widget) => widget.type === "player_notes"
      );
      const preservedNotesTabs = preservedNotesWidget?.playerNotesTabs || [];
      const preservedClosedNotesTabs = preservedNotesWidget?.closedNotesTabs || [];
      const preservedEquippedOverrides = sheetRef.current?.equipped_overrides || {};

      if (Object.keys(preservedEquippedOverrides).length > 0 && data.sheet_json) {
        try {
          const mergedSheet = JSON.parse(data.sheet_json);
          mergedSheet.equipped_overrides = {
            ...(mergedSheet.equipped_overrides || {}),
            ...preservedEquippedOverrides,
          };
          if (Array.isArray(mergedSheet.inventory)) {
            mergedSheet.inventory = mergedSheet.inventory.map((item) => {
              const key = String(item.name || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
              if (Object.prototype.hasOwnProperty.call(mergedSheet.equipped_overrides, key)) {
                return { ...item, equipped: !!mergedSheet.equipped_overrides[key] };
              }
              return item;
            });
          }
          data.sheet_json = JSON.stringify(mergedSheet);
        } catch {
          // keep server payload if merge fails
        }
      }

      const notesMigrated = hydrateCharacter(data);
      const { width, height } = canvasBoundsRef.current;
      const canvasW = width || 1280;
      const canvasH = height || 800;
      const sheetData = parseSheetJson(data.sheet_json);
      const notesMerge = mergePlayerNotesOnResync(
        layoutRef.current,
        preservedNotesTabs,
        sheetData.notes,
        canvasW,
        canvasH,
        preservedClosedNotesTabs
      );

      if (notesMerge.changed || notesMigrated) {
        layoutRef.current = notesMerge.layout;
        setLayout(notesMerge.layout);
        scheduleSave(buildPatch(characterRef.current, sheetRef.current, notesMerge.layout));
      }
    },
    [hydrateCharacter, scheduleSave, buildPatch]
  );

  const handleResyncPdf = async () => {
    if (!token || !characterId) return;

    setSyncing(true);
    setError("");
    try {
      const res = await apiFetch(`/characters/${characterId}/refresh-from-pdf`, {
        token,
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Re-sync failed");
      }
      await applyPdfRefreshPayload(await res.json());
    } catch (err) {
      setError(err.message || "Could not re-sync from PDF.");
    } finally {
      setSyncing(false);
    }
  };

  const handleUploadPdf = async (file) => {
    if (!token || !characterId || !file) return;
    if (
      !confirmPdfReplace({
        characterName: character?.name,
        hasExistingPdf: Boolean(character?.pdf_url),
      })
    ) {
      return;
    }

    setUploadingPdf(true);
    setError("");
    try {
      const res = await apiUpload(`/characters/${characterId}/upload-pdf`, { token, file });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "PDF upload failed");
      }
      await applyPdfRefreshPayload(await res.json());
    } catch (err) {
      setError(err.message || "Could not upload PDF.");
    } finally {
      setUploadingPdf(false);
    }
  };

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!characterRef.current) return;
    await persistCharacter(
      buildPatch(characterRef.current, sheetRef.current, layoutRef.current)
    );
  }, [persistCharacter, buildPatch]);

  const handleFullSheetClose = async () => {
    try {
      await flushPendingSave();
    } catch {
      // persistCharacter already surfaces errors
    }
    setFullSheetOpen(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!character && !isDmSession)) return;

    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      const nextScale = Math.min(1.25, Math.max(0.75, layout.viewport.scale + delta));
      setViewport({ scale: nextScale }, { save: true });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [layout.viewport.scale, setViewport, character, isDmSession]);

  const showDetail = (payload) => setDetail(payload);

  const sheetPanePlaceholder = (
    <p className="text-[10px] font-mono text-ink-faint">
      Join this campaign with a character to use sheet panes. As DM you can run Initiative and VTT
      panes here.
    </p>
  );

  const renderWidgetBody = (widget) => {
    const guard = (content) => {
      if (!character) return sheetPanePlaceholder;
      return (
        <SheetDataGuard sheet={sheet} character={character} onOpenFullSheet={() => setFullSheetOpen(true)}>
          {content}
        </SheetDataGuard>
      );
    };

    switch (widget.type) {
      case "combat":
        return character ? (
          <CombatWidget
            character={character}
            sheet={sheet}
            onCombatChange={onCombatChange}
            onSheetChange={onSheetChange}
            onShowDetail={showDetail}
          />
        ) : (
          sheetPanePlaceholder
        );
      case "abilities":
        return guard(
          <AbilitiesWidget
            sheet={sheet}
            onShowDetail={showDetail}
            onSheetChange={onSheetChange}
            orientation={widget.abilitiesOrientation}
            onOrientationChange={(nextOrientation) =>
              setWidgetOrientation(widget.id, "abilitiesOrientation", nextOrientation)
            }
          />
        );
      case "skills_saves":
        return guard(
          <SkillsSavesWidget
            sheet={sheet}
            onShowDetail={showDetail}
            onRollCheck={combatActive ? undefined : rollActionLogCheck}
            lastRollMessage={checkRollMessage}
            rollBusy={checkRollBusy}
          />
        );
      case "character_tabs":
        return guard(
          <CharacterTabsWidget sheet={sheet} onSheetChange={onSheetChange} onShowDetail={showDetail} />
        );
      case "character_portrait":
        return character ? (
          <CharacterPortraitWidget
            characterId={character.id}
            portraitUrl={character.portrait_url}
            portraitPhotoId={character.portrait_photo_id}
            characterName={character.name}
            token={token}
            onPortraitChange={(data) => {
              const sheetData = parseSheetJson(data.sheet_json);
              const nextCharacter = applyEquipmentToCharacter(data, sheetData);
              setCharacter(nextCharacter);
              setSheet(sheetData);
              characterRef.current = nextCharacter;
              sheetRef.current = sheetData;
            }}
          />
        ) : (
          sheetPanePlaceholder
        );
      case "player_notes":
        return (
          <PlayerNotesWidget
            tabs={widget.playerNotesTabs || []}
            closedTabs={widget.closedNotesTabs || []}
            activeTabId={widget.activeNotesTabId}
            onChange={(patch) => updateWidgetMeta(widget.id, patch)}
            onBrowseArchive={() => setNotesArchiveOpen(true)}
          />
        );
      case "dice_roller":
        return (
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <DiceRoller
              campaignId={campaignId}
              token={token}
              rollerLabel={user?.username}
              combatActive={combatActive}
              sheet={sheet}
              characterId={character?.id}
              fillPane
            />
          </div>
        );
      case "vtt_zone":
        return <VttZoneWidget campaignId={campaignId} />;
      case "party":
        return (
          <PartyWidget
            campaignId={campaignId}
            token={token}
            characterId={character?.id}
            isOwner={sessionStatus?.is_owner}
            orientation={widget.partyOrientation}
            onOrientationChange={(nextOrientation) =>
              setWidgetOrientation(widget.id, "partyOrientation", nextOrientation)
            }
          />
        );
      case "initiative":
        return (
          <InitiativeWidget
            campaignId={campaignId}
            characterId={character?.id}
            token={token}
            isOwner={sessionStatus?.is_owner}
            sheet={sheet}
            orientation={widget.initiativeOrientation}
            onOrientationChange={(nextOrientation, combatantCount) =>
              setInitiativeOrientation(widget.id, nextOrientation, combatantCount)
            }
            onCombatEnded={handleCombatEnded}
            onSheetRefresh={refreshPlaySheet}
          />
        );
      case "dm_rules_chat":
        return (
          <DmRulesChatWidget
            campaignId={campaignId}
            campaignName={sessionStatus?.campaign_name}
            token={token}
          />
        );
      case "dm_generators":
        return (
          <DmGeneratorsWidget
            campaignId={campaignId}
            token={token}
            activeTab={widget.dmGeneratorsTab}
            onTabChange={(tab) => updateWidgetMeta(widget.id, { dmGeneratorsTab: tab })}
            onEncounterGenerated={addEncounterToDmNotes}
          />
        );
      case "dm_notes":
        return (
          <DmNotesWidget
            tabs={widget.dmNotesTabs || []}
            closedTabs={widget.closedNotesTabs || []}
            activeTabId={widget.activeNotesTabId}
            onChange={(patch) => updateWidgetMeta(widget.id, patch)}
            onBrowseArchive={() => setNotesArchiveOpen(true)}
          />
        );
      case "dm_toolbox":
        return (
          <DmToolboxWidget
            campaignId={campaignId}
            token={token}
            rollerLabel={user?.username}
            combatActive={combatActive}
          />
        );
      default:
        return <p className="text-zinc-600 text-[10px]">Legacy pane — remove and add a new one.</p>;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-xs font-mono text-zinc-500">
        Joining session...
      </div>
    );
  }

  if (!sessionStatus?.session_active) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-xs font-mono text-zinc-500">
          {sessionStatus?.campaign_name || "This campaign"} has no active session right now.
        </p>
        <Link to="/dashboard" className="text-xs text-neon-cyan hover:text-starlight font-black uppercase">
          Back to campaigns
        </Link>
      </div>
    );
  }

  if (!character && !isDmSession) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <Swords className="w-10 h-10 text-neon-magenta" />
        <p className="text-sm font-black text-starlight uppercase">Session live</p>
        <p className="text-xs font-mono text-zinc-500 max-w-md">
          You need a character in this campaign to open the play view.
        </p>
        <Link to="/dashboard" className="text-xs text-neon-cyan hover:text-starlight font-black uppercase">
          Back to campaigns
        </Link>
      </div>
    );
  }

  const scale = isMobileSession ? 1 : layout.viewport.scale;
  const canvasW =
    canvasBoundsRef.current.width || layout.viewport.canvasW || 1280;
  const canvasH =
    canvasBoundsRef.current.height || layout.viewport.canvasH || 800;
  const layoutW = Math.max(1, Math.round(canvasW / scale));
  const layoutH = Math.max(1, Math.round(canvasH / scale));

  return (
    <div className="session-ui flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="relative z-50 flex shrink-0 min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border-bright bg-void-deep px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="text-zinc-500 hover:text-neon-cyan flex items-center gap-1 text-[10px] font-black uppercase"
          >
            <ArrowLeft className="w-3 h-3" />
            Campaigns
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase text-starlight sm:text-base">
              {sessionStatus?.campaign_name || "Campaign"}
            </h1>
            {!isDmSession && character?.name && (
              <p className="truncate text-[10px] font-mono text-ink-faint sm:text-xs">
                {character.name}
              </p>
            )}
          </div>
          {isDmSession ? (
            <span className="text-[10px] text-neon-cyan font-black uppercase hidden sm:inline">DM</span>
          ) : (
            <span className="text-[10px] text-neon-magenta font-mono hidden sm:inline animate-pulse">LIVE</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isDmSession && (
            <Link
              to={`/initiative/${campaignId}`}
              className="flex items-center gap-1 rounded-sm border border-neon-magenta px-2.5 py-1.5 text-xs font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 sm:text-sm"
            >
              <Swords className="w-3 h-3" />
              Tracker
            </Link>
          )}
          {!isDmSession && (
            <button
              type="button"
              onClick={() => setFullSheetOpen(true)}
              className="flex items-center gap-1 rounded-sm border border-zinc-700 px-2.5 py-1.5 text-xs font-black uppercase text-zinc-400 hover:text-starlight sm:text-sm"
            >
              <ScrollText className="w-3 h-3" />
              Digital Sheet
            </button>
          )}
          <div className="relative z-50" ref={paneMenuRef}>
            <button
              type="button"
              onClick={() => setPaneMenuOpen((open) => !open)}
              className="flex items-center gap-1 rounded-sm border border-neon-cyan px-2.5 py-1.5 text-xs font-black uppercase hover:bg-neon-cyan/10 sm:text-sm"
            >
              <Plus className="w-3 h-3" />
              Pane
              <ChevronDown className="w-3 h-3" />
            </button>
            {paneMenuOpen && (
              <div className="absolute right-0 top-full z-50 pt-1">
                <div className="border-2 border-neon-cyan bg-black min-w-[160px] shadow-lg">
                  {paneOptionsForSession(isDmSession).map((w) => {
                    const alreadyAdded =
                      SINGLETON_WIDGET_TYPES.has(w.type) &&
                      layout.widgets.some((widget) => widget.type === w.type);
                    return (
                      <button
                        key={w.type}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => addWidget(w.type)}
                        className="block w-full text-left px-3 py-2 text-[10px] font-black uppercase hover:bg-neon-magenta/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {w.label}
                        {alreadyAdded ? " (added)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {!isDmSession && (
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => persistCharacter(buildPatch(character, sheet, layout))}
              className="flex items-center gap-1 rounded-sm border border-starlight px-2.5 py-1.5 text-xs font-black uppercase text-starlight disabled:opacity-40 sm:text-sm"
            >
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : dirty ? "Save" : "Saved"}
            </button>
          )}
        </div>
      </header>

      {syncing && (
        <p className="px-4 py-2 text-[10px] text-neon-cyan font-mono border-b border-neon-cyan/30 bg-neon-cyan/5">
          Re-syncing from PDF — this may take a couple of minutes. Please wait while your sheet is
          updated.
        </p>
      )}

      {error && (
        <p className="px-4 py-1 text-[10px] text-danger font-mono border-b border-danger/30">{error}</p>
      )}

      <div className="relative isolate min-h-0 min-w-0 flex-1 basis-0">
        {isMobileSession ? (
          <StackedSessionLayout
            widgets={layout.widgets}
            labels={WIDGET_LABELS}
            isDmSession={isDmSession}
            renderBody={renderWidgetBody}
            onToggleMinimize={toggleMinimize}
            onTogglePin={togglePin}
            onRemove={removeWidget}
            onFocus={focusWidget}
          />
        ) : (
        <div ref={canvasRef} className="absolute inset-0 overflow-hidden bg-void">
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-sm border border-border-bright bg-void-panel/95 px-3 py-2 font-mono text-xs sm:text-sm">
          <span className="text-ink-faint uppercase font-black">Zoom</span>
          <span className="text-starlight font-black min-w-[3ch] text-right">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={resetZoom}
            className="pointer-events-auto flex items-center gap-1 rounded px-2 py-0.5 border border-border text-ink-muted hover:text-starlight hover:border-border-bright uppercase font-black"
            title="Reset zoom to 100%"
          >
            <RotateCcw className="w-3 h-3" />
            Zoom
          </button>
          <button
            type="button"
            onClick={resetLayout}
            className="pointer-events-auto flex items-center gap-1 rounded px-2 py-0.5 border border-border text-ink-muted hover:text-starlight hover:border-border-bright uppercase font-black"
            title="Reset pane positions for this screen size"
          >
            <LayoutGrid className="w-3 h-3" />
            Layout
          </button>
          <span className="hidden border-l border-border pl-2 text-[8px] text-ink-faint sm:inline">
            Ctrl+scroll
          </span>
        </div>
        <div
          className="absolute top-0 left-0 overflow-hidden"
          style={{
            width: layoutW,
            height: layoutH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div className="relative h-full w-full">
            {[...layout.widgets]
              .sort((left, right) => (left.z ?? 0) - (right.z ?? 0))
              .map((widget) => (
              <SheetPane
                key={widget.id}
                widget={widget}
                title={WIDGET_LABELS[widget.type] || widget.type}
                scale={scale}
                getCanvasBounds={getCanvasBounds}
                onChange={updateWidget}
                onCommit={commitLayout}
                onInteractionStart={startPaneInteraction}
                onInteractionEnd={endPaneInteraction}
                onTogglePin={togglePin}
                onToggleMinimize={toggleMinimize}
                onRemove={removeWidget}
                onFocus={focusWidget}
              >
                {renderWidgetBody(widget)}
              </SheetPane>
            ))}
          </div>
        </div>
        </div>
        )}
      </div>

      <DetailSlideOver
        open={!!detail}
        title={detail?.title}
        subtitle={detail?.subtitle}
        onClose={() => setDetail(null)}
      >
        {typeof detail?.body === "string" ? <p>{detail.body}</p> : detail?.body}
      </DetailSlideOver>

      {character && (
        <FullSheetModal
          open={fullSheetOpen}
          character={character}
          sheet={sheet}
          token={token}
          syncing={syncing}
          uploading={uploadingPdf}
          onClose={handleFullSheetClose}
          onResync={handleResyncPdf}
          onUploadPdf={handleUploadPdf}
          onSheetChange={onSheetChange}
          onCombatChange={onCombatChange}
        />
      )}

      <NotesArchiveModal
        open={notesArchiveOpen}
        campaignId={campaignId}
        token={token}
        openTabs={
          isDmSession
            ? layout.widgets.find((widget) => widget.type === "dm_notes")?.dmNotesTabs || []
            : layout.widgets.find((widget) => widget.type === "player_notes")?.playerNotesTabs || []
        }
        onClose={() => setNotesArchiveOpen(false)}
        onImportTab={handleImportArchivedTab}
        onTabDeleted={handleDeletedArchivedTab}
      />
    </div>
  );
}
