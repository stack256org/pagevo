"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/* ── helpers ── */
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/* ── Impersonate button ── */
export function ImpersonateButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doImpersonate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orbit/users/${userId}/impersonate`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? "Failed to impersonate"
        );
      }
      router.push("/platform/post-auth");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:opacity-50"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <svg
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 14 14"
        >
          <circle cx="7" cy="5" r="2.5" />
          <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          <path d="M11 2l2 2-2 2" />
        </svg>
        {loading ? "Starting…" : "Impersonate"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      <ConfirmDialog
        confirmLabel="Impersonate"
        description="You will be signed in as this user for up to 2 hours."
        onConfirm={doImpersonate}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Start impersonation session?"
      />
    </div>
  );
}

/* ── Ban / Unban button ── */
export function BanButton({
  userId,
  banned,
  onDone,
}: {
  userId: string;
  banned: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function doToggle() {
    const action = banned ? "unban" : "ban";
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orbit/users/${userId}/${action}`, {
        method: "POST",
        ...(action === "ban" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          (j as { error?: string }).error ?? `Failed to ${action}`
        );
      }
      setReason("");
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50",
          banned
            ? "bg-base-200/40 text-base-content border border-base-300 hover:bg-base-200"
            : "bg-error/5 text-error border border-error/20 hover:bg-error/10"
        )}
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        {banned ? "Unban user" : "Ban user"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      {banned ? (
        <ConfirmDialog
          confirmLabel="Unban"
          description="The user will regain access to the platform."
          onConfirm={doToggle}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title="Unban this user?"
        />
      ) : (
        <AlertDialog
          onOpenChange={(o) => {
            setConfirmOpen(o);
            if (!o) {
              setReason("");
            }
          }}
          open={confirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ban this user?</AlertDialogTitle>
              <AlertDialogDescription>
                The user will be blocked from signing in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <textarea
              className="mt-1 w-full resize-none rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional, visible in the audit log)…"
              rows={2}
              value={reason}
            />
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={loading} onClick={doToggle}>
                Ban
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/* ── Revoke all sessions ── */
export function RevokeSessionsButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doRevoke() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orbit/users/${userId}/revoke-sessions`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to revoke");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning transition-colors duration-150 hover:bg-warning/20 disabled:opacity-50"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <svg
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 14 14"
        >
          <path d="M7 2v3l2 2" />
          <circle cx="7" cy="7" r="5" />
          <path d="M1 1l12 12" />
        </svg>
        {loading ? "Revoking…" : "Revoke all sessions"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      <ConfirmDialog
        confirmLabel="Revoke all"
        description="All active sessions for this user will be terminated and they will be signed out immediately."
        onConfirm={doRevoke}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Revoke all sessions?"
      />
    </div>
  );
}

/* ── Force delete workspace ── */
export function ForceDeleteWorkspaceButton({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");

  async function doDelete() {
    setConfirmOpen(false);
    setConfirmInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orbit/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Failed to delete");
      }
      router.push("/orbit-admin/orbit/workspaces");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        className="flex items-center gap-1.5 rounded-md bg-error px-3 py-1.5 text-xs font-semibold text-error-content transition-colors duration-150 hover:bg-error/90 disabled:opacity-50"
        disabled={loading}
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <svg
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          viewBox="0 0 14 14"
        >
          <path d="M2 3.5h10M5.5 3.5V2.5h3v1M4.5 3.5l.5 8M9.5 3.5l-.5 8M7 3.5v8" />
        </svg>
        {loading ? "Deleting…" : "Force delete workspace"}
      </button>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      <AlertDialog
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) {
            setConfirmInput("");
          }
        }}
        open={confirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force delete this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong className="text-base-content">{workspaceName}</strong> and
              all its pages, members, and data. This cannot be undone.
              <br />
              <br />
              Type the workspace name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            className="mt-1 w-full rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={workspaceName}
            type="text"
            value={confirmInput}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={confirmInput !== workspaceName}
              onClick={doDelete}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
