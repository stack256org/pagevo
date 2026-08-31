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
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FileText,
  GripVertical,
  LayoutGrid,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { CellEditorPopover } from "@/components/database/cells/cell-editor";
import { EntryContextMenu } from "@/components/database/entry-context-menu";
import {
  defaultValueForGroup,
  deriveGroups,
  getEntryGroupIds,
  isGroupableType,
} from "@/components/database/grouping";
import {
  getOptionColor,
  PROPERTY_TYPE_ICON,
} from "@/components/database/property-registry";
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
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";

// Same rule board-view.tsx uses to decide whether a property has a
// display-worthy value — kept in sync so gallery cards and board cards
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
// checking sets just the first "complete"-group (or first) option, same
// single-value semantic a checkbox implies even for a multi-select field.
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

const SIZE_COVER: Record<string, string> = {
  small: "h-28",
  medium: "h-44",
  large: "h-60",
};
const SIZE_GRID: Record<string, string> = {
  small: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
  medium: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  large: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
};

export function GalleryView({
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
  onUpdateTitle,
  onUpdateValue,
  onUpdateProperty,
  onUpdateEntryIcon,
  onUpdateView,
}: SharedViewProps) {
  const cardSize = activeView?.galleryCardSize ?? "medium";
  const entryOpenMode = activeView?.entryOpenMode ?? "side_panel";
  const [deleteTarget, setDeleteTarget] = useState<DbEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

  // DnD state (ungrouped path only)
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Reset order when entries change (add/delete)
  const _entryIdKey = entries.map((e) => e.id).join(",");
  useEffect(() => {
    setLocalOrder([]);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Matches Notion: a card shows only its title by default. The one
  // exception is Status, and only once the user explicitly turns on "Show on
  // card" from Status's own Edit Property panel — every other property stays
  // fully editable via the entry's popup but is never rendered on the card.
  const displayProps = properties.filter(
    (p) => !!p.config?.groupedByStatus && !!p.config?.showOnCard
  );

  // Grouping
  const groupPropId = activeView?.groupByPropertyId;
  const groupProp = groupPropId
    ? properties.find((p) => p.id === groupPropId && isGroupableType(p.type))
    : null;

  type Group = {
    id: string | null;
    label: string;
    color: string | null;
    entries: DbEntry[];
  };
  let groups: Group[] = [];
  if (groupProp) {
    groups = [
      { id: null, label: `No ${groupProp.name}`, color: null, entries: [] },
      ...deriveGroups(groupProp, entries, valueMap).map((g) => ({
        ...g,
        entries: [] as DbEntry[],
      })),
    ];
    for (const entry of entries) {
      const val = valueMap.get(entry.id)?.get(groupPropId!) ?? null;
      for (const key of getEntryGroupIds(groupProp, val)) {
        const g = groups.find((gr) => gr.id === key) ?? groups[0];
        g.entries.push(entry);
      }
    }
    groups = groups.filter((g) => g.entries.length > 0 || g.id === null);
  }

  function renderCards(list: DbEntry[]) {
    return list.map((entry) => (
      <GalleryCard
        activeView={activeView}
        cardSize={cardSize}
        databaseId={databaseId}
        displayProps={displayProps}
        entry={entry}
        entryOpenMode={entryOpenMode}
        isEditor={isEditor}
        key={entry.id}
        onDeleteEntry={onDeleteEntry}
        onDeleteRequest={setDeleteTarget}
        onDuplicateEntry={onDuplicateEntry}
        onOpenEntry={onOpenEntry}
        onUpdateEntryIcon={onUpdateEntryIcon}
        onUpdateProperty={onUpdateProperty}
        onUpdateTitle={onUpdateTitle}
        onUpdateValue={onUpdateValue}
        onUpdateView={onUpdateView}
        valueMap={valueMap}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    ));
  }

  if (groupProp) {
    return (
      <>
        <div className="h-full overflow-auto px-5 py-4">
          {groups.map((group) => {
            const color = group.color ? getOptionColor(group.color) : null;
            return (
              <div className="mb-6" key={group.id ?? "no-group"}>
                <div className="mb-3 flex items-center gap-2.5">
                  {group.id && color ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold tracking-wide"
                      style={{ backgroundColor: color.bg, color: color.text }}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: color.dot }}
                      />
                      {group.label}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-xs bg-base-200 px-2.5 py-1 text-xs font-semibold tracking-wide text-base-content/70">
                      <span className="size-1.5 rounded-full bg-base-content/30" />
                      {group.label}
                    </span>
                  )}
                  <span className="text-xs text-base-content/70">
                    {group.entries.length}
                  </span>
                  <div className="h-px flex-1 bg-base-300" />
                </div>
                <div className={`grid gap-4 ${SIZE_GRID[cardSize]}`}>
                  {renderCards(group.entries)}
                  {isEditor && (
                    <button
                      className={[
                        "flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-base-300 bg-base-200/20",
                        "text-base-content/70 transition-colors duration-150 hover:border-base-300 hover:bg-base-200 hover:text-base-content/70",
                      ].join(" ")}
                      onClick={() => {
                        const dv =
                          groupProp && group.id
                            ? defaultValueForGroup(groupProp, group.id)
                            : undefined;
                        onCreateEntry(dv ? { [groupPropId!]: dv } : {});
                      }}
                      type="button"
                    >
                      <Plus size={16} />
                      <span className="text-xs font-medium">New entry</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <ConfirmDialog
          confirmLabel="Delete"
          confirmLoadingLabel="Deleting…"
          description={
            <>
              <span className="font-medium">
                &ldquo;{deleteTarget?.title || "Untitled"}&rdquo;
              </span>{" "}
              and all its content will be permanently deleted. This action
              cannot be undone.
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

  // ── Ungrouped path with DnD ────────────────────────────────────────────────

  const orderedEntries =
    localOrder.length > 0
      ? (localOrder
          .map((id) => entries.find((e) => e.id === id))
          .filter(Boolean) as DbEntry[])
      : entries;

  const draggingEntry = draggingId
    ? (entries.find((e) => e.id === draggingId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over || active.id === over.id) {
      return;
    }

    const currentIds = orderedEntries.map((e) => e.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    setLocalOrder(arrayMove(currentIds, oldIndex, newIndex));
  }

  return (
    <>
      <DndContext
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="h-full overflow-auto p-5">
          <SortableContext
            items={orderedEntries.map((e) => e.id)}
            strategy={rectSortingStrategy}
          >
            <div className={`grid gap-4 ${SIZE_GRID[cardSize]}`}>
              {orderedEntries.map((entry) => (
                <SortableGalleryCard
                  activeView={activeView}
                  cardSize={cardSize}
                  databaseId={databaseId}
                  displayProps={displayProps}
                  entry={entry}
                  entryOpenMode={entryOpenMode}
                  isEditor={isEditor}
                  key={entry.id}
                  onDeleteEntry={onDeleteEntry}
                  onDeleteRequest={setDeleteTarget}
                  onDuplicateEntry={onDuplicateEntry}
                  onOpenEntry={onOpenEntry}
                  onUpdateEntryIcon={onUpdateEntryIcon}
                  onUpdateProperty={onUpdateProperty}
                  onUpdateTitle={onUpdateTitle}
                  onUpdateValue={onUpdateValue}
                  onUpdateView={onUpdateView}
                  valueMap={valueMap}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                />
              ))}

              {/* Add entry card — outside SortableContext items */}
              {isEditor && (
                <button
                  className={[
                    "flex h-full min-h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-base-300 bg-base-200/20",
                    "text-base-content/70 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
                  ].join(" ")}
                  onClick={() => onCreateEntry()}
                  type="button"
                >
                  <Plus size={20} />
                  <span className="text-xs font-medium">New entry</span>
                </button>
              )}
            </div>
          </SortableContext>
        </div>

        <DragOverlay>
          {draggingEntry && (
            <GalleryCard
              activeView={activeView}
              cardSize={cardSize}
              databaseId={databaseId}
              displayProps={displayProps}
              dragging
              entry={draggingEntry}
              entryOpenMode={entryOpenMode}
              isEditor={false}
              onDeleteEntry={onDeleteEntry}
              onDeleteRequest={() => {}}
              onOpenEntry={onOpenEntry}
              onUpdateEntryIcon={onUpdateEntryIcon}
              onUpdateProperty={onUpdateProperty}
              onUpdateTitle={onUpdateTitle}
              onUpdateValue={onUpdateValue}
              onUpdateView={onUpdateView}
              valueMap={valueMap}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
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
            and all its content will be permanently deleted. This action cannot
            be undone.
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

// ── Sortable wrapper ───────────────────────────────────────────────────────────

interface SortableGalleryCardProps extends GalleryCardProps {}

function SortableGalleryCard(props: SortableGalleryCardProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div className="h-full" ref={setNodeRef} style={style}>
      <GalleryCard
        {...props}
        dragHandleProps={{
          ref: setActivatorNodeRef,
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  );
}

// ── Gallery card ──────────────────────────────────────────────────────────────

interface GalleryCardProps {
  activeView: SharedViewProps["activeView"];
  cardSize: string;
  databaseId: string;
  displayProps: SharedViewProps["properties"];
  dragging?: boolean;
  /** Wires the grip icon to dnd-kit's activator since the card is covered edge-to-edge
   *  by click targets that stop pointerdown propagation. Omitted where no handle is needed. */
  dragHandleProps?: {
    ref: (el: HTMLElement | null) => void;
  } & Record<string, unknown>;
  entry: SharedViewProps["entries"][number];
  entryOpenMode?: "side_panel" | "full_page";
  isEditor: boolean;
  onDeleteEntry: SharedViewProps["onDeleteEntry"];
  onDeleteRequest: (entry: SharedViewProps["entries"][number]) => void;
  onDuplicateEntry?: SharedViewProps["onDuplicateEntry"];
  onOpenEntry?: SharedViewProps["onOpenEntry"];
  onUpdateEntryIcon?: SharedViewProps["onUpdateEntryIcon"];
  onUpdateProperty: SharedViewProps["onUpdateProperty"];
  onUpdateTitle: SharedViewProps["onUpdateTitle"];
  onUpdateValue: SharedViewProps["onUpdateValue"];
  onUpdateView: SharedViewProps["onUpdateView"];
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}

function GalleryCard({
  entry,
  databaseId,
  displayProps,
  valueMap,
  workspaceSlug,
  workspaceId,
  cardSize,
  isEditor,
  onDeleteRequest,
  onDuplicateEntry,
  onOpenEntry,
  onUpdateTitle,
  onUpdateValue,
  onUpdateProperty,
  onUpdateEntryIcon,
  entryOpenMode,
  dragging,
  dragHandleProps,
  activeView,
  onUpdateView,
}: GalleryCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<DOMRect | null>(null);
  const [commentCount, setCommentCount] = useState<number | null>(
    entry.commentCount ?? null
  );
  const [tooltip, setTooltip] = useState<{
    label: string;
    rect: DOMRect;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title ?? "");
  const [propEditor, setPropEditor] = useState<{
    prop: DbProperty;
    rect: DOMRect;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  // Vote-mode person: toggles the current viewer's own vote directly instead
  // of opening the full people picker — same rule as table-view.tsx's
  // activateCell, enforced independently server-side either way. Returns
  // true if it handled the click (caller should skip opening the picker).
  function handleVoteClick(prop: DbProperty): boolean {
    if (prop.type !== "person" || !prop.config?.voteMode) {
      return false;
    }
    if (!session?.user?.id) {
      return true;
    }
    onUpdateValue(
      entry.id,
      prop.id,
      toggleSelfVote(
        valueMap.get(entry.id)?.get(prop.id) as { userIds?: string[] } | null,
        session.user
      )
    );
    return true;
  }

  const filledProps = displayProps.filter((prop) =>
    hasDisplayValue(
      prop,
      valueMap.get(entry.id)?.get(prop.id) ?? null,
      resolveDisplayAs(prop, activeView)
    )
  );
  const emptyProps = editing
    ? displayProps.filter(
        (prop) =>
          !hasDisplayValue(
            prop,
            valueMap.get(entry.id)?.get(prop.id) ?? null,
            resolveDisplayAs(prop, activeView)
          )
      )
    : [];

  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only), so no per-card fetch is needed — see board-view.tsx's
  // CardShell for the same change. `onCommentAdded` below still bumps this
  // instantly between fetches.
  useEffect(() => {
    setCommentCount(entry.commentCount ?? 0);
  }, [entry.commentCount]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    function h(e: MouseEvent) {
      if (menuPos || commentAnchor || propEditor) {
        return; // a nested popover owns this click
      }
      const target = e.target as HTMLElement;
      if (cardRef.current && !cardRef.current.contains(target)) {
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [editing, menuPos, commentAnchor, propEditor]);

  // tooltip is a `position: fixed` portal anchored to a rect snapshotted once
  // on hover — dismiss it on scroll instead of repositioning, since locking
  // scroll on every card hover would hurt the gallery's own scrolling.
  useEffect(() => {
    if (!tooltip) {
      return;
    }
    function handleScroll() {
      setTooltip(null);
    }
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [tooltip]);

  function commitTitle() {
    const trimmed = editTitle.trim();
    if (trimmed !== (entry.title ?? "")) {
      onUpdateTitle(entry.id, trimmed);
    }
  }

  const isSidePanel = entryOpenMode === "side_panel" && !!onOpenEntry;

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: card shell, not a control — its handlers are a right-click affordance plus hover tracking, neither of which is an activation. Right-click has no keyboard equivalent to add, and per AGENTS.md §24 the same actions are also on the card's visible "⋯" menu button, which is a native focusable button. Opening the card is likewise a separate focusable element inside. */}
      <div
        className={[
          "relative flex h-full flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 transition-colors duration-150",
          dragging ? "ring-2 ring-primary/40 opacity-90" : "",
        ].join(" ")}
        onContextMenu={(e) => {
          if (dragging) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setTooltip(null);
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={() => !dragging && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        ref={cardRef}
      >
        {/* Grip icon — top-left, visible on hover; the actual drag handle */}
        <div
          className={`absolute left-2 top-2 z-10 transition-opacity ${dragHandleProps ? "cursor-grab touch-none select-none" : "pointer-events-none"}`}
          style={{ opacity: hovered ? 0.6 : 0 }}
          {...dragHandleProps}
        >
          <GripVertical className="text-base-content/70" size={14} />
        </div>

        {/* Action buttons — top-right, visible on hover — mirrors board-view's
       CardShell (Edit/Open-full-page toggle + "…" menu) so gallery and board
       cards behave identically. */}
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity"
          style={{ opacity: hovered || editing ? 1 : 0 }}
        >
          {isEditor && !editing ? (
            <button
              className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                setTooltip({
                  label: "Open full page",
                  rect: (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect(),
                });
                setEditTitle(entry.title ?? "");
                setEditing(true);
              }}
              onMouseEnter={(e) =>
                setTooltip({
                  label: "Edit",
                  rect: (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect(),
                })
              }
              onMouseLeave={() => setTooltip(null)}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <Pencil size={13} />
            </button>
          ) : (
            <Link
              className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
              href={`/app/${workspaceSlug}/${entry.shortId}`}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) =>
                setTooltip({
                  label: "Open full page",
                  rect: (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect(),
                })
              }
              onMouseLeave={() => setTooltip(null)}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <PanelRight size={13} />
            </Link>
          )}
          {isEditor && (
            <button
              className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                setTooltip(null);
                setMenuPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseEnter={(e) =>
                setTooltip({
                  label: "More options",
                  rect: (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect(),
                })
              }
              onMouseLeave={() => setTooltip(null)}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <MoreHorizontal size={13} />
            </button>
          )}
        </div>

        {/* Cover area */}
        {isSidePanel ? (
          <button
            className={`relative block w-full shrink-0 overflow-hidden ${SIZE_COVER[cardSize]}`}
            onClick={() => !dragging && !editing && onOpenEntry!(entry)}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            {entry.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              // biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns
              <img
                alt={entry.title ?? "Entry cover"}
                className="size-full object-cover"
                src={entry.coverUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-base-200">
                <LayoutGrid className="text-base-content/70" size={28} />
              </div>
            )}
          </button>
        ) : (
          <Link
            className={`relative block w-full shrink-0 overflow-hidden ${SIZE_COVER[cardSize]}`}
            href={`/app/${workspaceSlug}/${entry.shortId}`}
            onClick={(e) => editing && e.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {entry.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              // biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns
              <img
                alt={entry.title ?? "Entry cover"}
                className="size-full object-cover"
                src={entry.coverUrl}
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-base-200">
                <LayoutGrid className="text-base-content/70" size={28} />
              </div>
            )}
          </Link>
        )}

        {/* Content */}
        <div className="flex flex-1 flex-col px-3.5 pt-3 pb-3.5">
          <div className="flex items-start gap-1.5">
            {/* h-5 matches the title's own line height (text-sm leading-snug)
                so the icon centers against the title's first line instead of
                sitting at a manually-guessed offset from the row's top. */}
            <span className="flex h-5 shrink-0 items-center">
              {entry.icon ? (
                <PageIcon className="shrink-0" icon={entry.icon} size={14} />
              ) : (
                <FileText className="shrink-0 text-base-content/70" size={12} />
              )}
            </span>
            {editing ? (
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold leading-snug text-base-content outline-none"
                onBlur={commitTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  window.dispatchEvent(
                    new CustomEvent("pagevo:page-title-changed", {
                      detail: { pageId: entry.id, title: e.target.value },
                    })
                  );
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitTitle();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") {
                    setEditTitle(entry.title ?? "");
                    setEditing(false);
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Untitled"
                value={editTitle}
              />
            ) : isSidePanel ? (
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => !dragging && onOpenEntry!(entry)}
                onPointerDown={(e) => e.stopPropagation()}
                type="button"
              >
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-base-content transition-colors duration-150 hover:text-base-content/70">
                  {entry.title || (
                    <span className="font-normal text-base-content/70">
                      Untitled
                    </span>
                  )}
                </p>
              </button>
            ) : (
              <Link
                className="min-w-0 flex-1"
                href={`/app/${workspaceSlug}/${entry.shortId}`}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-base-content transition-colors duration-150 hover:text-base-content/70">
                  {entry.title || (
                    <span className="font-normal text-base-content/70">
                      Untitled
                    </span>
                  )}
                </p>
              </Link>
            )}
          </div>

          {/* Always rendered (not just when there's a comment/filled property) —
              reserves the same vertical slot on every card, including an
              invisible placeholder for the comment badge below, so cards in
              the same row land on identical natural heights instead of some
              being visibly shorter with a dead gap at the bottom. */}
          <div className="mt-1.5 space-y-0.5">
            {filledProps.map((prop) => {
              const raw = valueMap.get(entry.id)?.get(prop.id) ?? null;
              const resolvedDisplayAs = resolveDisplayAs(prop, activeView);
              const resolvedWrapContent = resolveWrapContent(prop, activeView);
              const isCheckboxDisplay =
                (prop.type === "select" || prop.type === "multi_select") &&
                resolvedDisplayAs === "checkbox";
              // Checkbox display already renders its own "☐ Property name"
              // label internally — wrapping it in the usual "label: value"
              // row would show the property name twice.
              if (isCheckboxDisplay) {
                return (
                  <div className="overflow-hidden" key={prop.id}>
                    <CellDisplay
                      compact
                      onToggleCheckbox={() => {
                        const next =
                          prop.type === "multi_select"
                            ? nextCheckboxMultiSelectValue(prop, raw)
                            : nextCheckboxSelectValue(prop, raw);
                        onUpdateValue(entry.id, prop.id, next);
                      }}
                      property={prop}
                      resolvedDisplayAs={resolvedDisplayAs}
                      resolvedWrapContent={resolvedWrapContent}
                      value={raw}
                      workspaceId={workspaceId}
                    />
                  </div>
                );
              }
              // Vote-mode already renders its own self-explanatory "👍 N"
              // badge — same reasoning as checkbox-display above, no
              // "label: value" row needed, just a clickable wrapper.
              if (prop.type === "person" && prop.config?.voteMode) {
                return (
                  <button
                    className="overflow-hidden text-left"
                    key={prop.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVoteClick(prop);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    type="button"
                  >
                    <CellDisplay
                      compact
                      property={prop}
                      value={raw}
                      workspaceId={workspaceId}
                    />
                  </button>
                );
              }
              return (
                <div
                  className="flex items-center gap-1.5 overflow-hidden"
                  key={prop.id}
                >
                  <span className="w-19 shrink-0 truncate text-xs font-medium text-base-content/70">
                    {prop.name}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <CellDisplay
                      compact
                      property={prop}
                      resolvedDisplayAs={resolvedDisplayAs}
                      resolvedWrapContent={resolvedWrapContent}
                      value={raw}
                      workspaceId={workspaceId}
                    />
                  </div>
                </div>
              );
            })}
            {/* Rendered even with 0 comments (just invisible) — reserves this
                  row's height on every card so a card with no comments doesn't
                  end up visibly shorter than one that has them. */}
            <button
              aria-hidden={!commentCount}
              className={`inline-flex items-center gap-1 rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200/70 ${commentCount ? "" : "invisible"}`}
              // Exempt from CellCommentPopover's capture-phase outside-click
              // close. Without it that fires first and closes the popover,
              // then the toggle below sees "closed" and reopens it — so the
              // popover could never be dismissed from its own badge.
              data-comment-exempt
              onClick={(e) => {
                e.stopPropagation();
                // Toggle: a second click on the badge closes the popover it
                // opened. Assigning the rect unconditionally just replaced
                // it with an identical one, leaving the popover stuck open.
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                setCommentAnchor((cur) => (cur ? null : rect));
              }}
              onMouseEnter={(e) =>
                setTooltip({
                  label: "View comments",
                  rect: (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect(),
                })
              }
              onMouseLeave={() => setTooltip(null)}
              onPointerDown={(e) => e.stopPropagation()}
              tabIndex={commentCount ? 0 : -1}
              type="button"
            >
              <MessageSquare size={11} />
              {commentCount || 0}
            </button>
          </div>

          {/* Quick-add empty properties — only while editing, matching board-view's
       inline card editor so gallery cards can be filled in without opening
       the full page. */}
          {emptyProps.length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5 border-t border-base-300 pt-2">
              {emptyProps.map((prop) => {
                const TypeIcon =
                  PROPERTY_TYPE_ICON[
                    prop.type as keyof typeof PROPERTY_TYPE_ICON
                  ];
                const propConfig = (prop.config ?? {}) as { icon?: string };
                return (
                  <button
                    className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    key={prop.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (handleVoteClick(prop)) {
                        return;
                      }
                      setPropEditor({
                        prop,
                        rect: (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect(),
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    type="button"
                  >
                    {propConfig.icon ? (
                      <PageIcon
                        className="shrink-0"
                        icon={propConfig.icon}
                        size={12}
                      />
                    ) : (
                      <TypeIcon className="shrink-0" size={12} />
                    )}
                    {prop.type === "person" && prop.config?.voteMode
                      ? prop.name
                      : `Add ${prop.name}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}

      <EntryContextMenu
        activeView={activeView}
        databaseId={databaseId}
        entryIcon={entry.icon ?? null}
        entryId={entry.id}
        entryRect={cardRef.current?.getBoundingClientRect() ?? null}
        entryShortId={entry.shortId}
        forcePos={menuPos}
        onClose={() => setMenuPos(null)}
        onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
        onDelete={() => {
          setHovered(false);
          onDeleteRequest(entry);
        }}
        onDuplicate={
          onDuplicateEntry ? () => onDuplicateEntry(entry.id) : undefined
        }
        onIconChange={(icon) => onUpdateEntryIcon?.(entry.id, icon)}
        onOpenEntry={
          entryOpenMode === "side_panel" && onOpenEntry
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

      {commentAnchor && (
        <CellCommentPopover
          anchorRect={commentAnchor}
          entryShortId={entry.shortId}
          onClose={() => setCommentAnchor(null)}
          onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
          pageId={entry.id}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      )}

      {propEditor && (
        <CellEditorPopover
          cellRect={propEditor.rect}
          onClose={() => setPropEditor(null)}
          onPropertyConfigChange={(propId, config) =>
            onUpdateProperty(propId, { config })
          }
          onSave={(v) => {
            onUpdateValue(entry.id, propEditor.prop.id, v);
            setPropEditor(null);
          }}
          property={propEditor.prop}
          value={valueMap.get(entry.id)?.get(propEditor.prop.id) ?? null}
          workspaceId={workspaceId}
        />
      )}
    </>
  );
}
