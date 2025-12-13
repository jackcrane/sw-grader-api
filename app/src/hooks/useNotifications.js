import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { fetchJson } from "../utils/fetchJson";

export const useNotifications = ({ enabled }) => {
  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "/api/notifications" : null
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data]);

  const refresh = useCallback(() => mutate(), [mutate]);

  const dismiss = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      await fetchJson(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });
      await mutate();
    },
    [mutate]
  );

  return {
    notifications,
    error,
    isLoading,
    refresh,
    dismiss,
    hasPending: notifications.length > 0,
  };
};
