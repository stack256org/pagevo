"use client";

import { AlertCircle, ArrowLeftRight, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { RoleSelect } from "@/components/ui/role-select";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { getAvatarColor } from "@/lib/utils";

type Role = "admin" | "editor" | "viewer";

const ADMIN_ROLE_OPTION = { value: "admin", label: "Admin" } as const;
const BASE_ROLE_OPTIONS = [
  { value: "editor", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;

interface MemberRow {
  createdAt: Date;
  id: string;
  invitedEmail: string | null;
  inviteExpires: Date | null;
  joinedAt: Date | null;
  role: string;
  status: string;
  userEmail: string | null;
  userId: string | null;
  userImage: string | null;
  userName: string | null;
}
interface Props {
  currentUserId: string;
  isAdmin: boolean;
  isOwner: boolean;
  members: MemberRow[];
  ownerUserId: string | null;
  workspaceId: string;
  workspaceName: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Member",
  viewer: "Viewer",
};

const ROLE_STYLES: Record<string, { badge: string; dot: string }> = {
  admin: {
    badge: "bg-base-200 text-base-content/70",
    dot: "bg-base-content/40",
  },
  editor: {
    badge: "bg-base-200 text-base-content/70",
    dot: "bg-base-content/40",
  },
  viewer: {
    badge: "bg-base-200/50 text-base-content/70",
    dot: "bg-base-content/70",
  },
};

function ago(d: Date | null | undefined) {
  if (!d) {
    return "—";
  }
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) {
    return "just now";
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  return `${Math.floor(h / 24)}d ago`;
}

export function WorkspaceMembersSection({
  workspaceId,
  currentUserId,
  isAdmin,
  isOwner,
  ownerUserId,
  members: init,
}: Props) {
  const [members, setMembers] = useState(init);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const inviteRoleOptions = isOwner
    ? [ADMIN_ROLE_OPTION, ...BASE_ROLE_OPTIONS]
    : BASE_ROLE_OPTIONS;
  const [inviting, setInviting] = useState(false);
  const [inviteErr, setInviteErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [pendingRemove, setPendingRemove] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [pendingCancelInvite, setPendingCancelInvite] = useState<{
    id: string;
    email: string;
  } | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferSent, setTransferSent] = useState<string | null>(null);
  const [transferErr, setTransferErr] = useState("");
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const active = members.filter((m) => m.status === "active");
  const invited = members.filter((m) => m.status === "invited");

  async function invite() {
    if (!email.trim()) {
      return;
    }
    const invitedEmail = email.trim();
    setInviting(true);
    setInviteErr("");
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invitedEmail, role }),
      });
      if (r.ok) {
        const newMember = await r.json();
        setMembers((prev) => [...prev, newMember]);
        setEmail("");
        toast.success("Invitation sent", {
          description: `${invitedEmail} will get an email to join as ${ROLE_LABELS[role] ?? role}.`,
        });
      } else {
        const d = await r.json().catch(() => ({}));
        setInviteErr(d.error ?? "Failed to send invite");
      }
    } catch {
      setInviteErr("Network error");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(userId: string, newRole: Role) {
    setBusy(userId);
    setActionErr("");
    try {
      const r = await fetch(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (r.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m))
        );
      } else {
        const d = await r.json().catch(() => ({}));
        setActionErr(
          (d as { error?: string }).error ?? "Failed to update role"
        );
      }
    } catch {
      setActionErr("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function remove(userId: string) {
    setBusy(userId);
    setActionErr("");
    try {
      const r = await fetch(
        `/api/workspaces/${workspaceId}/members/${userId}`,
        { method: "DELETE" }
      );
      if (r.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } else {
        const d = await r.json().catch(() => ({}));
        setActionErr(
          (d as { error?: string }).error ?? "Failed to remove member"
        );
      }
    } catch {
      setActionErr("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function cancelInvite(id: string) {
    setBusy(id);
    setActionErr("");
    try {
      const r = await fetch(
        `/api/workspaces/${workspaceId}/invitations/${id}`,
        { method: "DELETE" }
      );
      if (r.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== id));
      } else {
        const d = await r.json().catch(() => ({}));
        setActionErr(
          (d as { error?: string }).error ?? "Failed to cancel invite"
        );
      }
    } catch {
      setActionErr("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function transferOwnership(userId: string, name: string) {
    setTransferBusy(true);
    setTransferErr("");
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (r.ok) {
        setTransferSent(name);
      } else {
        const d = await r.json().catch(() => ({}));
        setTransferErr(
          (d as { error?: string }).error ?? "Failed to start transfer"
        );
      }
    } catch {
      setTransferErr("Network error");
    } finally {
      setTransferBusy(false);
    }
  }

  async function resend(id: string, email: string) {
    setBusy(`resend-${id}`);
    setActionErr("");
    try {
      const r = await fetch(
        `/api/workspaces/${workspaceId}/invitations/${id}/resend`,
        { method: "POST" }
      );
      if (r.ok) {
        toast.success("Invitation resent", {
          description: `A new invite email was sent to ${email}.`,
        });
      } else {
        const d = await r.json().catch(() => ({}));
        setActionErr(
          (d as { error?: string }).error ?? "Failed to resend invite"
        );
      }
    } catch {
      setActionErr("Network error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-195 px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6 md:pb-10">
      {/* ── Stats strip ── */}
      <div className="mb-7 grid grid-cols-3 gap-3">
        {[
          { label: "Total members", value: active.length },
          {
            label: "Admins",
            value: active.filter((m) => m.role === "admin").length,
          },
          { label: "Pending", value: invited.length },
        ].map((stat) => (
          <div
            className="rounded-md border border-base-300 bg-base-200 px-4 py-3"
            key={stat.label}
          >
            <p className="text-2xl font-bold leading-tight text-base-content">
              {stat.value}
            </p>
            <p className="text-xs text-base-content/70">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Invite ── */}
      {isAdmin && (
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
            Invite people
          </p>
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100 p-4">
            <div className="flex items-center gap-2">
              <Input
                className="flex-1 focus-visible:border-primary"
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteErr("");
                }}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                placeholder="colleague@company.com"
                type="email"
                value={email}
              />
              <RoleSelect
                onChange={(v) => setRole(v as Role)}
                options={inviteRoleOptions}
                value={role}
              />
              <Button
                disabled={inviting || !email.trim()}
                onClick={invite}
                size="sm"
                type="button"
              >
                {inviting ? "Sending…" : "Invite"}
              </Button>
            </div>
            {inviteErr && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-error">
                <AlertCircle className="shrink-0" size={14} />
                {inviteErr}
              </p>
            )}
          </div>
        </div>
      )}

      {actionErr && (
        <p className="mb-4 flex items-center gap-1.5 rounded-sm bg-error/5 px-3 py-2 text-xs text-error">
          <AlertCircle className="shrink-0" size={14} />
          {actionErr}
        </p>
      )}

      {transferErr && (
        <p className="mb-4 flex items-center gap-1.5 rounded-sm bg-error/5 px-3 py-2 text-xs text-error">
          <AlertCircle className="shrink-0" size={14} />
          {transferErr}
        </p>
      )}

      {transferSent && (
        <p className="mb-4 rounded-sm border border-base-300 bg-base-200/30 px-3 py-2 text-xs text-base-content/70">
          Confirmation email sent to your inbox — the transfer to{" "}
          <strong className="text-base-content">{transferSent}</strong>{" "}
          completes once you click the link there.
        </p>
      )}

      {/* ── Active members ── */}
      <div className="mb-7">
        <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
          Members
        </p>
        <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
          {active.map((m, i) => {
            const display =
              m.userName?.trim() ||
              m.userEmail?.trim() ||
              m.invitedEmail?.trim() ||
              "Unknown";
            const isMe = m.userId === currentUserId;
            const isAdminRow = m.role === "admin";
            const isOwnerRow = !!m.userId && m.userId === ownerUserId;
            // A regular admin can manage editors/viewers; only the owner can also
            // touch other admins. Nobody can manage their own row or the owner's
            // (the owner's role only changes via Transfer Ownership).
            const canManageRole =
              isAdmin && !isMe && !isOwnerRow && (!isAdminRow || isOwner);
            const rowRoleOptions = isOwner
              ? [ADMIN_ROLE_OPTION, ...BASE_ROLE_OPTIONS]
              : BASE_ROLE_OPTIONS;
            const style = ROLE_STYLES[m.role] ?? ROLE_STYLES.viewer!;
            return (
              <div
                className={`flex items-center gap-3.5 px-5 py-3.5 ${i < active.length - 1 ? "border-b border-base-300" : ""}`}
                key={m.id}
              >
                {m.userImage ? (
                  // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
                  <img
                    alt={display}
                    className="size-9 shrink-0 rounded-full object-cover ring-1 ring-base-300"
                    src={m.userImage}
                  />
                ) : (
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-1 ring-base-300 ${getAvatarColor(display)}`}
                  >
                    {(() => {
                      const w = display.split(/[\s._@-]+/).filter(Boolean);
                      return (
                        w.length >= 2
                          ? w[0][0]! + w[w.length - 1][0]!
                          : display.slice(0, 2)
                      ).toUpperCase();
                    })()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-base-content truncate">
                      {display}
                    </p>
                    {isMe && (
                      <span className="shrink-0 rounded-xs bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/70">
                        you
                      </span>
                    )}
                  </div>
                  {m.userName && m.userEmail && (
                    <p className="text-xs text-base-content/70 truncate">
                      {m.userEmail}
                    </p>
                  )}
                </div>
                {/* Role control */}
                {canManageRole ? (
                  <RoleSelect
                    disabled={busy === m.userId}
                    onChange={(v) => changeRole(m.userId!, v as Role)}
                    options={rowRoleOptions}
                    value={m.role}
                  />
                ) : (
                  <Badge
                    className={`shrink-0 flex items-center gap-1.5 ${style.badge}`}
                    variant="secondary"
                  >
                    <span className={`size-1.5 rounded-full ${style.dot}`} />
                    {ROLE_LABELS[m.role] ?? m.role}
                    {isOwnerRow && (
                      <span className="text-2xs font-normal text-base-content/70">
                        (owner)
                      </span>
                    )}
                  </Badge>
                )}
                {/* Transfer ownership — owner only, to anyone else active */}
                {isOwner && !isOwnerRow && m.userId && (
                  <Button
                    className="flex size-7 shrink-0 items-center justify-center p-0 bg-transparent text-base-content/70 hover:bg-base-200 hover:text-base-content shadow-none border-0"
                    disabled={transferBusy}
                    onClick={() =>
                      setPendingTransfer({ userId: m.userId!, name: display })
                    }
                    onMouseEnter={(e) =>
                      showTooltip("Transfer ownership to this person", e)
                    }
                    onMouseLeave={hideTooltip}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowLeftRight size={14} />
                  </Button>
                )}
                {/* Remove button */}
                {canManageRole && m.userId && (
                  <Button
                    className="flex size-7 shrink-0 items-center justify-center p-0 text-base-content/70 hover:bg-error/10 hover:text-error shadow-none border-0"
                    disabled={busy === m.userId}
                    onClick={() =>
                      setPendingRemove({ userId: m.userId!, name: display })
                    }
                    onMouseEnter={(e) => showTooltip("Remove", e)}
                    onMouseLeave={hideTooltip}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            );
          })}
          {active.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-base-content/70">
              No active members yet.
            </div>
          )}
        </div>
      </div>

      {/* ── Pending invitations ── */}
      {invited.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold tracking-wide text-base-content/70">
              Pending invitations
            </p>
            <span className="rounded-xs bg-base-200 px-2 py-0.5 text-xs font-bold text-base-content/70">
              {invited.length}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
            {invited.map((m, i) => {
              const addr = m.invitedEmail ?? m.userEmail ?? "—";
              return (
                <div
                  className={`flex items-center gap-3.5 px-5 py-3.5 ${i < invited.length - 1 ? "border-b border-base-300" : ""}`}
                  key={m.id}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-dashed border-base-300 text-xs font-bold text-base-content/70">
                    {addr.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-base-content">
                      {addr}
                    </p>
                    <p className="text-xs text-base-content/70">
                      Invited {ago(m.createdAt)}
                    </p>
                  </div>
                  <Badge className="shrink-0" variant="secondary">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Badge>
                  {isAdmin && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        disabled={busy === `resend-${m.id}`}
                        onClick={() => resend(m.id, addr)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {busy === `resend-${m.id}` ? "…" : "Resend"}
                      </Button>
                      <Button
                        className="flex size-7 items-center justify-center p-0 text-base-content/70 hover:bg-error/10 hover:text-error shadow-none border-0"
                        disabled={busy === m.id}
                        onClick={() =>
                          setPendingCancelInvite({ id: m.id, email: addr })
                        }
                        onMouseEnter={(e) =>
                          showTooltip("Cancel invitation", e)
                        }
                        onMouseLeave={hideTooltip}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Remove"
        description="They will lose access to this workspace immediately. This also resets the shareable invite link, so anyone else who has it will need a new one."
        onConfirm={() => {
          if (pendingRemove) {
            remove(pendingRemove.userId);
            setPendingRemove(null);
          }
        }}
        onOpenChange={(o) => !o && setPendingRemove(null)}
        open={!!pendingRemove}
        title={`Remove ${pendingRemove?.name}?`}
      />

      <ConfirmDialog
        cancelLabel="Keep invite"
        confirmLabel="Cancel invite"
        description={`The invitation to ${pendingCancelInvite?.email} will be revoked.`}
        onConfirm={() => {
          if (pendingCancelInvite) {
            cancelInvite(pendingCancelInvite.id);
            setPendingCancelInvite(null);
          }
        }}
        onOpenChange={(o) => !o && setPendingCancelInvite(null)}
        open={!!pendingCancelInvite}
        title="Cancel this invitation?"
      />

      <ConfirmDialog
        confirmLabel="Send confirmation email"
        confirmLoadingLabel="Sending…"
        description="You'll stay an admin, but they'll become the sole workspace owner — only they will be able to grant or revoke the Admin role after this. We'll email you a confirmation link before it takes effect."
        loading={transferBusy}
        onConfirm={() => {
          if (pendingTransfer) {
            transferOwnership(pendingTransfer.userId, pendingTransfer.name);
          }
        }}
        onOpenChange={(o) => !o && setPendingTransfer(null)}
        open={!!pendingTransfer}
        title={`Transfer ownership to ${pendingTransfer?.name}?`}
      />

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}
