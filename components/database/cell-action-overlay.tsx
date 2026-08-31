"use client";

import { Check, Copy, MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAnchorPosition } from "@/lib/ui/use-anchor-position";

interface CellActionOverlayProps {
  canCopy: boolean;
  commentCount: number | null;
  copied: boolean;
  onClearLeaveTimer: () => void;
  onCommentClick: (btnRect: DOMRect) => void;
  onCopyClick: () => void;
  onScheduleLeave: () => void;
  rect: DOMRect;
}

export function CellActionOverlay({
  rect,
  canCopy,
  commentCount,
  copied,
  onClearLeaveTimer,
  onScheduleLeave,
  onCommentClick,
  onCopyClick,
}: CellActionOverlayProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);

  // Self-suppressing: any open cell-editor popup flags `document.body` while mounted (see
  // `CellEditorInner`), so we bail out here instead of trusting every caller to thread that state through.
  if (
    typeof document !== "undefined" &&
    document.body.dataset.cellPopupOpen === "true"
  ) {
    return null;
  }

  const mutedIconColor =
    "color-mix(in srgb, var(--color-base-content) 70%, transparent)";

  const btnBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    cursor: "pointer",
    background: "transparent",
    borderRadius: 4,
    color: mutedIconColor,
  };

  function showTooltip(e: React.MouseEvent, label: string) {
    setTooltipRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setTooltip(label);
  }

  function hideTooltip() {
    setTooltip(null);
    setTooltipRect(null);
  }

  return (
    <>
      {/* Overlay bar — pointerEvents:none so the gradient area doesn't block
          clicks on the cell underneath. Only the buttons re-enable events. */}
      <div
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.right,
          transform: "translateX(-100%)",
          height: rect.height,
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingLeft: 20,
          paddingRight: 6,
          background:
            "linear-gradient(to left, var(--color-base-200) 50%, transparent)",
          zIndex: 200,
          pointerEvents: "none",
        }}
      >
        {/* Buttons wrapper — re-enables pointer events and owns enter/leave */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: hover-lifetime wrapper, not a control — the enter/leave handlers only cancel/restart the timer that hides this overlay, so moving the pointer from the cell onto the icons does not dismiss them. Nothing is activated here; each icon inside is a native button. */}
        <div
          onMouseEnter={onClearLeaveTimer}
          onMouseLeave={() => {
            hideTooltip();
            onScheduleLeave();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            pointerEvents: "auto",
          }}
        >
          {/* Comment button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCommentClick(
                (e.currentTarget as HTMLElement).getBoundingClientRect()
              );
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--color-base-200)";
              (e.currentTarget as HTMLElement).style.color =
                "var(--color-base-content)";
              showTooltip(e, "Comment");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = mutedIconColor;
              hideTooltip();
            }}
            style={{ ...btnBase, height: 20, gap: 2, padding: "0 4px" }}
            type="button"
          >
            <MessageSquare size={13} />
            {commentCount !== null && commentCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
                {commentCount}
              </span>
            )}
          </button>

          {/* Copy button — any property type with a copyable value */}
          {canCopy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCopyClick();
                toast.success("Copied to clipboard", { duration: 2000 });
              }}
              onMouseEnter={(e) => {
                if (!copied) {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--color-base-200)";
                  (e.currentTarget as HTMLElement).style.color =
                    "var(--color-base-content)";
                }
                showTooltip(e, copied ? "Copied!" : "Copy value");
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
                (e.currentTarget as HTMLElement).style.color = copied
                  ? "var(--color-primary)"
                  : mutedIconColor;
                hideTooltip();
              }}
              style={{
                ...btnBase,
                width: 20,
                height: 20,
                color: copied ? "var(--color-primary)" : mutedIconColor,
              }}
              type="button"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && tooltipRect && (
        <CellActionTooltip label={tooltip} rect={tooltipRect} />
      )}
    </>
  );
}

function CellActionTooltip({ rect, label }: { rect: DOMRect; label: string }) {
  const { setFloating, x, y } = useAnchorPosition({
    anchorRect: rect,
    placement: "bottom",
  });
  return (
    <div
      ref={setFloating}
      style={{
        position: "fixed",
        top: y,
        left: x,
        background: "var(--color-base-100)",
        color: "var(--color-base-content)",
        border: "1px solid var(--color-base-300)",
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: "var(--radius-sm)",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: 9999,
        boxShadow:
          "0 2px 8px color-mix(in srgb, var(--color-base-content) 12%, transparent)",
      }}
    >
      {label}
    </div>
  );
}
