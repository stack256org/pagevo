"use client";

import {
  ArrowLeft,
  ExternalLink as ArrowSquareOut,
  FileText,
  Loader2,
  Pencil as PencilSimple,
  Plus,
  Type as TextT,
  Trash2 as Trash,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CellDisplay } from "@/components/database/cells/cell-display";
import {
  CellEditorPopover,
  FilesPropertyValue,
} from "@/components/database/cells/cell-editor";
import { PROPERTY_TYPE_ICON } from "@/components/database/property-registry";
import type {
  DbEntry,
  DbProperty,
  FileItem,
} from "@/components/database/types";
import { PageEditor } from "@/components/editor/editor";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";

const POPUP_TYPES = new Set([
  "select",
  "status",
  "multi_select",
  "date",
  "person",
  "relation",
  "files",
]);
const TEXT_TYPES = new Set(["text", "number", "url", "email", "phone"]);

interface EntrySidePanelProps {
  entry: DbEntry;
  isEditor: boolean;
  // Optional: lets the empty-properties state offer a real "Add a property" CTA (Hard Rule 28)
  // via the parent's existing addProperty mutation, instead of this panel owning its own flow.
  onAddProperty?: (
    name: string,
    type: string
  ) => Promise<DbProperty | undefined>;
  onClose: () => void;
  onDeleteEntry: (entryId: string) => Promise<void>;
  onUpdateTitle: (entryId: string, title: string) => Promise<void>;
  onUpdateValue: (
    entryId: string,
    propId: string,
    value: unknown
  ) => Promise<void>;
  properties: DbProperty[];
  valueMap: Map<string, Map<string, unknown>>;
  workspaceId: string;
  workspaceSlug: string;
}

export function EntrySidePanel({
  entry,
  properties,
  valueMap,
  workspaceSlug,
  workspaceId,
  isEditor,
  onClose,
  onUpdateTitle,
  onUpdateValue,
  onDeleteEntry,
  onAddProperty,
}: EntrySidePanelProps) {
  const { data: session } = useSession();
  const [title, setTitle] = useState(entry.title ?? "");
  const [editPop, setEditPop] = useState<{
    propId: string;
    rect: DOMRect;
  } | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{
    propId: string;
    value: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  useEffect(() => {
    setTitle(entry.title ?? "");
  }, [entry.title]);

  const visibleProps = properties.filter((p) => !p.isSystem);
  const entryValues = valueMap.get(entry.id) ?? new Map();
  function getVal(propId: string) {
    return entryValues.get(propId) ?? null;
  }

  function handleCellClick(prop: DbProperty, e: React.SyntheticEvent) {
    if (!isEditor) {
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (prop.type === "checkbox") {
      const cur = getVal(prop.id) as { checked?: boolean } | null;
      onUpdateValue(entry.id, prop.id, { checked: !(cur?.checked ?? false) });
      return;
    }
    // Vote-mode person: toggle the viewer's own vote directly, never the picker.
    if (prop.type === "person" && prop.config?.voteMode) {
      if (!session?.user?.id) {
        return;
      }
      onUpdateValue(
        entry.id,
        prop.id,
        toggleSelfVote(
          getVal(prop.id) as { userIds?: string[] } | null,
          session.user
        )
      );
      return;
    }
    if (POPUP_TYPES.has(prop.type)) {
      setEditPop({ propId: prop.id, rect });
      return;
    }
    if (TEXT_TYPES.has(prop.type)) {
      const rawVal = getVal(prop.id) as Record<string, unknown> | null;
      const strVal = String(rawVal?.[prop.type as keyof typeof rawVal] ?? "");
      setInlineEdit({ propId: prop.id, value: strVal });
    }
  }

  function commitInline() {
    if (!inlineEdit) {
      return;
    }
    const prop = visibleProps.find((p) => p.id === inlineEdit.propId);
    if (!prop) {
      setInlineEdit(null);
      return;
    }
    onUpdateValue(entry.id, prop.id, { [prop.type]: inlineEdit.value });
    setInlineEdit(null);
  }

  return (
    <>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        open
      >
        <SheetContent
          className="overflow-hidden bg-base-100 data-[side=right]:w-full data-[side=right]:sm:max-w-115 data-[side=right]:sm:w-115"
          showCloseButton={false}
          side="right"
        >
          {/* ── Top nav bar ─────────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-3 py-2.5">
            <button
              className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
              onClick={onClose}
              type="button"
            >
              <ArrowLeft size={13} />
              Back
            </button>

            <div className="flex items-center gap-1">
              {isEditor && (
                <button
                  className="flex size-8 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                  onClick={() => setConfirmDelete(true)}
                  onMouseEnter={(e) => showTooltip("Delete entry", e)}
                  onMouseLeave={hideTooltip}
                  type="button"
                >
                  <Trash size={14} />
                </button>
              )}
              <button
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
                onClick={onClose}
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* ── Hero ────────────────────────────────────────────────────────── */}
          <div className="relative shrink-0 overflow-hidden bg-base-200/30">
            <div className="relative px-5 pt-5 pb-4">
              {/* Icon */}
              <div className="mb-4">
                {entry.icon ? (
                  <span className="inline-block rounded-lg bg-base-100 p-2 leading-none">
                    <PageIcon icon={entry.icon} size={36} />
                  </span>
                ) : (
                  <div className="inline-flex size-12 items-center justify-center rounded-lg border border-base-300 bg-base-100">
                    <FileText className="text-base-content/70" size={20} />
                  </div>
                )}
              </div>

              {/* Title */}
              {isEditor ? (
                <div className="group/title relative">
                  <input
                    className="w-full bg-transparent text-3xl font-bold leading-tight tracking-tight text-base-content placeholder:text-base-content/20 focus:outline-none"
                    onBlur={() => {
                      if (title !== entry.title) {
                        onUpdateTitle(entry.id, title);
                      }
                    }}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      window.dispatchEvent(
                        new CustomEvent("pagevo:page-title-changed", {
                          detail: { pageId: entry.id, title: e.target.value },
                        })
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.currentTarget.blur();
                      }
                      if (e.key === "Escape") {
                        setTitle(entry.title ?? "");
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Untitled"
                    value={title}
                  />
                  <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100">
                    <PencilSimple className="text-base-content/70" size={11} />
                    <span className="text-xs text-base-content/70">
                      Editing title — press Enter to save
                    </span>
                  </div>
                </div>
              ) : (
                <h2 className="text-3xl font-bold leading-tight tracking-tight text-base-content">
                  {entry.title || (
                    <span className="text-base-content/70">Untitled</span>
                  )}
                </h2>
              )}
            </div>
          </div>

          {/* ── Properties ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto">
            {visibleProps.length > 0 ? (
              <div className="px-4 py-4">
                {/* Section label */}
                <div className="mb-2">
                  <span className="text-xs font-semibold tracking-wide text-base-content/70 px-5 pt-4 pb-2 block">
                    Properties
                  </span>
                </div>

                {/* Property rows */}
                <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100 dark:bg-base-100/4">
                  {visibleProps.map((prop, idx) => {
                    const Icon =
                      PROPERTY_TYPE_ICON[
                        prop.type as keyof typeof PROPERTY_TYPE_ICON
                      ] ?? TextT;
                    const raw = getVal(prop.id);
                    const isInlineEditing = inlineEdit?.propId === prop.id;
                    const hasValue = raw != null;
                    const hasFiles =
                      prop.type === "files" &&
                      !!(raw as { files?: FileItem[] } | null)?.files?.length;
                    const isLast = idx === visibleProps.length - 1;

                    return (
                      <div
                        className={[
                          "group/prop flex min-h-9 items-center transition-colors duration-150 hover:bg-base-200/50",
                          isLast ? "" : "border-b border-base-300",
                        ].join(" ")}
                        key={prop.id}
                      >
                        {/* Property label */}
                        <div className="flex w-35 shrink-0 items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-base-content/70">
                          <div className="flex size-5.5 shrink-0 items-center justify-center rounded-xs bg-base-200/60 text-base-content/70">
                            {prop.config?.icon ? (
                              <PageIcon icon={prop.config.icon} size={11} />
                            ) : (
                              <Icon size={11} />
                            )}
                          </div>
                          <span className="truncate">{prop.name}</span>
                        </div>

                        {/* Separator */}
                        <div className="h-full w-px bg-base-300 self-stretch" />

                        {/* Value */}
                        {/* biome-ignore lint/a11y/useSemanticElements: renders an <input> for inline editing, and interactive content can't nest inside a <button> */}
                        <div
                          className={[
                            "flex min-h-9 flex-1 items-center px-3.5 py-2.5 text-sm transition-colors duration-150",
                            hasFiles ? "" : "cursor-pointer",
                            isEditor && !hasFiles ? "hover:bg-base-200" : "",
                            isEditor ? "" : "cursor-default",
                            isInlineEditing
                              ? "bg-base-200 border-l-2 border-primary/40"
                              : "",
                          ].join(" ")}
                          onClick={(e) => {
                            if (hasFiles) {
                              return;
                            }
                            handleCellClick(prop, e);
                          }}
                          onKeyDown={(e) => {
                            if (
                              hasFiles ||
                              (e.key !== "Enter" && e.key !== " ")
                            ) {
                              return;
                            }
                            e.preventDefault();
                            handleCellClick(prop, e);
                          }}
                          role="button"
                          tabIndex={isEditor && !hasFiles ? 0 : undefined}
                        >
                          {isInlineEditing ? (
                            <input
                              autoFocus
                              className="w-full bg-transparent text-sm text-base-content focus:outline-none"
                              onBlur={commitInline}
                              onChange={(e) =>
                                setInlineEdit({
                                  ...inlineEdit,
                                  value: e.target.value,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  commitInline();
                                }
                                if (e.key === "Escape") {
                                  setInlineEdit(null);
                                }
                                e.stopPropagation();
                              }}
                              value={inlineEdit.value}
                            />
                          ) : hasFiles ? (
                            <FilesPropertyValue
                              files={
                                (raw as { files?: FileItem[] }).files ?? []
                              }
                              isEditor={isEditor}
                              onAddClick={(e) => {
                                const rect = (
                                  e.currentTarget as HTMLElement
                                ).getBoundingClientRect();
                                setEditPop({ propId: prop.id, rect });
                              }}
                              onChange={(v) =>
                                onUpdateValue(entry.id, prop.id, v)
                              }
                            />
                          ) : hasValue ? (
                            <CellDisplay
                              compact
                              property={prop}
                              value={raw}
                              workspaceId={workspaceId}
                            />
                          ) : (
                            <span className="text-xs text-base-content/70 opacity-0 transition-opacity group-hover/prop:opacity-100">
                              {isEditor ? "Click to add" : "—"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-lg bg-base-200/40">
                  <FileText className="text-base-content/70" size={20} />
                </div>
                <p className="text-sm font-medium text-base-content/70">
                  No properties yet
                </p>
                <p className="text-xs text-base-content/70">
                  Add properties from the table view
                </p>
                {isEditor && onAddProperty && (
                  <button
                    className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
                    disabled={addingProperty}
                    onClick={async () => {
                      setAddingProperty(true);
                      await onAddProperty("Property", "text");
                      setAddingProperty(false);
                    }}
                    type="button"
                  >
                    {addingProperty ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : (
                      <Plus size={12} />
                    )}
                    Add a property
                  </button>
                )}
              </div>
            )}

            {/* ── Content / Block editor ── */}
            <div className="px-4 pb-2">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="text-xs font-semibold tracking-wide text-base-content/70">
                  Content
                </span>
                <div className="h-px flex-1 bg-base-300" />
              </div>
              <div className="rounded-lg border border-base-300 bg-base-100 px-4 py-3 dark:bg-base-100/4">
                <PageEditor
                  isDeleted={false}
                  isEditor={isEditor}
                  isLocked={false}
                  pageId={entry.id}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                />
              </div>
            </div>

            {/* Spacer */}
            <div className="h-4" />
          </div>

          {/* ── Footer CTA ──────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t border-base-300 bg-base-100 px-4 pb-5 pt-3">
            <Link
              className="group inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content! transition-colors duration-150 hover:bg-primary/90"
              href={`/app/${workspaceSlug}/${entry.shortId}`}
            >
              <FileText className="text-white!" size={14} />
              Open full page
              <ArrowSquareOut className="shrink-0 text-white/70!" size={13} />
            </Link>
          </div>

          {/* ── Cell editor popover ─────────────────────────────────────────── */}
          {editPop &&
            (() => {
              const prop = visibleProps.find((p) => p.id === editPop.propId);
              if (!prop) {
                return null;
              }
              return (
                <CellEditorPopover
                  cellRect={editPop.rect}
                  onClose={() => setEditPop(null)}
                  onPropertyConfigChange={() => {}}
                  onSave={(val) => {
                    onUpdateValue(entry.id, prop.id, val);
                    setEditPop(null);
                  }}
                  property={prop}
                  value={getVal(prop.id)}
                  workspaceId={workspaceId}
                />
              );
            })()}

          {/* ── Delete confirmation ─────────────────────────────────────────────── */}
          <ConfirmDialog
            confirmLabel="Delete entry"
            confirmLoadingLabel="Deleting…"
            description={
              <>
                <span className="font-semibold text-base-content">
                  {entry.title || "Untitled"}
                </span>{" "}
                will be permanently removed. This action cannot be undone.
              </>
            }
            loading={deleting}
            onConfirm={async () => {
              setDeleting(true);
              await onDeleteEntry(entry.id);
              setDeleting(false);
              onClose();
            }}
            onOpenChange={setConfirmDelete}
            open={confirmDelete}
            title="Delete this entry?"
          />
        </SheetContent>
      </Sheet>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
