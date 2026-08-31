"use client";

import { useEffect, useRef } from "react";

export interface StreamNotification {
  contentSnippet: string | null;
  createdAt: string;
  id: string;
  inviteToken: string | null;
  isRead: boolean;
  pageIcon: string | null;
  pageId: string | null;
  pageShortId: string | null;
  pageTitle: string | null;
  senderId: string | null;
  senderImage: string | null;
  senderName: string | null;
  sourceId: string | null;
  type: string;
}

interface Options {
  enabled?: boolean;
  onNotifications: (items: StreamNotification[]) => void;
  workspaceId: string;
}

export function useNotificationStream({
  workspaceId,
  onNotifications,
  enabled = true,
}: Options) {
  const failCountRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current callback ref — avoids stale closures inside the EventSource listener
  const callbackRef = useRef(onNotifications);
  callbackRef.current = onNotifications;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;

    function connect() {
      if (!active) {
        return;
      }

      const es = new EventSource(
        `/api/notifications/stream?workspaceId=${encodeURIComponent(workspaceId)}`
      );
      esRef.current = es;

      es.addEventListener("connected", () => {
        failCountRef.current = 0;
      });

      es.addEventListener("notifications", (e) => {
        try {
          const items = JSON.parse(e.data) as StreamNotification[];
          if (items.length > 0) {
            callbackRef.current(items);
          }
        } catch {
          /* ignore parse error */
        }
      });

      es.onerror = () => {
        es.close();
        failCountRef.current += 1;

        // After 3 consecutive failures fall back to longer reconnect interval
        const delay = failCountRef.current >= 3 ? 60_000 : 5000;
        if (active) {
          timerRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      active = false;
      esRef.current?.close();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, enabled]);
}
