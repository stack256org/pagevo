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
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ExternalLink as ArrowSquareOut,
  Copy as CopyIcon,
  EyeOff as EyeSlash,
  FileText,
  Settings2 as GearIcon,
  GripVertical,
  Link2 as Link2Icon,
  MessageSquare as MessageSquareIcon,
  Pencil as PencilIcon,
  Plus,
  ArrowUp as SortAscending,
  ArrowDown as SortDescending,
  Table2,
  Type as TextT,
  Trash2 as Trash,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { CellActionOverlay } from "@/components/database/cell-action-overlay";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { CellEditorPopover } from "@/components/database/cells/cell-editor";
import { EditPropertySidePanel } from "@/components/database/edit-property-panel";
import { FormulaConfigPicker } from "@/components/database/formula-config-picker";
import {
  deriveGroups,
  getEntryGroupIds,
  isGroupableType,
} from "@/components/database/grouping";
import {
  formatDateValue,
  getOptionColor,
  PROPERTY_REGISTRY,
  PROPERTY_TYPE_ICON,
} from "@/components/database/property-registry";
import { RelationDatabasePicker } from "@/components/database/relation-database-picker";
import { RollupConfigPicker } from "@/components/database/rollup-config-picker";
import type {
  DbEntry,
  DbProperty,
  SelectOption,
  SharedViewProps,
} from "@/components/database/types";
import {
  resolveDisplayAs,
  resolvePropertyOrder,
  resolveWrapContent,
} from "@/components/database/view-property-resolver";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";
import { getClampedLeft, getClampedTop } from "@/lib/ui/clamp-to-viewport";

// ── Constants ────────────────────────────────────────────────────────────────

const TEXT_TYPES = new Set(["text", "number", "url", "email", "phone"]);
const POPUP_TYPES = new Set([
  "select",
  "status",
  "multi_select",
  "date",
  "person",
  "relation",
  "files",
]);
// Badge-style properties (colored pill values) intentionally get comment-only
// hover actions — no copy-to-clipboard, unlike plain-value properties.
const BADGE_TYPES = new Set(["select", "status", "multi_select"]);

// ── Property text helper (for clipboard copy) ────────────────────────────────
function getPropertyText(prop: DbProperty, rawVal: unknown): string {
  if (!rawVal) {
    return "";
  }
  const v = rawVal as Record<string, unknown>;
  switch (prop.type) {
    case "text":
      return String(v.text ?? "");
    case "number":
      return v.number == null ? "" : String(v.number);
    case "url":
      return String(v.url ?? "");
    case "email":
      return String(v.email ?? "");
    case "phone":
      return String(v.phone ?? "");
    case "checkbox":
      return (v as { checked?: boolean }).checked ? "Yes" : "No";
    case "date":
      return formatDateValue(v);
    case "select":
    case "status": {
      const optId = (v as { optionId?: string | null }).optionId;
      if (!optId) {
        return "";
      }
      const opts = (prop.config?.options ?? []) as SelectOption[];
      return opts.find((o) => o.id === optId)?.name ?? "";
    }
    case "multi_select": {
      const ids = (v as { optionIds?: string[] }).optionIds ?? [];
      const opts = (prop.config?.options ?? []) as SelectOption[];
      return ids
        .map((id) => opts.find((o) => o.id === id)?.name ?? "")
        .filter(Boolean)
        .join(", ");
    }
    default:
      return "";
  }
}

const DRAG_COL_W = 44;
const IDX_COL_W = 48;
const TITLE_COL_W = 300;
const DEFAULT_COL_W = 180;
const MIN_COL_W = 80;
const ROW_H = 40;

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveCell {
  entryId: string;
  propId: string;
}
interface EditPop {
  entryId: string;
  propId: string;
  rect: DOMRect;
}
interface PropMenuState {
  propId: string;
  rect: DOMRect;
}
interface AddPropState {
  rect: DOMRect;
}
interface RowMenuState {
  entryId: string;
  rect: DOMRect;
  shortId: string;
}

// ── SortableTableRow ─────────────────────────────────────────────────────────

interface SortableTableRowProps {
  activateCell: (
    entryId: string,
    propId: string,
    e: React.SyntheticEvent
  ) => void;
  activeCell: ActiveCell | null;
  activeView: SharedViewProps["activeView"];
  addBtnW: number;
  cellInputRef: React.RefObject<HTMLInputElement | null>;
  colW: (id: string) => number;
  commitText: (entryId: string, propId: string, val: string) => void;
  deleteConfirm: { entryId: string } | null;
  editPop: EditPop | null;
  editValue: string;
  entry: DbEntry;
  getRaw: (entryId: string, propId: string) => unknown;
  hoveredRowId: string | null;
  isEditor: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onOpenEntry: ((entry: DbEntry) => void) | undefined;
  onSelectEntry: (id: string, selected: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  rowIdx: number;
  rowMenu: RowMenuState | null;
  selectedEntryIds: Set<string>;
  setActiveCell: (cell: ActiveCell | null) => void;
  setEditValue: (val: string) => void;
  setRowMenu: (menu: RowMenuState | null) => void;
  visible: DbProperty[];
  workspaceId: string;
  workspaceSlug: string;
}

function SortableTableRow({
  entry,
  rowIdx,
  visible,
  activeCell,
  editPop,
  editValue,
  cellInputRef,
  selectedEntryIds,
  hoveredRowId,
  deleteConfirm,
  isEditor,
  rowMenu,
  workspaceId,
  workspaceSlug,
  addBtnW,
  activeView,
  colW,
  onMouseEnter,
  onMouseLeave,
  onSelectEntry,
  onUpdateTitle,
  onOpenEntry,
  setActiveCell,
  setEditValue,
  setRowMenu,
  activateCell,
  commitText,
  getRaw,
}: SortableTableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });
  // Comment popover — tracks which cell (propId) it was opened from, plus a
  // frozen snapshot of that property's name/value for the quoted reference.
  const [commentPopover, setCommentPopover] = useState<{
    rect: DOMRect;
    propId: string | null;
    propName: string | null;
    valueLabel: string | null;
  } | null>(null);
  // Raw per-property comment list for this row, fetched once and used to derive
  // a per-cell comment badge count (comments are scoped to a property now).
  const [rowComments, setRowComments] = useState<Array<{
    blockId: string | null;
    deletedAt: string | null;
    propertyId: string | null;
  }> | null>(null);
  const commentsFetchedRef = useRef(false);
  const [copiedPropId, setCopiedPropId] = useState<string | null>(null);
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

  // Portal-based hover overlay state
  const [hoveredCell, setHoveredCell] = useState<{
    propId: string;
    prop: DbProperty;
    rawVal: unknown;
    rect: DOMRect;
  } | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Passive hover overlay: scrolling dismisses it rather than locking the table's scroll.
  // Listen in the capture phase to catch scroll on the table's ancestor container.
  useEffect(() => {
    if (!hoveredCell) {
      return;
    }
    function handleScroll() {
      clearLeaveTimer();
      setHoveredCell(null);
    }
    // Self-healing: `onMouseLeave` can be skipped (e.g. pointer jumps straight onto a
    // newly-mounted popup), so validate against real cursor position on every move too.
    const rect = hoveredCell.rect;
    function handleMove(e: MouseEvent) {
      const r = rect;
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      ) {
        clearLeaveTimer();
        setHoveredCell(null);
      }
    }
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("mousemove", handleMove);
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("mousemove", handleMove);
    };
  }, [hoveredCell, clearLeaveTimer]);

  // Belt-and-suspenders vs. the mouseenter handler's own check: guards any future
  // non-click activation path, matching Notion (icons never show while editing).
  useEffect(() => {
    if (activeCell?.entryId === entry.id) {
      setHoveredCell(null);
    }
  }, [activeCell, entry.id]);

  // Same reasoning for the popup-editor case: Chromium can re-dispatch a synthetic
  // mouseenter once the popup portal mounts, re-setting hoveredCell after the inline
  // clear ran — this commit-phase effect clears it again to close that race.
  useEffect(() => {
    if (editPop?.entryId === entry.id) {
      setHoveredCell(null);
    }
  }, [editPop, entry.id]);

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSelected = selectedEntryIds.has(entry.id);
  const isRowHovered = hoveredRowId === entry.id && !deleteConfirm;

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: row container, not a control — its only handlers track which row is hovered so the row-action icons can fade in. Nothing is activated here; the row's real actions (open, drag handle, per-cell edit) are their own focusable elements inside, so this element has no behaviour of its own to expose to keyboard users. */}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={[
          "flex items-stretch db-border-b transition-colors duration-100",
          isSelected
            ? "bg-primary/5"
            : deleteConfirm
              ? ""
              : "hover:bg-base-200/40",
        ].join(" ")}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Drag handle + context menu (left column, Notion style) */}
        <div
          className="flex shrink-0 items-center justify-center gap-0"
          style={{
            width: DRAG_COL_W,
            minWidth: DRAG_COL_W,
            minHeight: ROW_H,
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {isEditor && (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: KNOWN A11Y DEBT, deliberately not "fixed" here. Making this a <button> is the obvious move, but {...listeners} is dnd-kit's sensor set: on a focusable element its KeyboardSensor claims Space/Enter to begin a drag, which are exactly the keys a button uses to fire onClick. Converting this handle would make row dragging and the row menu fight over the same keystrokes. The right fix is to split the two affordances (drag handle vs. a separate menu button), which is a UI change needing browser verification — not a lint edit. The same actions are already reachable by right-clicking the row.
            <div
              {...listeners}
              className="flex size-6 cursor-grab items-center justify-center rounded text-base-content/50 hover:bg-base-200 hover:text-base-content/70 transition-colors active:cursor-grabbing"
              onClick={(e) => {
                e.stopPropagation();
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setRowMenu(
                  rowMenu?.entryId === entry.id
                    ? null
                    : { entryId: entry.id, shortId: entry.shortId, rect }
                );
              }}
              onMouseEnter={(e) => showTooltip("Drag · Click for actions", e)}
              onMouseLeave={hideTooltip}
              style={{
                opacity: isRowHovered ? 1 : 0,
                transition: "opacity 150ms",
              }}
            >
              <GripVertical size={13} />
            </div>
          )}
        </div>

        {/* Checkbox / index */}
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: IDX_COL_W, minWidth: IDX_COL_W, minHeight: ROW_H }}
        >
          {isEditor ? (
            <label className="relative flex size-5 cursor-pointer items-center justify-center">
              {/* Row number — fades out on hover/select */}
              <span
                className="absolute select-none text-xs tabular-nums text-base-content/70 transition-opacity duration-150"
                style={{ opacity: isSelected || isRowHovered ? 0 : 1 }}
              >
                {rowIdx + 1}
              </span>
              {/* Checkbox — fades in on hover/select */}
              <input
                checked={isSelected}
                className="checkbox checkbox-xs checkbox-primary absolute transition-opacity duration-150"
                onChange={(e) => onSelectEntry(entry.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                style={{ opacity: isSelected || isRowHovered ? 1 : 0 }}
                type="checkbox"
              />
            </label>
          ) : (
            <span className="select-none text-xs tabular-nums text-base-content/70">
              {rowIdx + 1}
            </span>
          )}
        </div>

        {/* Title cell */}
        <div
          className="flex shrink-0 items-center gap-2.5 px-3"
          style={{
            width: TITLE_COL_W,
            minWidth: TITLE_COL_W,
            minHeight: ROW_H,
            borderRight: "1px solid var(--color-border)",
          }}
        >
          {entry.icon ? (
            <PageIcon className="shrink-0" icon={entry.icon} size={14} />
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-xs border border-base-300 bg-base-200/20">
              <FileText className="text-base-content/70" size={11} />
            </span>
          )}

          {activeCell?.entryId === entry.id &&
          activeCell.propId === "__title__" ? (
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-base-content focus:outline-none"
              onBlur={() => {
                onUpdateTitle(entry.id, editValue);
                setActiveCell(null);
              }}
              onChange={(e) => {
                setEditValue(e.target.value);
                window.dispatchEvent(
                  new CustomEvent("pagevo:page-title-changed", {
                    detail: { pageId: entry.id, title: e.target.value },
                  })
                );
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Tab") {
                  onUpdateTitle(entry.id, editValue);
                  setActiveCell(null);
                  e.preventDefault();
                }
                if (e.key === "Escape") {
                  setActiveCell(null);
                }
              }}
              placeholder="Untitled"
              ref={cellInputRef}
              value={editValue}
            />
          ) : (
            // A real <button>: opening the entry is the row's primary action,
            // so it has to be reachable by keyboard. Contents are text only and
            // the enclosing row is a plain div, so there is no nested-button
            // problem. text-left keeps the title left-aligned against the
            // button default.
            <button
              className={`min-w-0 flex-1 truncate text-left text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                entry.title ? "text-base-content" : "text-base-content/70"
              }`}
              onClick={() => {
                const inPanelMode =
                  (activeView?.entryOpenMode ?? "side_panel") === "side_panel";
                if (inPanelMode && onOpenEntry) {
                  onOpenEntry(entry);
                } else if (isEditor) {
                  setActiveCell({ entryId: entry.id, propId: "__title__" });
                  setEditValue(entry.title ?? "");
                }
              }}
              type="button"
            >
              {entry.title || "Untitled"}
            </button>
          )}

          {!!rowCommentCount && (
            <button
              className="badge badge-sm flex shrink-0 items-center gap-1 rounded-sm border-none bg-transparent px-1 text-[11px] text-base-content/70 transition-opacity duration-150 hover:bg-base-200 hover:text-base-content"
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
              className="badge badge-sm flex items-center gap-0.75 rounded-sm border border-base-300 bg-base-200 px-1.5 py-0.75 text-2xs font-semibold tracking-wide text-base-content/70 hover:border-primary/40 hover:bg-base-200/60 hover:text-base-content transition-colors"
              href={`/app/${workspaceSlug}/${entry.shortId}`}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => showTooltip("Open full page", e)}
              onMouseLeave={hideTooltip}
            >
              <FileText size={9} />
              OPEN
            </Link>
          </div>
        </div>

        {/* Property cells */}
        {visible.map((prop) => {
          const rawVal = getRaw(entry.id, prop.id);
          const isActive =
            activeCell?.entryId === entry.id && activeCell.propId === prop.id;
          return (
            // biome-ignore lint/a11y/useSemanticElements: renders an <input> for inline editing, and interactive content can't nest inside a <button>
            <div
              className={[
                // pr-8 (not px-3 on the right) reserves a gutter matching the hover
                // CellActionOverlay's comment/copy icon zone (cell-action-overlay.tsx)
                // — without it, wide badge/text content truncates flush to the cell's
                // true edge and the icons render directly on top of it on hover.
                "relative flex min-w-0 shrink-0 cursor-pointer items-center overflow-hidden pl-3 pr-8 transition-colors duration-100",
                isActive
                  ? "bg-primary/5 border-l border-primary/30"
                  : "hover:bg-base-200/40",
              ].join(" ")}
              key={prop.id}
              onClick={(e) => {
                setHoveredCell(null);
                activateCell(entry.id, prop.id, e);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") {
                  return;
                }
                e.preventDefault();
                setHoveredCell(null);
                activateCell(entry.id, prop.id, e);
              }}
              onMouseEnter={(e) => {
                clearLeaveTimer();
                // Suppressed for ANY open popup, not just this cell — a popup can visually
                // extend well past its trigger cell (e.g. files editor on a short row).
                if (!isActive && !editPop && !commentPopover) {
                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  setHoveredCell({ propId: prop.id, prop, rawVal, rect });
                  fetchRowComments();
                }
              }}
              onMouseLeave={scheduleLeave}
              role="button"
              style={{
                width: colW(prop.id),
                minWidth: colW(prop.id),
                minHeight: ROW_H,
              }}
              tabIndex={isEditor ? 0 : undefined}
            >
              {isActive && TEXT_TYPES.has(prop.type) ? (
                <input
                  className="w-full bg-transparent text-sm text-base-content focus:outline-none"
                  onBlur={() => commitText(entry.id, prop.id, editValue)}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Tab") {
                      commitText(entry.id, prop.id, editValue);
                      e.preventDefault();
                    }
                    if (e.key === "Escape") {
                      setActiveCell(null);
                    }
                  }}
                  ref={cellInputRef}
                  type={prop.type === "number" ? "number" : "text"}
                  value={editValue}
                />
              ) : rawVal ? (
                <CellDisplay
                  compact
                  property={prop}
                  resolvedDisplayAs={resolveDisplayAs(prop, activeView)}
                  resolvedWrapContent={resolveWrapContent(prop, activeView)}
                  value={rawVal}
                  workspaceId={workspaceId}
                />
              ) : (
                <>
                  <CellDisplay
                    compact
                    property={prop}
                    resolvedDisplayAs={resolveDisplayAs(prop, activeView)}
                    resolvedWrapContent={resolveWrapContent(prop, activeView)}
                    value={rawVal}
                    workspaceId={workspaceId}
                  />
                  {isEditor && TEXT_TYPES.has(prop.type) && (
                    <span className="pointer-events-none select-none text-sm text-base-content/70">
                      Type…
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}

        {isEditor && (
          <div
            className="shrink-0"
            style={{ width: addBtnW, minHeight: ROW_H }}
          />
        )}
      </div>

      {/* Portal overlay — rendered to document.body, completely outside table DOM.
      `!editPop` is a belt-and-suspenders guard here (not just in the
      onMouseEnter handler that sets hoveredCell) — it doesn't matter how or
      when hoveredCell got set, this overlay must never render while a cell
      popup is open, since the popup can visually extend over other rows. */}
      {hoveredCell &&
        !editPop &&
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
                setHoveredCell(null); // dismiss overlay when popover opens
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

      {commentPopover && (
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
        />
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

// ── TableView ────────────────────────────────────────────────────────────────

export function TableView({
  databaseId,
  workspaceId,
  workspaceSlug,
  entries,
  properties,
  valueMap,
  activeView,
  isEditor,
  onUpdateValue,
  onUpdateTitle,
  onCreateEntry,
  onAddProperty,
  onUpdateProperty,
  onDeleteProperty,
  onUpdateView,
  onDeleteEntry,
  onDuplicateEntry,
  selectedEntryIds,
  onSelectEntry,
  onOpenEntry,
}: SharedViewProps) {
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editPop, setEditPop] = useState<EditPop | null>(null);
  const [propMenu, setPropMenu] = useState<PropMenuState | null>(null);
  const [editPropPanel, setEditPropPanel] = useState<{
    propId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [addPropMenu, setAddPropMenu] = useState<AddPropState | null>(null);
  const [propName, setPropName] = useState("");
  const [renamingProp, setRenamingProp] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);
  const [rowCommentTarget, setRowCommentTarget] = useState<{
    entryId: string;
    rect: DOMRect;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    entryId: string;
  } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const cellInputRef = useRef<HTMLInputElement>(null);
  const scrollHeaderRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  // DnD state: when grouped, keyed by group id; when ungrouped, keyed by "__flat__"
  const [localEntryOrder, setLocalEntryOrder] = useState<Map<string, string[]>>(
    new Map()
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const { data: session } = useSession();

  const hiddenIds = new Set((activeView?.hiddenPropertyIds ?? []) as string[]);
  const visible = resolvePropertyOrder(
    properties.filter((p) => !p.isSystem && !hiddenIds.has(p.id)),
    activeView
  );

  const allSelected =
    entries.length > 0 && entries.every((e) => selectedEntryIds.has(e.id));
  const someSelected = entries.some((e) => selectedEntryIds.has(e.id));

  function getRaw(entryId: string, propId: string) {
    return valueMap.get(entryId)?.get(propId) ?? null;
  }
  function getTextVal(entryId: string, propId: string): string {
    const v = getRaw(entryId, propId) as Record<string, unknown> | null;
    const prop = visible.find((p) => p.id === propId);
    if (!prop) {
      return "";
    }
    return String(v?.[prop.type as keyof typeof v] ?? "");
  }
  // Local state is only the live-drag buffer — the persisted width lives in
  // this view's own propertyOverrides, so resizing a column in Table never
  // affects any other view (none of which have columns anyway).
  function colW(id: string) {
    return (
      colWidths[id] ??
      activeView?.propertyOverrides?.[id]?.width ??
      DEFAULT_COL_W
    );
  }

  function activateCell(
    entryId: string,
    propId: string,
    e: React.SyntheticEvent
  ) {
    if (!isEditor) {
      return;
    }
    const prop = visible.find((p) => p.id === propId);
    if (!prop) {
      return;
    }
    if (prop.type === "checkbox") {
      const cur = getRaw(entryId, propId) as { checked?: boolean } | null;
      onUpdateValue(entryId, propId, { checked: !(cur?.checked ?? false) });
      return;
    }
    // Vote-mode person: toggle the current viewer's own vote directly, same
    // as the checkbox case above — never opens the people picker, so there's
    // no path from this cell to editing anyone else's vote. The server
    // enforces the same self-only rule independently either way.
    if (prop.type === "person" && prop.config?.voteMode) {
      if (!session?.user?.id) {
        return;
      }
      onUpdateValue(
        entryId,
        propId,
        toggleSelfVote(
          getRaw(entryId, propId) as { userIds?: string[] } | null,
          session.user
        )
      );
      return;
    }
    if (TEXT_TYPES.has(prop.type)) {
      setActiveCell({ entryId, propId });
      setEditValue(getTextVal(entryId, propId));
      setTimeout(() => cellInputRef.current?.focus(), 0);
      return;
    }
    if (POPUP_TYPES.has(prop.type)) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setEditPop({ entryId, propId, rect });
    }
  }

  function commitText(entryId: string, propId: string, raw: string) {
    const prop = visible.find((p) => p.id === propId);
    if (!prop) {
      return;
    }
    const val =
      prop.type === "number"
        ? { number: raw === "" ? null : Number(raw) }
        : { [prop.type]: raw };
    onUpdateValue(entryId, propId, val);
    setActiveCell(null);
  }

  // Column resize
  function startResize(propId: string, startX: number, startW: number) {
    let finalW = startW;
    function onMove(e: MouseEvent) {
      finalW = Math.max(MIN_COL_W, startW + (e.clientX - startX));
      setColWidths((prev) => ({ ...prev, [propId]: finalW }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (finalW !== startW) {
        onUpdateView({
          propertyOverrides: {
            ...activeView?.propertyOverrides,
            [propId]: {
              ...(activeView?.propertyOverrides?.[propId] ?? {}),
              width: finalW,
            },
          },
        });
      }
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Reordering only ever drags among currently-VISIBLE columns — hidden ones
  // keep their existing relative slots in the saved order untouched, so
  // un-hiding a property later doesn't drop it somewhere unexpected.
  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = visible.findIndex((p) => p.id === active.id);
    const newIndex = visible.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const newVisibleOrder = arrayMove(visible, oldIndex, newIndex).map(
      (p) => p.id
    );
    const fullOrder = resolvePropertyOrder(
      properties.filter((p) => !p.isSystem),
      activeView
    ).map((p) => p.id);
    const visibleIds = new Set(visible.map((p) => p.id));
    let vi = 0;
    const merged = fullOrder.map((id) =>
      visibleIds.has(id) ? newVisibleOrder[vi++] : id
    );
    onUpdateView({ propertyOrder: merged });
  }

  const propsW = visible.reduce((s, p) => s + colW(p.id), 0);
  const addBtnW = isEditor ? 52 : 0;
  const totalW = DRAG_COL_W + IDX_COL_W + TITLE_COL_W + propsW + addBtnW;

  // Grouping
  const groupPropId = activeView?.groupByPropertyId;
  const groupProp = groupPropId
    ? properties.find((p) => p.id === groupPropId && isGroupableType(p.type))
    : null;

  type RowGroup = {
    id: string | null;
    label: string;
    color: string | null;
    entries: DbEntry[];
  };
  let rowGroups: RowGroup[] | null = null;
  if (groupProp) {
    const gMap = new Map<string | null, RowGroup>();
    gMap.set(null, {
      id: null,
      label: `No ${groupProp.name}`,
      color: null,
      entries: [],
    });
    for (const g of deriveGroups(groupProp, entries, valueMap)) {
      gMap.set(g.id, { ...g, entries: [] });
    }
    for (const e of entries) {
      const val = valueMap.get(e.id)?.get(groupPropId!) ?? null;
      for (const key of getEntryGroupIds(groupProp, val)) {
        (gMap.get(key) ?? gMap.get(null)!).entries.push(e);
      }
    }
    rowGroups = [...gMap.values()].filter(
      (g) => g.entries.length > 0 || g.id === null
    );
  }

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Reset local order when entries change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLocalEntryOrder(new Map());
  }, []);

  const draggingEntry = draggingId
    ? entries.find((e) => e.id === draggingId)
    : null;

  function getOrderedEntries(
    groupKey: string,
    groupEntries: DbEntry[]
  ): DbEntry[] {
    const order = localEntryOrder.get(groupKey);
    if (!order || order.length === 0) {
      return groupEntries;
    }
    return order
      .map((id) => groupEntries.find((e) => e.id === id))
      .filter(Boolean) as DbEntry[];
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(
    groupKey: string,
    groupEntries: DbEntry[],
    event: DragEndEvent
  ) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over || active.id === over.id) {
      return;
    }
    const currentOrder = localEntryOrder.get(groupKey);
    const base =
      currentOrder && currentOrder.length > 0
        ? currentOrder
        : groupEntries.map((e) => e.id);
    const oldIdx = base.indexOf(String(active.id));
    const newIdx = base.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) {
      return;
    }
    setLocalEntryOrder((prev) => {
      const next = new Map(prev);
      next.set(groupKey, arrayMove(base, oldIdx, newIdx));
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col bg-base-100 isolate">
      {/* ═══════════ HEADER — fixed at top, clipped, synced horizontally ═══════════ */}
      <div
        className="shrink-0 overflow-hidden bg-base-200 db-header-b"
        ref={scrollHeaderRef}
      >
        <div style={{ minWidth: totalW, paddingRight: 32 }}>
          <div className="flex items-stretch">
            {/* Drag handle header (empty) */}
            <div
              className="shrink-0 bg-base-200/30"
              style={{ width: DRAG_COL_W, minWidth: DRAG_COL_W }}
            />

            {/* Checkbox / select-all */}
            <div
              className="flex shrink-0 items-center justify-center bg-base-200/30"
              style={{ width: IDX_COL_W, minWidth: IDX_COL_W }}
            >
              {isEditor && (
                <label className="flex cursor-pointer items-center justify-center">
                  <input
                    checked={allSelected}
                    className="checkbox checkbox-xs checkbox-primary"
                    onChange={(e) => {
                      for (const entry of entries) {
                        onSelectEntry(entry.id, e.target.checked);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = someSelected && !allSelected;
                      }
                    }}
                    type="checkbox"
                  />
                </label>
              )}
            </div>

            {/* Name header */}
            <div
              className="flex shrink-0 items-center gap-2 bg-base-200/30 px-3 py-0"
              style={{
                width: TITLE_COL_W,
                minWidth: TITLE_COL_W,
                height: 34,
                borderRight: "1px solid var(--color-border)",
              }}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-xs bg-base-200/60">
                <TextT className="text-base-content/70" size={10} />
              </span>
              <span className="text-xs font-semibold text-base-content/70 tracking-wide">
                Name
              </span>
            </div>

            {/* Property headers — draggable to reorder, saved per-view (propertyOrder) */}
            <DndContext onDragEnd={handleColumnDragEnd} sensors={sensors}>
              <SortableContext
                items={visible.map((p) => p.id)}
                strategy={horizontalListSortingStrategy}
              >
                {visible.map((prop) => (
                  <SortableColumnHeader
                    isEditor={isEditor}
                    isRenaming={renamingProp === prop.id}
                    key={prop.id}
                    onCancelRename={() => setRenamingProp(null)}
                    onCommitRename={() => {
                      if (renameVal.trim()) {
                        onUpdateProperty(prop.id, { name: renameVal.trim() });
                      }
                      setRenamingProp(null);
                    }}
                    onOpenMenu={(rect) =>
                      setPropMenu(
                        propMenu?.propId === prop.id
                          ? null
                          : { propId: prop.id, rect }
                      )
                    }
                    onRenameChange={setRenameVal}
                    onStartResize={(clientX) =>
                      startResize(prop.id, clientX, colW(prop.id))
                    }
                    prop={prop}
                    renameVal={renameVal}
                    width={colW(prop.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* Add property */}
            {isEditor && (
              <div
                className="shrink-0"
                style={{ width: addBtnW, minWidth: addBtnW, height: 34 }}
              >
                <button
                  className="flex size-full items-center justify-center text-base-content/70 transition-colors hover:bg-base-200/60 hover:text-base-content/70"
                  onClick={(e) => {
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    setAddPropMenu(addPropMenu ? null : { rect });
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => showTooltip("Add property", e)}
                  onMouseLeave={hideTooltip}
                  type="button"
                >
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ SCROLLABLE BODY — fills remaining height, both axes ═══════════ */}
      <div
        className="flex-1 overflow-auto pb-20"
        onScroll={(e) => {
          if (scrollHeaderRef.current) {
            scrollHeaderRef.current.scrollLeft = (
              e.currentTarget as HTMLDivElement
            ).scrollLeft;
          }
        }}
        ref={scrollBodyRef}
      >
        <div style={{ minWidth: totalW, paddingRight: 32 }}>
          {/* ═══════════ ROWS ═══════════ */}
          {(
            rowGroups ??
            ([{ id: null, label: "", color: null, entries }] as RowGroup[])
          ).flatMap((group) => {
            const groupKey = group.id ?? "__flat__";
            const orderedGroupEntries = getOrderedEntries(
              groupKey,
              group.entries
            );

            const groupHeader = rowGroups && (
              <div
                className="flex items-center gap-2.5 border-b border-base-300 bg-base-200/20 px-3 py-2"
                key={`gh-${groupKey}`}
              >
                {group.id && group.color ? (
                  (() => {
                    const c = getOptionColor(group.color);
                    return (
                      <span
                        className="badge badge-sm inline-flex items-center gap-1.5 rounded-xs border-none px-2.5 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: c.bg, color: c.text }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: c.dot }}
                        />
                        {group.label}
                      </span>
                    );
                  })()
                ) : (
                  <span className="badge badge-sm inline-flex items-center gap-1.5 rounded-xs border-none bg-base-200 px-2.5 py-0.5 text-xs font-semibold text-base-content/70">
                    <span className="size-1.5 rounded-full bg-base-content/30" />
                    {group.label}
                  </span>
                )}
                <span className="text-xs text-base-content/70">
                  {group.entries.length}
                </span>
              </div>
            );

            const dndRows = (
              <DndContext
                key={`dnd-${groupKey}`}
                onDragEnd={(event) =>
                  handleDragEnd(groupKey, group.entries, event)
                }
                onDragStart={handleDragStart}
                sensors={sensors}
              >
                <SortableContext
                  items={orderedGroupEntries.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedGroupEntries.map((entry, rowIdx) => (
                    <SortableTableRow
                      activateCell={activateCell}
                      activeCell={activeCell}
                      activeView={activeView}
                      addBtnW={addBtnW}
                      cellInputRef={cellInputRef}
                      colW={colW}
                      commitText={commitText}
                      deleteConfirm={deleteConfirm}
                      editPop={editPop}
                      editValue={editValue}
                      entry={entry}
                      getRaw={getRaw}
                      hoveredRowId={hoveredRowId}
                      isEditor={isEditor}
                      key={entry.id}
                      onMouseEnter={() => {
                        if (!deleteConfirm) {
                          setHoveredRowId(entry.id);
                        }
                      }}
                      onMouseLeave={() => setHoveredRowId(null)}
                      onOpenEntry={onOpenEntry}
                      onSelectEntry={onSelectEntry}
                      onUpdateTitle={onUpdateTitle}
                      rowIdx={rowIdx}
                      rowMenu={rowMenu}
                      selectedEntryIds={selectedEntryIds}
                      setActiveCell={setActiveCell}
                      setEditValue={setEditValue}
                      setRowMenu={setRowMenu}
                      visible={visible}
                      workspaceId={workspaceId}
                      workspaceSlug={workspaceSlug}
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {draggingEntry && (
                    <div className="flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm font-medium text-base-content">
                      <GripVertical
                        className="text-base-content/50"
                        size={13}
                      />
                      {draggingEntry.title || "Untitled"}
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            );

            return groupHeader ? [groupHeader, dndRows] : [dndRows];
          })}

          {/* ═══════════ EMPTY STATE ═══════════ */}
          {entries.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-6 py-24">
              <div className="flex size-14 items-center justify-center rounded-lg border border-base-300 bg-base-200/50">
                <Table2 className="text-base-content/70" size={24} />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-base-content">
                  No entries yet
                </p>
                <p className="mt-1.5 text-sm text-base-content/70">
                  Add your first entry to start building your database
                </p>
              </div>
              {isEditor && (
                <button
                  className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition-colors duration-150"
                  onClick={() => onCreateEntry()}
                  type="button"
                >
                  <Plus size={14} />
                  Add first entry
                </button>
              )}
            </div>
          )}

          {/* ═══════════ ADD ROW ═══════════ */}
          {isEditor && entries.length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content cursor-pointer w-full"
                onClick={() => onCreateEntry()}
                type="button"
              >
                <Plus size={13} />
                <span>New entry</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ PORTALS ═══════════ */}

      {rowMenu && isEditor && (
        <RowContextMenu
          menu={rowMenu}
          onClose={() => setRowMenu(null)}
          onCommentClick={(rect) => {
            setRowCommentTarget({ entryId: rowMenu.entryId, rect });
            setRowMenu(null);
          }}
          onDeleteRequest={() => {
            setDeleteConfirm({ entryId: rowMenu.entryId });
            setRowMenu(null);
            setHoveredRowId(null);
          }}
          onDuplicate={
            onDuplicateEntry
              ? () => {
                  onDuplicateEntry(rowMenu.entryId);
                  setRowMenu(null);
                }
              : undefined
          }
          workspaceSlug={workspaceSlug}
        />
      )}

      {rowCommentTarget && (
        <CellCommentPopover
          anchorRect={rowCommentTarget.rect}
          entryShortId={
            entries.find((e) => e.id === rowCommentTarget.entryId)?.shortId ??
            ""
          }
          onClose={() => setRowCommentTarget(null)}
          pageId={rowCommentTarget.entryId}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      )}

      <ConfirmDialog
        confirmLabel="Delete"
        confirmLoadingLabel="Deleting…"
        description="This entry and all its content will be permanently deleted. This action cannot be undone."
        loading={deletingEntry}
        onConfirm={async () => {
          if (!deleteConfirm) {
            return;
          }
          setDeletingEntry(true);
          await onDeleteEntry(deleteConfirm.entryId);
          setDeletingEntry(false);
          setDeleteConfirm(null);
        }}
        onOpenChange={(o) => !o && setDeleteConfirm(null)}
        open={!!deleteConfirm}
        title="Delete entry?"
      />

      {propMenu && isEditor && (
        <PropHeaderMenu
          activeView={activeView}
          menu={propMenu}
          onClose={() => setPropMenu(null)}
          onDelete={async (id) => {
            await onDeleteProperty(id);
            setPropMenu(null);
          }}
          onDuplicateProperty={async (prop) => {
            await onAddProperty(`${prop.name} (copy)`, prop.type, prop.config);
          }}
          onHide={(id) => {
            onUpdateView({
              hiddenPropertyIds: [
                ...((activeView?.hiddenPropertyIds ?? []) as string[]),
                id,
              ],
            });
            setPropMenu(null);
          }}
          onRename={(id) => {
            const p = visible.find((x) => x.id === id);
            if (p) {
              setRenamingProp(id);
              setRenameVal(p.name);
            }
            setPropMenu(null);
          }}
          onSort={(id, dir) => {
            onUpdateView({ sorts: [{ propertyId: id, direction: dir }] });
            setPropMenu(null);
          }}
          onUpdateProperty={onUpdateProperty}
          onUpdateView={onUpdateView}
          prop={visible.find((p) => p.id === propMenu.propId)}
          properties={properties}
          workspaceId={workspaceId}
        />
      )}

      {addPropMenu && isEditor && (
        <AddPropertyMenu
          databaseId={databaseId}
          onAdd={async (name, type, config, twoWay) => {
            await onAddProperty(name, type, config, twoWay);
            setAddPropMenu(null);
            setPropName("");
          }}
          onClose={() => {
            setAddPropMenu(null);
            setPropName("");
          }}
          onNameChange={setPropName}
          properties={properties}
          propName={propName}
          rect={addPropMenu.rect}
          workspaceId={workspaceId}
        />
      )}

      {editPop && (
        <CellEditorPopover
          cellRect={editPop.rect}
          onClose={() => setEditPop(null)}
          onEditProperty={(rect) =>
            setEditPropPanel({ propId: editPop.propId, anchorRect: rect })
          }
          onPropertyConfigChange={(propId, config) =>
            onUpdateProperty(propId, { config })
          }
          onSave={(val) => onUpdateValue(editPop.entryId, editPop.propId, val)}
          property={visible.find((p) => p.id === editPop.propId)!}
          value={getRaw(editPop.entryId, editPop.propId)}
          workspaceId={workspaceId}
          // Same z-index override used elsewhere in this file — without it this
          // shares CellActionOverlay's own z-index (200), so whichever mounted
          // more recently wins the stack and a hovered comment/copy icon on a
          // different row can render on top of this still-open popup.
          zIndex={300}
        />
      )}

      {editPropPanel &&
        (() => {
          const panelProp = visible.find((p) => p.id === editPropPanel.propId);
          if (!panelProp) {
            return null;
          }
          return (
            <EditPropertySidePanel
              canDelete={!panelProp.isSystem}
              getAnchorRect={() => editPropPanel.anchorRect}
              key={panelProp.id}
              onClose={() => setEditPropPanel(null)}
              onDeleteProperty={() => onDeleteProperty(panelProp.id)}
              onDuplicateProperty={async () => {
                await onAddProperty(
                  `${panelProp.name} (copy)`,
                  panelProp.type,
                  panelProp.config
                );
              }}
              onUpdateProperty={(patch) =>
                onUpdateProperty(panelProp.id, patch)
              }
              properties={properties}
              property={panelProp}
              viewContext={
                activeView
                  ? {
                      override:
                        activeView.propertyOverrides?.[panelProp.id] ?? {},
                      onUpdateOverride: (patch) =>
                        onUpdateView({
                          propertyOverrides: {
                            ...activeView.propertyOverrides,
                            [panelProp.id]: {
                              ...(activeView.propertyOverrides?.[
                                panelProp.id
                              ] ?? {}),
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
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}

// ── SortableColumnHeader ─────────────────────────────────────────────────────

interface SortableColumnHeaderProps {
  isEditor: boolean;
  isRenaming: boolean;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onOpenMenu: (rect: DOMRect) => void;
  onRenameChange: (val: string) => void;
  onStartResize: (clientX: number) => void;
  prop: DbProperty;
  renameVal: string;
  width: number;
}

function SortableColumnHeader({
  prop,
  width,
  isEditor,
  isRenaming,
  renameVal,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onOpenMenu,
  onStartResize,
}: SortableColumnHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: prop.id, disabled: !isEditor });
  const style: React.CSSProperties = {
    width,
    minWidth: width,
    height: 34,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const Icon =
    PROPERTY_TYPE_ICON[prop.type as keyof typeof PROPERTY_TYPE_ICON] ?? TextT;
  const propConfig = (prop.config ?? {}) as { icon?: string };

  return (
    <div className="group relative shrink-0" ref={setNodeRef} style={style}>
      {isRenaming ? (
        <input
          autoFocus
          className="h-full w-full bg-transparent px-3 text-xs font-semibold text-base-content/70 focus:outline-none"
          onBlur={onCommitRename}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onCommitRename();
            }
            if (e.key === "Escape") {
              onCancelRename();
            }
          }}
          value={renameVal}
        />
      ) : (
        <button
          className="flex h-full w-full items-center gap-1.5 bg-base-200/30 px-3 transition-colors hover:bg-base-200/60"
          onClick={(e) => {
            if (!isEditor) {
              return;
            }
            onOpenMenu(
              (e.currentTarget as HTMLElement).getBoundingClientRect()
            );
          }}
          onMouseDown={(e) => e.stopPropagation()}
          type="button"
        >
          {isEditor && (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: column drag handle nested *inside* the header <button>, so it cannot itself become a button — that would be invalid nested-interactive HTML. Its onClick is only a stopPropagation guard so grabbing the handle does not also open the header menu; dragging is dnd-kit's pointer listeners, which have no discrete activation to key-bind. Column order is presentational and the header button stays keyboard-operable.
            <span
              {...attributes}
              {...listeners}
              className="flex size-3.5 shrink-0 cursor-grab items-center justify-center text-base-content/0 group-hover:text-base-content/50"
              onClick={(e) => e.stopPropagation()}
              style={{ touchAction: "none" }}
            >
              <GripVertical size={11} />
            </span>
          )}
          <span className="flex size-4 shrink-0 items-center justify-center rounded-xs bg-base-200/50">
            {propConfig.icon ? (
              <PageIcon icon={propConfig.icon} size={10} />
            ) : (
              <Icon size={10} />
            )}
          </span>
          <span className="truncate text-xs font-semibold text-base-content/70 tracking-wide">
            {prop.name}
          </span>
        </button>
      )}
      {/* Resize handle */}
      {isEditor && (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: column-resize gutter, not a control — onMouseDown starts a continuous pointer drag that tracks the cursor. There is no discrete activation to bind a key to; a keyboard-resizable column needs a separate arrow-key affordance on the header (a real gap, but a feature, not a keyboard handler). Column width is presentational only, so no content is unreachable without it.
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/40"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartResize(e.clientX);
          }}
        />
      )}
    </div>
  );
}

// ── RowContextMenu ────────────────────────────────────────────────────────────

interface RowContextMenuProps {
  menu: RowMenuState;
  onClose: () => void;
  onCommentClick: (rect: DOMRect) => void;
  onDeleteRequest: () => void;
  onDuplicate?: () => void;
  workspaceSlug: string;
}

function RowContextMenu({
  menu,
  workspaceSlug,
  onCommentClick,
  onDuplicate,
  onDeleteRequest,
  onClose,
}: RowContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  // Anchored to a row's "⋯" button inside the scrollable table — lock scroll
  // while open instead of repositioning, so it can't drift from its row.
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));

  const itemCount = 3 + (onDuplicate ? 1 : 0) + 1;
  const menuHeight = itemCount * 32 + 9 + 8;
  const menuWidth = 192;

  return createPortal(
    <div
      className="w-48 overflow-hidden rounded-md border border-base-300 bg-base-200 p-1.5"
      ref={ref}
      style={{
        position: "fixed",
        top: getClampedTop(menu.rect, menuHeight),
        left: getClampedLeft(menu.rect, menuWidth),
        zIndex: 300,
      }}
    >
      <Link
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        href={`/app/${workspaceSlug}/${menu.shortId}`}
        onClick={onClose}
      >
        <ArrowSquareOut className="shrink-0 text-base-content/70" size={13} />{" "}
        Open full page
      </Link>
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        onClick={(e) =>
          onCommentClick(
            (e.currentTarget as HTMLElement).getBoundingClientRect()
          )
        }
        type="button"
      >
        <MessageSquareIcon
          className="shrink-0 text-base-content/70"
          size={13}
        />{" "}
        Comment
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        onClick={() => {
          if (typeof window !== "undefined" && navigator.clipboard) {
            navigator.clipboard
              .writeText(
                `${window.location.origin}/app/${workspaceSlug}/${menu.shortId}`
              )
              .catch(() => {});
          }
          toast.success("Link copied to clipboard", { duration: 2000 });
          onClose();
        }}
        type="button"
      >
        <Link2Icon className="shrink-0 text-base-content/70" size={13} /> Copy
        link
      </button>
      {onDuplicate && (
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
          onClick={onDuplicate}
          type="button"
        >
          <CopyIcon className="shrink-0 text-base-content/70" size={13} />{" "}
          Duplicate
        </button>
      )}
      <div className="my-1 h-px bg-base-300" />
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-error transition-colors duration-150 hover:bg-error/5"
        onClick={onDeleteRequest}
        type="button"
      >
        <Trash size={13} /> Delete entry
      </button>
    </div>,
    document.body
  );
}

// ── PropHeaderMenu ────────────────────────────────────────────────────────────

interface PropHeaderMenuProps {
  activeView: SharedViewProps["activeView"];
  menu: PropMenuState;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicateProperty: (prop: DbProperty) => Promise<void>;
  onHide: (id: string) => void;
  onRename: (id: string) => void;
  onSort: (id: string, dir: "asc" | "desc") => void;
  onUpdateProperty: (
    id: string,
    patch: Record<string, unknown>
  ) => Promise<void>;
  onUpdateView: (patch: Record<string, unknown>) => Promise<void>;
  prop: DbProperty | undefined;
  properties: DbProperty[];
  workspaceId: string;
}

function PropHeaderMenu({
  menu,
  prop,
  properties,
  workspaceId,
  onRename,
  onHide,
  onDelete,
  onSort,
  onUpdateProperty,
  onDuplicateProperty,
  onClose,
  activeView,
  onUpdateView,
}: PropHeaderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // "Edit property" replaces this same menu's content in place, at the same anchor.
  const [editingProperty, setEditingProperty] = useState(false);
  useEffect(() => {
    function h(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
      ) {
        return;
      }
      if (ref.current && !ref.current.contains(target) && !confirmDelete) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, confirmDelete]);

  // `menu.rect` is a frozen snapshot, so scroll is locked for this whole menu instead
  // of relying on EditPropertySidePanel's reposition-on-scroll (nothing fresh to use).
  useScrollLockWhileOpen(
    true,
    (target) =>
      !!ref.current?.contains(target) ||
      !!target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
  );

  const sortable =
    prop &&
    ["text", "number", "select", "status", "date", "checkbox"].includes(
      prop.type
    );
  const canEditProperty = prop && !prop.isSystem;

  if (editingProperty && prop) {
    return (
      <EditPropertySidePanel
        canDelete={!prop.isSystem}
        getAnchorRect={() => menu.rect}
        onBack={() => setEditingProperty(false)}
        onClose={onClose}
        onDeleteProperty={() => onDelete(menu.propId)}
        onDuplicateProperty={() => onDuplicateProperty(prop)}
        onUpdateProperty={(patch) => onUpdateProperty(menu.propId, patch)}
        properties={properties}
        property={prop}
        viewContext={
          activeView
            ? {
                override: activeView.propertyOverrides?.[prop.id] ?? {},
                onUpdateOverride: (patch) =>
                  onUpdateView({
                    propertyOverrides: {
                      ...activeView.propertyOverrides,
                      [prop.id]: {
                        ...(activeView.propertyOverrides?.[prop.id] ?? {}),
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
  }

  const itemCount = 3 + (sortable ? 2 : 0) + (canEditProperty ? 1 : 0);
  const dividerCount = 1 + (sortable ? 1 : 0);
  const menuHeight = itemCount * 32 + dividerCount * 9 + 8;
  const menuWidth = 192;

  return createPortal(
    <>
      <div
        className="w-48 overflow-hidden rounded-md border border-base-300 bg-base-200 p-1.5"
        ref={ref}
        style={{
          position: "fixed",
          top: getClampedTop(menu.rect, menuHeight),
          left: getClampedLeft(menu.rect, menuWidth),
          zIndex: 300,
        }}
      >
        {sortable && (
          <>
            <button
              className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
              onClick={() => onSort(menu.propId, "asc")}
              type="button"
            >
              <SortAscending size={13} /> Sort A → Z
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
              onClick={() => onSort(menu.propId, "desc")}
              type="button"
            >
              <SortDescending size={13} /> Sort Z → A
            </button>
            <div className="my-1 h-px bg-base-300" />
          </>
        )}
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
          onClick={() => onRename(menu.propId)}
          type="button"
        >
          <PencilIcon size={13} /> Rename
        </button>
        {canEditProperty && (
          <button
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
            onClick={() => setEditingProperty(true)}
            type="button"
          >
            <GearIcon size={13} /> Edit property
          </button>
        )}
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
          onClick={() => onHide(menu.propId)}
          type="button"
        >
          <EyeSlash size={13} /> Hide column
        </button>
        <div className="my-1 h-px bg-base-300" />
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-error transition-colors duration-150 hover:bg-error/5"
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          <Trash size={13} /> Delete column
        </button>
      </div>
      <ConfirmDialog
        confirmLabel="Delete column"
        description={`"${prop?.name ?? "This column"}" and all its data will be permanently removed. This cannot be undone.`}
        onConfirm={() => {
          onDelete(menu.propId);
          onClose();
        }}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) {
            onClose();
          }
        }}
        open={confirmDelete}
        title="Delete column?"
      />
    </>,
    document.body
  );
}

// ── AddPropertyMenu ───────────────────────────────────────────────────────────

interface AddPropertyMenuProps {
  databaseId: string;
  onAdd: (
    name: string,
    type: string,
    config?: Record<string, unknown>,
    twoWay?: boolean
  ) => void;
  onClose: () => void;
  onNameChange: (v: string) => void;
  properties: DbProperty[];
  propName: string;
  rect: DOMRect;
  workspaceId: string;
}

function AddPropertyMenu({
  rect,
  propName,
  workspaceId,
  databaseId,
  properties,
  onNameChange,
  onAdd,
  onClose,
}: AddPropertyMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pickingRelation, setPickingRelation] = useState(false);
  const [pickingRollup, setPickingRollup] = useState(false);
  const [pickingFormula, setPickingFormula] = useState(false);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (pickingRelation || pickingRollup || pickingFormula) {
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose, pickingRelation, pickingRollup, pickingFormula]);
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));

  const types = Object.values(PROPERTY_REGISTRY);
  const menuWidth = 240;
  const menuHeight = 320;

  if (pickingRelation) {
    return (
      <RelationDatabasePicker
        onBack={() => setPickingRelation(false)}
        onClose={onClose}
        onPick={(relatedDatabaseId, twoWay) => {
          onAdd(
            propName.trim() || "Relation",
            "relation",
            { relatedDatabaseId },
            twoWay
          );
        }}
        rect={rect}
        workspaceId={workspaceId}
      />
    );
  }

  if (pickingRollup) {
    return (
      <RollupConfigPicker
        onBack={() => setPickingRollup(false)}
        onClose={onClose}
        onPick={(config) =>
          onAdd(propName.trim() || "Rollup", "rollup", config)
        }
        properties={properties}
        rect={rect}
      />
    );
  }

  if (pickingFormula) {
    return (
      <FormulaConfigPicker
        databaseId={databaseId}
        onBack={() => setPickingFormula(false)}
        onClose={onClose}
        onPick={(expression) =>
          onAdd(propName.trim() || "Formula", "formula", { expression })
        }
        properties={properties}
        rect={rect}
      />
    );
  }

  return createPortal(
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200"
      ref={ref}
      style={{
        position: "fixed",
        top: getClampedTop(rect, menuHeight),
        left: getClampedLeft(rect, menuWidth, { align: "end" }),
        zIndex: 300,
        width: menuWidth,
      }}
    >
      <div className="border-b border-base-300 px-3 py-2.5">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-base-content/70">
          New property
        </p>
        <input
          autoFocus
          className="w-full bg-transparent text-sm placeholder:text-base-content/50 focus:outline-none"
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Property name…"
          value={propName}
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1.5">
        {types.map((def) => {
          const Icon =
            PROPERTY_TYPE_ICON[def.type as keyof typeof PROPERTY_TYPE_ICON] ??
            TextT;
          return (
            <button
              className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-base-content hover:bg-base-200"
              key={def.type}
              onClick={() => {
                if (def.type === "relation") {
                  setPickingRelation(true);
                } else if (def.type === "rollup") {
                  setPickingRollup(true);
                } else if (def.type === "formula") {
                  setPickingFormula(true);
                } else {
                  onAdd(propName.trim() || def.label, def.type);
                }
              }}
              type="button"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-base-200/50 text-base-content/70">
                <Icon size={12} />
              </span>
              {def.label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
