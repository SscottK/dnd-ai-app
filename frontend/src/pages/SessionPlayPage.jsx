import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, FileText, LayoutGrid, Plus, RotateCcw, Save, Swords } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { SheetPane } from "../components/sheet/SheetPane";
import { DetailSlideOver } from "../components/sheet/DetailSlideOver";
import { FullSheetModal } from "../components/sheet/FullSheetModal";
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
  clampWidget,
  buildDefaultLayout,
  buildDmDefaultLayout,
  clampWidgets,
  computeHorizontalInitiativeWidth,
  createWidget,
  defaultViewport,
  hydrateLayout,
  INITIATIVE_ORIENTATION_HORIZONTAL,
  migrateLegacyNotesIntoLayout,
  parseLayout,
  readStoredDmLayout,
  reflowWidgetsOnResize,
  withCanvasViewport,
  WIDGET_TYPES,
  writeStoredDmLayout,
} from "../lib/sheetLayout";
import { applyEquipmentToCharacter, parseSheetJson, sheetToJson } from "../lib/characterSheet";

const WIDGET_LABELS = Object.fromEntries(WIDGET_TYPES.map((w) => [w.type, w.label]));

export function SessionPlayPage() {
  const { campaignId } = useParams();
  const { token } = useAuth();
  const [sessionStatus, setSessionStatus] = useState(null);
  const [character, setCharacter] = useState(null);
  const [sheet, setSheet] = useState(parseSheetJson(null));
  const [layout, setLayout] = useState(parseLayout(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
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

  const characterId = sessionStatus?.character_id;
  const isDmSession =
    sessionStatus?.session_active && sessionStatus?.is_owner && !sessionStatus?.character_id;

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

  const getCanvasBounds = useCallback(() => canvasBoundsRef.current, []);

  const startPaneInteraction = useCallback(() => {
    interactingRef.current = true;
  }, []);

  const endPaneInteraction = useCallback(() => {
    interactingRef.current = false;
  }, []);

  const measureCanvas = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return null;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
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
      const widgets =
        prevW !== size.width || prevH !== size.height
          ? reflowWidgetsOnResize(base.widgets, prevW, prevH, size.width, size.height)
          : clampWidgets(base.widgets, size.width, size.height);
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
      if (!token || !characterId) return;
      setSaving(true);
      try {
        const res = await apiFetch(`/characters/${characterId}`, {
          token,
          method: "PATCH",
          body: patch,
        });
        if (!res.ok) throw new Error("Save failed");
        const data = await res.json();
        const sheetData = parseSheetJson(data.sheet_json);
        setCharacter(applyEquipmentToCharacter(data, sheetData));
        setSheet(sheetData);
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

  const loadSession = useCallback(async () => {
    if (!token || !campaignId) return;
    setLoading(true);
    setError("");
    try {
      const sessionRes = await apiFetch(`/campaigns/${campaignId}/session`, { token });
      if (!sessionRes.ok) throw new Error("Session not available");
      const status = await sessionRes.json();
      setSessionStatus(status);

      if (!status.session_active) {
        setCharacter(null);
        return;
      }

      if (status.character_id) {
        const charRes = await apiFetch(`/characters/${status.character_id}`, { token });
        if (!charRes.ok) throw new Error("Character not found");
        const migrated = hydrateCharacter(await charRes.json());
        if (migrated) {
          scheduleSave({
            ...buildPatch(characterRef.current, sheetRef.current, layoutRef.current),
            notes: "",
          });
        }
        return;
      }

      if (status.is_owner) {
        setCharacter(null);
        setSheet(parseSheetJson(null));
        const stored = readStoredDmLayout(campaignId);
        const hydrated = stored ? hydrateLayout(stored, 1280, 800) : null;
        setLayout(hydrated || { widgets: [], viewport: defaultViewport() });
        return;
      }

      setCharacter(null);
    } catch (err) {
      console.error(err);
      setError("Could not load live session.");
    } finally {
      setLoading(false);
    }
  }, [token, campaignId, hydrateCharacter, scheduleSave, buildPatch]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

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

    const applyCanvasResize = (nextW, nextH) => {
      if (interactingRef.current || nextW <= 0 || nextH <= 0) return;

      const prev = canvasBoundsRef.current;
      if (prev.width === nextW && prev.height === nextH) return;
      if (
        prev.width > 0 &&
        prev.height > 0 &&
        Math.abs(prev.width - nextW) < 2 &&
        Math.abs(prev.height - nextH) < 2
      ) {
        return;
      }

      const prevW = prev.width > 0 ? prev.width : nextW;
      const prevH = prev.height > 0 ? prev.height : nextH;
      canvasBoundsRef.current = { width: nextW, height: nextH };

      setLayout((prevLayout) => {
        const next = {
          widgets: reflowWidgetsOnResize(prevLayout.widgets, prevW, prevH, nextW, nextH),
          viewport: withCanvasViewport(prevLayout.viewport, nextW, nextH),
        };
        layoutRef.current = next;
        if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
        resizeSaveTimer.current = setTimeout(() => {
          saveLayoutSnapshot(layoutRef.current);
        }, 500);
        return next;
      });
    };

    let raf = 0;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        applyCanvasResize(Math.round(width), Math.round(height));
      });
    });

    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      if (resizeSaveTimer.current) clearTimeout(resizeSaveTimer.current);
      observer.disconnect();
    };
  }, [
    sessionStatus?.session_active,
    sessionStatus?.is_owner,
    sessionStatus?.character_id,
    character?.id,
    saveLayoutSnapshot,
  ]);

  const onCombatChange = (patch) => {
    const next = { ...character, ...patch };
    setCharacter(next);
    scheduleSave(buildPatch(next, sheet, layout));
  };

  const onSheetChange = (nextSheet) => {
    setSheet(nextSheet);
    const nextCharacter = applyEquipmentToCharacter(character, nextSheet);
    setCharacter(nextCharacter);
    scheduleSave(buildPatch(nextCharacter, nextSheet, layout));
  };

  const updateWidget = (widget) => {
    const { width, height } = canvasBoundsRef.current;
    const bounded = clampWidget(widget, width, height);
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
      setLayout(nextLayout);
      saveLayoutSnapshot(nextLayout);
    },
    [saveLayoutSnapshot]
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
    },
    [saveLayoutSnapshot]
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
        return clampWidget(next, canvasW, canvasH);
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
        return clampWidget(next, width, height);
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

  const addWidget = (type) => {
    const nextLayout = {
      ...layout,
      widgets: [
        ...layout.widgets,
        createWidget(
          type,
          canvasBoundsRef.current.width || 1280,
          canvasBoundsRef.current.height || 800
        ),
      ],
    };
    setLayout(nextLayout);
    saveLayoutSnapshot(nextLayout);
    setPaneMenuOpen(false);
  };

  const setViewport = (viewport, { save = true } = {}) => {
    const nextLayout = { ...layout, viewport };
    setLayout(nextLayout);
    if (save) {
      saveLayoutSnapshot(nextLayout);
    }
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
      hydrateCharacter(await res.json());
    } catch (err) {
      setError(err.message || "Could not re-sync from PDF.");
    } finally {
      setSyncing(false);
    }
  };

  const handleFullSheetClose = async () => {
    setFullSheetOpen(false);
    await loadSession();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!character && !isDmSession)) return;

    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      const nextScale = Math.min(1.25, Math.max(0.6, layout.viewport.scale + delta));
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
            onShowDetail={showDetail}
          />
        ) : (
          sheetPanePlaceholder
        );
      case "abilities":
        return guard(<AbilitiesWidget sheet={sheet} onShowDetail={showDetail} />);
      case "skills_saves":
        return guard(<SkillsSavesWidget sheet={sheet} onShowDetail={showDetail} />);
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
            activeTabId={widget.activeNotesTabId}
            onChange={(patch) => updateWidgetMeta(widget.id, patch)}
          />
        );
      case "vtt_zone":
        return <VttZoneWidget />;
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
            activeTabId={widget.activeNotesTabId}
            onChange={(patch) => updateWidgetMeta(widget.id, patch)}
          />
        );
      case "dm_toolbox":
        return (
          <DmToolboxWidget
            campaignId={campaignId}
            token={token}
            activeTab={widget.dmToolboxTab}
            onTabChange={(tab) => updateWidgetMeta(widget.id, { dmToolboxTab: tab })}
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

  const { scale } = layout.viewport;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="relative z-50 flex shrink-0 min-w-0 items-center justify-between gap-3 border-b border-border-bright bg-void-deep px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/dashboard"
            className="text-zinc-500 hover:text-neon-cyan flex items-center gap-1 text-[10px] font-black uppercase"
          >
            <ArrowLeft className="w-3 h-3" />
            Campaigns
          </Link>
          <h1 className="font-black text-sm text-starlight uppercase truncate">
            {isDmSession ? sessionStatus.campaign_name : character.name}
          </h1>
          {isDmSession ? (
            <span className="text-[10px] text-neon-cyan font-black uppercase hidden sm:inline">DM</span>
          ) : (
            <span className="text-[10px] text-neon-magenta font-mono hidden sm:inline animate-pulse">LIVE</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDmSession && (
            <Link
              to={`/initiative/${campaignId}`}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase border border-neon-magenta text-neon-magenta hover:bg-neon-magenta/10"
            >
              <Swords className="w-3 h-3" />
              Tracker
            </Link>
          )}
          {!isDmSession && (
            <button
              type="button"
              onClick={() => setFullSheetOpen(true)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase border border-zinc-700 text-zinc-400 hover:text-starlight"
            >
              <FileText className="w-3 h-3" />
              Full Sheet
            </button>
          )}
          <div className="relative z-50" ref={paneMenuRef}>
            <button
              type="button"
              onClick={() => setPaneMenuOpen((open) => !open)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase border border-neon-cyan hover:bg-neon-cyan/10"
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
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase border border-starlight text-starlight disabled:opacity-40"
            >
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : dirty ? "Save" : "Saved"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="px-4 py-1 text-[10px] text-danger font-mono border-b border-danger/30">{error}</p>
      )}

      <div className="relative isolate min-h-0 min-w-0 flex-1 basis-0">
        <div ref={canvasRef} className="absolute inset-0 overflow-hidden bg-void">
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-sm border border-border-bright bg-void-panel/95 px-3 py-2 font-mono text-[10px]">
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
          className="absolute inset-0 overflow-hidden"
          style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <div className="relative h-full w-full overflow-hidden">
            {layout.widgets.map((widget) => (
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
              >
                {renderWidgetBody(widget)}
              </SheetPane>
            ))}
          </div>
        </div>
        </div>
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
          token={token}
          syncing={syncing}
          onClose={handleFullSheetClose}
          onResync={handleResyncPdf}
        />
      )}
    </div>
  );
}
