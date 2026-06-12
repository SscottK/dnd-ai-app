/**
 * Canvas resize detection for live session play — covers window resize,
 * ResizeObserver, visualViewport (zoom / mobile chrome), monitor moves, and DPI changes.
 */

export const CANVAS_SIZE_EPSILON = 8;

export function canvasSizesMatch(a, b, epsilon = CANVAS_SIZE_EPSILON) {
  if (!a?.width || !a?.height || !b?.width || !b?.height) return false;
  return (
    Math.abs(Math.round(a.width) - Math.round(b.width)) < epsilon &&
    Math.abs(Math.round(a.height) - Math.round(b.height)) < epsilon
  );
}

function sizesDiffer(a, b) {
  return !canvasSizesMatch(a, b);
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

/** Reject a reflow when a larger stale reading arrives after the canvas already shrank. */
export function isStaleUpscaleReading(lastReflowBounds, pendingBounds, measuredBounds) {
  if (!pendingBounds?.width || !lastReflowBounds?.width || !measuredBounds?.width) {
    return false;
  }
  if (measuredBounds.width <= lastReflowBounds.width + CANVAS_SIZE_EPSILON) {
    return false;
  }
  return pendingBounds.width < measuredBounds.width - CANVAS_SIZE_EPSILON;
}

function readCanvasSize(getCanvasEl) {
  const el = getCanvasEl();
  if (!el) return null;
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * @param {object} options
 * @param {() => HTMLElement | null} options.getCanvasEl
 * @param {() => void} options.onRemeasure
 * @param {(size: { width: number, height: number }) => void} options.onResizeSettled
 * @param {number} [options.finalizeDelayMs]
 */
export function attachSessionCanvasResizeListeners({
  getCanvasEl,
  onRemeasure,
  onResizeSettled,
  finalizeDelayMs = 280,
}) {
  let raf = 0;
  let resizeEndTimer = null;
  let devicePixelRatio = window.devicePixelRatio;

  const settleResize = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const first = readCanvasSize(getCanvasEl);
        requestAnimationFrame(() => {
          const second = readCanvasSize(getCanvasEl);
          const settled =
            first && second && canvasSizesMatch(first, second) ? second : second || first;
          if (settled) onResizeSettled(settled);
        });
      });
    });
  };

  const scheduleRemeasure = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onRemeasure();
        if (resizeEndTimer) clearTimeout(resizeEndTimer);
        resizeEndTimer = setTimeout(settleResize, finalizeDelayMs);
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
