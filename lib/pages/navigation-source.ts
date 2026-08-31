// Registry of entry points a page can be opened from, carried via `?from=` so the breadcrumb (PageBreadcrumbs)
// can show where the user actually navigated from instead of just the page's parent chain.
export const PAGE_NAV_SOURCES = {
  library: {
    label: "Library",
    href: (workspaceSlug: string) => `/app/${workspaceSlug}/library`,
  },
  favorites: { label: "Favorites", href: (): string | null => null },
  search: { label: "Search", href: (): string | null => null },
  recent: { label: "Recently Visited", href: (): string | null => null },
  notifications: { label: "Notifications", href: (): string | null => null },
} as const;

export type PageNavSource = keyof typeof PAGE_NAV_SOURCES;

export function isPageNavSource(
  value: string | undefined | null
): value is PageNavSource {
  return !!value && value in PAGE_NAV_SOURCES;
}

export function pageNavSourceLabel(source: PageNavSource): string {
  return PAGE_NAV_SOURCES[source].label;
}

export function pageNavSourceHref(
  source: PageNavSource,
  workspaceSlug: string
): string | null {
  return PAGE_NAV_SOURCES[source].href(workspaceSlug);
}
