import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const PageRefreshContext = createContext(null);

export function PageRefreshProvider({ children }) {
  const refreshHandlerRef = useRef(null);
  const scrollElementRef = useRef(null);
  const [layoutNested, setLayoutNested] = useState(false);

  const registerRefresh = useCallback((handler) => {
    refreshHandlerRef.current = handler;
    return () => {
      if (refreshHandlerRef.current === handler) {
        refreshHandlerRef.current = null;
      }
    };
  }, []);

  const registerScrollElement = useCallback((element) => {
    scrollElementRef.current = element;
    return () => {
      if (scrollElementRef.current === element) {
        scrollElementRef.current = null;
      }
    };
  }, []);

  const triggerRefresh = useCallback(async () => {
    const handler = refreshHandlerRef.current;
    if (!handler) return;
    await handler();
  }, []);

  const value = useMemo(
    () => ({
      layoutNested,
      setLayoutNested,
      registerRefresh,
      registerScrollElement,
      triggerRefresh,
      getScrollElement: () => scrollElementRef.current,
    }),
    [layoutNested, registerRefresh, registerScrollElement, triggerRefresh]
  );

  return <PageRefreshContext.Provider value={value}>{children}</PageRefreshContext.Provider>;
}

export function usePageRefreshContext() {
  const context = useContext(PageRefreshContext);
  if (!context) {
    throw new Error("usePageRefreshContext must be used within PageRefreshProvider");
  }
  return context;
}

/** Register the active route's refresh handler with the app shell. */
export function usePageRefresh(onRefresh) {
  const { registerRefresh } = usePageRefreshContext();

  useEffect(() => {
    if (!onRefresh) return undefined;
    return registerRefresh(onRefresh);
  }, [onRefresh, registerRefresh]);
}

/**
 * Opt into fixed chrome with an inner scroll region (chat thread view, SRD detail, etc.).
 * Default on mobile is unified app-shell scroll (header + page + footer scroll together).
 */
export function useNestedPageLayout(nested) {
  const { setLayoutNested } = usePageRefreshContext();

  useEffect(() => {
    setLayoutNested(nested);
    return () => setLayoutNested(false);
  }, [nested, setLayoutNested]);
}

/** Point the shell pull-to-refresh at a nested scroll container. */
export function usePageScrollElement(element) {
  const { registerScrollElement } = usePageRefreshContext();

  useEffect(() => {
    if (!element) return undefined;
    return registerScrollElement(element);
  }, [element, registerScrollElement]);
}
