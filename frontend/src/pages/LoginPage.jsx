import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scroll, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { APP_NAME } from "../constants/branding";

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
    const loggedInUser = await login(username, password);
    if (!loggedInUser) {
      setLoginError("ACCESS DENIED. CHECK USERNAME AND PASSWORD.");
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void-deep px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-sm border border-border-bright bg-void-panel p-8 shadow-xl shadow-black/50"
      >
        <div className="text-center mb-6">
          <Scroll className="w-14 h-14 text-accent mx-auto mb-2" />
          <h1 className="text-4xl font-black text-starlight tracking-tighter italic uppercase">
            {APP_NAME}
          </h1>
          <p className="text-[10px] text-ink-muted uppercase tracking-[0.2em] font-extrabold mt-1">
            Sign in to your account
          </p>
        </div>

        <div className="space-y-4 font-mono">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-neon-magenta mb-2 font-sans">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username..."
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan placeholder-[#004e4e] focus:outline-none focus:border-starlight text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-neon-magenta mb-2 font-sans">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your secret passphrase..."
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan placeholder-[#004e4e] focus:outline-none focus:border-starlight text-sm"
            />
          </div>

          {loginError && (
            <div className="flex items-center gap-2 text-danger text-xs border-l-2 border-danger pl-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span className="font-bold tracking-tight">{loginError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-neon-magenta hover:bg-starlight text-black font-black transition-colors uppercase text-xs tracking-[0.15em] border-2 border-black"
          >
            Sign In
          </button>

          <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest">
            No account?{" "}
            <Link to="/register" className="text-neon-cyan hover:text-starlight">
              Create one
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
