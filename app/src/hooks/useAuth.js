import React, { useCallback, useEffect, useRef, useState } from "react";

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
    ...init,
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload?.error || "Request failed");
    error.status = response.status;
    error.info = payload;
    throw error;
  }

  return payload;
};

export const useAuth = () => {
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
    if (!isMountedRef.current) {
      return;
    }

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

      if (!suppressLoadingState) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const payload = await fetchJson("/api/auth/session");
        if (!isMountedRef.current || refreshInFlight.current !== requestId) {
          return;
        }
        updateSessionFromPayload(payload);
      } catch (err) {
        if (!isMountedRef.current || refreshInFlight.current !== requestId) {
          return;
        }
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

  const startLogin = useCallback(async () => {
    setIsLoggingIn(true);
    setError(null);

    try {
      const { authorizationUrl } = await fetchJson("/api/auth/login");
      if (authorizationUrl) {
        window.location.href = authorizationUrl;
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoggingIn(false);
      }
    }
  }, []);

  const startLogout = useCallback(async () => {
    setIsLoggingOut(true);
    setError(null);

    try {
      const payload = await fetchJson("/api/auth/logout", {
        method: "POST",
      });

      updateSessionFromPayload(null);
      if (payload?.redirect) {
        window.location.href = payload.redirect;
        return;
      }
      await refreshSession({ suppressLoadingState: true });
    } catch (err) {
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoggingOut(false);
      }
    }
  }, [refreshSession, updateSessionFromPayload]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    login: startLogin,
    logout: startLogout,
    isLoggingIn,
    isLoggingOut,
    refreshSession,
  };
};
