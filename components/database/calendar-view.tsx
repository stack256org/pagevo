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
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { EntryContextMenu } from "@/components/database/entry-context-menu";
import type {
  DbEntry,
  DbProperty,
  SelectOption,
  SharedViewProps,
} from "@/components/database/types";
import {
  resolveDisplayAs,
  resolveWrapContent,
} from "@/components/database/view-property-resolver";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Floor for a day cell: the date number row plus the 3 entries a cell shows
// before collapsing the rest into "+N more". Below this the cell clips its
// own contents (see the grid's comment) — so rows stop shrinking here and the
// grid scrolls instead.
const MIN_ROW_HEIGHT = 110;
const MONTHS = [
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
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function isoToLocalDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// Same rule board-view.tsx uses to decide whether a property has a
// display-worthy value — kept in sync so calendar cards and board cards
// agree on what counts as "filled".
function hasDisplayValue(
  prop: DbProperty,
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
  prop: DbProperty,
  raw: unknown
): { optionId: string | null } {
  const optionId =
    (raw as { optionId?: string | null } | null)?.optionId ?? null;
  if (optionId) {
    return { optionId: null };
  }
  const options = (prop.config?.options ?? []) as SelectOption[];
  const target = options.find((o) => o.group === "complete") ?? options[0];
  return { optionId: target?.id ?? null };
}

// Same idea for multi-select: unchecking clears every selected option;
// checking sets just the first "complete"-group (or first overall) option,
// same single-value semantic a checkbox implies even for a multi-select field.
function nextCheckboxMultiSelectValue(
  prop: DbProperty,
  raw: unknown
): { optionIds: string[] } {
  const optionIds = (raw as { optionIds?: string[] } | null)?.optionIds ?? [];
  if (optionIds.length > 0) {
    return { optionIds: [] };
  }
  const options = (prop.config?.options ?? []) as SelectOption[];
  const target = options.find((o) => o.group === "complete") ?? options[0];
  return { optionIds: target ? [target.id] : [] };
}

// ── MorePopupEntryRow ─────────────────────────────────────────────────────────
// Simpler, non-draggable row used inside the "+N more" overflow popup — mirrors
// DraggableChip's icon + comment-badge treatment so entries look consistent
// whether shown in the grid or the overflow list.
interface MorePopupEntryRowProps {
  entry: DbEntry;
  onClick: () => void;
  onDelete?: () => void;
}

function MorePopupEntryRow({
  entry,
  onClick,
  onDelete,
}: MorePopupEntryRowProps) {
  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only) — see board-view.tsx's CardShell for the same change.
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
      {onDelete && (
        <button
          className="relative z-10 hidden size-5 shrink-0 items-center justify-center rounded text-base-content/70 hover:bg-error/10 hover:text-error group-hover/pe:flex transition-colors"
          onClick={(e) => {
            e.stopPropagation();
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

// ── MorePopup ─────────────────────────────────────────────────────────────────
// Anchored to the cursor point where the "+N more" chip was hovered, not a DOM
// element — the anchor rect collapses to a zero-size point at (x, y).
interface MorePopupProps {
  morePopup: { key: string; x: number; y: number; entries: DbEntry[] };
  morePopupRef: React.RefObject<HTMLDivElement | null>;
  onEntryClick: (entry: DbEntry) => void;
  onEntryDelete?: (entry: DbEntry) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function MorePopup({
  morePopup,
  morePopupRef,
  onMouseEnter,
  onMouseLeave,
  onEntryClick,
  onEntryDelete,
}: MorePopupProps) {
  const POPUP_W = 220;
  const { setFloating, x, y } = useAnchorPosition({
    anchorRect: {
      top: morePopup.y,
      bottom: morePopup.y,
      left: morePopup.x,
      right: morePopup.x,
    },
    placement: "bottom-start",
    gap: 12,
  });
  const mergedRef = useMergedRef(morePopupRef, setFloating);
  const [ey, em, ed] = morePopup.key.split("-").map(Number);

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: hover-lifetime container, not a control — the enter/leave handlers only keep this "+N more" popup open while the pointer is inside it, cancelling the close timer started by the day cell. Nothing is activated here; every entry inside is its own focusable link.
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-neutral"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={mergedRef}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 9999,
        width: POPUP_W,
      }}
    >
      <div className="border-b border-base-300 px-3 py-2">
        <span className="text-xs font-semibold text-base-content/70">
          {MONTHS_SHORT[em - 1]} {ed}, {ey}
        </span>
      </div>
      <div className="max-h-55 overflow-y-auto p-1">
        {morePopup.entries.map((entry) => (
          <MorePopupEntryRow
            entry={entry}
            key={entry.id}
            onClick={() => onEntryClick(entry)}
            onDelete={onEntryDelete ? () => onEntryDelete(entry) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ── DraggableChip ─────────────────────────────────────────────────────────────
interface DraggableChipProps {
  activeView: SharedViewProps["activeView"];
  cardProps: DbProperty[];
  databaseId: string;
  entry: DbEntry;
  isEditor: boolean;
  onDeleteClick: (entry: DbEntry) => void;
  onDuplicate?: (id: string) => void;
  onOpenEntry?: (entry: DbEntry) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => Promise<void>;
  onUpdateProperty: (
    propId: string,
    patch: Record<string, unknown>
  ) => Promise<void>;
  onUpdateValue: (
    entryId: string,
    propId: string,
    value: unknown
  ) => Promise<void>;
  onUpdateView: (patch: Record<string, unknown>) => Promise<void>;
  openMode: string;
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}

function DraggableChip({
  entry,
  databaseId,
  workspaceId,
  workspaceSlug,
  openMode,
  isEditor,
  cardProps,
  valueMap,
  onOpenEntry,
  onDeleteClick,
  onDuplicate,
  onUpdateEntryIcon,
  onUpdateValue,
  onUpdateProperty,
  activeView,
  onUpdateView,
}: DraggableChipProps) {
  const filledProps = cardProps.filter((prop) =>
    hasDisplayValue(
      prop,
      valueMap.get(entry.id)?.get(prop.id) ?? null,
      resolveDisplayAs(prop, activeView)
    )
  );
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.id });
  const [rightClickPos, setRightClickPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showDots, setShowDots] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(
    entry.commentCount ?? null
  );
  const [showComment, setShowComment] = useState(false);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : {};

  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only) — see board-view.tsx's CardShell for the same change.
  // `onCommentAdded` below still bumps this instantly between fetches.
  useEffect(() => {
    setCommentCount(entry.commentCount ?? 0);
  }, [entry.commentCount]);

  const inner = (
    <>
      {entry.icon ? (
        <PageIcon className="shrink-0" icon={entry.icon} size={13} />
      ) : (
        <FileText className="shrink-0 text-base-content/70" size={12} />
      )}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-base-content">
        {entry.title || "Untitled"}
      </span>
    </>
  );

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: drag-and-right-click shell for a calendar chip, not a control — its handlers are dnd-kit's pointer listeners, hover tracking, and a right-click affordance. None is an activation, right-click has no keyboard equivalent to add, and the chip's own open action is a focusable element inside. */}
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
        }}
        {...attributes}
        {...listeners}
        className="group/chip relative flex flex-col rounded-sm border border-base-300 bg-base-200 transition-colors hover:border-base-300 hover:bg-base-200/30 cursor-pointer"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRightClickPos({ x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={() => setShowDots(true)}
        onMouseLeave={() => setShowDots(false)}
      >
        <div className="flex items-center gap-1.5">
          {openMode === "side_panel" && onOpenEntry ? (
            <button
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEntry(entry);
              }}
              type="button"
            >
              {inner}
            </button>
          ) : (
            <Link
              className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1"
              href={`/app/${workspaceSlug}/${entry.shortId}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {inner}
            </Link>
          )}

          {!!commentCount && (
            <button
              className="mr-0.5 flex shrink-0 items-center gap-0.5 text-2xs font-medium text-base-content/70 hover:text-base-content transition-colors"
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

          {isEditor && showDots && (
            <button
              className="mr-1 flex shrink-0 items-center justify-center rounded-xs p-0.5 text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setRightClickPos({ x: e.clientX, y: e.clientY });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <MoreHorizontal size={10} />
            </button>
          )}
        </div>

        {filledProps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 px-1.5 pb-1.5">
            {filledProps.map((prop) => (
              <div className="min-w-0 shrink-0" key={prop.id}>
                <CellDisplay
                  compact
                  onToggleCheckbox={() => {
                    const raw = valueMap.get(entry.id)?.get(prop.id) ?? null;
                    const next =
                      prop.type === "multi_select"
                        ? nextCheckboxMultiSelectValue(prop, raw)
                        : nextCheckboxSelectValue(prop, raw);
                    onUpdateValue(entry.id, prop.id, next);
                  }}
                  property={prop}
                  resolvedDisplayAs={resolveDisplayAs(prop, activeView)}
                  resolvedWrapContent={resolveWrapContent(prop, activeView)}
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
        activeView={activeView}
        databaseId={databaseId}
        entryIcon={entry.icon ?? null}
        entryId={entry.id}
        entryRect={chipRef.current?.getBoundingClientRect() ?? null}
        entryShortId={entry.shortId}
        forcePos={rightClickPos}
        onClose={() => setRightClickPos(null)}
        onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
        onDelete={() => onDeleteClick(entry)}
        onDuplicate={onDuplicate ? () => onDuplicate(entry.id) : undefined}
        onIconChange={(icon) => onUpdateEntryIcon?.(entry.id, icon)}
        onOpenEntry={
          openMode === "side_panel" && onOpenEntry
            ? () => onOpenEntry(entry)
            : undefined
        }
        onPropertyConfigChange={onUpdateProperty}
        onUpdateView={onUpdateView}
        onValueChange={(propId, value) =>
          onUpdateValue(entry.id, propId, value)
        }
        updatedAt={entry.updatedAt ?? null}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
}

// ── DroppableDateCell ─────────────────────────────────────────────────────────
function DroppableDateCell({
  dateKey,
  isOver,
  children,
  className,
}: {
  dateKey: string;
  isOver: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id: dateKey });
  return (
    <div
      className={`${className ?? ""} ${isOver ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

// ── CalendarView ──────────────────────────────────────────────────────────────
export function CalendarView({
  databaseId,
  workspaceId,
  workspaceSlug,
  entries,
  properties,
  valueMap,
  activeView,
  isEditor,
  onCreateEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onUpdateValue,
  onUpdateEntryIcon,
  onUpdateProperty,
  onUpdateView,
}: SharedViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [morePopup, setMorePopup] = useState<{
    key: string;
    x: number;
    y: number;
    entries: DbEntry[];
  } | null>(null);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const calPropId = activeView?.calendarPropertyId;
  const calProp = properties.find(
    (p) => p.id === calPropId && p.type === "date"
  );
  // Matches Notion: a card shows only its title by default. The one
  // exception is Status, and only once the user explicitly turns on "Show on
  // card" from Status's own Edit Property panel — every other property stays
  // fully editable via the entry's popup but is never rendered on the card.
  const cardProps = properties.filter(
    (p) =>
      p.id !== calPropId &&
      !!p.config?.groupedByStatus &&
      !!p.config?.showOnCard
  );

  if (!calProp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-lg bg-base-200/40">
          <Calendar className="text-base-content/70" size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-base-content">
            No date property selected
          </p>
          <p className="mt-1 text-xs text-base-content/70">
            Open the <strong>Date</strong> dropdown in the toolbar and pick a
            Date property to show entries on the calendar.
          </p>
        </div>
      </div>
    );
  }

  const dateMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const val = valueMap.get(entry.id)?.get(calPropId!) as {
      date?: string | null;
    } | null;
    const iso = val?.date;
    if (!iso) {
      continue;
    }
    const d = isoToLocalDate(iso);
    if (!d) {
      continue;
    }
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!dateMap.has(key)) {
      dateMap.set(key, []);
    }
    dateMap.get(key)!.push(entry);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cells: (number | null)[] = [
    ...new Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const rows = cells.length / 7;

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

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
    if (!over || !calPropId) {
      return;
    }
    const newDate = String(over.id);
    const entryId = String(active.id);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) {
      return;
    }
    const val = valueMap.get(entryId)?.get(calPropId) as {
      date?: string | null;
      endDate?: string | null;
    } | null;
    if (newDate === val?.date) {
      return;
    }
    // Preserve every other field (time/timezone/format/reminder) and, for a
    // ranged event, shift endDate by the same day delta so its length
    // survives the move instead of collapsing to a single day.
    let endDate = val?.endDate;
    if (val?.date && val?.endDate) {
      const deltaMs =
        new Date(`${newDate}T00:00:00`).getTime() -
        new Date(`${val.date}T00:00:00`).getTime();
      const shifted = new Date(
        new Date(`${val.endDate}T00:00:00`).getTime() + deltaMs
      );
      endDate = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
    }
    onUpdateValue(entryId, calPropId, { ...val, date: newDate, endDate });
  }

  function openMorePopup(
    key: string,
    dayEntries: DbEntry[],
    e: React.MouseEvent
  ) {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    setMorePopup({ key, x: e.clientX, y: e.clientY, entries: dayEntries });
  }
  function scheduleCloseMore() {
    hoverTimer.current = setTimeout(() => setMorePopup(null), 150);
  }
  function cancelCloseMore() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
  }

  const draggingEntry = draggingEntryId
    ? entries.find((e) => e.id === draggingEntryId)
    : null;
  const openMode = activeView?.entryOpenMode ?? "side_panel";

  return (
    <>
      <DndContext
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        {/* min-h-full, not h-full: fills the pane when the window is tall enough,
        but is free to grow past it when the month's rows need more room than
        the viewport has — the page scrolls to reach the rest rather than the
        rows compressing. No overflow clip here for the same reason. */}
        <div className="flex min-h-full flex-1 flex-col bg-base-100">
          {/* ── Navigation header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-4 py-2">
            <h2 className="text-sm font-semibold text-base-content">
              {MONTHS[month]} {year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                className="flex size-7 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                onClick={prevMonth}
                type="button"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${isCurrentMonth ? "text-base-content/70 hover:bg-base-200 hover:text-base-content" : "text-base-content font-semibold hover:bg-base-200"}`}
                onClick={goToday}
                type="button"
              >
                Today
              </button>
              <button
                className="flex size-7 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content transition-colors"
                onClick={nextMonth}
                type="button"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* ── Day-of-week header ── */}
          <div className="grid shrink-0 grid-cols-7 border-b border-base-300">
            {DAYS.map((d) => (
              <div
                className="py-2 text-center text-xs font-medium text-base-content/70"
                key={d}
              >
                {d}
              </div>
            ))}
          </div>

          {/* ── Calendar grid ──
          Rows are minmax(MIN_ROW_HEIGHT, 1fr), not a bare 1fr: on a tall
          window 1fr still wins and the grid fills the pane exactly as before,
          but on a short one (smaller screen, zoomed in, or just a visible
          bookmarks bar) bare 1fr let every row shrink without limit until the
          day cells — which are themselves overflow-hidden — silently swallowed
          their own entries, with no scrollbar anywhere in the stack to reach
          them. With the floor in place the grid instead outgrows the viewport
          and the page scrolls. No `min-h-0` here: that would re-enable
          shrinking below the rows' own minimum and undo exactly that. */}
          <div
            className="flex-1"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gridTemplateRows: `repeat(${rows}, minmax(${MIN_ROW_HEIGHT}px, 1fr))`,
            }}
          >
            {cells.map((day, idx) => {
              if (!day) {
                const isLastRow = Math.floor(idx / 7) === rows - 1;
                const isLastCol = idx % 7 === 6;
                return (
                  <div
                    className={`bg-base-200/5 ${isLastRow ? "" : "border-b border-base-300"} ${isLastCol ? "" : "border-r border-base-300"}`}
                    // biome-ignore lint/suspicious/noArrayIndexKey: leading/trailing blanks that pad the month to whole weeks — they carry no data, and the grid slot is precisely their identity. Real day cells below key on the ISO date.
                    key={`empty-${idx}`}
                  />
                );
              }

              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEntries = dateMap.get(key) ?? [];
              const isToday = key === todayKey;
              const SHOW = 3;
              const shown = dayEntries.slice(0, SHOW);
              const extra = dayEntries.length - shown.length;
              const isLastRow = Math.floor(idx / 7) === rows - 1;
              const isLastCol = idx % 7 === 6;
              const isSunSat = idx % 7 === 0 || idx % 7 === 6;

              const cellCls = [
                "group/cell relative flex flex-col overflow-hidden transition-colors",
                isToday
                  ? "bg-base-200/30"
                  : isSunSat
                    ? "bg-base-200/5 hover:bg-base-200/10"
                    : "bg-base-200 hover:bg-base-200/10",
                isLastRow ? "" : "border-b border-base-300",
                isLastCol ? "" : "border-r border-base-300",
              ].join(" ");

              return (
                <DroppableDateCell
                  className={cellCls}
                  dateKey={key}
                  isOver={overDate === key}
                  key={key}
                >
                  <div className="flex items-center justify-between px-2 pt-1.5 pb-0.5">
                    <span
                      className={[
                        "flex size-5.5 items-center justify-center rounded-full text-xs font-semibold tabular-nums select-none",
                        isToday
                          ? "bg-primary text-primary-content"
                          : "text-base-content/60",
                      ].join(" ")}
                    >
                      {day}
                    </span>
                    {isEditor && (
                      <button
                        className="hidden size-5 items-center justify-center rounded text-base-content/50 hover:bg-primary/10 hover:text-primary group-hover/cell:flex transition-colors"
                        onClick={() =>
                          onCreateEntry({ [calPropId!]: { date: key } })
                        }
                        type="button"
                      >
                        <Plus size={11} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5 px-1 pb-1">
                    {shown.map((entry) => (
                      <DraggableChip
                        activeView={activeView}
                        cardProps={cardProps}
                        databaseId={databaseId}
                        entry={entry}
                        isEditor={isEditor}
                        key={entry.id}
                        onDeleteClick={(e) =>
                          setDeleteTarget({ id: e.id, title: e.title ?? "" })
                        }
                        onDuplicate={onDuplicateEntry}
                        onOpenEntry={onOpenEntry}
                        onUpdateEntryIcon={onUpdateEntryIcon}
                        onUpdateProperty={onUpdateProperty}
                        onUpdateValue={onUpdateValue}
                        onUpdateView={onUpdateView}
                        openMode={openMode}
                        valueMap={valueMap}
                        workspaceId={workspaceId}
                        workspaceSlug={workspaceSlug}
                      />
                    ))}
                    {extra > 0 && (
                      <button
                        className="px-1.5 py-0.5 text-left text-[11px] font-medium text-base-content/70 hover:text-base-content transition-colors"
                        onMouseEnter={(e) => openMorePopup(key, dayEntries, e)}
                        onMouseLeave={scheduleCloseMore}
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

          {/* ── "+N more" hover popup ── */}
          {morePopup &&
            typeof window !== "undefined" &&
            createPortal(
              <MorePopup
                morePopup={morePopup}
                morePopupRef={morePopupRef}
                onEntryClick={(entry) => {
                  if (openMode === "side_panel" && onOpenEntry) {
                    onOpenEntry(entry);
                  }
                  setMorePopup(null);
                }}
                onEntryDelete={
                  isEditor
                    ? (entry) => {
                        setDeleteTarget({
                          id: entry.id,
                          title: entry.title ?? "",
                        });
                        setMorePopup(null);
                      }
                    : undefined
                }
                onMouseEnter={cancelCloseMore}
                onMouseLeave={scheduleCloseMore}
              />,
              document.body
            )}
        </div>

        <DragOverlay dropAnimation={null}>
          {draggingEntry && (
            <div className="flex items-center gap-1 rounded-xs bg-primary px-1.5 py-0.75 text-xs font-medium text-primary-content cursor-grabbing">
              {draggingEntry.icon && (
                <span className="shrink-0 text-xs leading-none">
                  {draggingEntry.icon}
                </span>
              )}
              <span className="max-w-30 truncate">
                {draggingEntry.title || "Untitled"}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        confirmLabel="Delete"
        confirmLoadingLabel="Deleting…"
        description={
          <>
            <span className="font-medium">
              &ldquo;{deleteTarget?.title || "Untitled"}&rdquo;
            </span>{" "}
            will be permanently deleted. This cannot be undone.
          </>
        }
        loading={deletingEntry}
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }
          setDeletingEntry(true);
          await onDeleteEntry(deleteTarget.id);
          setDeletingEntry(false);
          setDeleteTarget(null);
        }}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        open={!!deleteTarget}
        title="Delete entry?"
      />
    </>
  );
}
