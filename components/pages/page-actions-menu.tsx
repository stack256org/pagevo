"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  Copy as CopyIcon,
  ClipboardCopy as CopySimpleIcon,
  MoreHorizontal as DotsThreeIcon,
  Download as DownloadSimpleIcon,
  Eye as EyeIcon,
  EyeOff as EyeOffIcon,
  Lock as LockKeyIcon,
  Unlock as LockKeyOpenIcon,
  LayoutGrid as SquaresFourIcon,
  Trash2 as TrashIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePagePrivacy } from "@/components/pages/page-privacy-context";
import { SaveAsTemplateModal } from "@/components/templates/save-as-template-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface PageActionsMenuProps {
  /** Renders the trigger as a bare "⋮" icon button with no "More" text label —
   *  for dense list/table rows (e.g. Library) where a labeled button is too
   *  wide and out of place next to other icon-only row affordances. */
  iconOnly?: boolean;
  isDeleted: boolean;
  isLocked: boolean;
  /** Overrides the default "navigate away" behavior after a successful
   *  delete — pass this when the menu is used from a list/table row (e.g.
   *  Library) rather than on the page currently being viewed, so deleting a
   *  row doesn't yank the user out of the list they were managing. */
  onDeleted?: () => void;
  /** Same idea for duplicate — default behavior jumps to the new page, which
   *  only makes sense when the menu lives on the page being viewed. */
  onDuplicated?: (newShortId: string) => void;
  pageId: string;
  pageKind?: string;
  pageShortId: string;
  pageTitle?: string;
  parentShortId?: string | null;
  /** Nearest other top-level item (previous, or next if this was first) —
   *  used as the fallback destination when this page has no parent. Ignored
   *  when `parentShortId` is set. */
  rootFallbackShortId?: string | null;
  workspaceId: string;
  workspaceSlug: string;
}

const menuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-base-content transition-colors data-focus:bg-base-200 cursor-pointer";

export function PageActionsMenu({
  pageId,
  isLocked,
  isDeleted,
  workspaceSlug,
  workspaceId,
  pageShortId,
  pageTitle,
  pageKind,
  parentShortId,
  rootFallbackShortId,
  onDeleted,
  onDuplicated,
  iconOnly,
}: PageActionsMenuProps) {
  const router = useRouter();
  const { isPrivate, setIsPrivate } = usePagePrivacy();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  async function run(action: string, fn: () => Promise<void>) {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  }

  function handleDelete() {
    setConfirmTrash(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    let res: Response | null = null;
    try {
      res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
    } catch {
      // network error — treat as failed but still redirect for databases
    }

    // Same destination rule for soft-delete or permanent delete: parent, else
    // nearest top-level sibling, else workspace home.
    const fallbackShortId = parentShortId ?? rootFallbackShortId ?? null;

    // Databases must navigate away — refreshing the current (now-deleted) URL 404s.
    // Skipped when onDeleted is provided (list context, no "current page" to leave).
    if (pageKind === "database" && !onDeleted) {
      window.location.replace(
        fallbackShortId
          ? `/app/${workspaceSlug}/${fallbackShortId}`
          : `/app/${workspaceSlug}`
      );
      return;
    }

    setDeleting(false);
    setConfirmTrash(false);

    if (res?.ok) {
      if (onDeleted) {
        onDeleted();
        return;
      }
      window.location.replace(
        fallbackShortId
          ? `/app/${workspaceSlug}/${fallbackShortId}`
          : `/app/${workspaceSlug}`
      );
    } else {
      router.refresh();
    }
  }

  async function handleRestore() {
    await run("restore", async () => {
      const res = await fetch(`/api/pages/${pageId}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      }
    });
  }

  async function handleDuplicate() {
    await run("duplicate", async () => {
      const res = await fetch(`/api/pages/${pageId}/duplicate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { shortId: string };
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        if (onDuplicated) {
          onDuplicated(data.shortId);
        } else {
          router.push(`/app/${workspaceSlug}/${data.shortId}`);
        }
      }
    });
  }

  async function handleLock() {
    await run("lock", async () => {
      await fetch(`/api/pages/${pageId}/lock`, { method: "POST" });
      router.refresh();
    });
  }

  async function handleTogglePrivate() {
    await run("toggle-private", async () => {
      const next = !isPrivate;
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: next }),
      });
      setIsPrivate(next);
      // router.refresh() alone won't move the page in the sidebar's Private section
      // (its tree is useState seeded from props); dispatch to avoid a ~5s SSE lag.
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    });
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/app/${workspaceSlug}/${pageShortId}`;
    await navigator.clipboard.writeText(url).catch(() => {});
  }

  async function handleExport(format: "markdown" | "html") {
    await run(`export-${format}`, async () => {
      const res = await fetch(`/api/pages/${pageId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      if (!res.ok) {
        toast.error(`Couldn't export as ${format} — please try again.`);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `page.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <>
      <Menu>
        <MenuButton
          aria-label="Page actions"
          className={
            iconOnly
              ? "flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-all hover:bg-base-200 hover:text-base-content active:scale-[0.97] disabled:opacity-50 data-open:bg-base-200 data-open:text-base-content"
              : "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium text-base-content/70 transition-all hover:bg-base-200 hover:text-base-content active:scale-[0.97] disabled:opacity-50 data-open:bg-base-200 data-open:text-base-content"
          }
          disabled={loading !== null}
          type="button"
        >
          <DotsThreeIcon size={14} />
          {!iconOnly && "More"}
        </MenuButton>

        <MenuItems
          anchor={{ to: "bottom end", gap: 4 }}
          className="z-600 w-52 overflow-hidden rounded-md border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
          transition
        >
          {!isDeleted && (
            <>
              <MenuItem>
                <button
                  className={menuItemClass}
                  onClick={handleDuplicate}
                  type="button"
                >
                  <CopySimpleIcon size={14} />
                  Duplicate
                </button>
              </MenuItem>

              <MenuItem>
                <button
                  className={menuItemClass}
                  onClick={handleLock}
                  type="button"
                >
                  {isLocked ? (
                    <LockKeyOpenIcon size={14} />
                  ) : (
                    <LockKeyIcon size={14} />
                  )}
                  {isLocked ? "Unlock page" : "Lock page"}
                </button>
              </MenuItem>

              <MenuItem>
                <button
                  className={menuItemClass}
                  onClick={handleCopyLink}
                  type="button"
                >
                  <CopyIcon size={14} />
                  Copy link
                </button>
              </MenuItem>

              <MenuItem>
                <button
                  className={menuItemClass}
                  onClick={handleTogglePrivate}
                  type="button"
                >
                  {isPrivate ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
                  {isPrivate ? "Make shared" : "Make private"}
                </button>
              </MenuItem>

              {pageKind !== "database" && (
                <MenuItem>
                  <button
                    className={menuItemClass}
                    onClick={() => setSaveAsTemplate(true)}
                    type="button"
                  >
                    <SquaresFourIcon size={14} />
                    Save as Template
                  </button>
                </MenuItem>
              )}

              <div className="mx-2 my-1 border-t border-base-300" />

              <div className="px-3 pb-0.5 pt-1">
                <p className="mb-1 text-xs font-semibold tracking-wide text-base-content/70">
                  Export
                </p>
              </div>
              {(["markdown", "html"] as const).map((fmt) => (
                <MenuItem key={fmt}>
                  <button
                    className={menuItemClass}
                    onClick={() => handleExport(fmt)}
                    type="button"
                  >
                    <DownloadSimpleIcon size={14} />
                    {fmt === "markdown" ? "Markdown" : fmt.toUpperCase()}
                  </button>
                </MenuItem>
              ))}

              <div className="mx-2 my-1 border-t border-base-300" />

              <MenuItem>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-error transition-colors data-focus:bg-error/5"
                  onClick={handleDelete}
                  type="button"
                >
                  <TrashIcon size={14} />
                  Move to Trash
                </button>
              </MenuItem>
            </>
          )}

          {isDeleted && (
            <MenuItem>
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-success transition-colors data-focus:bg-success/10"
                onClick={handleRestore}
                type="button"
              >
                <TrashIcon size={14} />
                Restore from Trash
              </button>
            </MenuItem>
          )}
        </MenuItems>
      </Menu>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        confirmLabel="Move to Trash"
        confirmLoadingLabel="Moving…"
        description={
          pageKind === "database"
            ? "This database and all its entries will be moved to Trash and permanently deleted after 30 days."
            : "This page will be moved to Trash and permanently deleted after 30 days."
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onOpenChange={setConfirmTrash}
        open={confirmTrash}
        title="Move to Trash?"
      />

      {saveAsTemplate && typeof document !== "undefined" && (
        <SaveAsTemplateModal
          onClose={() => setSaveAsTemplate(false)}
          pageId={pageId}
          pageTitle={pageTitle ?? ""}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}
