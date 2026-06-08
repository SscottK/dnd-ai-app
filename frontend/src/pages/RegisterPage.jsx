import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scroll, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { APP_NAME } from "../constants/branding";

export function RegisterPage() {
  const { register, isAuthenticated, isValidating } = useAuth();
  const navigate = useNavigate();
  const [registrationOpen, setRegistrationOpen] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiFetch("/auth/registration-status");
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setRegistrationOpen(Boolean(data.registration_open));
      } catch {
        if (!cancelled) setRegistrationOpen(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isValidating && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleOpenRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await register({ username, password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Registration failed");
    }
  };

  const handleRequestAccess = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const response = await apiFetch("/auth/access-request", {
        method: "POST",
        body: { username, password, message },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Could not submit access request");
      }
      setSuccess(
        "Request sent. Once an admin approves it, you can sign in with the username and password you chose."
      );
      setUsername("");
      setPassword("");
      setMessage("");
    } catch (err) {
      setError(err.message || "Could not submit access request");
    }
  };

  const isRequestMode = registrationOpen === false;
  const heading = isRequestMode ? "Request access" : "Create your account";
  const submitLabel = isRequestMode ? "Submit Request" : "Create Account";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-void-deep px-4 py-6">
      <form
        onSubmit={isRequestMode ? handleRequestAccess : handleOpenRegister}
        className="w-full max-w-md border-4 border-neon-cyan bg-black p-6 shadow-[0_0_30px_rgba(5,217,232,0.25)] sm:p-8"
      >
        <div className="text-center mb-6">
          <Scroll className="w-14 h-14 text-neon-magenta mx-auto mb-2" />
          <h1 className="text-3xl font-black text-starlight tracking-tighter italic uppercase">
            {APP_NAME}
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
            {registrationOpen === null ? "Loading…" : heading}
          </p>
          {isRequestMode && (
            <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed normal-case tracking-normal">
              This is a private group app. Pick a username and password — an admin will review your
              request before you can sign in.
            </p>
          )}
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
              disabled={registrationOpen === null}
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan focus:outline-none text-sm disabled:opacity-50"
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
              disabled={registrationOpen === null}
              className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan focus:outline-none text-sm disabled:opacity-50"
            />
          </div>

          {isRequestMode && (
            <div>
              <label className="block text-xs font-black uppercase text-neon-magenta mb-2 font-sans">
                Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Who invited you, which campaign, etc."
                disabled={registrationOpen === null}
                className="w-full px-4 py-3 border-2 border-neon-cyan bg-black text-neon-cyan focus:outline-none text-sm resize-y disabled:opacity-50"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-danger text-xs border-l-2 border-danger pl-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span className="font-bold">{error}</span>
            </div>
          )}

          {success && (
            <div className="text-neon-cyan text-xs border-l-2 border-neon-cyan pl-2 font-bold">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={registrationOpen === null}
            className="w-full py-3.5 bg-neon-cyan hover:bg-starlight text-black font-black uppercase text-xs tracking-[0.15em] border-2 border-black disabled:opacity-50"
          >
            {submitLabel}
          </button>

          <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest">
            Already have access?{" "}
            <Link to="/login" className="text-neon-cyan hover:text-starlight">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
