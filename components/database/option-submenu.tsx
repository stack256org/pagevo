"use client";

import { Check, Info, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OPTION_COLORS } from "@/components/database/property-registry";
import type { SelectOption } from "@/components/database/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

interface OptionSubmenuProps {
  anchorRect: DOMRect;
  onClose: () => void;
  onDelete: () => void;
  onRecolor: (colorId: string) => void;
  onRename: (name: string) => void;
  option: SelectOption;
}

export function OptionSubmenu({
  option,
  anchorRect,
  onRename,
  onDelete,
  onRecolor,
  onClose,
}: OptionSubmenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setFloating, x, y } = useAnchorPosition({
    anchorRect,
    placement: "bottom-start",
    gap: 4,
  });
  const mergedRef = useMergedRef(ref, setFloating);
  const [name, setName] = useState(option.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commitRename() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== option.name) {
      onRename(trimmed);
    }
  }

  // commitRename closes over `name`, so the dismiss effect below used to list
  // [name] purely to avoid a stale closure — which tore down and re-added both
  // document listeners on every keystroke. Holding the latest versions in refs
  // lets that effect register once while still calling the current closures.
  const commitRenameRef = useRef(commitRename);
  commitRenameRef.current = commitRename;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // The delete ConfirmDialog is a separate portal — without this, clicking its
      // Cancel/Delete buttons would be seen as "outside" and close this submenu first.
      if (target.closest?.('[role="alertdialog"]')) {
        return;
      }
      if (ref.current && !ref.current.contains(target)) {
        commitRenameRef.current();
        onCloseRef.current();
      }
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        commitRenameRef.current();
        onCloseRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  // This menu is positioned once from a captured anchorRect (its trigger row lives
  // inside a scrollable panel) — lock scroll while open instead of repositioning,
  // so it can't drift away from its anchor.
  useScrollLockWhileOpen(
    true,
    (target) =>
      !!ref.current?.contains(target) ||
      !!target.closest?.('[role="alertdialog"]')
  );

  if (typeof document === "undefined") {
    return null;
  }

  const width = 200;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: event-isolation guard, not a control — the only handler is stopPropagation. This renders through createPortal, so its React-tree parent is the option row that opened it; an unguarded click inside the submenu would also fire that row's handlers. There is no activation to key-handle, every real control inside is a native button/input, and adding role/tabIndex here would create a tab stop that does nothing.
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200"
      data-edit-property-exempt
      onClick={(e) => e.stopPropagation()}
      ref={mergedRef}
      style={{ position: "fixed", top: y, left: x, width, zIndex: 500 }}
    >
      {/* Rename */}
      <div className="flex items-center gap-1.5 border-b border-base-300 px-2.5 py-2">
        <input
          className="min-w-0 flex-1 bg-transparent text-xs text-base-content focus:outline-none"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitRename();
              onClose();
            }
          }}
          ref={inputRef}
          value={name}
        />
        {name && (
          <button
            className="flex size-4 shrink-0 items-center justify-center text-base-content/70 hover:text-base-content"
            onClick={() => setName("")}
            type="button"
          >
            <X size={11} />
          </button>
        )}
        <Info className="shrink-0 text-base-content/50" size={12} />
      </div>

      {/* Delete */}
      <div className="p-1">
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs text-error transition-colors duration-150 hover:bg-error/10"
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>

      <div className="h-px bg-base-300" />

      {/* Colors */}
      <div className="max-h-55 overflow-y-auto p-1">
        <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          Colors
        </p>
        {OPTION_COLORS.map((c) => (
          <button
            className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
            key={c.id}
            onClick={() => onRecolor(c.id)}
            type="button"
          >
            <span
              className="size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: c.dot }}
            />
            <span className="capitalize">{c.id}</span>
            {option.color === c.id && (
              <Check className="ml-auto shrink-0 text-primary" size={13} />
            )}
          </button>
        ))}
      </div>

      <ConfirmDialog
        className="z-600"
        confirmLabel="Delete"
        description={`"${option.name}" will be removed from this property. Any entries currently set to it will show as empty.`}
        onConfirm={() => {
          onDelete();
          onClose();
        }}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        overlayClassName="z-600"
        title="Delete this option?"
      />
    </div>,
    document.body
  );
}
