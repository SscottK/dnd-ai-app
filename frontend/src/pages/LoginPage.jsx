import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { BookOpen, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

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
    <div className="flex min-h-screen items-center justify-center bg-[#05000a] px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md p-8 border-4 border-[#ff007f] bg-black shadow-[0_0_30px_rgba(255,0,127,0.3)]"
      >
        <div className="text-center mb-6">
          <BookOpen className="w-14 h-14 text-[#00ffff] mx-auto mb-2 drop-shadow-[0_0_8px_#00ffff]" />
          <h1 className="text-4xl font-black text-[#fffb00] tracking-tighter italic uppercase drop-shadow-[0_2px_0px_#ff007f]">
            D&amp;D AI APP
          </h1>
          <p className="text-[10px] text-[#00ffff] uppercase tracking-[0.2em] font-extrabold mt-1">
            Sign in to your account
          </p>
        </div>

        <div className="space-y-4 font-mono">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#ff007f] mb-2 font-sans">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your username..."
              className="w-full px-4 py-3 border-2 border-[#00ffff] bg-black text-[#00ffff] placeholder-[#004e4e] focus:outline-none focus:border-[#fffb00] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-[#ff007f] mb-2 font-sans">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your secret passphrase..."
              className="w-full px-4 py-3 border-2 border-[#00ffff] bg-black text-[#00ffff] placeholder-[#004e4e] focus:outline-none focus:border-[#fffb00] text-sm"
            />
          </div>

          {loginError && (
            <div className="flex items-center gap-2 text-[#ff003c] text-xs border-l-2 border-[#ff003c] pl-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span className="font-bold tracking-tight">{loginError}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-[#ff007f] hover:bg-[#fffb00] text-black font-black transition-colors uppercase text-xs tracking-[0.15em] border-2 border-black"
          >
            Sign In
          </button>

          <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest">
            No account?{" "}
            <Link to="/register" className="text-[#00ffff] hover:text-[#fffb00]">
              Create one
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
