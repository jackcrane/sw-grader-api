import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../utils/fetchJson";

export const useSavedPaymentMethod = ({ enabled, reloadKey }) => {
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPaymentMethod(null);
      setError("");
      return;
    }
    load();
  }, [enabled, load, reloadKey]);

  return {
    paymentMethod,
    loading,
    error,
    refresh: load,
  };
};
