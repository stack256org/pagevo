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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import { CellEditorPopover } from "@/components/database/cells/cell-editor";
import { EntryContextMenu } from "@/components/database/entry-context-menu";
import { PROPERTY_TYPE_ICON } from "@/components/database/property-registry";
import type { DbProperty, DbView } from "@/components/database/types";
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

// Same rule board-view.tsx uses to decide whether a property has a
// display-worthy value — kept in sync so gallery cards and board cards
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
// checking sets just the first "complete"-group (or first) option, same
// single-value semantic a checkbox implies even for a multi-select field.
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
  onAddEntry: (defaultValues?: Record<string, unknown>) => void;
  onClickEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onDuplicateEntry: (entryId: string) => void;
  onSaveTitle: (entryId: string, title: string) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
  properties: DatabaseProperty[];
  workspaceId: string;
  workspaceSlug: string;
}

// ── Card ──────────────────────────────────────────────────────────────────────
// Mirrors board-view.tsx's CardShell (Edit/Open-full-page toggle, "…" menu,
// comments, inline quick-add for empty properties) so gallery cards behave
// identically to board cards, just with a cover area up top.

interface GalleryCardProps {
  activeView?: DatabaseView | null;
  databaseId: string;
  displayProps: DatabaseProperty[];
  dragging?: boolean;
  /** Grip icon wires to dnd-kit's activator, not the whole card — card content stops pointerdown propagation, so a whole-card drag zone wouldn't work. */
  dragHandleProps?: {
    ref: (el: HTMLElement | null) => void;
  } & Record<string, unknown>;
  entry: TemplateEntry;
  locked?: boolean;
  onClickEntry: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onDuplicateEntry: (id: string) => void;
  onSaveTitle: (id: string, title: string) => void;
  onUpdateEntryIcon?: (entryId: string, icon: string) => void;
  onUpdateProperty: (propId: string, patch: Record<string, unknown>) => void;
  onUpdatePropValue: (entryId: string, propId: string, value: unknown) => void;
  onUpdateView?: (patch: Record<string, unknown>) => Promise<void>;
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
  locked,
  onClickEntry,
  onDeleteRequest,
  onDuplicateEntry,
  onSaveTitle,
  onUpdatePropValue,
  onUpdateProperty,
  onUpdateEntryIcon,
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
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(entry.title ?? "");
  const [propEditor, setPropEditor] = useState<{
    prop: DatabaseProperty;
    rect: DOMRect;
  } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();

  const valMap = valueMap.get(entry.id) ?? new Map<string, unknown>();

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

  const filledProps = displayProps.filter((prop) =>
    hasDisplayValue(
      prop,
      valMap.get(prop.id) ?? null,
      resolveDisplayAs(
        prop as unknown as DbProperty,
        activeView as unknown as DbView | null | undefined
      )
    )
  );
  const emptyProps = editing
    ? displayProps.filter(
        (prop) =>
          !hasDisplayValue(
            prop,
            valMap.get(prop.id) ?? null,
            resolveDisplayAs(
              prop as unknown as DbProperty,
              activeView as unknown as DbView | null | undefined
            )
          )
      )
    : [];

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
    const trimmed = editTitle.trim();
    if (trimmed !== (entry.title ?? "")) {
      onSaveTitle(entry.id, trimmed);
    }
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: card shell, not a control — its handlers are a right-click affordance plus hover tracking, neither of which is an activation. Right-click has no keyboard equivalent to add, and per AGENTS.md §24 the same actions are also on the card's visible "⋯" menu button, which is a native focusable button. */}
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
          hideTooltip();
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

        {/* Action buttons — top-right, visible on hover */}
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1 transition-opacity"
          style={{ opacity: hovered || editing ? 1 : 0 }}
        >
          {editing ? (
            <button
              className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                onClickEntry(entry.id);
              }}
              onMouseEnter={(e) => showTooltip("Open full page", e)}
              onMouseLeave={hideTooltip}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <PanelRight size={13} />
            </button>
          ) : (
            <button
              className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={(e) => {
                e.stopPropagation();
                if (locked) {
                  return;
                }
                showTooltip("Open full page", e);
                setEditTitle(entry.title ?? "");
                setEditing(true);
              }}
              onMouseEnter={(e) => showTooltip("Edit", e)}
              onMouseLeave={hideTooltip}
              onPointerDown={(e) => e.stopPropagation()}
              type="button"
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            className="flex size-7 items-center justify-center rounded-sm bg-base-100 text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
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
            <MoreHorizontal size={13} />
          </button>
        </div>

        {/* Cover area */}
        <button
          className="relative block h-35 w-full shrink-0 overflow-hidden bg-primary/10"
          onClick={() => !dragging && !editing && onClickEntry(entry.id)}
          onPointerDown={(e) => e.stopPropagation()}
          type="button"
        >
          <div className="flex size-full items-center justify-center">
            <LayoutGrid className="text-base-content/70" size={28} />
          </div>
        </button>

        {/* Content */}
        <div className="flex flex-1 flex-col px-3.5 pt-3 pb-3.5">
          <div className="flex items-start gap-1.5">
            {/* h-5 matches the title's own line height (text-sm leading-snug)
                so the icon centers against the title's first line instead of
                sitting at a manually-guessed offset from the row's top. */}
            <span className="flex h-5 shrink-0 items-center">
              {entry.icon ? (
                <PageIcon className="shrink-0" icon={entry.icon} size={16} />
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
            ) : (
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => !dragging && onClickEntry(entry.id)}
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
            )}
          </div>

          {/* Always rendered (not just when there's a comment/filled property) —
              reserves the same vertical slot on every card, including an
              invisible placeholder for the comment badge below, so cards in
              the same row land on identical natural heights instead of some
              being visibly shorter with a dead gap at the bottom. */}
          <div className="mt-1.5 space-y-0.5">
            {filledProps.map((prop) => {
              const raw = valMap.get(prop.id) ?? null;
              const resolvedDisplayAs = resolveDisplayAs(
                prop as unknown as DbProperty,
                activeView as unknown as DbView | null | undefined
              );
              const resolvedWrapContent = resolveWrapContent(
                prop as unknown as DbProperty,
                activeView as unknown as DbView | null | undefined
              );
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
                        if (locked) {
                          return;
                        }
                        const next =
                          prop.type === "multi_select"
                            ? nextCheckboxMultiSelectValue(prop, raw)
                            : nextCheckboxSelectValue(prop, raw);
                        onUpdatePropValue(entry.id, prop.id, next);
                      }}
                      property={prop as unknown as DbProperty}
                      resolvedDisplayAs={resolvedDisplayAs}
                      resolvedWrapContent={resolvedWrapContent}
                      value={raw}
                      workspaceId={workspaceId}
                    />
                  </div>
                );
              }
              // Vote-mode renders its own "👍 N" badge — a clickable wrapper
              // that toggles the viewer's own vote, no "label: value" row.
              if (
                prop.type === "person" &&
                (prop.config as { voteMode?: boolean } | null)?.voteMode
              ) {
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
                      property={prop as unknown as DbProperty}
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
                      property={prop as unknown as DbProperty}
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
              // close, which would otherwise close the popover just before
              // the toggle below reopened it.
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
                      if (locked) {
                        return;
                      }
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
                    {prop.type === "person" &&
                    (prop.config as { voteMode?: boolean } | null)?.voteMode
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
          setHovered(false);
          onDeleteRequest(entry.id);
        }}
        onDuplicate={locked ? undefined : () => onDuplicateEntry(entry.id)}
        onIconChange={(icon) => {
          if (locked) {
            return;
          }
          onUpdateEntryIcon?.(entry.id, icon);
        }}
        onPropertyConfigChange={locked ? () => {} : onUpdateProperty}
        onUpdateView={onUpdateView}
        onValueChange={
          locked
            ? () => {}
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
    </>
  );
}

// ── Sortable wrapper ───────────────────────────────────────────────────────────

function SortableGalleryCard(props: GalleryCardProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.entry.id, disabled: props.locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div className="h-full" ref={setNodeRef} style={style}>
      <GalleryCard
        {...props}
        dragHandleProps={
          props.locked
            ? undefined
            : {
                ref: setActivatorNodeRef,
                ...attributes,
                ...listeners,
              }
        }
      />
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function TemplateGalleryView({
  entries,
  databaseId,
  properties,
  activeView,
  entryValueMap,
  workspaceSlug,
  workspaceId,
  locked,
  onAddEntry,
  onDeleteEntry,
  onDuplicateEntry,
  onClickEntry,
  onSaveTitle,
  onUpdateEntryIcon,
  onUpdatePropValue,
  onUpdateProperty,
  onUpdateView,
}: Props) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Matches Notion: a card shows only its title by default. The one
  // exception is Status, and only once the user explicitly turns on "Show on
  // card" from Status's own Edit Property panel — every other property stays
  // fully editable via the entry's popup but is never rendered on the card.
  const displayProps = properties.filter((p) => {
    const config = p.config as {
      groupedByStatus?: boolean;
      showOnCard?: boolean;
    } | null;
    return !!config?.groupedByStatus && !!config?.showOnCard;
  });

  // Reset order when entries change (add/delete)
  const _entryIdKey = entries.map((e) => e.id).join(",");
  useEffect(() => {
    setLocalOrder([]);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Derive display order
  const orderedEntries =
    localOrder.length > 0
      ? (localOrder
          .map((id) => entries.find((e) => e.id === id))
          .filter(Boolean) as TemplateEntry[])
      : entries;

  const draggingEntry = draggingId
    ? (entries.find((e) => e.id === draggingId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    if (locked) {
      return;
    }
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    if (locked) {
      return;
    }
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
        <div className="h-full overflow-auto p-4 pb-8">
          <SortableContext
            items={orderedEntries.map((e) => e.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {orderedEntries.map((entry) => (
                <SortableGalleryCard
                  activeView={activeView}
                  databaseId={databaseId}
                  displayProps={displayProps}
                  entry={entry}
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
                  valueMap={entryValueMap}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                />
              ))}

              {/* New page card — outside SortableContext items */}
              {!locked && (
                <button
                  className="flex h-full min-h-45 flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-base-300 text-base-content/70 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary/60"
                  onClick={() => onAddEntry()}
                  type="button"
                >
                  <Plus size={18} />
                  <span className="text-sm font-medium">New page</span>
                </button>
              )}
            </div>
          </SortableContext>
        </div>

        <DragOverlay>
          {draggingEntry && (
            <GalleryCard
              activeView={activeView}
              databaseId={databaseId}
              displayProps={displayProps}
              dragging
              entry={draggingEntry}
              locked={locked}
              onClickEntry={() => {}}
              onDeleteRequest={() => {}}
              onDuplicateEntry={() => {}}
              onSaveTitle={() => {}}
              onUpdateProperty={() => {}}
              onUpdatePropValue={() => {}}
              onUpdateView={onUpdateView}
              valueMap={entryValueMap}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          )}
        </DragOverlay>
      </DndContext>

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
    </>
  );
}
