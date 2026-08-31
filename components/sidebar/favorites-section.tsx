"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  BookOpen,
  ChevronDown,
  FileText,
  MoreHorizontal,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon } from "@/components/pages/page-icon";
import { usePersistedToggle } from "@/hooks/use-persisted-toggle";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";

const VISIBLE_MAX = 3;

type FavoriteItem = {
  id: string;
  pageId: string;
  orderIndex: number;
  // Page metadata joined at the source (layout + favorites GET). Preferred over
  // pagesMap so favorited pages that aren't in the sidebar tree — database
  // entries, etc. — still show their real title/icon and a working link
  // instead of "Untitled".
  title?: string | null;
  icon?: string | null;
  shortId?: string | null;
};

type PageItem = {
  id: string;
  shortId: string;
  title: string;
  icon: string | null;
};

type Props = {
  favorites: FavoriteItem[];
  pagesMap: Record<string, PageItem>;
  workspaceSlug: string;
  onRemove: (pageId: string) => void;
  onReorder: (ids: string[]) => void;
};

export function FavoritesSection({
  favorites,
  pagesMap,
  workspaceSlug,
  onReorder,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [localFavs, setLocalFavs] = useState<FavoriteItem[]>(favorites);
  const [expanded, setExpanded] = usePersistedToggle(
    "pagevo:sidebar-favorites-expanded",
    true
  );
  // usePersistedToggle's real localStorage value lands post-hydration (an effect, to avoid SSR mismatch), but Disclosure only
  // reads defaultOpen once at mount — keying on `hydrated` forces one remount to seed it correctly, after which only DisclosureButton's own click changes `expanded`.
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

  if (
    localFavs.length !== favorites.length ||
    localFavs.some((f, i) => f.pageId !== favorites[i]?.pageId)
  ) {
    setLocalFavs(favorites);
  }

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIdx = localFavs.findIndex((f) => f.pageId === active.id);
    const newIdx = localFavs.findIndex((f) => f.pageId === over.id);
    if (oldIdx === -1 || newIdx === -1) {
      return;
    }

    const reordered = arrayMove(localFavs, oldIdx, newIdx);
    setLocalFavs(reordered);
    onReorder(reordered.map((f) => f.pageId));
  }

  const visible = localFavs.slice(0, VISIBLE_MAX);
  const hasMore = localFavs.length > VISIBLE_MAX;

  // Prefer the metadata carried on the favorite itself (joined server-side);
  // fall back to the page tree, then to safe defaults. This is what lets
  // favorited database entries (never in pagesMap) render correctly.
  function resolveFav(fav: FavoriteItem) {
    const page = pagesMap[fav.pageId];
    return {
      title: fav.title ?? page?.title ?? "Untitled",
      icon: fav.icon ?? page?.icon ?? null,
      shortId: fav.shortId ?? page?.shortId ?? fav.pageId,
    };
  }

  return (
    <div className="px-2">
      <Disclosure defaultOpen={expanded} key={hydrated ? "loaded" : "loading"}>
        {/* Section header */}
        <DisclosureButton
          className="group mb-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          <Star
            className="shrink-0 text-base-content/70 group-hover:text-primary"
            size={15}
          />
          <span className="text-left">Favorites</span>
          {localFavs.length > 0 && (
            <span className="text-xs text-base-content/70">
              {localFavs.length}
            </span>
          )}
          <ChevronDown
            className={`shrink-0 text-base-content/70 transition-transform duration-150 group-hover:text-primary ${expanded ? "" : "-rotate-90"}`}
            size={14}
          />
        </DisclosureButton>

        {/* Grid-rows trick animates height without measuring it in JS — the
          row track tweens between 0fr/1fr while overflow-hidden clips the
          content, giving a smooth expand/collapse instead of an instant
          mount/unmount. Content stays mounted (just visually clipped) so the
          transition has something to animate between. `static` keeps
          DisclosurePanel always rendered so our own CSS (not Headless UI's
          own show/hide) controls visibility. */}
        <DisclosurePanel
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          static
        >
          <div className="overflow-hidden">
            {localFavs.length === 0 ? (
              <p className="px-2.5 py-1 text-xs text-base-content/70">
                Star a page to add it here.
              </p>
            ) : (
              <>
                {mounted ? (
                  <DndContext
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    sensors={sensors}
                  >
                    <SortableContext
                      items={visible.map((f) => f.pageId)}
                      strategy={verticalListSortingStrategy}
                    >
                      {visible.map((fav) => {
                        const r = resolveFav(fav);
                        return (
                          <FavoriteRow
                            favoriteId={fav.pageId}
                            icon={r.icon}
                            key={fav.pageId}
                            shortId={r.shortId}
                            title={r.title}
                            workspaceSlug={workspaceSlug}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                ) : (
                  visible.map((fav) => {
                    const r = resolveFav(fav);
                    return (
                      <FavoriteRow
                        favoriteId={fav.pageId}
                        icon={r.icon}
                        key={fav.pageId}
                        shortId={r.shortId}
                        title={r.title}
                        workspaceSlug={workspaceSlug}
                      />
                    );
                  })
                )}

                {hasMore && (
                  <button
                    className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
                    onClick={openPopup}
                    ref={moreRef}
                    type="button"
                  >
                    <MoreHorizontal size={12} />
                    {localFavs.length - VISIBLE_MAX} more
                  </button>
                )}
              </>
            )}
          </div>
        </DisclosurePanel>
      </Disclosure>

      {/* Popup flyout — portaled to document.body, making it a *sibling* of
          the sidebar's own wrapper (md:z-550 in workspace-shell.tsx), not a
          descendant of it. z-560 keeps it above that wrapper; anything
          lower renders half-hidden behind the sidebar wherever they overlap. */}
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
              <span className="text-sm font-semibold text-white">
                Favorites
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                {localFavs.length}
              </span>
            </div>
            {/* List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {localFavs.map((fav) => {
                const r = resolveFav(fav);
                return (
                  <Link
                    className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                    href={`/app/${workspaceSlug}/${r.shortId}?from=favorites`}
                    key={fav.pageId}
                    onClick={() => setPopupOpen(false)}
                  >
                    {r.icon ? (
                      <PageIcon icon={r.icon} size={13} />
                    ) : (
                      <FileText
                        className="shrink-0 text-base-content/70"
                        size={13}
                      />
                    )}
                    <span className="min-w-0 truncate">
                      {r.title || "Untitled"}
                    </span>
                  </Link>
                );
              })}
            </div>
            {/* Footer */}
            <div className="mx-1 h-px bg-base-300" />
            <div className="px-3 py-2">
              <Link
                className="flex items-center gap-2 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:text-base-content"
                href={`/app/${workspaceSlug}/library`}
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

function FavoriteRow({
  favoriteId,
  icon,
  title,
  shortId,
  workspaceSlug,
}: {
  favoriteId: string;
  icon: string | null;
  title: string;
  shortId: string;
  workspaceSlug: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favoriteId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="group flex items-center rounded-md transition-colors duration-150 hover:bg-base-300"
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-xs text-base-content/80 transition-colors hover:text-primary"
        href={`/app/${workspaceSlug}/${shortId}?from=favorites`}
        {...listeners}
      >
        {icon ? (
          <PageIcon icon={icon} size={13} />
        ) : (
          <FileText className="shrink-0 text-base-content/70" size={12} />
        )}
        <span className="min-w-0 truncate">{title || "Untitled"}</span>
      </Link>
    </div>
  );
}
