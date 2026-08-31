"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDroppable,
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
  Popover,
  PopoverButton,
  PopoverPanel,
  Radio,
  RadioGroup,
  useClose,
} from "@headlessui/react";
import {
  FileText,
  GripVertical,
  LayoutGrid,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { CellEditorPopover } from "@/components/database/cells/cell-editor";
import { EditPropertySidePanel } from "@/components/database/edit-property-panel";
import { EntryContextMenu } from "@/components/database/entry-context-menu";
import { GroupHeaderMenu } from "@/components/database/group-header-menu";
import {
  type BoardSettings,
  GroupSettingsPanel,
} from "@/components/database/group-settings-panel";
import {
  areGroupsEditable,
  defaultValueForGroup,
  deriveGroups,
  getEntryGroupIds,
  isGroupableType,
  valueAfterGroupMove,
} from "@/components/database/grouping";
import {
  getOptionColor,
  OPTION_COLORS,
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
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";

// ── helpers ───────────────────────────────────────────────────────────────────

function hasDisplayValue(prop: DbProperty, raw: unknown): boolean {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "text":
      return !!(v as { text?: string } | null)?.text;
    case "number":
      return (v as { number?: number | null } | null)?.number != null;
    case "select":
      return !!(v as { optionId?: string } | null)?.optionId;
    case "multi_select":
      return (
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

// Tag drag ids with their column ("card\0<colKey>\0<entryId>") since a Person-grouped board can
// show the same entry in multiple columns (multi-assignee); \0 can't appear in a real uuid/cuid2.
function cardSortId(colKey: string, entryId: string): string {
  return `card\0${colKey}\0${entryId}`;
}
function parseCardSortId(
  id: string
): { colKey: string; entryId: string } | null {
  if (!id.startsWith("card\0")) {
    return null;
  }
  const rest = id.slice("card\0".length);
  const sep = rest.indexOf("\0");
  if (sep === -1) {
    return null;
  }
  return { colKey: rest.slice(0, sep), entryId: rest.slice(sep + 1) };
}

// ── AddOptionPanel ────────────────────────────────────────────────────────────
// Split out (rather than inlined) so it can call useClose() itself instead of BoardView threading Popover's render-prop `close` down.

function AddOptionPanel({
  newOptName,
  setNewOptName,
  newOptColor,
  setNewOptColor,
  previewColor,
  options,
  onAdd,
  addingOption,
  addOptInputRef,
  showTooltip,
  hideTooltip,
}: {
  newOptName: string;
  setNewOptName: (v: string) => void;
  newOptColor: string;
  setNewOptColor: (v: string) => void;
  previewColor: ReturnType<typeof getOptionColor>;
  options: SelectOption[];
  onAdd: () => void;
  addingOption: boolean;
  addOptInputRef: React.RefObject<HTMLInputElement | null>;
  showTooltip: (label: string, e: React.MouseEvent<HTMLElement>) => void;
  hideTooltip: () => void;
}) {
  const close = useClose();

  // Popover unmounts this panel on every close path — clearing the draft name on unmount
  // means it can never leak a half-typed option name into the next time this is opened.
  useEffect(() => () => setNewOptName(""), [setNewOptName]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-base-content/70">
          New option
        </p>
        <button
          className="flex size-5 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content/70"
          onClick={close}
          type="button"
        >
          <X size={11} />
        </button>
      </div>

      <input
        autoFocus
        className="w-full rounded-sm border border-base-300 bg-base-200/20 px-2.5 py-2 text-sm text-base-content placeholder:text-base-content/50 focus:outline-none"
        onChange={(e) => setNewOptName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd();
          }
        }}
        placeholder="Option name…"
        ref={addOptInputRef}
        value={newOptName}
      />

      <p className="mb-1.5 mt-3 text-xs font-semibold tracking-wide text-base-content/70">
        Colour
      </p>
      <RadioGroup
        className="flex flex-wrap gap-2"
        onChange={setNewOptColor}
        value={newOptColor}
      >
        {OPTION_COLORS.map((c) => (
          <Radio
            className="size-5 cursor-pointer rounded-full opacity-50 transition-colors duration-150 hover:opacity-90 data-checked:scale-110 data-checked:opacity-100 data-checked:outline data-checked:outline-2 data-checked:outline-base-content/60"
            key={c.id}
            onMouseEnter={(e) => showTooltip(c.id, e)}
            onMouseLeave={hideTooltip}
            style={{ backgroundColor: c.dot }}
            value={c.id}
          />
        ))}
      </RadioGroup>

      <div className="mt-3 flex min-h-6.5 items-center">
        {newOptName.trim() ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-xs font-semibold ${previewColor.bg} ${previewColor.text}`}
          >
            <span className={`size-1.5 rounded-full ${previewColor.dot}`} />
            {newOptName.trim()}
          </span>
        ) : (
          <span className="text-xs text-base-content/70">
            Preview will appear here
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!newOptName.trim() || addingOption}
          onClick={onAdd}
          type="button"
        >
          {addingOption ? (
            <Loader2 className="animate-spin" size={12} />
          ) : (
            "Add option"
          )}
        </button>
        <button
          className="rounded-sm border border-base-300 px-3 py-1.5 text-xs text-base-content/70 transition-colors hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={addingOption}
          onClick={close}
          type="button"
        >
          Cancel
        </button>
      </div>

      {options.length > 0 && (
        <div className="mt-3 border-t border-base-300 pt-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
            Existing options
          </p>
          <div className="flex flex-col gap-1">
            {options.map((opt) => {
              const c = getOptionColor(opt.color);
              return (
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-xs px-2.5 py-0.5 text-xs font-semibold"
                  key={opt.id}
                  style={{ backgroundColor: c.bg, color: c.text }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: c.dot }}
                  />
                  {opt.name}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ── BoardView ─────────────────────────────────────────────────────────────────

export function BoardView({
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
  onUpdateProperty,
  onDeleteEntry,
  onDuplicateEntry,
  onOpenEntry,
  onUpdateView,
  onUpdateEntryIcon,
}: SharedViewProps) {
  const [draggingSortId, setDraggingSortId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newOptName, setNewOptName] = useState("");
  const [newOptColor, setNewOptColor] = useState("blue");
  const [addingOption, setAddingOption] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DbEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [localEntryOrder, setLocalEntryOrder] = useState<Map<string, string[]>>(
    new Map()
  );
  const [groupMenu, setGroupMenu] = useState<{
    optionId: string;
    triggerEl: HTMLElement;
  } | null>(null);
  const [editingGroupsAnchor, setEditingGroupsAnchor] =
    useState<HTMLElement | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [draggingColKey, setDraggingColKey] = useState<string | null>(null);
  const [pinTooltip, setPinTooltip] = useState<{
    label: string;
    rect: DOMRect;
  } | null>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const addOptInputRef = useRef<HTMLInputElement>(null);
  const editGroupsButtonRef = useRef<HTMLButtonElement>(null);

  const groupPropId = activeView?.groupByPropertyId;
  const groupProp = properties.find(
    (p) => p.id === groupPropId && isGroupableType(p.type)
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // pinTooltip is a `position: fixed` portal anchored to a rect snapshotted
  // once on hover — dismiss it on scroll instead of repositioning, since
  // locking scroll on every hover would hurt the board's own scrolling.
  useEffect(() => {
    if (!pinTooltip) {
      return;
    }
    function handleScroll() {
      setPinTooltip(null);
    }
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [pinTooltip]);

  if (!groupProp) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex size-16 items-center justify-center rounded-lg bg-base-200/40">
          <LayoutGrid className="text-base-content/70" size={28} />
        </div>
        <div>
          <p className="text-sm font-semibold text-base-content">
            No group-by property
          </p>
          <p className="mt-1 text-xs text-base-content/70">
            Open the <strong>Group</strong> dropdown in the toolbar and pick a
            Select, Status, Checkbox, or Person property to organise cards into
            columns.
          </p>
        </div>
      </div>
    );
  }

  // Only select/status have a real, user-managed option list — checkbox/person's
  // groups are derived (see deriveGroups), so `options` is empty (and all the
  // option-CRUD UI below is gated off) for those two types.
  const options: SelectOption[] = (groupProp.config?.options ??
    []) as SelectOption[];
  const groupsEditable = areGroupsEditable(groupProp.type);

  const boardSettings = (activeView?.boardSettings ?? {}) as BoardSettings;
  const sortDirection = boardSettings.sortDirection ?? "manual";
  const hideEmptyGroups = !!boardSettings.hideEmptyGroups;
  const colorColumns = boardSettings.colorColumns !== false;
  const baseGroups = deriveGroups(groupProp, entries, valueMap);
  // Display-only sorted copy — the underlying option array (and its index-based drag
  // math in onDragEnd) is untouched, so switching back to Manual restores drag order.
  const displayGroups =
    sortDirection === "manual"
      ? baseGroups
      : [...baseGroups].sort((a, b) =>
          sortDirection === "asc"
            ? a.label.localeCompare(b.label)
            : b.label.localeCompare(a.label)
        );

  // Checkbox never has an "unset" state (always true/false), so a synthetic
  // "No X" bucket would just be permanently, meaninglessly empty — every other
  // groupable type keeps it, matching the original behavior exactly.
  const columns: {
    id: string | null;
    label: string;
    color: string;
    entries: DbEntry[];
  }[] = [
    ...(groupProp.type === "checkbox"
      ? []
      : [
          {
            id: null,
            label: "No " + groupProp.name,
            color: "gray",
            entries: [] as DbEntry[],
          },
        ]),
    ...displayGroups.map((g) => ({
      id: g.id,
      label: g.label,
      color: g.color ?? "gray",
      entries: [] as DbEntry[],
    })),
  ];

  for (const entry of entries) {
    const val = valueMap.get(entry.id)?.get(groupPropId!) ?? null;
    for (const key of getEntryGroupIds(groupProp, val)) {
      const col = columns.find((c) => c.id === key) ?? columns[0];
      col.entries.push(entry);
    }
  }

  // Apply local ordering overrides for within-column reordering
  const orderedColumns = columns.map((col) => {
    const colKey = col.id ?? "no-group";
    const localOrder = localEntryOrder.get(colKey);
    if (!localOrder) {
      return col;
    }
    const entryMap = new Map(col.entries.map((e) => [e.id, e]));
    const sorted = localOrder
      .map((id) => entryMap.get(id))
      .filter(Boolean) as DbEntry[];
    // include any entries not in localOrder at the end (safety net)
    const sortedIds = new Set(localOrder);
    const extras = col.entries.filter((e) => !sortedIds.has(e.id));
    return { ...col, entries: [...sorted, ...extras] };
  });

  // Matches Notion: a card shows only its title, plus Status if "Show on card" is enabled.
  // Same rule as Calendar/Gallery.
  const cardProps = properties.filter(
    (p) => !!p.config?.groupedByStatus && !!p.config?.showOnCard
  );
  const draggingEntryId = draggingSortId
    ? (parseCardSortId(draggingSortId)?.entryId ?? null)
    : null;
  const draggingEntry = draggingEntryId
    ? entries.find((e) => e.id === draggingEntryId)
    : null;

  const hiddenGroupOptionIds = boardSettings.hiddenGroupOptionIds ?? [];
  const hideAggregation = !!boardSettings.hideAggregation;
  const visibleColumns = orderedColumns.filter((c) => {
    if (c.id !== null && hiddenGroupOptionIds.includes(c.id)) {
      return false;
    }
    if (hideEmptyGroups && c.id !== null && c.entries.length === 0) {
      return false;
    }
    return true;
  });
  // Whole-column reordering only makes sense for select/status, whose column
  // order is a persisted, user-owned array (`config.options`) — checkbox/person
  // columns are derived fresh every render, so there's nothing to persist a
  // reordering into.
  const draggableColumnKeys =
    sortDirection === "manual" && groupsEditable
      ? visibleColumns
          .filter((c) => c.id !== null)
          .map((c) => "colhandle-" + c.id)
      : [];

  // Pinned groups render as a compact chip strip in addition to their normal column —
  // a quick-reference row, independent of that column's hidden/visible state.
  const pinnedGroupIds = boardSettings.pinnedGroupOptionIds ?? [];
  const pinnedColumns = orderedColumns.filter(
    (c) => c.id !== null && pinnedGroupIds.includes(c.id)
  );
  function unpinColumn(optionId: string) {
    onUpdateView({
      boardSettings: {
        ...boardSettings,
        pinnedGroupOptionIds: pinnedGroupIds.filter((id) => id !== optionId),
      },
    });
  }
  function scrollToColumn(colKey: string) {
    document.querySelector(`[data-col-id="${colKey}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    if (id.startsWith("colhandle-")) {
      setDraggingColKey(id.slice("colhandle-".length));
      return;
    }
    setDraggingSortId(id);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const activeRaw = String(active.id);

    // Whole-column reordering — distinct id prefix so it never collides with card ids.
    if (activeRaw.startsWith("colhandle-")) {
      setDraggingColKey(null);
      if (!over) {
        return;
      }
      const overId = String(over.id);
      if (!overId.startsWith("colhandle-") || activeRaw === overId) {
        return;
      }
      const activeOptId = activeRaw.slice("colhandle-".length);
      const overOptId = overId.slice("colhandle-".length);
      const oldIdx = options.findIndex((o) => o.id === activeOptId);
      const newIdx = options.findIndex((o) => o.id === overOptId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) {
        return;
      }
      const nextOptions = arrayMove(options, oldIdx, newIdx);
      onUpdateProperty(groupProp!.id, {
        config: { ...groupProp!.config, options: nextOptions },
      });
      return;
    }

    setDraggingSortId(null);
    if (!over || active.id === over.id) {
      return;
    }

    // The column-tagged id (see cardSortId) tells us which column-instance was dragged, since an
    // entry can appear in more than one column and "the" containing column would be ambiguous.
    const overRaw = String(over.id);
    const activeParsed = parseCardSortId(activeRaw);
    if (!activeParsed) {
      return;
    }
    const { colKey: activeColKey, entryId: activeId } = activeParsed;

    const overParsed = parseCardSortId(overRaw);
    const targetColKey = overRaw.startsWith("col-")
      ? overRaw.slice("col-".length)
      : overParsed?.colKey;
    if (targetColKey == null) {
      return;
    }

    const activeCol = orderedColumns.find(
      (c) => (c.id ?? "no-group") === activeColKey
    );
    const targetCol = orderedColumns.find(
      (c) => (c.id ?? "no-group") === targetColKey
    );
    if (!activeCol || !targetCol) {
      return;
    }

    if (activeColKey === targetColKey) {
      // Within-column reordering
      const currentOrder = activeCol.entries.map((e) => e.id);
      const oldIndex = currentOrder.indexOf(activeId);
      const newIndex =
        overParsed && overParsed.colKey === targetColKey
          ? currentOrder.indexOf(overParsed.entryId)
          : currentOrder.length - 1;
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return;
      }
      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
      setLocalEntryOrder((prev) => new Map(prev).set(activeColKey, newOrder));
    } else {
      // Cross-column move: call server update and clear local order for both columns
      const currentValue = valueMap.get(activeId)?.get(groupPropId!) ?? null;
      onUpdateValue(
        activeId,
        groupPropId!,
        valueAfterGroupMove(
          groupProp!,
          currentValue,
          activeCol.id,
          targetCol.id
        )
      );
      setLocalEntryOrder((prev) => {
        const next = new Map(prev);
        next.delete(activeColKey);
        next.delete(targetColKey);
        return next;
      });
    }
  }

  function deleteGroupOption(optionId: string) {
    const next = options.filter((o) => o.id !== optionId);
    onUpdateProperty(groupProp!.id, {
      config: { ...groupProp!.config, options: next },
    });
  }

  async function handleAddOption() {
    const name = newOptName.trim();
    if (!name || addingOption) {
      return;
    }
    const newOpt: SelectOption = {
      id: crypto.randomUUID(),
      name,
      color: newOptColor,
    };
    const updated = [...options, newOpt];
    setAddingOption(true);
    try {
      await onUpdateProperty(groupProp!.id, {
        config: { ...groupProp!.config, options: updated },
      });
      setNewOptName("");
      setNewOptColor(OPTION_COLORS[updated.length % OPTION_COLORS.length].id);
      setTimeout(() => addOptInputRef.current?.focus(), 0);
    } finally {
      setAddingOption(false);
    }
  }

  const previewColor = getOptionColor(newOptColor);

  return (
    <>
      {/* Always rendered when there's a groupable property — independent of any
      column being visible, unlike the per-column "⋯" menu's own "Edit
      groups" entry. Without this, hiding every group (or the last one) left
      no way back in: GroupSettingsPanel — which already lists hidden groups
      with a toggle to restore them — was only ever reachable from a visible
      column's own menu. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-6 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {pinnedColumns.length > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-base-content/70">
              <Pin size={11} /> Pinned groups
            </span>
          )}
          {pinnedColumns.map((col) => {
            const color = getOptionColor(col.color);
            const colKey = col.id ?? "no-group";
            return (
              <div
                className="flex shrink-0 items-center gap-0.5 rounded-full border border-transparent pl-1 pr-1 py-1 text-xs font-medium"
                key={col.id}
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                <button
                  className="flex items-center gap-1.5 rounded-full px-1.5 transition-colors hover:opacity-70"
                  onClick={() => scrollToColumn(colKey)}
                  onMouseEnter={(e) =>
                    setPinTooltip({
                      label: `Jump to ${col.label}`,
                      rect: (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect(),
                    })
                  }
                  onMouseLeave={() => setPinTooltip(null)}
                  type="button"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color.dot }}
                  />
                  {col.label}
                  <span className="opacity-70">{col.entries.length}</span>
                </button>
                <button
                  className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/10"
                  onClick={() => unpinColumn(col.id!)}
                  onMouseEnter={(e) =>
                    setPinTooltip({
                      label: "Unpin group",
                      rect: (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect(),
                    })
                  }
                  onMouseLeave={() => setPinTooltip(null)}
                  type="button"
                >
                  <Pin className="shrink-0 opacity-70" size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
          onClick={() => setEditingGroupsAnchor(editGroupsButtonRef.current)}
          ref={editGroupsButtonRef}
          type="button"
        >
          <Settings2 size={12} />
          Edit groups
          {hiddenGroupOptionIds.length > 0 && (
            <span className="rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-semibold text-base-content/70">
              {hiddenGroupOptionIds.length} hidden
            </span>
          )}
        </button>
      </div>
      <DndContext
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        <SortableContext
          items={draggableColumnKeys}
          strategy={horizontalListSortingStrategy}
        >
          {/* overflow-y-hidden is required, not decorative — per spec, `overflow-x:
       auto` with `overflow-y` left at its default `visible` gets silently
       upgraded to `overflow-y: auto` too, turning this row into a second
       vertical scroll container instead of each column scrolling on its own. */}
          <div className="flex items-start gap-3 overflow-x-auto overflow-y-hidden px-6 py-4">
            {/* ── Columns ── */}
            {visibleColumns.map((col) => {
              const color = getOptionColor(col.color);
              const colKey = col.id ?? "no-group";
              const isCollapsed = collapsed.has(colKey);

              function toggleCollapse() {
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(colKey)) {
                    next.delete(colKey);
                  } else {
                    next.add(colKey);
                  }
                  return next;
                });
              }

              return (
                <SortableColumn
                  colKey={colKey}
                  draggable={
                    col.id !== null &&
                    !isCollapsed &&
                    sortDirection === "manual" &&
                    groupsEditable
                  }
                  isCollapsed={isCollapsed}
                  isDragging={draggingColKey === col.id}
                  key={colKey}
                >
                  {(handleProps) => (
                    <SortableContext
                      id={colKey}
                      items={col.entries.map((e) => cardSortId(colKey, e.id))}
                      strategy={verticalListSortingStrategy}
                    >
                      <ColumnDropTarget
                        colKey={colKey}
                        isCollapsed={isCollapsed}
                      >
                        <div
                          className={`flex flex-col rounded-lg border border-base-300 bg-base-200/40 ${isCollapsed ? "w-12" : ""}`}
                          data-col-id={colKey}
                        >
                          {/* Column header */}
                          {isCollapsed ? (
                            /* Collapsed: vertical pill showing label + count */
                            <button
                              className="flex h-full flex-col items-center gap-2 py-3"
                              onClick={toggleCollapse}
                              onMouseEnter={(e) =>
                                showTooltip(`Expand ${col.label}`, e)
                              }
                              onMouseLeave={hideTooltip}
                              type="button"
                            >
                              {col.id ? (
                                <span
                                  className={`flex size-6 shrink-0 items-center justify-center rounded-xs text-xs font-bold ${colorColumns ? "" : "bg-base-200 text-base-content/70"}`}
                                  style={
                                    colorColumns
                                      ? {
                                          backgroundColor: color.bg,
                                          color: color.text,
                                        }
                                      : undefined
                                  }
                                >
                                  {col.entries.length}
                                </span>
                              ) : (
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-base-200 text-xs font-bold text-base-content/70">
                                  {col.entries.length}
                                </span>
                              )}
                              <span
                                className="text-xs font-semibold text-base-content/70"
                                style={{
                                  writingMode: "vertical-rl",
                                  textOrientation: "mixed",
                                  transform: "rotate(180deg)",
                                }}
                              >
                                {col.label}
                              </span>
                            </button>
                          ) : (
                            <>
                              <div
                                {...handleProps}
                                className={`flex items-center justify-between px-3 py-2.5 ${handleProps ? "cursor-grab" : ""}`}
                                style={{
                                  touchAction: handleProps ? "none" : undefined,
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  {col.id ? (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-xs px-2.5 py-1 text-sm font-semibold ${colorColumns ? "" : "bg-base-200 text-base-content/70"}`}
                                      style={
                                        colorColumns
                                          ? {
                                              backgroundColor: color.bg,
                                              color: color.text,
                                            }
                                          : undefined
                                      }
                                    >
                                      <span
                                        className="size-1.5 rounded-full"
                                        style={{ backgroundColor: color.dot }}
                                      />
                                      {col.label}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 rounded-xs bg-base-200 px-2.5 py-1 text-sm font-semibold text-base-content/70">
                                      <span className="size-1.5 rounded-full bg-base-content/30" />
                                      {col.label}
                                    </span>
                                  )}
                                  {!hideAggregation && (
                                    <span className="ml-1.5 shrink-0 rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-semibold text-base-content/70">
                                      {col.entries.length}
                                    </span>
                                  )}
                                  {col.id !== null &&
                                    pinnedGroupIds.includes(col.id) && (
                                      <Pin
                                        className="ml-0.5 shrink-0 text-base-content/70"
                                        size={12}
                                      />
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  {col.id && (
                                    <button
                                      className="flex size-6 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content/70"
                                      onClick={(e) =>
                                        setGroupMenu({
                                          optionId: col.id!,
                                          triggerEl:
                                            e.currentTarget as HTMLElement,
                                        })
                                      }
                                      onMouseEnter={(e) =>
                                        showTooltip("More options", e)
                                      }
                                      onMouseLeave={hideTooltip}
                                      onPointerDown={(e) => e.stopPropagation()}
                                      type="button"
                                    >
                                      <MoreHorizontal size={13} />
                                    </button>
                                  )}
                                  <button
                                    className="flex size-6 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content/70"
                                    onClick={toggleCollapse}
                                    onMouseEnter={(e) =>
                                      showTooltip("Collapse column", e)
                                    }
                                    onMouseLeave={hideTooltip}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    type="button"
                                  >
                                    <PanelLeft size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Cards */}
                              <div className="flex flex-col gap-2 px-2 pb-2">
                                {col.entries.map((entry) => (
                                  <SortableCard
                                    activeView={activeView}
                                    cardProps={cardProps}
                                    databaseId={databaseId}
                                    entry={entry}
                                    entryOpenMode={
                                      activeView?.entryOpenMode ?? "side_panel"
                                    }
                                    isDragging={
                                      draggingSortId ===
                                      cardSortId(colKey, entry.id)
                                    }
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
                                    properties={properties}
                                    sortId={cardSortId(colKey, entry.id)}
                                    valueMap={valueMap}
                                    workspaceId={workspaceId}
                                    workspaceSlug={workspaceSlug}
                                  />
                                ))}

                                {col.entries.length === 0 && (
                                  <div className="flex h-16 items-center justify-center rounded-md border border-base-300 bg-base-200/20">
                                    <span className="text-xs text-base-content/70">
                                      Drop cards here
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Add entry button */}
                              {isEditor && (
                                <button
                                  className="mx-2 mb-2 mt-2 flex w-[calc(100%-1rem)] items-center justify-center gap-1.5 rounded-md border border-dashed border-base-300 px-3 py-2.5 text-xs font-semibold text-primary transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
                                  onClick={() => {
                                    const gv = col.id
                                      ? defaultValueForGroup(groupProp, col.id)
                                      : undefined;
                                    const dv = gv ? { [groupPropId!]: gv } : {};
                                    onCreateEntry(dv);
                                  }}
                                  type="button"
                                >
                                  <Plus size={13} />
                                  Add entry
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </ColumnDropTarget>
                    </SortableContext>
                  )}
                </SortableColumn>
              );
            })}

            {/* ── Add option column — select/status only; checkbox/person's columns
        are derived, not a user-managed option list to add to. ── */}
            {isEditor && groupsEditable && (
              <Popover className="w-65 shrink-0">
                <PopoverButton className="flex h-10 w-full items-center gap-2 rounded-lg border border-base-300 px-3 text-xs text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content data-open:border-primary/40 data-open:text-base-content">
                  <Plus size={13} />
                  Add option to &ldquo;{groupProp.name}&rdquo;
                </PopoverButton>
                <PopoverPanel
                  anchor={{ to: "bottom start", gap: 4 }}
                  className="z-600 w-65 rounded-lg border border-base-300 bg-base-200 p-3.5 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                  modal={false}
                  transition
                >
                  <AddOptionPanel
                    addingOption={addingOption}
                    addOptInputRef={addOptInputRef}
                    hideTooltip={hideTooltip}
                    newOptColor={newOptColor}
                    newOptName={newOptName}
                    onAdd={handleAddOption}
                    options={options}
                    previewColor={previewColor}
                    setNewOptColor={setNewOptColor}
                    setNewOptName={setNewOptName}
                    showTooltip={showTooltip}
                  />
                </PopoverPanel>
              </Popover>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {draggingEntry && (
            <CardShell
              activeView={activeView}
              cardProps={cardProps}
              databaseId={databaseId}
              dragging
              entry={draggingEntry}
              entryOpenMode={activeView?.entryOpenMode ?? "side_panel"}
              isEditor={false}
              onDeleteEntry={onDeleteEntry}
              onDeleteRequest={() => {}}
              onUpdateEntryIcon={onUpdateEntryIcon}
              onUpdateProperty={onUpdateProperty}
              onUpdateTitle={onUpdateTitle}
              onUpdateValue={onUpdateValue}
              onUpdateView={onUpdateView}
              properties={properties}
              sortId={draggingSortId ?? ""}
              valueMap={valueMap}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          )}
        </DragOverlay>
      </DndContext>

      {pinTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={pinTooltip.label} rect={pinTooltip.rect} />,
          document.body
        )}

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}

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

      {groupMenu &&
        (() => {
          // Looked up from `columns` (works for every groupable type's derived
          // label), not `options` (select/status only) — `options.find` here would
          // always miss for Checkbox/Person, whose groups never live in
          // `config.options`, silently swallowing the menu for them.
          const col = columns.find((c) => c.id === groupMenu.optionId);
          if (!col) {
            return null;
          }
          return (
            <GroupHeaderMenu
              editable={groupsEditable}
              getAnchorRect={() => groupMenu.triggerEl.getBoundingClientRect()}
              hideAggregation={hideAggregation}
              onClose={() => setGroupMenu(null)}
              onDeleteGroup={() =>
                setDeleteGroupTarget({ id: col.id!, name: col.label })
              }
              onEditGroups={() => setEditingGroupsAnchor(groupMenu.triggerEl)}
              onHideGroup={() =>
                onUpdateView({
                  boardSettings: {
                    ...boardSettings,
                    hiddenGroupOptionIds: [
                      ...hiddenGroupOptionIds,
                      groupMenu.optionId,
                    ],
                  },
                })
              }
              onToggleHideAggregation={() =>
                onUpdateView({
                  boardSettings: {
                    ...boardSettings,
                    hideAggregation: !hideAggregation,
                  },
                })
              }
            />
          );
        })()}

      {editingGroupsAnchor && (
        <GroupSettingsPanel
          boardSettings={boardSettings}
          getAnchorRect={() => editingGroupsAnchor.getBoundingClientRect()}
          groupProp={groupProp}
          onClose={() => setEditingGroupsAnchor(null)}
          onUpdateProperty={onUpdateProperty}
          onUpdateView={onUpdateView}
          properties={properties}
        />
      )}

      <ConfirmDialog
        confirmLabel="Delete"
        description={`"${deleteGroupTarget?.name ?? ""}" will be removed. Entries currently in it will show as unset. This cannot be undone.`}
        onConfirm={() => {
          if (deleteGroupTarget) {
            deleteGroupOption(deleteGroupTarget.id);
          }
          setDeleteGroupTarget(null);
        }}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteGroupTarget(null);
          }
        }}
        open={deleteGroupTarget !== null}
        title="Delete this group?"
      />
    </>
  );
}

// ── SortableColumn ───────────────────────────────────────────────────────────
// Uses a distinct "colhandle-" id prefix so column drag never collides with the "col-<key>"
// drop target; only the header (render prop) is the drag handle, not the whole column.

function SortableColumn({
  colKey,
  draggable,
  isDragging,
  isCollapsed,
  children,
}: {
  colKey: string;
  draggable: boolean;
  isDragging: boolean;
  isCollapsed: boolean;
  children: (handleProps: Record<string, unknown> | null) => React.ReactElement;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: "colhandle-" + colKey, disabled: !draggable });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const handleProps = draggable ? { ...attributes, ...listeners } : null;

  // Board columns now sit in a horizontally-scrolling flex row (not a
  // wrapping grid) so a workspace with many status options stays in one
  // row instead of pushing later columns onto a second row far below the
  // fold — flex items need an explicit width, unlike grid's `1fr` tracks.
  return (
    <div
      className={`shrink-0 ${isCollapsed ? "w-12" : "w-65"}`}
      ref={setNodeRef}
      style={style}
    >
      {children(handleProps)}
    </div>
  );
}

// ── ColumnDropTarget ──────────────────────────────────────────────────────────
// Uses a distinct id ("col-<key>") so it doesn't collide with SortableContext.id.

function ColumnDropTarget({
  colKey,
  isCollapsed,
  children,
}: {
  colKey: string;
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: "col-" + colKey });
  return (
    <div className={isCollapsed ? "w-12" : ""} ref={setNodeRef}>
      {children}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  activeView: SharedViewProps["activeView"];
  cardProps: SharedViewProps["properties"];
  databaseId: string;
  dragging?: boolean;
  entry: DbEntry;
  entryOpenMode?: "side_panel" | "full_page";
  isDragging?: boolean;
  isEditor: boolean;
  onDeleteEntry: SharedViewProps["onDeleteEntry"];
  onDeleteRequest: (entry: DbEntry) => void;
  onDuplicateEntry?: SharedViewProps["onDuplicateEntry"];
  onOpenEntry?: SharedViewProps["onOpenEntry"];
  onUpdateEntryIcon?: SharedViewProps["onUpdateEntryIcon"];
  onUpdateProperty: SharedViewProps["onUpdateProperty"];
  onUpdateTitle: SharedViewProps["onUpdateTitle"];
  onUpdateValue: SharedViewProps["onUpdateValue"];
  onUpdateView: SharedViewProps["onUpdateView"];
  /** The full, unrestricted property list — needed to look up Status even
   *  before "Show on card" is enabled, since at that point it isn't in
   *  `cardProps` yet. */
  properties: SharedViewProps["properties"];
  /** dnd-kit drag id — tagged with the rendering column (see cardSortId), NOT
   *  just `entry.id`, so a Person-grouped card shown in two columns at once
   *  registers as two distinct draggables instead of colliding. */
  sortId: string;
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}

function SortableCard(props: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.sortId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none", // required for PointerSensor to fire reliably
    userSelect: "none",
    cursor: "grab",
  };
  return (
    // The whole card is the drag handle. Interactive children stop propagation
    // on pointerDown so clicking buttons/links never accidentally starts a drag.
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CardShell {...props} />
    </div>
  );
}

function CardShell({
  entry,
  cardProps,
  properties,
  valueMap,
  databaseId,
  workspaceSlug,
  workspaceId,
  dragging,
  isEditor,
  onDeleteRequest,
  onDuplicateEntry,
  onUpdateTitle,
  onUpdateValue,
  onUpdateProperty,
  onUpdateEntryIcon,
  activeView,
  onUpdateView,
  onOpenEntry,
  entryOpenMode,
}: CardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<DOMRect | null>(null);
  const [commentCount, setCommentCount] = useState<number | null>(
    entry.commentCount ?? null
  );
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title ?? "");
  const [propEditor, setPropEditor] = useState<{
    prop: DbProperty;
    rect: DOMRect;
  } | null>(null);
  const [editPropPanel, setEditPropPanel] = useState<{
    propId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const { data: session } = useSession();

  // Vote-mode person: toggles the current viewer's own vote directly instead
  // of opening the full people picker — same rule as table-view.tsx's
  // activateCell, enforced independently server-side either way. Returns
  // true if it handled the click (caller should skip opening the picker).
  function handleVoteClick(prop: DbProperty, entryId: string): boolean {
    if (prop.type !== "person" || !prop.config?.voteMode) {
      return false;
    }
    if (!session?.user?.id) {
      return true;
    }
    onUpdateValue(
      entryId,
      prop.id,
      toggleSelfVote(
        valueMap.get(entryId)?.get(prop.id) as { userIds?: string[] } | null,
        session.user
      )
    );
    return true;
  }
  const cardRef = useRef<HTMLDivElement>(null);
  const filledProps = cardProps.filter((prop) =>
    hasDisplayValue(prop, valueMap.get(entry.id)?.get(prop.id) ?? null)
  );
  const emptyProps = editing
    ? cardProps.filter(
        (prop) =>
          !hasDisplayValue(prop, valueMap.get(entry.id)?.get(prop.id) ?? null)
      )
    : [];

  // entry.commentCount is batch-computed server-side, so no per-card fetch is needed; re-sync on
  // refetch, while `onCommentAdded` bumps it instantly in between.
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

  function commitTitle() {
    const trimmed = editTitle.trim();
    if (trimmed !== (entry.title ?? "")) {
      onUpdateTitle(entry.id, trimmed);
    }
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: card shell, not a control — its handlers are a right-click affordance plus hover tracking, neither of which is an activation. Right-click has no keyboard equivalent to add, and per AGENTS.md §24 the same actions are also on the card's visible "⋯" menu button, which is a native focusable button. Opening the card is likewise a separate focusable element inside. */}
      <div
        className={[
          "group rounded-md border bg-base-100 transition-colors duration-150",
          dragging ? "border-primary/40 opacity-50" : "border-base-300",
        ].join(" ")}
        onContextMenu={(e) => {
          if (!isEditor) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        ref={cardRef}
      >
        {entry.coverUrl && (
          <div
            className="h-20 w-full rounded-t-md bg-cover bg-center"
            style={{ backgroundImage: `url(${entry.coverUrl})` }}
          />
        )}

        <div className="p-3.5">
          {/* Title row */}
          <div className="flex items-start gap-2">
            {/* h-5 matches the title's own line height (text-sm leading-snug) so
           the grip and icon center against the title's first line instead of
           sitting at a manually-guessed offset from the row's top. */}
            <span className="flex h-5 shrink-0 items-center">
              {/* Grip icon — visual indicator only; the whole card is the drag handle */}
              <GripVertical
                className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-40 text-base-content/70"
                size={13}
              />
            </span>

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
                className="min-w-0 flex-1 overflow-hidden text-ellipsis bg-transparent text-sm font-semibold leading-snug text-base-content outline-none"
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
            ) : (
              <button
                className={`min-w-0 flex-1 truncate text-left text-sm font-semibold leading-snug text-base-content transition-colors duration-150 ${
                  entryOpenMode === "side_panel" && onOpenEntry
                    ? "hover:text-base-content/70"
                    : "cursor-default"
                }`}
                onClick={() =>
                  entryOpenMode === "side_panel" && onOpenEntry
                    ? onOpenEntry(entry)
                    : undefined
                }
                onPointerDown={(e) => e.stopPropagation()}
                style={{ cursor: "pointer" }}
                type="button"
              >
                {entry.title || (
                  <span className="font-normal text-base-content/70">
                    Untitled
                  </span>
                )}
              </button>
            )}

            {/* Action buttons — visible on hover. One shared bordered pill (not a
           separate gray circle per icon) matching the same hover-action box
           used by the comment thread's own action pill (comment-card.tsx) —
           icons only highlight individually via hover:bg-base-200, the box
           itself carries the visible border/background. */}
            <div
              className="flex shrink-0 items-center gap-px rounded-sm border border-base-300 bg-base-100 px-0.5 py-0.5 transition-opacity"
              style={{ opacity: hovered || editing ? 1 : 0 }}
            >
              {isEditor && !editing ? (
                <button
                  className="flex size-6 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                  onClick={(e) => {
                    e.stopPropagation();
                    // The icon swaps to the side-peek icon in the same spot the cursor is
                    // already resting on, so no fresh hover event will fire to update the
                    // tooltip — set it directly instead of clearing it to null.
                    showTooltip("Open full page", e);
                    setEditTitle(entry.title ?? "");
                    setEditing(true);
                  }}
                  onMouseEnter={(e) => showTooltip("Edit", e)}
                  onMouseLeave={hideTooltip}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ cursor: "pointer" }}
                  type="button"
                >
                  <Pencil size={12} />
                </button>
              ) : (
                <Link
                  className="flex size-6 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                  href={`/app/${workspaceSlug}/${entry.shortId}`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => showTooltip("Open full page", e)}
                  onMouseLeave={hideTooltip}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ cursor: "pointer" }}
                >
                  <PanelRight size={12} />
                </Link>
              )}
              {isEditor && (
                <button
                  className="flex size-6 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                  onClick={(e) => {
                    e.stopPropagation();
                    hideTooltip();
                    setMenuPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseEnter={(e) => showTooltip("More options", e)}
                  onMouseLeave={hideTooltip}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ cursor: "pointer" }}
                  type="button"
                >
                  <MoreHorizontal size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Non-empty properties + comment count — clickable (same value editor
          empty properties already open below) so a filled property's value,
          and for Status specifically its Display As/Wrap content, can be
          changed right from the card instead of only from Table's column
          header. */}
          {(filledProps.length > 0 || !!commentCount) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-base-300 pt-2">
              {filledProps.map((prop) => {
                const raw = valueMap.get(entry.id)?.get(prop.id) ?? null;
                return (
                  <button
                    className="min-w-0 shrink-0 rounded-xs text-left hover:bg-base-200"
                    key={prop.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (handleVoteClick(prop, entry.id)) {
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
                    <CellDisplay
                      compact
                      property={prop}
                      resolvedDisplayAs={resolveDisplayAs(prop, activeView)}
                      resolvedWrapContent={resolveWrapContent(prop, activeView)}
                      value={raw}
                      workspaceId={workspaceId}
                    />
                  </button>
                );
              })}
              {!!commentCount && (
                <button
                  className="inline-flex items-center gap-1 rounded-xs bg-base-200 px-1.5 py-0.5 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200/70"
                  // Exempt from CellCommentPopover's capture-phase outside-click close,
                  // which would otherwise close the popover just before the toggle
                  // below reopened it.
                  data-comment-exempt
                  onClick={(e) => {
                    e.stopPropagation();
                    // Toggle: a second click closes the popover this badge opened.
                    const rect = (
                      e.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    setCommentAnchor((cur) => (cur ? null : rect));
                  }}
                  onMouseEnter={(e) => showTooltip("View comments", e)}
                  onMouseLeave={hideTooltip}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  <MessageSquare size={11} />
                  {commentCount}
                </button>
              )}
            </div>
          )}

          {/* Quick-add empty properties — only while editing, matching Notion's inline card editor */}
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
                      if (handleVoteClick(prop, entry.id)) {
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
                    Add {prop.name}
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
          onEditProperty={
            propEditor.prop.config?.groupedByStatus
              ? (rect) => {
                  setEditPropPanel({
                    propId: propEditor.prop.id,
                    anchorRect: rect,
                  });
                  setPropEditor(null);
                }
              : undefined
          }
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

      {editPropPanel &&
        (() => {
          // Looked up from the full properties list, not `cardProps` — Status isn't
          // in `cardProps` yet the very first time this opens (before "Show on
          // card" gets auto-enabled below), so that restricted list can't be used
          // to find the property being edited.
          const panelProp = properties.find(
            (p) => p.id === editPropPanel.propId
          );
          if (!panelProp) {
            return null;
          }
          return (
            <EditPropertySidePanel
              // Deleting/duplicating a property is a bigger, cross-view action better
              // done from Table's column header (which already offers it) — this
              // card-level panel exists only to change Status's Display As/Wrap
              // content for this view, so both are disabled here.
              canDelete={false}
              getAnchorRect={() => {
                // Same convention as Calendar/Gallery: always hangs below the
                // toolbar's own "+New" button, not wherever the card happened to be
                // clicked from, so it opens in the same predictable spot every time.
                const btn = document
                  .querySelector("[data-new-entry-button]")
                  ?.getBoundingClientRect();
                if (!btn) {
                  return editPropPanel.anchorRect;
                }
                return new DOMRect(btn.right, btn.top, 0, btn.height);
              }}
              key={panelProp.id}
              onBack={() => setEditPropPanel(null)}
              onClose={() => setEditPropPanel(null)}
              onDeleteProperty={async () => {}}
              onDuplicateProperty={async () => {}}
              onUpdateProperty={(patch) =>
                onUpdateProperty(panelProp.id, patch)
              }
              properties={properties}
              property={panelProp}
              showCardToggle
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
    </>
  );
}
