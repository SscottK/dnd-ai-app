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
    let response;
    try {
      response = await apiFetch("/auth/login", {
        method: "POST",
        body: { username, password },
      });
    } catch (error) {
      console.error("Login failed:", error);
      throw new Error(
        "Could not reach the server. If you are on production, wait for the backend to wake up and try again."
      );
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail = Array.isArray(err.detail)
        ? err.detail.map((item) => item.msg).join(", ")
        : err.detail;

      if (response.status === 401) {
        throw new Error(
          "Incorrect username or password. If the app was recently redeployed, your account may have been reset — try creating a new one."
        );
      }

      throw new Error(detail || `Login failed (${response.status})`);
    }

    const data = await response.json();
    const user = await persistSession(data.access_token);
    if (!user) {
      throw new Error("Signed in, but the session could not be loaded. Try again.");
    }
    return user;
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
