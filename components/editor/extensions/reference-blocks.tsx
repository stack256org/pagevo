import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import type { NodeViewProps } from "@tiptap/react";
import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Check, ChevronDown, FileText } from "lucide-react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { MiniPageContent } from "@/components/editor/mini-page-content";
import { PageIcon } from "@/components/pages/page-icon";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

const DatabasePage = dynamic(
  () =>
    import("@/components/database/database-page").then((m) => m.DatabasePage),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 animate-pulse rounded-md bg-base-200/30" />
    ),
  }
);

import katex from "katex";

// ── Block type options ────────────────────────────────────────────────────────
const BLOCK_TYPE_OPTIONS = [
  { value: "paragraph", label: "Paragraph" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "todo", label: "To-do" },
  { value: "bullet", label: "Bullet" },
] as const;

function BlockTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const label =
    BLOCK_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? "Paragraph";

  return (
    <Listbox onChange={onChange} value={value}>
      <div className="relative w-30 shrink-0">
        <ListboxButton className="group flex w-full items-center justify-between rounded-sm border border-base-300 bg-base-200 px-2.5 py-1.5 text-xs text-base-content outline-none transition-colors hover:border-base-300 data-open:border-primary data-open:ring-2 data-open:ring-primary/20">
          <span>{label}</span>
          <ChevronDown
            className="shrink-0 text-base-content/70 transition-transform group-data-open:rotate-180"
            size={10}
          />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: "bottom start", gap: 4 }}
          className="z-200 min-w-30 overflow-hidden rounded-md border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
          modal={false}
          transition
        >
          {BLOCK_TYPE_OPTIONS.map((opt) => (
            <ListboxOption
              className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-xs text-base-content transition-colors data-focus:bg-base-200 data-selected:font-semibold"
              key={opt.value}
              value={opt.value}
            >
              {({ selected }) => (
                <>
                  {selected ? (
                    <Check className="text-primary" size={12} />
                  ) : (
                    <span className="w-3" />
                  )}
                  {opt.label}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

// ── Linked Page ────────────────────────────────────────────────────────────────
// Matches Notion's "Link to page": search-as-you-type over the workspace's
// pages, pick one, and it renders as a small icon+title card that navigates
// to the target — no raw pageId/URL ever shown to the user.

interface LinkedPageOptions {
  workspaceId: string;
  workspaceSlug: string;
}

interface PageSearchResult {
  breadcrumb: string;
  icon: string | null;
  pageId: string;
  title: string;
}

function LinkedPageView({
  node,
  updateAttributes,
  deleteNode,
  extension,
}: NodeViewProps) {
  const pageId = (node.attrs.pageId as string) || "";
  const { workspaceId, workspaceSlug } = extension.options as LinkedPageOptions;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PageSearchResult[]>([]);
  const [isRecent, setIsRecent] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [resolved, setResolved] = useState<{
    title: string;
    icon: string | null;
    shortId: string;
  } | null>(null);
  const [loading, setLoading] = useState(!!pageId);

  // Resolve the linked pageId to its live title/icon/shortId for display.
  useEffect(() => {
    if (!pageId) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pages/${pageId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          page: {
            title: string | null;
            icon: string | null;
            shortId: string;
          } | null
        ) => {
          if (cancelled || !page) {
            return;
          }
          setResolved({
            title: page.title || "Untitled",
            icon: page.icon,
            shortId: page.shortId,
          });
        }
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Resolved once above — without this, renaming the linked page elsewhere
  // leaves this mention showing its old title for as long as it stays mounted.
  useEffect(() => {
    function onTitleChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          pageId: string;
          title?: string;
          icon?: string | null;
        }>
      ).detail;
      if (!detail || detail.pageId !== pageId) {
        return;
      }
      setResolved(
        (prev) =>
          prev && {
            ...prev,
            title:
              detail.title === undefined
                ? prev.title
                : detail.title || "Untitled",
            icon: detail.icon === undefined ? prev.icon : detail.icon,
          }
      );
    }
    window.addEventListener("pagevo:page-title-changed", onTitleChanged);
    return () =>
      window.removeEventListener("pagevo:page-title-changed", onTitleChanged);
  }, [pageId]);

  // Live search-as-you-type while not yet linked — falls back to recently
  // visited pages when the search box is empty, same as Notion's picker.
  useEffect(() => {
    if (pageId || !workspaceId) {
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      const url = query.trim()
        ? `/api/search?q=${encodeURIComponent(query)}&workspaceId=${workspaceId}&type=page&limit=8`
        : `/api/user/recently-visited?workspaceId=${workspaceId}`;

      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) {
            return;
          }
          if (query.trim()) {
            setIsRecent(false);
            setResults(
              (data.results ?? []).map((r: PageSearchResult) => ({
                pageId: r.pageId,
                title: r.title,
                icon: r.icon,
                breadcrumb: r.breadcrumb,
              }))
            );
          } else {
            setIsRecent(true);
            type RecentRow = {
              pageId: string;
              page: { title: string | null; icon: string | null };
            };
            setResults(
              (data as RecentRow[]).map((r) => ({
                pageId: r.pageId,
                title: r.page.title || "Untitled",
                icon: r.page.icon,
                breadcrumb: "",
              }))
            );
          }
          setSelectedIndex(0);
        })
        .catch(() => {});
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, pageId, workspaceId]);

  function selectPage(result: PageSearchResult) {
    updateAttributes({ pageId: result.pageId });
  }

  // Nothing was picked yet, so this node is just an unresolved placeholder —
  // clicking (or opening any other panel, e.g. Comments) outside it, or
  // pressing Escape, cancels it instead of leaving its search dropdown
  // floating on top of everything else with no way to dismiss it.
  useEffect(() => {
    if (pageId) {
      return;
    }
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as globalThis.Node)) {
        deleteNode();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pageId, deleteNode]);

  if (!pageId) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <div className="relative my-1" ref={wrapperRef}>
          <div className="flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-2 py-1.5">
            <span className="font-semibold text-primary">↗</span>
            <input
              autoFocus
              className="flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/70"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.min(results.length - 1, i + 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  const picked = results[selectedIndex];
                  if (picked) {
                    selectPage(picked);
                  }
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  deleteNode();
                }
              }}
              placeholder="Search for a page…"
              type="text"
              value={query}
            />
          </div>
          {results.length > 0 && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-200 max-h-64 w-full min-w-65 overflow-y-auto rounded-md border border-base-300 bg-neutral py-1">
              <p className="px-3 py-1 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
                {isRecent ? "Recent" : "Pages"}
              </p>
              {results.map((r, i) => (
                <button
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                    i === selectedIndex ? "bg-base-200" : "hover:bg-base-200"
                  }`}
                  key={r.pageId}
                  onClick={() => selectPage(r)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(i)}
                  type="button"
                >
                  <span className="flex w-5 shrink-0 items-center justify-center">
                    {r.icon ? (
                      <PageIcon icon={r.icon} size={16} />
                    ) : (
                      <FileText
                        className="shrink-0 text-base-content/70"
                        size={16}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base-content">
                      {r.title}
                    </span>
                    {r.breadcrumb && (
                      <span className="block truncate text-xs text-base-content/70">
                        {r.breadcrumb}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-200 w-full rounded-md border border-base-300 bg-neutral px-3 py-2 text-sm text-base-content/70">
              No matching pages
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  if (loading || !resolved) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <div className="my-0.5 flex items-center gap-2 rounded-sm px-2 py-1.5">
          <div className="size-4.5 animate-pulse rounded bg-base-200/50" />
          <div className="h-4 w-32 animate-pulse rounded bg-base-200/40" />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <a
        className="group my-0.5 flex w-fit items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-base-200"
        href={`/app/${workspaceSlug}/${resolved.shortId}`}
        onClick={(e) => e.stopPropagation()}
      >
        {resolved.icon ? (
          <PageIcon icon={resolved.icon} size={18} />
        ) : (
          <FileText className="shrink-0 text-base-content/70" size={18} />
        )}
        <span className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors group-hover:decoration-primary">
          {resolved.title}
        </span>
      </a>
    </NodeViewWrapper>
  );
}

// ── Template Button ────────────────────────────────────────────────────────────

type TplBlock = { type: string; text: string };

function TemplateButtonView({
  node,
  updateAttributes,
  getPos,
  editor,
}: NodeViewProps) {
  const label = (node.attrs.label as string) || "New Entry";
  const insertLocation =
    (node.attrs.insertLocation as string) || "below_button";
  const templateBlocks = (node.attrs.templateBlocks as TplBlock[]) || [
    { type: "paragraph", text: "" },
  ];

  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [draftLocation, setDraftLocation] = useState(insertLocation);
  const [draftBlocks, setDraftBlocks] = useState<TplBlock[]>(templateBlocks);

  const saveEdit = useCallback(() => {
    updateAttributes({
      label: draftLabel.trim() || "New Entry",
      insertLocation: draftLocation,
      templateBlocks: draftBlocks,
    });
    setEditing(false);
  }, [draftLabel, draftLocation, draftBlocks, updateAttributes]);

  const cancelEdit = useCallback(() => {
    setDraftLabel(label);
    setDraftLocation(insertLocation);
    setDraftBlocks(templateBlocks);
    setEditing(false);
  }, [label, insertLocation, templateBlocks]);

  function handleClick() {
    if (editing) {
      return;
    }
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) {
      return;
    }

    const schema = editor.schema;
    const nodesToInsert = templateBlocks.map((b) => {
      const nodeType =
        schema.nodes[
          b.type === "todo"
            ? "taskItem"
            : b.type === "bullet"
              ? "listItem"
              : "paragraph"
        ] ?? schema.nodes.paragraph;
      const textNode = b.text ? schema.text(b.text) : null;
      return nodeType.create({}, textNode ? [textNode] : []);
    });

    const tr = editor.view.state.tr;
    if (insertLocation === "below_button") {
      const insertPos = pos + node.nodeSize;
      for (let i = nodesToInsert.length - 1; i >= 0; i--) {
        tr.insert(insertPos, nodesToInsert[i]);
      }
    } else {
      // bottom of page
      const docSize = editor.view.state.doc.content.size;
      for (let i = nodesToInsert.length - 1; i >= 0; i--) {
        tr.insert(docSize - 1, nodesToInsert[i]);
      }
    }
    editor.view.dispatch(tr);
  }

  if (editing) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <div className="my-2 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-primary/60">
            ⚡ Template Button — Edit
          </p>

          {/* Label */}
          <div className="mb-3">
            <label
              className="mb-1 block text-xs font-medium text-base-content/70"
              htmlFor="template-button-label"
            >
              Button label
            </label>
            <input
              autoFocus
              className="w-full rounded-sm border border-base-300 bg-base-200 px-3 py-1.5 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="template-button-label"
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="e.g. + Add Today's Log"
              type="text"
              value={draftLabel}
            />
          </div>

          {/* Insert location */}
          <div className="mb-3">
            {/* Not a <label>: heads a pair of toggle buttons, not a control. */}
            <p className="mb-1.5 block text-xs font-medium text-base-content/70">
              Insert location
            </p>
            <div className="flex gap-2">
              {(
                [
                  { key: "below_button", label: "Below button" },
                  { key: "bottom_of_page", label: "Bottom of page" },
                ] as const
              ).map((opt) => (
                <button
                  className={[
                    "rounded-sm border px-3 py-1 text-xs font-medium transition-colors",
                    draftLocation === opt.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-base-300 text-base-content/70 hover:bg-base-200",
                  ].join(" ")}
                  key={opt.key}
                  onClick={() => setDraftLocation(opt.key)}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template blocks */}
          <div className="mb-3">
            {/* Not a <label>: heads a repeating list of block rows, each with
               its own controls, rather than a single form control. */}
            <p className="mb-1.5 block text-xs font-medium text-base-content/70">
              Template content
            </p>
            <div className="flex flex-col gap-1.5">
              {draftBlocks.map((b, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: KNOWN DEBT, needs a data-model decision. `draftBlocks` is written straight into this node's TipTap attributes, so an added id would change stored document JSON — which Hard Rule 5 requires a schema_version bump and migration path for. Every mutation below already addresses rows positionally for the same reason.
                <div className="flex items-center gap-2" key={i}>
                  <BlockTypeSelect
                    onChange={(v) => {
                      const next = [...draftBlocks];
                      next[i] = { ...next[i], type: v };
                      setDraftBlocks(next);
                    }}
                    value={b.type}
                  />
                  <input
                    className="flex-1 rounded-sm border border-base-300 bg-base-200 px-2.5 py-1.5 text-xs text-base-content outline-none transition-colors placeholder:text-base-content/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    onChange={(e) => {
                      const next = [...draftBlocks];
                      next[i] = { ...next[i], text: e.target.value };
                      setDraftBlocks(next);
                    }}
                    placeholder="Block text…"
                    type="text"
                    value={b.text}
                  />
                  <button
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-base-content/50 hover:bg-error/10 hover:text-error transition-colors"
                    onClick={() =>
                      setDraftBlocks(draftBlocks.filter((_, j) => j !== i))
                    }
                    type="button"
                  >
                    <svg fill="none" height="10" viewBox="0 0 10 10" width="10">
                      <path
                        d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                className="mt-0.5 self-start rounded-sm border border-dashed border-base-300 px-3 py-1 text-xs text-base-content/70 hover:border-primary/30 hover:text-primary"
                onClick={() =>
                  setDraftBlocks([
                    ...draftBlocks,
                    { type: "paragraph", text: "" },
                  ])
                }
                type="button"
              >
                + Add block
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              className="rounded-sm bg-primary px-3 py-1.5 text-xs font-medium text-primary-content hover:bg-primary/90"
              onClick={saveEdit}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              Save ↵
            </button>
            <button
              className="rounded-sm border border-base-300 px-3 py-1.5 text-xs text-base-content/70 hover:bg-base-200"
              onClick={cancelEdit}
              onMouseDown={(e) => e.preventDefault()}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-0.5 flex items-center gap-2">
        <button
          className="inline-flex items-center gap-1.5 rounded-sm border border-base-300 bg-secondary px-4 py-2 text-sm font-medium text-secondary-content transition-colors hover:bg-base-200"
          onClick={handleClick}
          onMouseDown={(e) => e.preventDefault()}
          type="button"
        >
          <span>⚡</span>
          <span>{label}</span>
        </button>
        <button
          className="rounded-sm px-2 py-1 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content/70"
          onClick={() => {
            setDraftLabel(label);
            setDraftLocation(insertLocation);
            setDraftBlocks(templateBlocks);
            setEditing(true);
          }}
          onMouseDown={(e) => e.preventDefault()}
          type="button"
        >
          Edit
        </button>
      </div>
    </NodeViewWrapper>
  );
}

// ── Math block ────────────────────────────────────────────────────────────────
function MathBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const expression = (node.attrs.expression as string) || "";
  const [editing, setEditing] = useState(!expression);
  const [draft, setDraft] = useState(expression);

  const rendered = useMemo(() => {
    if (!draft) {
      return null;
    }
    try {
      return katex.renderToString(draft, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [draft]);

  const commit = useCallback(() => {
    updateAttributes({ expression: draft });
    setEditing(false);
  }, [draft, updateAttributes]);

  return (
    <NodeViewWrapper contentEditable={false}>
      {editing ? (
        <div className="my-2 flex flex-col gap-2 rounded-sm border border-base-300 bg-base-200 p-3">
          <span className="text-xs font-semibold tracking-wide text-base-content/70">
            ∑ Equation — LaTeX
          </span>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 rounded-sm border border-base-300 bg-base-200 px-3 py-1.5 font-mono text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape" && expression) {
                  setEditing(false);
                }
              }}
              placeholder="E = mc^2"
              type="text"
              value={draft}
            />
            <button
              className="rounded-sm bg-primary px-3 py-1.5 text-sm font-medium text-primary-content hover:bg-primary/90 transition-colors"
              onClick={commit}
              type="button"
            >
              Done ↵
            </button>
          </div>
          {rendered && (
            <div
              className="border-t border-base-300 pt-2 text-center"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: `rendered` is KaTeX output, never raw user input — katex.renderToString() (see the useMemo above) escapes its LaTeX input and, with `trust` left at its default of false, refuses \href/\url with a javascript: or data: protocol. That default is the load-bearing control here: the equation is authored by an editor and persisted into the document, so it is re-rendered for other viewers. Do not pass trust:true or strict:false without revisiting this. There is no non-HTML API for mounting KaTeX output.
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          )}
        </div>
      ) : (
        <button
          className={[
            "my-2 block w-full cursor-pointer rounded-sm border p-4 text-center transition-colors",
            selected
              ? "border-primary bg-primary/5"
              : "border-transparent hover:border-base-300 hover:bg-base-200",
          ].join(" ")}
          onClick={() => setEditing(true)}
          type="button"
        >
          {rendered ? (
            // A <span>, not a <div>: this is inside a <button>, whose content
            // model is phrasing content. KaTeX's own output is all spans.
            <span
              className="block"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: same KaTeX output as the editing branch above — escaped by katex.renderToString() with `trust` at its default of false. See the fuller note there before changing either call site.
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          ) : (
            <span className="text-sm italic text-base-content/70">
              Click to add equation…
            </span>
          )}
        </button>
      )}
    </NodeViewWrapper>
  );
}

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      expression: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='mathBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mathBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});

// ── Stub blocks — visible placeholder cards via CSS ───────────────────────────

export const LinkedPage = Node.create<LinkedPageOptions>({
  name: "linkedPage",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return { workspaceId: "", workspaceSlug: "" };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      pageId: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='linkedPage']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "linkedPage" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkedPageView);
  },
});

// ── Sub-page ───────────────────────────────────────────────────────────────────
// Unlike LinkedPage (references an existing page), this CREATES a new child page and embeds
// a resolved icon+title card — matches Notion's "Page" block (distinct from "Link to Page").

interface SubPageBlockOptions {
  currentPageId: string;
  workspaceId: string;
  workspaceSlug: string;
}

function SubPageBlockView({
  node,
  updateAttributes,
  extension,
}: NodeViewProps) {
  const pageId = (node.attrs.pageId as string) || "";
  const { workspaceId, workspaceSlug, currentPageId } =
    extension.options as SubPageBlockOptions;
  const router = useRouter();

  const [resolved, setResolved] = useState<{
    title: string;
    icon: string | null;
    shortId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const creatingRef = useRef(false);
  // Captured once on first render: was this block just inserted with no page
  // yet? If so, jump straight into the new page once it resolves — matches
  // Notion, which navigates into the new page's own view instead of leaving
  // an inline rename box in the parent document.
  const [isNew] = useState(() => !pageId);
  const redirectStartedRef = useRef(false);

  // ── Hover preview card ────────────────────────────────────────────────────
  // Matches Notion: hovering shows icon/title/parent title/first-few-blocks preview,
  // fetched lazily (and cached) only once the user actually lingers.
  const [previewRect, setPreviewRect] = useState<DOMRect | null>(null);
  const [parentTitle, setParentTitle] = useState<string | null>(null);
  const [previewBlocks, setPreviewBlocks] = useState<
    { type: string; content?: unknown }[] | null
  >(null);
  const previewFetchedRef = useRef(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const handlePreviewEnter = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = e.currentTarget;
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = setTimeout(() => {
        setPreviewRect(target.getBoundingClientRect());
        if (!previewFetchedRef.current && currentPageId) {
          previewFetchedRef.current = true;
          fetch(`/api/pages/${currentPageId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((page: { title: string | null } | null) => {
              if (page) {
                setParentTitle(page.title || "Untitled");
              }
            });
          fetch(`/api/pages/${pageId}/blocks`)
            .then((r) => (r.ok ? r.json() : null))
            .then(
              (
                blockRows:
                  | {
                      type: string;
                      content?: unknown;
                      parentBlockId: string | null;
                    }[]
                  | null
              ) => {
                if (blockRows) {
                  setPreviewBlocks(
                    blockRows.filter((b) => !b.parentBlockId).slice(0, 5)
                  );
                }
              }
            );
        }
      }, 400);
    },
    [currentPageId, pageId]
  );

  const handlePreviewLeave = useCallback(() => {
    clearTimeout(previewTimerRef.current);
    setPreviewRect(null);
  }, []);

  useEffect(() => () => clearTimeout(previewTimerRef.current), []);

  // Notion creates the child page the instant the block is inserted —
  // there's no separate "name it, then click Create" step.
  useEffect(() => {
    if (pageId || creatingRef.current || !workspaceId) {
      return;
    }
    creatingRef.current = true;
    fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        parentId: currentPageId || null,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((page: { id: string } | null) => {
        if (!page) {
          return;
        }
        updateAttributes({ pageId: page.id });
        window.dispatchEvent(new CustomEvent("pages:refresh"));
      });
  }, [pageId, workspaceId, currentPageId, updateAttributes]);

  useEffect(() => {
    if (!pageId) {
      setResolved(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/pages/${pageId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          page: {
            title: string | null;
            icon: string | null;
            shortId: string;
          } | null
        ) => {
          if (cancelled || !page) {
            return;
          }
          setResolved({
            title: page.title || "Untitled",
            icon: page.icon,
            shortId: page.shortId,
          });
        }
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // Resolved once above — without this, renaming this sub-page elsewhere
  // (e.g. from its own H1) leaves this block showing its old title/icon for
  // as long as it stays mounted here in the parent page's content.
  useEffect(() => {
    function onTitleChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          pageId: string;
          title?: string;
          icon?: string | null;
        }>
      ).detail;
      if (!detail || detail.pageId !== pageId) {
        return;
      }
      setResolved(
        (prev) =>
          prev && {
            ...prev,
            title:
              detail.title === undefined
                ? prev.title
                : detail.title || "Untitled",
            icon: detail.icon === undefined ? prev.icon : detail.icon,
          }
      );
    }
    window.addEventListener("pagevo:page-title-changed", onTitleChanged);
    return () =>
      window.removeEventListener("pagevo:page-title-changed", onTitleChanged);
  }, [pageId]);

  // Once the freshly-created page resolves, navigate straight into it —
  // only once, and only for a block that had no pageId at initial mount.
  useEffect(() => {
    if (isNew && resolved && !redirectStartedRef.current) {
      redirectStartedRef.current = true;
      router.push(`/app/${workspaceSlug}/${resolved.shortId}`);
    }
  }, [isNew, resolved, router, workspaceSlug]);

  // A freshly-inserted block never shows the resolved link view — it only
  // ever exists long enough to redirect, so rendering that view first would
  // flash the finished block in the parent page for a frame before
  // navigation actually swaps the page out.
  if (!pageId || loading || !resolved || isNew) {
    return (
      <NodeViewWrapper contentEditable={false}>
        <div className="my-0.5 flex items-center gap-2 rounded-sm px-2 py-1.5">
          <div className="size-4.5 animate-pulse rounded bg-base-200/50" />
          <div className="h-4 w-32 animate-pulse rounded bg-base-200/40" />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <a
        className="group my-0.5 flex w-fit items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-base-200"
        href={`/app/${workspaceSlug}/${resolved.shortId}`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={handlePreviewEnter}
        onMouseLeave={handlePreviewLeave}
      >
        {resolved.icon ? (
          <PageIcon icon={resolved.icon} size={18} />
        ) : (
          <FileText className="shrink-0 text-base-content/70" size={18} />
        )}
        <span className="text-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors group-hover:decoration-primary">
          {resolved.title}
        </span>
      </a>

      {previewRect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="w-56 rounded-md border border-base-300 bg-neutral p-3 shadow-lg pointer-events-none"
            style={{
              position: "fixed",
              top: previewRect.bottom + 6,
              left: previewRect.left,
              zIndex: 9999,
            }}
          >
            <div className="mb-2 flex size-8 items-center justify-center rounded-sm border border-base-300 bg-base-200">
              {resolved.icon ? (
                <PageIcon icon={resolved.icon} size={18} />
              ) : (
                <FileText className="text-base-content/70" size={18} />
              )}
            </div>
            {parentTitle && (
              <p className="truncate text-xs text-base-content/70">
                {parentTitle}
              </p>
            )}
            <p className="truncate text-sm font-semibold text-base-content">
              {resolved.title}
            </p>

            {previewBlocks && previewBlocks.length > 0 && (
              <div className="relative mt-3 max-h-24 overflow-hidden">
                <MiniPageContent blocks={previewBlocks} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-base-100 to-transparent" />
              </div>
            )}
          </div>,
          document.body
        )}
    </NodeViewWrapper>
  );
}

export const SubPageBlock = Node.create<SubPageBlockOptions>({
  name: "subPageBlock",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return { workspaceId: "", workspaceSlug: "", currentPageId: "" };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      pageId: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='subPageBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "subPageBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubPageBlockView);
  },
});

// ── Inline Database ────────────────────────────────────────────────────────────

interface InlineDatabaseOptions {
  isEditor: boolean;
  workspaceId: string;
  workspaceSlug: string;
}

function InlineDatabaseView({
  node,
  updateAttributes,
  extension,
  deleteNode,
  getPos,
  editor,
}: NodeViewProps) {
  const databaseId = (node.attrs.databaseId as string) || "";
  const shortId = (node.attrs.shortId as string) || "";
  const { workspaceId, workspaceSlug, isEditor } =
    extension.options as InlineDatabaseOptions;
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; shortId: string; title: string | null }[]
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Older blocks (created before shortId was persisted, or ones where the
  // attribute update never made it into a saved revision) render with an
  // empty shortId, which silently hides the "Open" full-page link below with
  // no way to recover it — backfill it from the database's own host page.
  useEffect(() => {
    if (!databaseId || shortId || !isEditor) {
      return;
    }
    fetch(`/api/databases/${databaseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { database?: { shortId?: string } } | null) => {
        if (data?.database?.shortId) {
          updateAttributes({ shortId: data.database.shortId });
        }
      })
      .catch(() => {});
  }, [databaseId, shortId, isEditor, updateAttributes]);

  function handleDuplicate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const pos = typeof getPos === "function" ? getPos() : null;
    if (pos == null) {
      return;
    }
    const newNode = editor.schema.nodes.inlineDatabase.create(node.attrs);
    editor.view.dispatch(
      editor.view.state.tr.insert(pos + node.nodeSize, newNode)
    );
  }

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    deleteNode();
  }

  // Search existing databases when query changes
  useEffect(() => {
    if (!searching || !workspaceId) {
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setSearchLoading(true);
    fetch(
      `/api/workspaces/${workspaceId}/databases?q=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: string; shortId: string; title: string | null }[]) => {
        setResults(data);
        setSearchLoading(false);
      })
      .catch(() => setSearchLoading(false));
    return () => controller.abort();
  }, [query, searching, workspaceId]);

  async function handleCreateNew() {
    if (!workspaceId || creating) {
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/databases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Database" }),
      });
      if (!res.ok) {
        toast.error("Failed to create database — try again");
        return;
      }
      const db = (await res.json()) as {
        id: string;
        shortId: string;
        defaultViewId?: string;
      };
      updateAttributes({
        databaseId: db.id,
        shortId: db.shortId ?? "",
        defaultViewId: db.defaultViewId ?? "",
      });
    } catch {
      toast.error("Failed to create database — try again");
    } finally {
      setCreating(false);
    }
  }

  function handleLink(id: string, sid: string) {
    updateAttributes({ databaseId: id, shortId: sid });
    setSearching(false);
  }

  // Setup picker — shown when no databaseId yet
  if (!databaseId) {
    if (searching) {
      return (
        <NodeViewWrapper contentEditable={false}>
          <div className="my-1 rounded-md border border-base-300 bg-base-200 p-4">
            <p className="mb-2 text-xs font-semibold text-base-content/70">
              Link an existing database
            </p>
            <input
              autoFocus
              className="w-full rounded-sm border border-base-300 bg-base-200/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search databases…"
              ref={inputRef}
              value={query}
            />
            {searchLoading && (
              <p className="mt-2 text-xs text-base-content/70">Searching…</p>
            )}
            {results.length > 0 && (
              <div className="mt-2 flex flex-col gap-0.5">
                {results.map((r) => (
                  <button
                    className="flex items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-base-content hover:bg-base-200"
                    key={r.id}
                    onClick={() => handleLink(r.id, r.shortId)}
                    type="button"
                  >
                    <svg
                      className="size-3.5 shrink-0 text-base-content/70"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      viewBox="0 0 16 16"
                    >
                      <rect height="14" rx="2" width="14" x="1" y="1" />
                      <line x1="1" x2="15" y1="5" y2="5" />
                      <line x1="5" x2="5" y1="5" y2="15" />
                    </svg>
                    {r.title || "Untitled Database"}
                  </button>
                ))}
              </div>
            )}
            {!searchLoading && query && results.length === 0 && (
              <p className="mt-2 text-xs text-base-content/70">
                No databases found
              </p>
            )}
            <button
              className="mt-3 text-xs text-base-content/70 hover:text-base-content/70"
              onClick={() => {
                setSearching(false);
                setQuery("");
                setResults([]);
              }}
              type="button"
            >
              ← Back
            </button>
          </div>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper contentEditable={false}>
        <div className="my-1 flex items-center gap-3 rounded-md border border-dashed border-base-300 bg-base-200/20 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-base-200/50">
            <svg
              className="size-4 text-base-content/70"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 16 16"
            >
              <rect height="14" rx="2" width="14" x="1" y="1" />
              <line x1="1" x2="15" y1="5" y2="5" />
              <line x1="5" x2="5" y1="5" y2="15" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-base-content/70">
              Add a database
            </p>
            <p className="text-xs text-base-content/70">
              Create a new database or embed an existing one
            </p>
          </div>
          {isEditor && (
            <div className="flex items-center gap-2">
              <button
                className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-60"
                disabled={creating}
                onClick={handleCreateNew}
                type="button"
              >
                {creating ? "Creating…" : "New database"}
              </button>
              <button
                className="rounded-sm border border-base-300 bg-base-200 px-3 py-1.5 text-xs font-medium text-base-content hover:bg-base-200"
                onClick={() => {
                  setSearching(true);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                type="button"
              >
                Link existing
              </button>
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  // Render the embedded database
  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-3 overflow-hidden rounded-lg border border-base-300 bg-base-200">
        {/* Inline header bar */}
        <div className="flex items-center gap-2 border-b border-base-300 bg-base-200/20 px-3 py-2">
          <svg
            className="size-3.5 shrink-0 text-base-content/70"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 16 16"
          >
            <rect height="14" rx="2" width="14" x="1" y="1" />
            <line x1="1" x2="15" y1="5" y2="5" />
            <line x1="5" x2="5" y1="5" y2="15" />
          </svg>
          <span className="text-xs font-semibold text-base-content/70 tracking-wide">
            Inline database
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            {isEditor && (
              <>
                <button
                  className="flex size-6 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content/70"
                  onMouseDown={handleDuplicate}
                  onMouseEnter={(e) => showTooltip("Duplicate block", e)}
                  onMouseLeave={hideTooltip}
                  type="button"
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 16 16"
                  >
                    <rect height="9" rx="1.5" width="9" x="5" y="5" />
                    <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
                  </svg>
                </button>
                <button
                  className="flex size-6 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-error/10 hover:text-error"
                  onMouseDown={handleDelete}
                  onMouseEnter={(e) => showTooltip("Delete block", e)}
                  onMouseLeave={hideTooltip}
                  type="button"
                >
                  <svg
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 16 16"
                  >
                    <path d="M2 4h12" />
                    <path d="M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4" />
                    <path d="M6 7v4M10 7v4" />
                    <path d="M3 4l.8 9.2a.8.8 0 0 0 .8.8h6.8a.8.8 0 0 0 .8-.8L13 4" />
                  </svg>
                </button>
              </>
            )}
            {workspaceSlug && shortId && (
              <a
                className="ml-1 flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-primary"
                href={`/app/${workspaceSlug}/${shortId}`}
                onClick={(e) => e.stopPropagation()}
              >
                Open
                <svg
                  className="size-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  viewBox="0 0 12 12"
                >
                  <path d="M2 10L10 2M10 2H5M10 2v5" />
                </svg>
              </a>
            )}
          </div>
        </div>
        {/* minHeight, not a fixed height + overflow:hidden — the calendar view
            needs more room than 420px once its rows hold their minimum height,
            and clipping it here is what made an embedded calendar look
            squashed. DatabasePage keeps the old fixed 420px box for the views
            that scroll internally (table/board/gallery/gantt); only calendar
            grows past it, letting the page scroll instead. */}
        <div style={{ minHeight: 420 }}>
          <DatabasePage
            databaseId={databaseId}
            initialIcon={null}
            initialTitle={null}
            inline
            isDeleted={false}
            isEditor={isEditor}
            isLocked={false}
            pageShortId=""
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </NodeViewWrapper>
  );
}

export const InlineDatabase = Node.create<InlineDatabaseOptions>({
  name: "inlineDatabase",
  group: "block",
  atom: true,
  draggable: true,
  // Without this, clicking the atom's own interactive UI (rows, dropdowns) gets wrapped in a
  // NodeSelection, which triggers the bubble menu's toolbar instead of the intended click.
  selectable: false,

  addOptions() {
    return { workspaceId: "", workspaceSlug: "", isEditor: false };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      databaseId: { default: "" },
      shortId: { default: "" },
      defaultViewId: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='inlineDatabase']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "inlineDatabase" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineDatabaseView);
  },
});

export const TemplateButton = Node.create({
  name: "templateButton",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      label: { default: "New Entry" },
      insertLocation: { default: "below_button" },
      templateBlocks: { default: [{ type: "paragraph", text: "" }] },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='templateButton']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "templateButton" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplateButtonView);
  },
});

// ── Table of contents ─────────────────────────────────────────────────────────
// Stateless — nothing is persisted besides blockId. Derived entirely from the
// current document's heading nodes, re-scanned on every editor update so it
// stays in sync as headings are added/removed/renamed, matching Notion.
interface TocHeading {
  level: number;
  pos: number;
  text: string;
}

function TableOfContentsView({ editor }: NodeViewProps) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);

  useEffect(() => {
    function scan() {
      const items: TocHeading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          items.push({
            pos,
            level: (node.attrs.level as number) ?? 1,
            text: node.textContent.trim() || "Untitled",
          });
        }
      });
      setHeadings(items);
    }
    scan();
    editor.on("update", scan);
    return () => {
      editor.off("update", scan);
    };
  }, [editor]);

  function handleClick(pos: number) {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-1">
        {headings.length === 0 ? (
          <p className="text-sm italic text-base-content/70">
            Table of contents — headings you add on this page will show up here.
          </p>
        ) : (
          <div className="flex flex-col">
            {headings.map((h) => (
              <button
                className="w-full truncate rounded-xs py-0.5 text-left text-sm text-base-content/70 transition-colors hover:text-primary hover:underline"
                key={h.pos}
                onClick={() => handleClick(h.pos)}
                onMouseDown={(e) => e.preventDefault()}
                style={{ paddingLeft: `${(h.level - 1) * 20}px` }}
                type="button"
              >
                {h.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { blockId: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-type='toc']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toc" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView);
  },
});

// ── Breadcrumb ─────────────────────────────────────────────────────────────────
// Stateless — nothing is persisted besides blockId. Derived entirely from the
// current page's ancestor chain (via lib/pages/ancestors.ts, exposed at
// GET /api/pages/:id/ancestors), fetched fresh whenever the block mounts.

interface BreadcrumbBlockOptions {
  currentPageId: string;
  workspaceSlug: string;
}

type AncestorCrumb = {
  id: string;
  shortId: string;
  title: string | null;
  icon: string | null;
};

interface WorkspaceCrumb {
  icon: string | null;
  name: string;
  slug: string;
}

function BreadcrumbBlockView({ extension }: NodeViewProps) {
  const { workspaceSlug, currentPageId } =
    extension.options as BreadcrumbBlockOptions;
  const [crumbs, setCrumbs] = useState<AncestorCrumb[] | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceCrumb | null>(null);

  useEffect(() => {
    if (!currentPageId) {
      return;
    }
    let cancelled = false;
    fetch(`/api/pages/${currentPageId}/ancestors`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: { workspace: WorkspaceCrumb; ancestors: AncestorCrumb[] } | null
        ) => {
          if (!cancelled && data) {
            setCrumbs(data.ancestors);
            setWorkspace(data.workspace);
          }
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentPageId]);

  // The fetch above only runs once on mount — renaming any page in the chain
  // (this one, or an ancestor) elsewhere would otherwise leave this block
  // showing a stale title for as long as it stays mounted.
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
      setCrumbs((prev) =>
        prev === null
          ? null
          : prev.map((c) =>
              c.id === detail.pageId
                ? {
                    ...c,
                    title: detail.title === undefined ? c.title : detail.title,
                    icon: detail.icon === undefined ? c.icon : detail.icon,
                  }
                : c
            )
      );
    }
    window.addEventListener("pagevo:page-title-changed", onTitleChanged);
    return () =>
      window.removeEventListener("pagevo:page-title-changed", onTitleChanged);
  }, []);

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-1">
        {crumbs ? (
          <Breadcrumb>
            {/* Items are the list's *direct* children on purpose: daisy's
                `breadcrumbs` draws each separator as the `::before` of the
                element following an `<li>`, so an intervening wrapper would
                suppress it. */}
            <BreadcrumbList className="normal-case">
              {/* The workspace itself is always the first, clickable crumb —
                  matching Notion, where even a page with no parent pages
                  still shows at least two segments, not just its own title
                  rendered as plain, non-clickable text. */}
              {workspace && (
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <NextLink
                      className="flex items-center gap-1"
                      href={`/app/${workspaceSlug}`}
                    >
                      {workspace.icon && (
                        <PageIcon icon={workspace.icon} size={14} />
                      )}
                      {workspace.name}
                    </NextLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
              {crumbs.map((c, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <BreadcrumbItem key={c.id}>
                    {isLast ? (
                      <BreadcrumbPage className="flex items-center gap-1">
                        {c.icon && <PageIcon icon={c.icon} size={14} />}
                        {c.title || "Untitled"}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <NextLink
                          className="flex items-center gap-1"
                          href={`/app/${workspaceSlug}/${c.shortId}`}
                        >
                          {c.icon && <PageIcon icon={c.icon} size={14} />}
                          {c.title || "Untitled"}
                        </NextLink>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                );
              })}
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          <div className="h-4 w-40 animate-pulse rounded-xs bg-base-200/40" />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const BreadcrumbBlock = Node.create<BreadcrumbBlockOptions>({
  name: "breadcrumbBlock",
  group: "block",
  atom: true,
  draggable: true,

  addOptions() {
    return { workspaceSlug: "", currentPageId: "" };
  },

  addAttributes() {
    return { blockId: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-type='breadcrumbBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "breadcrumbBlock" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BreadcrumbBlockView);
  },
});

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      columnCount: { default: 2 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='columns']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "columns" }),
      0,
    ];
  },
});
