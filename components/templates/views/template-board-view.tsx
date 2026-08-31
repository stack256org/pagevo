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
  FileText,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Pin,
  Plus,
  Settings2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  type OptionStyle,
  optionStyle,
} from "@/components/database/option-colors";
import {
  PROPERTY_TYPE_ICON,
  STATUS_GROUPS,
} from "@/components/database/property-registry";
import type {
  DbProperty,
  DbView,
  StatusGroupKey,
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
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";
import type { DatabaseProperty, DatabaseView } from "@/lib/db/schema";
import type { TemplateEntry } from "../template-page-client";

// ── Colors ────────────────────────────────────────────────────────────────────
// Sourced from components/database/option-colors.ts so the board, the gallery
// modal and anything added later cannot drift apart — and so each hue carries
// its dark-theme counterpart.

type ColStyle = OptionStyle;

function getStyle(color: string): ColStyle {
  return optionStyle(color);
}

function _optionCls(color: string) {
  return optionStyle(color).badge;
}

// Same rule board-view.tsx uses to decide whether a property has a
// display-worthy value — displayProps here is already select/multi_select only.
function hasDisplayValue(prop: DatabaseProperty, raw: unknown): boolean {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "select":
      return !!(v as { optionId?: string } | null)?.optionId;
    case "multi_select":
      return (
        ((v as { optionIds?: string[] } | null)?.optionIds ?? []).length > 0
      );
    default:
      return false;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PropOption = {
  id: string;
  name: string;
  color: string;
  group?: StatusGroupKey;
};
type PropConfig = { options?: PropOption[]; groupedByStatus?: boolean };
type SelectVal = { optionId?: string };

type Column = {
  optionId: string | null;
  label: string;
  color: string;
  entries: TemplateEntry[];
  /** Set only for status-super-group columns (statusBy: "group") — the real option a
   *  new/dropped card should actually be assigned, since a super-group isn't itself a
   *  selectable option value. */
  representativeOptionId?: string | null;
};

// ── Inline card create input ──────────────────────────────────────────────────

function InlineCardInput({
  onConfirm,
  onCancel,
}: {
  onConfirm: (title: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div className="rounded-sm border border-primary/50 bg-base-200 p-3">
      <textarea
        className="w-full resize-none bg-transparent text-sm font-medium text-base-content outline-none placeholder:text-base-content/50"
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onConfirm(val.trim());
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
        placeholder="Card title…"
        ref={ref}
        rows={2}
        value={val}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          className="rounded-sm bg-primary px-3 py-1 text-xs font-semibold text-primary-content hover:bg-primary/90 transition-colors"
          onClick={() => onConfirm(val.trim())}
          type="button"
        >
          Add card
        </button>
        <button
          className="rounded-sm px-2 py-1 text-xs text-base-content/70 hover:bg-base-200 transition-colors"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Column drop zone (enables dropping into empty columns) ────────────────────

function ColumnDropZone({
  colKey,
  children,
}: {
  colKey: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: "col-" + colKey });
  // overflow-x-hidden is required, not decorative: `overflow-y: auto` alone silently upgrades overflow-x from `visible` to `auto` too.
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-2"
      ref={setNodeRef}
    >
      {children}
    </div>
  );
}

// ── Sortable column ────────────────────────────────────────────────────────────
// Uses a distinct "colhandle-" id prefix (vs "col-<key>") and only the header as drag handle, so card drags aren't mistaken for column drags.

function SortableColumn({
  colKey,
  draggable,
  isDragging,
  maxHeight,
  children,
}: {
  colKey: string;
  draggable: boolean;
  isDragging: boolean;
  maxHeight: number | null;
  children: (handleProps: Record<string, unknown> | null) => React.ReactElement;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: "colhandle-" + colKey, disabled: !draggable });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    // Explicit pixel max-height (measured, not CSS `max-h-full`) so a column with few cards hugs its content and only scrolls once it grows past this.
    maxHeight: maxHeight ?? undefined,
  };
  const handleProps = draggable ? { ...attributes, ...listeners } : null;

  return (
    <div className="w-65 shrink-0" ref={setNodeRef} style={style}>
      {children(handleProps)}
    </div>
  );
}

// ── Sortable card ─────────────────────────────────────────────────────────────

interface CardShellProps {
  activeView: DatabaseView;
  databaseId: string;
  displayProps: DatabaseProperty[];
  dragging?: boolean;
  entry: TemplateEntry;
  entryValueMap: Map<string, Map<string, unknown>>;
  locked?: boolean;
  onClickEntry: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onDuplicateEntry: (id: string) => void;
  onSaveTitle: (id: string, title: string) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView: (patch: Record<string, unknown>) => Promise<void>;
  /** The full, unrestricted property list — needed to look up Status even
   *  before "Show on card" is enabled, since at that point it isn't in
   *  `displayProps` yet. */
  properties: DatabaseProperty[];
  workspaceId: string;
  workspaceSlug: string;
}

function CardShell({
  entry,
  displayProps,
  properties,
  entryValueMap,
  databaseId,
  workspaceSlug,
  workspaceId,
  onClickEntry,
  onDeleteRequest,
  onDuplicateEntry,
  onSaveTitle,
  onUpdatePropValue,
  onUpdateProperty,
  onUpdateEntryIcon,
  activeView,
  onUpdateView,
  dragging,
  locked,
}: CardShellProps) {
  const valMap = entryValueMap.get(entry.id) ?? new Map<string, unknown>();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<DOMRect | null>(null);
  const [commentCount, setCommentCount] = useState<number | null>(
    entry.commentCount ?? null
  );
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title ?? "");
  const [propEditor, setPropEditor] = useState<{
    prop: DatabaseProperty;
    rect: DOMRect;
  } | null>(null);
  const [editPropPanel, setEditPropPanel] = useState<{
    propId: string;
    anchorRect: DOMRect;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  // Vote-mode person: toggle the current viewer's own vote directly instead of
  // opening the people picker — returns true if handled (caller skips the picker).
  function handleVoteClick(prop: DatabaseProperty): boolean {
    if (
      prop.type !== "person" ||
      !(prop.config as { voteMode?: boolean } | null)?.voteMode
    ) {
      return false;
    }
    if (locked) {
      return true;
    }
    if (!session?.user?.id) {
      return true;
    }
    onUpdatePropValue(
      entry.id,
      prop.id,
      toggleSelfVote(
        valMap.get(prop.id) as { userIds?: string[] } | null,
        session.user
      )
    );
    return true;
  }

  // entry.commentCount is batch-computed server-side (open, page-level
  // threads only) — see components/database/board-view.tsx's CardShell for
  // the same change. `onCommentAdded` below still bumps this instantly
  // between fetches.
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
    if (locked) {
      return;
    }
    const trimmed = editTitle.trim();
    if (trimmed !== (entry.title ?? "")) {
      onSaveTitle(entry.id, trimmed);
    }
  }

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: renders a title <input> while editing, and interactive content can't nest inside a <button> */}
      <div
        className={[
          "group relative rounded-sm border bg-base-200 p-3 transition-all",
          dragging
            ? "border-primary/40 opacity-50"
            : "border-base-300 hover:border-base-300 hover:-translate-y-0.5",
        ].join(" ")}
        onClick={() => !dragging && !editing && onClickEntry(entry.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e) => {
          if (dragging || editing || (e.key !== "Enter" && e.key !== " ")) {
            return;
          }
          e.preventDefault();
          onClickEntry(entry.id);
        }}
        ref={cardRef}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-start gap-1.5">
          {/* h-5 matches the title's own line height (text-sm leading-snug) so the
        icon centers against the title's first line instead of sitting at a
        manually-guessed offset from the row's top. */}
          <span className="flex h-5 shrink-0 items-center">
            {entry.icon ? (
              <PageIcon className="shrink-0" icon={entry.icon} size={13} />
            ) : (
              <FileText className="shrink-0 text-base-content/70" size={12} />
            )}
          </span>
          {editing ? (
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent pr-5 text-sm font-medium leading-snug text-base-content outline-none"
              onBlur={commitTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                window.dispatchEvent(
                  new CustomEvent("pagevo:page-title-changed", {
                    detail: { pageId: entry.id, title: e.target.value },
                  })
                );
              }}
              onClick={(e) => e.stopPropagation()}
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
              placeholder="Untitled"
              value={editTitle}
            />
          ) : (
            <p className="min-w-0 flex-1 pr-5 text-sm font-medium leading-snug text-base-content">
              {entry.title || (
                <span className="text-base-content/70">Untitled</span>
              )}
            </p>
          )}
        </div>

        {/* Property badges + comment count — clickable (same value editor empty
       properties already open below) so a filled property's value, and for
       Status specifically its Display As/Wrap content, can be changed right
       from the card. */}
        {(displayProps.length > 0 || !!commentCount) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {displayProps
              .filter((dp) => hasDisplayValue(dp, valMap.get(dp.id) ?? null))
              .map((dp) => (
                <button
                  className="min-w-0 shrink-0 rounded-xs text-left hover:bg-base-200"
                  key={dp.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (locked) {
                      return;
                    }
                    if (handleVoteClick(dp)) {
                      return;
                    }
                    setPropEditor({
                      prop: dp,
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
                    property={dp as unknown as DbProperty}
                    resolvedDisplayAs={resolveDisplayAs(
                      dp as unknown as DbProperty,
                      activeView as unknown as DbView
                    )}
                    resolvedWrapContent={resolveWrapContent(
                      dp as unknown as DbProperty,
                      activeView as unknown as DbView
                    )}
                    value={valMap.get(dp.id) ?? null}
                    workspaceId={workspaceId}
                  />
                </button>
              ))}
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

        {/* Card actions — one shared bordered pill (not a separate circle per
       icon), matching the comment thread's own action pill (comment-card.tsx)
       and the real Board view's card actions (board-view.tsx). Icons only
       highlight individually via hover:bg-base-200; the box itself carries the
       visible border/background. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: event-isolation guard, not a control — the only handler is stopPropagation, so clicking one of the action buttons inside this pill does not also fire the enclosing card's open handler. There is no activation to key-handle; the buttons inside are native and keyboard-reachable on their own. */}
        <div
          className={`absolute right-2 top-2 items-center gap-px rounded-sm border border-base-300 bg-base-100 px-0.5 py-0.5 ${editing ? "flex" : "hidden group-hover:flex"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <button
              className="flex size-5 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                onClickEntry(entry.id);
              }}
              onMouseEnter={(e) => showTooltip("Open full page", e)}
              onMouseLeave={hideTooltip}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <PanelRight size={11} />
            </button>
          ) : (
            <button
              className="flex size-5 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                if (locked) {
                  return;
                }
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
              type="button"
            >
              <Pencil size={11} />
            </button>
          )}
          <button
            className="flex size-5 items-center justify-center rounded-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={(e) => {
              e.stopPropagation();
              hideTooltip();
              setMenuPos({ x: e.clientX, y: e.clientY });
            }}
            onMouseEnter={(e) => showTooltip("More options", e)}
            onMouseLeave={hideTooltip}
            onPointerDown={(e) => e.stopPropagation()}
            type="button"
          >
            <MoreHorizontal size={11} />
          </button>
        </div>

        {/* Quick-add empty properties — only while editing, matching Notion's inline card editor */}
        {editing &&
          displayProps.filter((dp) => !valMap.get(dp.id)).length > 0 && (
            <div className="mt-2 flex flex-col gap-0.5 border-t border-base-300 pt-2">
              {displayProps
                .filter((dp) => !valMap.get(dp.id))
                .map((dp) => {
                  const TypeIcon =
                    PROPERTY_TYPE_ICON[
                      dp.type as keyof typeof PROPERTY_TYPE_ICON
                    ];
                  const propConfig = (dp.config ?? {}) as { icon?: string };
                  return (
                    <button
                      className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
                      key={dp.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (locked) {
                          return;
                        }
                        if (handleVoteClick(dp)) {
                          return;
                        }
                        setPropEditor({
                          prop: dp,
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
                      {dp.type === "person" &&
                      (dp.config as { voteMode?: boolean } | null)?.voteMode
                        ? dp.name
                        : `Add ${dp.name}`}
                    </button>
                  );
                })}
            </div>
          )}
      </div>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}

      <EntryContextMenu
        activeView={activeView as unknown as DbView | null}
        databaseId={databaseId}
        entryIcon={entry.icon ?? null}
        entryId={entry.id}
        entryRect={cardRef.current?.getBoundingClientRect() ?? null}
        entryShortId={entry.shortId}
        forcePos={menuPos}
        onClose={() => setMenuPos(null)}
        onCommentAdded={() => setCommentCount((c) => (c ?? 0) + 1)}
        onDelete={() => {
          if (locked) {
            return;
          }
          onDeleteRequest(entry.id);
        }}
        onDuplicate={locked ? undefined : () => onDuplicateEntry(entry.id)}
        onIconChange={(icon) => {
          if (locked) {
            return;
          }
          onUpdateEntryIcon?.(entry.id, icon);
        }}
        onPropertyConfigChange={locked ? undefined : onUpdateProperty}
        onUpdateView={locked ? undefined : onUpdateView}
        onValueChange={
          locked
            ? undefined
            : (propId, value) => onUpdatePropValue(entry.id, propId, value)
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
            (propEditor.prop.config as { groupedByStatus?: boolean } | null)
              ?.groupedByStatus
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
            onUpdatePropValue(entry.id, propEditor.prop.id, v);
            setPropEditor(null);
          }}
          property={propEditor.prop as unknown as DbProperty}
          value={valMap.get(propEditor.prop.id) ?? null}
          workspaceId={workspaceId}
        />
      )}

      {editPropPanel &&
        (() => {
          // Looked up from the full properties list, not `displayProps` — Status
          // isn't in `displayProps` yet the very first time this opens (before
          // "Show on card" gets auto-enabled below), so that restricted list can't
          // be used to find the property being edited.
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
              onUpdateProperty={async (patch) =>
                onUpdateProperty(panelProp.id, patch)
              }
              properties={properties as unknown as DbProperty[]}
              property={panelProp as unknown as DbProperty}
              showCardToggle
              viewContext={{
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
              }}
              workspaceId={workspaceId}
            />
          );
        })()}
    </>
  );
}

function SortableCard(props: CardShellProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.entry.id, disabled: props.locked });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: "none",
    userSelect: "none",
    cursor: props.locked ? "default" : "grab",
  };
  const dragProps = props.locked ? {} : { ...attributes, ...listeners };
  return (
    <div ref={setNodeRef} style={style} {...dragProps} suppressHydrationWarning>
      <CardShell {...props} />
    </div>
  );
}

// ── Main board view ───────────────────────────────────────────────────────────

interface Props {
  activeView: DatabaseView;
  databaseId: string;
  entries: TemplateEntry[];
  entryValueMap: Map<string, Map<string, unknown>>;
  getEditPropertyAnchorRect: () => DOMRect;
  locked?: boolean;
  onAddEntry: (
    defaultValues?: Record<string, unknown>,
    title?: string
  ) => Promise<{ id: string; shortId: string } | undefined>;
  onAddProperty: (
    name: string,
    type: string,
    config?: Record<string, unknown>
  ) => void;
  onClickEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeleteProperty: (propId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onSaveTitle: (entryId: string, title: string) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView: (patch: Record<string, unknown>) => Promise<void>;
  properties: DatabaseProperty[];
  workspaceId: string;
  workspaceSlug: string;
}

export function TemplateBoardView({
  entries,
  properties,
  activeView,
  entryValueMap,
  databaseId,
  workspaceSlug,
  workspaceId,
  locked,
  onAddEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onClickEntry,
  onSaveTitle,
  onUpdatePropValue,
  onUpdateProperty,
  onUpdateEntryIcon,
  onUpdateView,
  getEditPropertyAnchorRect,
}: Props) {
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Map<string, string[]>>(
    new Map()
  );
  const [groupMenu, setGroupMenu] = useState<{
    optionId: string;
    triggerEl: HTMLElement;
  } | null>(null);
  const [editingGroups, setEditingGroups] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [draggingColKey, setDraggingColKey] = useState<string | null>(null);
  const {
    tooltip: pinTooltip,
    showTooltip: showPinTooltip,
    hideTooltip: hidePinTooltip,
  } = useHoverTooltip();

  // Measured in JS rather than CSS `max-h-full`: percentage heights need every ancestor to have a definite height, fragile through nested flex.
  const rowRef = useRef<HTMLDivElement>(null);
  const [colMaxHeight, setColMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const rowEl = rowRef.current;
    if (!rowEl) {
      return;
    }
    function measure() {
      // clientHeight includes the row's own padding, so subtract it — otherwise a tall column's last bit (e.g. "Add card") gets clipped.
      const cs = getComputedStyle(rowEl!);
      const verticalPadding =
        Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom);
      setColMaxHeight(rowEl!.clientHeight - verticalPadding);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rowEl);
    return () => ro.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const groupProp =
    properties.find((p) => p.id === activeView.groupByPropertyId) ??
    properties.find((p) => p.type === "select");
  const groupConfig = (groupProp?.config ?? {}) as PropConfig;
  const groupOptions = groupConfig.options ?? [];

  const boardSettings = (activeView.boardSettings ?? {}) as BoardSettings;
  const hiddenGroupOptionIds = boardSettings.hiddenGroupOptionIds ?? [];
  const hiddenStatusGroupKeys = boardSettings.hiddenStatusGroupKeys ?? [];
  const hideAggregation = !!boardSettings.hideAggregation;
  const sortDirection = boardSettings.sortDirection ?? "manual";
  const hideEmptyGroups = !!boardSettings.hideEmptyGroups;
  const colorColumns = boardSettings.colorColumns !== false;
  // "Group" mode is only meaningful for a real Status-type property (one whose options
  // are bucketed into the 3 fixed super-groups) — otherwise always fall back to "option".
  const statusBy = groupConfig.groupedByStatus
    ? (boardSettings.statusBy ?? "option")
    : "option";
  // Display-only sorted copy — the underlying option array (and its index-based drag
  // math in onDragEnd) is untouched, so switching back to Manual restores drag order.
  const displayGroupOptions =
    sortDirection === "manual"
      ? groupOptions
      : [...groupOptions].sort((a, b) =>
          sortDirection === "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name)
        );

  // A card shows only its title by default, except Status when "Show on card" is explicitly enabled. Same rule as Calendar/Gallery.
  const displayProps = properties.filter((p) => {
    const config = p.config as {
      groupedByStatus?: boolean;
      showOnCard?: boolean;
    } | null;
    return !!config?.groupedByStatus && !!config?.showOnCard;
  });

  // Bucket entries by group option
  const buckets = new Map<string | null, TemplateEntry[]>();
  buckets.set(null, []);
  for (const opt of groupOptions) {
    buckets.set(opt.id, []);
  }

  for (const entry of entries) {
    const valMap = entryValueMap.get(entry.id) ?? new Map<string, unknown>();
    const raw = groupProp ? valMap.get(groupProp.id) : undefined;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const sv = raw as SelectVal;
      if (sv.optionId && buckets.has(sv.optionId)) {
        buckets.get(sv.optionId)!.push(entry);
        continue;
      }
    }
    buckets.get(null)!.push(entry);
  }

  const rawColumns: Column[] =
    statusBy === "group"
      ? [
          ...STATUS_GROUPS.map((g) => {
            const groupOpts = groupOptions.filter(
              (o) => (o.group ?? "in_progress") === g.key
            );
            const groupEntries = groupOpts.flatMap(
              (o) => buckets.get(o.id) ?? []
            );
            return {
              optionId: g.key,
              label: g.label,
              color: groupOpts[0]?.color ?? "gray",
              entries: groupEntries,
              representativeOptionId: groupOpts[0]?.id ?? null,
            };
          }),
          {
            optionId: null,
            label: "No Status",
            color: "gray",
            entries: buckets.get(null)!,
          },
        ]
      : [
          ...displayGroupOptions.map((opt) => ({
            optionId: opt.id,
            label: opt.name,
            color: opt.color,
            entries: buckets.get(opt.id) ?? [],
          })),
          {
            optionId: null,
            label: groupProp ? "No Status" : "All Items",
            color: "gray",
            entries: buckets.get(null)!,
          },
        ].filter((col) => {
          if (col.optionId !== null) {
            return true;
          }
          return col.entries.length > 0 || groupOptions.length === 0;
        });

  // Apply local ordering overrides for within-column reorders
  const columns = rawColumns.map((col) => {
    const key = col.optionId ?? "none";
    const order = localOrder.get(key);
    if (!order) {
      return col;
    }
    const map = new Map(col.entries.map((e) => [e.id, e]));
    const sorted = order
      .map((id) => map.get(id))
      .filter(Boolean) as TemplateEntry[];
    const extra = col.entries.filter((e) => !order.includes(e.id));
    return { ...col, entries: [...sorted, ...extra] };
  });

  const visibleColumns = columns.filter((c) => {
    if (c.optionId === null) {
      return true;
    }
    if (statusBy === "group") {
      if (hiddenStatusGroupKeys.includes(c.optionId as StatusGroupKey)) {
        return false;
      }
    } else if (hiddenGroupOptionIds.includes(c.optionId)) {
      return false;
    }
    if (hideEmptyGroups && c.entries.length === 0 && addingTo !== c.optionId) {
      return false;
    }
    return true;
  });
  // The 3 status super-groups are in a fixed order (matches Notion) — never draggable.
  const draggableColumnKeys =
    statusBy === "option" && sortDirection === "manual" && !locked
      ? visibleColumns
          .filter((c) => c.optionId !== null)
          .map((c) => "colhandle-" + c.optionId)
      : [];

  // Pinned groups render as a compact chip strip in addition to their normal column —
  // a quick-reference row, independent of that column's hidden/visible state.
  const pinnedGroupIds =
    statusBy === "group"
      ? (boardSettings.pinnedStatusGroupKeys ?? [])
      : (boardSettings.pinnedGroupOptionIds ?? []);
  const pinnedColumns = columns.filter(
    (c) => c.optionId !== null && pinnedGroupIds.includes(c.optionId)
  );
  function unpinColumn(optionId: string) {
    if (statusBy === "group") {
      onUpdateView({
        boardSettings: {
          ...boardSettings,
          pinnedStatusGroupKeys: pinnedGroupIds.filter((k) => k !== optionId),
        },
      });
    } else {
      onUpdateView({
        boardSettings: {
          ...boardSettings,
          pinnedGroupOptionIds: pinnedGroupIds.filter((id) => id !== optionId),
        },
      });
    }
  }
  function scrollToColumn(colKey: string) {
    document.querySelector(`[data-col-id="${colKey}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }

  const draggingEntry = draggingId
    ? entries.find((e) => e.id === draggingId)
    : null;

  function onDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    if (id.startsWith("colhandle-")) {
      setDraggingColKey(id.slice("colhandle-".length));
      return;
    }
    setDraggingId(id);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (locked) {
      return;
    }
    const activeId = String(active.id);

    // Whole-column reordering — distinct id prefix so it never collides with card ids.
    if (activeId.startsWith("colhandle-")) {
      setDraggingColKey(null);
      if (!over) {
        return;
      }
      const overId = String(over.id);
      if (!overId.startsWith("colhandle-") || activeId === overId) {
        return;
      }
      const activeOptId = activeId.slice("colhandle-".length);
      const overOptId = overId.slice("colhandle-".length);
      const oldIdx = groupOptions.findIndex((o) => o.id === activeOptId);
      const newIdx = groupOptions.findIndex((o) => o.id === overOptId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) {
        return;
      }
      const nextOptions = arrayMove(groupOptions, oldIdx, newIdx);
      if (groupProp) {
        onUpdateProperty(groupProp.id, {
          config: { ...groupConfig, options: nextOptions },
        });
      }
      return;
    }

    setDraggingId(null);
    if (!over || active.id === over.id) {
      return;
    }

    const overId = String(over.id);

    const activeCol = columns.find((c) =>
      c.entries.some((e) => e.id === activeId)
    );
    if (!activeCol) {
      return;
    }
    const activeKey = activeCol.optionId ?? "none";

    const targetColByDroppable = columns.find(
      (c) => "col-" + (c.optionId ?? "none") === overId
    );
    const targetColByCard = columns.find((c) =>
      c.entries.some((e) => e.id === overId)
    );
    const targetCol = targetColByDroppable ?? targetColByCard;
    if (!targetCol) {
      return;
    }
    const targetKey = targetCol.optionId ?? "none";

    if (activeKey === targetKey) {
      // Within-column reorder — optimistic local state
      const currentOrder = activeCol.entries.map((e) => e.id);
      const oldIdx = currentOrder.indexOf(activeId);
      const newIdx = targetColByCard
        ? currentOrder.indexOf(overId)
        : currentOrder.length - 1;
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) {
        return;
      }
      setLocalOrder((prev) =>
        new Map(prev).set(activeKey, arrayMove(currentOrder, oldIdx, newIdx))
      );
    } else {
      // Cross-column move — persist new group value. A status-super-group column isn't
      // itself an option, so drops there resolve to that group's representative option.
      if (groupProp) {
        const nextOptionId =
          targetCol.representativeOptionId === undefined
            ? targetCol.optionId
            : targetCol.representativeOptionId;
        onUpdatePropValue(
          activeId,
          groupProp.id,
          nextOptionId ? { optionId: nextOptionId } : { optionId: null }
        );
      }
      setLocalOrder((prev) => {
        const next = new Map(prev);
        next.delete(activeKey);
        next.delete(targetKey);
        return next;
      });
    }
  }

  function deleteGroupOption(optionId: string) {
    if (!groupProp) {
      return;
    }
    const next = groupOptions.filter((o) => o.id !== optionId);
    onUpdateProperty(groupProp.id, {
      config: { ...groupConfig, options: next },
    });
  }

  async function handleAddCard(optionId: string | null, title: string) {
    const defaultValues: Record<string, unknown> = {};
    if (groupProp && optionId) {
      defaultValues[groupProp.id] = { optionId };
    }
    const created = await onAddEntry(
      Object.keys(defaultValues).length ? defaultValues : undefined,
      title.trim() || undefined
    );
    // Only close the inline input on success — on failure (already toasted by
    // onAddEntry) leave it open with whatever the user typed still in it,
    // instead of silently discarding both the input and their text.
    if (created) {
      setAddingTo(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Always rendered when there's a groupable property — independent of any
      column being visible, unlike the per-column "⋯" menu's own "Edit
      groups" entry. Without this, hiding every group (or the last one) left
      no way back in: GroupSettingsPanel — which already lists hidden groups
      with a toggle to restore them — was only ever reachable from a visible
      column's own menu. */}
      {groupProp && statusBy === "option" && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-base-300 px-6 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {pinnedColumns.length > 0 && (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-base-content/70">
                <Pin size={11} /> Pinned groups
              </span>
            )}
            {pinnedColumns.map((col) => {
              const style = getStyle(col.color);
              return (
                <div
                  className={`flex shrink-0 items-center gap-0.5 rounded-full border pl-1 pr-1 py-1 text-xs font-medium ${style.header}`}
                  key={col.optionId}
                >
                  <button
                    className="flex items-center gap-1.5 rounded-full px-1.5 transition-colors hover:opacity-70"
                    onClick={() => scrollToColumn(col.optionId ?? "none")}
                    onMouseEnter={(e) =>
                      showPinTooltip(`Jump to ${col.label}`, e)
                    }
                    onMouseLeave={hidePinTooltip}
                    type="button"
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${style.dot}`}
                    />
                    {col.label}
                    <span className="text-base-content/70">
                      {col.entries.length}
                    </span>
                  </button>
                  {!locked && (
                    <button
                      className="flex size-5 shrink-0 items-center justify-center rounded-full text-base-content/70 transition-colors hover:bg-base-200/60"
                      onClick={() => unpinColumn(col.optionId!)}
                      onMouseEnter={(e) => showPinTooltip("Unpin group", e)}
                      onMouseLeave={hidePinTooltip}
                      type="button"
                    >
                      <Pin className="shrink-0" size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!locked && (
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
              onClick={() => setEditingGroups(true)}
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
          )}
        </div>
      )}
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
        upgraded to `overflow-y: auto` too, turning this row into a SECOND
        vertical scroll container (scrolling headers and all) instead of
        each column scrolling independently via its own overflow-y-auto. */}
          <div
            className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto overflow-y-hidden p-6"
            ref={rowRef}
          >
            {visibleColumns.map((col) => {
              const style = colorColumns
                ? getStyle(col.color)
                : { ...getStyle("gray"), dot: getStyle(col.color).dot };
              const colKey = col.optionId ?? "none";
              const isAddingHere = addingTo === colKey;

              return (
                <SortableColumn
                  colKey={colKey}
                  draggable={
                    col.optionId !== null &&
                    statusBy === "option" &&
                    sortDirection === "manual" &&
                    !locked
                  }
                  isDragging={draggingColKey === col.optionId}
                  key={colKey}
                  maxHeight={colMaxHeight}
                >
                  {(handleProps) => (
                    <div
                      className="flex flex-col rounded-md border border-base-300 bg-base-200/10 overflow-hidden"
                      data-col-id={colKey}
                      style={{ maxHeight: colMaxHeight ?? undefined }}
                    >
                      {/* Column header — doubles as the drag handle for reordering the whole column */}
                      <div
                        {...handleProps}
                        className={`flex shrink-0 items-center justify-between border-b px-3 py-2.5 ${style.header} ${handleProps ? "cursor-grab" : ""}`}
                        style={{
                          touchAction: handleProps ? "none" : undefined,
                        }}
                        suppressHydrationWarning
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`size-2 shrink-0 rounded-full ${style.dot}`}
                          />
                          <span className="truncate text-sm font-semibold text-base-content">
                            {col.label}
                          </span>
                          {!hideAggregation && (
                            <span className="flex min-w-4.5 shrink-0 items-center justify-center rounded-full bg-base-200/80 px-1.5 py-0.5 text-xs font-semibold text-base-content/70">
                              {col.entries.length}
                            </span>
                          )}
                          {col.optionId !== null &&
                            pinnedGroupIds.includes(col.optionId) && (
                              <Pin
                                className="shrink-0 text-base-content/70"
                                size={12}
                              />
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* Status-super-group columns aren't a single real option, so the per-option
               "⋯" menu (hide/delete this option) doesn't apply — manage visibility for
               those via "Edit groups" instead. */}
                          {col.optionId !== null &&
                            statusBy === "option" &&
                            !locked && (
                              <button
                                className="flex size-6 items-center justify-center rounded text-base-content/70 hover:bg-base-200/60 hover:text-base-content transition-colors"
                                onClick={(e) =>
                                  setGroupMenu({
                                    optionId: col.optionId!,
                                    triggerEl: e.currentTarget as HTMLElement,
                                  })
                                }
                                onPointerDown={(e) => e.stopPropagation()}
                                type="button"
                              >
                                <MoreHorizontal size={13} />
                              </button>
                            )}
                          {!locked && (
                            <button
                              className="flex size-6 items-center justify-center rounded text-base-content/70 hover:bg-base-200/60 hover:text-base-content transition-colors"
                              onClick={() => setAddingTo(colKey)}
                              onPointerDown={(e) => e.stopPropagation()}
                              type="button"
                            >
                              <Plus size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cards */}
                      <SortableContext
                        id={colKey}
                        items={col.entries.map((e) => e.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <ColumnDropZone colKey={colKey}>
                          {col.entries.map((entry) => (
                            <SortableCard
                              activeView={activeView}
                              databaseId={databaseId}
                              displayProps={displayProps}
                              entry={entry}
                              entryValueMap={entryValueMap}
                              key={entry.id}
                              locked={locked}
                              onClickEntry={onClickEntry}
                              onDeleteRequest={setDeleteTarget}
                              onDuplicateEntry={onDuplicateEntry}
                              onSaveTitle={onSaveTitle}
                              onUpdateEntryIcon={onUpdateEntryIcon}
                              onUpdateProperty={onUpdateProperty}
                              onUpdatePropValue={onUpdatePropValue}
                              onUpdateView={onUpdateView}
                              properties={properties}
                              workspaceId={workspaceId}
                              workspaceSlug={workspaceSlug}
                            />
                          ))}

                          {/* Inline add card input */}
                          {isAddingHere && !locked && (
                            <InlineCardInput
                              onCancel={() => setAddingTo(null)}
                              onConfirm={(title) =>
                                handleAddCard(
                                  col.representativeOptionId === undefined
                                    ? col.optionId
                                    : col.representativeOptionId,
                                  title
                                )
                              }
                            />
                          )}

                          {col.entries.length === 0 && !isAddingHere && (
                            <p className="py-4 text-center text-xs text-base-content/70">
                              No items
                            </p>
                          )}
                        </ColumnDropZone>
                      </SortableContext>

                      {/* Add card button at bottom */}
                      {!isAddingHere && !locked && (
                        <button
                          className="mx-2 mb-2 flex shrink-0 items-center justify-center gap-1.5 rounded-sm border border-dashed border-base-300 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                          onClick={() => setAddingTo(colKey)}
                          type="button"
                        >
                          <Plus size={12} />
                          Add card
                        </button>
                      )}
                    </div>
                  )}
                </SortableColumn>
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay>
          {draggingEntry && (
            <CardShell
              activeView={activeView}
              databaseId={databaseId}
              displayProps={displayProps}
              dragging
              entry={draggingEntry}
              entryValueMap={entryValueMap}
              locked={locked}
              onClickEntry={() => {}}
              onDeleteRequest={() => {}}
              onDuplicateEntry={() => {}}
              onSaveTitle={() => {}}
              onUpdateEntryIcon={onUpdateEntryIcon}
              onUpdateProperty={onUpdateProperty}
              onUpdatePropValue={() => {}}
              onUpdateView={onUpdateView}
              properties={properties}
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

      <ConfirmDialog
        confirmLabel="Delete"
        description="This entry will be permanently deleted. This cannot be undone."
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteEntry(deleteTarget);
            setDeleteTarget(null);
          }
        }}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title="Delete entry?"
      />

      {groupMenu &&
        (() => {
          const opt = groupOptions.find((o) => o.id === groupMenu.optionId);
          if (!opt) {
            return null;
          }
          return (
            <GroupHeaderMenu
              getAnchorRect={() => groupMenu.triggerEl.getBoundingClientRect()}
              hideAggregation={hideAggregation}
              onClose={() => setGroupMenu(null)}
              onDeleteGroup={() =>
                setDeleteGroupTarget({ id: opt.id, name: opt.name })
              }
              onEditGroups={() => setEditingGroups(true)}
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

      {editingGroups && groupProp && (
        <GroupSettingsPanel
          boardSettings={boardSettings}
          getAnchorRect={getEditPropertyAnchorRect}
          groupProp={groupProp as unknown as DbProperty}
          onClose={() => setEditingGroups(false)}
          onUpdateProperty={onUpdateProperty}
          onUpdateView={onUpdateView}
          properties={properties as unknown as DbProperty[]}
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
    </div>
  );
}
