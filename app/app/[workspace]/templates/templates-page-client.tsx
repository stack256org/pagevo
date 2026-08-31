"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  LayoutGrid,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  blockText,
  MINI_WIDTHS,
  MiniPageContent,
} from "@/components/editor/mini-page-content";
import { PageIcon } from "@/components/pages/page-icon";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { resolveCategoryIcon } from "@/lib/orbit/category-icons";

// ── Types ──────────────────────────────────────────────────────────────────────

type DbProp = {
  name: string;
  type: string;
  options?: { name: string; color: string }[];
  multiple?: boolean;
};
type DbView = {
  name: string;
  type: string;
  isDefault?: boolean;
  groupBy?: string;
};
type SchemaForPreview = {
  properties: DbProp[];
  views: DbView[];
  sample_rows?: Record<string, string | number>[];
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  isBuiltIn: boolean;
  workspaceId: string | null;
  createdBy: string | null;
  pageSnapshot: {
    title: string;
    icon: string | null;
    blocks: { type: string; content?: unknown }[];
    database_schema?: SchemaForPreview | null;
  };
};

type TemplateCategoryRow = {
  id: string;
  key: string;
  label: string;
  icon?: string | null;
  orderIndex: number;
};

// Uses the icon the admin picked when creating the category. Categories that
// predate the icon column have none stored and fall back to the old
// positional cycle (see resolveCategoryIcon).
function iconForCategory(
  categories: TemplateCategoryRow[],
  categoryId: string
): LucideIcon {
  const idx = categories.findIndex((c) => c.id === categoryId);
  return idx === -1
    ? LayoutGrid
    : resolveCategoryIcon(categories[idx]?.icon, idx);
}

function labelForCategory(
  categories: TemplateCategoryRow[],
  categoryId: string
): string | undefined {
  return categories.find((c) => c.id === categoryId)?.label;
}

const OPTION_COLORS: Record<string, { dot: string; badge: string }> = {
  gray: {
    dot: "bg-base-content/40",
    badge: "bg-base-200 text-base-content/70",
  },
  red: {
    dot: "bg-error/50",
    badge: "bg-error/10 text-error",
  },
  orange: { dot: "bg-warning/50", badge: "bg-warning/10 text-warning" },
  yellow: { dot: "bg-warning/40", badge: "bg-warning/10 text-warning" },
  green: { dot: "bg-success/50", badge: "bg-success/10 text-success" },
  teal: { dot: "bg-success/40", badge: "bg-success/10 text-success" },
  blue: { dot: "bg-primary/50", badge: "bg-primary/10 text-primary" },
  purple: { dot: "bg-primary/40", badge: "bg-primary/10 text-primary/80" },
  pink: {
    dot: "bg-error/40",
    badge: "bg-error/10 text-error/80",
  },
};
const DEFAULT_OPT = {
  dot: "bg-base-content/40",
  badge: "bg-base-200 text-base-content/70",
};

const PROP_TYPE_ICON: Record<string, string> = {
  title: "Aa",
  text: "Aa",
  number: "#",
  select: "≡",
  multi_select: "≡",
  date: "📅",
  checkbox: "☐",
  url: "🔗",
  email: "✉",
  phone: "☎",
  person: "👤",
  relation: "↗",
  created_by: "👤",
  created_time: "🕐",
  last_edited_by: "👤",
  last_edited_time: "🕐",
};

const BLOCK_ICONS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  paragraph: "¶",
  bullet: "•",
  numbered: "#",
  todo: "☐",
  toggle: "▸",
  quote: "❝",
  callout: "💡",
  divider: "—",
  table: "⊞",
  code: "</>",
  pdf: "📕",
  embed: "🌐",
  bookmark: "🔖",
  breadcrumb: "»",
  synced_block: "🔄",
  sub_page: "📄",
};

const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL_WEEKS = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 0, 0, 0, 0, 0],
];

interface Props {
  currentUserId: string;
  isPlatformAdmin: boolean;
  isWorkspaceAdmin: boolean;
  parentId?: string | null;
  workspaceId: string;
  workspaceSlug: string;
}

// ── Main page component ────────────────────────────────────────────────────────

export function TemplatesPageClient({
  workspaceId,
  workspaceSlug,
  parentId,
  isPlatformAdmin,
  currentUserId,
  isWorkspaceAdmin,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  const [builtIn, setBuiltIn] = useState<Template[]>([]);
  const [workspace, setWorkspace] = useState<Template[]>([]);
  const [categories, setCategories] = useState<TemplateCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const refetchTemplates = useCallback(
    () =>
      Promise.all([
        fetch("/api/templates").then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/workspaces/${workspaceId}/templates`).then((r) =>
          r.ok ? r.json() : []
        ),
        fetch("/api/templates/categories").then((r) => (r.ok ? r.json() : [])),
      ]).then(([bi, ws, cats]) => {
        setBuiltIn(Array.isArray(bi) ? bi : []);
        setWorkspace(Array.isArray(ws) ? ws : []);
        setCategories(Array.isArray(cats) ? cats : []);
      }),
    [workspaceId]
  );

  useEffect(() => {
    refetchTemplates().finally(() => setLoading(false));
  }, [refetchTemplates]);

  // Deep-link support: ?open=<name> (home page quick-start chips) or ?openId=<id>
  // (global search, since names aren't guaranteed unique) opens a template's preview directly.
  useEffect(() => {
    const openId = searchParams.get("openId");
    const openName = searchParams.get("open");
    if (!openId && !openName) {
      return;
    }
    if (builtIn.length === 0 && workspace.length === 0) {
      return;
    }
    const all = [...builtIn, ...workspace];
    const match = openId
      ? all.find((t) => t.id === openId)
      : all.find((t) => t.name.toLowerCase() === openName!.toLowerCase());
    if (match) {
      setPreviewTemplate(match);
    }
    router.replace(`/app/${workspaceSlug}/templates`, { scroll: false });
    // `searchParams` is safe to depend on: the `router.replace` below strips
    // both params, so the re-run it triggers hits the early return above.
  }, [builtIn, workspace, searchParams, router, workspaceSlug]);

  const q = search.toLowerCase().trim();
  const matches = (t: Template) =>
    (!q ||
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)) &&
    (activeTab === "all" || t.categoryId === activeTab);

  const filteredBuiltIn = builtIn.filter(matches);
  const filteredWorkspace = workspace.filter(matches);

  function countForTab(key: string) {
    if (key === "all") {
      return builtIn.length + workspace.length;
    }
    return [...builtIn, ...workspace].filter((t) => t.categoryId === key)
      .length;
  }

  async function deleteTemplate(tpl: Template) {
    setDeleteError("");
    // Optimistic remove
    setWorkspace((prev) => prev.filter((t) => t.id !== tpl.id));
    const res = await fetch(
      `/api/workspaces/${workspaceId}/templates/${tpl.id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      // rollback
      setWorkspace((prev) => [...prev, tpl]);
      setDeleteError(
        `Couldn't delete "${tpl.name}" — only its creator or a workspace admin can delete it.`
      );
    }
  }

  async function applyTemplate(tpl: Template) {
    if (applyingId) {
      return; // already creating a page from another card — ignore
    }
    setApplyingId(tpl.id);
    try {
      const res = await fetch(`/api/templates/${tpl.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, parentId: parentId ?? null }),
      });
      if (res.ok) {
        const data = (await res.json()) as { shortId: string; kind: string };
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        if (data.kind === "database") {
          router.push(`/app/${workspaceSlug}/t/${data.shortId}`);
        } else {
          router.push(`/app/${workspaceSlug}/${data.shortId}`);
        }
      }
    } finally {
      setApplyingId(null);
    }
  }

  function handleCategoryClick(key: string) {
    setActiveTab(key);
  }

  return (
    <div className="@container flex h-full flex-col overflow-hidden bg-base-100">
      {/* ── Page header — h-11 matches sidebar top row and all other topbars ── */}
      <div className="flex h-11 shrink-0 items-center border-b border-base-300 bg-base-100 px-3">
        <nav className="flex min-w-0 items-center gap-0.5 text-xs">
          <span className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-base-content/70">
            <LayoutGrid className="shrink-0" size={13} />
            <span className="font-medium text-base-content">Templates</span>
          </span>
          <span className="text-base-content/50">·</span>
          <span className="truncate px-1 text-base-content/70">
            Pick a starting point for your next page or database
          </span>
        </nav>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col @[768px]:flex-row">
        {/* ── Category filter panel — stacks above the grid on small screens,
            sits to the left on @md+ (container-query, since this page sits
            next to the app's own resizable sidebar — a viewport breakpoint
            can't tell how much width that leaves us, only a container one can) ── */}
        <aside className="flex w-full shrink-0 flex-col border-b border-base-300 bg-base-200 @[768px]:w-65 @[768px]:border-b-0 @[768px]:border-r">
          {/* Header — shows active category count */}
          <div className="border-b border-base-300 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
              Categories
            </p>
            <div className="mt-1.5 flex items-end gap-1.5">
              <span className="text-2xl font-black leading-none text-base-content">
                {countForTab(activeTab)}
              </span>
              <span className="mb-0.5 text-sm font-medium text-base-content/70">
                {activeTab === "all"
                  ? "templates"
                  : labelForCategory(categories, activeTab)?.toLowerCase()}
              </span>
            </div>
          </div>

          {/* Filter items */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {/* "All" — full-width prominent card */}
            {(() => {
              const allCnt = countForTab("all");
              const allActive = activeTab === "all";
              return (
                <button
                  className={`group mb-3 flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all duration-150 ${
                    allActive
                      ? "border-primary/25 bg-primary/10 text-primary"
                      : "border-base-300 bg-base-100 text-base-content hover:border-primary/20 hover:bg-primary/5 hover:text-primary"
                  }`}
                  onClick={() => handleCategoryClick("all")}
                  type="button"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
                      allActive
                        ? "bg-primary/15 text-primary"
                        : "bg-base-200 text-base-content/70 group-hover:bg-primary/10 group-hover:text-primary"
                    }`}
                  >
                    <LayoutGrid size={15} />
                  </span>
                  <span
                    className={`flex-1 text-sm ${allActive ? "font-semibold" : "font-medium"}`}
                  >
                    All templates
                  </span>
                  <span
                    className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-bold tabular-nums transition-colors duration-150 ${
                      allActive
                        ? "bg-primary/15 text-primary"
                        : "bg-base-200 text-base-content/70 group-hover:bg-primary/10 group-hover:text-primary"
                    }`}
                  >
                    {allCnt}
                  </span>
                </button>
              );
            })()}

            {/* Divider with label */}
            <div className="mb-2.5 px-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/60">
                By type
              </p>
            </div>

            {/* Individual categories */}
            <div className="space-y-1">
              {categories.map((cat, i) => {
                const cnt = countForTab(cat.id);
                const isActive = activeTab === cat.id;
                const CatIcon = resolveCategoryIcon(cat.icon, i);
                return (
                  <button
                    className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all duration-150 ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    }`}
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.id)}
                    type="button"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-sm transition-colors duration-150 ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-base-200/70 text-base-content/70 group-hover:bg-primary/10 group-hover:text-base-content"
                      }`}
                    >
                      <CatIcon size={12} />
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${isActive ? "font-semibold" : "font-medium"}`}
                    >
                      {cat.label}
                    </span>
                    {cnt > 0 && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-150 ${
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-base-200 text-base-content/70"
                        }`}
                      >
                        {cnt}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Main panel ── */}
        <GalleryView
          activeTab={activeTab}
          applyingId={applyingId}
          categories={categories}
          currentUserId={currentUserId}
          deleteError={deleteError}
          filteredBuiltIn={filteredBuiltIn}
          filteredWorkspace={filteredWorkspace}
          isPlatformAdmin={isPlatformAdmin}
          isWorkspaceAdmin={isWorkspaceAdmin}
          loading={loading}
          onDeleteWorkspace={deleteTemplate}
          onPreview={setPreviewTemplate}
          onSearch={setSearch}
          onTemplatesSeeded={refetchTemplates}
          onUse={applyTemplate}
          search={search}
          searchRef={searchRef}
          totalBuiltInCount={builtIn.length}
        />
      </div>

      {/* ── Template preview modal ── */}
      {previewTemplate && (
        <TemplatePreviewModal
          applying={applyingId === previewTemplate.id}
          categories={categories}
          onApply={() => applyTemplate(previewTemplate)}
          onClose={() => setPreviewTemplate(null)}
          template={previewTemplate}
        />
      )}
    </div>
  );
}

// ── Gallery view ───────────────────────────────────────────────────────────────

function GalleryView({
  searchRef,
  search,
  onSearch,
  loading,
  filteredBuiltIn,
  filteredWorkspace,
  onUse,
  onPreview,
  applyingId,
  onDeleteWorkspace,
  activeTab,
  totalBuiltInCount,
  isPlatformAdmin,
  onTemplatesSeeded,
  currentUserId,
  isWorkspaceAdmin,
  deleteError,
  categories,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  search: string;
  onSearch: (v: string) => void;
  loading: boolean;
  filteredBuiltIn: Template[];
  filteredWorkspace: Template[];
  onUse: (t: Template) => void;
  onPreview: (t: Template) => void;
  applyingId: string | null;
  onDeleteWorkspace: (t: Template) => void;
  activeTab: string;
  totalBuiltInCount: number;
  isPlatformAdmin: boolean;
  onTemplatesSeeded: () => void;
  currentUserId: string;
  isWorkspaceAdmin: boolean;
  deleteError: string;
  categories: TemplateCategoryRow[];
}) {
  const empty = filteredBuiltIn.length === 0 && filteredWorkspace.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search bar */}
      <div className="shrink-0 border-b border-base-300 px-4 py-2.5 @[640px]:px-8 @[1024px]:px-20">
        <div className="flex items-center gap-2 rounded-md border border-base-300 bg-base-200/30 px-3 py-1.5 transition-colors focus-within:border-primary/40 focus-within:bg-base-100">
          <Search className="shrink-0 text-base-content/50" size={13} />
          <input
            className="flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/50"
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search templates…"
            ref={searchRef}
            type="text"
            value={search}
          />
          {search && (
            <button
              aria-label="Clear search"
              className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-primary/10 text-primary transition-colors duration-150 hover:bg-primary/20"
              onClick={() => onSearch("")}
              type="button"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-6 @[640px]:px-8 @[1024px]:px-20">
        {loading ? (
          <GallerySkeleton />
        ) : empty ? (
          <EmptyState
            hasActiveFilter={Boolean(search) || activeTab !== "all"}
            isPlatformAdmin={isPlatformAdmin}
            onSeeded={onTemplatesSeeded}
            totalBuiltInCount={totalBuiltInCount}
          />
        ) : (
          <div className="space-y-7">
            {filteredBuiltIn.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary/60">
                    Pagevo templates
                  </p>
                  <span className="rounded-xs bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {filteredBuiltIn.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2 @[1024px]:grid-cols-3 @[1280px]:grid-cols-4">
                  {filteredBuiltIn.map((tpl) => (
                    <TemplateCard
                      applying={applyingId === tpl.id}
                      categories={categories}
                      disabled={applyingId === tpl.id}
                      key={tpl.id}
                      onPreview={() => onPreview(tpl)}
                      onUse={() => onUse(tpl)}
                      template={tpl}
                    />
                  ))}
                </div>
              </section>
            )}
            {filteredWorkspace.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary/60">
                    Workspace templates
                  </p>
                  <span className="rounded-xs bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                    {filteredWorkspace.length}
                  </span>
                </div>
                {deleteError && (
                  <p className="mb-3 rounded-sm bg-error/10 px-3 py-2 text-xs text-error">
                    {deleteError}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2 @[1024px]:grid-cols-3 @[1280px]:grid-cols-4">
                  {filteredWorkspace.map((tpl) => {
                    const canDelete =
                      tpl.createdBy === currentUserId || isWorkspaceAdmin;
                    return (
                      <TemplateCard
                        applying={applyingId === tpl.id}
                        categories={categories}
                        disabled={applyingId === tpl.id}
                        key={tpl.id}
                        onDelete={
                          canDelete ? () => onDeleteWorkspace(tpl) : undefined
                        }
                        onPreview={() => onPreview(tpl)}
                        onUse={() => onUse(tpl)}
                        template={tpl}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onUse,
  onPreview,
  onDelete,
  applying,
  disabled,
  categories,
}: {
  template: Template;
  onUse: () => void;
  onPreview: () => void;
  onDelete?: () => void;
  applying: boolean;
  disabled: boolean;
  categories: TemplateCategoryRow[];
}) {
  const CatIcon = iconForCategory(categories, template.categoryId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  async function handleDelete() {
    setDeleting(true);
    await onDelete?.();
    setDeleting(false);
    setDeleteOpen(false);
  }

  return (
    <>
      <div
        className={`group relative flex flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 text-left transition-all duration-200 ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:-translate-y-0.5 hover:border-primary/30"
        }`}
      >
        <TemplateCardThumbnail categories={categories} template={template} />

        {/* The card's action, as a real button stretched over the card. Placed
           after the thumbnail (which is `relative`) so it paints above it; the
           info text below is static and also sits beneath it, so clicking the
           card body still opens the preview exactly as before. The action
           buttons and the delete button are positioned above it. */}
        <button
          aria-label={`Preview ${template.name}`}
          className="absolute inset-0"
          disabled={disabled}
          onClick={onPreview}
          type="button"
        />

        {/* Info */}
        <div className="flex flex-1 flex-col px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-base-content">
              {template.name}
            </p>
            <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-xs bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <CatIcon size={9} />
            </span>
          </div>
          {template.description && (
            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-base-content/70">
              {template.description}
            </p>
          )}

          {/* Actions — always visible; clicking the card body opens the same
              preview as "View Demo", clicking "Use Template" skips it. */}
          <div className="relative z-10 mt-2.5 flex items-center gap-1.5">
            <button
              className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  onUse();
                }
              }}
              type="button"
            >
              {applying ? (
                <>
                  <span className="size-3 animate-spin rounded-full border-2 border-primary-content/30 border-t-primary-content" />
                  Creating…
                </>
              ) : (
                "Use Template"
              )}
            </button>
            <button
              className="flex flex-1 items-center justify-center rounded-sm border border-primary/40 bg-primary/5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) {
                  onPreview();
                }
              }}
              type="button"
            >
              View Demo
            </button>
          </div>
        </div>

        {/* Delete button — only for workspace templates */}
        {onDelete && (
          <button
            className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-sm bg-base-200/80 text-base-content/70 opacity-0 backdrop-blur-sm transition-all duration-150 group-hover:opacity-100 hover:bg-error/10 hover:text-error"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
            onMouseEnter={(e) => showTooltip("Delete template", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-10000 flex items-center justify-center">
            <button
              aria-label="Close dialog"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setDeleteOpen(false)}
              type="button"
            />
            <div className="relative w-[calc(100vw-32px)] max-w-100 rounded-lg border border-base-300 bg-base-200 p-6">
              {/* Close */}
              <button
                className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                onClick={() => setDeleteOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>

              {/* Icon + title */}
              <div className="mb-4 flex items-start gap-3 pr-8">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-error/10">
                  <AlertTriangle className="text-error" size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-base-content">
                    Delete template
                  </h2>
                  <p className="mt-0.5 text-xs text-base-content/70">
                    Are you sure you want to delete{" "}
                    <span className="font-semibold text-base-content">
                      "{template.name}"
                    </span>
                    ? This cannot be undone.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  className="rounded-sm border border-base-300 px-4 py-1.5 text-sm font-medium text-base-content transition-colors hover:bg-base-200 disabled:opacity-50"
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-sm bg-error px-4 py-1.5 text-sm font-semibold text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
                  disabled={deleting}
                  onClick={handleDelete}
                  type="button"
                >
                  {deleting ? "Deleting…" : "Delete template"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}

// ── Template preview modal ──────────────────────────────────────────────────────
// Full-fidelity look at a template's content — opened by "View Demo" or by
// clicking a card — with its own "Use template" CTA so a user who previews
// can commit right away without going back to the grid.

function TemplatePreviewModal({
  template,
  applying,
  onApply,
  onClose,
  categories,
}: {
  template: Template;
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
  categories: TemplateCategoryRow[];
}) {
  const catLabel = labelForCategory(categories, template.categoryId);
  const CatIcon = iconForCategory(categories, template.categoryId);
  const blocks = template.pageSnapshot.blocks ?? [];
  const schema = template.pageSnapshot.database_schema;
  const [closeTooltipRect, setCloseTooltipRect] = useState<DOMRect | null>(
    null
  );

  // Shared between the left panel's "Views" pills and the right preview
  // panel's tabs so they always show the same selected view, not two
  // independently-tracked (and easily-inconsistent) states.
  const [activeViewName, setActiveViewName] = useState(() => {
    const dv = schema?.views.find((v) => v.isDefault) ?? schema?.views[0];
    return dv?.name ?? "";
  });

  // Reset back to the default view whenever a different template is
  // previewed — otherwise switching templates could leave this on a tab
  // name that doesn't exist in the new template's views.
  useEffect(() => {
    const dv = schema?.views.find((v) => v.isDefault) ?? schema?.views[0];
    setActiveViewName(dv?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-600 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <div className="relative flex h-[min(640px,88vh)] w-[min(880px,92vw)] overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-2xl">
        <button
          className="absolute right-3 top-3 z-20 flex size-8 items-center justify-center rounded-full border border-base-300 bg-base-200/90 text-base-content/70 shadow-sm backdrop-blur-sm transition-colors hover:bg-base-200 hover:text-base-content"
          onClick={onClose}
          onMouseEnter={(e) =>
            setCloseTooltipRect(
              (e.currentTarget as HTMLElement).getBoundingClientRect()
            )
          }
          onMouseLeave={() => setCloseTooltipRect(null)}
          type="button"
        >
          <X size={16} />
        </button>
        {closeTooltipRect &&
          createPortal(
            <IconTooltip label="Close" rect={closeTooltipRect} />,
            document.body
          )}

        {/* ── Left info panel ── */}
        <div className="flex w-75 shrink-0 flex-col overflow-hidden border-r border-base-300 bg-base-200">
          <div className="shrink-0 border-b border-base-300 bg-base-200/20 px-5 py-6">
            <div className="mb-4 flex size-14 items-center justify-center rounded-xl border border-base-300 bg-base-100">
              {template.pageSnapshot.icon ? (
                <PageIcon icon={template.pageSnapshot.icon} size={30} />
              ) : (
                <CatIcon className="text-base-content/70" size={26} />
              )}
            </div>
            <h2 className="pr-6 text-base font-bold leading-snug text-base-content">
              {template.name}
            </h2>
            {catLabel && (
              <div className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-200/40 px-2 py-0.5 text-2xs font-semibold text-base-content/70">
                  <CatIcon size={9} />
                  {catLabel}
                </span>
              </div>
            )}
            {template.description && (
              <p className="mt-3 text-xs leading-relaxed text-base-content/70">
                {template.description}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5">
            {schema ? (
              <PreviewDbSchemaList
                activeViewName={activeViewName}
                onSelectView={setActiveViewName}
                schema={schema}
              />
            ) : blocks.length > 0 ? (
              <div>
                <p className="mb-2.5 text-2xs font-semibold uppercase tracking-widest text-base-content/50">
                  Includes
                </p>
                <div className="space-y-0.5 rounded-xl border border-base-300 bg-base-200/20 p-3">
                  {blocks.slice(0, 12).map((b, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored block list; the block shape has no id and the slice is never reordered or spliced, so position is the identity.
                    <PreviewBlockRow block={b} key={i} />
                  ))}
                  {blocks.length > 12 && (
                    <p className="pt-1 text-xs text-base-content/50">
                      +{blocks.length - 12} more
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-base-300 bg-base-200 px-5 py-4">
            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-60"
              disabled={applying}
              onClick={onApply}
              type="button"
            >
              {applying ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating page…
                </>
              ) : (
                <>
                  Use template <ArrowRight size={13} />
                </>
              )}
            </button>
            <p className="mt-1.5 text-center text-2xs text-base-content/50">
              Creates an independent copy
            </p>
          </div>
        </div>

        {/* ── Right preview panel — looks like the real thing ── */}
        <div className="flex flex-1 flex-col overflow-hidden bg-base-200/30">
          <div className="flex flex-1 flex-col overflow-hidden p-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-base-300 bg-base-200">
              <div className="relative flex h-17.5 shrink-0 items-end bg-linear-to-r from-primary/10 via-base-200/30 to-base-200/10 px-8 pb-0">
                {template.pageSnapshot.icon ? (
                  <span className="translate-y-5">
                    <PageIcon icon={template.pageSnapshot.icon} size={36} />
                  </span>
                ) : (
                  <CatIcon
                    className="translate-y-5 text-base-content/50"
                    size={30}
                  />
                )}
              </div>
              <div
                className={`flex flex-col px-8 pt-9 pb-8 ${schema ? "min-h-0 flex-1 overflow-hidden" : "flex-1 overflow-y-auto"}`}
              >
                <h1 className="mb-1 shrink-0 text-lg font-bold text-base-content">
                  {template.pageSnapshot.title || template.name}
                </h1>
                {template.description && (
                  <p className="mb-4 shrink-0 text-sm text-base-content/70">
                    {template.description}
                  </p>
                )}
                {schema ? (
                  <PreviewDbContent
                    activeViewName={activeViewName}
                    onSelectView={setActiveViewName}
                    schema={schema}
                  />
                ) : (
                  <div className="space-y-2">
                    {blocks.slice(0, 16).map((b, i, arr) => (
                      <PreviewDocBlock
                        block={b}
                        // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored block list; the block shape has no id, and `ordinal` below is computed from this same index, so position is the identity by construction.
                        key={i}
                        ordinal={
                          b.type === "numbered"
                            ? numberedOrdinal(arr, i)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PreviewBlockRow({
  block,
}: {
  block: { type: string; content?: unknown };
}) {
  const text = blockText(block.content);
  const checked = (block.content as { checked?: boolean } | undefined)?.checked;
  const icon =
    block.type === "todo" && checked ? "☑" : (BLOCK_ICONS[block.type] ?? "·");
  return (
    <div className="flex items-start gap-2">
      <span className="mt-px w-5 shrink-0 text-center text-xs font-bold text-base-content/50">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-base-content/60">
        {text || (
          <span className="italic text-base-content/50">{block.type}</span>
        )}
      </span>
    </div>
  );
}

// Real numbered lists in the editor restart at 1 whenever interrupted by a
// non-numbered block — this walks backward from `index` to find how many
// consecutive "numbered" blocks precede (and include) it.
function numberedOrdinal(blocks: { type: string }[], index: number): number {
  let n = 0;
  for (let i = index; i >= 0 && blocks[i]?.type === "numbered"; i--) {
    n++;
  }
  return n;
}

// Mirrors the real editor's block styling (app/globals.css .ProseMirror
// rules) — primary-colored circular checkbox with a hand-drawn checkmark,
// solid-triangle toggle marker, primary bullet/number/quote accents — so a
// template preview looks like the actual page it creates, not a generic list.
function PreviewDocBlock({
  block,
  ordinal,
}: {
  block: { type: string; content?: unknown };
  ordinal?: number;
}) {
  const text = blockText(block.content);
  const checked = (block.content as { checked?: boolean } | undefined)?.checked;

  if (block.type === "divider") {
    return <div className="my-2 h-0.5 rounded-full bg-base-300" />;
  }

  if (block.type === "todo") {
    return (
      <div className="flex items-center gap-2 text-xs leading-relaxed">
        <span
          className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors ${
            checked ? "border-primary bg-primary" : "border-base-300"
          }`}
        >
          {checked && (
            <span className="mb-px h-1.25 w-0.75 rotate-45 border-b-2 border-r-2 border-primary-content" />
          )}
        </span>
        <span
          className={
            checked ? "text-base-content/70 line-through" : "text-base-content"
          }
        >
          {text || "—"}
        </span>
      </div>
    );
  }

  if (block.type === "toggle") {
    return (
      <div className="flex items-center gap-2 text-xs leading-relaxed text-base-content">
        <span className="size-0 shrink-0 border-y-4 border-l-[6px] border-y-transparent border-l-primary/50" />
        {text || "—"}
      </div>
    );
  }

  if (block.type === "bullet") {
    return (
      <div className="flex items-center gap-2 pl-1 text-xs leading-relaxed text-base-content">
        <span className="size-1.5 shrink-0 rounded-full bg-primary/45" />
        {text || "—"}
      </div>
    );
  }

  if (block.type === "numbered") {
    return (
      <div className="flex items-baseline gap-2 pl-1 text-xs leading-relaxed text-base-content">
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-primary">
          {ordinal ?? 1}.
        </span>
        {text || "—"}
      </div>
    );
  }

  if (block.type === "quote") {
    return (
      <p className="rounded-r-sm border-l-2 border-primary bg-primary/5 py-1.5 pl-3 text-xs italic text-base-content">
        {text || <span className="opacity-30">—</span>}
      </p>
    );
  }

  if (block.type === "callout") {
    return (
      <div className="rounded-md border border-primary/20 bg-primary/6 px-3 py-2 text-xs leading-relaxed text-base-content">
        {text || <span className="opacity-30">—</span>}
      </div>
    );
  }

  if (block.type === "code") {
    return (
      <pre className="overflow-x-auto rounded-md border border-base-300 bg-base-200 px-3 py-2 font-mono text-xs text-base-content">
        {text || "—"}
      </pre>
    );
  }

  const cls: Record<string, string> = {
    h1: "text-base font-bold text-base-content mt-3 first:mt-0",
    h2: "text-sm font-bold text-base-content mt-2 first:mt-0",
    h3: "text-sm font-semibold text-base-content mt-1.5",
    paragraph: "text-xs leading-relaxed text-base-content",
  };
  return (
    <p className={cls[block.type] ?? "text-xs text-base-content/50"}>
      {text || <span className="opacity-30">—</span>}
    </p>
  );
}

function PreviewDbSchemaList({
  schema,
  activeViewName,
  onSelectView,
}: {
  schema: SchemaForPreview;
  activeViewName: string;
  onSelectView: (name: string) => void;
}) {
  return (
    <div className="mt-5 space-y-5">
      <div>
        <p className="mb-2.5 text-2xs font-semibold uppercase tracking-widest text-base-content/50">
          Views
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.views.map((v) => (
            <button
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                v.name === activeViewName
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-base-300 bg-base-200/30 text-base-content/70 hover:bg-base-200 hover:text-base-content",
              ].join(" ")}
              key={v.name}
              onClick={() => onSelectView(v.name)}
              type="button"
            >
              {v.type === "board" ? "⊞" : v.type === "calendar" ? "📅" : "☰"}{" "}
              {v.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2.5 text-2xs font-semibold uppercase tracking-widest text-base-content/50">
          Properties ({schema.properties.length})
        </p>
        <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
          {schema.properties.map((p, i) => (
            <div
              className={`flex min-w-0 items-center gap-2.5 px-3.5 py-2.5 ${
                i < schema.properties.length - 1
                  ? "border-b border-base-300"
                  : ""
              }`}
              key={p.name}
            >
              <span className="w-5 shrink-0 text-center text-xs font-bold text-base-content/70">
                {PROP_TYPE_ICON[p.type] ?? "·"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-base-content/80">
                {p.name}
              </span>
              {p.options && p.options.length > 0 && (
                <div className="flex shrink-0 items-center gap-1">
                  {p.options.slice(0, 2).map((o) => {
                    const clr = OPTION_COLORS[o.color] ?? DEFAULT_OPT;
                    return (
                      <span
                        className={`max-w-16 truncate rounded px-1.5 py-0.5 text-2xs font-medium ${clr.badge}`}
                        key={o.name}
                      >
                        {o.name}
                      </span>
                    );
                  })}
                  {p.options.length > 2 && (
                    <span className="text-2xs text-base-content/70">
                      +{p.options.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewViewTabs({
  views,
  activeName,
  onSelect,
}: {
  views: DbView[];
  activeName: string;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b border-base-300 pb-2">
      {views.map((v) => (
        <button
          className={[
            "shrink-0 rounded-xs px-2 py-0.5 text-xs font-medium transition-colors duration-150",
            v.name === activeName
              ? "bg-base-200 text-base-content font-semibold"
              : "text-base-content/50 hover:bg-base-200/50 hover:text-base-content",
          ].join(" ")}
          key={v.name}
          onClick={() => onSelect(v.name)}
          type="button"
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}

function PreviewDbTable({
  schema,
  activeViewName,
  onSelectView,
}: {
  schema: SchemaForPreview;
  activeViewName: string;
  onSelectView: (name: string) => void;
}) {
  const visibleProps = schema.properties
    .filter(
      (p) =>
        ![
          "created_by",
          "created_time",
          "last_edited_by",
          "last_edited_time",
        ].includes(p.type)
    )
    .slice(0, 5);
  const rows = schema.sample_rows ?? [];

  return (
    <div className="mt-3">
      <PreviewViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      <div className="overflow-hidden rounded-sm border border-base-300">
        <div className="flex border-b border-base-300 bg-base-200/30">
          {visibleProps.map((p) => (
            <div
              className="min-w-0 flex-1 truncate px-2 py-1.5 text-[9.5px] font-semibold text-base-content/70"
              key={p.name}
            >
              <span className="mr-1 opacity-50">
                {PROP_TYPE_ICON[p.type] ?? "·"}
              </span>
              {p.name}
            </div>
          ))}
        </div>
        {rows.slice(0, 3).map((row, ri) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored sample_rows — never reordered or spliced, and the rows carry no id, so row order is their only identity.
          <div className="flex border-b border-base-300 last:border-0" key={ri}>
            {visibleProps.map((p) => {
              const val = row[p.name];
              const opt = p.options?.find((o) => o.name === val);
              return (
                <div
                  className="min-w-0 flex-1 px-2 py-1.5 text-xs text-base-content/80"
                  key={p.name}
                >
                  {opt ? (
                    <span
                      className={`rounded-xs px-1.5 py-0.5 text-[9.5px] font-medium ${(OPTION_COLORS[opt.color] ?? DEFAULT_OPT).badge}`}
                    >
                      {val}
                    </span>
                  ) : val === undefined ? (
                    <span className="text-base-content/50">—</span>
                  ) : (
                    <span className="block truncate">{String(val)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-3 text-center text-xs text-base-content/50">
            No sample data
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewDbBoard({
  schema,
  activeViewName,
  onSelectView,
}: {
  schema: SchemaForPreview;
  activeViewName: string;
  onSelectView: (name: string) => void;
}) {
  const activeView =
    schema.views.find((v) => v.name === activeViewName) ?? schema.views[0];
  const groupByName = activeView?.groupBy;
  const groupByProp =
    schema.properties.find((p) => p.name === groupByName) ??
    schema.properties.find((p) => p.type === "select");
  const titleProp = schema.properties.find((p) => p.type === "title");
  const tagProp = schema.properties.find(
    (p) => p.type === "select" && p !== groupByProp
  );
  const columns = (groupByProp?.options ?? []).slice(0, 5);
  const rows = schema.sample_rows ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PreviewViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      <div className="mt-3 flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg border border-base-300 bg-base-200">
        {columns.map((col, ci) => {
          const colRows = groupByProp
            ? rows.filter((r) => r[groupByProp.name] === col.name)
            : [];
          const clr = OPTION_COLORS[col.color] ?? DEFAULT_OPT;
          return (
            <div
              className={`flex min-w-37 flex-1 flex-col ${ci < columns.length - 1 ? "border-r border-base-300" : ""}`}
              key={col.name}
            >
              <div className="flex shrink-0 items-center gap-1.5 border-b border-base-300 bg-base-200/30 px-3 py-2.5">
                <span className={`size-1.5 shrink-0 rounded-full ${clr.dot}`} />
                <span className="flex-1 truncate text-[11px] font-semibold text-base-content/70">
                  {col.name}
                </span>
                {colRows.length > 0 && (
                  <span className="tabular-nums text-2xs text-base-content/50">
                    {colRows.length}
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-hidden p-2">
                {colRows.map((row, i) => {
                  const title = titleProp
                    ? String(row[titleProp.name] ?? "")
                    : "";
                  const tagVal = tagProp ? String(row[tagProp.name] ?? "") : "";
                  const tagOpt = tagProp?.options?.find(
                    (o) => o.name === tagVal
                  );
                  return (
                    <div
                      className="shrink-0 rounded-md border border-base-300 bg-base-100 p-2.5"
                      // biome-ignore lint/suspicious/noArrayIndexKey: read-only board preview built from a template's authored sample_rows — never reordered or spliced, and the rows carry no id.
                      key={i}
                    >
                      <p className="text-[11px] font-medium leading-snug text-base-content">
                        {title}
                      </p>
                      {tagOpt && (
                        <span
                          className={`mt-1.5 inline-flex rounded px-1.5 py-0.5 text-2xs font-medium ${(OPTION_COLORS[tagOpt.color] ?? DEFAULT_OPT).badge}`}
                        >
                          {tagVal}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="shrink-0 border-t border-base-300 px-3 py-2">
                <span className="text-2xs text-base-content/50">+ New</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PreviewDbCalendar({
  schema,
  activeViewName,
  onSelectView,
}: {
  schema: SchemaForPreview;
  activeViewName: string;
  onSelectView: (name: string) => void;
}) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <PreviewViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-base-300">
        <div className="flex shrink-0 items-center justify-between border-b border-base-300 bg-base-200/20 px-3 py-1.5">
          <span className="text-xs font-semibold text-base-content/70">
            June 2026
          </span>
          <div className="flex gap-2 text-xs text-base-content/50">
            <span>‹</span>
            <span>›</span>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-7 border-b border-base-300 bg-base-200/10">
          {CAL_DAYS.map((d) => (
            <div
              className="py-1 text-center text-[8.5px] font-semibold text-base-content/50"
              key={d}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {CAL_WEEKS.map((week, wi) => (
            <div
              className="grid flex-1 grid-cols-7 border-b border-base-300 last:border-0"
              // biome-ignore lint/suspicious/noArrayIndexKey: CAL_WEEKS is a module-level constant grid rendered as a static preview — the week's row position is its identity and the array can never reorder.
              key={wi}
            >
              {week.map((date, di) => (
                <div
                  className="border-r border-base-300 p-1 last:border-0"
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 7-column grid from the CAL_WEEKS constant; blank days are all 0, so the column position is the only identity available.
                  key={di}
                >
                  {date > 0 && (
                    <span
                      className={
                        date === 19
                          ? "flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-content"
                          : "text-xs text-base-content/50"
                      }
                    >
                      {date}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewDbContent({
  schema,
  activeViewName,
  onSelectView,
}: {
  schema: SchemaForPreview;
  activeViewName: string;
  onSelectView: (name: string) => void;
}) {
  const defaultView = schema.views.find((v) => v.isDefault) ?? schema.views[0];
  const activeView =
    schema.views.find((v) => v.name === activeViewName) ?? defaultView;

  const previewProps = { schema, activeViewName, onSelectView };
  if (activeView?.type === "board") {
    return <PreviewDbBoard {...previewProps} />;
  }
  if (activeView?.type === "calendar") {
    return <PreviewDbCalendar {...previewProps} />;
  }
  return <PreviewDbTable {...previewProps} />;
}

// ── Template card thumbnail ────────────────────────────────────────────────────

function TemplateCardThumbnail({
  template,
  categories,
}: {
  template: Template;
  categories: TemplateCategoryRow[];
}) {
  const icon = template.pageSnapshot.icon;
  const schema = template.pageSnapshot.database_schema;
  const blocks = template.pageSnapshot.blocks ?? [];
  const CatIcon = iconForCategory(categories, template.categoryId);

  return (
    <div className="relative h-36 overflow-hidden border-b border-base-300 bg-linear-to-b from-base-200/30 to-base-200/10">
      <div className="flex h-full flex-col justify-center p-3">
        {/* Icon indicator row */}
        <div className="mb-2.5 flex items-center gap-1.5">
          {icon ? (
            <PageIcon icon={icon} size={14} />
          ) : (
            <div className="flex size-4 shrink-0 items-center justify-center rounded-xs bg-base-200">
              <CatIcon className="text-base-content/70" size={9} />
            </div>
          )}
          <div className="h-1.5 w-20 rounded-xs bg-base-content/15" />
        </div>

        {/* Content preview */}
        {schema ? (
          <MiniDbContent schema={schema} />
        ) : (
          <MiniPageContent blocks={blocks} />
        )}
      </div>
    </div>
  );
}

// ── Mini database content ──────────────────────────────────────────────────────

function MiniDbContent({ schema }: { schema: SchemaForPreview }) {
  const defaultView = schema.views.find((v) => v.isDefault) ?? schema.views[0];
  if (defaultView?.type === "board") {
    return <MiniBoardContent schema={schema} />;
  }
  if (defaultView?.type === "calendar") {
    return <MiniCalContent />;
  }
  return <MiniTableContent schema={schema} />;
}

function MiniTableContent({ schema }: { schema: SchemaForPreview }) {
  const props = schema.properties
    .filter(
      (p) =>
        ![
          "created_by",
          "created_time",
          "last_edited_by",
          "last_edited_time",
          // Sample rows can't fake a real workspace member, so a "person"
          // column would always render blank — skip it in favor of a
          // column that actually has sample data.
          "person",
        ].includes(p.type)
    )
    .slice(0, 4);
  const rows = schema.sample_rows ?? [];

  return (
    <div className="overflow-hidden rounded-xs border border-base-300 text-[8px] leading-none">
      {/* Header row */}
      <div className="flex border-b border-base-300 bg-base-200/50">
        {props.map((p) => (
          <div
            className="min-w-0 flex-1 truncate px-1.5 py-1 font-semibold text-base-content/50"
            key={p.name}
          >
            {PROP_TYPE_ICON[p.type] ?? "·"} {p.name.slice(0, 5)}
          </div>
        ))}
      </div>
      {/* Data rows */}
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
      {Array.from({ length: 3 }).map((_, ri) => {
        const row = rows[ri];
        return (
          <div className="flex border-b border-base-300 last:border-0" key={ri}>
            {props.map((p, pi) => {
              const val = row?.[p.name];
              const opt = val ? p.options?.find((o) => o.name === val) : null;
              return (
                <div
                  className="min-w-0 flex-1 overflow-hidden px-1 py-1"
                  key={pi}
                >
                  {opt ? (
                    <span
                      className={`inline-block max-w-full truncate rounded-xs px-1 leading-2.5 ${(OPTION_COLORS[opt.color] ?? DEFAULT_OPT).badge}`}
                    >
                      {String(val).slice(0, 6)}
                    </span>
                  ) : val === undefined ? (
                    <div
                      className={`${MINI_WIDTHS[(ri * 4 + pi) % MINI_WIDTHS.length]} h-0.5 rounded-xs bg-base-content/15`}
                    />
                  ) : (
                    <span className="block truncate text-base-content/50">
                      {String(val).slice(0, 7)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
    </div>
  );
}

function MiniBoardContent({ schema }: { schema: SchemaForPreview }) {
  const groupProp = schema.properties.find((p) => p.type === "select");
  const titleProp = schema.properties.find((p) => p.type === "title");
  const cols = (groupProp?.options ?? []).slice(0, 3);
  const rows = schema.sample_rows ?? [];
  const fallback = [
    { name: "Todo", color: "gray" },
    { name: "In Progress", color: "blue" },
    { name: "Done", color: "green" },
  ] as { name: string; color: string }[];
  const displayCols = cols.length > 0 ? cols : fallback;

  return (
    <div className="flex gap-2">
      {displayCols.map((col, ci) => {
        const clr = OPTION_COLORS[col.color] ?? DEFAULT_OPT;
        const colRows = groupProp
          ? rows.filter((r) => r[groupProp.name] === col.name).slice(0, 2)
          : [];
        const cardCount =
          colRows.length > 0 ? colRows.length : ci === 0 ? 2 : ci === 1 ? 2 : 1;

        return (
          <div className="flex-1" key={col.name}>
            <div
              className={`mb-1.5 inline-flex items-center gap-0.5 rounded-xs px-1.5 py-px text-[7px] font-semibold ${clr.badge}`}
            >
              <div className={`size-1 rounded-full ${clr.dot}`} />
              <span className="truncate">{col.name.slice(0, 8)}</span>
            </div>
            <div className="space-y-1">
              {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
              {Array.from({ length: cardCount }).map((_, ki) => {
                const title = titleProp
                  ? colRows[ki]?.[titleProp.name]
                  : undefined;
                return (
                  <div
                    className="space-y-0.5 rounded-xs border border-base-300 bg-base-100 p-1.5"
                    key={ki}
                  >
                    {title === undefined ? (
                      <>
                        <div className="h-1 w-4/5 rounded-xs bg-base-content/18" />
                        <div className="h-1 w-3/5 rounded-xs bg-base-content/15" />
                      </>
                    ) : (
                      <div className="truncate text-[7px] leading-tight text-base-content/70">
                        {String(title)}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniCalContent() {
  const events = new Set([2, 7, 12, 18, 20]);
  return (
    <div className="overflow-hidden rounded-xs border border-base-300">
      <div className="grid grid-cols-7 border-b border-base-300 bg-base-200/30">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: hardcoded weekday header of a static thumbnail; the letters repeat ("T", "S"), so the column position is the only identity available.
          <div className="py-0.5 text-center" key={i}>
            <span className="text-[6.5px] font-semibold text-base-content/50">
              {d}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
        {Array.from({ length: 21 }).map((_, i) => (
          <div
            className="relative h-4 border-b border-r border-base-300 p-0.5 last:border-r-0"
            key={i}
          >
            {i === 14 ? (
              <div className="flex size-3 items-center justify-center rounded-full bg-primary">
                <span className="text-[5px] font-bold text-primary-content">
                  {i + 1}
                </span>
              </div>
            ) : (
              <>
                <span className="text-[5.5px] text-base-content/50">
                  {i + 1}
                </span>
                {events.has(i) && (
                  <div className="absolute bottom-0.5 left-0.5 right-0.5 h-0.5 rounded-full bg-primary/40" />
                )}
              </>
            )}
          </div>
        ))}
        {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
      </div>
    </div>
  );
}

// ── States ─────────────────────────────────────────────────────────────────────

function GallerySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2 @[1024px]:grid-cols-3 @[1280px]:grid-cols-4">
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          className="overflow-hidden rounded-md border border-base-300"
          key={i}
        >
          <div className="h-40 animate-pulse bg-base-200/60" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-base-200" />
            <div className="h-2.5 w-full animate-pulse rounded bg-base-200/60" />
          </div>
        </div>
      ))}
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
    </div>
  );
}

function EmptyState({
  hasActiveFilter,
  totalBuiltInCount,
  isPlatformAdmin,
  onSeeded,
}: {
  hasActiveFilter: boolean;
  totalBuiltInCount: number;
  isPlatformAdmin: boolean;
  onSeeded: () => void;
}) {
  const [seeding, setSeeding] = useState(false);

  // A search/category filter matching nothing is a different situation from
  // this instance genuinely having zero built-in templates seeded yet — the
  // two need different copy (and, for the zero-templates case, a real fix
  // rather than a suggestion to search differently).
  if (hasActiveFilter || totalBuiltInCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex size-12 items-center justify-center rounded-lg bg-base-200/50">
          <LayoutGrid className="text-base-content/50" size={22} />
        </div>
        <div>
          <p className="text-sm font-semibold text-base-content">
            No templates found
          </p>
          <p className="mt-1 text-xs text-base-content/70">
            Try a different search or category.
          </p>
        </div>
      </div>
    );
  }

  async function seedTemplates() {
    setSeeding(true);
    try {
      await fetch("/api/orbit/templates/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      onSeeded();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-base-200/50">
        <LayoutGrid className="text-base-content/50" size={22} />
      </div>
      <div>
        <p className="text-sm font-semibold text-base-content">
          No templates yet
        </p>
        <p className="mt-1 text-xs text-base-content/70">
          {isPlatformAdmin
            ? "This instance doesn't have any built-in templates seeded yet."
            : "Ask your instance admin to seed the built-in templates from Orbit Admin."}
        </p>
      </div>
      {isPlatformAdmin && (
        <button
          className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
          disabled={seeding}
          onClick={seedTemplates}
          type="button"
        >
          {seeding && <Loader2 className="size-3.5 animate-spin" />}
          {seeding ? "Seeding…" : "Seed default templates"}
        </button>
      )}
    </div>
  );
}
