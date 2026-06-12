/**
 * Canvas resize detection for live session play — covers window resize,
 * ResizeObserver, visualViewport (zoom / mobile chrome), monitor moves, and DPI changes.
 */

import { MIN_PANE_HEIGHT } from "./sheetLayout";

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

/**
 * Decide whether panes need proportional reflow for a new canvas measurement.
 * Uses saved viewport dimensions (not the bounds cache) as the scale reference.
 */
export function resolveCanvasResizeAction(measured, layoutViewport, widgets) {
  const nextW = Math.round(measured?.width ?? 0);
  const nextH = Math.round(measured?.height ?? 0);
  if (nextW <= 0 || nextH <= 0) return null;

  const storedW = Math.round(layoutViewport?.canvasW ?? 0);
  const storedH = Math.round(layoutViewport?.canvasH ?? 0);
  const { maxRight, maxBottom } = inferLayoutExtents(widgets);

  const dimensionChanged =
    storedW > 0 && storedH > 0 && (storedW !== nextW || storedH !== nextH);

  const widgetsOverflow =
    maxRight > nextW + 8 ||
    maxBottom > nextH + 8 ||
    (widgets || []).some((widget) => {
      const height = widget.minimized ? MIN_PANE_HEIGHT : widget.h;
      return widget.w > nextW - 16 || height > nextH - 16;
    });

  if (!dimensionChanged && !widgetsOverflow) return null;

  let prevW = storedW > 0 ? storedW : Math.max(maxRight, nextW);
  let prevH = storedH > 0 ? storedH : Math.max(maxBottom, nextH);

  // Viewport metadata was updated without scaling — infer space from widget footprint.
  if (!dimensionChanged && widgetsOverflow) {
    prevW = Math.max(maxRight, storedW, nextW);
    prevH = Math.max(maxBottom, storedH, nextH);
  }

  if (prevW <= nextW && widgetsOverflow && maxRight > nextW) {
    prevW = Math.max(maxRight, storedW || maxRight);
  }
  if (prevH <= nextH && widgetsOverflow && maxBottom > nextH) {
    prevH = Math.max(maxBottom, storedH || maxBottom);
  }

  if (Math.abs(prevW - nextW) < 2 && Math.abs(prevH - nextH) < 2 && !widgetsOverflow) {
    return null;
  }

  return {
    nextW,
    nextH,
    prevW: Math.max(prevW, 1),
    prevH: Math.max(prevH, 1),
    reflow: true,
  };
}

/**
 * @param {object} options
 * @param {() => HTMLElement | null} options.getCanvasEl
 * @param {() => void} options.onRemeasure
 * @param {number} [options.finalizeDelayMs]
 */
export function attachSessionCanvasResizeListeners({
  getCanvasEl,
  onRemeasure,
  finalizeDelayMs = 120,
}) {
  let raf = 0;
  let resizeEndTimer = null;
  let devicePixelRatio = window.devicePixelRatio;

  const scheduleRemeasure = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onRemeasure();
        if (resizeEndTimer) clearTimeout(resizeEndTimer);
        resizeEndTimer = setTimeout(onRemeasure, finalizeDelayMs);
      });
    });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      scheduleRemeasure();
    }
  };

  const onFocus = () => {
    if (window.devicePixelRatio !== devicePixelRatio) {
      devicePixelRatio = window.devicePixelRatio;
    }
    scheduleRemeasure();
  };

  const observer = new ResizeObserver(() => {
    scheduleRemeasure();
  });

  const el = getCanvasEl();
  if (el) {
    observer.observe(el);
  }

  window.addEventListener("resize", scheduleRemeasure);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const visualViewport = window.visualViewport;
  if (visualViewport) {
    visualViewport.addEventListener("resize", scheduleRemeasure);
    visualViewport.addEventListener("scroll", scheduleRemeasure);
  }

  return () => {
    cancelAnimationFrame(raf);
    if (resizeEndTimer) clearTimeout(resizeEndTimer);
    observer.disconnect();
    window.removeEventListener("resize", scheduleRemeasure);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (visualViewport) {
      visualViewport.removeEventListener("resize", scheduleRemeasure);
      visualViewport.removeEventListener("scroll", scheduleRemeasure);
    }
  };
}
