"use client";

import { ArrowDownCircle, X } from "lucide-react";
import type { StreamNotification } from "@/lib/notifications/use-notification-stream";
import { getAvatarColor } from "@/lib/utils";

interface Props {
  notification: StreamNotification;
  onDismiss: () => void;
  onView: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  mention: "mentioned you",
  comment: "commented on your page",
  reply: "replied to your comment",
  resolved: "resolved a thread",
  reopened: "reopened a thread",
  access_granted: "granted you page access",
  workspace_invite: "added you to a workspace",
  workspace_invite_accepted: "accepted your workspace invite",
  guest_accepted: "accepted your invitation",
  trash_warning: "page will be deleted soon",
  page_update: "updated a page",
  page_created: "created a new page",
  task_assigned: "assigned you a task",
  reminder: "has a reminder due",
  role_changed: "changed your role",
};

// Rendered via sonner's toast.custom() (see notification-provider.tsx) — purely presentational now,
// sonner owns enter/exit/stacking/dismiss timing, so the old bespoke rAF/setTimeout fade animation is gone.
export function NotificationToastCard({
  notification,
  onDismiss,
  onView,
}: Props) {
  const who = notification.senderName ?? "System";
  const label = TYPE_LABEL[notification.type] ?? "sent you a notification";
  const initials = who.slice(0, 2).toUpperCase();
  const isSystem = !notification.senderId;

  return (
    <div className="w-90 overflow-hidden rounded-lg border border-base-300 bg-base-100">
      {/* Progress bar — pure CSS animation tied to the same 5s duration
          passed to toast.custom's `duration` option. */}
      <div
        className="h-0.5 bg-primary"
        style={{
          animation: "toast-shrink 5s linear forwards",
          transformOrigin: "left",
        }}
      />

      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Avatar */}
        {isSystem ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-base-200/50 text-base-content/70">
            <ArrowDownCircle size={16} />
          </div>
        ) : (
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white select-none ${getAvatarColor(who)}`}
          >
            {initials}
          </div>
        )}

        {/* Body */}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-base-content">
            {!isSystem && <span className="font-semibold">{who} </span>}
            <span className="text-base-content/70">{label}</span>
          </p>
          {notification.pageTitle && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-base-content/70">
              <span>{notification.pageIcon ?? "📄"}</span>
              <span className="truncate">{notification.pageTitle}</span>
            </p>
          )}
          {notification.contentSnippet && (
            <p className="mt-1.5 line-clamp-2 rounded-sm bg-base-200/50 px-2.5 py-1.5 text-xs text-base-content/70">
              {notification.contentSnippet}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="ml-1 flex shrink-0 flex-col items-end gap-2">
          <button
            aria-label="Dismiss notification"
            className="flex size-6 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200/50 hover:text-base-content/70"
            onClick={onDismiss}
            type="button"
          >
            <X size={13} />
          </button>
          <button
            className="whitespace-nowrap rounded-sm bg-primary px-2.5 py-1 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
            onClick={onView}
            type="button"
          >
            View
          </button>
        </div>
      </div>

      <style>{`
        @keyframes toast-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
