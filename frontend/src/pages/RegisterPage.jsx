import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Scroll, ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../lib/api";
import { APP_NAME } from "../constants/branding";
import { FanContentNotice, SiteAboutBlurb } from "../components/FanContentNotice";

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
    <div className="flex min-h-[100dvh] items-center justify-center bg-void-deep px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="border-4 border-neon-cyan bg-black p-6 shadow-[0_0_30px_rgba(5,217,232,0.25)] sm:p-8">
          <div className="mb-6 text-center">
            <Scroll className="mx-auto mb-2 h-14 w-14 text-neon-magenta" />
            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-starlight">
              {APP_NAME}
            </h1>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-zinc-500">
              {registrationOpen === null ? "Loading…" : heading}
            </p>
          </div>

          <SiteAboutBlurb />

          {isRequestMode && (
            <p className="mt-3 text-left text-xs font-mono leading-relaxed text-zinc-500 normal-case tracking-normal">
              Open signup is off on purpose. Choose a username and password, optionally say who
              invited you, and an admin will review the request before you can sign in.
            </p>
          )}

          <div className="my-6 border-t border-zinc-800" />

          <form
            onSubmit={isRequestMode ? handleRequestAccess : handleOpenRegister}
            className="space-y-4 font-mono"
          >
            <div>
              <label className="mb-2 block font-sans text-xs font-black uppercase text-neon-magenta">
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
                className="w-full border-2 border-neon-cyan bg-black px-4 py-3 text-sm text-neon-cyan focus:outline-none disabled:opacity-50"
              />
              <p className="mt-1 text-[9px] text-zinc-600">Letters, numbers, and underscores only</p>
            </div>
            <div>
              <label className="mb-2 block font-sans text-xs font-black uppercase text-neon-magenta">
                Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={registrationOpen === null}
                className="w-full border-2 border-neon-cyan bg-black px-4 py-3 text-sm text-neon-cyan focus:outline-none disabled:opacity-50"
              />
            </div>

            {isRequestMode && (
              <div>
                <label className="mb-2 block font-sans text-xs font-black uppercase text-neon-magenta">
                  Message (optional)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Who invited you, which campaign, etc."
                  disabled={registrationOpen === null}
                  className="w-full resize-y border-2 border-neon-cyan bg-black px-4 py-3 text-sm text-neon-cyan focus:outline-none disabled:opacity-50"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 border-l-2 border-danger pl-2 text-xs text-danger">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span className="font-bold">{error}</span>
              </div>
            )}

            {success && (
              <div className="border-l-2 border-neon-cyan pl-2 text-xs font-bold text-neon-cyan">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={registrationOpen === null}
              className="w-full border-2 border-black bg-neon-cyan py-3.5 text-xs font-black uppercase tracking-[0.15em] text-black hover:bg-starlight disabled:opacity-50"
            >
              {submitLabel}
            </button>

            <p className="text-center text-[10px] uppercase tracking-widest text-zinc-500">
              Already have access?{" "}
              <Link to="/login" className="text-neon-cyan hover:text-starlight">
                Sign in
              </Link>
            </p>
          </form>
        </div>

        <FanContentNotice className="px-1 text-center sm:text-left" />
      </div>
    </div>
  );
}
