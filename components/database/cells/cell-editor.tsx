"use client";

import {
  DndContext,
  type DragEndEvent,
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
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { createId } from "@paralleldrive/cuid2";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  File as FileIcon,
  GripVertical,
  Loader2,
  Maximize2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateValueEditor } from "@/components/database/date-value-editor";
import { OptionSubmenu } from "@/components/database/option-submenu";
import {
  getOptionColor,
  groupOptions,
  OPTION_COLORS,
} from "@/components/database/property-registry";
import type {
  DbProperty,
  DbPropertyConfig,
  FileItem,
  SelectOption,
  StatusGroupKey,
  WorkspaceMember,
} from "@/components/database/types";
import { ImageLightbox } from "@/components/editor/comment-card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useUpload } from "@/lib/storage/use-upload";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

interface CellEditorProps {
  cellRect: DOMRect;
  /** Hides the select/multi-select search-or-create input — used in the
   *  calendar entry context menu's cascading flyout, which just needs quick
   *  value toggling, not search/creation. */
  hideSearch?: boolean;
  onClose: () => void;
  onEditProperty?: (rect: DOMRect) => void;
  onPropertyConfigChange?: (propId: string, config: DbPropertyConfig) => void;
  onSave: (value: unknown) => void;
  property: DbProperty;
  value: unknown;
  workspaceId: string;
  /** Overrides the popover's stacking order — used when it's cascaded beside
   *  another already-open, higher-z-indexed menu (e.g. the calendar entry
   *  context menu's "Edit property" flyout) so it doesn't render behind it. */
  zIndex?: number;
}

export function CellEditorPopover(props: CellEditorProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return null;
  }
  return createPortal(<CellEditorInner {...props} />, document.body);
}

function CellEditorInner({
  property,
  value,
  cellRect,
  workspaceId,
  onSave,
  onClose,
  onPropertyConfigChange,
  onEditProperty,
  zIndex = 200,
  hideSearch,
}: CellEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Global "a cell popup is open somewhere" flag, read by CellActionOverlay to suppress its hover
  // icon regardless of which view mounted this popup. Ref-counted since cascading flyouts can nest.
  useEffect(() => {
    const el = document.body;
    const count = Number(el.dataset.cellPopupCount ?? "0") + 1;
    el.dataset.cellPopupCount = String(count);
    el.dataset.cellPopupOpen = "true";
    return () => {
      const next = Math.max(0, Number(el.dataset.cellPopupCount ?? "1") - 1);
      if (next === 0) {
        delete el.dataset.cellPopupOpen;
        delete el.dataset.cellPopupCount;
      } else {
        el.dataset.cellPopupCount = String(next);
      }
    };
  }, []);

  // `liveReposition` re-measures the popover's own rendered size (e.g. FileEditor's
  // collapsed-vs-expanded state, or a tab switch) and reflows position/flip accordingly —
  // replaces the old ResizeObserver + measuredHeight dance this used to hand-roll.
  const {
    setFloating,
    x: left,
    y: top,
  } = useAnchorPosition({
    anchorRect: cellRect,
    placement: "bottom-start",
    gap: 4,
    liveReposition: true,
  });
  const mergedRef = useMergedRef(ref, setFloating);
  // Clamp against the popover's own max width (below), not a smaller magic
  // number — anything narrower than that risks the box overflowing off the
  // right edge of the screen for cells near it, exactly the cut-off bug this
  // guards against.
  const POPOVER_MAX_W = 320;

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // OptionSubmenu (rename/delete/recolor) is its own separate createPortal
      // call, not a DOM descendant of this popover's own ref — without this
      // exemption, any click inside it (or any alertdialog it opens) reads as
      // "outside" and closes this whole popover out from under it.
      if (
        target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
      ) {
        return;
      }
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  // `cellRect` is a one-time snapshot of the trigger cell, which almost always
  // lives inside a scrollable table/board/panel — lock scroll while open so
  // this can't drift away from the cell it's editing.
  useScrollLockWhileOpen(
    true,
    (target) =>
      !!ref.current?.contains(target) ||
      !!target.closest?.("[data-edit-property-exempt]")
  );

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    top,
    left,
    maxHeight: 420,
    zIndex,
    // Files: fixed width so the Upload and Link tabs render at an identical
    // size instead of each shrink-wrapping to its own content (a short button
    // vs. a URL input made the popover visibly resize when switching tabs).
    width: property.type === "files" ? 230 : undefined,
    minWidth: property.type === "files" ? 230 : 240,
    maxWidth: POPOVER_MAX_W,
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200"
      data-edit-property-exempt
      ref={mergedRef}
      style={baseStyle}
    >
      {(property.type === "select" ||
        property.type === "status" ||
        property.type === "multi_select") && (
        <SelectEditor
          hideSearch={hideSearch}
          multi={property.type === "multi_select"}
          onClose={onClose}
          onConfigChange={
            onPropertyConfigChange
              ? (cfg) => onPropertyConfigChange(property.id, cfg)
              : undefined
          }
          onEditProperty={
            onEditProperty
              ? (rect) => {
                  onEditProperty(rect);
                  onClose();
                }
              : undefined
          }
          onSave={onSave}
          property={property}
          value={value}
        />
      )}
      {property.type === "date" && (
        <DateEditor
          onClose={onClose}
          onSave={onSave}
          property={property}
          value={value}
        />
      )}
      {property.type === "person" && (
        <PersonEditor onSave={onSave} value={value} workspaceId={workspaceId} />
      )}
      {property.type === "relation" && (
        <RelationEditor onSave={onSave} property={property} value={value} />
      )}
      {property.type === "files" && (
        <FileEditor
          onClose={onClose}
          onSave={onSave}
          value={value}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}

// ── Select / Multi-select ────────────────────────────────────────────────────

interface SelectEditorProps {
  hideSearch?: boolean;
  multi: boolean;
  onClose: () => void;
  onConfigChange?: (config: DbPropertyConfig) => void;
  onEditProperty?: (rect: DOMRect) => void;
  onSave: (value: unknown) => void;
  property: DbProperty;
  value: unknown;
}

function SelectEditor({
  property,
  value,
  multi,
  onSave,
  onClose,
  onConfigChange,
  onEditProperty,
  hideSearch,
}: SelectEditorProps) {
  const currentId = multi
    ? null
    : ((value as { optionId?: string } | null)?.optionId ?? null);
  const currentIds = multi
    ? ((value as { optionIds?: string[] } | null)?.optionIds ?? [])
    : [];
  const [options, setOptions] = useState<SelectOption[]>(
    (property.config?.options ?? []) as SelectOption[]
  );
  const [search, setSearch] = useState("");
  const [optionMenu, setOptionMenu] = useState<{
    opt: SelectOption;
    rect: DOMRect;
  } | null>(null);
  // Adding a new option via the group-header "+" (or the no-options "Add option"
  // button): same as edit-property-panel.tsx — swap the button for an inline
  // "Option name…" input instead of creating a blank "Option" immediately.
  const UNGROUPED = "__ungrouped_add__";
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newOptionName, setNewOptionName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  useEffect(() => {
    if (addingTo) {
      addInputRef.current?.focus();
    }
  }, [addingTo]);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );
  const canCreate =
    search.trim() &&
    !options.some((o) => o.name.toLowerCase() === search.trim().toLowerCase());

  function toggle(optId: string) {
    if (multi) {
      const next = currentIds.includes(optId)
        ? currentIds.filter((id) => id !== optId)
        : [...currentIds, optId];
      onSave({ optionIds: next });
    } else {
      onSave({ optionId: optId === currentId ? null : optId });
      onClose();
    }
  }

  function saveOptionsConfig(newOptions: SelectOption[]) {
    const newConfig = { ...property.config, options: newOptions };
    fetch(`/api/databases/${property.databaseId}/properties/${property.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: newConfig }),
    }).catch(() => {});
    onConfigChange?.(newConfig);
  }

  function createOption(group?: StatusGroupKey) {
    const name = search.trim();
    if (!name) {
      return;
    }
    const newOpt: SelectOption = { id: createId(), name, color: "gray", group };
    const newOptions = [...options, newOpt];
    setOptions(newOptions);
    saveOptionsConfig(newOptions);
    if (multi) {
      onSave({ optionIds: [...currentIds, newOpt.id] });
    } else {
      onSave({ optionId: newOpt.id });
      onClose();
    }
    setSearch("");
  }

  function commitNewOption() {
    const name = newOptionName.trim();
    if (name && addingTo) {
      const group =
        addingTo === UNGROUPED ? undefined : (addingTo as StatusGroupKey);
      const newOpt: SelectOption = {
        id: createId(),
        name,
        color: OPTION_COLORS[options.length % OPTION_COLORS.length].id,
        group,
      };
      const newOptions = [...options, newOpt];
      setOptions(newOptions);
      saveOptionsConfig(newOptions);
    }
    setAddingTo(null);
    setNewOptionName("");
  }

  function cancelNewOption() {
    setAddingTo(null);
    setNewOptionName("");
  }

  function recolorOption(optId: string, color: string) {
    const newOptions = options.map((o) =>
      o.id === optId ? { ...o, color } : o
    );
    setOptions(newOptions);
    saveOptionsConfig(newOptions);
  }

  function renameOption(optId: string, newName: string) {
    const newOptions = options.map((o) =>
      o.id === optId ? { ...o, name: newName } : o
    );
    setOptions(newOptions);
    saveOptionsConfig(newOptions);
  }

  function deleteOption(optId: string) {
    const newOptions = options.filter((o) => o.id !== optId);
    setOptions(newOptions);
    saveOptionsConfig(newOptions);
    // Clear it from this entry's own value too, if it was set — otherwise the
    // value would keep pointing at an option id that no longer exists.
    if (multi) {
      if (currentIds.includes(optId)) {
        onSave({ optionIds: currentIds.filter((id) => id !== optId) });
      }
    } else if (currentId === optId) {
      onSave({ optionId: null });
    }
  }

  // Reordering only makes real sense against the FULL option set — while
  // actively searching, the visible subset's positions don't map cleanly onto
  // it, so dragging is disabled until the search is cleared.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = options.findIndex((o) => o.id === active.id);
    const newIndex = options.findIndex((o) => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    const newOptions = arrayMove(options, oldIndex, newIndex);
    setOptions(newOptions);
    saveOptionsConfig(newOptions);
  }

  function renderOptionRow(opt: SelectOption) {
    const selected = multi ? currentIds.includes(opt.id) : currentId === opt.id;
    return (
      <SortableOptionRow
        draggable={!search.trim()}
        key={opt.id}
        onOpenMenu={(rect) => setOptionMenu({ opt, rect })}
        onToggle={() => toggle(opt.id)}
        option={opt}
        selected={selected}
      />
    );
  }

  const grouped = !!property.config?.groupedByStatus;
  const sections = groupOptions(filtered, grouped);

  const selectedOptions = multi
    ? (currentIds
        .map((id) => options.find((o) => o.id === id))
        .filter(Boolean) as SelectOption[])
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Selected chips + search, combined into one row like Notion's own
       popup — the chips are the current value (each with its own × to
       deselect), not just search UI, so they show even when hideSearch
       hides the actual filter/create input below them. */}
      {(!hideSearch || selectedOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 border-b border-base-300 px-3 py-2">
          {selectedOptions.map((opt) => {
            const color = getOptionColor(opt.color);
            return (
              <span
                className="inline-flex items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-medium"
                key={opt.id}
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {opt.name}
                <button
                  aria-label={`Remove ${opt.name}`}
                  className="opacity-70 hover:opacity-100"
                  onClick={() => toggle(opt.id)}
                  type="button"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
          {!hideSearch && (
            <input
              autoFocus
              className="min-w-15 flex-1 bg-transparent text-xs placeholder:text-base-content/50 focus:outline-none"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) {
                  createOption();
                }
                if (e.key === "Enter" && filtered.length === 1) {
                  toggle(filtered[0].id);
                  if (!multi) {
                    onClose();
                  }
                }
                if (
                  e.key === "Backspace" &&
                  !search &&
                  selectedOptions.length > 0
                ) {
                  toggle(selectedOptions[selectedOptions.length - 1].id);
                }
              }}
              placeholder={
                selectedOptions.length > 0 ? "" : "Search or create…"
              }
              value={search}
            />
          )}
        </div>
      )}

      {/* Options list — the ONLY part that scrolls/shrinks; "Edit property"
       below (Status only) stays outside this so it's never pushed past the
       popover's own height cap and clipped, no matter how many options
       there are. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {!hideSearch && !grouped && (
          <p className="px-2 pt-1 pb-0.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
            Select an option or create one
          </p>
        )}
        <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
          <SortableContext
            items={filtered.map((o) => o.id)}
            strategy={verticalListSortingStrategy}
          >
            {sections.map((section) => (
              <div className="mb-1 last:mb-0" key={section.key}>
                {section.label && (
                  <div className="mb-0.5 flex items-center justify-between px-2 pt-1">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
                      {section.label}
                    </span>
                    <button
                      className="flex size-4 items-center justify-center rounded-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
                      onClick={() => setAddingTo(section.key)}
                      onMouseEnter={(e) =>
                        showTooltip(`Add option to ${section.label}`, e)
                      }
                      onMouseLeave={hideTooltip}
                      type="button"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                )}
                {section.options.map(renderOptionRow)}
                {section.label && addingTo === section.key && (
                  <input
                    className="w-full rounded-sm border border-primary/40 bg-base-200 px-2 py-1 text-xs text-base-content outline-none"
                    onBlur={commitNewOption}
                    onChange={(e) => setNewOptionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        commitNewOption();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        cancelNewOption();
                      }
                    }}
                    placeholder="Option name…"
                    ref={addInputRef}
                    value={newOptionName}
                  />
                )}
              </div>
            ))}
          </SortableContext>
        </DndContext>

        {canCreate && (
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content/70 hover:bg-base-200"
            onClick={() => createOption()}
            type="button"
          >
            <Plus size={12} />
            Create{" "}
            <span className="font-medium text-base-content">"{search}"</span>
          </button>
        )}

        {/* A property with zero options and no search box (hideSearch, the
        Calendar/Gallery/Board quick-popup) had no way to ever create a first
        option — "No options" was a dead end. Offer a direct add button here
        too, not just next to grouped section headers. */}
        {!options.length &&
          !search.trim() &&
          (addingTo === UNGROUPED ? (
            <input
              className="w-full rounded-sm border border-primary/40 bg-base-200 px-2 py-1 text-xs text-base-content outline-none"
              onBlur={commitNewOption}
              onChange={(e) => setNewOptionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  commitNewOption();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelNewOption();
                }
              }}
              placeholder="Option name…"
              ref={addInputRef}
              value={newOptionName}
            />
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content/70 hover:bg-base-200"
              onClick={() => setAddingTo(UNGROUPED)}
              type="button"
            >
              <Plus size={12} />
              Add option
            </button>
          ))}

        {!!options.length && !filtered.length && !canCreate && (
          <p className="px-3 py-2 text-xs text-base-content/70">No options</p>
        )}
      </div>

      {onEditProperty && (
        <button
          className="flex shrink-0 items-center gap-2 border-t border-base-300 px-3 py-2 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
          onClick={(e) =>
            onEditProperty(
              (e.currentTarget as HTMLElement).getBoundingClientRect()
            )
          }
          type="button"
        >
          <Settings2 size={12} />
          Edit property
        </button>
      )}

      {optionMenu && (
        <OptionSubmenu
          anchorRect={optionMenu.rect}
          onClose={() => setOptionMenu(null)}
          onDelete={() => deleteOption(optionMenu.opt.id)}
          onRecolor={(color) => recolorOption(optionMenu.opt.id, color)}
          onRename={(name) => renameOption(optionMenu.opt.id, name)}
          option={optionMenu.opt}
        />
      )}

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}

// ── SortableOptionRow ────────────────────────────────────────────────────────
// Drag-reorder is only meaningful against the full, unfiltered option set, so
// `draggable` is false while search is active (see the comment above
// handleDragEnd) — in that case the drag handle/listeners are simply omitted.

function SortableOptionRow({
  option,
  selected,
  draggable,
  onToggle,
  onOpenMenu,
}: {
  option: SelectOption;
  selected: boolean;
  draggable: boolean;
  onToggle: () => void;
  onOpenMenu: (rect: DOMRect) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.id, disabled: !draggable });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const color = getOptionColor(option.color);

  return (
    <div
      className="group/opt flex items-center gap-1 rounded-sm px-1 py-1 hover:bg-base-200"
      ref={setNodeRef}
      style={style}
    >
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          className="flex size-4 shrink-0 cursor-grab items-center justify-center text-base-content/50 opacity-0 group-hover/opt:opacity-100"
          style={{ touchAction: "none" }}
        >
          <GripVertical size={12} />
        </span>
      )}
      <button
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xs px-1 py-0.5 text-left"
        onClick={onToggle}
        type="button"
      >
        <span
          className="inline-flex min-w-0 items-center gap-1 rounded-xs px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: color.bg, color: color.text }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color.dot }}
          />
          <span className="truncate">{option.name}</span>
        </span>
        {selected && (
          <Check className="ml-auto shrink-0 text-base-content" size={13} />
        )}
      </button>
      <button
        className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 opacity-0 hover:bg-base-200 group-hover/opt:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu((e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
        type="button"
      >
        <MoreHorizontal size={13} />
      </button>
    </div>
  );
}

// ── Date ─────────────────────────────────────────────────────────────────────

interface DateEditorProps {
  onClose: () => void;
  onSave: (value: unknown) => void;
  property: DbProperty;
  value: unknown;
}

function DateEditor({ value, onSave, onClose }: DateEditorProps) {
  return <DateValueEditor onClose={onClose} onSave={onSave} value={value} />;
}

// ── Person ───────────────────────────────────────────────────────────────────

interface PersonEditorProps {
  onSave: (value: unknown) => void;
  value: unknown;
  workspaceId: string;
}

function PersonEditor({ value, workspaceId, onSave }: PersonEditorProps) {
  const selectedIds = (value as { userIds?: string[] } | null)?.userIds ?? [];
  const cachedMembers =
    (
      value as {
        _members?: { id: string; name: string; email: string }[];
      } | null
    )?._members ?? [];
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/members`)
      .then((r) => r.json())
      .then((data: WorkspaceMember[]) =>
        setMembers(data.filter((m) => m.status === "active"))
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      (m.userName ?? "").toLowerCase().includes(q) ||
      (m.userEmail ?? "").toLowerCase().includes(q)
    );
  });

  // Combobox's `multiple` onChange gives the whole array, not a single toggled id —
  // rebuild the _members cache keeping existing entries + newly-selected ids.
  function commitSelection(next: string[]) {
    let nextMembers = cachedMembers.filter((m) => next.includes(m.id));
    for (const userId of next) {
      if (nextMembers.some((m) => m.id === userId)) {
        continue;
      }
      const found = members.find((m) => m.userId === userId);
      if (found) {
        nextMembers = [
          ...nextMembers,
          {
            id: userId,
            name: found.userName || found.userEmail || "Unknown member",
            email: found.userEmail ?? "",
          },
        ];
      }
    }
    onSave({ userIds: next, _members: nextMembers });
  }

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (!email || inviteSubmitting) {
      return;
    }
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "editor" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setInviteError(d?.error ?? "Couldn't send invite");
        return;
      }
      setInviteSuccess(true);
      setInviteEmail("");
    } finally {
      setInviteSubmitting(false);
    }
  }

  // Prefer the live member list (fresher name/email) — fall back to the value's
  // own cached snapshot for anyone not in that (already active-only) list, so a
  // selection made before a member's status changed doesn't just disappear.
  const selectedMembers = selectedIds.map((id) => {
    const m = members.find((mm) => mm.userId === id);
    if (m) {
      return {
        id,
        name: m.userName ?? m.userEmail ?? id,
        email: m.userEmail ?? "",
      };
    }
    return (
      cachedMembers.find((c) => c.id === id) ?? { id, name: id, email: "" }
    );
  });

  if (inviting) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 border-b border-base-300 px-2.5 py-2">
          <button
            className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 hover:bg-base-200"
            onClick={() => {
              setInviting(false);
              setInviteError(null);
              setInviteSuccess(false);
            }}
            type="button"
          >
            <ArrowLeft size={13} />
          </button>
          <span className="text-xs font-semibold text-base-content">
            Invite people
          </span>
        </div>
        <div className="flex flex-col gap-2 p-2.5">
          {inviteSuccess ? (
            <p className="text-xs text-primary">
              Invite sent — they’ll appear here once they join.
            </p>
          ) : (
            <>
              <input
                autoFocus
                className="w-full rounded-sm border border-base-300 bg-base-200 px-2 py-1.5 text-xs text-base-content focus:outline-none focus:border-primary/50"
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendInvite();
                  }
                }}
                placeholder="Email address"
                type="email"
                value={inviteEmail}
              />
              {inviteError && (
                <p className="text-[11px] text-error">{inviteError}</p>
              )}
              <button
                className="flex items-center justify-center gap-1.5 rounded-sm bg-primary py-1.5 text-xs font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-50"
                disabled={!inviteEmail.trim() || inviteSubmitting}
                onClick={sendInvite}
                type="button"
              >
                {inviteSubmitting ? (
                  <Loader2 className="animate-spin" size={12} />
                ) : (
                  "Send invite"
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <Combobox multiple onChange={commitSelection} value={selectedIds}>
        {selectedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-base-300 px-2.5 py-2">
            {selectedMembers.map((m) => (
              <span
                className="flex items-center gap-1 rounded-full bg-base-200 py-0.5 pl-1 pr-1.5 text-xs text-base-content"
                key={m.id}
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-content">
                  {(m.name || "?").slice(0, 1).toUpperCase()}
                </span>
                {m.name}
                <button
                  className="ml-0.5 text-base-content/70 hover:text-base-content"
                  onClick={() =>
                    commitSelection(selectedIds.filter((id) => id !== m.id))
                  }
                  type="button"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="border-b border-base-300 px-3 py-2">
          <ComboboxInput
            autoFocus
            className="w-full bg-transparent text-xs placeholder:text-base-content/50 focus:outline-none"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            value={search}
          />
        </div>
        <ComboboxOptions className="max-h-48 overflow-y-auto p-1" static>
          {loading && (
            <p className="px-3 py-2 text-xs text-base-content/70">Loading…</p>
          )}
          {!loading && filtered.length > 0 && (
            <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
              People
            </p>
          )}
          {!loading &&
            filtered.map((m) => {
              // `??` only falls through on null/undefined, not empty string — a genuinely
              // empty name/email was leaking through as blank initials and a blank row.
              const displayName = m.userName || m.userEmail || "Unknown member";
              const initials = displayName.slice(0, 1).toUpperCase();
              const showEmailLine = !!m.userName && !!m.userEmail;
              return (
                <ComboboxOption
                  className="flex w-full cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 outline-none data-focus:bg-base-200"
                  key={m.userId}
                  value={m.userId}
                >
                  {({ selected }) => (
                    <>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
                        {initials}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <p className="truncate text-xs font-medium text-base-content">
                          {displayName}
                        </p>
                        {showEmailLine && (
                          <p className="truncate text-xs text-base-content/70">
                            {m.userEmail}
                          </p>
                        )}
                      </span>
                      {selected && (
                        <Check className="shrink-0 text-primary" size={13} />
                      )}
                    </>
                  )}
                </ComboboxOption>
              );
            })}
          {!loading && search.trim() && !filtered.length && (
            <p className="px-3 py-2 text-xs text-base-content/70">
              No matches in “{search}”…
            </p>
          )}
          {!loading && !search.trim() && !filtered.length && (
            <p className="px-3 py-2 text-xs text-base-content/70">
              No members found
            </p>
          )}
        </ComboboxOptions>
      </Combobox>
      <div className="border-t border-base-300 p-1">
        <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          More
        </p>
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs text-base-content hover:bg-base-200"
          onClick={() => setInviting(true)}
          type="button"
        >
          <UserPlus className="shrink-0 text-base-content/70" size={13} />
          <span className="flex-1 text-left">Invite people</span>
          <ChevronRight className="shrink-0 text-base-content/70" size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Relation ─────────────────────────────────────────────────────────────────

interface RelationEditorProps {
  onSave: (value: unknown) => void;
  property: DbProperty;
  value: unknown;
}

function RelationEditor({ value, property, onSave }: RelationEditorProps) {
  const selectedIds = (value as { entryIds?: string[] } | null)?.entryIds ?? [];
  const relDbId = property.config?.relatedDatabaseId;
  const [entries, setEntries] = useState<
    { id: string; title: string | null }[]
  >([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!relDbId) {
      setLoading(false);
      return;
    }
    fetch(`/api/databases/${relDbId}/entries`)
      .then((r) => r.json())
      .then((data: { entries: { id: string; title: string | null }[] }) =>
        setEntries(data.entries ?? [])
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [relDbId]);

  const filtered = entries.filter((e) =>
    (e.title ?? "Untitled").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Combobox
      multiple
      onChange={(ids: string[]) => onSave({ entryIds: ids })}
      value={selectedIds}
    >
      <div className="border-b border-base-300 px-3 py-2">
        <ComboboxInput
          autoFocus
          className="w-full bg-transparent text-xs placeholder:text-base-content/50 focus:outline-none"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entries…"
          value={search}
        />
      </div>
      <ComboboxOptions className="max-h-48 overflow-y-auto p-1" static>
        {loading && (
          <p className="px-3 py-2 text-xs text-base-content/70">Loading…</p>
        )}
        {!relDbId && !loading && (
          <p className="px-3 py-2 text-xs text-base-content/70">
            No related database configured
          </p>
        )}
        {!loading &&
          relDbId &&
          filtered.map((entry) => (
            <ComboboxOption
              className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none data-focus:bg-base-200"
              key={entry.id}
              value={entry.id}
            >
              {({ selected }) => (
                <>
                  <span className="min-w-0 flex-1 truncate text-left text-xs text-base-content">
                    {entry.title || "Untitled"}
                  </span>
                  {selected && (
                    <Check className="shrink-0 text-primary" size={13} />
                  )}
                </>
              )}
            </ComboboxOption>
          ))}
        {!loading && relDbId && !filtered.length && (
          <p className="px-3 py-2 text-xs text-base-content/70">
            No entries found
          </p>
        )}
      </ComboboxOptions>
    </Combobox>
  );
}

// ── Files ────────────────────────────────────────────────────────────────────

interface FileEditorProps {
  /** Notion closes this popover the instant a file is added (upload or link)
   *  rather than leaving it open — the newly added file then shows as an
   *  inline thumbnail card wherever this property's value is displayed. */
  onClose?: () => void;
  onSave: (value: unknown) => void;
  value: unknown;
  workspaceId: string;
}

function FileEditor({ value, workspaceId, onSave, onClose }: FileEditorProps) {
  // Memoised on `value` so the `uploadFile` callback below stays stable across
  // renders — the `?? []` fallback would otherwise mint a new array each time.
  const files = useMemo(
    () => (value as { files?: FileItem[] } | null)?.files ?? [],
    [value]
  );
  const { upload, uploading, error } = useUpload({
    kind: "database_file",
    workspaceId,
  });
  const [linkUrl, setLinkUrl] = useState("");
  // Always opens on the compact "+ Add" row (never-had-a-file and just-deleted-last-file collapse
  // to the same empty appearance); Upload/Link tabs only appear once that row is clicked.
  const [showAddForm, setShowAddForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFile = useCallback(
    (item: FileItem) => {
      onSave({ files: [...files, item] });
      onClose?.();
    },
    [files, onSave, onClose]
  );

  function removeFile(id: string) {
    onSave({ files: files.filter((f) => f.id !== id) });
  }

  const uploadFile = useCallback(
    async (file: File) => {
      const result = await upload(file);
      if (!result) {
        return;
      }
      addFile({
        id: result.fileUploadId,
        url: result.fileUrl,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    },
    [upload, addFile]
  );

  function onChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    uploadFile(file);
  }

  function confirmLink() {
    const raw = linkUrl.trim();
    if (!raw) {
      return;
    }
    const url =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `https://${raw}`;
    addFile({
      id: createId(),
      url,
      name: raw.split("/").pop() || raw,
      mimeType: "",
      sizeBytes: 0,
    });
    setLinkUrl("");
  }

  // Global (document-level) rather than scoped to a specific input — there's
  // no dedicated "drop zone" element focused by default when this popover
  // opens, so Ctrl+V needs to work as soon as the popover is on screen at all.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const pasted = e.clipboardData?.files;
      if (!pasted?.length) {
        return;
      }
      const file = pasted[0];
      if (!file.type.startsWith("image/")) {
        return;
      }
      e.preventDefault();
      uploadFile(file);
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [uploadFile]);

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = files.findIndex((f) => f.id === active.id);
    const newIndex = files.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    onSave({ files: arrayMove(files, oldIndex, newIndex) });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {files.length > 0 && (
        <div
          className={`flex flex-col gap-2 p-2 ${showAddForm ? "border-b border-base-300" : ""}`}
        >
          <DndContext onDragEnd={handleDragEnd} sensors={dragSensors}>
            <SortableContext
              items={files.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              {files.map((f) => (
                <SortableFileRow
                  file={f}
                  key={f.id}
                  onDelete={() => removeFile(f.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
      {showAddForm ? (
        <>
          <div className="flex items-center gap-1.5 px-3 pt-2.5 text-xs font-medium text-base-content">
            <Paperclip className="text-base-content/70" size={12} />
            Add a file or image
          </div>
          <div className="p-3">
            <Tabs defaultValue="upload">
              <TabsList className="w-full" variant="line">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="link">Link</TabsTrigger>
              </TabsList>
              <TabsContent className="mt-3" value="upload">
                <Button
                  className="w-full"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    "Choose a file"
                  )}
                </Button>
                <p className="mt-2 text-center text-xs text-base-content/70">
                  or Ctrl+V to paste an image
                </p>
              </TabsContent>
              <TabsContent className="mt-3 space-y-2" value="link">
                <Input
                  autoFocus
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmLink();
                    }
                  }}
                  placeholder="Paste in https://…"
                  type="url"
                  value={linkUrl}
                />
                <Button
                  className="w-full"
                  disabled={!linkUrl.trim()}
                  onClick={confirmLink}
                  type="button"
                >
                  Link
                </Button>
              </TabsContent>
            </Tabs>
            {error && <p className="mt-2 text-xs text-error">{error}</p>}
            <input
              className="hidden"
              onChange={onChangeFile}
              ref={fileInputRef}
              type="file"
            />
          </div>
        </>
      ) : (
        <button
          className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-xs font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content"
          onClick={() => setShowAddForm(true)}
          type="button"
        >
          <Paperclip size={12} />
          Add a file or image
        </button>
      )}
    </div>
  );
}

// Drag-reorder wrapper around FileThumbnailCard, for the popup's file list —
// same pattern as SortableOptionRow above (grip handle, hover-revealed).
function SortableFileRow({
  file,
  onDelete,
}: {
  file: FileItem;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      className="group/filerow flex items-center gap-1"
      ref={setNodeRef}
      style={style}
    >
      <span
        {...attributes}
        {...listeners}
        className="flex size-4 shrink-0 cursor-grab items-center justify-center text-base-content/50 opacity-0 group-hover/filerow:opacity-100 active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <GripVertical size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <FileThumbnailCard file={file} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ── Shared file thumbnail card ──────────────────────────────────────────────
// Renders one FileItem as an image preview or name chip with a hover "…" menu; shared between
// FileEditor's popup and the entry panels so behavior stays consistent everywhere.
export interface FileThumbnailCardProps {
  file: FileItem;
  onDelete: () => void;
  onSelect?: () => void;
  selected?: boolean;
  size?: "sm" | "md";
}

export function FileThumbnailCard({
  file,
  onDelete,
  selected = false,
  onSelect,
  size = "sm",
}: FileThumbnailCardProps) {
  const [lightbox, setLightbox] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isImage = file.mimeType.startsWith("image/");

  return (
    <div
      className={`group/file relative overflow-hidden rounded-sm border bg-base-200/20 transition-colors duration-150 ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-base-300"
      } ${onSelect ? "cursor-pointer" : ""}`}
      data-file-menu
    >
      {/* Select action as a real stretched button. The file name / non-image
         body below is static so it still selects on click, while the image
         preview button and the options menu are positioned above it. */}
      {onSelect && (
        <button
          aria-label={`Select ${file.name}`}
          className="absolute inset-0"
          onClick={() => onSelect()}
          type="button"
        />
      )}
      {isImage ? (
        <button
          aria-label={`Preview ${file.name}`}
          className="relative z-10 block w-full cursor-zoom-in"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox(true);
          }}
          type="button"
        >
          {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
          <img
            alt={file.name}
            className={`block w-full object-cover ${size === "sm" ? "h-14" : "h-20"}`}
            src={file.url}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-2">
          <FileIcon className="shrink-0 text-base-content/70" size={14} />
          <span className="min-w-0 flex-1 truncate text-xs text-base-content">
            {file.name}
          </span>
        </div>
      )}
      {/* anchor + Headless UI Menu replaces the old getBoundingClientRect +
       createPortal + document-mousedown-listener combo — MenuItems' `anchor`
       prop auto-portals (escaping this popover's own overflow-hidden clip,
       same reason the old version portaled manually) and picks up
       Escape/outside-click for free. data-file-menu/data-edit-property-exempt
       move onto MenuItems itself so the two outside-click coordinators that
       used to check for them (this card's own onClick and
       CellEditorInner's/FilesPropertyValue's exemption checks) still treat
       clicks inside the now-portaled panel as "inside". */}
      <Menu>
        <MenuButton
          aria-label={`${file.name} options`}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-xs bg-base-200/90 text-base-content/70 opacity-0 transition-opacity hover:text-base-content group-hover/file:opacity-100 data-open:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={14} />
        </MenuButton>
        <MenuItems
          anchor={{ to: "bottom end", gap: 4 }}
          className="z-600 w-40 rounded-md border border-base-300 bg-neutral p-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
          data-edit-property-exempt
          data-file-menu
          modal={false}
          transition
        >
          {isImage && (
            <MenuItem>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-base-content data-focus:bg-base-200"
                onClick={() => setLightbox(true)}
                type="button"
              >
                <Maximize2 size={13} /> Full screen
              </button>
            </MenuItem>
          )}
          <MenuItem>
            <a
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-base-content data-focus:bg-base-200"
              download={file.name}
              href={file.url}
            >
              <Download size={13} /> Download
            </a>
          </MenuItem>
          <MenuItem>
            <a
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-base-content data-focus:bg-base-200"
              href={file.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink size={13} /> View original
            </a>
          </MenuItem>
          <MenuItem>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-error data-focus:bg-error/10"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              <Trash2 size={13} /> Delete
            </button>
          </MenuItem>
        </MenuItems>
      </Menu>
      {lightbox && (
        <ImageLightbox
          alt={file.name}
          onClose={() => setLightbox(false)}
          src={file.url}
        />
      )}
      <ConfirmDialog
        confirmLabel="Delete"
        description={
          <>
            <span className="font-semibold text-base-content">{file.name}</span>{" "}
            will be removed from this property. This action cannot be undone.
          </>
        }
        onConfirm={() => {
          onDelete();
          setConfirmDelete(false);
        }}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        title="Delete this file?"
      />
    </div>
  );
}

// ── Inline files property value (entry panels) ──────────────────────────────
// Once a files property has at least one file, panels render this stack of thumbnail cards plus
// a trailing "+ Add" row instead of the generic CellDisplay button, matching Notion's layout.
export interface FilesPropertyValueProps {
  files: FileItem[];
  isEditor: boolean;
  onAddClick: (e: React.MouseEvent) => void;
  onChange: (value: unknown) => void;
}

export function FilesPropertyValue({
  files,
  isEditor,
  onChange,
  onAddClick,
}: FilesPropertyValueProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-file-menu]")) {
        setSelectedId(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedId]);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {files.map((f) => (
        <FileThumbnailCard
          file={f}
          key={f.id}
          onDelete={() =>
            onChange({ files: files.filter((x) => x.id !== f.id) })
          }
          onSelect={() => setSelectedId((cur) => (cur === f.id ? null : f.id))}
          selected={selectedId === f.id}
          size="md"
        />
      ))}
      {isEditor && (
        <button
          className="flex items-center gap-1 self-start rounded-xs px-1 py-0.5 text-xs font-medium text-base-content/70 hover:bg-base-200 hover:text-base-content"
          onClick={onAddClick}
          type="button"
        >
          <Plus size={12} /> Add a file or image
        </button>
      )}
    </div>
  );
}
