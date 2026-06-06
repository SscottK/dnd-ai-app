import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Wand2 } from "lucide-react";

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isValidating } = useAuth();

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center animate-pulse">
          <Wand2 className="w-12 h-12 animate-spin text-[#ff007f] mx-auto mb-4 drop-shadow-[0_0_10px_#ff007f]" />
          <span className="tracking-[0.3em] text-xs font-black text-[#00ffff] uppercase drop-shadow-[0_0_5px_#00ffff]">
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
