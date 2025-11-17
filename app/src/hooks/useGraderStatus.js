import useSWR from "swr";
import { fetchJson } from "../utils/fetchJson";

export const useGraderStatus = () => {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/system/grader-status",
    fetchJson,
    {
      refreshInterval: 30000,
    }
  );

  return {
    online: data?.online ?? null,
    pendingSubmissionCount: data?.pendingSubmissionCount ?? 0,
    queueDepth: data?.queueDepth ?? 0,
    queueProcessing: data?.queueProcessing ?? 0,
    lastCheckedAt: data?.lastCheckedAt ?? null,
    lastSuccessAt: data?.lastSuccessAt ?? null,
    loading: isLoading,
    error,
    refresh: mutate,
  };
};
