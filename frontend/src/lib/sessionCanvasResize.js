/**
 * Canvas resize detection for live session play — covers window resize,
 * ResizeObserver, visualViewport (zoom / mobile chrome), monitor moves, and DPI changes.
 */

const SIZE_EPSILON = 8;

function sizesDiffer(a, b) {
  if (!a?.width || !a?.height || !b?.width || !b?.height) return false;
  return (
    Math.abs(Math.round(a.width) - Math.round(b.width)) >= SIZE_EPSILON ||
    Math.abs(Math.round(a.height) - Math.round(b.height)) >= SIZE_EPSILON
  );
}

/**
 * Decide whether panes need one proportional reflow for a settled canvas measurement.
 * Compares against the last reflowed canvas size — not saved layout viewport metadata.
 */
export function resolveCanvasResizeAction(measured, lastReflowBounds) {
  const nextW = Math.round(measured?.width ?? 0);
  const nextH = Math.round(measured?.height ?? 0);
  if (nextW <= 0 || nextH <= 0) return null;

  const prevW = Math.round(lastReflowBounds?.width ?? 0);
  const prevH = Math.round(lastReflowBounds?.height ?? 0);

  if (!prevW || !prevH) {
    return { nextW, nextH, prevW: nextW, prevH: nextH, reflow: true };
  }

  if (!sizesDiffer({ width: prevW, height: prevH }, { width: nextW, height: nextH })) {
    return null;
  }

  return {
    nextW,
    nextH,
    prevW,
    prevH,
    reflow: true,
  };
}

/**
 * @param {object} options
 * @param {() => HTMLElement | null} options.getCanvasEl
 * @param {() => void} options.onRemeasure
 * @param {() => void} options.onResizeEnd
 * @param {number} [options.finalizeDelayMs]
 */
export function attachSessionCanvasResizeListeners({
  getCanvasEl,
  onRemeasure,
  onResizeEnd,
  finalizeDelayMs = 150,
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
        resizeEndTimer = setTimeout(onResizeEnd, finalizeDelayMs);
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
