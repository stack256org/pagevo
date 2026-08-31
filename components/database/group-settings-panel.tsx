"use client";

import {
  DndContext,
  type DragEndEvent,
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
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Pin,
  PinOff,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OptionSubmenu } from "@/components/database/option-submenu";
import {
  getOptionColor,
  PROPERTY_TYPE_ICON,
  STATUS_GROUPS,
} from "@/components/database/property-registry";
import type {
  DbProperty,
  SelectOption,
  StatusGroupKey,
} from "@/components/database/types";
import { PageIcon } from "@/components/pages/page-icon";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Switch } from "@/components/ui/switch";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

export type BoardSettings = {
  hiddenGroupOptionIds?: string[];
  hiddenStatusGroupKeys?: StatusGroupKey[];
  hideAggregation?: boolean;
  sortDirection?: "manual" | "asc" | "desc";
  hideEmptyGroups?: boolean;
  colorColumns?: boolean;
  /** Status-type properties only — "option" (today's default) shows one column
   *  per select option; "group" collapses columns into the 3 fixed super-groups
   *  (To-do / In progress / Complete), matching Notion's real Status property. */
  statusBy?: "group" | "option";
  /** Pinned groups additionally render as a compact chip strip on the board,
   *  alongside their normal column — a quick-reference row, matching Notion. */
  pinnedGroupOptionIds?: string[];
  pinnedStatusGroupKeys?: StatusGroupKey[];
};

interface GroupSettingsPanelProps {
  boardSettings: BoardSettings;
  getAnchorRect: () => DOMRect;
  groupProp: DbProperty;
  onClose: () => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdateView: (patch: Record<string, unknown>) => void;
  properties: DbProperty[];
}

const PANEL_WIDTH = 288;
const SORT_LABEL: Record<
  NonNullable<BoardSettings["sortDirection"]>,
  string
> = {
  manual: "Manual",
  asc: "Ascending",
  desc: "Descending",
};

export function GroupSettingsPanel({
  groupProp,
  properties,
  boardSettings,
  getAnchorRect,
  onUpdateView,
  onUpdateProperty,
  onClose,
}: GroupSettingsPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect>(getAnchorRect);
  const [view, setView] = useState<"main" | "groupBy">("main");
  const [groupBySearch, setGroupBySearch] = useState("");
  const [submenu, setSubmenu] = useState<{
    optionId: string;
    rect: DOMRect;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const config = groupProp.config ?? {};
  const options: SelectOption[] = config.options ?? [];
  const sortDirection = boardSettings.sortDirection ?? "manual";
  const hiddenIds = boardSettings.hiddenGroupOptionIds ?? [];
  const statusBy = boardSettings.statusBy ?? "option";
  const groupedByStatus = !!config.groupedByStatus;
  const hiddenGroupKeys = boardSettings.hiddenStatusGroupKeys ?? [];
  const pinnedIds = boardSettings.pinnedGroupOptionIds ?? [];
  const pinnedGroupKeys = boardSettings.pinnedStatusGroupKeys ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  // This panel's option editing UI only applies to Select/Status; Checkbox/Person
  // switch the board's group-by property via the toolbar's "Group" dropdown instead.
  const selectProps = properties.filter(
    (p) => (p.type === "select" || p.type === "status") && !p.isSystem
  );
  const filteredSelectProps = selectProps.filter((p) =>
    p.name.toLowerCase().includes(groupBySearch.trim().toLowerCase())
  );

  const orderedOptions =
    sortDirection === "manual"
      ? options
      : [...options].sort((a, b) =>
          sortDirection === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name)
        );

  useEffect(() => {
    function reposition() {
      setAnchorRect(getAnchorRect());
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [getAnchorRect]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
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

  function updateBoardSettings(patch: Partial<BoardSettings>) {
    onUpdateView({ boardSettings: { ...boardSettings, ...patch } });
  }

  function persistOptions(next: SelectOption[]) {
    onUpdateProperty(groupProp.id, { config: { ...config, options: next } });
  }

  function toggleHidden(optionId: string) {
    const next = hiddenIds.includes(optionId)
      ? hiddenIds.filter((id) => id !== optionId)
      : [...hiddenIds, optionId];
    updateBoardSettings({ hiddenGroupOptionIds: next });
  }

  function toggleHiddenGroupKey(key: StatusGroupKey) {
    const next = hiddenGroupKeys.includes(key)
      ? hiddenGroupKeys.filter((k) => k !== key)
      : [...hiddenGroupKeys, key];
    updateBoardSettings({ hiddenStatusGroupKeys: next });
  }

  function togglePinned(optionId: string) {
    const next = pinnedIds.includes(optionId)
      ? pinnedIds.filter((id) => id !== optionId)
      : [...pinnedIds, optionId];
    updateBoardSettings({ pinnedGroupOptionIds: next });
  }

  function togglePinnedGroupKey(key: StatusGroupKey) {
    const next = pinnedGroupKeys.includes(key)
      ? pinnedGroupKeys.filter((k) => k !== key)
      : [...pinnedGroupKeys, key];
    updateBoardSettings({ pinnedStatusGroupKeys: next });
  }

  const allHidden =
    statusBy === "group"
      ? STATUS_GROUPS.every((g) => hiddenGroupKeys.includes(g.key))
      : options.length > 0 && options.every((o) => hiddenIds.includes(o.id));

  function onDragStart({ active }: DragStartEvent) {
    setDraggingId(String(active.id));
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null);
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = options.findIndex((o) => o.id === active.id);
    const newIndex = options.findIndex((o) => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }
    persistOptions(arrayMove(options, oldIndex, newIndex));
  }

  const submenuOption = submenu
    ? (options.find((o) => o.id === submenu.optionId) ?? null)
    : null;

  // ── Position: anchored below (or above, if there's no room) the trigger ──
  const {
    setFloating,
    x: left,
    y: top,
  } = useAnchorPosition({
    anchorRect,
    placement: "bottom-start",
    gap: 4,
    constrainSize: true,
  });
  const mergedRef = useMergedRef(ref, setFloating);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div
        className="flex flex-col overflow-hidden rounded-md border border-base-300 bg-base-200"
        data-edit-property-exempt
        ref={mergedRef}
        style={{
          position: "fixed",
          top,
          left,
          width: PANEL_WIDTH,
          zIndex: 400,
        }}
      >
        {view === "groupBy" ? (
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-3 py-2">
            <button
              className="flex items-center gap-1.5 text-sm font-semibold text-base-content"
              onClick={() => {
                setView("main");
                setGroupBySearch("");
              }}
              type="button"
            >
              <ArrowLeft className="text-base-content/70" size={14} />
              Group by
            </button>
            <button
              className="flex size-5 shrink-0 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content"
              onClick={onClose}
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-3 py-2">
            <span className="text-sm font-semibold text-base-content">
              Group
            </span>
            <button
              className="flex size-5 shrink-0 items-center justify-center rounded-sm text-base-content/70 hover:bg-base-200 hover:text-base-content"
              onClick={onClose}
              type="button"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {view === "groupBy" ? (
          <Combobox
            onChange={(p: DbProperty | null) => {
              if (!p) {
                return;
              }
              onUpdateView({ groupByPropertyId: p.id });
              setView("main");
              setGroupBySearch("");
            }}
            value={null}
          >
            <div className="flex flex-col overflow-hidden">
              <div className="shrink-0 p-2">
                <div className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-200/30 px-2 py-1.5">
                  <Search className="shrink-0 text-base-content/70" size={13} />
                  <ComboboxInput
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/50"
                    onChange={(e) => setGroupBySearch(e.target.value)}
                    placeholder="Search for a property…"
                    value={groupBySearch}
                  />
                </div>
              </div>
              <ComboboxOptions
                className="flex flex-col gap-0.5 overflow-y-auto p-2 pt-0"
                static
              >
                {filteredSelectProps.map((p) => {
                  const TypeIcon =
                    PROPERTY_TYPE_ICON[
                      p.type as keyof typeof PROPERTY_TYPE_ICON
                    ];
                  const propConfig = (p.config ?? {}) as { icon?: string };
                  const isActive = p.id === groupProp.id;
                  return (
                    <ComboboxOption
                      className={({ focus }) =>
                        `flex w-full cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm ${focus ? "bg-base-200" : ""} ${isActive ? "font-medium text-base-content" : "text-base-content"}`
                      }
                      key={p.id}
                      value={p}
                    >
                      {propConfig.icon ? (
                        <PageIcon
                          className="shrink-0"
                          icon={propConfig.icon}
                          size={14}
                        />
                      ) : (
                        <TypeIcon
                          className="shrink-0 text-base-content/70"
                          size={14}
                        />
                      )}
                      <span className="flex-1 truncate text-left">
                        {p.name}
                      </span>
                      {isActive && (
                        <Check className="shrink-0 text-primary" size={13} />
                      )}
                    </ComboboxOption>
                  );
                })}
                {filteredSelectProps.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-base-content/70">
                    No matching properties
                  </p>
                )}
              </ComboboxOptions>
            </div>
          </Combobox>
        ) : (
          <div className="flex flex-col gap-2.5 overflow-y-auto p-3">
            {/* Group by */}
            <button
              className="flex w-full items-center justify-between rounded-sm px-0.5 py-1 text-sm text-base-content hover:bg-base-200"
              onClick={() => setView("groupBy")}
              type="button"
            >
              <span className="text-base-content/70">Group by</span>
              <span className="flex items-center gap-1 font-medium">
                {groupProp.name}
                <ChevronRight className="text-base-content/70" size={13} />
              </span>
            </button>

            {/* Status by — Status-style properties only */}
            {groupedByStatus && (
              <Listbox
                onChange={(mode: "group" | "option") =>
                  updateBoardSettings({ statusBy: mode })
                }
                value={statusBy}
              >
                {({ open }) => (
                  <div>
                    <ListboxButton className="flex w-full items-center justify-between rounded-sm px-0.5 py-1 text-sm text-base-content hover:bg-base-200">
                      <span className="text-base-content/70">Status by</span>
                      <span className="flex items-center gap-1 font-medium">
                        {statusBy === "group" ? "Group" : "Option"}
                        <ChevronRight
                          className={`text-base-content/70 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                          size={13}
                        />
                      </span>
                    </ListboxButton>
                    <ListboxOptions className="mt-1 flex flex-col gap-0.5 rounded-sm border border-base-300 bg-neutral p-1">
                      {[
                        { key: "group" as const, label: "Group" },
                        { key: "option" as const, label: "Option" },
                      ].map((mode) => (
                        <ListboxOption
                          className={({ focus }) =>
                            `flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-xs text-base-content ${focus ? "bg-base-200" : ""}`
                          }
                          key={mode.key}
                          value={mode.key}
                        >
                          <span className="flex-1 truncate text-left">
                            {mode.label}
                          </span>
                          {statusBy === mode.key && (
                            <Check
                              className="shrink-0 text-primary"
                              size={12}
                            />
                          )}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </div>
                )}
              </Listbox>
            )}

            {/* Sort */}
            <Listbox
              onChange={(dir: "manual" | "asc" | "desc") =>
                updateBoardSettings({ sortDirection: dir })
              }
              value={sortDirection}
            >
              {({ open }) => (
                <div>
                  <ListboxButton className="flex w-full items-center justify-between rounded-sm px-0.5 py-1 text-sm text-base-content hover:bg-base-200">
                    <span className="text-base-content/70">Sort</span>
                    <span className="flex items-center gap-1 font-medium">
                      {SORT_LABEL[sortDirection]}
                      <ChevronRight
                        className={`text-base-content/70 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                        size={13}
                      />
                    </span>
                  </ListboxButton>
                  <ListboxOptions className="mt-1 flex flex-col gap-0.5 rounded-sm border border-base-300 bg-neutral p-1">
                    {(["manual", "asc", "desc"] as const).map((dir) => (
                      <ListboxOption
                        className={({ focus }) =>
                          `flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-xs text-base-content ${focus ? "bg-base-200" : ""}`
                        }
                        key={dir}
                        value={dir}
                      >
                        <span className="flex-1 truncate text-left">
                          {SORT_LABEL[dir]}
                        </span>
                        {sortDirection === dir && (
                          <Check className="shrink-0 text-primary" size={12} />
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </div>
              )}
            </Listbox>

            {/* Hide empty groups */}
            <div className="flex items-center justify-between px-0.5 py-1">
              <span className="text-sm text-base-content">
                Hide empty groups
              </span>
              <Switch
                aria-label="Toggle hide empty groups"
                checked={!!boardSettings.hideEmptyGroups}
                onCheckedChange={(checked) =>
                  updateBoardSettings({ hideEmptyGroups: !!checked })
                }
              />
            </div>

            {/* Color columns */}
            <div className="flex items-center justify-between px-0.5 py-1">
              <span className="text-sm text-base-content">Color columns</span>
              <Switch
                aria-label="Toggle color columns"
                checked={boardSettings.colorColumns !== false}
                onCheckedChange={(checked) =>
                  updateBoardSettings({ colorColumns: !!checked })
                }
              />
            </div>

            {/* Groups list */}
            <div className="mt-1 border-t border-base-300 pt-2.5">
              <div className="mb-1 flex items-center justify-between px-0.5">
                <span className="text-2xs font-semibold uppercase tracking-wider text-base-content/50">
                  Groups
                </span>
                {(statusBy === "group" ? true : options.length > 0) && (
                  <button
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => {
                      if (statusBy === "group") {
                        updateBoardSettings({
                          hiddenStatusGroupKeys: allHidden
                            ? []
                            : STATUS_GROUPS.map((g) => g.key),
                        });
                      } else {
                        updateBoardSettings({
                          hiddenGroupOptionIds: allHidden
                            ? []
                            : options.map((o) => o.id),
                        });
                      }
                    }}
                    type="button"
                  >
                    {allHidden ? "Show all" : "Hide all"}
                  </button>
                )}
              </div>
              {statusBy === "group" ? (
                // Fixed 3 super-groups — order is not editable (matches Notion), only visibility.
                <div className="flex flex-col gap-0.5">
                  {STATUS_GROUPS.map((g) => {
                    const groupOpts = options.filter(
                      (o) => (o.group ?? "in_progress") === g.key
                    );
                    const color = getOptionColor(groupOpts[0]?.color);
                    const isHidden = hiddenGroupKeys.includes(g.key);
                    const isPinned = pinnedGroupKeys.includes(g.key);
                    return (
                      <div
                        className="group/opt flex items-center gap-1 rounded-sm px-1 py-1 hover:bg-base-200"
                        key={g.key}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center text-base-content/50">
                          <GripVertical size={12} />
                        </span>
                        <span
                          className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-xs px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: color.bg,
                            color: color.text,
                            opacity: isHidden ? 0.5 : 1,
                          }}
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color.dot }}
                          />
                          {g.label}
                        </span>
                        <button
                          className={`flex size-5 shrink-0 items-center justify-center rounded-xs hover:bg-base-200 hover:text-base-content ${isPinned ? "text-primary" : "text-base-content/70"}`}
                          onClick={() => togglePinnedGroupKey(g.key)}
                          onMouseEnter={(e) =>
                            showTooltip(
                              isPinned ? "Unpin group" : "Pin group",
                              e
                            )
                          }
                          onMouseLeave={hideTooltip}
                          type="button"
                        >
                          {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                          className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
                          onClick={() => toggleHiddenGroupKey(g.key)}
                          onMouseEnter={(e) =>
                            showTooltip(
                              isHidden ? "Show group" : "Hide group",
                              e
                            )
                          }
                          onMouseLeave={hideTooltip}
                          type="button"
                        >
                          {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <DndContext
                  onDragEnd={onDragEnd}
                  onDragStart={onDragStart}
                  sensors={sensors}
                >
                  <SortableContext
                    disabled={sortDirection !== "manual"}
                    items={orderedOptions.map((o) => o.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex flex-col gap-0.5">
                      {orderedOptions.map((opt) => (
                        <SortableGroupRow
                          draggable={sortDirection === "manual"}
                          isDragging={draggingId === opt.id}
                          isHidden={hiddenIds.includes(opt.id)}
                          isPinned={pinnedIds.includes(opt.id)}
                          key={opt.id}
                          onOpenSubmenu={(rect) =>
                            setSubmenu({ optionId: opt.id, rect })
                          }
                          onToggleHidden={() => toggleHidden(opt.id)}
                          onTogglePinned={() => togglePinned(opt.id)}
                          option={opt}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {/* Pinned "No status" row — not backed by a real option, so no rename/color/drag */}
              <div className="group/opt flex items-center gap-1 rounded-sm px-1 py-1 hover:bg-base-200">
                <span className="flex size-4 shrink-0 items-center justify-center text-base-content/50">
                  <GripVertical size={12} />
                </span>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-xs bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/70">
                  <span className="size-1.5 shrink-0 rounded-full bg-base-content/30" />
                  No {groupProp.name}
                </span>
              </div>
            </div>

            <p className="mt-1 px-0.5 text-xs text-base-content/50">
              Learn about grouping
            </p>
          </div>
        )}

        {submenu && submenuOption && (
          <OptionSubmenu
            anchorRect={submenu.rect}
            onClose={() => setSubmenu(null)}
            onDelete={() =>
              persistOptions(options.filter((o) => o.id !== submenuOption.id))
            }
            onRecolor={(c) =>
              persistOptions(
                options.map((o) =>
                  o.id === submenuOption.id ? { ...o, color: c } : o
                )
              )
            }
            onRename={(n) =>
              persistOptions(
                options.map((o) =>
                  o.id === submenuOption.id ? { ...o, name: n } : o
                )
              )
            }
            option={submenuOption}
          />
        )}
      </div>
      {tooltip && <IconTooltip label={tooltip.label} rect={tooltip.rect} />}
    </>,
    document.body
  );
}

function SortableGroupRow({
  option,
  draggable,
  isDragging,
  isHidden,
  isPinned,
  onOpenSubmenu,
  onToggleHidden,
  onTogglePinned,
}: {
  option: SelectOption;
  draggable: boolean;
  isDragging: boolean;
  isHidden: boolean;
  isPinned: boolean;
  onOpenSubmenu: (rect: DOMRect) => void;
  onToggleHidden: () => void;
  onTogglePinned: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: option.id, disabled: !draggable });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isHidden ? 0.5 : 1,
  };
  const color = getOptionColor(option.color);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  return (
    <>
      <div
        className="group/opt flex items-center gap-1 rounded-sm px-1 py-1 hover:bg-base-200"
        ref={setNodeRef}
        style={style}
      >
        <span
          {...(draggable ? attributes : {})}
          {...(draggable ? listeners : {})}
          className={`flex size-4 shrink-0 items-center justify-center text-base-content/50 ${draggable ? "cursor-grab opacity-0 group-hover/opt:opacity-100" : "opacity-20"}`}
          style={{ touchAction: draggable ? "none" : undefined }}
        >
          <GripVertical size={12} />
        </span>
        <button
          className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-xs px-2 py-0.5 text-left text-xs font-medium"
          onClick={(e) =>
            onOpenSubmenu(
              (e.currentTarget as HTMLElement).getBoundingClientRect()
            )
          }
          style={{ backgroundColor: color.bg, color: color.text }}
          type="button"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color.dot }}
          />
          <span className="truncate">{option.name}</span>
        </button>
        <button
          className={`flex size-5 shrink-0 items-center justify-center rounded-xs hover:bg-base-200 hover:text-base-content ${isPinned ? "text-primary" : "text-base-content/70"}`}
          onClick={onTogglePinned}
          onMouseEnter={(e) =>
            showTooltip(isPinned ? "Unpin group" : "Pin group", e)
          }
          onMouseLeave={hideTooltip}
          type="button"
        >
          {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
          onClick={onToggleHidden}
          onMouseEnter={(e) =>
            showTooltip(isHidden ? "Show group" : "Hide group", e)
          }
          onMouseLeave={hideTooltip}
          type="button"
        >
          {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
