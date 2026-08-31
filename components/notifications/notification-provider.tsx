"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { NotificationToastCard } from "@/components/notifications/notification-toast";
import {
  type StreamNotification,
  useNotificationStream,
} from "@/lib/notifications/use-notification-stream";

interface NotificationContextValue {
  clearAll: () => void;
  closePanel: () => void;
  deleteNotification: (id: string, wasUnread: boolean) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  openPanel: () => void;
  panelOpen: boolean;
  refreshCount: () => void;
  unreadCount: number;
  workspaceId: string;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider"
    );
  }
  return ctx;
}

interface Props {
  children: React.ReactNode;
  currentUserId: string;
  workspaceId: string;
  workspaceSlug: string;
}

export function NotificationProvider({
  children,
  workspaceId,
  workspaceSlug,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  // Ref so the SSE callback always reads the live panelOpen value (no stale closure)
  const panelOpenRef = useRef(false);
  panelOpenRef.current = panelOpen;

  // Notification ids already surfaced this session — guards against the same
  // row being re-delivered (SSE reconnect race, StrictMode double-mount, etc.)
  // and re-counted/re-toasted as if it were new.
  const seenNotificationIds = useRef<Set<string>>(new Set());

  const fetchCount = useCallback(() => {
    fetch(`/api/notifications?workspaceId=${encodeURIComponent(workspaceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.unreadCount != null) {
          setUnreadCount(d.unreadCount);
        }
      })
      .catch(() => {});
  }, [workspaceId]);

  // Initial count on mount
  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Poll every 60s as fallback when SSE is unavailable
  useEffect(() => {
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    fetchCount();
  }, [fetchCount]);

  // Renders the existing rich card through sonner's toast.custom() instead of a hand-rolled
  // stacked-toast queue, so notifications flow through the app's one toast pipeline (ui/sonner.tsx) instead of a second independent stack.
  const showToast = useCallback(
    (notification: StreamNotification) => {
      toast.custom(
        (id) => (
          <NotificationToastCard
            notification={notification}
            onDismiss={() => toast.dismiss(id)}
            onView={() => {
              toast.dismiss(id);
              if (notification.type === "trash_warning") {
                router.push(`/app/${workspaceSlug}/trash`);
              } else if (
                notification.type === "workspace_invite" &&
                notification.inviteToken
              ) {
                router.push(`/invite/${notification.inviteToken}`);
              } else if (notification.pageShortId) {
                router.push(
                  `/app/${workspaceSlug}/${notification.pageShortId}`
                );
              } else {
                openPanel();
              }
            }}
          />
        ),
        { id: notification.id, duration: 5000 }
      );
    },
    [router, workspaceSlug, openPanel]
  );

  // SSE — increments count + shows toast for each new notification
  useNotificationStream({
    workspaceId,
    onNotifications: (items) => {
      const freshItems = items.filter(
        (n) => !seenNotificationIds.current.has(n.id)
      );
      if (freshItems.length === 0) {
        return;
      }
      for (const n of freshItems) {
        seenNotificationIds.current.add(n.id);
      }

      setUnreadCount((c) => c + freshItems.length);
      // Ref avoids a stale closure on panelOpen; skip toasting your own actions.
      if (!panelOpenRef.current) {
        const toastable = freshItems.filter(
          (n) => n.senderId !== currentUserId
        );
        toastable.forEach(showToast);
      }
    },
  });

  const markRead = useCallback((id: string) => {
    fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => {});
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(() => {
    fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    }).catch(() => {});
    setUnreadCount(0);
  }, [workspaceId]);

  const clearAll = useCallback(() => {
    fetch("/api/notifications/clear-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    }).catch(() => {});
    setUnreadCount(0);
  }, [workspaceId]);

  const deleteNotification = useCallback((id: string, wasUnread: boolean) => {
    fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        workspaceId,
        panelOpen,
        openPanel,
        closePanel,
        markRead,
        markAllRead,
        clearAll,
        deleteNotification,
        refreshCount: fetchCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
