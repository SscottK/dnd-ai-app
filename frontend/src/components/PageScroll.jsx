import { useState } from "react";
import { useNestedPageLayout, usePageRefresh, usePageScrollElement } from "../contexts/PageRefreshContext";
import { APP_MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { PAGE_SCROLL_CLASS, PullToRefresh } from "./PullToRefresh";

/**
 * Standard page scroll + refresh wiring.
 * - Mobile (default): content flows in the app-shell scroll; shell handles pull-to-refresh.
 * - Mobile (nested): fixed chrome + inner scroll; shell PTR listens via registered scroll element.
 * - Desktop: page-level scroll with PullToRefresh in main.
 */
export function PageScroll({ onRefresh, nested = false, disabled = false, className = "", children }) {
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  const useNested = isMobile && nested;
  const [scrollNode, setScrollNode] = useState(null);

  usePageRefresh(disabled ? null : onRefresh);
  useNestedPageLayout(useNested);
  usePageScrollElement(useNested ? scrollNode : null);

  if (isMobile && !useNested) {
    return <div className={className}>{children}</div>;
  }

  if (isMobile && useNested) {
    return (
      <div
        ref={setScrollNode}
        className={`${PAGE_SCROLL_CLASS} ${className}`.trim()}
      >
        {children}
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={onRefresh} disabled={disabled} className={`${PAGE_SCROLL_CLASS} ${className}`.trim()}>
      {children}
    </PullToRefresh>
  );
}
