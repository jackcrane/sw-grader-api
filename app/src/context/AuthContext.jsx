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
const VIEW_AS_STORAGE_KEY = "fb:viewAsStudent";

const readStoredViewPreference = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(VIEW_AS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

// ---- internal stateful hook; used ONLY by the provider ----
const useProvideAuth = () => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isMountedRef = useRef(true);
  const refreshInFlight = useRef(0);
  const identifiedUserIdRef = useRef(null);
  const [viewAsStudent, setViewAsStudent] = useState(
    () => readStoredViewPreference()
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        VIEW_AS_STORAGE_KEY,
        viewAsStudent ? "true" : "false"
      );
    } catch {
      // ignore storage failures
    }
  }, [viewAsStudent]);

  const identifyUserWithPosthog = useCallback((nextUser) => {
    if (typeof window === "undefined") return;
    const client = window.posthog;
    const distinctId = nextUser?.id;
    if (!client?.identify || !distinctId) return;
    if (identifiedUserIdRef.current === distinctId) return;
    const name =
      [nextUser.firstName, nextUser.lastName].filter(Boolean).join(" ").trim() ||
      undefined;
    client.identify(distinctId, {
      name,
      email: nextUser.email ?? undefined,
    });
    identifiedUserIdRef.current = distinctId;
  }, []);

  const resetPosthogIdentity = useCallback(() => {
    if (typeof window === "undefined") return;
    identifiedUserIdRef.current = null;
    const client = window.posthog;
    if (typeof client?.reset === "function") {
      client.reset();
    }
  }, []);

  const updateSessionFromPayload = useCallback(
    (payload) => {
      if (!isMountedRef.current) return;
      const nextAuthenticated = Boolean(payload?.authenticated);
      const nextUser = payload?.user ?? null;
      setUser(nextUser);
      setIsAuthenticated(nextAuthenticated);
      if (nextAuthenticated && nextUser) {
        identifyUserWithPosthog(nextUser);
      } else if (!nextAuthenticated) {
        resetPosthogIdentity();
      }
    },
    [identifyUserWithPosthog, resetPosthogIdentity]
  );

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

  const login = useCallback(async ({ email, password }) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const payload = await fetchJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      updateSessionFromPayload(payload);
      return payload;
    } catch (err) {
      if (isMountedRef.current && (err?.status ?? 500) >= 500) {
        setError(err);
      }
      throw err;
    } finally {
      if (isMountedRef.current) setIsLoggingIn(false);
    }
  }, [updateSessionFromPayload]);

  const register = useCallback(async ({ email, password, firstName, lastName }) => {
    setIsRegistering(true);
    setError(null);
    try {
      const payload = await fetchJson("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      updateSessionFromPayload(payload);
      return payload;
    } catch (err) {
      if (isMountedRef.current && (err?.status ?? 500) >= 500) {
        setError(err);
      }
      throw err;
    } finally {
      if (isMountedRef.current) setIsRegistering(false);
    }
  }, [updateSessionFromPayload]);

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
    register,
    logout,
    isLoggingIn,
    isRegistering,
    isLoggingOut,
    refreshSession,
    viewAsStudent,
    setViewAsStudent,
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
