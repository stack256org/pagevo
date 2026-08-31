"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import {
  BookOpen,
  ChevronDown,
  Database,
  FileText,
  Home,
  LayoutGrid,
  LogOut,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Shield,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { PageIcon } from "@/components/pages/page-icon";
import { FavoritesSection } from "@/components/sidebar/favorites-section";
import { PageTree } from "@/components/sidebar/page-tree";
import { PrivateSection } from "@/components/sidebar/private-section";
import { RecentlyVisitedSection } from "@/components/sidebar/recently-visited-section";
import { WorkspaceSwitcher } from "@/components/sidebar/workspace-switcher";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewPageButton } from "@/components/workspace/new-page-button";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { usePageTreeStream } from "@/lib/pages/use-page-tree-stream";
import { getAvatarColor, getInitials } from "@/lib/utils";

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

type FavoriteItem = {
  id: string;
  pageId: string;
  orderIndex: number;
  // Page metadata joined server-side (and by the favorites GET) so favorites
  // resolve even when the page isn't in the sidebar tree — e.g. database
  // entries. Optional: an optimistic add fills these from pagesMap when known.
  title?: string | null;
  icon?: string | null;
  shortId?: string | null;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  userEmail: string;
  initialUserName: string | null;
  initialUserImage: string | null;
  isAdmin?: boolean;
  initialPages: PageItem[];
  // Private database entries, kept separate from `initialPages` since only the Private section shows them.
  initialPrivateEntries: PageItem[];
  initialFavorites: FavoriteItem[];
  initialRecentlyVisited: { id: string; pageId: string; visitedAt: string }[];
  initialSidebarWidth: number;
  initialSidebarCollapsed: boolean;
};

const MIN_WIDTH = 300;
const MAX_WIDTH = 480;

export function Sidebar({
  workspaceId,
  workspaceSlug,
  userEmail,
  initialUserName,
  initialUserImage,
  isAdmin = false,
  initialPages,
  initialPrivateEntries,
  initialFavorites,
  initialRecentlyVisited,
  initialSidebarWidth,
  initialSidebarCollapsed,
}: Props) {
  const pathname = usePathname();
  const [userImage, setUserImage] = useState<string | null>(initialUserImage);
  const [userName, setUserName] = useState<string | null>(initialUserName);
  const [width, setWidth] = useState(
    Math.max(MIN_WIDTH, initialSidebarWidth || MIN_WIDTH)
  );
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [filter] = useState("");
  const [pages, setPages] = useState<PageItem[]>(initialPages);
  const [privateEntries, setPrivateEntries] = useState<PageItem[]>(
    initialPrivateEntries
  );
  const [pagesLoading, setPagesLoading] = useState(false);
  // Lets fetchPages check "do we already have pages?" without depending on
  // `pages` (which would redefine the callback, and the pages:refresh
  // listener, on every mutation).
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>(initialFavorites);
  const [recentlyVisited, _setRecentlyVisited] = useState<
    { id: string; pageId: string; visitedAt: string }[]
  >(initialRecentlyVisited);
  const [pagesExpanded, setPagesExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const favoritePageIds = new Set(favorites.map((f) => f.pageId));
  const displayName = userName?.trim() || formatEmailAsName(userEmail);

  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const currentWidthRef = useRef(initialSidebarWidth);

  // Re-fetch page tree only when a mutation explicitly fires the refresh event.
  // Only show the loading skeleton when there's no tree to keep showing yet —
  // a background refresh (e.g. after adding/duplicating a page) swaps the
  // data in silently instead of flashing the whole tree to a skeleton.
  const fetchPages = useCallback(() => {
    if (pagesRef.current.length === 0) {
      setPagesLoading(true);
    }
    fetch(`/api/workspaces/${workspaceId}/pages/tree`)
      .then((r) => r.json())
      .then((d) => {
        setPages(Array.isArray(d) ? d : []);
        setPagesLoading(false);
      })
      .catch(() => setPagesLoading(false));
  }, [workspaceId]);

  const fetchFavorites = useCallback(() => {
    fetch(`/api/user/favorites?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d) => setFavorites(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    // Also re-fetch favorites on every page mutation (not just favorite-toggle) since a favorited page can be trashed/renamed elsewhere.
    function refresh() {
      fetchPages();
      fetchFavorites();
    }
    window.addEventListener("pages:refresh", refresh);
    return () => window.removeEventListener("pages:refresh", refresh);
  }, [fetchPages, fetchFavorites]);

  // Same-tab mutations refetch via the "pages:refresh" listener above; this
  // catches everyone else's — another user (or another tab) creating,
  // renaming, moving, or deleting a page in this workspace.
  usePageTreeStream({ workspaceId, onChange: fetchPages });

  useEffect(() => {
    function h(e: Event) {
      setUserImage((e as CustomEvent<{ image: string | null }>).detail.image);
    }
    window.addEventListener("pagevo:user-image-changed", h);
    return () => window.removeEventListener("pagevo:user-image-changed", h);
  }, []);

  useEffect(() => {
    function h(e: Event) {
      setUserName((e as CustomEvent<{ name: string | null }>).detail.name);
    }
    window.addEventListener("pagevo:user-name-changed", h);
    return () => window.removeEventListener("pagevo:user-name-changed", h);
  }, []);

  useEffect(() => {
    const open = () => setSearchOpen(true);
    const close = () => setSearchOpen(false);
    document.addEventListener("pagevo:open-search", open);
    document.addEventListener("pagevo:search-closed", close);
    return () => {
      document.removeEventListener("pagevo:open-search", open);
      document.removeEventListener("pagevo:search-closed", close);
    };
  }, []);

  // While the onboarding tour is running, suppress the "current page" active
  // highlight on nav items — otherwise Home's route-active pill (lit up
  // because onboarding lands users on the workspace root) looks like it's
  // part of the guided spotlight on Search/Notifications.
  useEffect(() => {
    const onActive = () => setTourActive(true);
    const onInactive = () => setTourActive(false);
    document.addEventListener("pagevo:tour-active", onActive);
    document.addEventListener("pagevo:tour-inactive", onInactive);
    return () => {
      document.removeEventListener("pagevo:tour-active", onActive);
      document.removeEventListener("pagevo:tour-inactive", onInactive);
    };
  }, []);

  // Marks handleToggleFavorite's own dispatch as already handled, so the listener's refetch doesn't race and wipe the optimistic update.
  const skipNextFavoritesEventRef = useRef(false);

  useEffect(() => {
    function onFavoritesChanged() {
      if (skipNextFavoritesEventRef.current) {
        skipNextFavoritesEventRef.current = false;
        return;
      }
      fetchFavorites();
    }
    window.addEventListener("pagevo:favorites-changed", onFavoritesChanged);
    return () =>
      window.removeEventListener(
        "pagevo:favorites-changed",
        onFavoritesChanged
      );
  }, [fetchFavorites]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    resizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidthRef.current;
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current) {
        return;
      }
      const next = Math.min(
        MAX_WIDTH,
        Math.max(
          MIN_WIDTH,
          startWidthRef.current + e.clientX - startXRef.current
        )
      );
      currentWidthRef.current = next;
      setWidth(next);
    }
    function onUp() {
      if (!resizingRef.current) {
        return;
      }
      resizingRef.current = false;
      fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sidebarWidth: currentWidthRef.current }),
      }).catch(() => {});
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  function handleToggleFavorite(pageId: string, isFav: boolean) {
    skipNextFavoritesEventRef.current = true;
    window.dispatchEvent(
      new CustomEvent("pagevo:favorites-changed", {
        detail: { pageId, isFavorited: !isFav },
      })
    );
    if (isFav) {
      const removed = favorites.find((f) => f.pageId === pageId);
      setFavorites((prev) => prev.filter((f) => f.pageId !== pageId));
      fetch(`/api/user/favorites/${pageId}`, { method: "DELETE" })
        .then((r) => {
          if (!r.ok && removed) {
            setFavorites((prev) => [...prev, removed]);
            toast.error("Couldn't remove favorite — please try again.");
          }
        })
        .catch(() => {
          if (removed) {
            setFavorites((prev) => [...prev, removed]);
          }
          toast.error("Couldn't remove favorite — please try again.");
        });
    } else {
      // Optimistic add — carry the page's metadata (if we have it) so the row
      // shows its real title/icon/shortId immediately, not "Untitled".
      const tempId = crypto.randomUUID();
      const p = pages.find((pg) => pg.id === pageId);
      setFavorites((prev) => [
        ...prev,
        {
          id: tempId,
          pageId,
          orderIndex: prev.length,
          title: p?.title,
          icon: p?.icon,
          shortId: p?.shortId,
        },
      ]);
      fetch("/api/user/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, workspaceId }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setFavorites((prev) =>
              prev.map((f) => (f.id === tempId ? data : f))
            );
          } else {
            setFavorites((prev) => prev.filter((f) => f.id !== tempId));
            toast.error("Couldn't add favorite — please try again.");
          }
        })
        .catch(() => {
          setFavorites((prev) => prev.filter((f) => f.id !== tempId));
          toast.error("Couldn't add favorite — please try again.");
        });
    }
  }

  function toggleCollapse() {
    // The button that was just clicked unmounts immediately — the header swaps
    // to the opposite collapsed/expanded layout — so its onMouseLeave never
    // fires and the tooltip would otherwise stay stuck on screen indefinitely.
    hideTooltip();
    const next = !collapsed;
    setCollapsed(next);
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sidebarCollapsed: next }),
    }).catch(() => {});
  }

  const pagesMap = Object.fromEntries(pages.map((p) => [p.id, p]));

  return (
    <aside
      className="relative flex h-dvh shrink-0 flex-col border-r border-base-300 bg-base-200 text-base-content transition-[width] duration-200 ease-in-out"
      data-tour="sidebar"
      style={{ width: collapsed ? 64 : width }}
    >
      {/* ── Header ── collapses to a single centered icon, expands to full bar */}
      {collapsed ? (
        <div className="flex h-11 w-full shrink-0 items-center justify-center border-b border-base-300">
          <button
            className="group relative flex size-9 items-center justify-center rounded-sm outline-none transition-colors duration-150 hover:bg-base-300"
            onClick={toggleCollapse}
            onMouseEnter={(e) => showTooltip("Expand sidebar", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover:opacity-0">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary text-[11px] font-bold uppercase text-primary-content">
                {workspaceSlug.charAt(0)}
              </span>
            </span>
            <span className="absolute inset-0 flex items-center justify-center text-base-content/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:text-base-content">
              <PanelLeft size={16} />
            </span>
          </button>
        </div>
      ) : (
        /* Expanded header: workspace switcher + new-menu dropdown */
        <div className="relative shrink-0">
          <div className="flex h-11 items-center gap-1 border-b border-base-300 px-2">
            <div className="min-w-0 flex-1">
              <WorkspaceSwitcher currentSlug={workspaceSlug} />
            </div>
            <Menu>
              <MenuButton
                className="flex size-7 items-center justify-center rounded-sm text-base-content/70 outline-none transition-colors duration-150 hover:bg-base-300 hover:text-base-content data-open:bg-primary data-open:text-primary-content data-open:hover:bg-primary"
                data-tour="new-page"
                onMouseEnter={(e) => showTooltip("Create new…", e)}
                onMouseLeave={hideTooltip}
              >
                <Plus size={14} />
              </MenuButton>
              <MenuItems
                anchor={{ to: "bottom end", gap: 4 }}
                className="z-600 w-60 overflow-hidden rounded-lg border border-base-300 bg-neutral transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                transition
              >
                <div className="px-3 pb-1 pt-2">
                  <p className="mb-1 text-xs font-medium tracking-wide text-base-content/70">
                    Create
                  </p>
                  {/* as="div": NewPageButton doesn't forward arbitrary props onto its
             inner <button> (fixed prop signature, no {...rest} spread), so
             MenuItem's default Fragment-merge would silently drop the
             role="menuitem"/onClick/focus-tracking it needs to inject —
             as="div" makes MenuItem render its own real element instead. */}
                  <MenuItem
                    as="div"
                    className="rounded-md data-focus:bg-base-200"
                  >
                    <NewPageButton
                      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-base-200 disabled:opacity-60"
                      workspaceId={workspaceId}
                      workspaceSlug={workspaceSlug}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                        <FileText size={14} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-base-content">
                          New Page
                        </span>
                        <span className="block text-xs text-base-content/70">
                          Docs, notes, wikis
                        </span>
                      </span>
                    </NewPageButton>
                  </MenuItem>
                </div>
                <div className="mx-3 my-1 h-px bg-base-300" />
                <div className="px-3 pb-2.5 pt-1">
                  <p className="mb-1 text-xs font-medium tracking-wide text-base-content/70">
                    More
                  </p>
                  <MenuItem
                    as="div"
                    className="rounded-md data-focus:bg-base-200"
                  >
                    <NewDatabaseButton
                      workspaceId={workspaceId}
                      workspaceSlug={workspaceSlug}
                    />
                  </MenuItem>
                  <MenuItem>
                    <Link
                      className="group mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150 data-focus:bg-base-200 hover:bg-base-200"
                      href={`/app/${workspaceSlug}/templates`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-warning/10 text-warning">
                        <LayoutGrid size={14} />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-base-content">
                          From Template
                        </span>
                        <span className="block text-xs text-base-content/70">
                          Start from a template
                        </span>
                      </span>
                    </Link>
                  </MenuItem>
                </div>
              </MenuItems>
            </Menu>
            <button
              className="relative z-50 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-base-content/70 outline-none transition-colors duration-150 hover:bg-base-300 hover:text-base-content"
              onClick={toggleCollapse}
              onMouseEnter={(e) => showTooltip("Collapse sidebar", e)}
              onMouseLeave={hideTooltip}
              type="button"
            >
              <PanelLeft size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Collapsed body: icon-only nav ── */}
      {collapsed && (
        <>
          <nav className="flex w-full flex-col items-center gap-1 px-2 py-3">
            <CollapsedNavItem
              active={
                pathname === `/app/${workspaceSlug}` &&
                !searchOpen &&
                !tourActive
              }
              href={`/app/${workspaceSlug}`}
              label="Home"
            >
              <Home size={18} />
            </CollapsedNavItem>
            <CollapsedSearchItem>
              <Search size={18} />
            </CollapsedSearchItem>
            <NotificationBell
              collapsed
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
            <CollapsedNavItem
              active={
                pathname.startsWith(`/app/${workspaceSlug}/library`) &&
                !tourActive
              }
              href={`/app/${workspaceSlug}/library`}
              label="Library"
            >
              <BookOpen size={18} />
            </CollapsedNavItem>
            <CollapsedNavItem
              active={
                pathname.startsWith(`/app/${workspaceSlug}/templates`) &&
                !tourActive
              }
              href={`/app/${workspaceSlug}/templates`}
              label="Templates"
            >
              <LayoutGrid size={18} />
            </CollapsedNavItem>
            <CollapsedFavoritesItem
              favorites={favorites}
              pagesMap={pagesMap}
              workspaceSlug={workspaceSlug}
            />
            <div className="my-1 w-8 border-t border-base-300" />
            <div className="w-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <NewPageButton
                    className="flex h-9 w-full items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-300 hover:text-base-content disabled:opacity-60"
                    workspaceId={workspaceId}
                    workspaceSlug={workspaceSlug}
                  >
                    <Plus size={18} />
                  </NewPageButton>
                </TooltipTrigger>
                <TooltipContent side="right">New Page</TooltipContent>
              </Tooltip>
            </div>
          </nav>
          <div className="flex-1" />
          <nav className="flex w-full flex-col items-center gap-1 border-t border-base-300 px-2 py-3">
            <CollapsedNavItem
              href={`/app/${workspaceSlug}/trash`}
              label="Trash"
            >
              <Trash2 size={18} />
            </CollapsedNavItem>
            {isAdmin && (
              <CollapsedNavItem href="/orbit-admin/orbit" label="Admin Panel">
                <Shield size={18} />
              </CollapsedNavItem>
            )}
          </nav>
          <div className="flex w-full items-center justify-center border-t border-base-300 py-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <UserAvatar
                  className="size-8 text-sm transition-opacity duration-150 hover:opacity-80"
                  image={userImage}
                  name={displayName}
                />
              </TooltipTrigger>
              <TooltipContent align="end" side="right">
                <p className="whitespace-nowrap text-xs font-semibold text-base-content">
                  {displayName}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-xs text-base-content/70">
                  {userEmail}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* ── Expanded body: full scrollable tree ── */}
      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
          {/* Quick nav */}
          <nav className="px-2 py-1.5">
            <NavButton
              active={
                pathname === `/app/${workspaceSlug}` &&
                !searchOpen &&
                !tourActive
              }
              href={`/app/${workspaceSlug}`}
              icon={<Home size={15} />}
              label="Home"
            />
            <span data-tour="search">
              <SearchNavButton icon={<Search size={15} />} />
            </span>
            <span data-tour="notifications">
              <NotificationBell
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
              />
            </span>
            <NavButton
              active={
                pathname.startsWith(`/app/${workspaceSlug}/library`) &&
                !tourActive
              }
              href={`/app/${workspaceSlug}/library`}
              icon={<BookOpen size={15} />}
              label="Library"
            />
            <NavButton
              active={
                pathname.startsWith(`/app/${workspaceSlug}/templates`) &&
                !tourActive
              }
              href={`/app/${workspaceSlug}/templates`}
              icon={<LayoutGrid size={15} />}
              label="Templates"
            />
          </nav>

          <div className="mx-2 border-t border-base-300" />

          {/* Favorites / Recently Visited / Private — one visual group bounded by
        the dividers above and below, so it gets its own top/bottom breathing
        room here rather than each section owning it individually. */}
          <div className="py-2">
            <FavoritesSection
              favorites={favorites}
              onRemove={(pageId) => {
                setFavorites((prev) => prev.filter((f) => f.pageId !== pageId));
                fetch(`/api/user/favorites/${pageId}`, {
                  method: "DELETE",
                }).catch(() => {});
              }}
              onReorder={(ids) => {
                fetch("/api/user/favorites/reorder", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids }),
                }).catch(() => {});
              }}
              pagesMap={pagesMap}
              workspaceSlug={workspaceSlug}
            />

            {/* Recently Visited */}
            <RecentlyVisitedSection
              items={recentlyVisited}
              pagesMap={pagesMap}
              workspaceSlug={workspaceSlug}
            />

            {/* Private */}
            <PrivateSection
              entries={privateEntries}
              favoritePageIds={favoritePageIds}
              onEntriesChange={setPrivateEntries}
              onPagesChange={setPages}
              onToggleFavorite={handleToggleFavorite}
              pages={pages}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          </div>

          <div className="mx-2 border-t border-base-300" />

          {/* Page tree with filter */}
          <div className="flex flex-1 flex-col px-2 py-2">
            <SectionLabel
              expanded={pagesExpanded}
              label="Pages"
              onBeforeAdd={() => setPagesExpanded(true)}
              onToggle={() => setPagesExpanded((v) => !v)}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            >
              <PageTree
                favoritePageIds={favoritePageIds}
                filter={filter}
                loading={pagesLoading}
                onPagesChange={setPages}
                onToggleFavorite={handleToggleFavorite}
                pages={pages}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
              />
            </SectionLabel>
          </div>
        </div>
      )}

      {/* Trash — kept out of the scrollable tree above so it stays put
       above the user footer instead of scrolling away with long page lists. */}
      {!collapsed && (
        <div className="shrink-0 border-t border-base-300 px-2 py-1.5">
          <NavButton
            active={pathname.startsWith(`/app/${workspaceSlug}/trash`)}
            href={`/app/${workspaceSlug}/trash`}
            icon={<Trash2 size={15} />}
            label="Trash"
          />
        </div>
      )}

      {/* ── Expanded: admin nav + user footer ── */}
      {!collapsed && isAdmin && (
        <div className="shrink-0 border-t border-base-300 px-2 py-1.5">
          <NavButton
            active={pathname.startsWith("/orbit-admin")}
            href="/orbit-admin/orbit"
            icon={<Shield size={15} />}
            label="Admin Panel"
          />
        </div>
      )}

      {!collapsed && (
        <div className="relative shrink-0 border-t border-base-300 px-2 py-2">
          {/* MenuItems is deliberately un-anchored (no `anchor` prop): this panel
         always sits flush against the sidebar footer with no viewport-
         collision risk, so it keeps the original `left-2 right-2` stretch-
         to-container positioning instead of Floating-UI-anchored width,
         which has no built-in way to match a variable-width sidebar. */}
          <Menu>
            <MenuItems
              className="absolute bottom-[calc(100%+8px)] left-2 right-2 z-50 origin-bottom overflow-hidden rounded-xl border border-base-300 bg-base-100 transition-all duration-150 ease-out data-closed:scale-95 data-closed:opacity-0 data-leave:scale-95 data-leave:opacity-0"
              transition
            >
              <div className="px-3.5 pb-3 pt-3.5">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <UserAvatar
                      className="size-10 text-sm"
                      image={userImage}
                      name={displayName}
                    />
                    <span className="absolute bottom-0 right-0 z-10 size-2.5 rounded-full bg-success ring-2 ring-base-100" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-base-content">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-xs leading-tight text-base-content/70">
                      {userEmail}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mx-3 h-px bg-base-300" />
              <div className="p-1.5">
                <MenuItem>
                  <Link
                    className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-150 data-focus:bg-base-200 hover:bg-base-200"
                    href={`/app/${workspaceSlug}/settings`}
                  >
                    <span className="flex size-6.5 shrink-0 items-center justify-center rounded-sm bg-base-200 text-base-content/70 transition-colors duration-150 group-hover:bg-primary/10 group-hover:text-primary">
                      <Settings size={13} />
                    </span>
                    <span className="text-sm font-medium text-base-content">
                      Settings
                    </span>
                  </Link>
                </MenuItem>
              </div>
              <div className="mx-3 h-px bg-base-300" />
              <div className="p-1.5">
                <MenuItem
                  as="div"
                  className="rounded-md data-focus:bg-error/10"
                >
                  <SignOutButton className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-150 hover:bg-error/10">
                    <span className="flex size-6.5 shrink-0 items-center justify-center rounded-sm bg-error/10 text-error">
                      <LogOut size={13} />
                    </span>
                    <span className="text-sm font-medium text-error">
                      Sign out
                    </span>
                  </SignOutButton>
                </MenuItem>
              </div>
            </MenuItems>
            <MenuButton className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-primary/10 data-open:bg-primary/10">
              <UserAvatar
                className="size-8 text-sm"
                image={userImage}
                name={displayName}
              />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-base-content">
                  {displayName}
                </p>
                <p className="truncate text-xs text-base-content/70">
                  {userEmail}
                </p>
              </div>
              <ChevronDown
                className="shrink-0 text-base-content/80 transition-transform duration-200 data-open:rotate-180"
                size={13}
              />
            </MenuButton>
          </Menu>
        </div>
      )}

      {/* Resize handle — expanded only */}
      {!collapsed && (
        <button
          aria-label="Resize sidebar"
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize border-0 bg-transparent p-0 transition-colors duration-150 hover:bg-base-300"
          onMouseDown={handleResizeStart}
          tabIndex={-1}
          type="button"
        />
      )}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </aside>
  );
}

function NavButton({
  href,
  icon,
  label,
  shortcut,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
}) {
  return (
    <Link
      className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 ${
        active
          ? "bg-primary/20 text-primary"
          : "text-base-content/80 hover:bg-base-300 hover:text-primary"
      }`}
      href={href}
    >
      <span
        className={`shrink-0 transition-colors duration-150 ${active ? "text-primary" : "text-base-content/70 group-hover:text-primary"}`}
      >
        {icon}
      </span>
      <span className={`flex-1 ${active ? "font-semibold" : ""}`}>{label}</span>
      {shortcut && (
        <kbd className="shrink-0 rounded bg-base-200 px-1 py-0.5 text-xs font-medium text-base-content/70">
          {shortcut}
        </kbd>
      )}
    </Link>
  );
}

function CollapsedNavItem({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            className={`flex h-9 w-full items-center justify-center rounded-sm transition-colors duration-150 ${
              active
                ? "bg-primary/20 text-primary"
                : "text-base-content/80 hover:bg-base-300 hover:text-primary"
            }`}
            href={href}
          >
            {children}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function CollapsedSearchItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex h-9 w-full items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-300 hover:text-base-content"
            onClick={() =>
              document.dispatchEvent(new CustomEvent("pagevo:open-search"))
            }
            type="button"
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Search</TooltipContent>
      </Tooltip>
    </div>
  );
}

// Collapsed rail has no room for the full Favorites list, so this icon opens favorites-section.tsx's overflow flyout showing all favorites.
function CollapsedFavoritesItem({
  favorites,
  pagesMap,
  workspaceSlug,
}: {
  favorites: FavoriteItem[];
  pagesMap: Record<string, PageItem>;
  workspaceSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClick(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) {
        return;
      }
      if (popupRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useScrollLockWhileOpen(
    open,
    (target) =>
      !!popupRef.current?.contains(target) || !!btnRef.current?.contains(target)
  );

  function toggle() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
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
      setPos({ top, left });
    }
    setOpen((v) => !v);
  }

  function resolveFav(fav: FavoriteItem) {
    const page = pagesMap[fav.pageId];
    return {
      title: fav.title ?? page?.title ?? "Untitled",
      icon: fav.icon ?? page?.icon ?? null,
      shortId: fav.shortId ?? page?.shortId ?? fav.pageId,
    };
  }

  return (
    <div className="w-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`flex h-9 w-full items-center justify-center rounded-sm transition-colors duration-150 ${
              open
                ? "bg-primary/20 text-primary"
                : "text-base-content/80 hover:bg-base-300 hover:text-primary"
            }`}
            onClick={toggle}
            ref={btnRef}
            type="button"
          >
            <Star size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent hidden={open} side="right">
          Favorites
        </TooltipContent>
      </Tooltip>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed z-560 w-72 overflow-hidden rounded-xl border border-primary/20 bg-neutral"
            ref={popupRef}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between bg-primary px-3 py-3">
              <span className="text-sm font-semibold text-white">
                Favorites
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">
                {favorites.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {favorites.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-base-content/70">
                  Star a page to add it here.
                </p>
              ) : (
                favorites.map((fav) => {
                  const r = resolveFav(fav);
                  return (
                    <Link
                      className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                      href={`/app/${workspaceSlug}/${r.shortId}?from=favorites`}
                      key={fav.pageId}
                      onClick={() => setOpen(false)}
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
                })
              )}
            </div>
            <div className="mx-1 h-px bg-base-300" />
            <div className="px-3 py-2">
              <Link
                className="flex items-center gap-2 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:text-base-content"
                href={`/app/${workspaceSlug}/library`}
                onClick={() => setOpen(false)}
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

function SearchNavButton({ icon }: { icon: React.ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onOpen() {
      setSearchOpen(true);
    }
    function onClose() {
      setSearchOpen(false);
    }
    document.addEventListener("pagevo:open-search", onOpen);
    document.addEventListener("pagevo:search-closed", onClose);
    return () => {
      document.removeEventListener("pagevo:open-search", onOpen);
      document.removeEventListener("pagevo:search-closed", onClose);
    };
  }, []);

  return (
    <button
      className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150 ${
        searchOpen
          ? "bg-primary/20 text-primary font-semibold"
          : "text-base-content/80 hover:bg-base-300 hover:text-primary"
      }`}
      onClick={() =>
        document.dispatchEvent(new CustomEvent("pagevo:open-search"))
      }
      type="button"
    >
      <span
        className={`shrink-0 transition-colors duration-150 ${searchOpen ? "text-primary" : "text-base-content/70 group-hover:text-primary"}`}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">Search</span>
      <kbd className="shrink-0 rounded-xs bg-base-300 px-1 py-0.5 text-xs font-medium text-base-content/70">
        Ctrl+K
      </kbd>
    </button>
  );
}

function formatEmailAsName(email: string): string {
  return email
    .split("@")[0]
    .split(".")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function UserAvatar({
  image,
  name,
  className,
}: {
  image: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: image is a reset trigger, not a value read here. Without it `failed` stays latched after the avatar URL changes and the new image is never retried.
  useEffect(() => {
    setFailed(false);
  }, [image]);
  const showImage = Boolean(image) && !failed;
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold uppercase ${showImage ? "bg-transparent" : `${getAvatarColor(name)} text-white`} ${className ?? ""}`}
    >
      {showImage ? (
        // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a browser resource-lifecycle event, not a user interaction — it swaps to the initials fallback when the avatar URL 404s. There is nothing here for a keyboard or screen-reader user to reach.
        <img
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
          src={image!}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

function SectionLabel({
  label,
  expanded,
  onToggle,
  workspaceId,
  workspaceSlug,
  onBeforeAdd,
  children,
}: {
  label: string;
  expanded?: boolean;
  onToggle?: () => void;
  workspaceId?: string;
  workspaceSlug?: string;
  onBeforeAdd?: () => void;
  children?: React.ReactNode;
}) {
  return (
    // Disclosure only supports defaultOpen (not controlled open), so onBeforeAdd forcing `expanded` true from outside updates our
    // grid-rows CSS immediately but can leave aria-expanded briefly stale — accepted over remounting Disclosure, which would reset PageTree's per-node expand state.
    <Disclosure defaultOpen={expanded}>
      <div className="group mb-0.5 flex w-full items-center justify-between rounded-md pr-1 transition-colors duration-150 hover:bg-base-300">
        <DisclosureButton
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-base-content/80 transition-colors duration-150 group-hover:text-primary"
          onClick={onToggle}
        >
          <span className="truncate">{label}</span>
          <ChevronDown
            className={`shrink-0 text-base-content/80 transition-transform duration-150 group-hover:text-primary ${expanded ? "" : "-rotate-90"}`}
            size={14}
          />
        </DisclosureButton>
        {workspaceId && workspaceSlug && (
          <NewPageButton
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-base-content/80 transition-colors duration-150 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
            onBeforeCreate={onBeforeAdd}
            title="Add a page"
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          >
            <Plus size={14} />
          </NewPageButton>
        )}
      </div>
      {/* Grid-rows trick animates height without measuring it in JS — see
       favorites-section.tsx for the full rationale. `static` keeps the panel
       always rendered so our own CSS, not Headless UI's, controls visibility. */}
      <DisclosurePanel
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        static
      >
        <div className="overflow-hidden">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}

function NewDatabaseButton({
  workspaceId,
  workspaceSlug,
  onBeforeCreate,
  ref,
}: {
  workspaceId: string;
  workspaceSlug: string;
  onBeforeCreate?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) {
      return;
    }
    onBeforeCreate?.();
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/databases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Database" }),
      });
      if (res.ok) {
        const db = await res.json();
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        router.push(`/app/${workspaceSlug}/${db.shortId}`);
      }
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-base-200 disabled:opacity-60"
      disabled={loading}
      onClick={handleClick}
      ref={ref}
      type="button"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-success/10 text-success">
        <Database size={14} />
      </span>
      <span>
        <span className="block text-sm font-medium text-base-content">
          New Database
        </span>
        <span className="block text-xs text-base-content/70">
          Tables, boards, calendars
        </span>
      </span>
    </button>
  );
}
