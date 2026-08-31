"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface TrashBannerProps {
  pageId: string;
  parentShortId?: string | null;
  /** Nearest other top-level item (previous, or next if this was first) —
   *  used as the fallback destination when this page has no parent. Ignored
   *  when `parentShortId` is set. */
  rootFallbackShortId?: string | null;
  workspaceSlug: string;
}

export function TrashBanner({
  pageId,
  workspaceSlug,
  parentShortId,
  rootFallbackShortId,
}: TrashBannerProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    try {
      await fetch(`/api/pages/${pageId}/restore`, { method: "POST" });
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    } finally {
      setRestoring(false);
    }
  }

  async function handlePermanentDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
      // No parent → nearest other top-level item (sidebar order), or workspace
      // home if this was the only one.
      const fallbackShortId = parentShortId ?? rootFallbackShortId ?? null;
      router.push(
        fallbackShortId
          ? `/app/${workspaceSlug}/${fallbackShortId}`
          : `/app/${workspaceSlug}`
      );
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      {/* Trash banner */}
      <div className="mb-5 flex items-center justify-between gap-3 rounded-md border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
        <div className="flex items-center gap-2.5">
          <Trash2 className="shrink-0" size={16} />
          <span>
            This page is in <strong>Trash</strong>. It will be permanently
            deleted in 30 days.
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="rounded-sm border border-error/40 bg-base-100 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/15 disabled:opacity-50"
            disabled={restoring || deleting}
            onClick={handleRestore}
            type="button"
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
          <button
            className="rounded-sm bg-error px-3 py-1.5 text-xs font-medium text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
            disabled={restoring || deleting}
            onClick={() => setConfirming(true)}
            type="button"
          >
            Delete permanently
          </button>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Delete forever"
        confirmLoadingLabel="Deleting…"
        description="This page and all its content will be removed forever. This cannot be undone."
        loading={deleting}
        onConfirm={handlePermanentDelete}
        onOpenChange={setConfirming}
        open={confirming}
        title="Delete permanently?"
      />
    </>
  );
}
