"use client";

import {
  AtSign,
  Check,
  Clock,
  FilePlus,
  ListChecks,
  type LucideIcon,
  Mail,
  MessageSquare,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";
import { getAvatarColor } from "@/lib/utils";

export interface NotificationItem {
  contentSnippet: string | null;
  createdAt: string;
  id: string;
  inviteToken: string | null;
  isRead: boolean;
  pageIcon: string | null;
  pageId: string | null;
  pageShortId: string | null;
  pageTitle: string | null;
  senderEmail: string | null;
  senderId: string | null;
  senderImage: string | null;
  senderName: string | null;
  sourceId: string | null;
  type: string;
}

const TYPE_ACTION: Record<string, string> = {
  mention: "mentioned you in a comment",
  comment: "commented on a page",
  reply: "replied to your comment",
  resolved: "resolved a comment thread",
  reopened: "reopened a comment thread",
  access_granted: "granted you access",
  workspace_invite: "invited you to a workspace",
  workspace_invite_accepted: "accepted your workspace invitation",
  guest_accepted: "accepted your workspace invitation",
  trash_warning: "has a page that will be permanently deleted from Trash",
  page_update: "updated a page",
  page_created: "created a new page",
  task_assigned: "assigned you a task",
  reminder: "has a reminder due",
  role_changed: "changed your role",
};

const TYPE_DOT_CLASS: Record<string, string> = {
  mention: "bg-primary",
  comment: "bg-primary",
  reply: "bg-primary",
  resolved: "bg-base-content/70",
  reopened: "bg-warning",
  access_granted: "bg-success",
  workspace_invite: "bg-primary",
  workspace_invite_accepted: "bg-success",
  guest_accepted: "bg-success",
  trash_warning: "bg-error",
  page_update: "bg-base-content/70",
  page_created: "bg-primary",
  task_assigned: "bg-success",
  reminder: "bg-warning",
  role_changed: "bg-warning",
};

const TYPE_ICON: Record<string, LucideIcon> = {
  mention: AtSign,
  comment: MessageSquare,
  reply: MessageSquare,
  resolved: Check,
  reopened: RotateCcw,
  access_granted: ShieldCheck,
  workspace_invite: Mail,
  workspace_invite_accepted: Check,
  guest_accepted: Check,
  trash_warning: Trash2,
  page_update: Pencil,
  page_created: FilePlus,
  task_assigned: ListChecks,
  reminder: Clock,
  role_changed: UserCog,
};

interface Props {
  notification: NotificationItem;
  onClick: (notification: NotificationItem) => void;
  onDelete: (id: string) => void;
  onMarkRead: (id: string) => void;
  workspaceSlug: string;
}

export function NotificationCard({
  notification,
  workspaceSlug,
  onMarkRead,
  onClick,
  onDelete,
}: Props) {
  void workspaceSlug;
  const who =
    notification.senderName?.trim() ||
    notification.senderEmail?.split("@")[0]?.trim() ||
    "Unknown";
  const action = TYPE_ACTION[notification.type] ?? "sent you a notification";
  const words = who.split(/[\s._-]+/).filter(Boolean);
  const initials = (
    words.length >= 2
      ? words[0][0]! + words[words.length - 1][0]!
      : who.slice(0, 2)
  ).toUpperCase();
  const timeAgo = relativeTime(notification.createdAt);
  const isSystem = !notification.senderId;
  const isUnread = !notification.isRead;
  const dotClass = isSystem ? undefined : TYPE_DOT_CLASS[notification.type];
  const DotIcon = isSystem ? undefined : TYPE_ICON[notification.type];

  function handleCardClick() {
    if (isUnread) {
      onMarkRead(notification.id);
    }
    onClick(notification);
  }

  return (
    <div
      className={`group relative flex cursor-pointer gap-3 px-4 py-3.5 transition-colors duration-150 ${
        isUnread
          ? "bg-primary/6 hover:bg-primary/13"
          : "bg-base-100 hover:bg-base-200"
      }`}
    >
      {/* Unread left accent */}
      {isUnread && (
        <span className="absolute left-0 top-3.5 bottom-3.5 w-0.75 rounded-r bg-primary" />
      )}

      {/* The card's action, as a real button stretched over the card. The text
         content below is static so it stays beneath this and still triggers
         the card; the hover action buttons are positioned above it. */}
      <button
        aria-label={`${who} ${action}`}
        className="absolute inset-0"
        onClick={handleCardClick}
        type="button"
      />

      {/* Avatar — pointer-events-none so the decorative status dot's
         positioning context doesn't swallow clicks meant for the card. */}
      <div className="pointer-events-none relative mt-0.5 shrink-0 self-start">
        {isSystem ? (
          <div className="flex size-9 items-center justify-center rounded-full bg-base-200/70 ring-1 ring-base-300">
            <svg
              className="size-4 text-base-content/70"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                clipRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                fillRule="evenodd"
              />
            </svg>
          </div>
        ) : notification.senderImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
          <img
            alt={who}
            className="block size-9 rounded-full object-cover ring-1 ring-base-300 select-none"
            src={notification.senderImage}
          />
        ) : (
          <div
            className={`flex size-9 items-center justify-center rounded-full text-xs font-bold text-white ring-1 ring-base-300 select-none ${getAvatarColor(who)}`}
          >
            {initials}
          </div>
        )}
        {dotClass && DotIcon && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-base-100 ${dotClass}`}
          >
            <DotIcon className="size-2.5 text-white" strokeWidth={2.5} />
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs leading-snug">
            {!isSystem && (
              <span className="font-semibold text-base-content">{who}</span>
            )}
            {!isSystem && " "}
            <span className="text-base-content/70">{action}</span>
          </p>
          <span className="mt-px shrink-0 whitespace-nowrap text-xs text-base-content/70">
            {timeAgo}
          </span>
        </div>

        {/* Page breadcrumb */}
        {notification.pageTitle && (
          <div className="mt-1 flex items-center gap-1">
            <span className="text-xs opacity-60">
              {notification.pageIcon ?? "📄"}
            </span>
            <span className="truncate text-xs font-medium text-base-content/70">
              {notification.pageTitle}
            </span>
          </div>
        )}

        {/* Content snippet */}
        {notification.contentSnippet && (
          <div className="mt-1.5 rounded-sm border border-base-300 bg-base-200/30 px-2.5 py-1.5">
            <p className="line-clamp-2 text-xs leading-relaxed text-base-content/70">
              {notification.contentSnippet}
            </p>
          </div>
        )}
      </div>

      {/* Hover action buttons */}
      <div className="absolute right-3 top-3 hidden items-center gap-0.5 rounded-sm border border-base-300 bg-base-100 p-0.5 group-hover:flex">
        {isUnread && (
          <IconTooltipButton
            className="flex size-6 items-center justify-center rounded text-base-content/70 transition-colors duration-150 hover:bg-primary/10 hover:text-primary"
            icon={<Check size={10} />}
            label="Mark as read"
            onClick={() => onMarkRead(notification.id)}
            placement="below"
          />
        )}
        <IconTooltipButton
          className="flex size-6 items-center justify-center rounded text-base-content/70 transition-colors duration-150 hover:bg-error/10 hover:text-error"
          icon={<X size={10} />}
          label="Delete notification"
          onClick={() => onDelete(notification.id)}
          placement="below"
        />
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) {
      return "Just now";
    }
    if (m < 60) {
      return `${m}m`;
    }
    const h = Math.floor(m / 60);
    if (h < 24) {
      return `${h}h`;
    }
    const d = Math.floor(h / 24);
    if (d === 1) {
      return "Yesterday";
    }
    if (d < 7) {
      return `${d}d`;
    }
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
