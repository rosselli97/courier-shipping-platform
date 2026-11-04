import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import type { NotificationItem, NotificationList } from "./types";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiGet<NotificationList>("/notifications"),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    void qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => apiPost<NotificationItem>(`/notifications/${id}/read`),
    onSuccess: refresh,
  });

  const markAll = useMutation({
    mutationFn: () => apiPost<{ updated: number }>("/notifications/read-all"),
    onSuccess: refresh,
  });

  return { markRead, markAll };
}
