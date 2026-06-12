/**
 * Canvas resize detection for live session play — covers window resize,
 * ResizeObserver, visualViewport (zoom / mobile chrome), monitor moves, and DPI changes.
 */

/** Decide whether pane layout should reflow for a new canvas measurement. */
export function resolveCanvasResizeAction(prevBounds, measured, layoutViewport) {
  const nextW = Math.round(measured?.width ?? 0);
  const nextH = Math.round(measured?.height ?? 0);
  if (nextW <= 0 || nextH <= 0) return null;

  const storedW = Math.round(layoutViewport?.canvasW ?? 0);
  const storedH = Math.round(layoutViewport?.canvasH ?? 0);
  const prevW =
    prevBounds?.width > 0 ? Math.round(prevBounds.width) : storedW > 0 ? storedW : nextW;
  const prevH =
    prevBounds?.height > 0 ? Math.round(prevBounds.height) : storedH > 0 ? storedH : nextH;

  const sizeChanged =
    (prevBounds?.width ?? 0) !== nextW || (prevBounds?.height ?? 0) !== nextH;
  const layoutStale = storedW > 0 && storedH > 0 && (storedW !== nextW || storedH !== nextH);

  if (!sizeChanged && !layoutStale) return null;

  return {
    nextW,
    nextH,
    prevW: sizeChanged ? prevW : storedW > 0 ? storedW : prevW,
    prevH: sizeChanged ? prevH : storedH > 0 ? storedH : prevH,
    reflow: sizeChanged || layoutStale,
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
      // Second frame: layout often settles after monitor / DPI transitions.
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
