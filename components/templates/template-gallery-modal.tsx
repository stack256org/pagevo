"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, LayoutGrid, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { optionStyle } from "@/components/database/option-colors";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resolveCategoryIcon } from "@/lib/orbit/category-icons";

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
    database_schema?: {
      properties: DbProp[];
      views: DbView[];
      sample_rows?: Record<string, string | number>[];
    } | null;
  };
};

type TemplateCategory = {
  id: string;
  key: string;
  label: string;
  icon?: string | null;
  orderIndex: number;
};

// Uses the icon the admin picked for each category; categories created
// before the icon column existed fall back to the old positional cycle
// (see resolveCategoryIcon).

const DEFAULT_COLOR = { badge: "bg-base-200 text-base-content/70" };

/* Option colours resolve through optionStyle() in components/database/
   option-colors.ts — the same map the template board view uses, so the two
   cannot drift and both get dark-theme variants for free. */

interface Props {
  initialCategory?: string;
  onClose: () => void;
  parentId?: string | null;
  workspaceId: string;
  workspaceSlug: string;
}

export function TemplateGalleryModal({
  workspaceId,
  workspaceSlug,
  parentId,
  initialCategory,
  onClose,
}: Props) {
  const router = useRouter();
  const [builtIn, setBuiltIn] = useState<Template[]>([]);
  const [workspace, setWorkspace] = useState<Template[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>(initialCategory ?? "all");
  const [step, setStep] = useState<"gallery" | "detail">("gallery");
  const [selected, setSelected] = useState<Template | null>(null);
  const [applying, setApplying] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/templates").then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/workspaces/${workspaceId}/templates`).then((r) =>
        r.ok ? r.json() : []
      ),
      fetch("/api/templates/categories").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([bi, ws, cats]) => {
        setBuiltIn(Array.isArray(bi) ? bi : []);
        setWorkspace(Array.isArray(ws) ? ws : []);
        setCategories(Array.isArray(cats) ? cats : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    setTimeout(() => searchRef.current?.focus(), 80);
  }, [workspaceId]);

  const catIconById = new Map(
    categories.map((c, i) => [c.id, resolveCategoryIcon(c.icon, i)])
  );
  const catLabelById = new Map(categories.map((c) => [c.id, c.label]));

  const q = search.toLowerCase().trim();
  const matches = (t: Template) =>
    (!q ||
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)) &&
    (activeTab === "all" || t.categoryId === activeTab);

  const filteredBuiltIn = builtIn.filter(matches);
  const filteredWorkspace = workspace.filter(matches);
  const total = builtIn.length + workspace.length;

  function countForTab(key: string) {
    if (key === "all") {
      return total;
    }
    return [...builtIn, ...workspace].filter((t) => t.categoryId === key)
      .length;
  }

  function handleSelectTemplate(tpl: Template) {
    setSelected(tpl);
    setStep("detail");
  }

  function handleBack() {
    setStep("gallery");
    setSelected(null);
  }

  async function applyTemplate(tpl: Template) {
    setApplying(true);
    try {
      const res = await fetch(`/api/templates/${tpl.id}/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, parentId: parentId ?? null }),
      });
      if (res.ok) {
        const data = (await res.json()) as { shortId: string; kind: string };
        onClose();
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        // Database templates open in the template view; regular pages open normally
        if (data.kind === "database") {
          router.push(`/app/${workspaceSlug}/t/${data.shortId}`);
        } else {
          router.push(`/app/${workspaceSlug}/${data.shortId}`);
        }
      }
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
      open
    >
      <DialogContent
        className="flex h-[88vh] w-full max-w-245 gap-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 p-0 ring-0 backdrop:bg-black/50"
        showCloseButton={false}
      >
        {/* ── GALLERY STEP ── */}
        {step === "gallery" && (
          <>
            {/* Left sidebar */}
            <div className="flex w-56 shrink-0 flex-col border-r border-base-300 bg-base-200/30">
              <div className="px-5 pb-3 pt-5">
                <h2 className="text-base font-bold tracking-tight text-base-content">
                  Templates
                </h2>
                <p className="mt-0.5 text-xs text-base-content/70">
                  Pick a starting point
                </p>
              </div>

              <nav className="flex-1 overflow-y-auto px-2 pb-3">
                {[
                  { key: "all", label: "All Templates", Icon: LayoutGrid },
                  ...categories.map((c, i) => ({
                    key: c.id,
                    label: c.label,
                    Icon: resolveCategoryIcon(c.icon, i),
                  })),
                ].map((cat) => {
                  const cnt = countForTab(cat.key);
                  const isActive = activeTab === cat.key;
                  const CatIcon = cat.Icon;
                  return (
                    <button
                      className={[
                        "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left transition-colors duration-150",
                        isActive
                          ? "bg-base-200 text-base-content font-medium"
                          : "text-base-content/70 hover:bg-base-200 hover:text-base-content",
                      ].join(" ")}
                      key={cat.key}
                      onClick={() => setActiveTab(cat.key)}
                      type="button"
                    >
                      <CatIcon
                        className={`shrink-0 ${isActive ? "text-primary" : ""}`}
                        size={14}
                      />
                      <span className="flex-1 text-xs font-medium">
                        {cat.label}
                      </span>
                      {cnt > 0 && (
                        <span className="rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-base-content/70">
                          {cnt}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Main content */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Search */}
              <div className="border-b border-base-300 px-5 py-3">
                <div className="flex items-center gap-2.5 rounded-md border border-base-300 bg-base-200/40 px-3.5 py-2.5">
                  <Search className="shrink-0 text-base-content/70" size={15} />
                  <input
                    className="flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/50"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates…"
                    ref={searchRef}
                    type="text"
                    value={search}
                  />
                  {search && (
                    <button
                      className="text-base-content/70 hover:text-base-content/70"
                      onClick={() => setSearch("")}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loading ? (
                  <LoadingSkeleton />
                ) : filteredBuiltIn.length === 0 &&
                  filteredWorkspace.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-6">
                    {filteredBuiltIn.length > 0 && (
                      <section>
                        <p className="mb-3 text-xs font-semibold tracking-wide text-base-content/70">
                          Pagevo Templates
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {filteredBuiltIn.map((tpl) => (
                            <TemplateCard
                              catIconById={catIconById}
                              catLabelById={catLabelById}
                              key={tpl.id}
                              onSelect={() => handleSelectTemplate(tpl)}
                              template={tpl}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {filteredWorkspace.length > 0 && (
                      <section>
                        <p className="mb-3 text-xs font-semibold tracking-wide text-base-content/70">
                          Workspace Templates
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          {filteredWorkspace.map((tpl) => (
                            <TemplateCard
                              catIconById={catIconById}
                              catLabelById={catLabelById}
                              key={tpl.id}
                              onSelect={() => handleSelectTemplate(tpl)}
                              template={tpl}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── DETAIL STEP ── */}
        {step === "detail" &&
          selected &&
          (() => {
            const catLabel = catLabelById.get(selected.categoryId);
            const CatIcon = catIconById.get(selected.categoryId) ?? LayoutGrid;
            const blocks = selected.pageSnapshot.blocks ?? [];

            return (
              <div className="flex h-full w-full">
                {/* Left panel */}
                <div className="flex w-75 shrink-0 flex-col border-r border-base-300 bg-base-200">
                  {/* Header */}
                  <div className="flex items-center gap-3 border-b border-base-300 px-4 py-3.5">
                    <button
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                      onClick={handleBack}
                      type="button"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-2xs font-semibold uppercase tracking-widest text-base-content/50">
                        Templates
                      </p>
                      <h3 className="truncate text-sm font-bold text-base-content leading-tight">
                        {selected.name}
                      </h3>
                    </div>
                  </div>

                  {/* Icon + name hero */}
                  <div className="flex items-center gap-3 border-b border-base-300 bg-base-200/20 px-4 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-base-300 bg-base-100 text-2xl">
                      {selected.pageSnapshot.icon || (
                        <CatIcon className="text-base-content/70" size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-base-content">
                        {selected.name}
                      </p>
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs font-medium border border-base-300 text-base-content/70 bg-base-200/30 mt-0.5">
                        <CatIcon size={9} />
                        {catLabel}
                      </span>
                    </div>
                  </div>

                  {/* Info + block list */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
                    {selected.description && (
                      <p className="text-xs leading-relaxed text-base-content/70">
                        {selected.description}
                      </p>
                    )}

                    {/* DB schema preview or block list */}
                    {selected.pageSnapshot.database_schema ? (
                      <DbSchemaPreview
                        schema={selected.pageSnapshot.database_schema}
                      />
                    ) : blocks.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2.5 text-2xs font-semibold uppercase tracking-widest text-base-content/50">
                          Included in this template
                        </p>
                        <div className="space-y-1 rounded-xl border border-base-300 bg-base-200/20 p-3">
                          {blocks.slice(0, 12).map((b, i) => (
                            <BlockPreview
                              block={b as { type: string; content?: unknown }}
                              // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored block list; the block shape has no id and the slice is never reordered or spliced, so position is the identity.
                              key={i}
                            />
                          ))}
                          {blocks.length > 12 && (
                            <p className="text-xs text-base-content/70">
                              + {blocks.length - 12} more blocks…
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Use template CTA */}
                  <div className="border-t border-base-300 px-4 py-4">
                    <button
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
                      disabled={applying}
                      onClick={() => applyTemplate(selected)}
                      type="button"
                    >
                      {applying ? (
                        <>
                          <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Creating page…
                        </>
                      ) : (
                        <>
                          Use template
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                    <p className="mt-2 text-center text-[11px] text-base-content/70">
                      Creates an independent copy
                    </p>
                  </div>
                </div>

                {/* Right panel — page preview fills full height */}
                <div className="flex flex-1 flex-col overflow-hidden bg-base-200/30">
                  <div className="flex flex-1 flex-col overflow-hidden p-4">
                    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-base-300 bg-base-200">
                      {/* Cover strip with overlapping icon */}
                      <div className="relative flex h-20 shrink-0 items-end bg-linear-to-r from-primary/10 via-base-200/30 to-base-200/10 px-8 pb-0">
                        {selected.pageSnapshot.icon ? (
                          <span className="translate-y-5.5 text-[40px] leading-none">
                            {selected.pageSnapshot.icon}
                          </span>
                        ) : (
                          <CatIcon
                            className="translate-y-5.5 text-base-content/50"
                            size={34}
                          />
                        )}
                      </div>

                      {/* Page content — flex stretch for db views, scroll for page blocks */}
                      <div
                        className={`flex flex-col px-8 pt-10 pb-8 ${selected.pageSnapshot.database_schema ? "min-h-0 flex-1 overflow-hidden" : "flex-1 overflow-y-auto"}`}
                      >
                        <h1 className="mb-1 shrink-0 text-xl font-bold text-base-content">
                          {selected.pageSnapshot.title || selected.name}
                        </h1>
                        {selected.description && (
                          <p className="mb-4 shrink-0 text-sm text-base-content/70">
                            {selected.description}
                          </p>
                        )}
                        {selected.pageSnapshot.database_schema ? (
                          <DatabasePreview
                            schema={selected.pageSnapshot.database_schema}
                          />
                        ) : (
                          <div className="space-y-2">
                            {blocks.slice(0, 16).map((b, i) => (
                              <PageBlockPreview
                                block={b as { type: string; content?: unknown }}
                                // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored block list; the block shape has no id and the slice is never reordered or spliced, so position is the identity.
                                key={i}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Close button */}
        <button
          className="absolute right-3 top-3 z-10 flex size-7 items-center justify-center rounded-sm border border-base-300 bg-base-200 text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
          onClick={onClose}
          type="button"
        >
          <X size={14} />
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onSelect,
  catIconById,
  catLabelById,
}: {
  template: Template;
  onSelect: () => void;
  catIconById: Map<string, LucideIcon>;
  catLabelById: Map<string, string>;
}) {
  const colors = DEFAULT_COLOR;
  const catLabel = catLabelById.get(template.categoryId);
  const CatIcon = catIconById.get(template.categoryId) ?? LayoutGrid;

  return (
    <button
      className="group flex flex-col overflow-hidden rounded-md border border-base-300 bg-base-100 text-left transition-colors duration-150 hover:border-base-300 hover:bg-base-200/20"
      onClick={onSelect}
      type="button"
    >
      {/* Mini document preview */}
      <div className="relative h-22.5 overflow-hidden border-b border-base-300 bg-base-200/20 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          {template.pageSnapshot.icon ? (
            <span className="shrink-0 text-sm leading-none">
              {template.pageSnapshot.icon}
            </span>
          ) : (
            <div className="flex size-4 shrink-0 items-center justify-center rounded-xs bg-base-200">
              <CatIcon className="text-base-content/70" size={9} />
            </div>
          )}
          <div className="h-1.5 w-16 rounded-xs bg-base-content/15" />
        </div>
        <div className="space-y-1">
          <div className="h-1 w-4/5 rounded-xs bg-base-content/15" />
          <div className="h-1 w-3/5 rounded-xs bg-base-content/12" />
          <div className="h-px bg-base-300 my-0.5" />
          <div className="flex items-center gap-1">
            <div className="size-1 rounded-full bg-base-content/25" />
            <div className="h-1 w-1/2 rounded-xs bg-base-content/12" />
          </div>
          <div className="flex items-center gap-1">
            <div className="size-1 rounded-full bg-base-content/25" />
            <div className="h-1 w-2/3 rounded-xs bg-base-content/10" />
          </div>
        </div>
      </div>

      {/* Text */}
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xs font-semibold leading-snug text-base-content">
          {template.name}
        </p>
        {template.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-base-content/70">
            {template.description}
          </p>
        )}
        <div className="mt-2">
          <span
            className={`inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-[9.5px] font-semibold ${colors.badge}`}
          >
            <CatIcon size={9} />
            {catLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Block preview (compact, for left panel list) ───────────────────────────────

const BLOCK_ICONS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  paragraph: "¶",
  bullet: "•",
  numbered: "#",
  todo: "☐",
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

function BlockPreview({
  block,
}: {
  block: { type: string; content?: unknown };
}) {
  const icon = BLOCK_ICONS[block.type] ?? "·";
  const c = block.content as { text?: { text: string }[] } | null;
  const text = c?.text?.map((t) => t.text).join("") ?? "";
  return (
    <div className="flex items-start gap-2">
      <span className="mt-px w-5 shrink-0 text-center text-xs font-bold text-base-content/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-base-content/60">
        {text || (
          <span className="italic text-base-content/70">{block.type}</span>
        )}
      </span>
    </div>
  );
}

// ── Page block preview (right panel, looks like a real doc) ────────────────────

function PageBlockPreview({
  block,
}: {
  block: { type: string; content?: unknown };
}) {
  const c = block.content as { text?: { text: string }[] } | null;
  const text = c?.text?.map((t) => t.text).join("") ?? "";

  if (block.type === "divider") {
    return <hr className="border-base-300" />;
  }

  const classMap: Record<string, string> = {
    h1: "text-base font-bold text-base-content mt-3 first:mt-0",
    h2: "text-sm font-bold text-base-content mt-2.5 first:mt-0",
    h3: "text-sm font-semibold text-base-content mt-2",
    paragraph: "text-xs text-base-content/70 leading-relaxed",
    bullet:
      "text-xs text-base-content/70 leading-relaxed pl-3 before:content-['•'] before:mr-2 before:text-base-content/70",
    numbered: "text-xs text-base-content/70 leading-relaxed pl-3",
    todo: "text-xs text-base-content/70 leading-relaxed pl-3 line-through opacity-50",
    quote:
      "text-xs italic text-base-content/70 border-l-2 border-base-300 pl-3",
    code: "text-xs font-mono text-base-content bg-base-200 rounded px-1.5 py-0.5",
  };

  const cls = classMap[block.type] ?? "text-xs text-base-content/70";

  return <p className={cls}>{text || <span className="opacity-30">—</span>}</p>;
}

// ── DB schema preview (left panel — property list) ─────────────────────────────

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

function DbSchemaPreview({
  schema,
}: {
  schema: { properties: DbProp[]; views: DbView[] };
}) {
  return (
    <div className="mt-5 space-y-5">
      {/* Views */}
      <div>
        <p className="mb-2.5 text-2xs font-semibold uppercase tracking-widest text-base-content/50">
          Views
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.views.map((v) => (
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
                v.isDefault
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-base-300 bg-base-200/30 text-base-content/70",
              ].join(" ")}
              key={v.name}
            >
              {v.type === "board" ? "⊞" : v.type === "calendar" ? "📅" : "☰"}{" "}
              {v.name}
            </span>
          ))}
        </div>
      </div>

      {/* Properties */}
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
                  {p.options.slice(0, 2).map((o) => (
                    <span
                      className={`max-w-16 truncate rounded px-1.5 py-0.5 text-2xs font-medium ${optionStyle(o.color).badge}`}
                      key={o.name}
                    >
                      {o.name}
                    </span>
                  ))}
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

// ── Shared type + shared subcomponents ────────────────────────────────────────

type SchemaForPreview = {
  properties: DbProp[];
  views: DbView[];
  sample_rows?: Record<string, string | number>[];
};

function ViewTabs({
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
            "shrink-0 rounded px-2 py-0.5 text-xs font-medium transition-colors duration-150",
            v.name === activeName
              ? "bg-base-200 text-base-content font-semibold"
              : "text-base-content/70 hover:bg-base-200/50 hover:text-base-content",
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

// ── DB table preview ────────────────────────────────────────────────────────────

function DbTablePreview({
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
        p.type !== "created_by" &&
        p.type !== "created_time" &&
        p.type !== "last_edited_by" &&
        p.type !== "last_edited_time"
    )
    .slice(0, 5);
  const rows = schema.sample_rows ?? [];

  return (
    <div className="mt-3">
      <ViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      {/* Table */}
      <div className="overflow-hidden rounded-sm border border-base-300">
        {/* Header */}
        <div className="flex border-b border-base-300 bg-base-200/30">
          {visibleProps.map((p) => (
            <div
              className="flex-1 min-w-0 px-2 py-1.5 text-[9.5px] font-semibold text-base-content/70 truncate"
              key={p.name}
            >
              <span className="mr-1 opacity-50">
                {PROP_TYPE_ICON[p.type] ?? "·"}
              </span>
              {p.name}
            </div>
          ))}
        </div>
        {/* Sample rows */}
        {rows.slice(0, 3).map((row, ri) => (
          <div
            className="flex border-b border-base-300 last:border-0 hover:bg-base-200/20"
            // biome-ignore lint/suspicious/noArrayIndexKey: read-only preview of a template's authored sample_rows — never reordered or spliced, and the rows carry no id, so row order is their only identity.
            key={ri}
          >
            {visibleProps.map((p) => {
              const val = row[p.name];
              const opt = p.options?.find((o) => o.name === val);
              return (
                <div
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs text-base-content/80"
                  key={p.name}
                >
                  {opt ? (
                    <span
                      className={`rounded-xs px-1.5 py-0.5 text-[9.5px] font-medium ${optionStyle(opt.color).badge}`}
                    >
                      {val}
                    </span>
                  ) : val === undefined ? (
                    <span className="text-base-content/70">—</span>
                  ) : (
                    <span className="truncate block">{String(val)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-3 text-center text-xs text-base-content/70">
            No sample data
          </div>
        )}
      </div>
    </div>
  );
}

// ── Board (kanban) preview ─────────────────────────────────────────────────────

function BoardPreview({
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
      <ViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      {/* Board grid — columns divide the full height */}
      <div className="mt-3 flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden rounded-lg border border-base-300 bg-base-200">
        {columns.map((col, ci) => {
          const colRows = groupByProp
            ? rows.filter((r) => r[groupByProp.name] === col.name)
            : [];
          const clr = optionStyle(col.color);
          return (
            <div
              className={`flex min-w-37 flex-1 flex-col ${ci < columns.length - 1 ? "border-r border-base-300" : ""}`}
              key={col.name}
            >
              {/* Column header */}
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
              {/* Cards — grow to fill column height */}
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
                          className={`mt-1.5 inline-flex rounded px-1.5 py-0.5 text-2xs font-medium ${optionStyle(tagOpt.color).badge}`}
                        >
                          {tagVal}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* + New — pinned to column bottom */}
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

// ── Calendar preview ───────────────────────────────────────────────────────────

const CAL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL_WEEKS = [
  [1, 2, 3, 4, 5, 6, 7],
  [8, 9, 10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19, 20, 21],
  [22, 23, 24, 25, 26, 27, 28],
  [29, 30, 0, 0, 0, 0, 0],
];

function CalendarPreview({
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
      <ViewTabs
        activeName={activeViewName}
        onSelect={onSelectView}
        views={schema.views}
      />
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-base-300">
        <div className="flex shrink-0 items-center justify-between border-b border-base-300 bg-base-200/20 px-3 py-1.5">
          <span className="text-xs font-semibold text-base-content/70">
            June 2026
          </span>
          <div className="flex gap-2 text-xs text-base-content/70">
            <span>‹</span>
            <span>›</span>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-7 border-b border-base-300 bg-base-200/10">
          {CAL_DAYS.map((d) => (
            <div
              className="py-1 text-center text-[8.5px] font-semibold text-base-content/70"
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
                          : "text-xs text-base-content/70"
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

// ── DatabasePreview — picks the right view type ────────────────────────────────

function DatabasePreview({ schema }: { schema: SchemaForPreview }) {
  const defaultView = schema.views.find((v) => v.isDefault) ?? schema.views[0];
  const [activeViewName, setActiveViewName] = useState(defaultView?.name ?? "");

  // Reset back to the default view whenever a different template's schema
  // is passed in — otherwise switching templates in the gallery could leave
  // this on a tab name that doesn't exist in the new template's views.
  // Done during render (React's documented "adjust state on prop change"
  // pattern) rather than in an effect: the trigger is `schema`'s identity, not
  // any value read inside, and this way the stale tab never gets painted.
  const [lastSchema, setLastSchema] = useState(schema);
  if (schema !== lastSchema) {
    setLastSchema(schema);
    setActiveViewName(defaultView?.name ?? "");
  }

  const activeView =
    schema.views.find((v) => v.name === activeViewName) ?? defaultView;

  const props = { schema, activeViewName, onSelectView: setActiveViewName };
  if (activeView?.type === "board") {
    return <BoardPreview {...props} />;
  }
  if (activeView?.type === "calendar") {
    return <CalendarPreview {...props} />;
  }
  return <DbTablePreview {...props} />;
}

// ── States ────────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          className="overflow-hidden rounded-md border border-base-300"
          key={i}
        >
          <div className="h-19 animate-pulse bg-base-200/60" />
          <div className="space-y-1.5 bg-base-200 p-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-base-200" />
            <div className="h-2.5 w-full animate-pulse rounded bg-base-200/60" />
          </div>
        </div>
      ))}
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-14 items-center justify-center rounded-lg bg-base-200/50">
        <LayoutGrid className="text-base-content/70" size={28} />
      </div>
      <div>
        <p className="text-sm font-semibold text-base-content">
          No templates yet
        </p>
        <p className="mt-1 text-xs text-base-content/70">
          An admin can add templates from Orbit Admin.
        </p>
      </div>
    </div>
  );
}
