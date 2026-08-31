"use client";

import { Bell, CircleCheck, Mail, Settings, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  NotificationCard,
  type NotificationItem,
} from "@/components/notifications/notification-card";
import { useNotifications } from "@/components/notifications/notification-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Envelope with a checkmark badge cut into the corner — matches the
// "mark all as read" glyph style requested over the plain double-check.
function MailReadIcon() {
  return (
    <span className="relative inline-flex">
      <Mail size={14} />
      <span className="absolute -bottom-0.75 -right-0.75 flex size-2.75 items-center justify-center rounded-full bg-base-100">
        <CircleCheck size={11} strokeWidth={2.5} />
      </span>
    </span>
  );
}

type FilterKey = "all" | "mentions" | "comments" | "updates";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mentions", label: "Mentions" },
  { key: "comments", label: "Comments" },
  { key: "updates", label: "Updates" },
];

interface Props {
  workspaceId: string;
  workspaceSlug: string;
}

export function NotificationPanel({ workspaceId, workspaceSlug }: Props) {
  const router = useRouter();
  const {
    panelOpen,
    closePanel,
    markRead,
    markAllRead,
    clearAll,
    deleteNotification,
  } = useNotifications();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchNotifications = useCallback(() => {
    if (!panelOpen) {
      return;
    }
    setLoading(true);
    fetch(
      `/api/notifications?workspaceId=${encodeURIComponent(workspaceId)}&filter=${filter}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.notifications) {
          setItems(d.notifications);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [panelOpen, workspaceId, filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  function handleMarkRead(id: string) {
    markRead(id);
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  }

  function handleMarkAllRead() {
    markAllRead();
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  function handleClearAll() {
    clearAll();
    setItems([]);
    setConfirmClearAll(false);
  }

  function confirmDelete() {
    const id = confirmDeleteId;
    if (!id) {
      return;
    }
    const notification = items.find((n) => n.id === id);
    deleteNotification(id, notification ? !notification.isRead : false);
    setItems((prev) => prev.filter((n) => n.id !== id));
    setConfirmDeleteId(null);
  }

  function handleClick(notification: NotificationItem) {
    closePanel();
    if (notification.type === "trash_warning") {
      router.push(`/app/${workspaceSlug}/trash`);
    } else if (
      notification.type === "workspace_invite" &&
      notification.inviteToken
    ) {
      router.push(`/invite/${notification.inviteToken}`);
    } else if (notification.pageShortId) {
      router.push(
        `/app/${workspaceSlug}/${notification.pageShortId}?from=notifications`
      );
    }
  }

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            closePanel();
          }
        }}
        open={panelOpen}
      >
        <SheetContent
          className="gap-0 border-base-300 bg-neutral p-0 data-[side=right]:w-full data-[side=right]:sm:w-105 data-[side=right]:sm:max-w-none"
          showCloseButton={false}
          side="right"
        >
          {/* ── Header ── */}
          <div className="shrink-0 border-b border-base-300 bg-neutral">
            {/* Top accent bar */}
            <div className="h-0.75 bg-linear-to-r from-primary via-primary/60 to-transparent" />

            <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
              {/* Left: title + badge + subtitle */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bell className="shrink-0 text-primary" size={14} />
                  <h2 className="text-[15px] font-bold leading-none tracking-tight text-base-content">
                    Notifications
                  </h2>
                  {unread > 0 && (
                    <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold leading-none text-primary-content">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-base-content/70">
                  {unread > 0
                    ? `${unread} unread notification${unread === 1 ? "" : "s"}`
                    : "You're all caught up"}
                </p>
              </div>

              {/* Right: icon actions — content actions (mark-all-read, settings)
                grouped together, separated from Close since it dismisses the
                whole panel rather than acting on its content. Previously this
                also stacked "Clear all" underneath in its own row, which made
                the header two uneven tiers tall; that action now lives
                inline with the filter tabs below instead. */}
              <div className="flex shrink-0 items-center gap-0.5">
                {unread > 0 && (
                  <IconTooltipButton
                    className="flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                    icon={<MailReadIcon />}
                    label="Mark all as read"
                    onClick={handleMarkAllRead}
                  />
                )}
                <IconTooltipButton
                  className="flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                  icon={<Settings size={14} />}
                  label="Notification settings"
                  onClick={() => {
                    closePanel();
                    router.push(`/app/${workspaceSlug}/settings/notifications`);
                  }}
                />
                <div className="mx-1 h-4 w-px bg-base-300" />
                <IconTooltipButton
                  className="flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                  icon={<X size={14} />}
                  label="Close"
                  onClick={closePanel}
                />
              </div>
            </div>
          </div>

          {/* ── Filter tabs ── */}
          <div className="shrink-0 border-b border-base-300 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
                {FILTERS.map(({ key, label }) => (
                  <button
                    className={`relative flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                      filter === key
                        ? "bg-primary/10 text-primary"
                        : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    }`}
                    key={key}
                    onClick={() => setFilter(key)}
                    type="button"
                  >
                    {label}
                    {key === "all" && unread > 0 && (
                      <span
                        className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-bold leading-none ${
                          filter === key
                            ? "bg-primary text-primary-content"
                            : "bg-base-200 text-base-content/70"
                        }`}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {items.length > 0 && (
                <button
                  className="flex shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-error/5 hover:text-error"
                  onClick={() => setConfirmClearAll(true)}
                  type="button"
                >
                  <Trash2 size={11} />
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <LoadingSkeleton />
            ) : items.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <div className="divide-y divide-base-300">
                {items.map((n) => (
                  <NotificationCard
                    key={n.id}
                    notification={n}
                    onClick={handleClick}
                    onDelete={setConfirmDeleteId}
                    onMarkRead={handleMarkRead}
                    workspaceSlug={workspaceSlug}
                  />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Clear all confirmation */}
      <AlertDialog onOpenChange={setConfirmClearAll} open={confirmClearAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every notification in this workspace's
              inbox. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete single notification confirmation */}
      <AlertDialog
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
        open={confirmDeleteId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this notification?</AlertDialogTitle>
            <AlertDialogDescription>
              This notification will be permanently removed. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y divide-base-300">
      {[0, 1, 2, 3].map((i) => (
        <div className="flex gap-3 px-4 py-3.5" key={i}>
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-base-200/60" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div
              className="h-3 w-3/4 animate-pulse rounded bg-base-200/60"
              style={{ animationDelay: `${i * 0.06}s` }}
            />
            <div
              className="h-2.5 w-1/2 animate-pulse rounded bg-base-200/40"
              style={{ animationDelay: `${i * 0.06 + 0.05}s` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterKey }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-8 py-20">
      <div className="flex size-14 items-center justify-center rounded-lg border border-base-300 bg-base-200/50">
        <Bell className="text-base-content/70" size={24} />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-base-content">All caught up</p>
        <p className="mt-1 text-xs text-base-content/70">
          {filter === "all"
            ? "No notifications yet"
            : `No ${filter} notifications`}
        </p>
      </div>
    </div>
  );
}
