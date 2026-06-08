import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, LogOut, MessageSquare, Scroll, ScrollText } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { APP_NAME, APP_TAGLINE } from "../constants/branding";

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition sm:text-sm ${
    isActive
      ? "border-neon-magenta text-starlight"
      : "border-transparent text-ink-muted hover:text-ink"
  }`;

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen w-full min-w-0 flex-col overflow-hidden bg-void font-sans text-ink">
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 border-b-4 border-neon-magenta bg-void-deep">
        <div className="flex items-center gap-4 min-w-0">
          <NavLink to="/dashboard" className="flex items-center gap-2 shrink-0 group">
            <Scroll className="w-5 h-5 text-neon-cyan group-hover:text-starlight" />
            <div className="hidden sm:block">
              <span className="font-black text-sm text-neon-magenta tracking-widest italic uppercase block leading-none">
                {APP_NAME}
              </span>
              <span className="text-[8px] text-nebula font-mono uppercase tracking-[0.2em]">
                {APP_TAGLINE}
              </span>
            </div>
          </NavLink>

          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" className={navLinkClass} end>
              <LayoutDashboard className="w-3.5 h-3.5" />
              Dashboard
            </NavLink>
            <NavLink to="/chat" className={navLinkClass}>
              <MessageSquare className="w-3.5 h-3.5" />
              Rules
            </NavLink>
            <NavLink to="/notes" className={navLinkClass}>
              <ScrollText className="w-3.5 h-3.5" />
              Notes
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[9px] text-zinc-600 font-mono truncate max-w-[120px] hidden md:inline">
            {user?.username}
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-danger transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
