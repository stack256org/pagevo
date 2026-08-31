"use client";

import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Grid2X2,
  Loader2,
  Lock,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageActionsMenu } from "@/components/pages/page-actions-menu";
import { PageIcon as SharedPageIcon } from "@/components/pages/page-icon";
import { PagePrivacyProvider } from "@/components/pages/page-privacy-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TimeAgo } from "@/components/ui/time-ago";
import type {
  LibraryPageResult,
  LibraryPageRow as PageRow,
} from "@/lib/pages/library";
import {
  DEFAULT_PAGE_SIZE,
  getPageNumbers,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/lib/ui/pagination";

type DisplayRow = PageRow & { depth: number; hasChildren: boolean };

// The server always renders the first page at DEFAULT_PAGE_SIZE (page.tsx has
// no pageSize search param to read), so a chosen size lives only in
// localStorage — restored client-side once the component mounts.
const PAGE_SIZE_STORAGE_KEY = "pagevo:library-page-size";

// Nests sub-pages under their parent instead of listing flat; a page whose parent isn't
// in `rows` is treated as a root so the tree never silently drops rows. Expansion is
// opt-in so large workspaces start collapsed and scannable.
function buildDisplayRows(
  rows: PageRow[],
  expanded: Set<string>
): DisplayRow[] {
  const idSet = new Set(rows.map((p) => p.id));
  const childrenByParent = new Map<string, PageRow[]>();
  const roots: PageRow[] = [];
  for (const p of rows) {
    if (p.parentId && idSet.has(p.parentId)) {
      if (!childrenByParent.has(p.parentId)) {
        childrenByParent.set(p.parentId, []);
      }
      childrenByParent.get(p.parentId)!.push(p);
    } else {
      roots.push(p);
    }
  }

  const out: DisplayRow[] = [];
  function walk(list: PageRow[], depth: number) {
    for (const p of list) {
      const kids = childrenByParent.get(p.id) ?? [];
      out.push({ ...p, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && expanded.has(p.id)) {
        walk(kids, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return out;
}

type Tab = "all" | "recents" | "favorites" | "private";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All Pages" },
  { id: "recents", label: "Recents" },
  { id: "favorites", label: "Favorites" },
  { id: "private", label: "Private" },
];

function TabIcon({ id }: { id: Tab }) {
  if (id === "all") {
    return <Grid2X2 className="shrink-0" size={14} />;
  }
  if (id === "recents") {
    return <Clock className="shrink-0" size={14} />;
  }
  if (id === "favorites") {
    return <Star className="shrink-0" size={14} />;
  }
  return <Lock className="shrink-0" size={14} />;
}

function PageIcon({ icon, kind }: { icon: string | null; kind: string }) {
  if (icon) {
    return <SharedPageIcon icon={icon} size={14} />;
  }
  if (kind === "database") {
    return (
      <svg
        className="size-3.5 shrink-0 text-base-content/50"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.6}
        viewBox="0 0 24 24"
      >
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <line x1="3" x2="21" y1="9" y2="9" />
        <line x1="3" x2="21" y1="15" y2="15" />
        <line x1="9" x2="9" y1="9" y2="21" />
      </svg>
    );
  }
  return <FileText className="shrink-0 text-base-content/50" size={14} />;
}

export function LibraryClient({
  initial,
  workspaceSlug,
  workspaceId,
}: {
  initial: LibraryPageResult;
  workspaceSlug: string;
  workspaceId: string;
}) {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => {
    const initialTab = searchParams.get("tab");
    return initialTab === "recents" ||
      initialTab === "favorites" ||
      initialTab === "private"
      ? initialTab
      : "all";
  });
  const [search, setSearch] = useState("");
  // Applied 250ms after typing stops — this now drives a real network
  // request per change, unlike the old instant client-side filter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // Decoupled from `pageSize` so the field can be freely typed into (cleared,
  // mid-edit) without a controlled-input value snapping back on every
  // keystroke — only reconciled on blur/Enter/stepper click.
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [currentPage, setCurrentPage] = useState(1);
  const [goToPageInput, setGoToPageInput] = useState("");

  // `initial` is only the server-rendered first page; every later change refetches
  // its own page from the API instead of holding the whole workspace in memory.
  const [rows, setRows] = useState<PageRow[]>(initial.pages);
  const [totalCount, setTotalCount] = useState(initial.totalCount);
  const [nestingActive, setNestingActive] = useState(initial.nestingActive);
  const [tabCounts, setTabCounts] = useState(initial.tabCounts);
  const [loading, setLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectingAll, setSelectingAll] = useState(false);
  // Which parent pages are expanded (opt-in — see buildDisplayRows). Never
  // reset by tab/search/pagination changes below, so a user's expand/collapse
  // choices persist while navigating around the Library.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  // Child ids keyed by parentId, built once per `rows` change so toggleRow
  // (below) can cascade a parent's selection onto its subpages without
  // re-walking the flat array on every keystroke/click.
  const childrenByParent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of rows) {
      if (!p.parentId) {
        continue;
      }
      const siblings = map.get(p.parentId);
      if (siblings) {
        siblings.push(p.id);
      } else {
        map.set(p.parentId, [p.id]);
      }
    }
    return map;
  }, [rows]);

  // All descendant ids of `id` (children, grandchildren, ...), regardless of
  // whether they're currently expanded — `rows` holds every page returned
  // for this tab/page, expansion only controls what's rendered.
  function getDescendantIds(id: string): string[] {
    const result: string[] = [];
    const stack = [...(childrenByParent.get(id) ?? [])];
    while (stack.length > 0) {
      const nextId = stack.pop();
      if (!nextId) {
        continue;
      }
      result.push(nextId);
      const kids = childrenByParent.get(nextId);
      if (kids) {
        stack.push(...kids);
      }
    }
    return result;
  }

  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // useCallback so the effects below can depend on it without refetching on
  // every render — it only closes over `workspaceId`, a ref, and setters.
  const fetchLibrary = useCallback(
    async (t: Tab, q: string, p: number, size: number) => {
      const myRequestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          tab: t,
          search: q,
          page: String(p),
          pageSize: String(size),
        });
        const res = await fetch(
          `/api/workspaces/${workspaceId}/pages/library?${params}`
        );
        if (!res.ok) {
          throw new Error("Failed to load");
        }
        const data = (await res.json()) as LibraryPageResult;
        if (myRequestId !== requestIdRef.current) {
          return; // superseded by a newer request
        }
        setRows(data.pages);
        setTotalCount(data.totalCount);
        setNestingActive(data.nestingActive);
        setTabCounts(data.tabCounts);
      } catch {
        // Keep whatever was previously on screen rather than clearing to empty.
      } finally {
        if (myRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [workspaceId]
  );

  const refetch = useCallback(() => {
    fetchLibrary(tab, debouncedSearch, currentPage, pageSize);
  }, [fetchLibrary, tab, debouncedSearch, currentPage, pageSize]);

  // Restore a previously-chosen page size once, on mount. This lands as a
  // pageSize change (10 -> stored value), which the fetch effect below picks
  // up on its own — no need to fetch here too.
  useEffect(() => {
    const stored = Number.parseInt(
      localStorage.getItem(PAGE_SIZE_STORAGE_KEY) ?? "",
      10
    );
    if (
      Number.isFinite(stored) &&
      stored >= MIN_PAGE_SIZE &&
      stored <= MAX_PAGE_SIZE &&
      stored !== DEFAULT_PAGE_SIZE
    ) {
      setPageSize(stored);
      setPageSizeInput(String(stored));
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  // Skip the very first run — page.tsx's server-rendered `initial` already
  // covers page 1 of whichever tab the URL requested, so firing again here
  // on mount would just repeat the same request.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    fetchLibrary(tab, debouncedSearch, currentPage, pageSize);
  }, [tab, debouncedSearch, currentPage, pageSize, fetchLibrary]);

  // Pick up page mutations made OUTSIDE this table too (e.g. deleting or
  // duplicating from the sidebar's own row menu) — those dispatch the same
  // "pages:refresh" event the sidebar listens for.
  useEffect(() => {
    function onPagesRefresh() {
      refetch();
    }
    window.addEventListener("pages:refresh", onPagesRefresh);
    return () => window.removeEventListener("pages:refresh", onPagesRefresh);
    // `refetch` already closes over tab/search/page/pageSize, so re-registering
    // when it changes is the same listener churn the explicit list had before.
  }, [refetch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // If a mutation (e.g. deleting the last row on the last page) shrinks the
  // dataset below the page currently being viewed, snap back to the new last
  // page — this also re-fires the fetch effect above to reload it.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  function changeTab(next: Tab) {
    setTab(next);
    setCurrentPage(1);
    setSelectedIds(new Set());
    // Avoid flashing the previous tab's rows under the new tab's label while
    // its own data loads.
    setRows([]);
  }

  function changeSearch(val: string) {
    setSearch(val);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setCurrentPage(1);
      setSelectedIds(new Set());
      setRows([]);
    }, 250);
  }

  function changePageSize(next: number) {
    const clamped = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, next));
    setPageSize(clamped);
    setPageSizeInput(String(clamped));
    setCurrentPage(1);
    setRows([]);
  }

  function submitPageSizeInput() {
    const n = Number.parseInt(pageSizeInput, 10);
    changePageSize(Number.isFinite(n) ? n : pageSize);
  }

  function goToPage(p: number) {
    setCurrentPage(Math.min(totalPages, Math.max(1, p)));
  }

  function submitGoToPage() {
    const n = Number.parseInt(goToPageInput, 10);
    if (Number.isFinite(n)) {
      goToPage(n);
    }
    setGoToPageInput("");
  }

  function toggleFavorite(pageId: string) {
    const row = rows.find((r) => r.id === pageId);
    if (!row) {
      return;
    }
    const wasFav = row.isFavorited;
    // Un-favoriting while viewing the Favorites tab drops the row
    // immediately, matching the old client-side filter's behavior.
    if (tab === "favorites" && wasFav) {
      setRows((prev) => prev.filter((r) => r.id !== pageId));
    } else {
      setRows((prev) =>
        prev.map((r) => (r.id === pageId ? { ...r, isFavorited: !wasFav } : r))
      );
    }
    setTabCounts((prev) => ({
      ...prev,
      favorites: prev.favorites + (wasFav ? -1 : 1),
    }));

    // Notify the sidebar only AFTER the write commits. Dispatching eagerly
    // made the sidebar's refetch race the POST/DELETE and read the
    // pre-change state, so its Favorites list lagged one action behind.
    const notify = () =>
      window.dispatchEvent(new CustomEvent("pagevo:favorites-changed"));
    const req = wasFav
      ? fetch(`/api/user/favorites/${pageId}`, { method: "DELETE" })
      : fetch("/api/user/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, workspaceId }),
        });
    // On failure, just resync from the server rather than trying to hand-
    // reconstruct exactly which optimistic change (patch vs. row removal) to
    // undo.
    req.then(notify).catch(refetch);
  }

  function togglePrivate(row: PageRow) {
    const next = !row.isPrivate;
    // Un-privating while viewing the Private tab drops the row immediately,
    // matching the old client-side filter's behavior.
    if (tab === "private" && !next) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } else {
      setRows((prev) =>
        prev.map((p) => (p.id === row.id ? { ...p, isPrivate: next } : p))
      );
    }
    setTabCounts((prev) => ({
      ...prev,
      private: prev.private + (next ? 1 : -1),
    }));
    fetch(`/api/pages/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrivate: next }),
    })
      // Moves the page into/out of the sidebar's Private section right away —
      // otherwise it only updates when the page-tree SSE poll next fires (4s
      // server-side), which read as a ~5s lag.
      .then(() => window.dispatchEvent(new CustomEvent("pages:refresh")))
      .catch(refetch);
  }

  function toggleLocked(row: PageRow) {
    const next = !row.isLocked;
    setRows((prev) =>
      prev.map((p) => (p.id === row.id ? { ...p, isLocked: next } : p))
    );
    fetch(`/api/pages/${row.id}/lock`, { method: "POST" }).catch(() => {
      setRows((prev) =>
        prev.map((p) => (p.id === row.id ? { ...p, isLocked: !next } : p))
      );
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleRow(id: string) {
    const descendantIds = getDescendantIds(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        for (const descendantId of descendantIds) {
          next.delete(descendantId);
        }
      } else {
        next.add(id);
        for (const descendantId of descendantIds) {
          next.add(descendantId);
        }
      }
      return next;
    });
  }

  // Selects every page matching the current tab/search — not just whatever's
  // loaded for this pagination page, and not just whatever's currently
  // expanded in the "All Pages" tree — since the header checkbox's label
  // ("select all") means all matching pages, not "all visible rows."
  async function toggleSelectAll() {
    if (
      expectedSelectAllTotal > 0 &&
      selectedIds.size >= expectedSelectAllTotal
    ) {
      setSelectedIds(new Set());
      return;
    }
    setSelectingAll(true);
    try {
      const params = new URLSearchParams({ tab, search: debouncedSearch });
      const res = await fetch(
        `/api/workspaces/${workspaceId}/pages/library/ids?${params}`
      );
      if (!res.ok) {
        throw new Error("Failed to load");
      }
      const data = (await res.json()) as { ids: string[] };
      setSelectedIds(new Set(data.ids));
    } catch {
      // Fall back to selecting what's already loaded rather than doing nothing.
      setSelectedIds(new Set(rows.map((r) => r.id)));
    } finally {
      setSelectingAll(false);
    }
  }

  async function handleDeleteSelected() {
    setDeletingSelected(true);
    setDeleteErr("");
    const selected = [...selectedIds];

    // One request for the whole selection (which can span beyond what's loaded
    // client-side) — the server folds parent+child selections authoritatively.
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/pages/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selected }),
        }
      );
      if (!res.ok) {
        throw new Error("Failed to delete");
      }
      const { results } = (await res.json()) as {
        results: { id: string; ok: boolean; error?: string }[];
      };

      const removed = new Set(results.filter((r) => r.ok).map((r) => r.id));
      const failed = results.filter((r) => !r.ok);

      setRows((prev) => prev.filter((p) => !removed.has(p.id)));
      setSelectedIds(new Set());
      if (removed.size > 0) {
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        refetch(); // reconcile totals/tab counts and refill this page from what's left
      }
      if (failed.length > 0) {
        setDeleteErr(
          failed.length === 1
            ? `Failed to delete page: ${failed[0]!.error ?? "Unknown error"}`
            : `Failed to delete ${failed.length} pages`
        );
      }
    } catch {
      setDeleteErr("Network error");
    } finally {
      setDeletingSelected(false);
      setConfirmDeleteSelected(false);
    }
  }

  const displayRows: DisplayRow[] = nestingActive
    ? buildDisplayRows(rows, expandedIds)
    : rows.map((p) => ({ ...p, depth: 0, hasChildren: false }));

  // tabCounts[tab] is unfiltered, so once search is active, totalCount (search-aware)
  // is the right total to compare selection against.
  const expectedSelectAllTotal = search ? totalCount : tabCounts[tab];
  const allSelected =
    expectedSelectAllTotal > 0 && selectedIds.size >= expectedSelectAllTotal;
  const someSelected = !allSelected && selectedIds.size > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Tabs + search row ── */}
      <div className="shrink-0 bg-base-100">
        <div className="mx-auto flex w-full max-w-300 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            {TABS.map((t) => (
              <button
                className={`relative flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-medium whitespace-nowrap transition-colors duration-150 ${
                  tab === t.id
                    ? "border-primary text-base-content"
                    : "border-transparent text-base-content/70 hover:text-base-content"
                }`}
                key={t.id}
                onClick={() => changeTab(t.id)}
                type="button"
              >
                <TabIcon id={t.id} />
                {t.label}
                <span
                  className={`rounded-xs px-1.5 py-0.5 text-xs font-semibold ${
                    tab === t.id
                      ? "bg-base-200 text-base-content"
                      : "bg-base-200 text-base-content/70"
                  }`}
                >
                  {tabCounts[t.id]}
                </span>
              </button>
            ))}
            {loading && (
              <Loader2
                className="ml-2 shrink-0 animate-spin text-base-content/50"
                size={13}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Selection toolbar — shown only when rows are checked */}
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs font-medium text-base-content/70">
                  {selectedIds.size} selected
                </span>
                <button
                  className="flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-base-content/70 transition-colors hover:text-base-content disabled:opacity-50"
                  disabled={deletingSelected}
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  <X size={12} />
                  Clear
                </button>
                <button
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border border-error/40 bg-error/8 px-3 text-xs font-medium text-error transition-colors hover:border-error/70 hover:bg-error/15 disabled:opacity-50"
                  disabled={deletingSelected}
                  onClick={() => setConfirmDeleteSelected(true)}
                  type="button"
                >
                  {deletingSelected ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 size={12} />
                      Delete selected ({selectedIds.size})
                    </>
                  )}
                </button>
                <div className="h-5 w-px bg-base-300" />
              </>
            )}

            {/* Search */}
            <div className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-200 px-3 py-1.5 text-xs transition-colors duration-150 focus-within:border-base-300">
              <Search className="shrink-0 text-base-content/50" size={13} />
              <input
                className="w-40 bg-transparent text-xs text-base-content placeholder:text-base-content/50 focus:outline-none"
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Search by page name or creator…"
                type="text"
                value={search}
              />
              {search && (
                <button
                  className="text-base-content/50 transition-colors duration-150 hover:text-base-content/70"
                  onClick={() => changeSearch("")}
                  type="button"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">
        <div
          className="mx-auto w-full max-w-300 animate-in fade-in slide-in-from-bottom-1 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 duration-200"
          key={tab}
        >
          {deleteErr && (
            <p className="mb-3 flex items-center gap-1.5 rounded-sm bg-error/5 px-3 py-2 text-xs text-error">
              <AlertCircle className="shrink-0" size={14} />
              {deleteErr}
            </p>
          )}

          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-base-300 bg-base-100 py-16">
              <Loader2
                className="animate-spin text-base-content/50"
                size={20}
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
              <div className="flex flex-col items-center py-16 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-base-200">
                  <BookOpen className="text-base-content/50" size={20} />
                </div>
                <p className="text-sm font-semibold text-base-content">
                  No pages found
                </p>
                <p className="mt-1 text-xs text-base-content/70">
                  {search
                    ? "Try a different search term"
                    : "Create your first page to get started"}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {/* Table header */}
              <div
                className="grid items-center border-b border-base-300 bg-base-200/30 px-5 py-2.5"
                style={{
                  gridTemplateColumns: "28px 1fr 200px 130px 130px 90px",
                }}
              >
                <label
                  className={`flex items-center justify-center ${selectingAll ? "cursor-wait" : "cursor-pointer"}`}
                >
                  <input
                    checked={allSelected}
                    className="sr-only"
                    disabled={selectingAll}
                    onChange={() => toggleSelectAll()}
                    onClick={(e) => e.stopPropagation()}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = someSelected;
                      }
                    }}
                    type="checkbox"
                  />
                  <span
                    className={`flex size-3.75 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                      allSelected
                        ? "border-primary bg-primary"
                        : someSelected
                          ? "border-primary bg-primary/20"
                          : "border-base-300 bg-base-200 hover:border-primary/50"
                    }`}
                  >
                    {selectingAll ? (
                      <Loader2
                        className="animate-spin text-base-content/70"
                        size={9}
                      />
                    ) : allSelected ? (
                      <Check className="text-white" size={10} strokeWidth={3} />
                    ) : someSelected ? (
                      <span className="block h-0.5 w-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                </label>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Page name
                </span>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Created by
                </span>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Last edited
                </span>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Created
                </span>
                <span />
              </div>

              {/* Rows */}
              <div
                className={`divide-y divide-base-300 transition-opacity duration-150 ${loading ? "opacity-60" : ""}`}
              >
                {displayRows.map((page) => {
                  const isChecked = selectedIds.has(page.id);
                  return (
                    <div
                      className="group/row relative grid cursor-pointer items-center px-5 py-2.5 transition-colors duration-150 hover:bg-base-200"
                      key={page.id}
                      style={{
                        gridTemplateColumns: "28px 1fr 200px 130px 130px 90px",
                      }}
                    >
                      {/* The row's own action, as a real link stretched over the
                         whole row. Every interactive control below is positioned
                         (`relative`), so it paints above this overlay and keeps
                         its own click; the plain text cells are static and sit
                         beneath it, so clicking them still opens the page — the
                         same reach the old row-level onClick had, but now
                         keyboard-focusable and openable in a new tab. */}
                      <Link
                        aria-label={page.title || "Untitled"}
                        className="absolute inset-0"
                        href={`/app/${workspaceSlug}/${page.shortId}?from=library`}
                        prefetch={false}
                      />
                      {/* Row checkbox */}
                      <label className="relative z-10 flex cursor-pointer items-center justify-center">
                        <input
                          checked={isChecked}
                          className="sr-only"
                          onChange={() => toggleRow(page.id)}
                          type="checkbox"
                        />
                        <span
                          className={`flex size-3.75 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                            isChecked
                              ? "border-primary bg-primary"
                              : "border-base-300 bg-base-200 hover:border-primary/50"
                          }`}
                        >
                          {isChecked && (
                            <Check
                              className="text-white"
                              size={10}
                              strokeWidth={3}
                            />
                          )}
                        </span>
                      </label>

                      {/* Page name cell — intentionally unpositioned so the icon
                         and title text stay under the row link above. */}
                      <div
                        className="flex min-w-0 items-center gap-2.5 pr-4"
                        style={{ paddingLeft: page.depth * 22 }}
                      >
                        {page.hasChildren ? (
                          <button
                            className="relative z-10 flex size-4 shrink-0 items-center justify-center rounded-xs text-base-content/50 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(page.id);
                            }}
                            type="button"
                          >
                            {expandedIds.has(page.id) ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronRight size={12} />
                            )}
                          </button>
                        ) : page.depth > 0 ? (
                          <span className="size-4 shrink-0" />
                        ) : null}
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-base-300 bg-base-200">
                          <PageIcon icon={page.icon} kind={page.kind} />
                        </span>
                        <span
                          className={`min-w-0 flex-1 truncate text-sm text-base-content ${page.depth > 0 ? "font-normal" : "font-medium"}`}
                        >
                          {page.title || "Untitled"}
                        </span>
                        {/* Private toggle — same hover-reveal-when-off pattern as the favorite star */}
                        <div className="group/private relative z-10 shrink-0">
                          <button
                            className={`flex size-6 items-center justify-center rounded transition-all duration-150 ${
                              page.isPrivate
                                ? "text-base-content/70 hover:text-base-content"
                                : "text-base-content/50 opacity-0 group-hover/row:opacity-100 hover:text-base-content"
                            }`}
                            onClick={() => togglePrivate(page)}
                            type="button"
                          >
                            {page.isPrivate ? (
                              <EyeOff size={12} />
                            ) : (
                              <Eye size={12} />
                            )}
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-2.5 py-1.5 opacity-0 transition-opacity duration-150 group-hover/private:opacity-100">
                            <p className="text-xs font-semibold text-base-content">
                              {page.isPrivate
                                ? "Private — only you and invited people can access"
                                : "Make private"}
                            </p>
                          </div>
                        </div>

                        {/* Lock toggle — same hover-reveal-when-off pattern as the favorite star */}
                        <div className="group/locked relative z-10 shrink-0">
                          <button
                            className={`flex size-6 items-center justify-center rounded transition-all duration-150 ${
                              page.isLocked
                                ? "text-warning/70 hover:text-warning"
                                : "text-base-content/50 opacity-0 group-hover/row:opacity-100 hover:text-base-content"
                            }`}
                            onClick={() => toggleLocked(page)}
                            type="button"
                          >
                            <Lock size={12} />
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-2.5 py-1.5 opacity-0 transition-opacity duration-150 group-hover/locked:opacity-100">
                            <p className="text-xs font-semibold text-base-content">
                              {page.isLocked
                                ? "Locked — editing disabled"
                                : "Lock page"}
                            </p>
                          </div>
                        </div>

                        {/* Favorite button with tooltip */}
                        <div className="group/fav relative z-10 shrink-0">
                          <button
                            className={`flex size-6 items-center justify-center rounded transition-all duration-150 ${
                              page.isFavorited
                                ? "text-warning"
                                : "text-base-content/50 opacity-0 group-hover/row:opacity-100 hover:text-warning"
                            }`}
                            onClick={() => toggleFavorite(page.id)}
                            type="button"
                          >
                            <Star
                              fill={page.isFavorited ? "currentColor" : "none"}
                              size={13}
                            />
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-2.5 py-1.5 opacity-0 transition-opacity duration-150 group-hover/fav:opacity-100">
                            <p className="text-xs font-semibold text-base-content">
                              {page.isFavorited
                                ? "Remove from favorites"
                                : "Add to favorites"}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Created by */}
                      <span className="pr-4 text-xs text-base-content/70">
                        {page.creatorName}
                      </span>

                      {/* Last edited */}
                      <span className="pr-4 text-xs text-base-content/70">
                        <TimeAgo iso={page.updatedAt} />
                      </span>

                      {/* Created */}
                      <span className="pr-2 text-xs text-base-content/70">
                        <TimeAgo iso={page.createdAt} />
                      </span>

                      {/* Row actions */}
                      <span className="relative z-10 flex justify-end">
                        <PagePrivacyProvider initialIsPrivate={page.isPrivate}>
                          <PageActionsMenu
                            iconOnly
                            isDeleted={false}
                            isLocked={page.isLocked}
                            onDeleted={() => {
                              setRows((prev) =>
                                prev.filter((p) => p.id !== page.id)
                              );
                              setSelectedIds((prev) => {
                                if (!prev.has(page.id)) {
                                  return prev;
                                }
                                const next = new Set(prev);
                                next.delete(page.id);
                                return next;
                              });
                              window.dispatchEvent(
                                new CustomEvent("pages:refresh")
                              );
                              refetch(); // reconcile totals/tab counts and refill this page
                            }}
                            onDuplicated={() => {
                              refetch();
                              window.dispatchEvent(
                                new CustomEvent("pages:refresh")
                              );
                            }}
                            pageId={page.id}
                            pageKind={page.kind}
                            pageShortId={page.shortId}
                            pageTitle={page.title}
                            parentShortId={page.parentShortId}
                            workspaceId={workspaceId}
                            workspaceSlug={workspaceSlug}
                          />
                        </PagePrivacyProvider>
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Footer: rows per page · go to page · prev/numbered/next */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 px-5 py-3">
                <div className="flex items-center gap-1.5 text-xs text-base-content/70">
                  <span>Rows per page</span>
                  <div className="relative flex items-center">
                    <input
                      // w-16, not w-12: pl-2 + pr-5 eats 28px of the box, so a
                      // 3-digit value like "100" was clipped at the old width.
                      className="w-16 rounded-sm border border-base-300 bg-base-100 py-1 pl-2 pr-5 text-xs text-base-content focus:border-primary/50 focus:outline-none"
                      inputMode="numeric"
                      onBlur={submitPageSizeInput}
                      onChange={(e) =>
                        setPageSizeInput(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          changePageSize(pageSize + 5);
                          return;
                        }
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          changePageSize(pageSize - 5);
                          return;
                        }
                      }}
                      type="text"
                      value={pageSizeInput}
                    />
                    <div className="absolute right-1 flex flex-col">
                      <button
                        aria-label="Increase rows per page"
                        className="flex h-3 items-center text-base-content/50 hover:text-base-content"
                        onClick={() => changePageSize(pageSize + 5)}
                        onMouseDown={(e) => e.preventDefault()}
                        type="button"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        aria-label="Decrease rows per page"
                        className="flex h-3 items-center text-base-content/50 hover:text-base-content"
                        onClick={() => changePageSize(pageSize - 5)}
                        onMouseDown={(e) => e.preventDefault()}
                        type="button"
                      >
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-base-content/70">
                  <span>Go to page</span>
                  <input
                    className="w-20 rounded-sm border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content placeholder:text-base-content/50 focus:border-primary/50 focus:outline-none"
                    inputMode="numeric"
                    // Digits only. This mirrors the rows-per-page input above
                    // rather than using type="number", which still accepts
                    // "e"/"+"/"-" and mutates on scroll-wheel. Without the
                    // filter this field accepted arbitrary text.
                    onChange={(e) =>
                      setGoToPageInput(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        submitGoToPage();
                      }
                    }}
                    pattern="[0-9]*"
                    placeholder={`1–${totalPages}`}
                    type="text"
                    value={goToPageInput}
                  />
                  <button
                    className="rounded-sm border border-base-300 px-2.5 py-1 text-xs font-semibold text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:opacity-40"
                    disabled={!goToPageInput}
                    onClick={() => submitGoToPage()}
                    type="button"
                  >
                    GO
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:pointer-events-none disabled:opacity-40"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                    type="button"
                  >
                    <ChevronLeft size={12} />
                    Previous
                  </button>

                  {getPageNumbers(currentPage, totalPages).map((p, i) =>
                    p === "…" ? (
                      <span
                        className="px-1 text-xs text-base-content/50"
                        // biome-ignore lint/suspicious/noArrayIndexKey: ellipsis gaps have no identity of their own — their slot in the pagination strip is what distinguishes the leading from the trailing one. Numbered pages next to them key on the page number.
                        key={`ellipsis-${i}`}
                      >
                        …
                      </span>
                    ) : (
                      <button
                        className={`flex size-6 items-center justify-center rounded-sm border text-xs font-medium transition-colors duration-150 ${
                          p === currentPage
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-transparent text-base-content/70 hover:bg-base-200 hover:text-base-content"
                        }`}
                        key={p}
                        onClick={() => goToPage(p)}
                        type="button"
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:pointer-events-none disabled:opacity-40"
                    disabled={currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                    type="button"
                  >
                    Next
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Move to Trash"
        confirmLoadingLabel="Moving…"
        description="They will be moved to Trash and permanently deleted after 30 days."
        loading={deletingSelected}
        onConfirm={handleDeleteSelected}
        onOpenChange={(o) => !o && setConfirmDeleteSelected(false)}
        open={confirmDeleteSelected}
        title={`Move ${selectedIds.size} page${selectedIds.size === 1 ? "" : "s"} to Trash?`}
      />
    </div>
  );
}
