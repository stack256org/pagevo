"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  BookOpen,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  Lock,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { NewPageButton } from "@/components/workspace/new-page-button";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { usePersistedToggle } from "@/hooks/use-persisted-toggle";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { findRootFallback } from "@/lib/pages/root-sibling";

const VISIBLE_MAX = 3;

type PageItem = {
  id: string;
  shortId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  orderIndex: number;
  kind: string;
  isPrivate: boolean;
  isDraft: boolean;
};

type Props = {
  pages: PageItem[];
  // Private database entries (kind "entry") — fetched and updated separately
  // from `pages`, since entries never live in the general page tree / are
  // never favorited/recently-visited the same way; this section is the one
  // place they surface. See sidebar.tsx.
  entries: PageItem[];
  workspaceId: string;
  workspaceSlug: string;
  favoritePageIds: Set<string>;
  onToggleFavorite: (pageId: string, isFav: boolean) => void;
  onPagesChange: (pages: PageItem[]) => void;
  onEntriesChange: (entries: PageItem[]) => void;
};

// Mirrors recently-visited-section.tsx's shell and page-tree.tsx's PageTreeNode row actions — reuses existing options, not a new menu.
export function PrivateSection({
  pages,
  entries,
  workspaceId,
  workspaceSlug,
  favoritePageIds,
  onToggleFavorite,
  onPagesChange,
  onEntriesChange,
}: Props) {
  const [expanded, setExpanded] = usePersistedToggle(
    "pagevo:sidebar-private-expanded",
    true
  );
  // See favorites-section.tsx for why this key-on-hydrate trick is needed — Disclosure
  // only reads defaultOpen once at mount, usePersistedToggle resolves its real value slightly later.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const [popupOpen, setPopupOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!popupOpen) {
      return;
    }
    function handleClick(e: MouseEvent) {
      if (moreRef.current?.contains(e.target as Node)) {
        return;
      }
      if (popupRef.current?.contains(e.target as Node)) {
        return;
      }
      setPopupOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popupOpen]);

  useScrollLockWhileOpen(
    popupOpen,
    (target) =>
      !!popupRef.current?.contains(target) ||
      !!moreRef.current?.contains(target)
  );

  // Real pages first, then private entries appended — matches the order
  // they'd naturally accumulate in (pages are usually created/marked private
  // before someone starts privately using a database row).
  const privatePages = [...pages.filter((p) => p.isPrivate), ...entries];
  if (privatePages.length === 0) {
    return null;
  }

  const visible = privatePages.slice(0, VISIBLE_MAX);
  const hasMore = privatePages.length > VISIBLE_MAX;

  function openPopup() {
    if (moreRef.current) {
      const r = moreRef.current.getBoundingClientRect();
      const POPUP_MAX_H = 360;
      const POPUP_W = 288;
      const top = Math.max(
        8,
        Math.min(r.top, window.innerHeight - POPUP_MAX_H - 8)
      );
      let left = r.right + 8;
      if (left + POPUP_W > window.innerWidth - 8) {
        left = Math.max(8, r.left - 8 - POPUP_W);
      }
      setPopupPos({ top, left });
    }
    setPopupOpen((v) => !v);
  }

  return (
    <div className="px-2">
      <Disclosure defaultOpen={expanded} key={hydrated ? "loaded" : "loading"}>
        <div className="group/header mb-0.5 flex w-full items-center justify-between rounded-md pr-1 transition-colors duration-150 hover:bg-base-300">
          <DisclosureButton
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-base-content/80 transition-colors duration-150 group-hover/header:text-primary"
            onClick={() => setExpanded((v) => !v)}
          >
            <Lock
              className="shrink-0 text-base-content/70 group-hover/header:text-primary"
              size={15}
            />
            <span className="truncate text-left">Private</span>
            <ChevronDown
              className={`shrink-0 text-base-content/70 transition-transform duration-150 group-hover/header:text-primary ${expanded ? "" : "-rotate-90"}`}
              size={14}
            />
          </DisclosureButton>
          <NewPageButton
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-base-content/80 opacity-0 transition-colors duration-150 group-hover/header:opacity-100 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
            isPrivate
            onBeforeCreate={() => setExpanded(true)}
            title="Add a page"
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          >
            <Plus size={14} />
          </NewPageButton>
        </div>

        {/* Grid-rows trick animates height without measuring it in JS — see
       favorites-section.tsx for the full rationale. `static` keeps the
       panel always rendered so our own CSS, not Headless UI's, controls
       visibility. */}
        <DisclosurePanel
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          static
        >
          <div className="overflow-hidden">
            {visible.map((page) => (
              <PrivateRow
                isFav={favoritePageIds.has(page.id)}
                key={page.id}
                onPagesChange={onPagesChange}
                // Entries live in a separate list from `pages` (see the Props
                // comment above) — route their removal there instead of trying to
                // filter them out of `pages`, which never contained them.
                onRemove={
                  page.kind === "entry"
                    ? (id) =>
                        onEntriesChange(entries.filter((e) => e.id !== id))
                    : undefined
                }
                onToggleFavorite={onToggleFavorite}
                page={page}
                pages={pages}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
              />
            ))}
            {hasMore && (
              <button
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
                onClick={openPopup}
                ref={moreRef}
                type="button"
              >
                <MoreHorizontal size={12} />
                {privatePages.length - VISIBLE_MAX} more
              </button>
            )}
          </div>
        </DisclosurePanel>
      </Disclosure>

      {/* Popup flyout — portaled to document.body, making it a *sibling* of the
       sidebar's own wrapper (md:z-550 in workspace-shell.tsx), not a
       descendant of it. z-560 keeps it above that wrapper; anything lower
       renders half-hidden behind the sidebar wherever the two overlap. */}
      {popupOpen &&
        popupPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-560 w-72 overflow-hidden rounded-xl border border-primary/20 bg-neutral"
            ref={popupRef}
            style={{ top: popupPos.top, left: popupPos.left }}
          >
            {/* Header */}
            <div className="flex items-center justify-between bg-primary px-3 py-3">
              <span className="text-sm font-semibold text-white">Private</span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                {privatePages.length}
              </span>
            </div>
            {/* List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {privatePages.map((page) => (
                <Link
                  className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                  href={`/app/${workspaceSlug}/${page.shortId}`}
                  key={page.id}
                  onClick={() => setPopupOpen(false)}
                >
                  {page.icon ? (
                    <PageIcon icon={page.icon} size={13} />
                  ) : (
                    <FileText
                      className="shrink-0 text-base-content/70"
                      size={13}
                    />
                  )}
                  <span className="min-w-0 truncate">
                    {page.title || "Untitled"}
                  </span>
                </Link>
              ))}
            </div>
            {/* Footer */}
            <div className="mx-1 h-px bg-base-300" />
            <div className="px-3 py-2">
              <Link
                className="flex items-center gap-2 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:text-base-content"
                href={`/app/${workspaceSlug}/library?tab=private`}
                onClick={() => setPopupOpen(false)}
              >
                <BookOpen size={13} />
                Browse in Library
              </Link>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
// Same hover "+"/"···" actions as page-tree.tsx's PageTreeNode, just without
// the drag-to-reorder/nesting UI — Private renders as a flat list.
function PrivateRow({
  page,
  pages,
  workspaceId,
  workspaceSlug,
  isFav,
  onToggleFavorite,
  onPagesChange,
  onRemove,
}: {
  page: PageItem;
  pages: PageItem[];
  workspaceId: string;
  workspaceSlug: string;
  isFav: boolean;
  onToggleFavorite: (pageId: string, isFav: boolean) => void;
  onPagesChange: (pages: PageItem[]) => void;
  /** Set for entry rows — removes from the separate private-entries list
   *  instead of `pages` (which never contains entries) on delete. */
  onRemove?: (id: string) => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onOutside(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onScroll() {
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [menuOpen]);

  function handleDelete() {
    setMenuOpen(false);
    setConfirmTrash(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
    setDeleting(false);
    setConfirmTrash(false);
    if (onRemove) {
      onRemove(page.id);
    } else {
      onPagesChange(pages.filter((p) => p.id !== page.id));
    }
    // Trashing a page removes its favorite row server-side (see DELETE
    // /api/pages/[id]) — tell the sidebar to drop it from Favorites too,
    // instead of leaving a stale entry until the next unrelated refetch.
    window.dispatchEvent(new CustomEvent("pagevo:favorites-changed"));

    const onDeletedPage =
      typeof window !== "undefined" &&
      window.location.pathname.includes(page.shortId);
    if (onDeletedPage || page.kind === "database") {
      const parentShortId = pages.find((p) => p.id === page.parentId)?.shortId;
      // No parent → nearest other top-level item (sidebar order), or workspace
      // home if this was the only one.
      const fallbackShortId =
        parentShortId ?? findRootFallback(pages, page.id)?.shortId ?? null;
      window.location.replace(
        fallbackShortId
          ? `/app/${workspaceSlug}/${fallbackShortId}`
          : `/app/${workspaceSlug}`
      );
    } else {
      // Sync other routes (e.g. Home's page count / "Jump back in") with the deletion.
      router.refresh();
    }
  }

  async function handleDuplicate() {
    setMenuOpen(false);
    const res = await fetch(`/api/pages/${page.id}/duplicate`, {
      method: "POST",
    });
    if (res.ok) {
      const dup = await res.json();
      const refetch = await fetch(`/api/workspaces/${workspaceId}/pages/tree`);
      if (refetch.ok) {
        onPagesChange(await refetch.json());
      }
      router.push(`/app/${workspaceSlug}/${dup.shortId}`);
    }
  }

  async function handleCopyLink() {
    setMenuOpen(false);
    await navigator.clipboard.writeText(
      `${window.location.origin}/app/${workspaceSlug}/${page.shortId}`
    );
  }

  const menuItem =
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs text-base-content/80 transition-colors duration-150 hover:bg-base-200 hover:text-base-content cursor-pointer";

  return (
    <div className="group relative flex items-center gap-0.5 rounded-sm py-0.5 transition-colors hover:bg-base-300">
      <Link
        className="flex min-w-0 flex-1 items-center gap-1.5 truncate py-0.5 pl-2.5 text-xs text-base-content/80 hover:text-primary"
        href={`/app/${workspaceSlug}/${page.shortId}`}
      >
        {page.icon ? (
          <PageIcon icon={page.icon} size={13} />
        ) : (
          <FileText className="shrink-0 text-base-content/70" size={12} />
        )}
        <span className="min-w-0 truncate">{page.title || "Untitled"}</span>
      </Link>

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
        <NewPageButton
          className="flex size-5 items-center justify-center rounded-sm text-base-content/80 hover:bg-primary/10 hover:text-primary"
          isPrivate
          parentId={page.id}
          title="Add a page inside"
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        >
          <Plus size={12} />
        </NewPageButton>
        <button
          className="flex size-5 items-center justify-center rounded-sm text-base-content/80 hover:bg-primary/10 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            const rect = btnRef.current?.getBoundingClientRect();
            if (rect) {
              const MENU_W = 180;
              const MENU_H = 240;
              let x = rect.right + 4;
              if (x + MENU_W > window.innerWidth - 8) {
                x = rect.left - 4 - MENU_W;
              }
              x = Math.max(8, x);
              const y = Math.max(
                8,
                Math.min(rect.top, window.innerHeight - 8 - MENU_H)
              );
              setMenuPos({ x, y });
            }
            setMenuOpen((v) => !v);
          }}
          onMouseEnter={(e) => showTooltip("Options", e)}
          onMouseLeave={hideTooltip}
          ref={btnRef}
          type="button"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Context menu — fixed so it escapes the sidebar's overflow clip */}
      {menuOpen && (
        <div
          className="fixed z-200 min-w-42 overflow-hidden rounded-md border border-base-300 bg-neutral"
          ref={menuRef}
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <div className="h-0.75 bg-primary" />
          <div className="py-1">
            <button
              className={menuItem}
              onClick={() => {
                setMenuOpen(false);
                onToggleFavorite(page.id, isFav);
              }}
              type="button"
            >
              <Star className={isFav ? "text-warning" : undefined} size={14} />
              {isFav ? "Remove from Favorites" : "Add to Favorites"}
            </button>
            <div className="my-1 border-t border-base-300" />
            <Link
              className={menuItem}
              href={`/app/${workspaceSlug}/${page.shortId}`}
              onClick={() => setMenuOpen(false)}
            >
              <ExternalLink size={14} />
              Open
            </Link>
            <NewPageButton
              className={menuItem}
              isPrivate
              onBeforeCreate={() => setMenuOpen(false)}
              parentId={page.id}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            >
              <Plus size={14} />
              Add subpage
            </NewPageButton>
            <button
              className={menuItem}
              onClick={handleDuplicate}
              type="button"
            >
              <Copy size={14} />
              Duplicate
            </button>
            <button className={menuItem} onClick={handleCopyLink} type="button">
              <Link2 size={14} />
              Copy link
            </button>
            <div className="my-1 border-t border-base-300" />
            <button
              className={`${menuItem} text-error! hover:bg-error/5!`}
              onClick={handleDelete}
              type="button"
            >
              <Trash2 size={14} />
              Move to Trash
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Move to Trash"
        confirmLoadingLabel="Moving…"
        description={
          <>
            <span className="font-medium text-base-content">
              &ldquo;{page.title || "Untitled"}&rdquo;
            </span>{" "}
            will be moved to Trash and permanently deleted after 30 days.
          </>
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onOpenChange={setConfirmTrash}
        open={confirmTrash}
        title="Move to Trash?"
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
