"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Check, ChevronDown, Mail, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageIcon } from "@/components/pages/page-icon";
import { Button } from "@/components/ui/button";
import { InviteMembersModal } from "@/components/workspace/invite-members-modal";
import { useSession } from "@/lib/auth/client";

type Workspace = {
  id: string;
  name: string;
  icon: string | null;
  slug: string;
  role: string;
  createdBy: string | null;
};

type Props = {
  currentSlug?: string;
};

export function WorkspaceSwitcher({ currentSlug }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  // Refetches on mount and every trigger click (open or close) — matches the previous
  // useEffect([open]) which re-ran on every toggle, not just on opening.
  const fetchWorkspaces = useCallback(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((data) => {
        setWorkspaces(Array.isArray(data) ? data : (data?.workspaces ?? []));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  // This switcher never remounts when Settings → General saves icon/name changes, so listen for the events instead of a stale reload.
  useEffect(() => {
    function onIconChanged(e: Event) {
      const { workspaceId, icon } = (
        e as CustomEvent<{ workspaceId: string; icon: string | null }>
      ).detail;
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, icon } : w))
      );
    }
    function onNameChanged(e: Event) {
      const { workspaceId, name } = (
        e as CustomEvent<{ workspaceId: string; name: string }>
      ).detail;
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, name } : w))
      );
    }
    window.addEventListener("pagevo:workspace-icon-changed", onIconChanged);
    window.addEventListener("pagevo:workspace-name-changed", onNameChanged);
    return () => {
      window.removeEventListener(
        "pagevo:workspace-icon-changed",
        onIconChanged
      );
      window.removeEventListener(
        "pagevo:workspace-name-changed",
        onNameChanged
      );
    };
  }, []);

  const current =
    workspaces.find((w) => w.slug === currentSlug) ?? workspaces[0];

  function switchTo(slug: string) {
    router.push(`/app/${slug}`);
  }

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 px-2">
        <span className="size-6 animate-pulse rounded bg-base-300" />
        <span className="h-3 w-24 animate-pulse rounded bg-base-300" />
      </div>
    );
  }

  return (
    <div className="relative w-full min-w-0">
      <Menu>
        <MenuButton
          className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors hover:bg-primary/5 focus:outline-none"
          onClick={fetchWorkspaces}
        >
          <WorkspaceAvatar
            icon={current?.icon ?? null}
            name={current?.name ?? "…"}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">
            {current?.name ?? "Select workspace"}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-base-content/80 transition-transform data-open:rotate-180"
            strokeWidth={2}
          />
        </MenuButton>

        <MenuItems
          anchor={{ to: "bottom start", gap: 4 }}
          className="z-600 w-72 overflow-hidden rounded-lg border border-base-300 bg-neutral transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
          transition
        >
          {/* Workspace list */}
          <div className="p-1.5">
            <p className="mb-1 px-2 text-2xs font-semibold uppercase tracking-widest text-base-content/70">
              Workspaces
            </p>
            {workspaces.map((ws) => {
              const isActive = ws.slug === currentSlug;
              return (
                <MenuItem key={ws.id}>
                  <button
                    className={`flex w-full min-w-0 items-center gap-2.5 rounded-sm px-2 py-2 text-left transition-colors duration-100 focus:outline-none data-focus:bg-base-200 hover:bg-base-200 ${isActive ? "bg-base-200" : ""}`}
                    onClick={() => switchTo(ws.slug)}
                    type="button"
                  >
                    <WorkspaceAvatar icon={ws.icon} name={ws.name} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-content">
                      {ws.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-xs px-1.5 py-0.5 text-2xs font-semibold text-base-content/70 ${isActive ? "bg-base-200" : "bg-base-200"}`}
                    >
                      {ws.role}
                    </span>
                    {/* Always reserve the same 14px slot — prevents layout shift when checkmark appears */}
                    <span className="flex size-3.5 shrink-0 items-center justify-center">
                      {isActive && (
                        <Check
                          className="size-3.5 text-primary"
                          strokeWidth={2.5}
                        />
                      )}
                    </span>
                  </button>
                </MenuItem>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-base-300 p-1.5">
            <MenuItem>
              <Button
                className="w-full justify-start gap-2 px-2 font-medium text-base-content/70 data-focus:bg-base-200 data-focus:text-base-content hover:text-base-content"
                onClick={() => router.push("/app/workspaces/new")}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
                Create workspace
              </Button>
            </MenuItem>
            <MenuItem>
              <Button
                className="w-full justify-start gap-2 px-2 font-medium text-base-content/70 data-focus:bg-base-200 data-focus:text-base-content hover:text-base-content"
                onClick={() => setShowInvite(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Mail className="size-3.5 shrink-0" />
                Invite members
              </Button>
            </MenuItem>
          </div>
        </MenuItems>
      </Menu>

      {showInvite && current && (
        <InviteMembersModal
          isOwner={!!session?.user?.id && current.createdBy === session.user.id}
          onClose={() => setShowInvite(false)}
          workspaceId={current.id}
        />
      )}
    </div>
  );
}

function WorkspaceAvatar({
  icon,
  name,
}: {
  icon: string | null;
  name: string;
}) {
  if (icon) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center">
        <PageIcon className="rounded-sm object-cover" icon={icon} size={20} />
      </span>
    );
  }
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-primary font-bold text-primary-content text-xs">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
