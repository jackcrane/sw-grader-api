import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../utils/fetchJson";

const UNSET_RELOAD_KEY = Symbol("unset-reload-key");
const DEFAULT_RELOAD_KEY = Symbol("default-reload-key");

export const useSavedPaymentMethod = ({ enabled, reloadKey }) => {
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState(UNSET_RELOAD_KEY);
  const normalizedReloadKey = reloadKey ?? DEFAULT_RELOAD_KEY;

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson("/api/billing/payment-method");
      setPaymentMethod(payload?.paymentMethod ?? null);
    } catch (err) {
      setPaymentMethod(null);
      setError(
        err?.message || "Unable to load your saved payment method."
      );
    } finally {
      setLoading(false);
      setLoadedKey(normalizedReloadKey);
    }
  }, [enabled, normalizedReloadKey]);

  useEffect(() => {
    if (!enabled) {
      setPaymentMethod(null);
      setError("");
      setLoading(false);
      setLoadedKey(UNSET_RELOAD_KEY);
      return;
    }
    load();
  }, [enabled, load, reloadKey]);

  const isLoading =
    loading || (enabled && normalizedReloadKey !== loadedKey);

  return {
    paymentMethod,
    loading: isLoading,
    error,
    refresh: load,
  };
};
