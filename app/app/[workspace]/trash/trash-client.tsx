"use client";

import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PageIcon as SharedPageIcon } from "@/components/pages/page-icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_PAGE_SIZE,
  getPageNumbers,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/lib/ui/pagination";

type TrashedPage = {
  id: string;
  shortId: string;
  title: string;
  icon: string | null;
  kind: string;
  deletedAt: string | null;
  deletedByName: string;
};

function daysLeft(iso: string) {
  const deleted = new Date(iso).getTime();
  const remaining = 30 - Math.floor((Date.now() - deleted) / 86_400_000);
  return Math.max(0, remaining);
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {
    return "Just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PageIcon({ icon, kind }: { icon: string | null; kind: string }) {
  if (icon) {
    return <SharedPageIcon icon={icon} size={14} />;
  }
  if (kind === "database") {
    return (
      <svg
        className="size-4 shrink-0 text-base-content/50"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        viewBox="0 0 24 24"
      >
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <line x1="3" x2="21" y1="9" y2="9" />
        <line x1="3" x2="21" y1="15" y2="15" />
        <line x1="9" x2="9" y1="9" y2="21" />
      </svg>
    );
  }
  return <FileText className="shrink-0 text-base-content/50" size={16} />;
}

export function TrashClient({
  pages,
  workspaceSlug,
}: {
  pages: TrashedPage[];
  workspaceSlug: string;
}) {
  void workspaceSlug;
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrashedPage | null>(null);
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [restoringSelected, setRestoringSelected] = useState(false);
  const [localPages, setLocalPages] = useState(pages);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // Decoupled from `pageSize` so the field can be freely typed into (cleared,
  // mid-edit) without a controlled-input value snapping back on every
  // keystroke — only reconciled on blur/Enter/stepper click.
  const [pageSizeInput, setPageSizeInput] = useState(String(DEFAULT_PAGE_SIZE));
  const [currentPage, setCurrentPage] = useState(1);
  const [goToPageInput, setGoToPageInput] = useState("");

  const filtered = localPages.filter(
    (p) =>
      !search ||
      (p.title || "Untitled").toLowerCase().includes(search.toLowerCase())
  );

  function changeSearch(val: string) {
    setSearch(val);
    setCurrentPage(1);
  }

  function changePageSize(next: number) {
    const clamped = Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, next));
    setPageSize(clamped);
    setPageSizeInput(String(clamped));
    setCurrentPage(1);
  }

  function submitPageSizeInput() {
    const n = Number.parseInt(pageSizeInput, 10);
    changePageSize(Number.isFinite(n) ? n : pageSize);
  }

  function goToPage(p: number, totalPages: number) {
    setCurrentPage(Math.min(totalPages, Math.max(1, p)));
  }

  function submitGoToPage(totalPages: number) {
    const n = Number.parseInt(goToPageInput, 10);
    if (Number.isFinite(n)) {
      goToPage(n, totalPages);
    }
    setGoToPageInput("");
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  const someSelected = filtered.some((p) => selectedIds.has(p.id));
  const selectedCount = [...selectedIds].filter((id) =>
    localPages.some((p) => p.id === id)
  ).length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(localPages.map((p) => p.id)));
  }

  async function handleRestore(page: TrashedPage) {
    setRestoring(page.id);
    try {
      const res = await fetch(`/api/pages/${page.id}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        setLocalPages((prev) => prev.filter((p) => p.id !== page.id));
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(page.id);
          return n;
        });
        router.refresh();
      }
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete(page: TrashedPage) {
    setDeleting(page.id);
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
      if (res.ok) {
        setLocalPages((prev) => prev.filter((p) => p.id !== page.id));
        setSelectedIds((prev) => {
          const n = new Set(prev);
          n.delete(page.id);
          return n;
        });
      }
    } finally {
      setDeleting(null);
    }
  }

  async function handleRestoreSelected() {
    setRestoringSelected(true);
    const ids = [...selectedIds];
    try {
      // One transactional request, not N concurrent ones — concurrent POSTs raced,
      // with a child restoring before its parent and detaching to the workspace root.
      const res = await fetch("/api/pages/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(d.error ?? "Couldn't restore the selected pages.");
        return;
      }
      const data = (await res.json()) as { restored?: number };
      setLocalPages((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelectedIds(new Set());
      toast.success(
        data.restored && data.restored > ids.length
          ? `Restored ${ids.length} item${ids.length === 1 ? "" : "s"} (with ${data.restored - ids.length} nested page${data.restored - ids.length === 1 ? "" : "s"}).`
          : `Restored ${data.restored ?? ids.length} item${(data.restored ?? ids.length) === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch {
      toast.error("Couldn't restore the selected pages.");
    } finally {
      setRestoringSelected(false);
    }
  }

  async function handleDeleteSelected() {
    setDeletingSelected(true);
    setConfirmDeleteSelected(false);
    const ids = [...selectedIds];
    try {
      // Bounded concurrency + per-request status checks. The previous
      // Promise.all fired every request at once and treated any response —
      // including 4xx/5xx — as success, so failures silently vanished from the
      // UI while the rows were still in the Trash.
      const failed: string[] = [];
      const CHUNK = 10;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const results = await Promise.all(
          slice.map((id) =>
            fetch(`/api/pages/${id}`, { method: "DELETE" })
              .then((r) => (r.ok ? null : id))
              .catch(() => id)
          )
        );
        failed.push(...results.filter((r): r is string => r !== null));
      }
      const okIds = ids.filter((id) => !failed.includes(id));
      setLocalPages((prev) => prev.filter((p) => !okIds.includes(p.id)));
      setSelectedIds(new Set());
      if (failed.length > 0) {
        toast.error(
          `Deleted ${okIds.length}, but ${failed.length} couldn't be deleted.`
        );
      } else {
        toast.success(
          `Permanently deleted ${okIds.length} item${okIds.length === 1 ? "" : "s"}.`
        );
      }
      router.refresh();
    } finally {
      setDeletingSelected(false);
    }
  }

  const busy =
    deletingSelected || restoringSelected || !!restoring || !!deleting;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Topbar ── */}
      <div className="shrink-0 bg-base-100">
        <div className="mx-auto flex w-full max-w-275 items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-base-200">
              <Trash2 className="text-base-content/70" size={15} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-base-content">
                Trash
              </h1>
              <p className="text-xs text-base-content/70">
                {localPages.length > 0
                  ? `${localPages.length} page${localPages.length === 1 ? "" : "s"} — permanently deleted after 30 days`
                  : "Deleted pages are permanently removed after 30 days"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Delete selected — shown only when rows are checked */}
            {selectedCount > 0 && (
              <>
                <button
                  className="flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-base-content/70 transition-colors hover:text-base-content disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setSelectedIds(new Set())}
                  type="button"
                >
                  <X size={12} />
                  Clear
                </button>
                <button
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
                  disabled={busy}
                  onClick={handleRestoreSelected}
                  type="button"
                >
                  {restoringSelected ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      Restoring…
                    </>
                  ) : (
                    <>
                      <RotateCcw size={12} />
                      Restore selected ({selectedCount})
                    </>
                  )}
                </button>
                <button
                  className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border border-error/40 bg-error/8 px-3 text-xs font-medium text-error transition-colors hover:border-error/70 hover:bg-error/15 disabled:opacity-50"
                  disabled={busy}
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
                      Delete selected ({selectedCount})
                    </>
                  )}
                </button>
              </>
            )}

            {/* Delete all — selects all rows */}
            {localPages.length > 0 && selectedCount === 0 && (
              <button
                className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border border-error/30 bg-error/5 px-3 text-xs font-medium text-error transition-colors hover:border-error/60 hover:bg-error/10 disabled:opacity-50"
                disabled={busy}
                onClick={handleSelectAll}
                type="button"
              >
                <Trash2 size={12} />
                Delete all
              </button>
            )}

            {/* Search */}
            <div className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-200 px-3 py-1.5 transition-colors duration-150 focus-within:border-base-300">
              <Search className="shrink-0 text-base-content/70" size={13} />
              <input
                className="w-44 bg-transparent text-xs text-base-content placeholder:text-base-content/50 focus:outline-none"
                onChange={(e) => changeSearch(e.target.value)}
                placeholder="Search trash…"
                type="text"
                value={search}
              />
              {search && (
                <button
                  className="text-base-content/50 transition-colors hover:text-base-content"
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

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto py-6">
        <div className="mx-auto w-full max-w-275 px-4 sm:px-6 lg:px-8">
          {/* Empty state */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-base-300 bg-base-100 py-20 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-base-200">
                <Trash2 className="text-base-content/50" size={20} />
              </div>
              <p className="text-sm font-semibold text-base-content">
                {search ? "No pages match" : "Trash is empty"}
              </p>
              <p className="mt-1 text-xs text-base-content/70">
                {search
                  ? `No results for "${search}"`
                  : "Deleted pages will appear here for 30 days"}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {/* Table header */}
              <div className="grid grid-cols-[36px_1fr_160px_120px_200px] items-center border-b border-base-300 bg-base-200/30 px-5 py-2.5">
                {/* Select-all checkbox */}
                <div className="flex items-center">
                  <label className="flex cursor-pointer items-center justify-center">
                    <input
                      checked={allSelected}
                      className="sr-only"
                      onChange={toggleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = someSelected && !allSelected;
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
                      {allSelected && (
                        <Check
                          className="text-white"
                          size={10}
                          strokeWidth={3}
                        />
                      )}
                      {someSelected && !allSelected && (
                        <span className="block h-0.5 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                  </label>
                </div>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Page name
                </span>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Deleted by
                </span>
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Deleted
                </span>
                <span className="text-right text-xs font-semibold tracking-wide text-base-content/70">
                  Actions
                </span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-base-300">
                {visibleRows.map((page) => {
                  const left = page.deletedAt ? daysLeft(page.deletedAt) : 30;
                  const urgent = left <= 7;
                  const isChecked = selectedIds.has(page.id);
                  return (
                    <div
                      className="grid grid-cols-[36px_1fr_160px_120px_200px] items-center px-5 py-3.5 transition-colors duration-150 hover:bg-base-200"
                      key={page.id}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center">
                        <label className="relative flex size-5 cursor-pointer items-center justify-center">
                          <input
                            checked={isChecked}
                            className="sr-only"
                            onChange={() => toggleRow(page.id)}
                            onClick={(e) => e.stopPropagation()}
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
                      </div>

                      {/* Name */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="shrink-0 opacity-60">
                          <PageIcon icon={page.icon} kind={page.kind} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-base-content">
                            {page.title || "Untitled"}
                          </p>
                          <p
                            className={`text-xs ${urgent ? "font-medium text-error" : "text-base-content/70"}`}
                          >
                            {urgent
                              ? left === 0
                                ? "Deletes today"
                                : `Deletes in ${left}d`
                              : `Deletes in ${left} days`}
                          </p>
                        </div>
                      </div>

                      {/* Deleted by */}
                      <span className="truncate text-xs text-base-content/70">
                        {page.deletedByName}
                      </span>

                      {/* Deleted at */}
                      <span className="text-xs text-base-content/70">
                        {page.deletedAt ? timeAgo(page.deletedAt) : "—"}
                      </span>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center justify-end gap-2">
                        <button
                          className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-3 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
                          disabled={busy}
                          onClick={() => handleRestore(page)}
                          type="button"
                        >
                          {restoring === page.id ? (
                            <>
                              <Loader2 className="animate-spin" size={12} />
                              Restoring…
                            </>
                          ) : (
                            <>
                              <RotateCcw size={12} />
                              Restore
                            </>
                          )}
                        </button>

                        <button
                          className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-sm border border-base-300 bg-base-100 px-3 text-xs font-medium text-error transition-colors hover:border-error/40 hover:bg-error/5 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => setConfirmDelete(page)}
                          type="button"
                        >
                          {deleting === page.id ? (
                            "Deleting…"
                          ) : (
                            <>
                              <Trash2 size={12} />
                              Delete permanently
                            </>
                          )}
                        </button>
                      </div>
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
                      // Digits only — this accepted arbitrary text before.
                      onChange={(e) =>
                        setPageSizeInput(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      pattern="[0-9]*"
                      type="text"
                      value={pageSizeInput}
                    />
                    <div className="absolute right-1 flex flex-col">
                      <button
                        aria-label="Increase rows per page"
                        className="flex h-2.5 items-center text-base-content/50 hover:text-base-content"
                        onClick={() => changePageSize(pageSize + 5)}
                        type="button"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        aria-label="Decrease rows per page"
                        className="flex h-2.5 items-center text-base-content/50 hover:text-base-content"
                        onClick={() => changePageSize(pageSize - 5)}
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
                    // Digits only. Mirrors the rows-per-page input rather than
                    // using type="number", which still accepts "e"/"+"/"-" and
                    // mutates on scroll-wheel.
                    onChange={(e) =>
                      setGoToPageInput(e.target.value.replace(/[^0-9]/g, ""))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        submitGoToPage(totalPages);
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
                    onClick={() => submitGoToPage(totalPages)}
                    type="button"
                  >
                    GO
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:pointer-events-none disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1, totalPages)}
                    type="button"
                  >
                    <ChevronLeft size={12} />
                    Previous
                  </button>

                  {getPageNumbers(page, totalPages).map((p, i) =>
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
                          p === page
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-transparent text-base-content/70 hover:bg-base-200 hover:text-base-content"
                        }`}
                        key={p}
                        onClick={() => goToPage(p, totalPages)}
                        type="button"
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:pointer-events-none disabled:opacity-40"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1, totalPages)}
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

      {/* Delete selected confirmation */}
      <AlertDialog
        onOpenChange={(o) => !o && setConfirmDeleteSelected(false)}
        open={confirmDeleteSelected}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} selected item
              {selectedCount === 1 ? "" : "s"} permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These pages will be permanently deleted and cannot be recovered.
              All content, comments, and history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>
              Delete {selectedCount} permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single-page delete confirmation */}
      <AlertDialog
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        open={!!confirmDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <span className="flex items-center gap-2 mb-2 p-2.5 rounded-sm border border-base-300 bg-base-200/30">
                  <span className="shrink-0 opacity-50">
                    <PageIcon
                      icon={confirmDelete.icon}
                      kind={confirmDelete.kind}
                    />
                  </span>
                  <span className="font-medium text-base-content">
                    {confirmDelete.title || "Untitled"}
                  </span>
                </span>
              )}
              This page will be permanently deleted and cannot be recovered. All
              content, comments, and history will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
