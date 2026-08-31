"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExternalLink as ArrowSquareOutIcon,
  Copy as CopyIcon,
  MoreHorizontal as DotsThreeIcon,
  FileText,
  Settings2 as GearIcon,
  GripVertical,
  Link2 as Link2Icon,
  Link as LinkIcon,
  MessageSquare as MessageSquareIcon,
  Pencil as PencilSimpleIcon,
  Plus as PlusIcon,
  Type as TextTIcon,
  Trash2 as TrashIcon,
  User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CellActionOverlay } from "@/components/database/cell-action-overlay";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { CellEditorPopover } from "@/components/database/cells/cell-editor";
import { EditPropertySidePanel } from "@/components/database/edit-property-panel";
import { FormulaConfigPicker } from "@/components/database/formula-config-picker";
import {
  formatDateValue,
  getOptionColor,
  groupOptions,
  PROPERTY_REGISTRY,
  PROPERTY_TYPE_ICON,
} from "@/components/database/property-registry";
import { RelationDatabasePicker } from "@/components/database/relation-database-picker";
import { RollupConfigPicker } from "@/components/database/rollup-config-picker";
import type {
  DbProperty,
  DbPropertyConfig,
  DbView,
  SelectOption,
  ViewPropertyOverride,
} from "@/components/database/types";
import {
  resolveDisplayAs,
  resolveWrapContent,
} from "@/components/database/view-property-resolver";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";
import type { DatabaseProperty, DatabaseView } from "@/lib/db/schema";
import { getClampedLeft, getClampedTop } from "@/lib/ui/clamp-to-viewport";
import type { TemplateEntry } from "../template-page-client";

// ── Types ─────────────────────────────────────────────────────────────────────
// Option/config shapes are the shared, canonical ones (components/database/types.ts)
// so colors, groups, and display settings render consistently across every view.

type PropOption = SelectOption;
type PropConfig = DbPropertyConfig;
// Badge-style properties (pill values) and Person get comment-only hover actions, no copy-to-clipboard, unlike plain-value properties.
const BADGE_TYPES = new Set(["select", "multi_select", "person"]);
type SelectVal = { optionId?: string };
type MultiSelectVal = { optionIds?: string[] };
type CheckboxVal = { checked?: boolean };
type DateVal = { date?: string };
type NumberVal = { number?: number };
type TextVal = { text?: string };
type EmailVal = { email?: string };
type UrlVal = { url?: string };
type PersonVal = {
  userIds?: string[];
  _members?: { id: string; name?: string; email?: string }[];
};

// ── Property text helper (for clipboard copy + comment quote snapshot) ───────
function getPropertyText(prop: DatabaseProperty, raw: unknown): string {
  if (!raw) {
    return "";
  }
  const v = raw as Record<string, unknown>;
  const config = (prop.config ?? {}) as PropConfig;
  switch (prop.type) {
    case "text":
      return String((v as TextVal).text ?? "");
    case "number":
      return (v as NumberVal).number == null
        ? ""
        : String((v as NumberVal).number);
    case "url":
      return String((v as UrlVal).url ?? "");
    case "email":
      return String((v as EmailVal).email ?? "");
    case "phone":
      return String((v as { phone?: string }).phone ?? "");
    case "checkbox":
      return (v as CheckboxVal).checked ? "Yes" : "No";
    case "person":
    case "created_by": {
      const members = (v as PersonVal)._members ?? [];
      return members
        .map((m) => m.name || m.email)
        .filter(Boolean)
        .join(", ");
    }
    case "date":
      return formatDateValue(v);
    case "select": {
      const optId = (v as SelectVal).optionId;
      if (!optId) {
        return "";
      }
      return (config.options ?? []).find((o) => o.id === optId)?.name ?? "";
    }
    case "multi_select": {
      const ids = (v as MultiSelectVal).optionIds ?? [];
      const opts = config.options ?? [];
      return ids
        .map((id) => opts.find((o) => o.id === id)?.name ?? "")
        .filter(Boolean)
        .join(", ");
    }
    default:
      return "";
  }
}

// ── Editable scalar cell ──────────────────────────────────────────────────────

function EditableCell({
  value,
  type,
  placeholder,
  onSave,
  onEditingChange,
}: {
  value: string | number | null | undefined;
  type: "text" | "number" | "email" | "url";
  placeholder: string;
  onSave: (v: unknown) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  function startEdit() {
    setDraft(value == null ? "" : String(value));
    setEditing(true);
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);
  // Hide the hover overlay (comment/copy icons) the whole time this cell is
  // being typed into, matching Notion — not just report it once on click.
  useEffect(() => {
    onEditingChange(editing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, onEditingChange]);

  function commit() {
    setEditing(false);
    const v = draft.trim();
    if (type === "number") {
      onSave(v === "" ? null : { number: Number(v) });
    } else if (type === "email") {
      onSave(v === "" ? null : { email: v });
    } else if (type === "url") {
      onSave(v === "" ? null : { url: v });
    } else {
      onSave(v === "" ? null : { text: v });
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      commit();
    }
    if (e.key === "Escape") {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        className="w-full bg-base-200 border border-primary/60 rounded px-2 py-0.5 text-sm text-base-content outline-none"
        onBlur={commit}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        ref={inputRef}
        type={type === "number" ? "number" : "text"}
        value={draft}
      />
    );
  }

  const display = value != null && value !== "" ? String(value) : null;

  // URL: show as clickable link with an edit pencil on hover
  if (type === "url" && display) {
    const href = display.startsWith("http") ? display : `https://${display}`;
    return (
      <div className="group/url flex items-center gap-1 rounded px-1 py-0.5 hover:bg-base-200/60 transition-colors">
        <a
          className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-primary underline-offset-2 hover:underline"
          href={href}
          onClick={(e) => e.stopPropagation()}
          rel="noopener noreferrer"
          target="_blank"
        >
          <LinkIcon className="shrink-0" size={11} />
          <span className="truncate">{display}</span>
        </a>
        <button
          className="hidden shrink-0 rounded p-0.5 text-base-content/70 hover:text-base-content group-hover/url:block transition-colors"
          onClick={startEdit}
          onMouseEnter={(e) => showTooltip("Edit URL", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <PencilSimpleIcon size={11} />
        </button>
        {tooltip &&
          typeof document !== "undefined" &&
          createPortal(
            <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
            document.body
          )}
      </div>
    );
  }

  return (
    <button
      className="block w-full min-w-0 rounded px-1 py-0.5 text-left text-sm hover:bg-base-200/60 transition-colors"
      onClick={startEdit}
      type="button"
    >
      {display ? (
        <span className="block truncate text-base-content">{display}</span>
      ) : (
        <span className="block truncate text-base-content/70 text-xs">
          {placeholder}
        </span>
      )}
    </button>
  );
}

// ── Option badge (reusable) ────────────────────────────────────────────────────

function OptionBadge({
  name,
  color,
  displayAs,
  wrap,
}: {
  name: string;
  color: string;
  displayAs?: "select" | "checkbox";
  wrap?: boolean;
}) {
  const wrapCls = wrap ? "whitespace-normal wrap-break-word" : "truncate";
  if (displayAs === "checkbox") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded border border-primary bg-primary text-xs font-bold text-primary-content">
        ✓
      </span>
    );
  }
  const c = getOptionColor(color);
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-xs px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: c.dot }}
      />
      <span className={wrapCls}>{name}</span>
    </span>
  );
}

// ── Select cell ───────────────────────────────────────────────────────────────

function SelectCell({
  value,
  options,
  config,
  resolvedDisplayAs,
  resolvedWrapContent,
  onSave,
  onEditProperty,
}: {
  value: SelectVal | null | undefined;
  options: PropOption[];
  config: PropConfig;
  resolvedDisplayAs?: "select" | "checkbox";
  resolvedWrapContent?: boolean;
  onSave: (v: unknown) => void;
  onEditProperty: (rect: DOMRect) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value?.optionId);
  const grouped = !!config.groupedByStatus;
  const sections = groupOptions(options, grouped);
  const displayAs = resolvedDisplayAs ?? config.displayAs;
  const wrapContent = resolvedWrapContent ?? config.wrapContent;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-base-200/60 transition-colors"
        onClick={() => setOpen((p) => !p)}
        type="button"
      >
        {current ? (
          <OptionBadge
            color={current.color}
            displayAs={displayAs}
            name={current.name}
            wrap={wrapContent}
          />
        ) : displayAs === "checkbox" ? (
          <span className="flex size-4 shrink-0 items-center justify-center rounded border border-base-300" />
        ) : (
          <span className="text-xs text-base-content/70">Empty</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-300 mt-0.5 min-w-45 rounded-md border border-base-300 bg-neutral p-1">
          {current && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-base-content/70 hover:bg-base-200 transition-colors"
              onClick={() => {
                onSave(null);
                setOpen(false);
              }}
              type="button"
            >
              Clear
            </button>
          )}
          {sections.map((section) => (
            <div key={section.key}>
              {section.label && (
                <p className="mb-0.5 mt-1 px-2 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
                  {section.label}
                </p>
              )}
              {section.options.map((opt) => (
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-base-200 transition-colors"
                  key={opt.id}
                  onClick={() => {
                    onSave({ optionId: opt.id });
                    setOpen(false);
                  }}
                  type="button"
                >
                  <OptionBadge color={opt.color} name={opt.name} />
                  {opt.id === current?.id && (
                    <span className="ml-auto text-primary text-xs font-bold">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
          <div className="my-1 h-px bg-base-300" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
            onClick={(e) => {
              onEditProperty(
                (e.currentTarget as HTMLElement).getBoundingClientRect()
              );
              setOpen(false);
            }}
            type="button"
          >
            <GearIcon size={12} /> Edit property
          </button>
        </div>
      )}
    </div>
  );
}

// ── Multi-select cell ─────────────────────────────────────────────────────────

function MultiSelectCell({
  value,
  options,
  config,
  resolvedDisplayAs,
  resolvedWrapContent,
  onSave,
  onEditProperty,
}: {
  value: MultiSelectVal | null | undefined;
  options: PropOption[];
  config: PropConfig;
  resolvedDisplayAs?: "select" | "checkbox";
  resolvedWrapContent?: boolean;
  onSave: (v: unknown) => void;
  onEditProperty: (rect: DOMRect) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedIds = value?.optionIds ?? [];
  const selectedOpts = options.filter((o) => selectedIds.includes(o.id));
  const displayAs = resolvedDisplayAs ?? config.displayAs;
  const wrapContent = resolvedWrapContent ?? config.wrapContent;

  useEffect(() => {
    if (!open) {
      return;
    }
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(optId: string) {
    const next = selectedIds.includes(optId)
      ? selectedIds.filter((id) => id !== optId)
      : [...selectedIds, optId];
    onSave({ optionIds: next });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex w-full min-h-6 flex-wrap items-center gap-1 rounded px-1 py-0.5 hover:bg-base-200/60 transition-colors"
        onClick={() => setOpen((p) => !p)}
        type="button"
      >
        {selectedOpts.length > 0 ? (
          selectedOpts.map((o) => (
            <OptionBadge
              color={o.color}
              displayAs={displayAs}
              key={o.id}
              name={o.name}
              wrap={wrapContent}
            />
          ))
        ) : (
          <span className="text-xs text-base-content/70">Empty</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-300 mt-0.5 min-w-45 rounded-md border border-base-300 bg-neutral p-1">
          {selectedOpts.length > 0 && (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-base-content/70 hover:bg-base-200 transition-colors"
              onClick={() => {
                onSave({ optionIds: [] });
                setOpen(false);
              }}
              type="button"
            >
              Clear
            </button>
          )}
          {options.map((opt) => {
            const checked = selectedIds.includes(opt.id);
            return (
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-base-200 transition-colors"
                key={opt.id}
                onClick={() => toggle(opt.id)}
                type="button"
              >
                <OptionBadge color={opt.color} name={opt.name} />
                {checked && (
                  <span className="ml-auto text-primary text-xs font-bold">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
          <div className="my-1 h-px bg-base-300" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
            onClick={(e) => {
              onEditProperty(
                (e.currentTarget as HTMLElement).getBoundingClientRect()
              );
              setOpen(false);
            }}
            type="button"
          >
            <GearIcon size={12} /> Edit property
          </button>
        </div>
      )}
    </div>
  );
}

// ── Select / Multi-select cell (non-Status) ──────────────────────────────────
// Regular Select/Multi-select uses the CellEditorPopover shared with Board/Gallery; the old flat dropdown above is kept only for Status.
function SelectPopoverCell({
  property,
  value,
  options,
  config,
  resolvedDisplayAs,
  resolvedWrapContent,
  workspaceId,
  multi,
  onSave,
  onEditProperty,
  onUpdateProperty,
}: {
  property: DatabaseProperty;
  value: SelectVal | MultiSelectVal | null | undefined;
  options: PropOption[];
  config: PropConfig;
  resolvedDisplayAs?: "select" | "checkbox";
  resolvedWrapContent?: boolean;
  workspaceId: string;
  multi: boolean;
  onSave: (v: unknown) => void;
  onEditProperty: (rect: DOMRect) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const displayAs = resolvedDisplayAs ?? config.displayAs;
  const wrapContent = resolvedWrapContent ?? config.wrapContent;

  const selectedIds = multi
    ? ((value as MultiSelectVal | null)?.optionIds ?? [])
    : [];
  const selectedOpts = multi
    ? options.filter((o) => selectedIds.includes(o.id))
    : [];
  const currentOpt = multi
    ? undefined
    : options.find((o) => o.id === (value as SelectVal | null)?.optionId);

  return (
    <>
      <button
        className={
          multi
            ? "flex min-h-6 w-full flex-wrap items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-base-200/60"
            : "flex w-full items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-base-200/60"
        }
        onClick={(e) =>
          setRect((e.currentTarget as HTMLElement).getBoundingClientRect())
        }
        type="button"
      >
        {multi ? (
          selectedOpts.length > 0 ? (
            selectedOpts.map((o) => (
              <OptionBadge
                color={o.color}
                displayAs={displayAs}
                key={o.id}
                name={o.name}
                wrap={wrapContent}
              />
            ))
          ) : (
            <span className="text-xs text-base-content/70">Empty</span>
          )
        ) : currentOpt ? (
          <OptionBadge
            color={currentOpt.color}
            displayAs={displayAs}
            name={currentOpt.name}
            wrap={wrapContent}
          />
        ) : displayAs === "checkbox" ? (
          <span className="flex size-4 shrink-0 items-center justify-center rounded border border-base-300" />
        ) : (
          <span className="text-xs text-base-content/70">Empty</span>
        )}
      </button>

      {rect && (
        <CellEditorPopover
          cellRect={rect}
          onClose={() => setRect(null)}
          onEditProperty={(r) => {
            onEditProperty(r);
            setRect(null);
          }}
          onPropertyConfigChange={(propId, cfg) =>
            onUpdateProperty(propId, { config: cfg })
          }
          onSave={onSave}
          property={property as unknown as DbProperty}
          value={value ?? null}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

// ── Date cell ─────────────────────────────────────────────────────────────────
// Uses the same shared CellDisplay (read) + CellEditorPopover (edit — range,
// time/timezone, format, reminder) as every other database view, instead of
// EditableCell's plain single-date DatePicker.
function DateCell({
  property,
  value,
  workspaceId,
  onSave,
  onEditingChange,
}: {
  property: DatabaseProperty;
  value: DateVal | null | undefined;
  workspaceId: string;
  onSave: (v: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hasValue = !!value?.date;

  function open(e: ReactMouseEvent<HTMLButtonElement>) {
    setRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    onEditingChange?.(true);
  }
  function close() {
    setRect(null);
    onEditingChange?.(false);
  }

  return (
    <>
      <button
        className="flex min-h-6 w-full items-center rounded px-1 py-0.5 text-left transition-colors hover:bg-base-200/60"
        onClick={open}
        type="button"
      >
        {hasValue ? (
          <CellDisplay
            property={property as unknown as DbProperty}
            value={value}
          />
        ) : (
          <span className="text-xs text-base-content/70">Pick date</span>
        )}
      </button>

      {rect && (
        <CellEditorPopover
          cellRect={rect}
          onClose={close}
          onSave={onSave}
          property={property as unknown as DbProperty}
          value={value ?? null}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

// ── Checkbox cell ─────────────────────────────────────────────────────────────

function CheckboxCell({
  value,
  onSave,
}: {
  value: CheckboxVal | null | undefined;
  onSave: (v: unknown) => void;
}) {
  const checked = value?.checked ?? false;
  return (
    <button
      className={`flex size-4 shrink-0 items-center justify-center rounded border text-xs font-bold transition-colors ${checked ? "border-primary bg-primary text-primary-content" : "border-base-300 hover:border-primary/60"}`}
      onClick={() => onSave({ checked: !checked })}
      type="button"
    >
      {checked && "✓"}
    </button>
  );
}

// ── Person cell ───────────────────────────────────────────────────────────────
// Uses the shared CellDisplay/CellEditorPopover so the `{ userIds, _members }` shape matches other views (a prior free-text input didn't).
function PersonCell({
  property,
  value,
  workspaceId,
  onSave,
}: {
  property: DatabaseProperty;
  value: PersonVal | null | undefined;
  workspaceId: string;
  onSave: (v: unknown) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const { data: session } = useSession();
  const hasValue = (value?.userIds?.length ?? 0) > 0;
  const voteMode = !!(property.config as { voteMode?: boolean } | null)
    ?.voteMode;

  // Vote-mode: clicking toggles the current viewer's own vote directly, never
  // opens the people picker — so there's no path here to editing anyone
  // else's vote. Server enforces the same self-only rule independently.
  if (voteMode) {
    return (
      <button
        className="flex min-h-6 w-fit items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-base-200/60 disabled:cursor-default"
        disabled={!session?.user?.id}
        onClick={() => {
          if (session?.user?.id) {
            onSave(toggleSelfVote(value, session.user));
          }
        }}
        type="button"
      >
        <CellDisplay
          property={property as unknown as DbProperty}
          value={value ?? { userIds: [] }}
          workspaceId={workspaceId}
        />
      </button>
    );
  }

  return (
    <>
      <button
        className="flex min-h-6 w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-base-200/60"
        onClick={(e) =>
          setRect((e.currentTarget as HTMLElement).getBoundingClientRect())
        }
        type="button"
      >
        {hasValue ? (
          <CellDisplay
            property={property as unknown as DbProperty}
            value={value}
            workspaceId={workspaceId}
          />
        ) : (
          <>
            <UserIcon className="shrink-0 text-base-content/70" size={12} />
            <span className="text-xs text-base-content/70">Empty</span>
          </>
        )}
      </button>

      {rect && (
        <CellEditorPopover
          cellRect={rect}
          onClose={() => setRect(null)}
          onSave={onSave}
          property={property as unknown as DbProperty}
          value={value ?? null}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

// ── Files cell ───────────────────────────────────────────────────────────────
// Same CellDisplay (read) + CellEditorPopover (edit, upload/link) pattern as
// PersonCell above — keeps the template preview's editing behavior identical
// to the live app's table-view.tsx instead of a second, divergent implementation.
function FileCell({
  property,
  value,
  workspaceId,
  onSave,
}: {
  property: DatabaseProperty;
  value:
    | {
        files?: {
          id: string;
          url: string;
          name: string;
          mimeType: string;
          sizeBytes: number;
        }[];
      }
    | null
    | undefined;
  workspaceId: string;
  onSave: (v: unknown) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const hasValue = (value?.files?.length ?? 0) > 0;

  return (
    <>
      <button
        className="flex min-h-6 w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-base-200/60"
        onClick={(e) =>
          setRect((e.currentTarget as HTMLElement).getBoundingClientRect())
        }
        type="button"
      >
        {hasValue ? (
          <CellDisplay
            compact
            property={property as unknown as DbProperty}
            value={value}
            workspaceId={workspaceId}
          />
        ) : (
          <span className="text-xs text-base-content/70">Empty</span>
        )}
      </button>

      {rect && (
        <CellEditorPopover
          cellRect={rect}
          onClose={() => setRect(null)}
          onSave={onSave}
          property={property as unknown as DbProperty}
          value={value ?? null}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function ColumnHeader({
  prop,
  properties,
  workspaceId,
  onRename,
  onDelete,
  onUpdateProperty,
  onDuplicateProperty,
  getEditPropertyAnchorRect,
  activeView,
  onUpdateView,
  locked,
}: {
  prop: DatabaseProperty;
  properties: DatabaseProperty[];
  workspaceId: string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onDuplicateProperty: (prop: DatabaseProperty) => void;
  getEditPropertyAnchorRect: () => DOMRect;
  activeView?: DatabaseView | null;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
  locked?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(prop.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "Edit property" replaces this same menu's content in place, at the same anchor —
  // matches Notion's behavior of drilling into a sub-panel rather than opening a new one.
  const [editingProperty, setEditingProperty] = useState(false);
  // Snapshotted at open time and used to portal the menu to <body> with fixed
  // positioning — the table body scrolls horizontally, and an in-flow
  // `position: absolute` menu was getting clipped by that scroll container
  // instead of floating above it.
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dropdown itself is portaled to <body> (see below), so it's no longer a
  // DOM descendant of menuRef — needs its own ref for the outside-click check.
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function h(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // EditPropertySidePanel (and its own nested submenu/confirm-dialog portals) render
      // outside menuRef's DOM subtree — without this they'd read as "outside" and close mid-interaction.
      if (
        target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
      ) {
        return;
      }
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setMenuOpen(false);
        setEditingProperty(false);
        setRenaming(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
    }
  }, [renaming]);

  // Keeps the frozen `menuRect` snapshot valid — without this, scrolling the
  // table while the menu is open would leave the fixed-position menu visually
  // detached from the "⋯" button that anchored it.
  useScrollLockWhileOpen(
    menuOpen && !editingProperty,
    (target) =>
      !!menuRef.current?.contains(target) ||
      !!dropdownRef.current?.contains(target) ||
      !!target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
  );

  const Icon =
    PROPERTY_TYPE_ICON[prop.type as keyof typeof PROPERTY_TYPE_ICON] ??
    TextTIcon;
  const propConfig = (prop.config ?? {}) as PropConfig;
  const menuItemCount = 2 + (prop.isSystem ? 0 : 1); // Rename, [Edit property], Delete property
  const menuHeight = menuItemCount * 32 + 9 + 8; // items + 1 divider + padding
  const menuWidth = 190;

  function commitRename() {
    const n = draftName.trim();
    if (n && n !== prop.name) {
      onRename(prop.id, n);
    }
    setRenaming(false);
    setMenuOpen(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {propConfig.icon ? (
            <PageIcon className="shrink-0" icon={propConfig.icon} size={12} />
          ) : (
            <Icon className="shrink-0 text-base-content/70" size={12} />
          )}
          {/* Renames inline, in place of the label — matches components/database/table-view.tsx's
         SortableColumnHeader instead of popping a disconnected floating box elsewhere. */}
          {renaming ? (
            <input
              className="min-w-0 flex-1 rounded-xs border border-primary/60 bg-base-200 px-1 py-0.5 text-xs font-semibold text-base-content outline-none"
              onBlur={commitRename}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitRename();
                }
                if (e.key === "Escape") {
                  setRenaming(false);
                }
              }}
              ref={inputRef}
              value={draftName}
            />
          ) : (
            <span className="truncate text-xs font-semibold text-base-content/70 tracking-wide">
              {prop.name}
            </span>
          )}
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          {!locked && (
            <button
              className="flex size-5 items-center justify-center rounded text-base-content/70 opacity-0 group-hover/col:opacity-100 hover:bg-base-200 hover:text-base-content transition-all"
              onClick={() => {
                if (!menuOpen) {
                  setMenuRect(
                    triggerRef.current?.getBoundingClientRect() ?? null
                  );
                }
                setMenuOpen((p) => !p);
              }}
              ref={triggerRef}
              type="button"
            >
              <DotsThreeIcon size={14} />
            </button>
          )}

          {menuOpen &&
            !editingProperty &&
            menuRect &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                className="w-47.5 rounded-md border border-base-300 bg-base-100 p-1"
                ref={dropdownRef}
                style={{
                  position: "fixed",
                  top: getClampedTop(menuRect, menuHeight),
                  left: getClampedLeft(menuRect, menuWidth, { align: "end" }),
                  zIndex: 500,
                }}
              >
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                  onClick={() => {
                    setDraftName(prop.name);
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <PencilSimpleIcon size={13} /> Rename
                </button>
                {!prop.isSystem && (
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                    onClick={() => setEditingProperty(true)}
                    type="button"
                  >
                    <GearIcon size={13} /> Edit property
                  </button>
                )}
                <div className="my-1 h-px bg-base-300" />
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-error hover:bg-error/10 transition-colors"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  type="button"
                >
                  <TrashIcon size={13} /> Delete property
                </button>
              </div>,
              document.body
            )}

          {menuOpen && editingProperty && (
            <EditPropertySidePanel
              canDelete={!prop.isSystem}
              getAnchorRect={getEditPropertyAnchorRect}
              onBack={() => setEditingProperty(false)}
              onClose={() => {
                setEditingProperty(false);
                setMenuOpen(false);
              }}
              onDeleteProperty={async () => onDelete(prop.id)}
              onDuplicateProperty={async () => onDuplicateProperty(prop)}
              onUpdateProperty={async (patch) =>
                onUpdateProperty(prop.id, patch)
              }
              properties={properties as unknown as DbProperty[]}
              property={prop as unknown as DbProperty}
              viewContext={
                activeView && onUpdateView
                  ? {
                      override:
                        (
                          activeView.propertyOverrides as
                            | Record<string, ViewPropertyOverride>
                            | undefined
                        )?.[prop.id] ?? {},
                      onUpdateOverride: (patch) =>
                        onUpdateView({
                          propertyOverrides: {
                            ...(activeView.propertyOverrides as
                              | Record<string, ViewPropertyOverride>
                              | undefined),
                            [prop.id]: {
                              ...((
                                activeView.propertyOverrides as
                                  | Record<string, ViewPropertyOverride>
                                  | undefined
                              )?.[prop.id] ?? {}),
                              ...patch,
                            },
                          },
                        }),
                    }
                  : undefined
              }
              workspaceId={workspaceId}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        confirmLabel="Delete property"
        description={`"${prop.name}" and all its data will be permanently removed. This cannot be undone.`}
        onConfirm={() => {
          onDelete(prop.id);
          setConfirmDelete(false);
        }}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        title="Delete property?"
      />
    </>
  );
}

// ── Add property panel ────────────────────────────────────────────────────────

const PROP_TYPES = Object.values(PROPERTY_REGISTRY);

function AddPropertyPanel({
  rect,
  properties,
  workspaceId,
  databaseId,
  onAdd,
  onClose,
}: {
  rect: DOMRect;
  properties: DbProperty[];
  workspaceId: string;
  databaseId: string;
  onAdd: (
    name: string,
    type: string,
    config?: Record<string, unknown>,
    twoWay?: boolean
  ) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [step, setStep] = useState<"name" | "type">("name");
  const [pickingRelation, setPickingRelation] = useState(false);
  const [pickingRollup, setPickingRollup] = useState(false);
  const [pickingFormula, setPickingFormula] = useState(false);
  // Captured once when a sub-picker opens: `ref`'s div unmounts then, so recomputing from `ref.current` would go stale/collapse to 0,0.
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  function openSubPicker(setter: (v: boolean) => void) {
    setPickerRect(ref.current?.getBoundingClientRect() ?? null);
    setter(true);
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      // Sub-pickers (Relation/Rollup/Formula) replace this panel's own JSX
      // entirely and render as their own portal — without this guard, the very
      // click that opens one (or any interaction inside it) reads as "outside"
      // this panel's own ref and closes everything before it can be used.
      if (pickingRelation || pickingRollup || pickingFormula) {
        return;
      }
      if (!ref.current?.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, pickingRelation, pickingRollup, pickingFormula]);
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));

  function submit(
    type: string,
    config?: Record<string, unknown>,
    twoWay?: boolean
  ) {
    const n = name.trim();
    if (!n) {
      return;
    }
    onAdd(n, type, config, twoWay);
    onClose();
  }

  const subPickerRect = pickerRect ?? new DOMRect(0, 0, 0, 0);

  if (pickingRelation) {
    return (
      <RelationDatabasePicker
        onBack={() => setPickingRelation(false)}
        onClose={onClose}
        onPick={(relatedDatabaseId, twoWay) =>
          submit("relation", { relatedDatabaseId }, twoWay)
        }
        rect={subPickerRect}
        workspaceId={workspaceId}
      />
    );
  }
  if (pickingRollup) {
    return (
      <RollupConfigPicker
        onBack={() => setPickingRollup(false)}
        onClose={onClose}
        onPick={(config) => submit("rollup", config)}
        properties={properties}
        rect={subPickerRect}
      />
    );
  }
  if (pickingFormula) {
    return (
      <FormulaConfigPicker
        databaseId={databaseId}
        onBack={() => setPickingFormula(false)}
        onClose={onClose}
        onPick={(expression) => submit("formula", { expression })}
        properties={properties}
        rect={subPickerRect}
      />
    );
  }

  const panelWidth = 240;
  const panelHeight = step === "name" ? 140 : 340;

  return createPortal(
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-100"
      ref={ref}
      style={{
        position: "fixed",
        top: getClampedTop(rect, panelHeight),
        left: getClampedLeft(rect, panelWidth, { align: "end" }),
        zIndex: 500,
        width: panelWidth,
      }}
    >
      {step === "name" ? (
        <>
          <div className="border-b border-base-300 px-4 py-3">
            <span className="text-sm font-semibold">New property</span>
          </div>
          <div className="p-3">
            <input
              className="w-full rounded-sm border border-base-300 bg-base-200 px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  setStep("type");
                }
                if (e.key === "Escape") {
                  onClose();
                }
              }}
              placeholder="Property name…"
              ref={inputRef}
              value={name}
            />
            <button
              className="mt-2 w-full rounded-sm bg-primary py-1.5 text-xs font-semibold text-primary-content disabled:opacity-40 hover:bg-primary/90 transition-colors"
              disabled={!name.trim()}
              onClick={() => name.trim() && setStep("type")}
              type="button"
            >
              Continue →
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-base-300 px-4 py-3">
            <button
              className="text-base-content/70 hover:text-base-content text-xs transition-colors"
              onClick={() => setStep("name")}
              type="button"
            >
              ← Back
            </button>
            <span className="text-sm font-semibold">Choose type</span>
          </div>
          <div className="max-h-72 overflow-y-auto p-2">
            {PROP_TYPES.map((def) => {
              const Icon =
                PROPERTY_TYPE_ICON[
                  def.type as keyof typeof PROPERTY_TYPE_ICON
                ] ?? TextTIcon;
              return (
                <button
                  className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm hover:bg-base-200 transition-colors"
                  key={def.type}
                  onClick={() => {
                    if (def.type === "relation") {
                      openSubPicker(setPickingRelation);
                    } else if (def.type === "rollup") {
                      openSubPicker(setPickingRollup);
                    } else if (def.type === "formula") {
                      openSubPicker(setPickingFormula);
                    } else {
                      submit(def.type);
                    }
                  }}
                  type="button"
                >
                  <Icon className="shrink-0 text-base-content/70" size={14} />
                  {def.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

// ── Inline title input ────────────────────────────────────────────────────────

function InlineTitleInput({
  entryId,
  initialTitle,
  onSave,
}: {
  entryId: string;
  initialTitle: string;
  onSave: (id: string, title: string) => void;
}) {
  const [val, setVal] = useState(initialTitle);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    onSave(entryId, val);
  }

  return (
    <input
      className="w-full bg-transparent text-sm font-medium text-base-content outline-none"
      onBlur={commit}
      onChange={(e) => {
        setVal(e.target.value);
        window.dispatchEvent(
          new CustomEvent("pagevo:page-title-changed", {
            detail: { pageId: entryId, title: e.target.value },
          })
        );
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        }
        if (e.key === "Escape") {
          onSave(entryId, initialTitle);
        }
      }}
      placeholder="Untitled"
      ref={ref}
      value={val}
    />
  );
}

// ── Cell renderer ─────────────────────────────────────────────────────────────

function CellContent({
  prop,
  raw,
  activeView,
  workspaceId,
  onSave,
  onEditProperty,
  onUpdateProperty,
  onEditingChange,
}: {
  prop: DatabaseProperty;
  raw: unknown;
  activeView?: DatabaseView | null;
  workspaceId: string;
  onSave: (v: unknown) => void;
  onEditProperty: (propId: string, rect: DOMRect) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const config = (prop.config ?? {}) as PropConfig;
  const options = config.options ?? [];
  const resolvedDisplayAs = resolveDisplayAs(
    prop as unknown as DbProperty,
    activeView as unknown as DbView | null | undefined
  );
  const resolvedWrapContent = resolveWrapContent(
    prop as unknown as DbProperty,
    activeView as unknown as DbView | null | undefined
  );
  // Status keeps its own already-tuned flat dropdown untouched; every other
  // Select/Multi-select gets the proper Notion-style popover (search,
  // create-with-colored-badge, drag reorder) via CellEditorPopover.
  const isStatus = !!config.groupedByStatus;

  switch (prop.type) {
    case "text": {
      const tv = raw as TextVal | null;
      return (
        <EditableCell
          onEditingChange={onEditingChange}
          onSave={onSave}
          placeholder="Empty"
          type="text"
          value={tv?.text}
        />
      );
    }
    case "number": {
      const nv = raw as NumberVal | null;
      return (
        <EditableCell
          onEditingChange={onEditingChange}
          onSave={onSave}
          placeholder="—"
          type="number"
          value={nv?.number}
        />
      );
    }
    case "date":
      return (
        <DateCell
          onEditingChange={onEditingChange}
          onSave={onSave}
          property={prop}
          value={raw as DateVal | null}
          workspaceId={workspaceId}
        />
      );
    case "email": {
      const ev = raw as EmailVal | null;
      return (
        <EditableCell
          onEditingChange={onEditingChange}
          onSave={onSave}
          placeholder="Empty"
          type="email"
          value={ev?.email}
        />
      );
    }
    case "url": {
      const uv = raw as UrlVal | null;
      return (
        <EditableCell
          onEditingChange={onEditingChange}
          onSave={onSave}
          placeholder="Empty"
          type="url"
          value={uv?.url}
        />
      );
    }
    case "select":
      if (isStatus) {
        return (
          <SelectCell
            config={config}
            onEditProperty={(rect) => onEditProperty(prop.id, rect)}
            onSave={onSave}
            options={options}
            resolvedDisplayAs={resolvedDisplayAs}
            resolvedWrapContent={resolvedWrapContent}
            value={raw as SelectVal | null}
          />
        );
      }
      return (
        <SelectPopoverCell
          config={config}
          multi={false}
          onEditProperty={(rect) => onEditProperty(prop.id, rect)}
          onSave={onSave}
          onUpdateProperty={onUpdateProperty}
          options={options}
          property={prop}
          resolvedDisplayAs={resolvedDisplayAs}
          resolvedWrapContent={resolvedWrapContent}
          value={raw as SelectVal | null}
          workspaceId={workspaceId}
        />
      );
    case "multi_select":
      if (isStatus) {
        return (
          <MultiSelectCell
            config={config}
            onEditProperty={(rect) => onEditProperty(prop.id, rect)}
            onSave={onSave}
            options={options}
            resolvedDisplayAs={resolvedDisplayAs}
            resolvedWrapContent={resolvedWrapContent}
            value={raw as MultiSelectVal | null}
          />
        );
      }
      return (
        <SelectPopoverCell
          config={config}
          multi
          onEditProperty={(rect) => onEditProperty(prop.id, rect)}
          onSave={onSave}
          onUpdateProperty={onUpdateProperty}
          options={options}
          property={prop}
          resolvedDisplayAs={resolvedDisplayAs}
          resolvedWrapContent={resolvedWrapContent}
          value={raw as MultiSelectVal | null}
          workspaceId={workspaceId}
        />
      );
    case "checkbox":
      return (
        <div className="flex items-center px-1">
          <CheckboxCell onSave={onSave} value={raw as CheckboxVal | null} />
        </div>
      );
    case "person":
      return (
        <PersonCell
          onSave={onSave}
          property={prop}
          value={raw as PersonVal | null}
          workspaceId={workspaceId}
        />
      );
    case "files":
      return (
        <FileCell
          onSave={onSave}
          property={prop}
          value={
            raw as {
              files?: {
                id: string;
                url: string;
                name: string;
                mimeType: string;
                sizeBytes: number;
              }[];
            } | null
          }
          workspaceId={workspaceId}
        />
      );
    // Computed server-side from the entry's own creator, same as Rollup/Formula
    // — read-only, no editor popover (there's nothing for a user to pick).
    case "created_by": {
      const pv = raw as PersonVal | null;
      const hasValue = (pv?.userIds?.length ?? 0) > 0;
      return (
        <div className="flex min-h-6 w-full items-center px-1 py-0.5">
          {hasValue ? (
            <CellDisplay
              property={prop as unknown as DbProperty}
              value={pv}
              workspaceId={workspaceId}
            />
          ) : (
            <span className="text-xs text-base-content/70">Empty</span>
          )}
        </div>
      );
    }
    case "phone": {
      const pv = raw as { phone?: string } | null;
      return (
        <EditableCell
          onEditingChange={onEditingChange}
          onSave={(v) =>
            onSave(v ? { phone: (v as { text: string }).text } : null)
          }
          placeholder="Empty"
          type="text"
          value={pv?.phone}
        />
      );
    }
    default:
      return <span className="px-1 text-xs text-base-content/70">—</span>;
  }
}

// ── Sortable row ──────────────────────────────────────────────────────────────

interface SortableRowProps {
  activeView: DatabaseView | null | undefined;
  deleteTarget: string | null;
  editingTitleId: string | null;
  entry: TemplateEntry;
  entryValueMap: Map<string, Map<string, unknown>>;
  locked?: boolean;
  onClickEntry: (entryId: string) => void;
  onDuplicateEntry: (id: string) => void;
  onEditProperty: (propId: string, rect: DOMRect) => void;
  onSaveTitle: (entryId: string, title: string) => void;
  onSetDeleteTarget: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  selectedIds: Set<string>;
  visibleProps: DatabaseProperty[];
  workspaceId: string;
  workspaceSlug: string;
}

function SortableRow({
  entry,
  visibleProps,
  entryValueMap,
  workspaceSlug,
  workspaceId,
  selectedIds,
  editingTitleId,
  deleteTarget,
  activeView,
  onToggleSelect,
  onSaveTitle,
  onClickEntry,
  onUpdatePropValue,
  onSetDeleteTarget,
  onDuplicateEntry,
  onEditProperty,
  onUpdateProperty,
  locked,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled: locked });
  const [rowHovered, setRowHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Comment popover — tracks which cell (propId) it was opened from, plus a
  // frozen snapshot of that property's name/value for the quoted reference.
  const [commentPopover, setCommentPopover] = useState<{
    rect: DOMRect;
    propId: string | null;
    propName: string | null;
    valueLabel: string | null;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Portal-based per-cell hover overlay (comment + copy icons)
  const [hoveredCell, setHoveredCell] = useState<{
    propId: string;
    prop: DatabaseProperty;
    rawVal: unknown;
    rect: DOMRect;
  } | null>(null);
  // Which property (if any) is currently being typed into — the hover overlay
  // must not show while the user is actively editing a cell, matching Notion
  // (and matching the main workspace table view's behavior).
  const [editingPropId, setEditingPropId] = useState<string | null>(null);
  const [copiedPropId, setCopiedPropId] = useState<string | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Raw per-property comment list for this row, fetched once and used to derive
  // a per-cell comment badge count (comments are scoped to a property).
  const [rowComments, setRowComments] = useState<Array<{
    blockId: string | null;
    deletedAt: string | null;
    propertyId: string | null;
  }> | null>(null);
  const commentsFetchedRef = useRef(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  // entry.commentCount is batch-computed server-side; shadowed in local state
  // so the row badge can bump instantly when a new page-level comment is
  // added via commentPopover below, instead of waiting on the next full fetch.
  const [rowCommentCount, setRowCommentCount] = useState(
    entry.commentCount ?? 0
  );
  useEffect(() => {
    setRowCommentCount(entry.commentCount ?? 0);
  }, [entry.commentCount]);

  // Only touches a ref, so it has no reactive inputs — memoized with an empty
  // dep list so the hover effect below (and the child that receives it as a
  // prop) stop re-subscribing on every render.
  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);
  function scheduleLeave() {
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => setHoveredCell(null), 150);
  }

  // Unlike click-opened menus (which lock scroll), this passive hover overlay just dismisses on scroll — capture phase so an ancestor scroll is seen.
  useEffect(() => {
    if (!hoveredCell) {
      return;
    }
    function handleScroll() {
      clearLeaveTimer();
      setHoveredCell(null);
    }
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [hoveredCell, clearLeaveTimer]);

  function fetchRowComments() {
    if (commentsFetchedRef.current) {
      return;
    }
    commentsFetchedRef.current = true;
    fetch(`/api/pages/${entry.id}/comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setRowComments(
            data.comments as Array<{
              blockId: string | null;
              deletedAt: string | null;
              propertyId: string | null;
            }>
          );
        }
      })
      .catch(() => {});
  }

  function commentCountFor(propId: string | null): number | null {
    if (!rowComments) {
      return null;
    }
    return rowComments.filter(
      (c) => !c.blockId && !c.deletedAt && c.propertyId === propId
    ).length;
  }

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function h(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSelected = selectedIds.has(entry.id);
  const isEditing = editingTitleId === entry.id;
  const valMap = entryValueMap.get(entry.id) ?? new Map<string, unknown>();
  const isRowHovered = rowHovered && !menuOpen;

  return (
    <>
      <tr
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={`group/row border-b border-base-300 transition-colors ${isSelected ? "bg-primary/5" : deleteTarget ? "" : "hover:bg-base-200/20"}`}
        onMouseEnter={() => setRowHovered(true)}
        onMouseLeave={() => setRowHovered(false)}
        suppressHydrationWarning
      >
        {/* Drag handle + row actions (Notion style: 6-dot grip, click for menu) */}
        <td
          className="w-6 px-0.5 py-0"
          style={{ touchAction: "none", userSelect: "none" }}
        >
          <div className="relative" ref={menuRef}>
            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: KNOWN A11Y DEBT, deliberately not "fixed" here — same case as the row drag handle in table-view.tsx. dnd-kit's spread listeners are a sensor set whose KeyboardSensor claims Space/Enter on a focusable element; those are the same keys a button uses to fire onClick, so converting this handle would make dragging and the row menu fight over one keystroke. The fix is to split drag and menu into separate affordances, which needs browser verification. */}
            <div
              {...listeners}
              className="flex size-5 cursor-grab items-center justify-center rounded text-base-content/0 hover:bg-base-200 hover:text-base-content/70 transition-colors active:cursor-grabbing group-hover/row:text-base-content/50"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((p) => !p);
              }}
              onMouseEnter={(e) => showTooltip("Drag · Click for actions", e)}
              onMouseLeave={hideTooltip}
            >
              <GripVertical size={13} />
            </div>

            {menuOpen && (
              <div className="absolute left-0 top-full z-500 mt-0.5 w-47.5 rounded-md border border-base-300 bg-neutral p-1">
                <Link
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                  href={`/app/${workspaceSlug}/${entry.shortId}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <ArrowSquareOutIcon size={13} /> Open full page
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                  onClick={(e) => {
                    setCommentPopover({
                      rect: (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect(),
                      propId: null,
                      propName: null,
                      valueLabel: null,
                    });
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <MessageSquareIcon size={13} /> Comment
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                  onClick={() => {
                    if (typeof window !== "undefined" && navigator.clipboard) {
                      navigator.clipboard
                        .writeText(
                          `${window.location.origin}/app/${workspaceSlug}/${entry.shortId}`
                        )
                        .catch(() => {});
                    }
                    toast.success("Link copied to clipboard", {
                      duration: 2000,
                    });
                    setMenuOpen(false);
                  }}
                  type="button"
                >
                  <Link2Icon size={13} /> Copy link
                </button>
                {!locked && (
                  <>
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-base-content hover:bg-base-200 transition-colors"
                      onClick={() => {
                        onDuplicateEntry(entry.id);
                        setMenuOpen(false);
                      }}
                      type="button"
                    >
                      <CopyIcon size={13} /> Duplicate
                    </button>
                    <div className="my-1 h-px bg-base-300" />
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-error hover:bg-error/10 transition-colors"
                      onClick={() => {
                        setMenuOpen(false);
                        onSetDeleteTarget(entry.id);
                      }}
                      type="button"
                    >
                      <TrashIcon size={13} /> Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </td>

        {/* Checkbox */}
        <td className="w-8 px-2 py-0">
          <button
            className={`flex size-3.5 items-center justify-center rounded border text-xs font-bold transition-all ${isSelected ? "border-primary bg-primary text-primary-content opacity-100" : "border-base-300 opacity-0 group-hover/row:opacity-100 hover:border-primary/60"}`}
            onClick={() => onToggleSelect(entry.id)}
            type="button"
          >
            {isSelected ? "✓" : ""}
          </button>
        </td>

        {/* Title */}
        <td className="py-1.5 pl-1 pr-2">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              {isEditing ? (
                <InlineTitleInput
                  entryId={entry.id}
                  initialTitle={entry.title}
                  onSave={onSaveTitle}
                />
              ) : (
                <button
                  className="w-full rounded px-0.5 text-left text-sm font-medium hover:bg-base-200/40 transition-colors"
                  onClick={() => onClickEntry(entry.id)}
                  type="button"
                >
                  {entry.title ? (
                    <span className="text-base-content">{entry.title}</span>
                  ) : (
                    <span className="text-base-content/70">Untitled</span>
                  )}
                </button>
              )}
            </div>

            {!!rowCommentCount && (
              <button
                className="flex shrink-0 items-center gap-1 rounded-sm px-1 text-[11px] text-base-content/70 transition-opacity duration-150 hover:bg-base-200 hover:text-base-content"
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentPopover({
                    rect: (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect(),
                    propId: null,
                    propName: null,
                    valueLabel: null,
                  });
                }}
                onMouseEnter={(e) => showTooltip("View comments", e)}
                onMouseLeave={hideTooltip}
                style={{ opacity: isRowHovered ? 1 : 0 }}
                type="button"
              >
                <MessageSquareIcon size={11} />
                {rowCommentCount}
              </button>
            )}

            {/* Row quick action: OPEN */}
            <div
              className="ml-auto flex shrink-0 items-center transition-opacity duration-150"
              style={{ opacity: isRowHovered ? 1 : 0 }}
            >
              <Link
                className="flex items-center gap-0.75 rounded-sm border border-base-300 bg-base-200 px-1.5 py-0.75 text-2xs font-semibold tracking-wide text-base-content/70 hover:border-primary/40 hover:bg-base-200/60 hover:text-base-content transition-colors"
                href={`/app/${workspaceSlug}/${entry.shortId}`}
                onMouseEnter={(e) => showTooltip("Open full page", e)}
                onMouseLeave={hideTooltip}
              >
                <FileText size={9} />
                OPEN
              </Link>
            </div>
          </div>
        </td>

        {/* Property cells */}
        {visibleProps.map((p) => (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: not a control — onClickCapture is a capture-phase *suppressor* that swallows clicks while the template is locked, and onMouseEnter only positions the hover action overlay. Neither activates anything, so there is no behaviour to make keyboard-reachable; when the template is unlocked the cell's real editors are focusable elements inside.
          <td
            // pr-7 (not px-1 on the right) reserves a gutter matching the hover
            // CellActionOverlay's comment/copy icon zone — otherwise wide badge
            // content truncates flush to the cell edge and the icons render
            // directly on top of it on hover (same fix as table-view.tsx).
            className="group/cell relative overflow-hidden pl-1 pr-7 py-0.5 transition-colors hover:bg-base-200/40"
            key={p.id}
            onClickCapture={(e) => {
              if (locked) {
                e.stopPropagation();
              }
            }}
            onMouseEnter={(e) => {
              clearLeaveTimer();
              if (!commentPopover && editingPropId !== p.id) {
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setHoveredCell({
                  propId: p.id,
                  prop: p,
                  rawVal: valMap.get(p.id),
                  rect,
                });
                fetchRowComments();
              }
            }}
            onMouseLeave={scheduleLeave}
          >
            <CellContent
              activeView={activeView}
              onEditingChange={(editing) => {
                if (editing) {
                  clearLeaveTimer();
                  setHoveredCell(null);
                  setEditingPropId(p.id);
                } else if (editingPropId === p.id) {
                  setEditingPropId(null);
                }
              }}
              onEditProperty={onEditProperty}
              onSave={(v) => onUpdatePropValue(entry.id, p.id, v)}
              onUpdateProperty={onUpdateProperty}
              prop={p}
              raw={valMap.get(p.id)}
              workspaceId={workspaceId}
            />
          </td>
        ))}

        {/* Spacer */}
        <td />
      </tr>

      {/* Portal overlay — comment + copy icons on cell hover. Skipped entirely
      for "created_by" — it's a computed, read-only value with nothing
      meaningful to comment on or copy per-cell (same reasoning as it having
      no click-to-edit interaction either). */}
      {hoveredCell &&
        hoveredCell.prop.type !== "created_by" &&
        typeof document !== "undefined" &&
        createPortal(
          <CellActionOverlay
            canCopy={
              !BADGE_TYPES.has(hoveredCell.prop.type) &&
              !!getPropertyText(hoveredCell.prop, hoveredCell.rawVal)
            }
            commentCount={commentCountFor(hoveredCell.propId)}
            copied={copiedPropId === hoveredCell.propId}
            onClearLeaveTimer={clearLeaveTimer}
            onCommentClick={(btnRect) => {
              if (!commentPopover) {
                clearLeaveTimer();
                setHoveredCell(null);
              }
              setCommentPopover(
                commentPopover
                  ? null
                  : {
                      rect: btnRect,
                      propId: hoveredCell.propId,
                      propName: hoveredCell.prop.name,
                      valueLabel: getPropertyText(
                        hoveredCell.prop,
                        hoveredCell.rawVal
                      ),
                    }
              );
            }}
            onCopyClick={() => {
              const txt = getPropertyText(hoveredCell.prop, hoveredCell.rawVal);
              if (!txt) {
                return;
              }
              const apply = () => {
                setCopiedPropId(hoveredCell.propId);
                setTimeout(() => setCopiedPropId(null), 1500);
              };
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard
                  .writeText(txt)
                  .then(apply)
                  .catch(() => {
                    try {
                      const el = document.createElement("textarea");
                      el.value = txt;
                      el.style.cssText =
                        "position:fixed;opacity:0;top:0;left:0;";
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                      apply();
                    } catch {}
                  });
              }
            }}
            onScheduleLeave={scheduleLeave}
            rect={hoveredCell.rect}
          />,
          document.body
        )}

      {commentPopover &&
        createPortal(
          <CellCommentPopover
            anchorRect={commentPopover.rect}
            entryShortId={entry.shortId}
            onClose={() => {
              setCommentPopover(null);
              commentsFetchedRef.current = false;
            }}
            onCommentAdded={() => {
              setRowComments((prev) => [
                ...(prev ?? []),
                {
                  blockId: null,
                  deletedAt: null,
                  propertyId: commentPopover.propId,
                },
              ]);
              if (commentPopover.propId === null) {
                setRowCommentCount((c) => c + 1);
              }
            }}
            pageId={entry.id}
            propertyId={commentPopover.propId}
            propertyName={commentPopover.propName}
            propertyValueLabel={commentPopover.valueLabel}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />,
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

// ── Main table view ───────────────────────────────────────────────────────────

interface Props {
  activeView?: DatabaseView | null;
  databaseId: string;
  editingTitleId: string | null;
  entries: TemplateEntry[];
  entryValueMap: Map<string, Map<string, unknown>>;
  /** Every "Edit property" popup anchors here (the toolbar's New button) instead of to whatever triggered it — always the same, predictable spot. */
  getEditPropertyAnchorRect: () => DOMRect;
  locked?: boolean;
  onAddEntry: (defaultValues?: Record<string, unknown>) => Promise<void>;
  onAddProperty: (
    name: string,
    type: string,
    config?: Record<string, unknown>,
    twoWay?: boolean
  ) => void;
  onClickEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteProperty: (propId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onRenameProperty: (propId: string, name: string) => void;
  onSaveTitle: (entryId: string, title: string) => void;
  onStartEditTitle: (entryId: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
  properties: DatabaseProperty[];
  selectedIds: Set<string>;
  workspaceId: string;
  workspaceSlug: string;
}

export function TemplateTableView({
  entries,
  properties,
  entryValueMap,
  workspaceSlug,
  workspaceId,
  databaseId,
  selectedIds,
  editingTitleId,
  onToggleSelect,
  onToggleSelectAll,
  onAddEntry,
  onSaveTitle,
  onClickEntry,
  onUpdatePropValue,
  onDeleteEntry,
  onDuplicateEntry,
  onAddProperty,
  onRenameProperty,
  onUpdateProperty,
  onDeleteProperty,
  getEditPropertyAnchorRect,
  activeView,
  onUpdateView,
  locked = false,
}: Props) {
  const [addPropRect, setAddPropRect] = useState<DOMRect | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editPropPanel, setEditPropPanel] = useState<{ propId: string } | null>(
    null
  );

  const visibleProps = properties.filter((p) => !p.isHidden);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const _handleAdd = useCallback(async () => {
    await onAddEntry();
  }, [onAddEntry]);

  // Reset local order when the underlying entries list changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLocalOrder([]);
  }, []);

  const orderedEntries =
    localOrder.length > 0
      ? (localOrder
          .map((id) => entries.find((e) => e.id === id))
          .filter(Boolean) as TemplateEntry[])
      : entries;

  const draggingEntry = draggingId
    ? entries.find((e) => e.id === draggingId)
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over || active.id === over.id) {
      return;
    }
    const base = localOrder.length > 0 ? localOrder : entries.map((e) => e.id);
    const oldIdx = base.indexOf(String(active.id));
    const newIdx = base.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) {
      return;
    }
    setLocalOrder(arrayMove(base, oldIdx, newIdx));
  }

  return (
    <>
      <div className="relative isolate">
        <DndContext
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <table
            className="w-full border-collapse"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              {/* Drag handle col */}
              <col style={{ width: "24px" }} />
              <col style={{ width: "32px" }} />
              <col style={{ minWidth: "260px", width: "35%" }} />
              {visibleProps.map((p) => (
                <col key={p.id} style={{ minWidth: "140px", width: "160px" }} />
              ))}
              <col style={{ width: "140px" }} />
            </colgroup>

            {/* Header */}
            <thead className="sticky top-0 z-200 bg-base-100">
              <tr className="border-b border-base-300">
                {/* Drag handle column header (empty) */}
                <th className="w-6 px-0.5 py-2.5" />

                {/* Select-all */}
                <th className="w-8 px-2 py-2.5 text-left">
                  <button
                    className={`flex size-3.5 items-center justify-center rounded border text-xs font-bold transition-colors ${allSelected ? "border-primary bg-primary text-primary-content" : someSelected ? "border-primary/60 bg-primary/10" : "border-base-300 hover:border-primary/60"}`}
                    onClick={onToggleSelectAll}
                    type="button"
                  >
                    {allSelected ? "✓" : someSelected ? "−" : ""}
                  </button>
                </th>

                {/* Title column */}
                <th className="py-2.5 pl-1 pr-4 text-left">
                  <span className="text-xs font-semibold tracking-wide text-base-content/70">
                    Name
                  </span>
                </th>

                {/* Property columns */}
                {visibleProps.map((p) => (
                  <th className="group/col px-3 py-2.5 text-left" key={p.id}>
                    <ColumnHeader
                      activeView={activeView}
                      getEditPropertyAnchorRect={getEditPropertyAnchorRect}
                      locked={locked}
                      onDelete={onDeleteProperty}
                      onDuplicateProperty={(prop) =>
                        onAddProperty(
                          `${prop.name} (copy)`,
                          prop.type,
                          prop.config as Record<string, unknown>
                        )
                      }
                      onRename={onRenameProperty}
                      onUpdateProperty={onUpdateProperty}
                      onUpdateView={onUpdateView}
                      prop={p}
                      properties={properties}
                      workspaceId={workspaceId}
                    />
                  </th>
                ))}

                {/* Add property */}
                <th className="px-2 py-2.5 text-left">
                  {!locked && (
                    <div className="relative">
                      <button
                        className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                        onClick={(e) =>
                          setAddPropRect(
                            addPropRect
                              ? null
                              : (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect()
                          )
                        }
                        type="button"
                      >
                        <PlusIcon size={12} /> Add property
                      </button>
                      {addPropRect && (
                        <AddPropertyPanel
                          databaseId={databaseId}
                          onAdd={(name, type, config, twoWay) => {
                            onAddProperty(name, type, config, twoWay);
                            setAddPropRect(null);
                          }}
                          onClose={() => setAddPropRect(null)}
                          properties={properties as unknown as DbProperty[]}
                          rect={addPropRect}
                          workspaceId={workspaceId}
                        />
                      )}
                    </div>
                  )}
                </th>
              </tr>
            </thead>

            {/* Body */}
            <SortableContext
              items={orderedEntries.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {orderedEntries.map((entry) => (
                  <SortableRow
                    activeView={activeView}
                    deleteTarget={deleteTarget}
                    editingTitleId={editingTitleId}
                    entry={entry}
                    entryValueMap={entryValueMap}
                    key={entry.id}
                    locked={locked}
                    onClickEntry={onClickEntry}
                    onDuplicateEntry={onDuplicateEntry}
                    onEditProperty={(propId) => setEditPropPanel({ propId })}
                    onSaveTitle={onSaveTitle}
                    onSetDeleteTarget={setDeleteTarget}
                    onToggleSelect={onToggleSelect}
                    onUpdateProperty={onUpdateProperty}
                    onUpdatePropValue={onUpdatePropValue}
                    selectedIds={selectedIds}
                    visibleProps={visibleProps}
                    workspaceId={workspaceId}
                    workspaceSlug={workspaceSlug}
                  />
                ))}

                {/* Empty state */}
                {entries.length === 0 && (
                  <tr>
                    <td
                      className="py-16 text-center"
                      colSpan={visibleProps.length + 4}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-base-content/70">
                          No entries yet
                        </p>
                        <p className="text-xs text-base-content/70">
                          Click &quot;+ New&quot; below to add your first row
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </SortableContext>
          </table>

          {/* Drag overlay */}
          <DragOverlay>
            {draggingEntry && (
              <div className="flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm font-medium text-base-content">
                <GripVertical className="text-base-content/50" size={13} />
                {draggingEntry.title || "Untitled"}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
      <ConfirmDialog
        confirmLabel="Delete"
        confirmLoadingLabel="Deleting…"
        description="This entry will be permanently deleted. This cannot be undone."
        loading={deletingEntry}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }
          setDeletingEntry(true);
          await onDeleteEntry(deleteTarget);
          setDeletingEntry(false);
          setDeleteTarget(null);
        }}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        open={!!deleteTarget}
        title="Delete entry?"
      />
      {editPropPanel &&
        (() => {
          const panelProp = properties.find(
            (p) => p.id === editPropPanel.propId
          );
          if (!panelProp) {
            return null;
          }
          return (
            <EditPropertySidePanel
              canDelete={!panelProp.isSystem}
              getAnchorRect={getEditPropertyAnchorRect}
              key={panelProp.id}
              onClose={() => setEditPropPanel(null)}
              onDeleteProperty={async () => onDeleteProperty(panelProp.id)}
              onDuplicateProperty={async () =>
                onAddProperty(
                  `${panelProp.name} (copy)`,
                  panelProp.type,
                  panelProp.config as Record<string, unknown>
                )
              }
              onUpdateProperty={async (patch) =>
                onUpdateProperty(panelProp.id, patch)
              }
              properties={properties as unknown as DbProperty[]}
              property={panelProp as unknown as DbProperty}
              viewContext={
                activeView && onUpdateView
                  ? {
                      override:
                        (
                          activeView.propertyOverrides as
                            | Record<string, ViewPropertyOverride>
                            | undefined
                        )?.[panelProp.id] ?? {},
                      onUpdateOverride: (patch) =>
                        onUpdateView({
                          propertyOverrides: {
                            ...(activeView.propertyOverrides as
                              | Record<string, ViewPropertyOverride>
                              | undefined),
                            [panelProp.id]: {
                              ...((
                                activeView.propertyOverrides as
                                  | Record<string, ViewPropertyOverride>
                                  | undefined
                              )?.[panelProp.id] ?? {}),
                              ...patch,
                            },
                          },
                        }),
                    }
                  : undefined
              }
              workspaceId={workspaceId}
            />
          );
        })()}
    </>
  );
}
