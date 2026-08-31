"use client";

import { ImageIcon, Plus, Search, Smile, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DbBlock } from "@/components/editor/serializer";
import { IconPicker } from "@/components/pages/icon-picker";
import { PageIcon } from "@/components/pages/page-icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  type SaveState,
  SaveStatusIndicator,
} from "@/components/ui/save-status";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useUpload } from "@/lib/storage/use-upload";
import { TemplateEditor } from "./template-editor";

// Portaled to <body> with viewport coordinates so it isn't clipped by this
// form's narrow sidebar (same pattern as workspace-general-section.tsx).
const ICON_PICKER_WIDTH = 352;
const ICON_PICKER_HEIGHT = 400;

type TemplateCategory = {
  id: string;
  key: string;
  label: string;
  orderIndex: number;
  templateCount: number;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  status: string;
  pageSnapshot: {
    title?: string;
    icon?: string | null;
    cover_url?: string | null;
    blocks?: {
      id?: string;
      type: string;
      order_index?: number;
      parent_block_id?: string | null;
      content?: unknown;
    }[];
  };
};

function blockPlainText(content: unknown): string {
  const c = content as { text?: { text?: string }[] } | undefined;
  return (c?.text ?? []).map((t) => t.text ?? "").join("");
}

// Key-order-independent stringify — the DB→TipTap→DB round trip preserves
// content but not key order (e.g. a todo's {text,checked} comes back as
// {checked,text}), which plain JSON.stringify would report as a difference.
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") {
    return JSON.stringify(v) ?? "null";
  }
  if (Array.isArray(v)) {
    return `[${v.map(stableStringify).join(",")}]`;
  }
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

// Identity of the content, excluding block ids (auto-assigned on mount) and
// empty paragraphs (TipTap's normalized empty doc), so bookkeeping doesn't
// register as a real edit; matches publish-validation's "has content" check.
function blocksSignature(bs: DbBlock[]): string {
  return stableStringify(
    bs
      .filter(
        (b) =>
          b.type !== "paragraph" || blockPlainText(b.content).trim().length > 0
      )
      .map((b) => [b.type, b.content, b.parentBlockId])
  );
}

function snapshotToDbBlocks(snapshot: TemplateRow["pageSnapshot"]): DbBlock[] {
  if (!snapshot.blocks || snapshot.blocks.length === 0) {
    return [];
  }
  return snapshot.blocks.map((b, i) => ({
    id: b.id ?? `snap-${i}`,
    type: b.type,
    content: (b.content ?? null) as DbBlock["content"],
    orderIndex: b.order_index ?? i,
    parentBlockId: b.parent_block_id ?? null,
  }));
}

interface Props {
  template?: TemplateRow;
}

export function TemplateForm({ template }: Props) {
  const router = useRouter();
  const isEdit = !!template;
  const isPublished = template?.status === "published";

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDesc] = useState(template?.description ?? "");
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [categoryId, setCategoryId] = useState(template?.categoryId ?? "");
  const [categorySearch, setCategorySearch] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<TemplateCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [icon, setIcon] = useState(
    (template?.pageSnapshot as { icon?: string } | undefined)?.icon ?? ""
  );
  const [blocks, setBlocks] = useState<DbBlock[]>(
    template ? snapshotToDbBlocks(template.pageSnapshot) : []
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(
    template?.pageSnapshot.cover_url ?? null
  );
  const [removeCoverConfirm, setRemoveCoverConfirm] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);
  const { upload: uploadCover, uploading: coverUploading } = useUpload({
    kind: "template_cover",
  });
  const [saving, setSaving] = useState<
    null | "draft" | "publish" | "update" | "unpublish"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [iconPickerPos, setIconPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  // Explicit-save editor, so "dirty" is tracked by hand rather than derived
  // from an autosave cycle. Cleared on a successful save; the "saved" flash
  // is transient since a successful save navigates back to the list.
  const [dirty, setDirty] = useState(false);
  const initialBlocksSig = useRef(
    blocksSignature(template ? snapshotToDbBlocks(template.pageSnapshot) : [])
  );
  const iconTriggerRef = useRef<HTMLDivElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  const saveState: SaveState = saving ? "saving" : dirty ? "unsaved" : "idle";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Warn before losing unsaved template edits to a tab close / reload.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    fetch("/api/orbit/templates/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TemplateCategory[]) => {
        setCategories(list);
        setCategoryId((current) => current || list[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  async function handleCreateCategory() {
    const label = newCategoryLabel.trim();
    if (!label) {
      return;
    }
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/orbit/templates/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (res.ok) {
        const created = (await res.json()) as TemplateCategory;
        setCategories((prev) => [...prev, created]);
        setCategoryId(created.id);
        setNewCategoryLabel("");
        setNewCategoryOpen(false);
      }
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleDeleteCategory() {
    if (!categoryToDelete) {
      return;
    }
    setDeletingCategory(true);
    setCategoryError(null);
    try {
      const res = await fetch(
        `/api/orbit/templates/categories/${categoryToDelete.id}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCategoryError(data.error ?? "Failed to delete category");
        return;
      }
      setCategories((prev) => {
        const next = prev.filter((c) => c.id !== categoryToDelete.id);
        setCategoryId((current) =>
          current === categoryToDelete.id ? (next[0]?.id ?? "") : current
        );
        return next;
      });
      setCategoryToDelete(null);
    } finally {
      setDeletingCategory(false);
    }
  }

  // iconPickerPos is a `position: fixed` portal anchored to a rect
  // snapshotted once on open — lock page scroll while it's open instead of
  // repositioning, matching the pattern used by the app's other click-opened
  // popovers anchored via a one-time getBoundingClientRect() snapshot.
  useScrollLockWhileOpen(
    emojiOpen,
    (target) => !!iconPickerRef.current?.contains(target)
  );

  function toggleEmojiOpen() {
    if (!emojiOpen && iconTriggerRef.current) {
      const rect = iconTriggerRef.current.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - ICON_PICKER_WIDTH - 8)
      );
      const top = Math.max(
        8,
        Math.min(rect.bottom + 6, window.innerHeight - ICON_PICKER_HEIGHT)
      );
      setIconPickerPos({ top, left });
    }
    setEmojiOpen((v) => !v);
  }

  const publishIssues: string[] = [];
  if (!name.trim()) {
    publishIssues.push("a name");
  }
  if (!categoryId) {
    publishIssues.push("a category");
  }
  if (
    !blocks.some(
      (b) =>
        b.type !== "paragraph" || blockPlainText(b.content).trim().length > 0
    )
  ) {
    publishIssues.push("some content");
  }

  // Persists the template (POST on create, PATCH on edit) and returns the
  // template id, or null on failure (error state is already set).
  async function saveTemplate(): Promise<string | null> {
    if (!name.trim()) {
      setError("Name is required");
      return null;
    }
    setError(null);

    const pageSnapshot = {
      title: name.trim(),
      icon: icon.trim() || null,
      cover_url: coverUrl,
      is_full_width: false,
      font_family: "default",
      blocks: blocks.map((b, i) => ({
        id:
          b.id?.startsWith("tmp-") || b.id?.startsWith("snap-")
            ? crypto.randomUUID()
            : (b.id ?? crypto.randomUUID()),
        type: b.type,
        content: b.content ?? null,
        schema_version: 1,
        order_index: i,
        parent_block_id: b.parentBlockId ?? null,
        children: [],
      })),
      subpages: [],
      database_schema: null,
    };

    const url = isEdit
      ? `/api/orbit/templates/${template!.id}`
      : "/api/orbit/templates";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId,
        pageSnapshot,
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to save template");
      return null;
    }

    const saved = (await res.json()) as { id: string };
    initialBlocksSig.current = blocksSignature(blocks);
    setDirty(false);
    return saved.id;
  }

  function goBackToList() {
    router.push("/orbit-admin/orbit/templates");
    router.refresh();
  }

  async function handleSaveDraft() {
    setSaving("draft");
    try {
      const id = await saveTemplate();
      if (id) {
        goBackToList();
      }
    } finally {
      setSaving(null);
    }
  }

  async function handlePublish() {
    if (publishIssues.length > 0) {
      return;
    }
    setSaving("publish");
    try {
      const id = await saveTemplate();
      if (!id) {
        return;
      }
      const res = await fetch(`/api/orbit/templates/${id}/publish`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to publish template");
        return;
      }
      goBackToList();
    } finally {
      setSaving(null);
    }
  }

  async function handleUpdate() {
    setSaving("update");
    try {
      const id = await saveTemplate();
      if (id) {
        goBackToList();
      }
    } finally {
      setSaving(null);
    }
  }

  async function handleUnpublish() {
    setSaving("unpublish");
    try {
      const id = await saveTemplate();
      if (!id) {
        return;
      }
      const res = await fetch(`/api/orbit/templates/${id}/unpublish`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to unpublish template");
        return;
      }
      goBackToList();
    } finally {
      setSaving(null);
    }
  }

  async function onCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    const result = await uploadCover(file);
    if (result) {
      setCoverUrl(result.fileUrl);
      setDirty(true);
    }
  }

  async function doDelete() {
    await fetch(`/api/orbit/templates/${template!.id}`, { method: "DELETE" });
    router.push("/orbit-admin/orbit/templates");
    router.refresh();
  }

  return (
    <>
      <div className="flex min-h-150 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        {/* Left sidebar — w-65 matching settings sidebar */}
        <aside className="flex w-65 shrink-0 flex-col border-r border-base-300 bg-base-200">
          <div className="border-b border-base-300 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
              Template settings
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
            {/* Icon picker */}
            <div>
              {/* Not a <label>: the icon field is a button + clear button, not
                 a form control, so there is nothing to associate it with. */}
              <p className="mb-1.5 block text-xs font-semibold text-base-content/70">
                Icon
              </p>
              <div className="relative">
                {/* The field box stays a plain div (it may not be a <button>:
                   the ✕ below is its own control). The picker trigger is a real
                   button filling it, and focus styling moves to focus-within so
                   the ring still renders on the whole field. */}
                <div
                  className="flex h-10 w-full items-center gap-2.5 rounded-sm border border-base-300 bg-base-200 px-3 transition-colors hover:border-primary/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                  ref={iconTriggerRef}
                >
                  <button
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 focus:outline-none"
                    onClick={toggleEmojiOpen}
                    type="button"
                  >
                    {icon ? (
                      <PageIcon icon={icon} size={20} />
                    ) : (
                      <Smile
                        className="shrink-0 text-base-content/50"
                        size={16}
                      />
                    )}
                    <span className="flex-1 text-left text-xs text-base-content/70">
                      {icon ? "Click to change" : "Pick an emoji icon"}
                    </span>
                  </button>
                  {icon && (
                    <button
                      aria-label="Remove icon"
                      className="shrink-0 text-2xs text-base-content/50 hover:text-base-content/70"
                      onClick={() => {
                        setIcon("");
                        setDirty(true);
                      }}
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {mounted &&
                  emojiOpen &&
                  iconPickerPos &&
                  createPortal(
                    <div
                      ref={iconPickerRef}
                      style={{
                        position: "fixed",
                        top: iconPickerPos.top,
                        left: iconPickerPos.left,
                        zIndex: 9999,
                      }}
                    >
                      <div className="relative">
                        <IconPicker
                          onClose={() => setEmojiOpen(false)}
                          onIconPreview={(v) => {
                            setIcon(v);
                            setDirty(true);
                          }}
                          onRemove={
                            icon
                              ? () => {
                                  setIcon("");
                                  setEmojiOpen(false);
                                  setDirty(true);
                                }
                              : undefined
                          }
                          onSelect={(v) => {
                            setIcon(v);
                            setEmojiOpen(false);
                            setDirty(true);
                          }}
                          triggerRef={iconTriggerRef}
                        />
                      </div>
                    </div>,
                    document.body
                  )}
              </div>
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-base-content/70"
                htmlFor="template-form-name"
              >
                Name <span className="text-error">*</span>
              </label>
              <input
                className="w-full rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="template-form-name"
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="e.g. Meeting Notes"
                type="text"
                value={name}
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-base-content/70"
                htmlFor="template-form-description"
              >
                Description
              </label>
              <textarea
                className="w-full resize-none rounded-sm border border-base-300 bg-base-200 px-3 py-2 text-sm text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="template-form-description"
                onChange={(e) => {
                  setDesc(e.target.value);
                  setDirty(true);
                }}
                placeholder="What is this template for?"
                rows={3}
                value={description}
              />
            </div>

            <div>
              {/* Not a <label>: this heads the category search + chip buttons
                 as a group rather than labelling a single control. */}
              <p className="mb-2 block text-xs font-semibold text-base-content/70">
                Category
              </p>
              {categories.length > 5 && (
                <div className="relative mb-1.5">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/50"
                    size={12}
                  />
                  <input
                    className="w-full rounded-sm border border-base-300 bg-base-200 py-1.5 pl-7 pr-2.5 text-xs text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="Search categories"
                    type="text"
                    value={categorySearch}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1">
                {categories
                  .filter((cat) =>
                    cat.label
                      .toLowerCase()
                      .includes(categorySearch.trim().toLowerCase())
                  )
                  .map((cat) => {
                    const inUse = cat.templateCount > 0;
                    return (
                      <div
                        className={[
                          "group flex w-full items-center rounded-sm pr-1 text-left text-xs font-medium transition-colors",
                          categoryId === cat.id
                            ? "bg-primary/10 text-primary"
                            : "text-base-content/70 hover:bg-base-200 hover:text-base-content",
                        ].join(" ")}
                        key={cat.id}
                      >
                        <button
                          className="flex flex-1 items-center gap-1.5 truncate px-3 py-2 text-left"
                          onClick={() => {
                            setCategoryId(cat.id);
                            setDirty(true);
                          }}
                          type="button"
                        >
                          <span className="truncate">{cat.label}</span>
                          {inUse && (
                            <span className="shrink-0 rounded-full bg-base-200 px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-base-content/70">
                              {cat.templateCount}
                            </span>
                          )}
                        </button>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!inUse) {
                              setCategoryToDelete(cat);
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
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
              </div>

              {categoryError && (
                <p className="mt-1.5 text-xs text-error">{categoryError}</p>
              )}

              {newCategoryOpen ? (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    autoFocus
                    className="w-full rounded-sm border border-base-300 bg-base-200 px-2.5 py-1.5 text-xs text-base-content outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    onChange={(e) => setNewCategoryLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateCategory();
                      }
                      if (e.key === "Escape") {
                        setNewCategoryOpen(false);
                        setNewCategoryLabel("");
                      }
                    }}
                    placeholder="New category name"
                    type="text"
                    value={newCategoryLabel}
                  />
                  <button
                    className="shrink-0 rounded-sm bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
                    disabled={creatingCategory || !newCategoryLabel.trim()}
                    onClick={handleCreateCategory}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button
                  className="mt-1.5 flex w-full items-center gap-1.5 rounded-sm px-3 py-2 text-left text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
                  onClick={() => setNewCategoryOpen(true)}
                  type="button"
                >
                  <Plus size={12} />
                  New category
                </button>
              )}
            </div>
          </div>

          {/* Sidebar footer — actions */}
          <div className="border-t border-base-300 p-4 space-y-2">
            {saveState !== "idle" && (
              <div className="flex justify-center pb-1">
                <SaveStatusIndicator state={saveState} />
              </div>
            )}
            {error && (
              <div className="rounded-sm bg-error/5 px-3 py-2 text-xs text-error">
                {error}
              </div>
            )}
            {isPublished ? (
              <>
                <button
                  className="w-full rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
                  disabled={saving !== null}
                  onClick={handleUpdate}
                  type="button"
                >
                  {saving === "update" ? "Updating…" : "Update"}
                </button>
                <button
                  className="w-full rounded-sm border border-base-300 px-4 py-2 text-xs font-semibold text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
                  disabled={saving !== null}
                  onClick={handleUnpublish}
                  type="button"
                >
                  {saving === "unpublish" ? "Unpublishing…" : "Unpublish"}
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-full rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
                  disabled={saving !== null || publishIssues.length > 0}
                  onClick={handlePublish}
                  type="button"
                >
                  {saving === "publish" ? "Publishing…" : "Publish"}
                </button>
                {publishIssues.length > 0 && (
                  <p className="text-[11px] leading-snug text-base-content/70">
                    To publish, add {publishIssues.join(", ")}.
                  </p>
                )}
                <button
                  className="w-full rounded-sm border border-base-300 px-4 py-2 text-xs font-semibold text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
                  disabled={saving !== null}
                  onClick={handleSaveDraft}
                  type="button"
                >
                  {saving === "draft"
                    ? "Saving…"
                    : isEdit
                      ? "Save draft"
                      : "Save as draft"}
                </button>
              </>
            )}
            <button
              className="w-full rounded-sm border border-base-300 px-4 py-2 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
              onClick={() => router.back()}
              type="button"
            >
              Cancel
            </button>
            {isEdit && (
              <button
                className="flex w-full items-center justify-center gap-1.5 rounded-sm px-4 py-2 text-xs font-medium text-error transition-colors hover:bg-error/5"
                onClick={() => setConfirmDelete(true)}
                type="button"
              >
                <Trash2 size={12} />
                Delete template
              </button>
            )}
          </div>
        </aside>

        {/* Right — content editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-base-300 px-6 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                Template content
              </p>
              <p className="mt-0.5 text-xs text-base-content/70">
                Press{" "}
                <kbd className="rounded border border-base-300 bg-base-200 px-1 text-2xs">
                  /
                </kbd>{" "}
                for blocks
              </p>
            </div>
            {!coverUrl && (
              <button
                className="flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content/70 disabled:opacity-40"
                disabled={coverUploading}
                onClick={() => coverInput.current?.click()}
                type="button"
              >
                <ImageIcon size={13} />
                {coverUploading ? "Uploading…" : "Add cover"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            {coverUrl && (
              <div className="group/cover relative mb-4 h-35 w-full overflow-hidden rounded-md bg-base-200">
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${coverUrl})` }}
                />
                <div className="absolute bottom-2 right-3 flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover/cover:opacity-100">
                  <button
                    className="rounded-sm border border-base-300 bg-base-100/80 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-base-100 disabled:opacity-50"
                    disabled={coverUploading}
                    onClick={() => coverInput.current?.click()}
                    type="button"
                  >
                    {coverUploading ? "Uploading…" : "Change cover"}
                  </button>
                  <button
                    className="rounded-sm border border-base-300 bg-base-100/80 px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-base-100"
                    onClick={() => setRemoveCoverConfirm(true)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            <TemplateEditor
              initialBlocks={blocks}
              onBaseline={(b) => {
                initialBlocksSig.current = blocksSignature(b);
              }}
              onChange={(b) => {
                setBlocks(b);
                if (blocksSignature(b) !== initialBlocksSig.current) {
                  setDirty(true);
                }
              }}
            />
          </div>
        </div>

        <input
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onCoverFile}
          ref={coverInput}
          type="file"
        />
      </div>

      <ConfirmDialog
        confirmLabel="Remove"
        description="This removes the cover from this template. You can add a new one anytime."
        onConfirm={() => {
          setCoverUrl(null);
          setDirty(true);
        }}
        onOpenChange={setRemoveCoverConfirm}
        open={removeCoverConfirm}
        title="Remove cover image?"
      />

      <ConfirmDialog
        description={
          <>
            &ldquo;{template?.name}&rdquo; will be permanently deleted and
            cannot be recovered.
            {isPublished && (
              <>
                {" "}
                It is currently published — users will immediately lose access
                to it in the template gallery.
              </>
            )}
          </>
        }
        onConfirm={doDelete}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        title="Delete this template?"
      />

      <ConfirmDialog
        confirmLoadingLabel="Deleting…"
        description={
          <>
            &ldquo;{categoryToDelete?.label}&rdquo; will be permanently deleted.
            Categories still used by a template can&rsquo;t be deleted.
          </>
        }
        loading={deletingCategory}
        onConfirm={handleDeleteCategory}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
        open={!!categoryToDelete}
        title="Delete this category?"
      />

      {mounted &&
        tooltip &&
        createPortal(
          <IconTooltip
            label={tooltip.label}
            placement="below"
            rect={tooltip.rect}
          />,
          document.body
        )}
    </>
  );
}
