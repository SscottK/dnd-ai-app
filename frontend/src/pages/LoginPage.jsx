import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scroll, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { APP_NAME } from "../constants/branding";
import { FanContentNotice, SiteAboutBlurb } from "../components/FanContentNotice";

export function LoginPage() {
  const { login, isAuthenticated, isValidating } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  if (!isValidating && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      await login(username, password);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setLoginError(error.message || "ACCESS DENIED. CHECK USERNAME AND PASSWORD.");
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-void-deep px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="rounded-sm border border-border-bright bg-void-panel p-6 shadow-xl shadow-black/50 sm:p-8">
          <div className="mb-6 text-center">
            <Scroll className="mx-auto mb-2 h-14 w-14 text-accent" />
            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-starlight sm:text-4xl">
              {APP_NAME}
            </h1>
            <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-ink-muted">
              Private campaign companion
            </p>
          </div>

          <SiteAboutBlurb />

          <div className="my-6 border-t border-border/60" />

          <form onSubmit={handleSubmit} className="space-y-4 font-mono">
            <p className="text-center text-[10px] font-extrabold uppercase tracking-[0.2em] text-neon-cyan">
              Sign in
            </p>
            <div>
              <label className="mb-2 block font-sans text-xs font-black uppercase tracking-wider text-neon-magenta">
                Username
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your username..."
                className="w-full border-2 border-neon-cyan bg-black px-4 py-3 text-sm text-neon-cyan placeholder-[#004e4e] focus:border-starlight focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block font-sans text-xs font-black uppercase tracking-wider text-neon-magenta">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your secret passphrase..."
                className="w-full border-2 border-neon-cyan bg-black px-4 py-3 text-sm text-neon-cyan placeholder-[#004e4e] focus:border-starlight focus:outline-none"
              />
            </div>

            {loginError && (
              <div className="flex items-center gap-2 border-l-2 border-danger pl-2 text-xs text-danger">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="font-bold tracking-tight">{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full border-2 border-black bg-neon-magenta py-3.5 text-xs font-black uppercase tracking-[0.15em] text-black transition-colors hover:bg-starlight"
            >
              Sign In
            </button>

            <p className="text-center text-[10px] uppercase tracking-widest text-zinc-500">
              Friend of the table?{" "}
              <Link to="/register" className="text-neon-cyan hover:text-starlight">
                Request access
              </Link>
            </p>
          </form>
        </div>

        <FanContentNotice className="px-1 text-center sm:text-left" />
      </div>
    </div>
  );
}
