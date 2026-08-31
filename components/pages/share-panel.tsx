"use client";

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  Building2,
  Check,
  ChevronDown,
  Globe,
  Link2,
  Lock,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { getAvatarColor } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type AccessLevel = "full_access" | "can_edit" | "can_comment" | "can_view";
type PublicLevel = "can_view" | "can_comment";

interface PermissionGrant {
  accessLevel: AccessLevel;
  guestEmail: string | null;
  id: string;
  userEmail: string | null;
  userId: string | null;
  userImage: string | null;
  userName: string | null;
}

interface PublicLink {
  accessLevel: PublicLevel;
  id: string;
  isActive: boolean;
  token: string;
}

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "can_edit", label: "Can edit" },
  { value: "can_comment", label: "Can comment" },
  { value: "can_view", label: "Can view" },
  { value: "full_access", label: "Full access" },
];

const PUBLIC_OPTIONS: { value: PublicLevel; label: string }[] = [
  { value: "can_view", label: "Can view" },
  { value: "can_comment", label: "Can comment" },
];

type GeneralAccess = "invited" | "workspace" | "public";

const GENERAL_ACCESS_OPTIONS: {
  value: GeneralAccess;
  label: string;
  icon: typeof Lock;
}[] = [
  { value: "invited", label: "Only people invited", icon: Lock },
  { value: "workspace", label: "Workspace members", icon: Building2 },
  { value: "public", label: "Anyone with the link", icon: Globe },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface SharePanelProps {
  currentUserEmail: string | null;
  currentUserId: string;
  currentUserImage: string | null;
  currentUserName: string | null;
  isPrivate: boolean;
  onClose: () => void;
  onPrivateToggle: (isPrivate: boolean) => Promise<void>;
  pageId: string;
  pageShortId: string;
  workspaceSlug: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: image is a reset trigger, not a value read here. Without it `failed` stays latched after the avatar URL changes and the new image is never retried.
  useEffect(() => {
    setFailed(false);
  }, [image]);
  if (image && !failed) {
    return (
      // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a browser resource-lifecycle event, not a user interaction — it swaps to the initials fallback when the avatar URL 404s. There is nothing here for a keyboard or screen-reader user to reach.
      <img
        alt={name ?? ""}
        className="size-7 shrink-0 rounded-full object-cover"
        onError={() => setFailed(true)}
        src={image}
      />
    );
  }
  return (
    <div
      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white select-none ${getAvatarColor(name ?? "?")}`}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function SelectField({
  value,
  options,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      className={`h-9 shrink-0 rounded-sm border border-base-300 bg-base-200 px-2.5 text-xs text-base-content transition-colors hover:bg-base-200/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      value={value}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function GeneralAccessControl({
  value,
  onChange,
  disabled,
}: {
  value: GeneralAccess;
  onChange: (v: GeneralAccess) => void;
  disabled?: boolean;
}) {
  const current =
    GENERAL_ACCESS_OPTIONS.find((o) => o.value === value) ??
    GENERAL_ACCESS_OPTIONS[1]!;
  const Icon = current.icon;

  return (
    <Listbox disabled={disabled} onChange={onChange} value={value}>
      <ListboxButton className="h-9 w-full flex items-center gap-2.5 rounded-sm border border-base-300 bg-base-200/20 px-3 text-left transition-colors hover:bg-base-200/40 disabled:opacity-60 data-open:bg-base-200/40">
        <Icon className="shrink-0 text-base-content/70" size={14} />
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-base-content">
          {current.label}
        </span>
        {disabled ? (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-base-300 border-t-primary" />
        ) : (
          <ChevronDown
            className="shrink-0 text-base-content/70 transition-transform duration-150 data-open:rotate-180"
            size={13}
          />
        )}
      </ListboxButton>

      <ListboxOptions
        anchor={{ to: "bottom start", gap: 4 }}
        className="z-600 w-(--button-width) overflow-hidden rounded-md border border-base-300 bg-neutral p-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
        transition
      >
        {GENERAL_ACCESS_OPTIONS.map((o) => {
          const OptionIcon = o.icon;
          return (
            <ListboxOption
              className="flex w-full cursor-default items-center gap-2.5 rounded-sm px-3 py-2 text-left transition-colors data-focus:bg-base-200"
              key={o.value}
              value={o.value}
            >
              {({ selected }) => (
                <>
                  <OptionIcon
                    className={`shrink-0 ${selected ? "text-primary" : "text-base-content/70"}`}
                    size={14}
                  />
                  <span
                    className={`flex-1 min-w-0 truncate text-[13px] font-medium ${selected ? "text-primary" : "text-base-content"}`}
                  >
                    {o.label}
                  </span>
                  {selected && (
                    <Check className="shrink-0 text-primary" size={13} />
                  )}
                </>
              )}
            </ListboxOption>
          );
        })}
      </ListboxOptions>
    </Listbox>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2.5 text-xs font-semibold tracking-wide text-base-content/70">
      {children}
    </p>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function SharePanel({
  pageId,
  pageShortId,
  workspaceSlug,
  currentUserId,
  currentUserName,
  currentUserEmail,
  currentUserImage,
  isPrivate: initialPrivate,
  onClose,
  onPrivateToggle,
}: SharePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [publicLink, setPublicLink] = useState<PublicLink | null>(null);
  const [isPrivate, setIsPrivate] = useState(initialPrivate);
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const [copied, setCopied] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [pendingRemoveGrant, setPendingRemoveGrant] =
    useState<PermissionGrant | null>(null);

  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [permRes, linkRes] = await Promise.all([
      fetch(`/api/pages/${pageId}/permissions`),
      fetch(`/api/pages/${pageId}/public-link`),
    ]);
    if (permRes.ok) {
      setPermissions((await permRes.json()).permissions ?? []);
    }
    if (linkRes.ok) {
      setPublicLink((await linkRes.json()).link);
    }
    setLoading(false);
  }, [pageId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Invite ────────────────────────────────────────────────────────────────

  async function invite() {
    const email = inviteEmail.trim();
    if (!email) {
      return;
    }
    setInviting(true);
    setInviteError("");
    setInviteSuccess(false);
    try {
      const res = await fetch(`/api/pages/${pageId}/guests/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accessLevel: "can_edit" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to invite");
        return;
      }
      setInviteEmail("");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
      await load();
    } finally {
      setInviting(false);
    }
  }

  // ── Permission management ─────────────────────────────────────────────────

  async function changeLevel(userId: string, level: AccessLevel) {
    await fetch(`/api/pages/${pageId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, accessLevel: level }),
    });
    setPermissions((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, accessLevel: level } : p))
    );
  }

  async function removeGrant(grant: PermissionGrant) {
    if (grant.userId) {
      await fetch(`/api/pages/${pageId}/permissions?userId=${grant.userId}`, {
        method: "DELETE",
      });
    } else if (grant.guestEmail) {
      await fetch(`/api/pages/${pageId}/guests/${grant.id}`, {
        method: "DELETE",
      });
    }
    setPermissions((prev) => prev.filter((p) => p.id !== grant.id));
  }

  // ── Public link ───────────────────────────────────────────────────────────

  async function togglePublicLink(on: boolean) {
    const res = await fetch(`/api/pages/${pageId}/public-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: on,
        accessLevel: publicLink?.accessLevel ?? "can_view",
      }),
    });
    if (res.ok) {
      setPublicLink((await res.json()).link);
    }
  }

  async function changePublicLevel(level: PublicLevel) {
    const res = await fetch(`/api/pages/${pageId}/public-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true, accessLevel: level }),
    });
    if (res.ok) {
      setPublicLink((await res.json()).link);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── General access ───────────────────────────────────────────────────────

  async function setPrivate(next: boolean) {
    await onPrivateToggle(next);
    setIsPrivate(next);
  }

  async function changeGeneralAccess(next: GeneralAccess) {
    setSavingAccess(true);
    try {
      if (next === "public") {
        if (isPrivate) {
          await setPrivate(false);
        }
        if (!isPublicActive) {
          await togglePublicLink(true);
        }
      } else {
        if (isPublicActive) {
          await togglePublicLink(false);
        }
        await setPrivate(next === "invited");
      }
    } finally {
      setSavingAccess(false);
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const isPublicActive = publicLink?.isActive ?? false;
  const generalAccess: GeneralAccess = isPublicActive
    ? "public"
    : isPrivate
      ? "invited"
      : "workspace";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shareUrl =
    generalAccess === "public" && publicLink?.token
      ? `${origin}/p/${publicLink.token}`
      : `${origin}/app/${workspaceSlug}/${pageShortId}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="w-115 max-w-[calc(100vw-32px)] rounded-md border border-base-300 bg-neutral overflow-hidden flex flex-col"
        ref={panelRef}
        style={{ maxHeight: "calc(100vh - 80px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
          <span className="text-sm font-semibold text-base-content tracking-tight">
            Share
          </span>
          <button
            className="rounded-sm p-1.5 text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Invite people */}
          <div className="px-5 pt-3 pb-3">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 min-w-0 rounded-sm border border-base-300 bg-base-200/30 px-3.5 py-2.5 text-[13px] text-base-content placeholder:text-base-content/50 focus:border-primary/50 focus:bg-base-100 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError("");
                  setInviteSuccess(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    invite();
                  }
                }}
                placeholder="Email or group, separated by commas"
                type="email"
                value={inviteEmail}
              />
              <button
                className="flex items-center gap-1.5 rounded-sm bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-content hover:bg-primary/90 active:bg-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                disabled={inviting || !inviteEmail.trim()}
                onClick={invite}
                type="button"
              >
                {inviting && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                Invite
              </button>
            </div>
            {inviteError && (
              <p className="mt-2 text-xs text-error">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="mt-2 text-xs text-primary font-medium">
                Invitation sent successfully.
              </p>
            )}
          </div>

          <div className="h-px bg-base-300 mx-5" />

          {/* People with access */}
          <div className="px-5 py-3">
            <div className="space-y-0.5">
              {/* Owner — always shown, not editable */}
              <div className="flex items-center gap-3 rounded-sm px-2 py-1.5">
                <Avatar
                  image={currentUserImage}
                  name={currentUserName ?? currentUserEmail}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-base-content truncate leading-tight">
                      {currentUserName ?? currentUserEmail ?? "You"}
                    </span>
                    <span className="text-xs text-base-content/70 shrink-0">
                      (you)
                    </span>
                  </div>
                  {currentUserName && currentUserEmail && (
                    <p className="text-xs text-base-content/70 truncate leading-tight">
                      {currentUserEmail}
                    </p>
                  )}
                </div>
                <span className="text-xs text-base-content/70 shrink-0">
                  Full access
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-base-300 border-t-primary" />
                </div>
              ) : (
                permissions.map((grant) => {
                  const isCurrentUser = grant.userId === currentUserId;
                  const displayName =
                    grant.userName ?? grant.guestEmail ?? "Unknown";
                  const displayEmail =
                    grant.userEmail ?? grant.guestEmail ?? "";
                  const isGuest = !grant.userId || !!grant.guestEmail;
                  const showEmail =
                    displayEmail && displayEmail !== displayName;

                  return (
                    <div
                      className="group flex items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-base-200/40 transition-colors"
                      key={grant.id}
                    >
                      <Avatar image={grant.userImage} name={displayName} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[13px] font-medium text-base-content truncate leading-tight">
                            {displayName}
                          </span>
                          {isCurrentUser && (
                            <span className="text-xs text-base-content/70 shrink-0">
                              (you)
                            </span>
                          )}
                          {isGuest && (
                            <span className="shrink-0 rounded-xs border border-primary/20 bg-primary/10 px-1.5 py-px text-xs font-semibold text-primary leading-none">
                              GUEST
                            </span>
                          )}
                        </div>
                        {showEmail && (
                          <p className="text-xs text-base-content/70 truncate leading-tight">
                            {displayEmail}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <SelectField
                          disabled={isCurrentUser || !grant.userId}
                          onChange={(v) => {
                            if (grant.userId) {
                              changeLevel(grant.userId, v as AccessLevel);
                            }
                          }}
                          options={ACCESS_OPTIONS}
                          value={grant.accessLevel}
                        />
                        {!isCurrentUser && (
                          <button
                            className="rounded-sm p-1.5 text-base-content/70 opacity-0 group-hover:opacity-100 hover:bg-error/10 hover:text-error transition-colors duration-150"
                            onClick={() => setPendingRemoveGrant(grant)}
                            onMouseEnter={(e) =>
                              showTooltip("Remove access", e)
                            }
                            onMouseLeave={hideTooltip}
                            type="button"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="h-px bg-base-300 mx-5" />

          {/* General access */}
          <div className="px-5 py-3">
            <SectionLabel>General access</SectionLabel>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <GeneralAccessControl
                  disabled={savingAccess}
                  onChange={changeGeneralAccess}
                  value={generalAccess}
                />
              </div>
              {generalAccess === "public" && publicLink && (
                <SelectField
                  className="w-36"
                  onChange={(v) => changePublicLevel(v as PublicLevel)}
                  options={PUBLIC_OPTIONS}
                  value={publicLink.accessLevel}
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-base-300 px-5 py-3">
          <button
            className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/80 hover:border-primary/30 hover:bg-primary/5 transition-colors"
            onClick={copyLink}
            type="button"
          >
            {copied ? (
              <Check className="text-primary" size={12} />
            ) : (
              <Link2 size={12} />
            )}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Remove"
        description={`${pendingRemoveGrant?.userName ?? pendingRemoveGrant?.guestEmail ?? "This person"} will lose access to this page immediately.`}
        onConfirm={() => {
          if (pendingRemoveGrant) {
            removeGrant(pendingRemoveGrant);
            setPendingRemoveGrant(null);
          }
        }}
        onOpenChange={(o) => !o && setPendingRemoveGrant(null)}
        open={!!pendingRemoveGrant}
        title="Remove access?"
      />

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
