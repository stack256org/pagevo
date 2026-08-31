"use client";

import { Loader2, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import {
  CATEGORY_ICON_NAMES,
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  resolveCategoryIcon,
} from "@/lib/orbit/category-icons";

type TemplateCategory = {
  id: string;
  key: string;
  label: string;
  icon: string | null;
  orderIndex: number;
  templateCount: number;
};

// Shared by the create dialog and the per-row editor so both offer exactly
// the same set — and the same set the gallery renders from.
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {CATEGORY_ICON_NAMES.map((name) => {
        const Icon = CATEGORY_ICONS[name];
        const selected = name === value;
        return (
          <button
            aria-label={name}
            aria-pressed={selected}
            className={[
              "flex aspect-square items-center justify-center rounded-sm border transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-base-content/70 hover:border-base-300 hover:bg-base-200 hover:text-base-content",
            ].join(" ")}
            key={name}
            onClick={() => onChange(name)}
            // Keeps focus in the row's name input, whose onBlur commits the
            // edit — without this, clicking an icon would blur the input and
            // close the editor before the choice registered.
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

// Standalone category CRUD — reuses the same GET/POST/PATCH/DELETE
// /api/orbit/templates/categories[/:id] routes that used to only be
// reachable by opening the new/edit template form
// (components/orbit/template-form.tsx).
export function CategoriesManager({
  initialCategories,
}: {
  initialCategories: TemplateCategory[];
}) {
  const [categories, setCategories] =
    useState<TemplateCategory[]>(initialCategories);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState(DEFAULT_CATEGORY_ICON);
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState(DEFAULT_CATEGORY_ICON);
  const [toDelete, setToDelete] = useState<TemplateCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  function openAdd() {
    setNewLabel("");
    setNewIcon(DEFAULT_CATEGORY_ICON);
    setAddError(null);
    setAddOpen(true);
  }

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || creating) {
      return;
    }
    setCreating(true);
    setAddError(null);
    try {
      const res = await fetch("/api/orbit/templates/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, icon: newIcon }),
      });
      if (res.ok) {
        const created = (await res.json()) as TemplateCategory;
        setCategories((prev) => [...prev, created]);
        setAddOpen(false);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setAddError(d.error ?? "Failed to create category");
      }
    } finally {
      setCreating(false);
    }
  }

  function startEdit(cat: TemplateCategory) {
    setEditingId(cat.id);
    setEditLabel(cat.label);
    setEditIcon(cat.icon ?? DEFAULT_CATEGORY_ICON);
  }

  async function commitEdit(cat: TemplateCategory) {
    const label = editLabel.trim();
    const icon = editIcon;
    setEditingId(null);
    // Nothing changed — skip the request entirely. Checks the icon too, not
    // just the label, or picking a new icon without retyping the name would
    // be silently dropped.
    if (
      !label ||
      (label === cat.label && icon === (cat.icon ?? DEFAULT_CATEGORY_ICON))
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/orbit/templates/categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, icon }),
      });
      if (res.ok) {
        const updated = (await res.json()) as TemplateCategory;
        setCategories((prev) =>
          prev.map((c) =>
            c.id === cat.id
              ? { ...c, label: updated.label, icon: updated.icon }
              : c
          )
        );
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Failed to rename category");
      }
    } catch {
      setError("Network error");
    }
  }

  async function handleDelete() {
    if (!toDelete) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orbit/templates/categories/${toDelete.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Failed to delete category");
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== toDelete.id));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="border-b border-base-300 bg-base-200/20 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-base-content">Categories</h2>
        <p className="text-xs text-base-content/70">
          Used to group built-in templates in the user-facing gallery
        </p>
      </div>

      <div className="p-3">
        {categories.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-base-content/70">
            No categories yet
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {categories.map((cat) => {
              const inUse = cat.templateCount > 0;
              const CatIcon = resolveCategoryIcon(cat.icon);
              return (
                <div
                  className="group flex flex-wrap items-center gap-1 rounded-sm px-2 py-2 text-sm font-medium text-base-content hover:bg-base-200"
                  key={cat.id}
                >
                  {editingId === cat.id ? (
                    <>
                      <input
                        autoFocus
                        className="min-w-0 flex-1 rounded-xs border border-primary/40 bg-base-200 px-2 py-1 text-sm text-base-content outline-none"
                        onBlur={() => commitEdit(cat)}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit(cat);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          }
                        }}
                        value={editLabel}
                      />
                      <div className="mt-1.5 w-full rounded-sm border border-base-300 bg-base-200 p-1.5">
                        <IconPicker onChange={setEditIcon} value={editIcon} />
                      </div>
                    </>
                  ) : (
                    <button
                      className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
                      onClick={() => startEdit(cat)}
                      type="button"
                    >
                      <CatIcon
                        className="shrink-0 text-base-content/70"
                        size={15}
                      />
                      <span className="truncate">{cat.label}</span>
                      {inUse && (
                        <span className="shrink-0 rounded-full bg-base-200 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-base-content/70">
                          {cat.templateCount}
                        </span>
                      )}
                    </button>
                  )}
                  {editingId !== cat.id && (
                    <button
                      aria-label={`Rename ${cat.label}`}
                      className="shrink-0 rounded-xs p-1.5 text-base-content/50 opacity-0 transition-colors hover:bg-base-200 hover:text-base-content group-hover:opacity-100"
                      onClick={() => startEdit(cat)}
                      type="button"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    aria-disabled={inUse}
                    aria-label={
                      inUse
                        ? `${cat.label} is used by ${cat.templateCount} template${cat.templateCount === 1 ? "" : "s"} and can't be deleted`
                        : `Delete category ${cat.label}`
                    }
                    className={[
                      "shrink-0 rounded-xs p-1.5 opacity-0 transition-colors group-hover:opacity-100",
                      inUse
                        ? "cursor-not-allowed text-base-content/50"
                        : "text-base-content/70 hover:bg-error/10 hover:text-error",
                    ].join(" ")}
                    onClick={() => {
                      if (!inUse) {
                        setToDelete(cat);
                      }
                    }}
                    onMouseEnter={(e) =>
                      inUse &&
                      showTooltip(
                        `Used by ${cat.templateCount} template${cat.templateCount === 1 ? "" : "s"} — remove them first`,
                        e
                      )
                    }
                    onMouseLeave={hideTooltip}
                    type="button"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="mt-2 px-2 text-xs text-error">{error}</p>}

        <div className="mt-2 border-t border-base-300 pt-3">
          <button
            className="flex w-full items-center gap-1.5 rounded-sm px-2 py-2 text-left text-sm font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={openAdd}
            type="button"
          >
            <Plus size={14} />
            New category
          </button>
        </div>
      </div>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}

      <Dialog onOpenChange={setAddOpen} open={addOpen}>
        <DialogContent className="max-w-90 sm:max-w-90 gap-4 rounded-xl bg-base-200">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div>
            <input
              autoFocus
              className="w-full rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                }
              }}
              placeholder="e.g. Meeting Notes"
              type="text"
              value={newLabel}
            />

            <p className="mt-4 text-xs font-semibold text-base-content/70">
              Icon
            </p>
            <div className="mt-1.5 rounded-sm border border-base-300 p-2">
              <IconPicker onChange={setNewIcon} value={newIcon} />
            </div>

            {addError && (
              <p className="mt-1.5 text-xs text-error">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={creating || !newLabel.trim()}
              onClick={handleCreate}
              size="sm"
              type="button"
            >
              {creating && <Loader2 className="animate-spin" size={13} />}
              {creating ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLoadingLabel="Deleting…"
        description={
          <>
            &ldquo;{toDelete?.label}&rdquo; will be permanently deleted.
            Categories still used by a template can&rsquo;t be deleted.
          </>
        }
        loading={deleting}
        onConfirm={handleDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        open={!!toDelete}
        title="Delete this category?"
      />
    </div>
  );
}
