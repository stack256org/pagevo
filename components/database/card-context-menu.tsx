"use client";

import { Copy, ExternalLink, Link2, MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

interface CardContextMenuProps {
  anchorRect: DOMRect;
  onClose: () => void;
  onCommentClick: (rect: DOMRect) => void;
  onDeleteRequest: () => void;
  onDuplicate?: () => void;
  shortId: string;
  workspaceSlug: string;
}

// Shared "⋯" entry menu for board cards — mirrors the row context menu already
// used in table view (Open full page / Comment / Copy link / Duplicate / Delete).
export function CardContextMenu({
  anchorRect,
  workspaceSlug,
  shortId,
  onCommentClick,
  onDuplicate,
  onDeleteRequest,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { setFloating, x, y } = useAnchorPosition({
    anchorRect,
    placement: "bottom-start",
    gap: 4,
  });
  const mergedRef = useMergedRef(ref, setFloating);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  // Anchored to a board card inside a scrollable column — lock scroll while open
  // instead of repositioning, so it can't drift away from its card.
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));

  if (typeof document === "undefined") {
    return null;
  }

  const W = 192;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: event-isolation guard, not a control — the only handler is stopPropagation. This renders through createPortal, so its React-tree parent is the board card that opened it; an unguarded click inside the menu would also fire the card's own open handler. There is no activation to key-handle, every real control inside is a native button/link, and adding role/tabIndex here would create a tab stop that does nothing.
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200 p-1.5"
      onClick={(e) => e.stopPropagation()}
      ref={mergedRef}
      style={{ position: "fixed", top: y, left: x, zIndex: 300, width: W }}
    >
      <Link
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        href={`/app/${workspaceSlug}/${shortId}`}
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ExternalLink className="shrink-0 text-base-content/70" size={13} />{" "}
        Open full page
      </Link>
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        onClick={(e) =>
          onCommentClick(
            (e.currentTarget as HTMLElement).getBoundingClientRect()
          )
        }
        type="button"
      >
        <MessageSquare className="shrink-0 text-base-content/70" size={13} />{" "}
        Comment
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
        onClick={() => {
          if (typeof window !== "undefined" && navigator.clipboard) {
            navigator.clipboard
              .writeText(
                `${window.location.origin}/app/${workspaceSlug}/${shortId}`
              )
              .catch(() => {});
          }
          toast.success("Link copied to clipboard", { duration: 2000 });
          onClose();
        }}
        type="button"
      >
        <Link2 className="shrink-0 text-base-content/70" size={13} /> Copy link
      </button>
      {onDuplicate && (
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-base-content transition-colors hover:bg-base-200"
          onClick={() => {
            onDuplicate();
            onClose();
          }}
          type="button"
        >
          <Copy className="shrink-0 text-base-content/70" size={13} /> Duplicate
        </button>
      )}
      <div className="my-1 h-px bg-base-300" />
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm text-error transition-colors duration-150 hover:bg-error/5"
        onClick={() => {
          onClose();
          onDeleteRequest();
        }}
        type="button"
      >
        <Trash2 size={13} /> Delete entry
      </button>
    </div>,
    document.body
  );
}
