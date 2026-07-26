import { useEffect, useState } from "react";

/**
 * True on large physical displays (≈2K+) that also have enough CSS width.
 * Avoids Tailwind min-width breakpoints, which fail when OS display scaling
 * shrinks CSS px (e.g. 2560@150% ≈ 1707px — never hits a 2000px media query).
 * Stays off for 1080p (physical ~1920) even when CSS width is wide.
 */
function computeSheetScale() {
  if (typeof window === "undefined") return false;
  const cssW = window.innerWidth;
  const physicalW = window.screen.width * (window.devicePixelRatio || 1);
  return physicalW >= 2400 && cssW >= 1400;
}

export function useSheetScale() {
  const [scaleUp, setScaleUp] = useState(computeSheetScale);

  useEffect(() => {
    const update = () => setScaleUp(computeSheetScale());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return scaleUp;
}
