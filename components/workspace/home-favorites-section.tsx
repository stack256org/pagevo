"use client";

import { ChevronRight, FileText, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageIcon as SharedPageIcon } from "@/components/pages/page-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type FavPage = {
  id: string;
  pageId: string;
  shortId: string;
  title: string;
  icon: string | null;
};

function PageIcon({ icon }: { icon: string | null }) {
  if (icon) {
    return <SharedPageIcon icon={icon} size={16} />;
  }
  return <FileText className="text-base-content/50" size={14} />;
}

export function HomeFavoritesSection({
  pages: initialPages,
  workspaceSlug,
}: {
  pages: FavPage[];
  workspaceSlug: string;
  workspaceId: string;
}) {
  const [pages, setPages] = useState(initialPages);

  function removeFavorite(pageId: string) {
    setPages((prev) => prev.filter((p) => p.pageId !== pageId));
    fetch(`/api/user/favorites/${pageId}`, { method: "DELETE" }).catch(() => {
      // rollback
      setPages((prev) => {
        const removed = initialPages.find((p) => p.pageId === pageId);
        return removed ? [...prev, removed] : prev;
      });
    });
    window.dispatchEvent(new CustomEvent("pagevo:favorites-changed"));
  }

  if (pages.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Star className="shrink-0 text-warning" fill="currentColor" size={14} />
        <h2 className="text-sm font-semibold text-base-content">Favorites</h2>
        <span className="rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-semibold text-base-content/70">
          {pages.length}
        </span>
      </div>

      <div className="divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        {pages.map((page) => (
          <div
            className="group/row relative flex items-center gap-3 border-l-2 border-l-transparent px-4 py-3 transition-all duration-150 hover:border-l-primary hover:bg-primary/5"
            key={page.id}
          >
            {/* Full-row link */}
            <Link
              aria-label={page.title || "Untitled"}
              className="absolute inset-0"
              href={`/app/${workspaceSlug}/${page.shortId}`}
            />

            <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-base-300 bg-base-200 text-sm leading-none">
              <PageIcon icon={page.icon} />
            </span>

            <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-medium text-base-content">
              {page.title || "Untitled"}
            </span>

            {/* Unfavorite button with tooltip */}
            <div className="relative z-10 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex size-6 items-center justify-center rounded text-warning opacity-0 transition-all duration-150 group-hover/row:opacity-100 hover:text-warning/60"
                    onClick={() => removeFavorite(page.pageId)}
                    type="button"
                  >
                    <Star fill="currentColor" size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Remove from favorites
                </TooltipContent>
              </Tooltip>
            </div>

            <ChevronRight
              className="relative z-10 shrink-0 text-base-content/50 opacity-0 transition-opacity group-hover/row:opacity-100"
              size={12}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
