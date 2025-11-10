// src/context/AuthContext.jsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchJson } from "../utils/fetchJson";

const AuthContext = createContext(null);

// ---- internal stateful hook; used ONLY by the provider ----
const useProvideAuth = () => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isMountedRef = useRef(true);
  const refreshInFlight = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateSessionFromPayload = useCallback((payload) => {
    if (!isMountedRef.current) return;
    setUser(payload?.user ?? null);
    setIsAuthenticated(Boolean(payload?.authenticated));
  }, []);

  const isUnauthorizedError = useCallback((err) => {
    const status = err?.status ?? err?.info?.status;
    return status === 401 || status === 403;
  }, []);

  const refreshSession = useCallback(
    async ({ suppressLoadingState = false } = {}) => {
      const requestId = Date.now();
      refreshInFlight.current = requestId;

      if (!suppressLoadingState) setIsLoading(true);
      setError(null);

      try {
        const payload = await fetchJson("/api/auth/session");
        if (!isMountedRef.current || refreshInFlight.current !== requestId)
          return;
        updateSessionFromPayload(payload);
      } catch (err) {
        if (!isMountedRef.current || refreshInFlight.current !== requestId)
          return;
        updateSessionFromPayload(null);
        setError(isUnauthorizedError(err) ? null : err);
      } finally {
        if (isMountedRef.current && refreshInFlight.current === requestId) {
          refreshInFlight.current = 0;
          setIsLoading(false);
        }
      }
    },
    [isUnauthorizedError, updateSessionFromPayload]
  );

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const { authorizationUrl } = await fetchJson("/api/auth/login");
      if (authorizationUrl) window.location.href = authorizationUrl;
    } catch (err) {
      if (isMountedRef.current) setError(err);
    } finally {
      if (isMountedRef.current) setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    setError(null);
    try {
      const payload = await fetchJson("/api/auth/logout", { method: "POST" });
      updateSessionFromPayload(null);
      if (payload?.redirect) {
        window.location.href = payload.redirect;
        return;
      }
      await refreshSession({ suppressLoadingState: true });
    } catch (err) {
      if (isMountedRef.current) setError(err);
    } finally {
      if (isMountedRef.current) setIsLoggingOut(false);
    }
  }, [refreshSession, updateSessionFromPayload]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    isLoggingIn,
    isLoggingOut,
    refreshSession,
  };
};

// ---- provider ----
export const AuthProvider = ({ children }) => {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ---- consumer hook (use ONLY inside React components) ----
export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx)
    throw new Error("useAuthContext must be used within an AuthProvider");
  return ctx;
};
