import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scroll, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { APP_NAME } from "../constants/branding";

export function RegisterPage() {
  const { register, isAuthenticated, isValidating } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!isValidating && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await register({ username, password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "REGISTRATION FAILED.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void-deep px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-8 border-4 border-neon-cyan bg-black shadow-[0_0_30px_rgba(5,217,232,0.25)]"
      >
        <div className="text-center mb-6">
          <Scroll className="w-14 h-14 text-neon-magenta mx-auto mb-2" />
          <h1 className="text-3xl font-black text-starlight tracking-tighter italic uppercase">
            {APP_NAME}
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
            Create your account
          </p>
        </div>

        <div className="space-y-4 font-mono">
          <div>
            <label className="block text-xs font-black uppercase text-neon-magenta mb-2 font-sans">
              Username
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={50}
              pattern="[a-zA-Z0-9_]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="gandalf"
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan focus:outline-none text-sm"
            />
            <p className="text-[9px] text-zinc-600 mt-1">Letters, numbers, and underscores only</p>
          </div>
          <div>
            <label className="block text-xs font-black uppercase text-neon-magenta mb-2 font-sans">
              Password (min 8 chars)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan focus:outline-none text-sm"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-danger text-xs border-l-2 border-danger pl-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-neon-cyan hover:bg-starlight text-black font-black uppercase text-xs tracking-[0.15em] border-2 border-black"
          >
            Create Account
          </button>

          <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest">
            Already registered?{" "}
            <Link to="/login" className="text-neon-cyan hover:text-starlight">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
