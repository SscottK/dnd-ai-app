import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);
const TOKEN_STORAGE_KEY = "token";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isValidating, setIsValidating] = useState(!!localStorage.getItem(TOKEN_STORAGE_KEY));
  const sessionEpochRef = useRef(0);

  const beginSession = useCallback(() => {
    sessionEpochRef.current += 1;
    return sessionEpochRef.current;
  }, []);

  const logout = useCallback(() => {
    beginSession();
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    setIsValidating(false);
  }, [beginSession]);

  const loadUser = useCallback(
    async (authToken, epoch) => {
      if (!authToken) return null;

      const response = await apiFetch("/auth/me", { token: authToken });
      if (epoch !== sessionEpochRef.current) return null;
      if (localStorage.getItem(TOKEN_STORAGE_KEY) !== authToken) return null;

      if (!response.ok) {
        logout();
        return null;
      }

      const data = await response.json();
      if (epoch !== sessionEpochRef.current) return null;
      if (localStorage.getItem(TOKEN_STORAGE_KEY) !== authToken) return null;

      setUser(data.user);
      setIsAuthenticated(true);
      return data.user;
    },
    [logout]
  );

  const verifyToken = useCallback(
    async (authToken) => {
      if (!authToken) {
        setIsValidating(false);
        return;
      }

      const epoch = sessionEpochRef.current;
      setIsValidating(true);
      try {
        await loadUser(authToken, epoch);
      } catch (error) {
        console.error("Token verification failed:", error);
        if (epoch === sessionEpochRef.current) {
          logout();
        }
      } finally {
        if (epoch === sessionEpochRef.current) {
          setIsValidating(false);
        }
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

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== TOKEN_STORAGE_KEY) return;
      const nextToken = event.newValue;
      if (!nextToken) {
        logout();
        return;
      }
      beginSession();
      setToken(nextToken);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [beginSession, logout]);

  const persistSession = useCallback(
    async (accessToken) => {
      const epoch = beginSession();
      localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
      setToken(accessToken);
      return loadUser(accessToken, epoch);
    },
    [beginSession, loadUser]
  );

  const login = async (username, password) => {
    beginSession();

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
    const nextUser = await persistSession(data.access_token);
    if (!nextUser) {
      throw new Error("Signed in, but the session could not be loaded. Try again.");
    }
    return nextUser;
  };

  const register = async ({ username, password }) => {
    beginSession();

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
