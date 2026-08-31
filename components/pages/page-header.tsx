"use client";

import { Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconPicker } from "@/components/pages/icon-picker";
import { PageIcon } from "@/components/pages/page-icon";

interface PageHeaderProps {
  fontFamily: "default" | "serif" | "mono";
  initialIcon: string | null;
  initialTitle: string;
  isDeleted: boolean;
  isEditor: boolean;
  isFullWidth: boolean;
  isLocked: boolean;
  isSmallText: boolean;
  pageId: string;
  shortId: string;
  workspaceId: string;
  workspaceSlug: string;
}

export function PageHeader({
  pageId,
  initialTitle,
  initialIcon,
  isLocked,
  isDeleted,
  isEditor,
}: PageHeaderProps) {
  const router = useRouter();
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  // Shared by both icon-trigger buttons below (never rendered at the same
  // time) — passed to IconPicker so its outside-click-to-close doesn't treat
  // a second click on this same button as "outside," which would otherwise
  // close it and then immediately reopen it via the button's own toggle.
  const iconBtnRef = useRef<HTMLButtonElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMount = useRef(false);

  const editable = isEditor && !isLocked && !isDeleted;

  useEffect(() => {
    if (!didMount.current && titleRef.current) {
      titleRef.current.textContent = initialTitle || "";
      didMount.current = true;
    }
    // Listing initialTitle is inert — the didMount guard already limits the body
    // to the first run, so a later title change re-enters and no-ops.
  }, [initialTitle]);

  const saveTitle = useCallback(
    async (raw: string) => {
      const title = raw.trim() || "Untitled";
      setSaving(true);
      try {
        await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        document.title = `${title} | PAGEVO`;
        window.dispatchEvent(
          new CustomEvent("pagevo:page-title-changed", {
            detail: { pageId, title },
          })
        );
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [pageId, router]
  );

  const saveIcon = useCallback(
    async (newIcon: string | null) => {
      setIcon(newIcon);
      setShowPicker(false);
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon: newIcon }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:page-title-changed", {
          detail: { pageId, icon: newIcon },
        })
      );
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    },
    [pageId, router]
  );

  function onInput(e: React.FormEvent<HTMLDivElement>) {
    const text = e.currentTarget.textContent ?? "";
    window.dispatchEvent(
      new CustomEvent("pagevo:page-title-changed", {
        detail: { pageId, title: text },
      })
    );
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    saveTimeout.current = setTimeout(() => saveTitle(text), 800);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      titleRef.current?.blur();
    }
  }

  function onBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    saveTitle(e.currentTarget.textContent ?? "");
  }

  return (
    <div className="relative">
      {/* ── Add icon button (only when no icon set) ── */}
      {editable && !icon && (
        <div className="relative mb-2">
          <button
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-base-content/70 opacity-0 transition-all group-hover/page:opacity-100 hover:bg-base-200 hover:text-base-content"
            onClick={() => setShowPicker((p) => !p)}
            ref={iconBtnRef}
            type="button"
          >
            <Smile size={13} />
            Add icon
          </button>
          {showPicker && (
            <IconPicker
              onClose={() => setShowPicker(false)}
              onIconPreview={(v) => saveIcon(v)}
              onRemove={() => saveIcon(null)}
              onSelect={(v) => saveIcon(v)}
              pageId={pageId}
              triggerRef={iconBtnRef}
            />
          )}
        </div>
      )}

      {/* ── Icon + Title inline (Notion style) ── */}
      <div className="flex items-start gap-3">
        {icon && (
          <div className="relative mt-1 shrink-0">
            <button
              aria-label="Change icon"
              className="flex size-14 items-center justify-center rounded-md transition-all hover:bg-base-200/50 disabled:cursor-default"
              disabled={!editable}
              onClick={() => editable && setShowPicker((p) => !p)}
              ref={iconBtnRef}
              type="button"
            >
              <PageIcon icon={icon} size={52} />
            </button>
            {showPicker && (
              <IconPicker
                onClose={() => setShowPicker(false)}
                onRemove={() => saveIcon(null)}
                onSelect={(v) => saveIcon(v)}
                pageId={pageId}
                triggerRef={iconBtnRef}
              />
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: false positive — contentEditable already makes this element focusable, keyboard-operable and exposed as a textbox to assistive tech; the browser provides the semantics a role would. The handlers here (onInput/onBlur/onKeyDown) are text-editing events, not click activations. Biome's a11y rules do not model contentEditable. */}
          <div
            className={[
              "w-full wrap-break-word text-[2.4rem] font-black leading-[1.15] tracking-tight text-base-content outline-none",
              "empty:before:content-[attr(data-placeholder)] empty:before:text-base-content/70",
              editable ? "cursor-text" : "cursor-default select-text",
            ].join(" ")}
            contentEditable={editable}
            data-placeholder="Untitled"
            onBlur={onBlur}
            onInput={onInput}
            onKeyDown={onKeyDown}
            ref={titleRef}
            suppressContentEditableWarning
          />
        </div>
      </div>

      {saving && (
        <span className="absolute -top-6 right-0 text-xs text-base-content/70 animate-pulse">
          Saving…
        </span>
      )}
    </div>
  );
}
