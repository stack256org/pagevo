"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import {
  BookOpen,
  ChevronDown,
  Clock,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon } from "@/components/pages/page-icon";
import { usePersistedToggle } from "@/hooks/use-persisted-toggle";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";

const VISIBLE_MAX = 3;

type RecentItem = {
  id: string;
  pageId: string;
  visitedAt: string;
};

type PageItem = {
  id: string;
  shortId: string;
  title: string;
  icon: string | null;
};

type Props = {
  items: RecentItem[];
  pagesMap: Record<string, PageItem>;
  workspaceSlug: string;
};

export function RecentlyVisitedSection({
  items,
  pagesMap,
  workspaceSlug,
}: Props) {
  const [expanded, setExpanded] = usePersistedToggle(
    "pagevo:sidebar-recently-visited-expanded",
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

  const resolved = items.filter((item) => !!pagesMap[item.pageId]);
  if (resolved.length === 0) {
    return null;
  }

  const visible = resolved.slice(0, VISIBLE_MAX);
  const hasMore = resolved.length > VISIBLE_MAX;

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
        <DisclosureButton
          className="group mb-0.5 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          <Clock
            className="shrink-0 text-base-content/70 group-hover:text-primary"
            size={15}
          />
          <span className="text-left">Recently Visited</span>
          <ChevronDown
            className={`shrink-0 text-base-content/70 transition-transform duration-150 group-hover:text-primary ${expanded ? "" : "-rotate-90"}`}
            size={14}
          />
        </DisclosureButton>

        {/* Grid-rows trick animates height without measuring it in JS — see
       favorites-section.tsx for the full rationale. `static` keeps the
       panel always rendered so our own CSS, not Headless UI's, controls
       visibility. */}
        <DisclosurePanel
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          static
        >
          <div className="overflow-hidden">
            {visible.map((item) => {
              const page = pagesMap[item.pageId];
              return (
                <Link
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
                  href={`/app/${workspaceSlug}/${page.shortId}?from=recent`}
                  key={item.id}
                >
                  {page.icon ? (
                    <PageIcon icon={page.icon} size={13} />
                  ) : (
                    <FileText
                      className="shrink-0 text-base-content/70"
                      size={12}
                    />
                  )}
                  <span className="min-w-0 truncate">
                    {page.title || "Untitled"}
                  </span>
                </Link>
              );
            })}
            {hasMore && (
              <button
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-base-content/80 transition-colors duration-150 hover:bg-base-300 hover:text-primary"
                onClick={openPopup}
                ref={moreRef}
                type="button"
              >
                <MoreHorizontal size={12} />
                {resolved.length - VISIBLE_MAX} more
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
              <span className="text-sm font-semibold text-white">
                Recently Visited
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                {resolved.length}
              </span>
            </div>
            {/* List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {resolved.map((item) => {
                const page = pagesMap[item.pageId];
                return (
                  <Link
                    className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                    href={`/app/${workspaceSlug}/${page.shortId}?from=recent`}
                    key={item.id}
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
