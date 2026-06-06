import { Link } from "react-router-dom";
import { MessageSquare, Scroll, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="h-full overflow-y-auto p-8 bg-[#040008]">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-black text-[#fffb00] uppercase italic tracking-wider mb-2">
          Dashboard
        </h1>
        <p className="text-sm text-[#00ffff] font-mono mb-8">
          Welcome, {user?.username}.
        </p>

        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-black text-[#ff007f] uppercase tracking-widest mb-3">
            <Users className="w-4 h-4" />
            My Campaigns
          </h2>
          <div className="p-6 border-2 border-dashed border-zinc-700 bg-zinc-950/50 text-center">
            <p className="text-xs text-zinc-500 font-mono">
              No campaigns yet. Campaigns you join or create will appear here.
              When you own a campaign, it will show{" "}
              <span className="text-[#fffb00]">Dungeon Master: {user?.username || "You"}</span>.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-black text-[#00ffff] uppercase tracking-widest mb-3">
            <Scroll className="w-4 h-4" />
            My Characters
          </h2>
          <div className="p-6 border-2 border-dashed border-zinc-700 bg-zinc-950/50 text-center">
            <p className="text-xs text-zinc-500 font-mono">
              No characters yet. Upload a PDF or link a D&amp;D Beyond sheet to add one.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-black text-[#fffb00] uppercase tracking-widest mb-3">
            Quick Tools
          </h2>
          <Link
            to="/chat"
            className="group block p-6 border-2 border-[#ff007f] bg-black hover:bg-[#ff007f]/10 transition"
          >
            <MessageSquare className="w-8 h-8 text-[#ff007f] mb-3 group-hover:text-[#fffb00]" />
            <h3 className="font-black text-[#fffb00] uppercase tracking-widest text-sm mb-1">
              Rules AI Chat
            </h3>
            <p className="text-xs text-zinc-500 font-mono">
              Look up spells, monsters, and 5e rules on the fly.
            </p>
          </Link>
        </section>
      </div>
    </div>
  );
}
