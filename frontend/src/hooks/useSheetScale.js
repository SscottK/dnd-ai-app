import { useEffect, useState } from "react";

/**
 * Detect ~2K+ displays even when OS scaling shrinks CSS px.
 * 1080p @ 100% (physical ~1920, dpr 1) stays off.
 */
function computeSheetScale() {
  if (typeof window === "undefined") return false;
  const cssW = window.innerWidth;
  if (cssW < 1280) return false;

  const dpr = window.devicePixelRatio || 1;
  const screenW = window.screen.width || 0;
  // Some Chromium builds report CSS px; others report device px — take the larger read.
  const physicalW = Math.max(screenW * dpr, screenW, cssW * dpr);

  return (
    physicalW >= 2200 ||
    screenW >= 2200 ||
    cssW >= 2200 ||
    (cssW >= 1600 && dpr >= 1.15)
  );
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
