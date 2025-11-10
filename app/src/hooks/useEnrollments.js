import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../utils/fetchJson";

export const useEnrollments = () => {
  const [enrollments, setEnrollments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(false);

  const loadEnrollments = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson("/api/enrollments", {
        signal: controller.signal,
      });
      if (isMountedRef.current) {
        setEnrollments(data);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      if (isMountedRef.current) {
        setError(err);
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadEnrollments();
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [loadEnrollments]);

  const refetch = useCallback(() => {
    if (!isMountedRef.current) return Promise.resolve();
    return loadEnrollments();
  }, [loadEnrollments]);

  return {
    enrollments,
    loading,
    error,
    refetch,
  };
};
