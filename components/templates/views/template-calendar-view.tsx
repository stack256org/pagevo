"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { EntryContextMenu } from "@/components/database/entry-context-menu";
import type { DbProperty, DbView } from "@/components/database/types";
import {
  resolveDisplayAs,
  resolveWrapContent,
} from "@/components/database/view-property-resolver";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { DatabaseProperty, DatabaseView } from "@/lib/db/schema";
import type { TemplateEntry } from "../template-page-client";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
// Floor for a day cell: the date number row plus the entries a cell shows
// before collapsing the rest into "+N more". Below this the cell clips its own
// contents, so rows stop shrinking here and the page grows instead.
const MIN_ROW_HEIGHT = 110;

const SHOW_MAX = 2;

type DateVal = { date?: string };

// Same rule board-view.tsx uses to decide whether a property has a
// display-worthy value — kept in sync so calendar cards and board cards
// agree on what counts as "filled".
function hasDisplayValue(
  prop: DatabaseProperty,
  raw: unknown,
  displayAs?: "select" | "checkbox"
): boolean {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "text":
      return !!(v as { text?: string } | null)?.text;
    case "number":
      return (v as { number?: number | null } | null)?.number != null;
    // Checkbox-display is meaningful even unset (an empty checkbox is still a
    // real state to show, unlike an empty pill, which has nothing to render).
    case "select":
      return (
        displayAs === "checkbox" ||
        !!(v as { optionId?: string } | null)?.optionId
      );
    case "multi_select":
      return (
        displayAs === "checkbox" ||
        ((v as { optionIds?: string[] } | null)?.optionIds ?? []).length > 0
      );
    case "date":
      return !!(v as { date?: string } | null)?.date;
    case "checkbox":
      return !!(v as { checked?: boolean } | null)?.checked;
    case "url":
      return !!(v as { url?: string } | null)?.url;
    case "email":
      return !!(v as { email?: string } | null)?.email;
    case "phone":
      return !!(v as { phone?: string } | null)?.phone;
    case "person":
      return ((v as { userIds?: string[] } | null)?.userIds ?? []).length > 0;
    case "relation":
      return ((v as { entryIds?: string[] } | null)?.entryIds ?? []).length > 0;
    default:
      return false;
  }
}

// Toggling a checkbox-display select on a card: unchecking always clears the
// value; checking picks the first "complete"-group option if the property is
// grouped (marking it "done", matching what the checkbox visually implies),
// falling back to the first option at all for an ungrouped select.
function nextCheckboxSelectValue(
  prop: DatabaseProperty,
  raw: unknown
): { optionId: string | null } {
  const optionId =
    (raw as { optionId?: string | null } | null)?.optionId ?? null;
  if (optionId) {
    return { optionId: null };
  }
  const options =
    (prop.config as { options?: { id: string; group?: string }[] } | null)
      ?.options ?? [];
  const target = options.find((o) => o.group === "complete") ?? options[0];
  return { optionId: target?.id ?? null };
}

// Same idea for multi-select: unchecking clears every selected option;
// checking sets just the first "complete"-group (or first overall) option,
// same single-value semantic a checkbox implies even for a multi-select field.
function nextCheckboxMultiSelectValue(
  prop: DatabaseProperty,
  raw: unknown
): { optionIds: string[] } {
  const optionIds = (raw as { optionIds?: string[] } | null)?.optionIds ?? [];
  if (optionIds.length > 0) {
    return { optionIds: [] };
  }
  const options =
    (prop.config as { options?: { id: string; group?: string }[] } | null)
      ?.options ?? [];
  const target = options.find((o) => o.group === "complete") ?? options[0];
  return { optionIds: target ? [target.id] : [] };
}

interface Props {
  activeView: DatabaseView;
  databaseId: string;
  entries: TemplateEntry[];
  entryValueMap: Map<string, Map<string, unknown>>;
  locked?: boolean;
  month: number;
  onAddEntry: (defaultValues?: Record<string, unknown>) => void;
  onClickEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry?: (entryId: string) => void;
  onMonthChange: (m: number) => void;
  onUpdateEntryDate?: (
    entryId: string,
    calPropId: string,
    newDate: string
  ) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty?: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
  onYearChange: (y: number) => void;
  properties: DatabaseProperty[];
  workspaceId: string;
  workspaceSlug: string;
  year: number;
}

// ── MorePopupEntryRow ─────────────────────────────────────────────────────────
// Simpler, non-draggable row used inside the "+N more" overflow popup — mirrors
// DraggableChip's icon + comment-badge treatment so entries look consistent
// whether shown in the grid or the overflow list.
interface MorePopupEntryRowProps {
  entry: TemplateEntry;
  locked?: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function MorePopupEntryRow({
  entry,
  onClick,
  onDelete,
  locked,
}: MorePopupEntryRowProps) {
  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only) — see components/database/board-view.tsx's CardShell for
  // the same change.
  const commentCount = entry.commentCount ?? 0;

  return (
    <div className="group/pe relative flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-base-200 transition-colors cursor-pointer">
      {/* Row action as a real stretched button — the icon/title/count below are
         static so they still open the entry, while the delete button is
         positioned above this and keeps its own click. */}
      <button
        aria-label={entry.title || "Untitled"}
        className="absolute inset-0"
        onClick={onClick}
        type="button"
      />
      {entry.icon ? (
        <PageIcon className="shrink-0" icon={entry.icon} size={13} />
      ) : (
        <FileText className="shrink-0 text-base-content/70" size={12} />
      )}
      <span className="flex-1 truncate text-sm font-medium text-base-content">
        {entry.title || "Untitled"}
      </span>
      {!!commentCount && (
        <span className="flex shrink-0 items-center gap-0.5 text-2xs font-medium text-base-content/70">
          <MessageSquare size={10} />
          {commentCount}
        </span>
      )}
      {!locked && (
        <button
          className="relative z-10 hidden size-5 shrink-0 items-center justify-center rounded text-base-content/70 hover:bg-error/10 hover:text-error group-hover/pe:flex transition-colors"
          onClick={(ev) => {
            ev.stopPropagation();
            onDelete();
          }}
          type="button"
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

// ── DraggableChip ─────────────────────────────────────────────────────────────
interface DraggableChipProps {
  activeView?: DatabaseView | null;
  cardProps: DatabaseProperty[];
  databaseId: string;
  entry: TemplateEntry;
  locked?: boolean;
  onClickEntry: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onDuplicateEntry?: (entryId: string) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty?: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}

function DraggableChip({
  entry,
  databaseId,
  workspaceId,
  workspaceSlug,
  locked,
  cardProps,
  valueMap,
  onClickEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onUpdateEntryIcon,
  onUpdatePropValue,
  onUpdateProperty,
  activeView,
  onUpdateView,
}: DraggableChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: entry.id,
      disabled: locked,
    });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {};
  const [commentCount, setCommentCount] = useState<number | null>(
    entry.commentCount ?? null
  );
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showComment, setShowComment] = useState(false);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const filledProps = cardProps.filter((prop) =>
    hasDisplayValue(
      prop,
      valueMap.get(entry.id)?.get(prop.id) ?? null,
      resolveDisplayAs(
        prop as unknown as DbProperty,
        activeView as unknown as DbView | null | undefined
      )
    )
  );

  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only) — see components/database/board-view.tsx's CardShell for
  // the same change. `onCommentAdded` below still bumps this instantly
  // between fetches.
  useEffect(() => {
    setCommentCount(entry.commentCount ?? 0);
  }, [entry.commentCount]);

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: false positive — dnd-kit's {...attributes} spread supplies role="button", tabIndex={0} and aria-roledescription="draggable" at runtime, which Biome cannot see through a spread. It stays a div because it is a drag source (dnd-kit sets touchAction/userSelect on it) and a native <button> would fight the pointer sensor. Keyboard activation is provided by the onKeyDown below, since only a PointerSensor is configured. */}
      <div
        ref={(el) => {
          setNodeRef(el);
          chipRef.current = el;
        }}
        style={{
          ...style,
          opacity: isDragging ? 0 : 1,
          touchAction: "none",
          userSelect: "none",
          cursor: locked ? "pointer" : "grab",
        }}
        {...attributes}
        {...listeners}
        className="group/event flex flex-col rounded-sm border border-base-300 bg-base-200 hover:border-base-300 hover:bg-base-200/30 transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onClickEntry(entry.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onClickEntry(entry.id);
          }
        }}
      >
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          {entry.icon ? (
            <PageIcon className="shrink-0" icon={entry.icon} size={13} />
          ) : (
            <FileText className="shrink-0 text-base-content/70" size={12} />
          )}
          <span className="flex-1 truncate text-xs font-semibold text-base-content">
            {entry.title || "Untitled"}
          </span>
          {!!commentCount && (
            <button
              className="flex shrink-0 items-center gap-0.5 text-2xs font-medium text-base-content/70 hover:text-base-content transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowComment(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <MessageSquare size={10} />
              {commentCount}
            </button>
          )}
          <button
            className="flex shrink-0 size-3.5 items-center justify-center rounded opacity-0 group-hover/event:opacity-100 hover:bg-base-200 hover:text-base-content transition-all"
            onClick={(e) => {
              e.stopPropagation();
              setMenuPos({ x: e.clientX, y: e.clientY });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <MoreHorizontal size={10} />
          </button>
        </div>

        {filledProps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
            {filledProps.map((prop) => (
              <div className="min-w-0 shrink-0" key={prop.id}>
                <CellDisplay
                  compact
                  onToggleCheckbox={() => {
                    if (locked) {
                      return;
                    }
                    const raw = valueMap.get(entry.id)?.get(prop.id) ?? null;
                    const next =
                      prop.type === "multi_select"
                        ? nextCheckboxMultiSelectValue(prop, raw)
                        : nextCheckboxSelectValue(prop, raw);
                    onUpdatePropValue(entry.id, prop.id, next);
                  }}
                  property={prop as unknown as DbProperty}
                  resolvedDisplayAs={resolveDisplayAs(
                    prop as unknown as DbProperty,
                    activeView as unknown as DbView | null | undefined
                  )}
                  resolvedWrapContent={resolveWrapContent(
                    prop as unknown as DbProperty,
                    activeView as unknown as DbView | null | undefined
                  )}
                  value={valueMap.get(entry.id)?.get(prop.id) ?? null}
                  workspaceId={workspaceId}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {showComment && chipRef.current && (
        <CellCommentPopover
          anchorRect={chipRef.current.getBoundingClientRect()}
          entryShortId={entry.shortId}
          onClose={() => setShowComment(false)}
          onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
          pageId={entry.id}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      )}

      <EntryContextMenu
        activeView={activeView as unknown as DbView | null}
        databaseId={databaseId}
        entryIcon={entry.icon ?? null}
        entryId={entry.id}
        entryRect={chipRef.current?.getBoundingClientRect() ?? null}
        entryShortId={entry.shortId}
        forcePos={menuPos}
        onClose={() => setMenuPos(null)}
        onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
        onDelete={() => {
          if (locked) {
            return;
          }
          onDeleteEntry(entry.id);
        }}
        onDuplicate={
          !locked && onDuplicateEntry
            ? () => onDuplicateEntry(entry.id)
            : undefined
        }
        onIconChange={(icon) => {
          if (locked) {
            return;
          }
          onUpdateEntryIcon?.(entry.id, icon);
        }}
        onPropertyConfigChange={locked ? () => {} : onUpdateProperty}
        onUpdateView={locked ? undefined : onUpdateView}
        onValueChange={(propId, value) => {
          if (locked) {
            return;
          }
          onUpdatePropValue(entry.id, propId, value);
        }}
        updatedAt={entry.updatedAt ?? null}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
}

// ── DroppableDateCell ─────────────────────────────────────────────────────────
interface DroppableDateCellProps {
  children: React.ReactNode;
  className?: string;
  dateKey: string;
  isOver: boolean;
  [key: string]: unknown;
}

function DroppableDateCell({
  dateKey,
  isOver,
  children,
  className,
  ...props
}: DroppableDateCellProps) {
  const { setNodeRef } = useDroppable({ id: dateKey });
  return (
    <div
      className={`${className ?? ""} ${isOver ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""}`}
      ref={setNodeRef}
      {...props}
    >
      {children}
    </div>
  );
}

export function TemplateCalendarView({
  entries,
  properties,
  activeView,
  entryValueMap,
  databaseId,
  workspaceId,
  workspaceSlug,
  locked,
  year,
  month,
  onYearChange,
  onMonthChange,
  onAddEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onUpdateEntryIcon,
  onClickEntry,
  onUpdateEntryDate,
  onUpdatePropValue,
  onUpdateProperty,
  onUpdateView,
}: Props) {
  const today = new Date();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const sensors = useSensors(...(locked ? [] : [pointerSensor]));

  // Fall back to first date property if the view doesn't have one pinned yet
  const calProp =
    properties.find((p) => p.id === activeView.calendarPropertyId) ??
    properties.find((p) => p.type === "date");
  // Matches Notion: a card shows only its title by default. The one
  // exception is Status, and only once the user explicitly turns on "Show on
  // card" from Status's own Edit Property panel — every other property stays
  // fully editable via the entry's popup but is never rendered on the card.
  const cardProps = properties.filter((p) => {
    const config = p.config as {
      groupedByStatus?: boolean;
      showOnCard?: boolean;
    } | null;
    return (
      p.id !== calProp?.id && !!config?.groupedByStatus && !!config?.showOnCard
    );
  });

  function pad(n: number) {
    return String(n).padStart(2, "0");
  }
  function dateKey(y: number, m: number, d: number) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  const todayKey = dateKey(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const dateMap = new Map<string, TemplateEntry[]>();
  for (const entry of entries) {
    const valMap = entryValueMap.get(entry.id) ?? new Map<string, unknown>();
    const raw = calProp ? valMap.get(calProp.id) : undefined;
    if (raw && typeof raw === "object") {
      const dv = raw as DateVal;
      if (dv.date) {
        if (!dateMap.has(dv.date)) {
          dateMap.set(dv.date, []);
        }
        dateMap.get(dv.date)!.push(entry);
      }
    }
  }

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...new Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  function goPrev() {
    if (month === 0) {
      onMonthChange(11);
      onYearChange(year - 1);
    } else {
      onMonthChange(month - 1);
    }
  }
  function goNext() {
    if (month === 11) {
      onMonthChange(0);
      onYearChange(year + 1);
    } else {
      onMonthChange(month + 1);
    }
  }
  function goToday() {
    onYearChange(today.getFullYear());
    onMonthChange(today.getMonth());
  }

  function handleAddOnDate(day: number) {
    if (locked) {
      return;
    }
    if (!calProp) {
      onAddEntry();
      return;
    }
    onAddEntry({ [calProp.id]: { date: dateKey(year, month, day) } });
  }

  // ── DnD handlers ─────────────────────────────────────────────────────────────
  function handleDragStart(event: DragStartEvent) {
    setDraggingEntryId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverDate(event.over?.id ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingEntryId(null);
    setOverDate(null);

    if (locked || !over || !calProp) {
      return;
    }
    const newDate = String(over.id);

    // Find the entry's current date
    const entryId = String(active.id);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return;
    }

    const valMap = entryValueMap.get(entryId) ?? new Map<string, unknown>();
    const raw = valMap.get(calProp.id);
    const currentDate =
      raw && typeof raw === "object" ? (raw as DateVal).date : undefined;

    // Don't update if dropped on the same date
    if (newDate === currentDate) {
      return;
    }

    onUpdateEntryDate?.(entryId, calProp.id, newDate);
  }

  // ── Hover-popup for "+N more" ──────────────────────────────────────────────
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [morePopup, setMorePopup] = useState<{
    key: string;
    x: number;
    y: number;
  } | null>(null);

  function openPopup(key: string, e: React.MouseEvent<HTMLButtonElement>) {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    setMorePopup({ key, x: e.clientX, y: e.clientY });
  }
  function scheduleClose() {
    hoverTimer.current = setTimeout(() => setMorePopup(null), 150);
  }
  function cancelClose() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
  }

  // morePopup is a `position: fixed` portal anchored to a clientX/clientY
  // snapshotted once on hover — dismiss it on scroll instead of
  // repositioning, since locking scroll on every hover would hurt the
  // calendar grid's own scrolling.
  const morePopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!morePopup) {
      return;
    }
    function handleScroll(e: Event) {
      // Capture phase, so this sees scrolls from every element — including the
      // popup's own max-height entry list. Scrolling that list must not dismiss
      // the popup, or a date with more entries than fit becomes unreadable: the
      // first wheel tick over it closed the very thing being scrolled.
      const target = e.target as Node | null;
      if (target && morePopupRef.current?.contains(target)) {
        return;
      }
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
      }
      setMorePopup(null);
    }
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [morePopup]);

  const rows = cells.length / 7;

  // The dragging entry (for DragOverlay)
  const draggingEntry = draggingEntryId
    ? entries.find((e) => e.id === draggingEntryId)
    : null;

  return (
    <>
      <DndContext
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        {/* min-h-full, not h-full: fills the pane when there's room, but is free to
      grow past it when the month's rows need more height than is available
      (short window, zoomed in, or a cover banner eating vertical space) — the
      page scrolls to the rest rather than the rows compressing. */}
        <div className="flex min-h-full flex-1 flex-col">
          {/* ── Header ───────────────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-6 py-3">
            <h2 className="text-lg font-semibold tracking-tight text-base-content">
              {MONTH_NAMES[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                className="flex size-7 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                onClick={goPrev}
                type="button"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="rounded-sm px-3 py-1 text-xs font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                onClick={goToday}
                type="button"
              >
                Today
              </button>
              <button
                className="flex size-7 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                onClick={goNext}
                type="button"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* ── Day-of-week headers ───────────────────────────────────────────────── */}
          <div className="grid shrink-0 grid-cols-7 border-b border-base-300 bg-base-200/20">
            {DAY_NAMES.map((d) => (
              <div
                className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-base-content/70"
                key={d}
              >
                {d.slice(0, 3)}
              </div>
            ))}
          </div>

          {/* ── Calendar grid ─────────────────────────────────────────────────────── */}
          {/* Rows are minmax(MIN_ROW_HEIGHT, 1fr), not a bare 1fr: 1fr still wins when
       there's room, but a bare 1fr let every row shrink without limit until the
       day cells — themselves overflow-hidden — silently swallowed their own
       entries, with nothing in the stack able to scroll to them. No `min-h-0`
       here: that would re-enable shrinking below the rows' own minimum. */}
          <div
            className="flex-1"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gridTemplateRows: `repeat(${rows}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`,
            }}
          >
            {cells.map((day, i) => {
              const key = day === null ? null : dateKey(year, month, day);
              const isToday = key === todayKey;
              const events = key ? (dateMap.get(key) ?? []) : [];
              const shown = events.slice(0, SHOW_MAX);
              const extra = events.length - shown.length;
              const isLastRow = Math.floor(i / 7) === rows - 1;
              const isLastCol = i % 7 === 6;

              const baseCellClass = [
                "group relative flex flex-col p-1 transition-colors",
                day === null
                  ? "bg-base-200/10"
                  : "bg-base-200 hover:bg-base-200/20",
                isLastRow ? "" : "border-b border-base-300",
                isLastCol ? "" : "border-r border-base-300",
              ].join(" ");

              if (day === null) {
                // biome-ignore lint/suspicious/noArrayIndexKey: leading/trailing blanks that pad the month to whole weeks — they carry no date, and the grid slot is precisely their identity. Real day cells below key on the ISO date.
                return <div className={baseCellClass} key={i} />;
              }

              return (
                <DroppableDateCell
                  className={baseCellClass}
                  dateKey={key!}
                  isOver={overDate === key}
                  key={`day-${key}`}
                >
                  {/* Day number row */}
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={[
                        "flex size-5.5 items-center justify-center rounded-full text-xs font-medium leading-none",
                        isToday
                          ? "bg-primary text-primary-content font-bold"
                          : "text-base-content/70",
                      ].join(" ")}
                    >
                      {day}
                    </span>
                    {!locked && (
                      <button
                        className="hidden size-5 items-center justify-center rounded text-base-content/70 hover:bg-primary/10 hover:text-primary group-hover:flex transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddOnDate(day);
                        }}
                        type="button"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-0.5">
                    {shown.map((e) => (
                      <DraggableChip
                        activeView={activeView}
                        cardProps={cardProps}
                        databaseId={databaseId}
                        entry={e}
                        key={e.id}
                        locked={locked}
                        onClickEntry={onClickEntry}
                        onDeleteEntry={(id) => setDeleteTarget(id)}
                        onDuplicateEntry={onDuplicateEntry}
                        onUpdateEntryIcon={onUpdateEntryIcon}
                        onUpdateProperty={onUpdateProperty}
                        onUpdatePropValue={onUpdatePropValue}
                        onUpdateView={onUpdateView}
                        valueMap={entryValueMap}
                        workspaceId={workspaceId}
                        workspaceSlug={workspaceSlug}
                      />
                    ))}

                    {/* "+N more" hover trigger */}
                    {extra > 0 && (
                      <button
                        className="px-1.5 py-0.5 text-left text-xs font-medium text-primary/70 hover:text-primary transition-colors"
                        onMouseEnter={(e) => openPopup(key!, e)}
                        onMouseLeave={scheduleClose}
                        type="button"
                      >
                        +{extra} more
                      </button>
                    )}
                  </div>
                </DroppableDateCell>
              );
            })}
          </div>

          {/* ── Hover popup (portal — escapes overflow-hidden grid) ───────────────── */}
          {morePopup &&
            typeof window !== "undefined" &&
            createPortal(
              (() => {
                const POPUP_W = 220;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                // If cursor is in the bottom 38% of the viewport, anchor from bottom
                // so the popup grows upward — no height estimate needed.
                const showAbove = morePopup.y > vh * 0.62;
                const left = Math.min(morePopup.x + 4, vw - POPUP_W - 8);

                const posStyle: React.CSSProperties = showAbove
                  ? {
                      position: "fixed",
                      bottom: vh - morePopup.y + 8,
                      left,
                      zIndex: 9999,
                      width: POPUP_W,
                    }
                  : {
                      position: "fixed",
                      top: morePopup.y + 16,
                      left,
                      zIndex: 9999,
                      width: POPUP_W,
                    };

                return (
                  // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: hover-lifetime container, not a control — the enter/leave handlers only keep this "+N more" popup open while the pointer is inside it, cancelling the close timer started by the day cell. Nothing is activated here; every entry inside is its own focusable element.
                  <div
                    className="overflow-hidden rounded-md border border-base-300 bg-neutral"
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    ref={morePopupRef}
                    style={posStyle}
                  >
                    {/* Date label */}
                    <div className="border-b border-base-300 px-3 py-2">
                      {(() => {
                        const [ey, em, ed] = morePopup.key
                          .split("-")
                          .map(Number);
                        return (
                          <span className="text-xs font-semibold tracking-wide text-base-content/70">
                            {MONTH_NAMES[em - 1]} {ed}, {ey}
                          </span>
                        );
                      })()}
                    </div>

                    {/* All entries for this date */}
                    <div className="max-h-55 overflow-y-auto p-1">
                      {(dateMap.get(morePopup.key) ?? []).map((e) => (
                        <MorePopupEntryRow
                          entry={e}
                          key={e.id}
                          locked={locked}
                          onClick={() => {
                            onClickEntry(e.id);
                            setMorePopup(null);
                          }}
                          onDelete={() => {
                            setDeleteTarget(e.id);
                            setMorePopup(null);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })(),
              document.body
            )}
        </div>

        {/* ── DragOverlay ────────────────────────────────────────────────────────── */}
        <DragOverlay dropAnimation={null}>
          {draggingEntry && (
            <div className="flex items-center gap-1 rounded-xs bg-primary px-1.5 py-0.75 text-xs font-medium text-primary-content cursor-grabbing">
              <span className="size-1.5 shrink-0 rounded-full bg-primary-content/60" />
              <span className="max-w-30 truncate">
                {draggingEntry.title || "Untitled"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        confirmLabel="Delete"
        description="This entry will be permanently deleted. This cannot be undone."
        onConfirm={() => {
          if (locked || !deleteTarget) {
            return;
          }
          onDeleteEntry(deleteTarget);
          setDeleteTarget(null);
        }}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title="Delete entry?"
      />
    </>
  );
}
