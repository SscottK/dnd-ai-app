import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!token);
  const [isValidating, setIsValidating] = useState(!!token);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const loadUser = useCallback(
    async (authToken) => {
      const response = await apiFetch("/auth/me", { token: authToken });
      if (!response.ok) {
        logout();
        return null;
      }
      const data = await response.json();
      setUser(data.user);
      setIsAuthenticated(true);
      return data.user;
    },
    [logout]
  );

  const verifyToken = useCallback(
    async (authToken) => {
      setIsValidating(true);
      try {
        await loadUser(authToken);
      } catch (error) {
        console.error("Token verification failed:", error);
        logout();
      } finally {
        setIsValidating(false);
      }
    },
    [loadUser, logout]
  );

  useEffect(() => {
    if (token) {
      verifyToken(token);
    } else {
      setIsValidating(false);
    }
  }, [token, verifyToken]);

  const persistSession = async (accessToken) => {
    localStorage.setItem("token", accessToken);
    setToken(accessToken);
    return loadUser(accessToken);
  };

  const login = async (username, password) => {
    try {
      const response = await apiFetch("/auth/login", {
        method: "POST",
        body: { username, password },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return persistSession(data.access_token);
    } catch (error) {
      console.error("Login failed:", error);
      return null;
    }
  };

  const register = async ({ username, password }) => {
    const response = await apiFetch("/auth/register", {
      method: "POST",
      body: { username, password },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail = Array.isArray(err.detail)
        ? err.detail.map((d) => d.msg).join(", ")
        : err.detail;
      throw new Error(detail || "Registration failed");
    }

    const data = await response.json();
    return persistSession(data.access_token);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        isValidating,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
