import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { APP_MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

const THRESHOLD = 64;
const MAX_PULL = 96;

/** Default classes for a page-filling scroll region inside AppLayout main. */
export const PAGE_SCROLL_CLASS =
  "h-full min-h-0 flex-1 overflow-y-auto overscroll-y-contain";

/**
 * Wraps a scrollable region with mobile pull-to-refresh. Pass the same className
 * you would put on the scroll container (e.g. overflow-y-auto, flex-1, min-h-0).
 *
 * Use PAGE_SCROLL_CLASS (or include flex-1 + min-h-0 + overflow-y-auto) so the
 * scroll area fills the main pane and pull-to-refresh applies to the whole page
 * body, not a nested panel below a fixed in-page header.
 */
export function PullToRefresh({ onRefresh, disabled = false, className = "", children }) {
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  const scrollRef = useRef(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const enabled = isMobile && !disabled;

  const setPull = useCallback((value) => {
    pullDistanceRef.current = value;
    setPullDistance(value);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
    }
  }, [onRefresh, setPull]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (event) => {
      if (refreshingRef.current || el.scrollTop > 0) {
        pulling.current = false;
        return;
      }
      startY.current = event.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (event) => {
      if (!pulling.current || refreshingRef.current) return;
      if (el.scrollTop > 0) {
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
        void triggerRefresh();
      } else {
        setPull(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, setPull, triggerRefresh]);

  const indicatorOpacity = refreshing ? 1 : Math.min(pullDistance / THRESHOLD, 1);
  const showIndicator = enabled && (pullDistance > 0 || refreshing);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {showIndicator && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
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
      )}
      <div
        ref={scrollRef}
        className={className}
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined,
          transition: pullDistance === 0 && !refreshing ? "transform 0.2s ease-out" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
