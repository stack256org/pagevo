"use client";

import { Loader2, MessageSquare, Plus, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CellCommentPopover } from "@/components/database/cell-comment-popover";
import { CellDisplay } from "@/components/database/cells/cell-display";
import {
  CellEditorPopover,
  FilesPropertyValue,
} from "@/components/database/cells/cell-editor";
import { EditPropertySidePanel } from "@/components/database/edit-property-panel";
import { PROPERTY_TYPE_ICON } from "@/components/database/property-registry";
import type {
  DbProperty,
  DbPropertyValue,
  FileItem,
} from "@/components/database/types";
import { PageIcon } from "@/components/pages/page-icon";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useSession } from "@/lib/auth/client";
import { toggleSelfVote } from "@/lib/databases/vote";

// Plain-text snapshot of a property's current value, frozen onto a comment at
// creation time (mirrors the same helper in template-table-view.tsx) so a
// comment still shows what the property said even if the value changes later.
function getPropertyValueText(prop: DbProperty, raw: unknown): string {
  if (!raw) {
    return "";
  }
  const v = raw as Record<string, unknown>;
  const config = (prop.config ?? {}) as {
    options?: { id: string; name: string }[];
  };
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
      return v.checked ? "Yes" : "No";
    case "person": {
      const members =
        (v._members as { name?: string; email?: string }[] | undefined) ?? [];
      return members
        .map((m) => m.name || m.email)
        .filter(Boolean)
        .join(", ");
    }
    case "date": {
      const d = v.date as string | undefined;
      return d ? new Date(`${d}T00:00:00`).toLocaleDateString() : "";
    }
    case "select":
    case "status": {
      const optId = v.optionId as string | undefined;
      if (!optId) {
        return "";
      }
      return (config.options ?? []).find((o) => o.id === optId)?.name ?? "";
    }
    case "multi_select": {
      const ids = (v.optionIds as string[] | undefined) ?? [];
      const opts = config.options ?? [];
      return ids
        .map((id) => opts.find((o) => o.id === id)?.name ?? "")
        .filter(Boolean)
        .join(", ");
    }
    case "files": {
      const files = (v.files as { name?: string }[] | undefined) ?? [];
      return files
        .map((f) => f.name)
        .filter(Boolean)
        .join(", ");
    }
    default:
      return "";
  }
}

interface EntryPropertiesPanelProps {
  databaseId: string;
  entryId: string;
  entryShortId: string;
  isEditor: boolean;
  workspaceId: string;
  workspaceSlug: string;
}

const INLINE_TYPES = new Set(["text", "number", "url", "email", "phone"]);
const POPOVER_TYPES = new Set([
  "select",
  "status",
  "multi_select",
  "date",
  "person",
  "relation",
  "files",
]);

export function EntryPropertiesPanel({
  entryId,
  entryShortId,
  databaseId,
  workspaceId,
  workspaceSlug,
  isEditor,
}: EntryPropertiesPanelProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [properties, setProperties] = useState<DbProperty[]>([]);
  const [values, setValues] = useState<Map<string, unknown>>(new Map());
  const [loading, setLoading] = useState(true);

  // Inline editing (text/number/url/email/phone)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Popover editing (select/multi_select/date/person/relation)
  const [popover, setPopover] = useState<{
    propId: string;
    rect: DOMRect;
  } | null>(null);

  // Edit-property side panel (select/status only)
  const [editPropPanel, setEditPropPanel] = useState<{
    propId: string;
    anchorRect: DOMRect;
  } | null>(null);

  // Property-scoped comments (e.g. commenting on "Category: Retro") — kept
  // separate from the page-level Comments section further down the page.
  const [rowComments, setRowComments] = useState<Array<{
    blockId: string | null;
    deletedAt: string | null;
    propertyId: string | null;
  }> | null>(null);
  const [commentPopover, setCommentPopover] = useState<{
    propId: string;
    rect: DOMRect;
    propName: string;
    valueLabel: string;
  } | null>(null);

  // Empty-state CTA (Hard Rule 28) — adds a default Text property directly, matching the
  // "create then edit inline" pattern used by New Page/New Database, not a separate type-picker.
  const [addingProperty, setAddingProperty] = useState(false);

  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pages/${entryId}/comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) {
          return;
        }
        setRowComments(
          data.comments as Array<{
            blockId: string | null;
            deletedAt: string | null;
            propertyId: string | null;
          }>
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  function commentCountFor(propId: string): number {
    if (!rowComments) {
      return 0;
    }
    return rowComments.filter(
      (c) => !c.blockId && !c.deletedAt && c.propertyId === propId
    ).length;
  }

  // Lets the topbar "Comments" panel jump to a specific property's comment
  // popover without prop-drilling — triggers the exact same button click a
  // user would make on that property row's own comment icon.
  useEffect(() => {
    function onJumpToComment(e: Event) {
      const detail = (
        e as CustomEvent<{
          pageId: string;
          blockId?: string;
          propertyId?: string;
        }>
      ).detail;
      if (!detail || detail.pageId !== entryId || !detail.propertyId) {
        return;
      }
      const btn = document.querySelector<HTMLButtonElement>(
        `[data-property-comment-id="${detail.propertyId}"]`
      );
      btn?.click();
    }
    window.addEventListener("pagevo:jump-to-base-200-comment", onJumpToComment);
    return () =>
      window.removeEventListener(
        "pagevo:jump-to-base-200-comment",
        onJumpToComment
      );
  }, [entryId]);

  // `popover`/`editPropPanel` are frozen DOMRect snapshots, so scroll is locked while
  // either is open instead of repositioning (there's nothing fresh to reposition to).
  useScrollLockWhileOpen(
    !!popover || !!editPropPanel || !!commentPopover,
    (target) =>
      !!target.closest?.(
        '[role="alertdialog"], [data-edit-property-exempt], [data-comment-exempt]'
      )
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [propsRes, valsRes] = await Promise.all([
        fetch(`/api/databases/${databaseId}/properties`),
        fetch(`/api/entries/${entryId}/property-values`),
      ]);
      if (cancelled || !propsRes.ok || !valsRes.ok) {
        setLoading(false);
        return;
      }
      const props = (await propsRes.json()) as DbProperty[];
      const vals = (await valsRes.json()) as DbPropertyValue[];
      const map = new Map<string, unknown>();
      for (const v of vals) {
        map.set(v.propertyId, v.value);
      }
      setProperties(props);
      setValues(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [databaseId, entryId]);

  const saveValue = useCallback(
    async (propId: string, value: unknown) => {
      setValues((prev) => new Map(prev).set(propId, value));
      await fetch(`/api/entries/${entryId}/property-values/${propId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:entry-value-changed", {
          detail: { entryId, propertyId: propId, value },
        })
      );
      // Busts the Next.js client router cache so a page navigated to next (e.g.
      // this entry's containing database view) re-fetches fresh server data
      // instead of reusing whatever was cached before this edit.
      router.refresh();
    },
    [entryId, router]
  );

  // Values can also change from a database view's inline cell edit or the row
  // context menu — neither shares state with this panel, so without this
  // listener a value edited elsewhere only shows up here after a full reload.
  useEffect(() => {
    function onValueChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          entryId: string;
          propertyId: string;
          value: unknown;
        }>
      ).detail;
      if (!detail || detail.entryId !== entryId) {
        return;
      }
      setValues((prev) => new Map(prev).set(detail.propertyId, detail.value));
    }
    window.addEventListener("pagevo:entry-value-changed", onValueChanged);
    return () =>
      window.removeEventListener("pagevo:entry-value-changed", onValueChanged);
  }, [entryId]);

  const commitInline = useCallback(
    (prop: DbProperty) => {
      const text = editText.trim();
      let value: unknown;
      if (prop.type === "number") {
        const n = Number.parseFloat(text);
        value = { number: text === "" ? null : isNaN(n) ? null : n };
      } else if (prop.type === "url") {
        value = { url: text };
      } else if (prop.type === "email") {
        value = { email: text };
      } else if (prop.type === "phone") {
        value = { phone: text };
      } else {
        value = { text };
      }
      saveValue(prop.id, value);
      setEditingId(null);
    },
    [editText, saveValue]
  );

  const updatePropertyConfig = useCallback(
    async (propId: string, patch: Record<string, unknown>) => {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propId ? ({ ...p, ...patch } as DbProperty) : p
        )
      );
      await fetch(`/api/databases/${databaseId}/properties/${propId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // Changing a property's type reshapes its stored value (or, for
      // formula/rollup/created_by, drops storage entirely in favor of a value
      // computed on every read) — `values` still holds the old shape until
      // refetched, so this row would otherwise render blank until reload.
      if (patch.type) {
        const valsRes = await fetch(`/api/entries/${entryId}/property-values`);
        if (valsRes.ok) {
          const vals = (await valsRes.json()) as DbPropertyValue[];
          const map = new Map<string, unknown>();
          for (const v of vals) {
            map.set(v.propertyId, v.value);
          }
          setValues(map);
        }
      }
      // Busts the Next.js client router cache — same reasoning as saveValue
      // above — so navigating to this entry's containing database view
      // re-fetches fresh server data (including the new property type/shape)
      // instead of reusing whatever table state was cached before this edit.
      router.refresh();
    },
    [databaseId, entryId, router]
  );

  const deletePropertyLocal = useCallback(
    async (propId: string) => {
      const res = await fetch(
        `/api/databases/${databaseId}/properties/${propId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        return;
      }
      setProperties((prev) => prev.filter((p) => p.id !== propId));
    },
    [databaseId]
  );

  const duplicatePropertyLocal = useCallback(
    async (prop: DbProperty) => {
      const res = await fetch(`/api/databases/${databaseId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${prop.name} (copy)`,
          type: prop.type,
          config: prop.config,
        }),
      });
      if (!res.ok) {
        return;
      }
      const newProp = (await res.json()) as DbProperty;
      setProperties((prev) => [...prev, newProp]);
    },
    [databaseId]
  );

  const addPropertyLocal = useCallback(async () => {
    setAddingProperty(true);
    const res = await fetch(`/api/databases/${databaseId}/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Property", type: "text" }),
    });
    setAddingProperty(false);
    if (!res.ok) {
      return;
    }
    const newProp = (await res.json()) as DbProperty;
    setProperties((prev) => [...prev, newProp]);
  }, [databaseId]);

  const visibleProps = properties.filter(
    (p) => !p.isSystem && !p.isBackRelation
  );
  if (loading) {
    return null;
  }

  if (!visibleProps.length) {
    return (
      <div className="mb-5 mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-base-300 px-4 py-6 text-center">
        <p className="text-sm font-medium text-base-content/70">
          No properties yet
        </p>
        <p className="text-xs text-base-content/70">
          Track structured data like status, priority, or due date on this
          entry.
        </p>
        {isEditor && (
          <button
            className="mt-1 inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
            disabled={addingProperty}
            onClick={addPropertyLocal}
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
    );
  }

  const popoverProp = popover
    ? (properties.find((p) => p.id === popover.propId) ?? null)
    : null;
  const editPropProp = editPropPanel
    ? (properties.find((p) => p.id === editPropPanel.propId) ?? null)
    : null;

  return (
    <>
      <div className="mb-5 mt-3 space-y-0.5">
        {visibleProps.map((prop) => {
          const TypeIcon =
            PROPERTY_TYPE_ICON[prop.type as keyof typeof PROPERTY_TYPE_ICON];
          const val = values.get(prop.id) ?? null;
          const isEditing = editingId === prop.id;

          return (
            <div
              className="group/row flex min-h-8 items-start gap-2 rounded-sm px-1 py-0.5 hover:bg-base-200/50"
              key={prop.id}
            >
              {/* Label column */}
              <div className="flex w-45 shrink-0 items-center gap-2 pt-1">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-base-300 bg-base-200 text-base-content/70">
                  {prop.config?.icon ? (
                    <PageIcon icon={prop.config.icon} size={12} />
                  ) : (
                    <TypeIcon size={12} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-base-content/70">
                  {prop.name}
                </span>
                {isEditor && (
                  <button
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-base-content/70 opacity-0 transition-opacity duration-150 hover:bg-base-200 hover:text-base-content group-hover/row:opacity-100"
                    onClick={(e) =>
                      setEditPropPanel({
                        propId: prop.id,
                        anchorRect: (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect(),
                      })
                    }
                    onMouseEnter={(e) => showTooltip("Edit property", e)}
                    onMouseLeave={hideTooltip}
                    type="button"
                  >
                    <Settings2 size={12} />
                  </button>
                )}
              </div>

              {/* Value column */}
              <div className="min-w-0 flex-1 pt-0.5">
                {/* Checkbox — always visible toggle */}
                {prop.type === "checkbox" && (
                  <button
                    className="flex items-center"
                    disabled={!isEditor}
                    onClick={() => {
                      const checked = !(
                        (val as { checked?: boolean } | null)?.checked ?? false
                      );
                      saveValue(prop.id, { checked });
                    }}
                    type="button"
                  >
                    {(val as { checked?: boolean } | null)?.checked ? (
                      <svg
                        className="size-4 text-primary"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <rect height="16" rx="4" width="16" x="2" y="2" />
                        <path
                          d="M6 10l3 3 5-5"
                          fill="none"
                          stroke="white"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="size-4 text-base-content/70"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        viewBox="0 0 20 20"
                      >
                        <rect height="15" rx="3.5" width="15" x="2.5" y="2.5" />
                      </svg>
                    )}
                  </button>
                )}

                {/* Inline text input types */}
                {INLINE_TYPES.has(prop.type) &&
                  (isEditing ? (
                    <input
                      autoFocus
                      className="w-full rounded border-none bg-transparent text-sm text-base-content outline-none ring-0 focus:outline-none"
                      onBlur={() => commitInline(prop)}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          inputRef.current?.blur();
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      ref={inputRef}
                      type={
                        prop.type === "number"
                          ? "text"
                          : prop.type === "email"
                            ? "email"
                            : "text"
                      }
                      value={editText}
                    />
                  ) : (
                    <button
                      className="flex min-h-5.5 w-full items-center text-left disabled:cursor-default"
                      disabled={!isEditor}
                      onClick={() => {
                        const cur = (() => {
                          if (!val) {
                            return "";
                          }
                          const v = val as Record<string, unknown>;
                          return String(v[prop.type] ?? v.text ?? "");
                        })();
                        setEditText(cur);
                        setEditingId(prop.id);
                      }}
                      type="button"
                    >
                      {val && (
                        <CellDisplay
                          property={prop}
                          value={val}
                          workspaceId={workspaceId}
                        />
                      )}
                      {!val && (
                        <span className="text-sm text-base-content/70 opacity-0 transition-opacity group-hover/row:opacity-100">
                          Empty
                        </span>
                      )}
                    </button>
                  ))}

                {/* Files — a stack of thumbnail cards + a trailing "+ Add a
                    file or image" row once at least one file exists, instead
                    of the generic single-line button below. */}
                {prop.type === "files" &&
                  !!(val as { files?: FileItem[] } | null)?.files?.length && (
                    <FilesPropertyValue
                      files={(val as { files?: FileItem[] }).files ?? []}
                      isEditor={isEditor}
                      onAddClick={(e) => {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setPopover({ propId: prop.id, rect });
                      }}
                      onChange={(v) => saveValue(prop.id, v)}
                    />
                  )}

                {/* Vote-mode person: clicking toggles the current viewer's own
                    vote directly — never opens the full people picker, so
                    there's no path from this row to editing anyone else's
                    vote. The server enforces the same self-only rule
                    independently (app/api/entries/[id]/property-values/[propId]/route.ts),
                    this is purely about not offering the picker in the UI. */}
                {prop.type === "person" && prop.config?.voteMode && (
                  <button
                    className="flex min-h-5.5 w-fit items-center gap-1 text-left disabled:cursor-default"
                    disabled={!isEditor || !session?.user?.id}
                    onClick={() => {
                      if (!session?.user?.id) {
                        return;
                      }
                      saveValue(
                        prop.id,
                        toggleSelfVote(
                          val as { userIds?: string[] } | null,
                          session.user
                        )
                      );
                    }}
                    type="button"
                  >
                    {val ? (
                      <CellDisplay
                        property={prop}
                        value={val}
                        workspaceId={workspaceId}
                      />
                    ) : (
                      <CellDisplay
                        property={prop}
                        value={{ userIds: [] }}
                        workspaceId={workspaceId}
                      />
                    )}
                  </button>
                )}

                {/* Popover types: select / multi_select / date / person / relation / empty files */}
                {POPOVER_TYPES.has(prop.type) &&
                  !(prop.type === "person" && prop.config?.voteMode) &&
                  !(
                    prop.type === "files" &&
                    !!(val as { files?: FileItem[] } | null)?.files?.length
                  ) && (
                    <button
                      className="flex min-h-5.5 w-full items-center gap-1 text-left disabled:cursor-default"
                      disabled={!isEditor}
                      onClick={(e) => {
                        const rect = (
                          e.currentTarget as HTMLElement
                        ).getBoundingClientRect();
                        setPopover({ propId: prop.id, rect });
                      }}
                      type="button"
                    >
                      {val && (
                        <CellDisplay
                          property={prop}
                          value={val}
                          workspaceId={workspaceId}
                        />
                      )}
                      {!val && (
                        <span className="text-sm text-base-content/70 opacity-0 transition-opacity group-hover/row:opacity-100">
                          Empty
                        </span>
                      )}
                    </button>
                  )}

                {/* Computed, read-only — same reasoning as Rollup/Formula:
                    no click-to-edit popover, since there's nothing to pick. */}
                {prop.type === "created_by" && (
                  <div className="flex min-h-5.5 w-full items-center gap-1">
                    {val ? (
                      <CellDisplay
                        property={prop}
                        value={val}
                        workspaceId={workspaceId}
                      />
                    ) : (
                      <span className="text-sm text-base-content/70 opacity-0 transition-opacity group-hover/row:opacity-100">
                        Empty
                      </span>
                    )}
                  </div>
                )}

                {/* Computed, read-only — same reasoning as Created by above. */}
                {(prop.type === "formula" || prop.type === "rollup") && (
                  <div className="flex min-h-5.5 w-full items-center gap-1">
                    {val ? (
                      <CellDisplay
                        property={prop}
                        value={val}
                        workspaceId={workspaceId}
                      />
                    ) : (
                      <span className="text-sm text-base-content/70 opacity-0 transition-opacity group-hover/row:opacity-100">
                        Empty
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Comment column — visible on row hover, or always once a
                  comment exists so past discussion stays discoverable */}
              {(() => {
                const count = commentCountFor(prop.id);
                return (
                  <button
                    className={`mt-1 flex shrink-0 items-center gap-1 rounded-sm px-1 py-0.5 text-base-content/70 transition-opacity duration-150 hover:bg-base-200 hover:text-base-content ${
                      count > 0
                        ? "opacity-100"
                        : "opacity-0 group-hover/row:opacity-100"
                    }`}
                    data-property-comment-id={prop.id}
                    onClick={(e) => {
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      setCommentPopover({
                        propId: prop.id,
                        rect,
                        propName: prop.name,
                        valueLabel: getPropertyValueText(prop, val),
                      });
                    }}
                    onMouseEnter={(e) =>
                      showTooltip("Comment on this property", e)
                    }
                    onMouseLeave={hideTooltip}
                    type="button"
                  >
                    <MessageSquare size={12} />
                    {count > 0 && (
                      <span className="text-xs font-bold leading-none">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Popover editor */}
      {popover && popoverProp && (
        <CellEditorPopover
          cellRect={popover.rect}
          onClose={() => setPopover(null)}
          onEditProperty={(rect) =>
            setEditPropPanel({ propId: popover.propId, anchorRect: rect })
          }
          onPropertyConfigChange={(propId, config) =>
            updatePropertyConfig(propId, { config })
          }
          onSave={(v) => {
            saveValue(popover.propId, v);
            setPopover(null);
          }}
          property={popoverProp}
          value={values.get(popover.propId) ?? null}
          workspaceId={workspaceId}
        />
      )}

      {editPropPanel && editPropProp && (
        <EditPropertySidePanel
          canDelete={!editPropProp.isSystem}
          getAnchorRect={() => editPropPanel.anchorRect}
          key={editPropProp.id}
          onClose={() => setEditPropPanel(null)}
          onDeleteProperty={() => deletePropertyLocal(editPropProp.id)}
          onDuplicateProperty={() => duplicatePropertyLocal(editPropProp)}
          onUpdateProperty={(patch) =>
            updatePropertyConfig(editPropProp.id, patch)
          }
          properties={properties}
          property={editPropProp}
          workspaceId={workspaceId}
        />
      )}

      {commentPopover && (
        <CellCommentPopover
          anchorRect={commentPopover.rect}
          entryShortId={entryShortId}
          onClose={() => setCommentPopover(null)}
          onCommentAdded={() =>
            setRowComments((prev) => [
              ...(prev ?? []),
              {
                blockId: null,
                deletedAt: null,
                propertyId: commentPopover.propId,
              },
            ])
          }
          pageId={entryId}
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
