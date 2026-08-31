"use client";

import { AlertTriangle, ExternalLink, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconPicker } from "@/components/pages/icon-picker";
import { PageIcon } from "@/components/pages/page-icon";
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
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { RoleSelect } from "@/components/ui/role-select";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";

/* ── Icon picker — same Notion-style picker used for page/database icons
   (search, emoji categories, lucide icons, image upload) instead of a
   separate, more limited emoji-only grid just for the workspace icon. ── */
function WorkspaceIconPicker({
  value,
  workspaceId,
  onChange,
}: {
  value: string;
  workspaceId: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  useEffect(() => {
    setMounted(true);
  }, []);

  // The panel is a `position: fixed` portal anchored to a rect snapshotted
  // once on open — lock page scroll while it's open instead of
  // repositioning, matching the pattern used by the app's other click-opened
  // popovers anchored via a one-time getBoundingClientRect() snapshot.
  useScrollLockWhileOpen(
    open,
    (target) => !!panelRef.current?.contains(target)
  );

  function handleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // Anchor via `left` and clamp to viewport: a `right`-anchored wrapper collapses to zero width here, pushing the panel off-screen.
      const PANEL_WIDTH = 352;
      const PANEL_HEIGHT = 400;
      const left = Math.max(
        8,
        Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8)
      );
      const top = Math.max(
        8,
        Math.min(rect.bottom + 8, window.innerHeight - PANEL_HEIGHT)
      );
      setPos({ top, left });
    }
    setOpen((o) => !o);
  }

  const panel =
    mounted && open && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
            }}
          >
            <div className="relative">
              <IconPicker
                onClose={() => setOpen(false)}
                onIconPreview={(v) => onChange(v)}
                onRemove={
                  value
                    ? () => {
                        onChange("");
                        setOpen(false);
                      }
                    : undefined
                }
                onSelect={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
                triggerRef={btnRef}
                uploadKind="workspace_icon"
                workspaceId={workspaceId}
              />
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        className="flex size-12 items-center justify-center rounded-md border-2 border-dashed border-base-300 bg-base-200/30 transition-colors duration-150 hover:border-base-300 hover:bg-base-200 active:scale-[0.97]"
        onClick={handleOpen}
        onMouseEnter={(e) => showTooltip("Change icon", e)}
        onMouseLeave={hideTooltip}
        ref={btnRef}
        type="button"
      >
        {value ? (
          <PageIcon icon={value} size={28} />
        ) : (
          <span className="text-3xl leading-none">📁</span>
        )}
      </button>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
      {panel}
    </>
  );
}

/* ── Types ────────────────────────────────────────────────── */
interface WorkspaceData {
  defaultPageAccess: string | null;
  icon: string | null;
  id: string;
  inviteLinkActive: boolean | null;
  inviteLinkRole: string | null;
  inviteLinkToken: string | null;
  name: string;
  slug: string;
}
interface Props {
  workspace: WorkspaceData;
}

const ACCESS = [
  { value: "full_access", label: "Full access" },
  { value: "can_edit", label: "Can edit" },
  { value: "can_comment", label: "Can comment" },
  { value: "can_view", label: "View only" },
  { value: "private", label: "Private" },
];

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
      {label}
    </p>
  );
}
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-base-300 bg-base-100 ${className}`}
    >
      {children}
    </div>
  );
}
function CardRow({
  label,
  desc,
  control,
  last,
  feedback,
}: {
  label: string;
  desc?: string;
  control: React.ReactNode;
  last?: boolean;
  feedback?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 px-5 py-4 ${last ? "" : "border-b border-base-300"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-base-content">{label}</p>
        {desc && <p className="mt-0.5 text-xs text-base-content/70">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {feedback}
        {control}
      </div>
    </div>
  );
}
/* ── Main component ───────────────────────────────────────── */
export function WorkspaceGeneralSection({ workspace }: Props) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [icon, setIcon] = useState(workspace.icon ?? "");
  const [access, setAccess] = useState(workspace.defaultPageAccess ?? "shared");
  const [inviteActive, setInviteActive] = useState(
    workspace.inviteLinkActive ?? false
  );
  const [inviteToken, setInviteToken] = useState(
    workspace.inviteLinkToken ?? ""
  );
  const [inviteRole, setInviteRole] = useState(
    workspace.inviteLinkRole ?? "editor"
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [patchError, setPatchError] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [nameError, setNameError] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Gate window.location.origin behind `mounted` — reading it unconditionally causes a hydration mismatch (absent on server).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const nameRef = useRef(name);
  nameRef.current = name;

  function toSlug(v: string) {
    return (
      v
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || workspace.slug
    );
  }

  async function saveName() {
    const trimmed = nameRef.current.trim();
    if (!trimmed || trimmed === workspace.name) {
      return;
    }
    const newSlug = toSlug(trimmed);
    setSaving("name");
    setSaved(null);
    setNameError("");
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, slug: newSlug }),
      });
      if (res.ok) {
        setSaved("name");
        setTimeout(() => setSaved(null), 2500);
        window.dispatchEvent(
          new CustomEvent("pagevo:workspace-name-changed", {
            detail: { workspaceId: workspace.id, name: trimmed },
          })
        );
        if (newSlug !== workspace.slug) {
          router.replace(`/app/${newSlug}/settings/general`);
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setNameError(d.error ?? "Failed to save");
      }
    } catch {
      setNameError("Network error");
    } finally {
      setSaving(null);
    }
  }

  async function patchWs(
    patch: Record<string, unknown>,
    rollback?: () => void,
    onSuccess?: () => void
  ) {
    const field = Object.keys(patch)[0]!;
    setSaving(field);
    setSaved(null);
    setPatchError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setSaved(field);
        setTimeout(() => setSaved(null), 2500);
        onSuccess?.();
      } else {
        rollback?.();
        const d = await res.json().catch(() => ({}));
        setPatchError({ field, message: d.error ?? "Failed to save" });
      }
    } catch {
      rollback?.();
      setPatchError({ field, message: "Network error — change wasn't saved" });
    } finally {
      setSaving(null);
    }
  }

  async function generateLink() {
    setSaving("inviteLink");
    setPatchError(null);
    try {
      const r = await fetch(`/api/workspaces/${workspace.id}/invite-link`, {
        method: "POST",
      });
      if (r.ok) {
        const d = await r.json();
        setInviteToken(d.inviteLinkToken ?? "");
        setInviteActive(true);
      } else {
        setPatchError({
          field: "inviteLink",
          message: "Failed to generate a new link",
        });
      }
    } catch {
      setPatchError({
        field: "inviteLink",
        message: "Network error — link wasn't regenerated",
      });
    } finally {
      setSaving(null);
    }
  }

  async function disableLink() {
    setSaving("inviteDisable");
    setPatchError(null);
    try {
      const r = await fetch(`/api/workspaces/${workspace.id}/invite-link`, {
        method: "DELETE",
      });
      if (r.ok) {
        setInviteActive(false);
      } else {
        setPatchError({
          field: "inviteDisable",
          message: "Failed to disable the link",
        });
      }
    } catch {
      setPatchError({
        field: "inviteDisable",
        message: "Network error — link wasn't disabled",
      });
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete() {
    setDeleteError("");
    setDeleting(true);
    try {
      const r = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "DELETE",
      });
      if (r.ok) {
        window.location.href = "/platform/onboarding";
      } else {
        const d = await r.json().catch(() => ({}));
        setDeleteError(d.error ?? "Failed to delete workspace");
      }
    } catch {
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  function changeIcon(v: string) {
    const prev = icon;
    setIcon(v);
    // Notify the sidebar workspace switcher only AFTER the write commits —
    // it self-fetches once on mount and otherwise has no reason to refresh,
    // so without this it kept showing the old icon until a hard reload.
    patchWs(
      { icon: v || null },
      () => setIcon(prev),
      () => {
        window.dispatchEvent(
          new CustomEvent("pagevo:workspace-icon-changed", {
            detail: { workspaceId: workspace.id, icon: v || null },
          })
        );
      }
    );
  }

  const origin = mounted ? window.location.origin : "";
  const inviteUrl = inviteToken ? `${origin}/invite/${inviteToken}` : "";
  const inviteShort = inviteUrl.replace(/^https?:\/\//, "");

  function copy() {
    if (!inviteUrl) {
      return;
    }
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-195 px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6 md:pb-10">
      {/* ── WORKSPACE IDENTITY ── */}
      <div className="mb-7">
        <SectionLabel label="Workspace" />
        <Card>
          {/* Live preview banner */}
          <div className="flex items-center gap-3.5 border-b border-base-300 bg-base-200/20 px-5 py-4">
            <span className="flex size-10 items-center justify-center rounded-sm bg-base-100 text-2xl">
              {icon ? <PageIcon icon={icon} size={22} /> : "📁"}
            </span>
            <div>
              <p className="text-[14.5px] font-semibold text-base-content">
                {name || "Workspace name"}
              </p>
              <p className="text-xs text-base-content/70">Sidebar preview</p>
            </div>
            <div className="ml-auto rounded-xs bg-base-200 px-2.5 py-1 text-xs font-semibold text-base-content/70">
              Preview
            </div>
          </div>

          {/* Icon row — removing happens inside the picker itself (its own
         "Remove" footer button, same as page/database icons), so there's no
         separate, disconnected remove control floating in this row. */}
          <div
            className={
              "flex items-center justify-between gap-6 px-5 py-4 border-b border-base-300"
            }
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-base-content">Icon</p>
              <p className="mt-0.5 text-xs text-base-content/70">
                Click to choose an icon for your workspace.
              </p>
            </div>
            <WorkspaceIconPicker
              onChange={changeIcon}
              value={icon}
              workspaceId={workspace.id}
            />
          </div>

          {/* Name row */}
          <div className="flex items-center justify-between gap-6 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-base-content">Name</p>
              <p className="mt-0.5 text-xs text-base-content/70">
                Shown in the sidebar and all emails.
              </p>
            </div>
            <div className="relative shrink-0">
              <Input
                className="w-55 focus-visible:border-primary"
                onBlur={saveName}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError("");
                }}
                value={name}
              />
              {saved === "name" && (
                <span className="absolute -bottom-5 right-0 text-xs text-base-content/70">
                  Saved ✓
                </span>
              )}
              {nameError && (
                <span className="absolute -bottom-5 right-0 text-xs text-error">
                  {nameError}
                </span>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── DEFAULTS ── */}
      <div className="mb-7">
        <SectionLabel label="Defaults" />
        <Card>
          <CardRow
            control={
              <RoleSelect
                onChange={(v) => {
                  const prev = access;
                  setAccess(v);
                  patchWs({ defaultPageAccess: v }, () => setAccess(prev));
                }}
                options={ACCESS}
                triggerClassName="w-37.5 border-base-300 bg-base-100"
                value={access}
              />
            }
            desc="New pages created in this workspace will inherit this access level."
            feedback={
              saved === "defaultPageAccess" ? (
                <span className="text-xs text-base-content/70">Saved ✓</span>
              ) : patchError?.field === "defaultPageAccess" ? (
                <span className="text-xs text-error">{patchError.message}</span>
              ) : null
            }
            label="Default page access"
          />
        </Card>
      </div>

      {/* ── INVITE LINK ── */}
      <div className="mb-7">
        <SectionLabel label="Invite link" />
        {inviteActive && inviteUrl ? (
          <Card>
            {/* URL bar */}
            <div className="border-b border-base-300 bg-base-200/20 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10">
                  <ExternalLink className="text-primary" size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-base-content">
                    {inviteShort}
                  </p>
                  <p className="text-xs text-base-content/70">
                    Anyone with this link can join your workspace
                  </p>
                </div>
                <Button
                  className={`shrink-0 active:scale-[0.97] ${copied ? "bg-success/10 text-success hover:bg-success/10" : ""}`}
                  onClick={copy}
                  size="sm"
                  type="button"
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </Button>
              </div>
            </div>
            <CardRow
              control={
                <RoleSelect
                  onChange={(v) => {
                    const prev = inviteRole;
                    setInviteRole(v);
                    patchWs({ inviteLinkRole: v }, () => setInviteRole(prev));
                  }}
                  options={[
                    { value: "editor", label: "Member" },
                    { value: "viewer", label: "Viewer" },
                  ]}
                  value={inviteRole}
                />
              }
              desc="New members via this link will be assigned this role."
              feedback={
                saved === "inviteLinkRole" ? (
                  <span className="text-xs text-base-content/70">Saved ✓</span>
                ) : patchError?.field === "inviteLinkRole" ? (
                  <span className="text-xs text-error">
                    {patchError.message}
                  </span>
                ) : null
              }
              label="Invite role"
            />
            <CardRow
              control={
                <div className="flex gap-2">
                  <Button
                    disabled={saving === "inviteLink"}
                    onClick={() => setRegenerateOpen(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {saving === "inviteLink" ? "Regenerating…" : "Regenerate"}
                  </Button>
                  <Button
                    disabled={saving === "inviteDisable"}
                    onClick={disableLink}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Disable
                  </Button>
                </div>
              }
              feedback={
                patchError?.field === "inviteLink" ||
                patchError?.field === "inviteDisable" ? (
                  <span className="text-xs text-error">
                    {patchError.message}
                  </span>
                ) : null
              }
              label="Manage link"
            />
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-4 px-5 py-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-base-200/50">
                <Link2 className="text-base-content/70" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-base-content">
                  No active invite link
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  Generate a shareable link to invite new members.
                </p>
              </div>
              <Button
                className="shrink-0 active:scale-[0.97]"
                disabled={saving === "inviteLink"}
                onClick={generateLink}
                size="sm"
                type="button"
              >
                {saving === "inviteLink" ? "Generating…" : "Generate link"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* ── DANGER ZONE ── */}
      <div>
        <SectionLabel label="Danger zone" />
        <div className="overflow-hidden rounded-lg border border-error/20 bg-error/5">
          <div className="px-5 py-5">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-error/10">
                <AlertTriangle className="text-error" size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-base-content">
                  Delete this workspace
                </p>
                <p className="mt-0.5 text-sm text-base-content/70">
                  Permanently deletes all pages, files, and member data. This
                  cannot be undone.
                </p>
              </div>
            </div>
            <Button
              className="mt-4 active:scale-[0.97]"
              onClick={() => setDeleteOpen(true)}
              size="sm"
              type="button"
              variant="destructive"
            >
              Delete workspace…
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog
        onOpenChange={(o) => {
          if (!deleting) {
            setDeleteOpen(o);
            if (!o) {
              setDeleteName("");
              setDeleteError("");
            }
          }
        }}
        open={deleteOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong className="text-base-content">{workspace.name}</strong>{" "}
              and all its pages, files, and member data. This cannot be undone.
              <br />
              <br />
              Type{" "}
              <strong className="text-base-content">{workspace.name}</strong> to
              confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            className="w-full border-error/40 focus-visible:border-error"
            onChange={(e) => setDeleteName(e.target.value)}
            placeholder={workspace.name}
            value={deleteName}
          />
          {deleteError && <p className="text-xs text-error">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="disabled:cursor-not-allowed disabled:opacity-40"
              disabled={deleting || deleteName !== workspace.name}
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
            >
              {deleting ? "Deleting…" : "Delete workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        confirmLabel="Regenerate"
        confirmLoadingLabel="Regenerating…"
        description="The current link stops working immediately — anyone who has it but hasn't joined yet will no longer be able to use it."
        loading={saving === "inviteLink"}
        onConfirm={generateLink}
        onOpenChange={setRegenerateOpen}
        open={regenerateOpen}
        title="Regenerate the invite link?"
      />
    </div>
  );
}
