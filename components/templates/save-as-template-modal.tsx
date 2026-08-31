"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TemplateCategory = {
  id: string;
  key: string;
  label: string;
  orderIndex: number;
};

interface SaveAsTemplateModalProps {
  onClose: () => void;
  onSaved?: () => void;
  pageId: string;
  pageTitle: string;
  workspaceId: string;
}

export function SaveAsTemplateModal({
  pageId,
  pageTitle,
  workspaceId,
  onClose,
  onSaved,
}: SaveAsTemplateModalProps) {
  const [name, setName] = useState(pageTitle || "");
  const [description, setDesc] = useState("");
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/templates/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TemplateCategory[]) => {
        setCategories(list);
        setCategoryId((current) => current || list[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }
    if (!categoryId) {
      setError("Choose a category");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId,
          pageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save template");
        return;
      }
      setSaved(true);
      onSaved?.();
      setTimeout(onClose, 1800);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="max-w-110">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Saved templates are available to all workspace members
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center py-8 text-center">
            {/* Animated success ring */}
            <div className="relative mb-5 flex size-20 items-center justify-center">
              <div
                className="absolute inset-0 animate-ping rounded-full bg-success/20"
                style={{
                  animationDuration: "1.2s",
                  animationIterationCount: 1,
                }}
              />
              <div className="flex size-20 items-center justify-center rounded-full bg-success/10 ring-8 ring-success/10">
                <CheckCircle2
                  className="text-success"
                  size={36}
                  strokeWidth={1.8}
                />
              </div>
            </div>

            <h3 className="mb-1.5 text-lg font-bold text-base-content">
              Template saved!
            </h3>
            <p className="mb-1 text-sm text-base-content/70">
              <span className="font-semibold text-base-content">{name}</span> is
              now available
            </p>
            <p className="text-xs text-base-content/70">
              All workspace members can use this template
            </p>
          </div>
        ) : (
          <>
            {/* Name */}
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-base-content"
                htmlFor="save-template-name"
              >
                Template name <span className="text-error">*</span>
              </label>
              <input
                autoFocus
                className="w-full rounded-sm border border-base-300 bg-base-200/30 px-3 py-2 text-sm text-base-content outline-none placeholder:text-base-content/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="save-template-name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sprint Planning"
                type="text"
                value={name}
              />
            </div>

            {/* Description */}
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-base-content"
                htmlFor="save-template-description"
              >
                Description{" "}
                <span className="text-base-content/70 font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                className="w-full resize-none rounded-sm border border-base-300 bg-base-200/30 px-3 py-2 text-sm text-base-content outline-none placeholder:text-base-content/50 focus:border-primary focus:ring-2 focus:ring-primary/20"
                id="save-template-description"
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What is this template for?"
                rows={2}
                value={description}
              />
            </div>

            {/* Category */}
            <div>
              {/* Not a <label>: this heads a group of buttons, not a form
                 control, so it has nothing to be associated with. */}
              <p className="mb-1.5 block text-xs font-semibold text-base-content">
                Category
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    className={[
                      "rounded-sm border px-3 py-1 text-xs font-medium transition-colors",
                      categoryId === cat.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-base-300 text-base-content/70 hover:border-base-300 hover:bg-base-200",
                    ].join(" ")}
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    type="button"
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="rounded-sm bg-error/10 px-3 py-2 text-xs text-error">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                className="rounded-sm border border-base-300 px-4 py-1.5 text-sm font-medium text-base-content transition-colors hover:bg-base-200 disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-sm bg-primary px-4 py-1.5 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
                disabled={saving || !name.trim()}
                onClick={handleSave}
                type="button"
              >
                {saving ? "Saving…" : "Save Template"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
