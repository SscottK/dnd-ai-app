import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, LayoutDashboard, LogOut, MessageSquare } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-widest border-l-4 transition ${
    isActive
      ? "border-[#ff007f] text-[#fffb00] bg-[#ff007f]/10"
      : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/80"
  }`;

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-[#030005] text-[#00ffff] overflow-hidden font-sans">
      <aside className="w-64 border-r-4 border-[#ff007f] bg-black flex flex-col">
        <div className="p-4 border-b-2 border-[#ff007f]/50 flex items-center gap-2 bg-zinc-950">
          <BookOpen className="w-5 h-5 text-[#00ffff]" />
          <div>
            <h2 className="font-black text-sm text-[#ff007f] tracking-widest italic uppercase">
              D&amp;D AI
            </h2>
            <p className="text-[9px] text-zinc-500 truncate max-w-[140px]">
              {user?.username}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          <NavLink to="/dashboard" className={navLinkClass} end>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/chat" className={navLinkClass}>
            <MessageSquare className="w-4 h-4" />
            Rules AI Chat
          </NavLink>
        </nav>

        <div className="p-3 border-t-2 border-[#ff007f]/50">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-[#ff003c] transition"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
