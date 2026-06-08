import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, LayoutDashboard, LogOut, MessageSquare, Scroll, ScrollText, UserPlus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { usePendingAccessCount } from "../hooks/usePendingAccessCount";
import { APP_NAME, APP_TAGLINE, RULE_WIZARD_LABEL } from "../constants/branding";

const navLinkClass = ({ isActive }) =>
  `flex shrink-0 items-center gap-1 rounded-sm px-2.5 py-2 text-[10px] font-black uppercase tracking-wide border-b-2 transition sm:gap-1.5 sm:px-3 sm:text-xs ${
    isActive
      ? "border-neon-magenta text-starlight bg-neon-magenta/5"
      : "border-transparent text-ink-muted hover:text-ink"
  }`;

function NavItem({ to, end, icon: Icon, label, shortLabel, children }) {
  return (
    <NavLink to={to} end={end} className={navLinkClass} title={label}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="sm:hidden">{shortLabel || label}</span>
      <span className="hidden sm:inline">{label}</span>
      {children}
    </NavLink>
  );
}

export function AppLayout() {
  const { token, user, logout } = useAuth();
  const { pendingCount } = usePendingAccessCount(token, Boolean(user?.is_admin));

  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-void font-sans text-ink">
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
              onClick={logout}
              className="flex items-center gap-1 rounded-sm px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 overflow-x-auto overscroll-x-contain border-t border-border/50 px-2 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 sm:border-t-0 sm:px-4 sm:pb-2 [&::-webkit-scrollbar]:hidden">
          <NavItem to="/dashboard" end icon={LayoutDashboard} label="Dashboard" shortLabel="Home" />
          <NavItem
            to="/chat"
            icon={MessageSquare}
            label={RULE_WIZARD_LABEL}
            shortLabel="Rules"
          />
          <NavItem to="/srd" icon={BookOpen} label="SRD" shortLabel="SRD" />
          <NavItem to="/notes" icon={ScrollText} label="Notes" shortLabel="Notes" />
          {user?.is_admin && (
            <NavLink to="/admin/access" className={navLinkClass} title="Access requests">
              <span className="relative flex shrink-0 items-center gap-1">
                <UserPlus className="h-3.5 w-3.5" />
                <span className="sm:hidden">Access</span>
                <span className="hidden sm:inline">Access</span>
                {pendingCount > 0 && (
                  <span
                    className="min-w-[1.1rem] rounded-full bg-neon-magenta px-1 text-center text-[9px] font-black leading-4 text-black"
                    title={`${pendingCount} pending access request${pendingCount === 1 ? "" : "s"}`}
                  >
                    {pendingCount}
                  </span>
                )}
              </span>
            </NavLink>
          )}
        </nav>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
