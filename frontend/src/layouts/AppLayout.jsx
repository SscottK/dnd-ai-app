import { useCallback, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, LayoutDashboard, LogOut, MessageSquare, Scroll, ScrollText, UserPlus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { usePendingAccessCount } from "../hooks/usePendingAccessCount";
import { FeedbackModal } from "../components/FeedbackModal";
import { APP_NAME, APP_TAGLINE, APP_VERSION, RULE_WIZARD_LABEL } from "../constants/branding";
import { PageRefreshProvider, usePageRefreshContext } from "../contexts/PageRefreshContext";
import { ShellPullToRefresh } from "../components/ShellPullToRefresh";
import { APP_MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";

const navLinkClass = ({ isActive }) =>
  `flex shrink-0 items-center gap-1 rounded-sm px-2.5 py-2 text-[10px] font-black uppercase tracking-wide border-b-2 transition sm:gap-1.5 sm:px-3 sm:text-xs ${
    isActive
      ? "border-neon-magenta text-starlight bg-neon-magenta/5"
      : "border-transparent text-ink-muted hover:text-ink"
  }`;

function NavItem({ to, end, icon: Icon, label, children }) {
  return (
    <NavLink to={to} end={end} className={navLinkClass} title={label}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
      {children}
    </NavLink>
  );
}

function AppHeader({ user, pendingCount, onLogout }) {
  return (
      <header className="shrink-0 border-b-4 border-neon-magenta bg-void-deep">
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <NavLink to="/dashboard" className="group flex min-w-0 items-center gap-2" end>
            <Scroll className="h-5 w-5 shrink-0 text-neon-cyan group-hover:text-starlight" />
            <div className="min-w-0">
              <span className="block truncate font-black text-xs uppercase italic tracking-widest text-neon-magenta sm:text-sm">
                {APP_NAME}
              </span>
              <span className="hidden text-[8px] font-mono uppercase tracking-[0.2em] text-nebula sm:block">
                {APP_TAGLINE}
              </span>
            </div>
          </NavLink>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[8rem] truncate font-mono text-[9px] text-zinc-600 md:inline">
              {user?.username}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">Sign Out</span>
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-t border-border/50 px-2 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 sm:border-t-0 sm:px-4 sm:pb-2 [&::-webkit-scrollbar]:hidden">
          <NavItem to="/dashboard" end icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/chat" icon={MessageSquare} label={RULE_WIZARD_LABEL} />
          <NavItem to="/srd" icon={BookOpen} label="SRD" />
          <NavItem to="/notes" icon={ScrollText} label="Notes" />
          {user?.is_admin && (
            <NavLink to="/admin/access" className={navLinkClass} title="Requests">
              <span className="relative flex shrink-0 items-center gap-1 whitespace-nowrap">
                <UserPlus className="h-3.5 w-3.5" />
                <span>Requests</span>
                {pendingCount > 0 && (
                  <span
                    className="min-w-[1.1rem] rounded-full bg-neon-magenta px-1 text-center text-[9px] font-black leading-4 text-black"
                    title={`${pendingCount} pending request${pendingCount === 1 ? "" : "s"}`}
                  >
                    {pendingCount}
                  </span>
                )}
              </span>
            </NavLink>
          )}
        </nav>
      </header>
  );
}

function AppFooter({ onOpenFeedback }) {
  return (
      <footer className="shrink-0 border-t border-border/50 bg-void-deep/80 px-3 py-2">
        <div className="flex items-center justify-center gap-3 text-[10px] font-mono uppercase tracking-widest text-ink-faint">
          <span>Beta {APP_VERSION}</span>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={onOpenFeedback}
            className="text-neon-cyan hover:text-starlight"
          >
            Send feedback
          </button>
        </div>
      </footer>
  );
}

function AppLayoutBody() {
  const { token, user, logout } = useAuth();
  const { pendingCount, refresh: refreshPendingCount } = usePendingAccessCount(
    token,
    Boolean(user?.is_admin)
  );
  const { layoutNested, getScrollElement } = usePageRefreshContext();
  const isMobile = useMediaQuery(APP_MOBILE_QUERY);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const shellRef = useRef(null);
  const shiftRef = useRef(null);
  const appScrollRef = useRef(null);

  const useUnifiedMobileScroll = isMobile && !layoutNested;

  const resolveScrollElement = useCallback(() => {
    if (useUnifiedMobileScroll) return appScrollRef.current;
    return getScrollElement();
  }, [getScrollElement, useUnifiedMobileScroll]);

  return (
    <div ref={shellRef} className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-void font-sans text-ink">
      <ShellPullToRefresh
        enabled={isMobile}
        touchRootRef={shellRef}
        shiftRef={shiftRef}
        getScrollElement={resolveScrollElement}
      />

      {useUnifiedMobileScroll ? (
        <div
          ref={appScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
        >
          <div ref={shiftRef}>
            <AppHeader user={user} pendingCount={pendingCount} onLogout={logout} />
            <main className="min-w-0">
              <Outlet />
            </main>
            <AppFooter onOpenFeedback={() => setFeedbackOpen(true)} />
          </div>
        </div>
      ) : (
        <div ref={shiftRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AppHeader user={user} pendingCount={pendingCount} onLogout={logout} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <Outlet />
            </div>
          </main>
          <AppFooter onOpenFeedback={() => setFeedbackOpen(true)} />
        </div>
      )}

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmitted={refreshPendingCount}
      />
    </div>
  );
}

export function AppLayout() {
  return (
    <PageRefreshProvider>
      <AppLayoutBody />
    </PageRefreshProvider>
  );
}
