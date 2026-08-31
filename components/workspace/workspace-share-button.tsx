"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, Link2, Loader2, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
}

type InviteLinkState = {
  inviteLinkToken: string | null;
  inviteLinkActive: boolean;
};

export function WorkspaceShareButton({
  workspaceId,
  workspaceSlug,
  workspaceName,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  // Must copy the invite-link token (/invite/{token}), not the workspace's normal page URL —
  // that requires membership to view, so it's a dead end for anyone it's shared with.
  async function copyLink() {
    setCopying(true);
    try {
      let res = await fetch(`/api/workspaces/${workspaceId}/invite-link`);
      if (!res.ok) {
        throw new Error("Failed to load invite link");
      }
      let state: InviteLinkState = await res.json();

      if (!state.inviteLinkActive || !state.inviteLinkToken) {
        res = await fetch(`/api/workspaces/${workspaceId}/invite-link`, {
          method: "POST",
        });
        if (!res.ok) {
          toast.error(
            res.status === 403
              ? "Ask a workspace admin to turn on the invite link"
              : "Couldn't create invite link — please try again."
          );
          return;
        }
        state = await res.json();
      }

      await navigator.clipboard.writeText(
        `${window.location.origin}/invite/${state.inviteLinkToken}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy invite link — please try again.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-base-300 bg-base-100 px-3.5 text-sm font-medium text-base-content/70 transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary active:scale-[0.97]">
            <Share2 size={14} />
            Share
          </PopoverButton>

          <PopoverPanel
            className="absolute right-0 top-full z-600 mt-2 w-[calc(100vw-24px)] max-w-80 overflow-hidden rounded-lg border border-base-300 bg-neutral shadow-lg transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
            transition
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-base-300 pl-5 pr-4 py-3.5">
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded bg-primary/10">
                  <Share2 className="text-primary" size={14} />
                </div>
                <span className="text-sm font-semibold text-base-content">
                  Share workspace
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 py-3.5 space-y-3">
              {/* Workspace name pill */}
              <div className="flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-3 py-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-xs bg-primary text-sm font-bold text-primary-content">
                  {workspaceName[0]?.toUpperCase() ?? "W"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-base-content">
                    {workspaceName}
                  </p>
                  <p className="text-xs text-base-content/70">Workspace</p>
                </div>
              </div>

              {/* Copy link */}
              <button
                className="flex w-full items-center gap-3 rounded-sm border border-base-300 bg-base-100 px-3.5 py-2.5 text-left transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] disabled:opacity-70"
                disabled={copying}
                onClick={copyLink}
                type="button"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-base-200/60">
                  {copying ? (
                    <Loader2 className="size-4 animate-spin text-base-content/70" />
                  ) : copied ? (
                    <Check className="size-4 text-success" />
                  ) : (
                    <Link2 className="size-4 text-base-content/70" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-content">
                    {copied ? "Copied!" : "Copy workspace link"}
                  </p>
                  <p className="text-xs text-base-content/70">
                    Share this URL with teammates
                  </p>
                </div>
              </button>

              {/* Invite members */}
              <Link
                className="flex items-center gap-3 rounded-sm border border-base-300 bg-base-100 px-3.5 py-2.5 transition-all hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98]"
                href={`/app/${workspaceSlug}/settings/members`}
                onClick={close}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10">
                  <Users className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-base-content">
                    Invite members
                  </p>
                  <p className="text-xs text-base-content/70">
                    Add teammates to this workspace
                  </p>
                </div>
              </Link>
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
