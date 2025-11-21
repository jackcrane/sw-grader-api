import { useCallback, useMemo } from "react";
import useSWR from "swr";

export const useNotifications = ({ enabled }) => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "/api/notifications" : null
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);

  const refresh = useCallback(() => mutate(), [mutate]);

  return {
    notifications,
    error,
    isLoading,
    refresh,
    hasPending: notifications.length > 0,
  };
};
