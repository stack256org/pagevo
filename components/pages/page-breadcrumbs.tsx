"use client";

import { ChevronRight, FileText, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { PageIcon } from "@/components/pages/page-icon";
import {
  type PageNavSource,
  pageNavSourceHref,
  pageNavSourceLabel,
} from "@/lib/pages/navigation-source";

export interface BreadcrumbAncestor {
  icon: string | null;
  id: string;
  shortId: string;
  title: string | null;
}

interface PageBreadcrumbsProps {
  ancestors: BreadcrumbAncestor[];
  currentPageId: string;
  initialIcon: string | null;
  initialTitle: string | null;
  navSource?: PageNavSource;
  workspaceName: string;
  workspaceSlug: string;
}

// Server-fetched titles/icons are frozen at request time; listening for the
// shared "pagevo:page-title-changed" event keeps crumbs live without a reload.
export function PageBreadcrumbs({
  workspaceSlug,
  workspaceName,
  ancestors: initialAncestors,
  currentPageId,
  initialTitle,
  initialIcon,
  navSource,
}: PageBreadcrumbsProps) {
  const [ancestors, setAncestors] = useState(initialAncestors);
  const [title, setTitle] = useState(initialTitle);
  const [icon, setIcon] = useState(initialIcon);

  useEffect(() => {
    function onTitleChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          pageId: string;
          title?: string;
          icon?: string | null;
        }>
      ).detail;
      if (!detail) {
        return;
      }
      if (detail.pageId === currentPageId) {
        if (detail.title !== undefined) {
          setTitle(detail.title);
        }
        if (detail.icon !== undefined) {
          setIcon(detail.icon);
        }
        return;
      }
      setAncestors((prev) =>
        prev.map((a) =>
          a.id === detail.pageId
            ? {
                ...a,
                title: detail.title === undefined ? a.title : detail.title,
                icon: detail.icon === undefined ? a.icon : detail.icon,
              }
            : a
        )
      );
    }
    window.addEventListener("pagevo:page-title-changed", onTitleChanged);
    return () =>
      window.removeEventListener("pagevo:page-title-changed", onTitleChanged);
  }, [currentPageId]);

  return (
    <nav className="flex min-w-0 items-center gap-0.5 text-sm">
      <a
        className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
        href={`/app/${workspaceSlug}`}
      >
        <Home className="shrink-0" size={13} />
        <span className="font-medium">{workspaceName}</span>
      </a>

      {navSource &&
        (() => {
          const label = pageNavSourceLabel(navSource);
          const href = pageNavSourceHref(navSource, workspaceSlug);
          return (
            <span className="flex min-w-0 items-center gap-0.5">
              <ChevronRight
                className="shrink-0 text-base-content/50"
                size={12}
              />
              {href ? (
                <a
                  className="max-w-30 truncate rounded-sm px-2 py-1 text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                  href={href}
                >
                  {label}
                </a>
              ) : (
                <span className="max-w-30 truncate px-2 py-1 text-base-content/70">
                  {label}
                </span>
              )}
            </span>
          );
        })()}

      {ancestors.map((crumb) => (
        <span className="flex min-w-0 items-center gap-0.5" key={crumb.id}>
          <ChevronRight className="shrink-0 text-base-content/50" size={12} />
          <a
            className="flex max-w-30 items-center gap-1.5 truncate rounded-sm px-2 py-1 text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
            href={`/app/${workspaceSlug}/${crumb.shortId}`}
          >
            {crumb.icon ? (
              <PageIcon icon={crumb.icon} size={12} />
            ) : (
              <FileText className="shrink-0" size={12} />
            )}
            {crumb.title || "Untitled"}
          </a>
        </span>
      ))}

      <span className="flex min-w-0 items-center gap-0.5">
        <ChevronRight className="shrink-0 text-base-content/50" size={12} />
        <span className="flex max-w-60 items-center gap-1.5 truncate px-2 py-1 text-sm font-semibold text-base-content">
          {icon ? (
            <PageIcon icon={icon} size={12} />
          ) : (
            <FileText className="shrink-0 text-base-content/70" size={12} />
          )}
          {title || "Untitled"}
        </span>
      </span>
    </nav>
  );
}
