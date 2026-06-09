import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePageRefreshContext } from "../contexts/PageRefreshContext";

const THRESHOLD = 64;
const MAX_PULL = 96;

/**
 * Mobile-only pull-to-refresh wired to the app shell so pulls starting on the
 * navbar (or anywhere at scroll top) refresh the whole page.
 */
export function ShellPullToRefresh({ enabled, touchRootRef, shiftRef, getScrollElement }) {
  const { triggerRefresh } = usePageRefreshContext();
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const setPull = useCallback((value) => {
    pullDistanceRef.current = value;
    setPullDistance(value);
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(THRESHOLD);
    try {
      await triggerRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    }
  }, [setPull, triggerRefresh]);

  useEffect(() => {
    const touchRoot = touchRootRef?.current;
    if (!enabled || !touchRoot) return;

    const getScrollTop = () => {
      const scrollEl = getScrollElement?.() || touchRoot;
      return scrollEl?.scrollTop ?? 0;
    };

    const onTouchStart = (event) => {
      if (refreshingRef.current || getScrollTop() > 0) {
        pulling.current = false;
        return;
      }
      startY.current = event.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (event) => {
      if (!pulling.current || refreshingRef.current) return;
      if (getScrollTop() > 0) {
        pulling.current = false;
        setPull(0);
        return;
      }
      const delta = event.touches[0].clientY - startY.current;
      if (delta > 0) {
        event.preventDefault();
        setPull(Math.min(delta * 0.45, MAX_PULL));
      } else {
        setPull(0);
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullDistanceRef.current >= THRESHOLD) {
        void runRefresh();
      } else {
        setPull(0);
      }
    };

    touchRoot.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    touchRoot.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    touchRoot.addEventListener("touchend", onTouchEnd, { capture: true });
    touchRoot.addEventListener("touchcancel", onTouchEnd, { capture: true });

    return () => {
      touchRoot.removeEventListener("touchstart", onTouchStart, { capture: true });
      touchRoot.removeEventListener("touchmove", onTouchMove, { capture: true });
      touchRoot.removeEventListener("touchend", onTouchEnd, { capture: true });
      touchRoot.removeEventListener("touchcancel", onTouchEnd, { capture: true });
    };
  }, [enabled, getScrollElement, runRefresh, setPull, touchRootRef]);

  useEffect(() => {
    const shiftEl = shiftRef?.current;
    if (!shiftEl) return;
    shiftEl.style.transform = pullDistance > 0 ? `translateY(${pullDistance}px)` : "";
    shiftEl.style.transition =
      pullDistance === 0 && !refreshing ? "transform 0.2s ease-out" : "";
  }, [pullDistance, refreshing, shiftRef]);

  if (!enabled) return null;

  const indicatorOpacity = refreshing ? 1 : Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = pullDistance > 0 || refreshing;

  if (!showIndicator) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        height: Math.max(pullDistance, refreshing ? THRESHOLD : 0),
        opacity: indicatorOpacity,
      }}
      aria-hidden
    >
      <Loader2
        className={`mt-2 h-5 w-5 text-neon-cyan ${refreshing ? "animate-spin" : ""}`}
        style={{
          transform: refreshing ? undefined : `rotate(${Math.min(pullDistance * 2.5, 320)}deg)`,
        }}
      />
    </div>
  );
}
