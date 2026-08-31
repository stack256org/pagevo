"use client";

import { Bell } from "lucide-react";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { useNotifications } from "@/components/notifications/notification-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  collapsed?: boolean;
  workspaceId: string;
  workspaceSlug: string;
}

export function NotificationBell({
  workspaceSlug,
  workspaceId,
  collapsed = false,
}: Props) {
  const { unreadCount, panelOpen, openPanel, closePanel } = useNotifications();
  const badge =
    unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null;

  function toggle() {
    if (panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  return (
    <>
      {collapsed ? (
        <div className="w-full">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`relative flex h-9 w-full items-center justify-center rounded-sm transition-colors duration-150 ${
                  panelOpen
                    ? "bg-base-300 text-primary"
                    : "text-base-content/60 hover:bg-base-300 hover:text-primary"
                }`}
                onClick={toggle}
                type="button"
              >
                <Bell className={panelOpen ? "text-primary" : ""} size={18} />
                {badge && (
                  <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-xs font-bold text-primary-content leading-none">
                    {badge}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent hidden={panelOpen} side="right">
              Notifications
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <button
          className={`group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 ${
            panelOpen
              ? "bg-base-300 text-primary"
              : "text-base-content/60 hover:bg-base-300 hover:text-primary"
          }`}
          onClick={toggle}
          type="button"
        >
          <span className="relative shrink-0 transition-colors duration-150">
            <Bell
              className={
                panelOpen
                  ? "text-primary"
                  : "text-base-content/50 group-hover:text-primary"
              }
              size={15}
            />
            {badge && (
              // Anchored by `left`, not `right` — the badge's left edge stays fixed
              // at the icon's corner as content widens, so a 2-digit count ("10")
              // grows outward to the right instead of extending further left and
              // swallowing the 15px icon underneath it.
              <span className="absolute -top-1 left-2.25 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-2xs font-bold text-primary-content leading-none">
                {badge}
              </span>
            )}
          </span>
          <span className="flex-1 text-left">Notifications</span>
        </button>
      )}

      <NotificationPanel
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
}
