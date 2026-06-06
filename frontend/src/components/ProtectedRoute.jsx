import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Wand2 } from "lucide-react";

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isValidating } = useAuth();

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <div className="text-center animate-pulse">
          <Wand2 className="w-12 h-12 animate-spin text-accent mx-auto mb-4" />
          <span className="tracking-[0.3em] text-xs font-black text-ink-muted uppercase">
            REWINDING VHS CASSETTE...
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
