import { useEffect, useState } from "react";

/** Match a CSS media query; updates on resize. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export const SESSION_MOBILE_QUERY = "(max-width: 767px)";

/** App shell / chat / two-pane layouts below md breakpoint. */
export const APP_MOBILE_QUERY = SESSION_MOBILE_QUERY;
